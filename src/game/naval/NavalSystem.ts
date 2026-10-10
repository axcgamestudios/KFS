import * as THREE from 'three';
import { Ship, type CannonShot } from './Ship';
import { CharacterModel, type CharacterPalette } from '../entities/CharacterModel';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { WaterSystem } from '../world/WaterSystem';
import type { GameState } from '../systems/GameState';
import { WIND } from '../world/WorldConfig';
import { clamp, damp, dampAngle } from '../core/MathUtils';

/** HUD snapshot while sailing (consumed by the React layer). */
export interface SailingHud {
  hull: number;
  hullMax: number;
  knots: number;
  sailState: 0 | 1 | 2;
  windRel: number;        // wind direction relative to bow (radians, 0 = wind ahead)
  cdPort: number;         // 0..1 (1 = ready)
  cdStar: number;
  anchored: boolean;
  shipName: string;
  enemy: { name: string; hullFrac: number; dist: number } | null;
  boarding: boolean;
}

export interface NavalCallbacks {
  notify: (kind: 'info' | 'quest' | 'item', title: string, body?: string) => void;
  sound: (kind: 'cannon' | 'hit_hull' | 'splash' | 'anchor' | 'sail' | 'grapple' | 'creak' | 'sink') => void;
  music: (intensity: number) => void;
  setFlag: (flag: string) => void;
  lore: (title: string, paragraphs: string[]) => void;
  closeDialogue: () => void;
  playerDamage: (amount: number, source: string) => void;
  returnPlayerToShip: () => void;
}

/** One boarding pirate (walks the enemy deck in ship-local coordinates). */
class BoardingCrew {
  readonly model: CharacterModel;
  readonly group = new THREE.Group();
  hp: number;
  readonly maxHp: number;
  readonly isCaptain: boolean;
  readonly name: string;
  lx: number;           // ship-local X
  lz: number;           // ship-local Z
  yaw = 0;
  attackT = 0;
  attackCd = 0;
  dead = false;
  deathT = 0;

  constructor(captain: boolean, lx: number, lz: number, palette: CharacterPalette) {
    this.isCaptain = captain;
    this.name = captain ? 'Capitana Morwen' : 'Corsario del Cuervo';
    this.hp = captain ? 110 : 46;
    this.maxHp = this.hp;
    this.lx = lx;
    this.lz = lz;
    this.model = new CharacterModel(palette);
    this.model.setEquippedState(true);
    this.group.add(this.model.root);
  }

  updateAnim(dt: number): void {
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.7);
      this.group.rotation.x = -k * Math.PI / 2;
      this.group.position.y -= dt * 0.25 * Math.min(1, this.deathT);
      if (this.deathT > 4) this.group.visible = false;
      return;
    }
    this.model.update({
      dt,
      speed: this.moving ? (this.isCaptain ? 1.5 : 1.8) : 0,
      moving: this.moving,
      grounded: true,
      swimming: false,
      attackT: this.attackT,
    });
  }

  moving = false;
}

interface EnemyBrain {
  ship: Ship;
  mode: 'patrol' | 'chase' | 'broadside' | 'grappled';
  waypoints: Array<{ x: number; z: number }>;
  wpIndex: number;
  fireCd: number;
  aggroNotified: boolean;
  /** Quest ships cannot be sunk outright — they must be boarded. */
  quest: boolean;
  /** Already boarded once (no repeat boarding waves). */
  questBoarded?: boolean;
  respawnAt: { x: number; z: number } | null;
  respawnTimer: number;
}

/** Simple pooled sprite burst (splashes, flashes, smoke). */
class SpritePool {
  private sprites: THREE.Sprite[] = [];
  private active: Array<{ sp: THREE.Sprite; t: number; dur: number; grow: number; vel?: THREE.Vector3 }> = [];

  constructor(
    scene: THREE.Scene,
    count: number,
    color: string,
    private additive = false,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }));
      sp.visible = false;
      scene.add(sp);
      this.sprites.push(sp);
    }
  }

  spawn(pos: THREE.Vector3, scale: number, dur: number, grow = 1.6, vel?: THREE.Vector3): void {
    const sp = this.sprites.find((s) => !s.visible);
    if (!sp) return;
    sp.position.copy(pos);
    sp.scale.setScalar(scale);
    sp.material.opacity = 0.9;
    sp.visible = true;
    this.active.push({ sp, t: 0, dur, grow, vel: vel?.clone() });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += dt;
      const k = a.t / a.dur;
      if (k >= 1) {
        a.sp.visible = false;
        this.active.splice(i, 1);
        continue;
      }
      a.sp.material.opacity = 0.9 * (1 - k);
      a.sp.scale.multiplyScalar(1 + a.grow * dt);
      if (a.vel) {
        a.sp.position.addScaledVector(a.vel, dt);
        a.vel.y += dt * 0.4;
      }
    }
  }
}

interface Cannonball {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  fromPlayer: boolean;
  /** Previous-frame position for swept dragon collision. */
  prev: THREE.Vector3;
}

/** Floating loot barrel left behind by a sunken pirate. */
interface LootBarrel {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  claimed: boolean;
}

/**
 * Fase 2 naval layer: the player's caravel, pirate fleets with patrol/chase/
 * broadside AI, cannonball physics, boarding combat and floating loot.
 */
export class NavalSystem {
  playerShip: Ship | null = null;
  playerSailing = false;
  enemies: EnemyBrain[] = [];
  boarding: { brain: EnemyBrain; crew: BoardingCrew[]; done: boolean; endTimer: number } | null = null;
  private sinkRespawn: { timer: number } | null = null;

  /** Fase 3 hook: cannonballs can strike flying dragons (sea wyvern fight).
   *  Return an object whose damage(amount) applies the hit, or null. */
  dragonHitTest: ((pos: THREE.Vector3, prevPos?: THREE.Vector3) => { damage: (amount: number) => void } | null) | null = null;

  private balls: Cannonball[] = [];
  private ballPool: THREE.Mesh[] = [];
  private splashes: SpritePool;
  private smoke: SpritePool;
  private flashes: SpritePool;
  private barrels: LootBarrel[] = [];
  private t = 0;
  private windBase = 2.4;

  constructor(
    private scene: THREE.Scene,
    private terrain: TerrainHeight,
    private water: WaterSystem,
    private state: GameState,
    private cb: NavalCallbacks,
  ) {
    this.splashes = new SpritePool(scene, 40, 'rgba(230,242,238,0.95)');
    this.smoke = new SpritePool(scene, 48, 'rgba(70,66,62,0.8)');
    this.flashes = new SpritePool(scene, 24, 'rgba(255,170,60,1)', true);
    const ballGeo = new THREE.SphereGeometry(0.15, 8, 6);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.5, metalness: 0.6 });
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(ballGeo, ballMat);
      m.visible = false;
      m.castShadow = false;
      scene.add(m);
      this.ballPool.push(m);
    }
  }

  // ------------------------------------------------------------- spawning

  /** Launch the repaired Colibrí de Mar near the home dock. */
  spawnPlayerShip(x: number, z: number, heading = Math.PI): Ship {
    if (this.playerShip) return this.playerShip;
    const ship = new Ship({
      id: 'colibri', name: 'Colibrí de Mar', kind: 'caravel', isPlayer: true,
      x, z, heading,
    });
    ship.anchored = true;
    ship.frozen = false;
    ship.onCreak = () => this.cb.sound('creak');
    this.scene.add(ship.group);
    this.playerShip = ship;
    this.applyPerks();
    return ship;
  }

  spawnEnemies(): void {
    // Morwen's brig — anchored in the cove of the Crow Isle (quest ship)
    const gaviota = new Ship({
      id: 'gaviota', name: 'Gaviota Sangrienta', kind: 'pirate', isPlayer: false,
      x: -505, z: -378, heading: 2.2, hullHp: 120, cannonCd: 6.5,
    });
    this.scene.add(gaviota.group);
    this.enemies.push({
      ship: gaviota,
      mode: 'patrol',
      waypoints: [
        { x: -505, z: -378 }, { x: -430, z: -300 }, { x: -560, z: -330 }, { x: -470, z: -420 },
      ],
      wpIndex: 0,
      fireCd: 3,
      aggroNotified: false,
      quest: true,
      respawnAt: null,
      respawnTimer: 0,
    });

    // A roaming raider between the Mist Isles and Aldmor's south shore
    const zharpa = new Ship({
      id: 'zharpa', name: 'Zarpa de Sal', kind: 'pirate', isPlayer: false,
      x: 140, z: 520, heading: 0.4, hullHp: 100, cannonCd: 7,
    });
    this.scene.add(zharpa.group);
    this.enemies.push({
      ship: zharpa,
      mode: 'patrol',
      waypoints: [
        { x: 140, z: 520 }, { x: -120, z: 560 }, { x: -40, z: 690 }, { x: 120, z: 640 },
      ],
      wpIndex: 0,
      fireCd: 4,
      aggroNotified: false,
      quest: false,
      respawnAt: { x: 140, z: 520 },
      respawnTimer: 0,
    });
  }

  /** Real effects for learned navigation skills. */
  applyPerks(): void {
    const ship = this.playerShip;
    if (!ship) return;
    ship.perks.speedMult = this.state.learnedSkills.has('nav_marino') ? 1.12 : 1;
    ship.perks.windEase = this.state.learnedSkills.has('nav_viento') ? 2.2 : 1;
    ship.perks.cannonCdMult = this.state.learnedSkills.has('nav_bordo') ? 1.35 : 1;
  }

  // ---------------------------------------------------------- player helm

  setSailState(s: 0 | 1 | 2): void {
    const ship = this.playerShip;
    if (!ship || ship.sailState === s) return;
    ship.sailState = s;
    if (s > 0) ship.anchored = false;
    this.cb.sound('sail');
  }

  toggleAnchor(): void {
    const ship = this.playerShip;
    if (!ship) return;
    ship.anchored = !ship.anchored;
    if (ship.anchored) {
      ship.sailState = 0;
      ship.rudderInput = 0;
    }
    this.cb.sound('anchor');
    this.cb.notify('info', ship.anchored ? 'Ancla fondeada' : 'Ancla izada',
      ship.anchored ? 'El Colibrí se detiene. Puedes desembarcar si hay costa cerca.' : 'Listos para navegar.');
  }

  firePlayer(side: 'port' | 'starboard'): void {
    const ship = this.playerShip;
    if (!ship || !this.playerSailing || this.boarding) return;
    const shots = ship.fire(side);
    if (!shots) {
      if (this.t - this.lastDenyT > 1.2) {
        this.lastDenyT = this.t;
        this.cb.notify('info', 'Cañones recargando…', 'La bordada aún no está lista.');
      }
      return;
    }
    this.executeBroadside(ship, shots, true);
  }

  private lastDenyT = -10;

  private executeBroadside(ship: Ship, shots: CannonShot[], fromPlayer: boolean): void {
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const spread = fromPlayer ? 0.035 : 0.085;
      const dir = shot.dir.clone();
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.y += 0.05 + Math.random() * 0.05;
      dir.normalize();
      const speed = 32 + Math.random() * 3;
      this.spawnBall(shot.from, dir.multiplyScalar(speed), fromPlayer);
      // Muzzle flash + gun smoke
      this.flashes.spawn(shot.from, 1.6, 0.14, 3);
      this.smoke.spawn(shot.from.clone().add(new THREE.Vector3(0, 0.4, 0)), 1.8, 1.6, 1.4,
        new THREE.Vector3(dir.x * 2, 0.6, dir.z * 2));
      if (i === 0) this.cb.sound('cannon');
    }
  }

  private spawnBall(from: THREE.Vector3, vel: THREE.Vector3, fromPlayer: boolean): void {
    const mesh = this.ballPool.find((m) => !m.visible);
    if (!mesh) return;
    mesh.position.copy(from);
    mesh.visible = true;
    this.balls.push({ mesh, vel: vel.clone(), life: 0, fromPlayer, prev: from.clone() });
  }

  // ------------------------------------------------------------- boarding

  get boardingActive(): boolean {
    return this.boarding !== null;
  }

  canBoard(): EnemyBrain | null {
    if (this.boarding || !this.playerShip) return null;
    for (const brain of this.enemies) {
      if (brain.questBoarded) continue;
      if (brain.ship.crippled && !brain.ship.sunk && brain.ship.sinking === 0) {
        const d = Math.hypot(brain.ship.pos.x - this.playerShip.pos.x, brain.ship.pos.z - this.playerShip.pos.z);
        if (d < 17) return brain;
      }
    }
    return null;
  }

  startBoarding(brain: EnemyBrain): void {
    if (this.boarding || !this.playerShip) return;
    const enemy = brain.ship;
    // Grapple: both ships freeze, sails down
    enemy.grappled = true;
    enemy.frozen = true;
    enemy.sailState = 0;
    enemy.rudderInput = 0;
    this.playerShip.grappled = true;
    this.playerShip.frozen = true;
    this.playerShip.sailState = 0;
    this.playerShip.rudderInput = 0;
    brain.mode = 'grappled';
    brain.questBoarded = true;

    // Crew: the quest ship gets Morwen + two corsairs; raiders get three corsairs
    const corsairPalette: CharacterPalette = {
      skin: 0xb08a64, hair: 0x1c1410, tunic: 0x3a2a30, sleeves: 0x57424a, pants: 0x2c2428, boots: 0x1e1812,
    };
    const morwenPalette: CharacterPalette = {
      skin: 0xc9a17a, hair: 0x2a1e2a, tunic: 0x5a1f28, sleeves: 0x7a3a3a, pants: 0x2c2024, boots: 0x1e1616, cape: 0x1c1c22,
    };
    const crew: BoardingCrew[] = brain.quest
      ? [
        new BoardingCrew(true, 0, -2.2, morwenPalette),
        new BoardingCrew(false, -1.0, 1.8, corsairPalette),
        new BoardingCrew(false, 1.05, 3.6, { ...corsairPalette, tunic: 0x30404a }),
      ]
      : [
        new BoardingCrew(false, -0.9, -1.6, corsairPalette),
        new BoardingCrew(false, 1.0, 2.2, { ...corsairPalette, tunic: 0x30404a }),
        new BoardingCrew(false, 0, 4.4, corsairPalette),
      ];
    for (const c of crew) this.scene.add(c.group);

    this.boarding = { brain, crew, done: false, endTimer: 0 };
    // The player leaves the wheel and jumps onto the enemy deck
    this.playerSailing = false;
    this.cb.sound('grapple');
    this.cb.music(0.95);
    if (brain.quest) {
      this.cb.lore('¡Abordaje!', [
        'Ganchos de abordaje muerden el casco de la Gaviota Sangrienta. Las dos naves quedan amarradas, mecidas por la misma ola.',
        'En la cubierta, entre barriles y jaulas de cuervo, la Capitana Morwen desenvaina su sable. «El Guardián cría cachorros… Ven a buscar tu sello, cachorro.»',
      ]);
    } else {
      this.cb.lore('¡Abordaje!', [
        'Los ganchos vuelan y las cubiertas casi se tocan. La tripulación del cuervo carga con cuchillos entre los dientes.',
        'Derrota a los corsarios y sácale el botín a ese casco podrido.',
      ]);
    }
    this.onBoardingStarted?.(enemy);
  }

  /** Called by CombatSystem when a melee swing lands. Returns true if hit.
   *  Fase 3: weapon reach/arc are honored (spear pikes across the deck). */
  crewHitCheck(
    playerWorld: THREE.Vector3, playerYaw: number, damage: number,
    reach = 2.35, arc = Math.PI * 0.85,
  ): boolean {
    if (!this.boarding) return false;
    const enemy = this.boarding.brain.ship;
    let hitAny = false;
    for (const c of this.boarding.crew) {
      if (c.dead) continue;
      const cw = enemy.toWorld(c.lx, 0, c.lz);
      const dx = cw.x - playerWorld.x;
      const dz = cw.z - playerWorld.z;
      const dist = Math.hypot(dx, dz);
      if (dist < reach) {
        const facing = Math.sin(playerYaw) * dx + Math.cos(playerYaw) * dz;
        // Facing within the weapon's half-arc (side distance test)
        const side = Math.abs(dx * Math.cos(playerYaw) - dz * Math.sin(playerYaw));
        if (facing > -0.25 && side < Math.tan(arc / 2) * Math.max(0.8, facing) + 0.5) {
          c.hp -= damage;
          hitAny = true;
          this.cb.sound('hit_hull');
          this.flashes.spawn(cw.clone().setY(cw.y + 1.2), 0.5, 0.1, 2);
          if (c.hp <= 0) {
            c.dead = true;
            c.moving = false;
            if (c.isCaptain) {
              this.cb.notify('quest', '¡Morwen ha caído!', 'El Cuervo de Tres Cabezas ha perdido a su capitana.');
            }
          }
          break;
        }
      }
    }
    return hitAny;
  }

  /** Boarding resolves when every crewman is down. */
  private finishBoardingSuccess(): void {
    if (!this.boarding) return;
    const brain = this.boarding.brain;
    // Loot the hold
    this.state.addItem('sello', 1);
    this.state.addItem('coin', 90);
    this.state.addItem('madera', 2);
    this.state.giveXp(120);
    this.state.setFlag('morwen_defeated');
    this.cb.notify('quest', '¡La Gaviota Sangrienta es tuya!',
      'Sello de la Orden, 90 monedas y madera de primera añadidos al inventario.');
    this.cb.music(0.8);
    // The pirate brig is scuttled by her own boiling powder store
    brain.ship.grappled = false;
    brain.ship.frozen = false;
    brain.ship.applyDamage(brain.ship.hullHp + 1);
    // Player jumps back aboard the Colibrí
    this.cb.returnPlayerToShip();
    for (const c of this.boarding.crew) c.group.parent?.remove(c.group);
    this.playerShip!.grappled = false;
    this.playerShip!.frozen = false;
    this.boarding = null;
  }

  /** Player died mid-boarding — clean up without rewards. */
  abortBoarding(): void {
    if (!this.boarding) return;
    const brain = this.boarding.brain;
    brain.ship.grappled = false;
    brain.ship.frozen = false;
    if (this.playerShip) {
      this.playerShip.grappled = false;
      this.playerShip.frozen = false;
    }
    for (const c of this.boarding.crew) c.group.parent?.remove(c.group);
    this.boarding = null;
    this.cb.music(0.4);
    // The boarding narration must not linger over normal play (it would eat
    // every control: movement, rudder, sails and attacks)
    this.cb.closeDialogue();
  }

  /** Full reset (new game / loading a pre-naval save). */
  resetAll(): void {
    this.abortBoarding();
    this.sinkRespawn = null;
    if (this.playerShip) {
      this.playerShip.dispose();
      this.playerShip = null;
    }
    this.playerSailing = false;
    for (const b of this.balls) b.mesh.visible = false;
    this.balls.length = 0;
    for (const barrel of this.barrels) {
      barrel.mesh.parent?.remove(barrel.mesh);
      barrel.mesh.geometry.dispose();
    }
    this.barrels.length = 0;
    for (const brain of this.enemies) {
      const ship = brain.ship;
      const spawn = brain.waypoints[0];
      ship.pos.set(spawn.x, 0, spawn.z);
      ship.heading = 0.5;
      ship.speed = 0;
      ship.hullHp = ship.maxHullHp;
      ship.sinking = 0;
      ship.sunk = false;
      ship.removable = false;
      ship.grappled = false;
      ship.frozen = false;
      ship.group.visible = true;
      ship.hull.rotation.set(0, 0, 0);
      ship.group.position.y = 0.12;
      ship.cdPort = 0;
      ship.cdStar = 0;
      brain.mode = 'patrol';
      brain.wpIndex = 0;
      brain.aggroNotified = false;
      brain.questBoarded = false;
      brain.respawnTimer = 0;
      (brain as EnemyBrain & { looted?: boolean }).looted = false;
    }
  }

  // ------------------------------------------------------------- prompts

  /** Contextual naval interaction for the player (used by Game). */
  currentPrompt(playerWorld: THREE.Vector3): { prompt: string; run: () => void } | null {
    const ship = this.playerShip;
    if (!ship || this.boarding) return null; // mid-boarding: hands are full

    const distToShip = Math.hypot(ship.pos.x - playerWorld.x, ship.pos.z - playerWorld.z);

    if (!this.playerSailing) {
      if (distToShip < 10 && !ship.sunk && ship.sinking === 0) {
        return {
          prompt: 'Zarpar a bordo del Colibrí de Mar',
          run: () => this.cb.returnPlayerToShip(),
        };
      }
      return null;
    }

    // Sailing: boarding has priority
    const boardable = this.canBoard();
    if (boardable) {
      return {
        prompt: `Abordar la ${boardable.ship.name}`,
        run: () => this.startBoarding(boardable),
      };
    }

    // Disembark when (almost) stopped
    if (Math.abs(ship.speed) < 0.8) {
      const spot = this.findLandingSpot(ship);
      if (spot) {
        return {
          prompt: 'Desembarcar en tierra firme',
          run: () => this.disembark(spot),
        };
      }
    }

    // Loot barrels
    for (const barrel of this.barrels) {
      if (barrel.claimed) continue;
      const d = Math.hypot(barrel.pos.x - playerWorld.x, barrel.pos.z - playerWorld.z);
      if (d < 9) {
        return {
          prompt: 'Recuperar el botín flotante',
          run: () => {
            barrel.claimed = true;
            barrel.mesh.visible = false;
            const coins = 25 + Math.floor(Math.random() * 30);
            this.state.addItem('coin', coins);
            if (Math.random() < 0.5) this.state.addItem('madera', 1);
            this.state.giveXp(20);
            this.cb.sound('hit_hull');
            this.cb.notify('item', 'Botín recuperado', `${coins} monedas de oro del casco hundido.`);
          },
        };
      }
    }

    return null;
  }

  /** Nearest walkable shore around the ship (16 directions sample). */
  private findLandingSpot(ship: Ship): { x: number; z: number } | null {
    for (let r = 10; r <= 42; r += 8) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = ship.pos.x + Math.cos(a) * r;
        const z = ship.pos.z + Math.sin(a) * r;
        const h = this.terrain.height(x, z);
        if (h > 1.2 && h < 14) {
          return { x, z };
        }
      }
    }
    return null;
  }

  private disembark(spot: { x: number; z: number }): void {
    const ship = this.playerShip!;
    this.playerSailing = false;
    ship.anchored = true;
    ship.frozen = false;
    ship.sailState = 0;
    this.onDisembark?.(spot);
    this.cb.notify('info', 'Has desembarcado', 'El Colibrí queda fondeado aquí. Vuélvete a acercar a su costado para zarpar de nuevo.');
  }

  onDisembark?: (spot: { x: number; z: number }) => void;
  /** Fired when a boarding begins so Game can move the player onto the deck. */
  onBoardingStarted?: (enemy: Ship) => void;

  get boardingShip(): Ship | null {
    return this.boarding ? this.boarding.brain.ship : null;
  }

  /** Game calls this when the player takes the helm (from prompt or return). */
  playerBoardsHelm(): void {
    if (!this.playerShip) return;
    this.playerSailing = true;
    this.playerShip.anchored = false;
    this.playerShip.frozen = false;
  }

  // -------------------------------------------------------------- update

  update(dt: number, playerWorld: THREE.Vector3): SailingHud | null {
    this.t += dt;

    // --- Wind: slow precession, gentle wander ---
    this.windBase += dt * 0.0045;
    WIND.dir = this.windBase + Math.sin(this.t * 0.011) * 0.7;

    const ship = this.playerShip;

    // --- Player ship sinking → respawn sequence ---
    if (ship && ship.sinking > 0 && !this.sinkRespawn) {
      this.sinkRespawn = { timer: 3.2 };
      this.cb.sound('sink');
      this.cb.notify('quest', '¡El Colibrí de Mar se hunde!',
        'Las olas te devuelven a la costa. Bram prometerá revisar el casco… por un precio.');
      this.cb.music(0.9);
    }
    if (this.sinkRespawn) {
      this.sinkRespawn.timer -= dt;
      if (this.sinkRespawn.timer <= 0 && ship) {
        this.sinkRespawn = null;
        this.playerSailing = false;
        ship.sinking = 0;
        ship.sunk = false;
        ship.group.visible = true;
        ship.hullHp = Math.round(ship.maxHullHp * 0.55);
        ship.speed = 0;
        const dock = this.dockSpawn;
        ship.pos.set(dock.x, 0, dock.z);
        ship.heading = dock.heading;
        ship.anchored = true;
        ship.hull.rotation.set(0, 0, 0);
        ship.group.position.y = 0.12;
        this.onShipRespawned?.();
      }
    }

    // --- Ships physics ---
    ship?.update(dt, this.water, this.terrain, WIND.dir);

    for (const brain of this.enemies) {
      this.updateEnemyAI(dt, brain, playerWorld);
      brain.ship.update(dt, this.water, this.terrain, WIND.dir);
    }

    // --- Cannonballs ---
    this.updateBalls(dt);

    // --- Effects ---
    this.splashes.update(dt);
    this.smoke.update(dt);
    this.flashes.update(dt);

    // --- Loot barrels bob ---
    for (const barrel of this.barrels) {
      if (barrel.claimed) continue;
      barrel.mesh.position.y = this.water.waveHeightAt(barrel.pos.x, barrel.pos.z) + 0.1;
      barrel.mesh.rotation.x = Math.sin(this.t * 1.3 + barrel.pos.x) * 0.18;
      barrel.mesh.rotation.z = Math.cos(this.t * 1.1 + barrel.pos.z) * 0.14;
    }

    // --- Boarding crew combat ---
    if (this.boarding) this.updateBoarding(dt, playerWorld);

    // --- HUD ---
    if (ship && (this.playerSailing || this.playerNearShip(playerWorld))) {
      let enemyHud: SailingHud['enemy'] = null;
      let bestD = Infinity;
      for (const brain of this.enemies) {
        if (brain.ship.sunk || brain.ship.sinking > 0) continue;
        const d = Math.hypot(brain.ship.pos.x - ship.pos.x, brain.ship.pos.z - ship.pos.z);
        if (d < bestD) {
          bestD = d;
          if (d < 240) {
            enemyHud = {
              name: brain.ship.name,
              hullFrac: brain.ship.hullHp / brain.ship.maxHullHp,
              dist: d,
            };
          }
        }
      }
      const rel = Math.atan2(Math.sin(WIND.dir - ship.heading), Math.cos(WIND.dir - ship.heading));
      return {
        hull: ship.hullHp,
        hullMax: ship.maxHullHp,
        knots: Math.abs(ship.speed) * 1.944,
        sailState: ship.sailState,
        windRel: rel,
        cdPort: clamp(1 - ship.cdPort / ship.cannonCd, 0, 1),
        cdStar: clamp(1 - ship.cdStar / ship.cannonCd, 0, 1),
        anchored: ship.anchored,
        shipName: ship.name,
        enemy: enemyHud,
        boarding: this.boarding !== null,
      };
    }
    return null;
  }

  private playerNearShip(playerWorld: THREE.Vector3): boolean {
    const ship = this.playerShip;
    if (!ship) return false;
    return Math.hypot(ship.pos.x - playerWorld.x, ship.pos.z - playerWorld.z) < 60;
  }

  dockSpawn = { x: 30, z: 262, heading: Math.PI };
  onShipRespawned?: () => void;

  // ------------------------------------------------------------- enemy AI

  private updateEnemyAI(dt: number, brain: EnemyBrain, playerWorld: THREE.Vector3): void {
    const enemy = brain.ship;
    if (enemy.sunk) {
      // Respawn roaming raiders after a long while
      if (brain.respawnAt) {
        brain.respawnTimer += dt;
        if (brain.respawnTimer > 600) {
          brain.respawnTimer = 0;
          enemy.sunk = false;
          enemy.sinking = 0;
          enemy.removable = false;
          enemy.hullHp = enemy.maxHullHp;
          enemy.group.visible = true;
          enemy.hull.rotation.set(0, 0, 0);
          enemy.group.position.y = 0.12;
          enemy.pos.set(brain.respawnAt.x, 0, brain.respawnAt.z);
          enemy.speed = 0;
          brain.mode = 'patrol';
          brain.wpIndex = 0;
        }
      }
      return;
    }

    // Drop floating loot once a non-quest ship finishes sinking
    if (enemy.sinking > 0 && !brain.quest && !(brain as EnemyBrain & { looted?: boolean }).looted) {
      (brain as EnemyBrain & { looted?: boolean }).looted = true;
      this.spawnLootBarrel(enemy.pos.x, enemy.pos.z);
    }

    const ship = this.playerShip;
    const playerAboard = !!ship && (this.playerSailing || Math.hypot(ship.pos.x - playerWorld.x, ship.pos.z - playerWorld.z) < 40);
    const distToPlayer = ship
      ? Math.hypot(enemy.pos.x - ship.pos.x, enemy.pos.z - ship.pos.z)
      : Math.hypot(enemy.pos.x - playerWorld.x, enemy.pos.z - playerWorld.z);

    if (brain.mode === 'grappled') {
      enemy.rudderInput = 0;
      return;
    }

    // --- State transitions ---
    if (enemy.sinking > 0) {
      enemy.sailState = 0;
      enemy.rudderInput = 0;
      return;
    }
    // A crippled hull is dead in the water: sails down, smoke pouring,
    // drifting — ready to be boarded.
    if (enemy.crippled) {
      enemy.sailState = 0;
      enemy.rudderInput = 0;
      enemy.speed = damp(enemy.speed, 0, 1.5, dt);
      return;
    }
    if (playerAboard && distToPlayer < 300 && brain.mode === 'patrol') {
      brain.mode = 'chase';
      if (!brain.aggroNotified) {
        brain.aggroNotified = true;
        this.cb.notify('quest', '¡Vela negra al acecho!', `${enemy.name} ha virado hacia ti. ¡A los cañones!`);
        this.cb.music(0.75);
      }
    } else if (distToPlayer > 380 && brain.mode !== 'patrol') {
      brain.mode = 'patrol';
      brain.aggroNotified = false;
      this.cb.music(0.25);
    }

    const steerToward = (tx: number, tz: number) => {
      const want = Math.atan2(tx - enemy.pos.x, tz - enemy.pos.z);
      const diff = Math.atan2(Math.sin(want - enemy.heading), Math.cos(want - enemy.heading));
      enemy.rudderInput = clamp(diff * 2.2, -1, 1);
    };

    if (brain.mode === 'patrol') {
      const wp = brain.waypoints[brain.wpIndex];
      steerToward(wp.x, wp.z);
      enemy.sailState = distToPlayer < 160 && playerAboard ? 1 : 1;
      if (Math.hypot(wp.x - enemy.pos.x, wp.z - enemy.pos.z) < 34) {
        brain.wpIndex = (brain.wpIndex + 1) % brain.waypoints.length;
      }
    } else if (brain.mode === 'chase') {
      if (!ship) return;
      // Intercept the player ship
      const lead = 1.2;
      steerToward(ship.pos.x + Math.sin(ship.heading) * ship.speed * lead,
        ship.pos.z + Math.cos(ship.heading) * ship.speed * lead);
      enemy.sailState = 2;
      if (distToPlayer < 52) brain.mode = 'broadside';
    } else if (brain.mode === 'broadside') {
      if (!ship) return;
      if (distToPlayer > 85) {
        brain.mode = 'chase';
        return;
      }
      // Circle the target, keeping a firing distance of ~28-45 m
      const mid = 36;
      const away = distToPlayer < mid - 6 ? 1 : distToPlayer > mid + 8 ? -1 : 0;
      const ang = Math.atan2(enemy.pos.x - ship.pos.x, enemy.pos.z - ship.pos.z) + away * 0.9;
      const orbitR = clamp(distToPlayer, 26, 48);
      steerToward(
        ship.pos.x + Math.sin(ang) * orbitR,
        ship.pos.z + Math.cos(ang) * orbitR,
      );
      enemy.sailState = 1;

      // Fire the side facing the player when roughly abeam
      brain.fireCd -= dt;
      if (brain.fireCd <= 0 && distToPlayer < 62) {
        const rel = Math.atan2(ship.pos.x - enemy.pos.x, ship.pos.z - enemy.pos.z);
        const relToHeading = Math.atan2(Math.sin(rel - enemy.heading), Math.cos(rel - enemy.heading));
        const side: 'port' | 'starboard' = relToHeading > 0 ? 'port' : 'starboard';
        // Only fire if the target is roughly perpendicular (abeam)
        if (Math.abs(Math.abs(relToHeading) - Math.PI / 2) < 0.55) {
          const shots = enemy.fire(side);
          if (shots) {
            brain.fireCd = enemy.cannonCd * (0.85 + Math.random() * 0.4);
            this.executeBroadside(enemy, shots, false);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------- cannonballs

  private updateBalls(dt: number): void {
    const ship = this.playerShip;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      ball.life += dt;
      ball.vel.y -= 14.5 * dt;
      ball.mesh.position.addScaledVector(ball.vel, dt);

      let dead = false;
      const p = ball.mesh.position;
      const ballPrev = ball.prev.clone();

      // --- Ship impacts ---
      const targets: Array<{ ship: Ship; fromPlayer: boolean }> = [];
      if (ship && !ball.fromPlayer) targets.push({ ship, fromPlayer: false });
      if (ball.fromPlayer) {
        for (const brain of this.enemies) {
          if (brain.ship.sinking > 0 || brain.ship.sunk) continue;
          targets.push({ ship: brain.ship, fromPlayer: true });
        }
      }
      for (const tgt of targets) {
        const local = tgt.ship.toLocal(p.x, p.z);
        if (Math.abs(local.x) < 2.7 && local.y > -9 && local.y < 9) {
          const deckTop = tgt.ship.group.position.y + 3.6;
          if (p.y < deckTop) {
            const dmg = 8 + Math.random() * 6;
            if (tgt.ship.isPlayer) {
              tgt.ship.applyDamage(dmg);
              this.cb.playerDamage(Math.round(dmg * 0.45), 'cannon');
            } else if (tgt.ship.crippled && this.brainOf(tgt.ship)?.quest) {
              // Quest ships can't be sunk from range — force the boarding
              tgt.ship.hullHp = Math.max(tgt.ship.maxHullHp * 0.12, tgt.ship.hullHp - dmg);
            } else {
              tgt.ship.applyDamage(dmg);
            }
            this.smoke.spawn(p.clone(), 1.4, 1.1, 1.6, new THREE.Vector3(0, 1.2, 0));
            this.flashes.spawn(p.clone(), 1.1, 0.1, 2);
            this.cb.sound('hit_hull');
            if (ball.fromPlayer && tgt.ship.isPlayer === false) {
              this.cb.music(0.7);
            }
            dead = true;
            break;
          }
        }
      }

      // --- Dragon impacts (Fase 3: the sea wyvern hunts the Colibrí) ---
      if (!dead && this.dragonHitTest) {
        const dragon = this.dragonHitTest(p, ballPrev);
        if (dragon) {
          dragon.damage(42);
          this.flashes.spawn(p.clone(), 1.7, 0.12, 2);
          this.smoke.spawn(p.clone(), 1.5, 1.0, 1.9, new THREE.Vector3(0, 1, 0));
          this.cb.sound('hit_hull');
          dead = true;
        }
      }

      // --- Water splash ---
      if (!dead) {
        const wh = this.water.waveHeightAt(p.x, p.z);
        if (p.y <= wh + 0.05) {
          this.splashes.spawn(new THREE.Vector3(p.x, Math.max(0.2, wh + 0.2), p.z), 1.4, 0.9, 2.2);
          this.cb.sound('splash');
          dead = true;
        }
      }

      if (ball.life > 7) dead = true;

      if (dead) {
        ball.mesh.visible = false;
        this.balls.splice(i, 1);
      } else {
        ball.prev.copy(p);
      }
    }
  }

  private brainOf(ship: Ship): EnemyBrain | undefined {
    return this.enemies.find((b) => b.ship === ship);
  }

  private spawnLootBarrel(x: number, z: number): void {
    const geo = new THREE.CylinderGeometry(0.42, 0.36, 0.8, 9);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6f4d30, roughness: 0.85 }));
    mesh.position.set(x, 0.1, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.barrels.push({ mesh, pos: new THREE.Vector3(x, 0, z), claimed: false });
  }

  // ------------------------------------------------------------- boarding

  private updateBoarding(dt: number, playerWorld: THREE.Vector3): void {
    if (!this.boarding) return;
    const enemy = this.boarding.brain.ship;
    let allDead = true;

    for (const c of this.boarding.crew) {
      if (c.dead) {
        c.updateAnim(dt);
        continue;
      }
      allDead = false;

      // Where is the player on this deck?
      const local = enemy.toLocal(playerWorld.x, playerWorld.z);
      const dx = local.x - c.lx;
      const dz = local.y - c.lz;
      const dist = Math.hypot(dx, dz);

      const reach = c.isCaptain ? 1.55 : 1.45;
      if (dist > reach) {
        const spd = c.isCaptain ? 1.5 : 1.8;
        c.lx += (dx / dist) * spd * dt;
        c.lz += (dz / dist) * spd * dt;
        c.moving = true;
        // Keep aboard
        const b = enemy.deckBounds;
        c.lx = clamp(c.lx, b.minX + 0.2, b.maxX - 0.2);
        c.lz = clamp(c.lz, b.minZ + 0.6, b.maxZ - 0.4);
      } else {
        c.moving = false;
        // Attack cycle
        if (c.attackT === 0) {
          c.attackCd -= dt;
          if (c.attackCd <= 0) {
            c.attackT = 0.001;
            c.attackCd = c.isCaptain ? 1.5 : 1.9;
          }
        } else {
          c.attackT += dt / 0.55;
          if (c.attackT >= 0.5 && c.attackT < 0.55) {
            // Strike lands once mid-swing if still in range
            if (dist < reach + 0.7) {
              this.cb.playerDamage(c.isCaptain ? 15 : 9, 'pirate');
            }
            c.attackT = 0.56;
          }
          if (c.attackT >= 1) c.attackT = 0;
        }
      }

      // Face the player
      const face = Math.atan2(dx, dz);
      c.yaw = dampAngle(c.yaw, face, 8, dt);

      const world = enemy.toWorld(c.lx, enemy.deckHeightAt(c.lx, c.lz) ?? 1, c.lz);
      c.group.position.set(world.x, world.y, world.z);
      c.group.rotation.y = c.yaw;
      c.updateAnim(dt);
    }

    if (allDead && !this.boarding.done) {
      this.boarding.done = true;
      this.boarding.endTimer = 1.6;
    }
    if (this.boarding.done) {
      this.boarding.endTimer -= dt;
      if (this.boarding.endTimer <= 0) {
        this.finishBoardingSuccess();
      }
    }
  }

  // -------------------------------------------------------------- persist

  serialize(): NavalSaveData {
    return {
      player: this.playerShip?.serialize() ?? null,
      sailing: this.playerSailing,
      enemies: this.enemies.map((b) => ({
        ...b.ship.serialize(),
        questBoarded: b.questBoarded ?? false,
      })),
    };
  }

  deserialize(data: NavalSaveData | undefined, shipLaunched: boolean): void {
    if (shipLaunched && data?.player) {
      const dock = this.dockSpawn;
      const ship = this.spawnPlayerShip(data.player.x ?? dock.x, data.player.z ?? dock.z, data.player.heading ?? dock.heading);
      ship.deserialize(data.player);
      this.playerSailing = data.sailing && !ship.sunk;
    }
    this.enemies.forEach((brain, i) => {
      const d = data?.enemies?.[i];
      if (d) {
        brain.ship.deserialize(d);
        brain.questBoarded = d.questBoarded ?? false;
        if (brain.ship.sunk && brain.respawnAt) {
          // sunk raiders respawn on their next long cycle
          brain.respawnTimer = 400;
        }
      }
    });
  }
}

/** Serializable naval state (mirrors the SaveData v2 layout). */
export interface NavalSaveData {
  player: {
    x: number; z: number; heading: number; hullHp: number;
    sailState: 0 | 1 | 2; anchored: boolean; sunk: boolean; sinking: number;
  } | null;
  sailing: boolean;
  enemies: Array<{
    x: number; z: number; heading: number; hullHp: number;
    sailState: 0 | 1 | 2; anchored: boolean; sunk: boolean; sinking: number;
    questBoarded?: boolean;
  }>;
}
