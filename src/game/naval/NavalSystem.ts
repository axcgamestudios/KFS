import * as THREE from 'three';
import { Ship, type CannonShot, type ShipKind } from './Ship';
import { CharacterModel, type CharacterPalette } from '../entities/CharacterModel';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { WaterSystem } from '../world/WaterSystem';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import type { GameState } from '../systems/GameState';
import { WIND } from '../world/WorldConfig';
import { clamp, damp, dampAngle } from '../core/MathUtils';
import { getFlameFX } from '../world/FlameFX';
import { InstancedSpritePool } from '../systems/InstancedSpritePool';

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
  /** Fase 9 — returns the health actually lost so AI can react to blocks/parries. */
  playerDamage: (amount: number, source: string) => number;
  /** Fase 9 — true right after the player parries (attackers stagger). */
  wasParried: () => boolean;
  /** Fase 9 — cinematic finisher started: play the hero's execution blow. */
  onFinisher?: (x: number, y: number, z: number) => void;
  returnPlayerToShip: (ship: Ship) => void;
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
  /** Fase 9 — stagger timer: > 0 means reeling (no move, no attacks). */
  hurtT = 0;
  /** Fase 9 — approach bearing around the player (radians, ship-local). */
  ringAngle = 0;

  constructor(captain: boolean, lx: number, lz: number, palette: CharacterPalette) {
    this.isCaptain = captain;
    this.name = captain ? 'Captain Morwen' : 'Crow Corsair';
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

  get hpFrac(): number {
    return this.hp / this.maxHp;
  }
}

/** Pirate AI state — one per enemy hull (patrol routes, chase, broadsides). */
export interface EnemyBrain {
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

/** Simple pooled sprite burst (splashes, flashes, smoke).
 *  Fase 15 — the shared InstancedSpritePool renders the whole pool as ONE
 *  instanced batch (was: one THREE.Sprite = one draw call each). */
// (class SpritePool replaced by systems/InstancedSpritePool)

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
  /** Fase 11 — the ship currently at the helm. Defaults to the Colibrí, but
   *  ANY anchored ship (admin spawns included) can be taken to sea. */
  private helmShip: Ship | null = null;
  enemies: EnemyBrain[] = [];
  boarding: {
    brain: EnemyBrain;
    crew: BoardingCrew[];
    done: boolean;
    endTimer: number;
    /** Fase 9 — cinematic finisher in progress (seconds elapsed). */
    finisherT: number;
    /** Fase 9 — a finisher already played this boarding (no repeats). */
    finisherDone: boolean;
  } | null = null;
  private sinkRespawn: { timer: number } | null = null;

  /** Fase 7 — optional GLB hull provider (the repository's pirate_ship.glb).
   *  When set, every spawned ship wears the real model (caravels get warm
   *  cream sails, pirates keep the black ones). */
  shipModelLoader?: (kind: ShipKind) => Promise<THREE.Object3D | null>;

  /** Fase 3 hook: cannonballs can strike flying dragons (sea wyvern fight).
   *  Return an object whose damage(amount) applies the hit, or null. */
  dragonHitTest: ((pos: THREE.Vector3, prevPos?: THREE.Vector3) => { damage: (amount: number) => void } | null) | null = null;
  /** Fase 15 — sea-serpent hit test for cannonballs (set by Game). */
  seaBeasts: import('../systems/SeaBeastSystem').SeaBeastSystem | null = null;

  private balls: Cannonball[] = [];
  private ballPool: THREE.Mesh[] = [];
  private splashes: InstancedSpritePool;
  private smoke: InstancedSpritePool;
  private flashes: InstancedSpritePool;
  private barrels: LootBarrel[] = [];
  private t = 0;
  private windBase = 2.4;
  /** Fase 9 — the game's collision world (solid hulls). */
  private colliders: ColliderRegistry | null = null;
  /** Fase 9 — admin/decorative ships (kept for collider sync). */
  extraShips: Ship[] = [];

  constructor(
    private scene: THREE.Scene,
    private terrain: TerrainHeight,
    private water: WaterSystem,
    private state: GameState,
    private cb: NavalCallbacks,
  ) {
    this.splashes = new InstancedSpritePool(scene, 40, 'rgba(230,242,238,0.95)', false);
    getFlameFX(scene); // Fase 7 — cannon fire wears real flames
    this.smoke = new InstancedSpritePool(scene, 48, 'rgba(70,66,62,0.8)', false);
    this.flashes = new InstancedSpritePool(scene, 24, 'rgba(255,170,60,1)', true);
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

  /** Fase 9 — bind the game collision world; every hull becomes solid. */
  bindColliders(registry: ColliderRegistry): void {
    this.colliders = registry;
    this.playerShip?.bindColliderRegistry(registry);
    for (const brain of this.enemies) brain.ship.bindColliderRegistry(registry);
    for (const s of this.extraShips) s.bindColliderRegistry(registry);
  }

  /** Launch the repaired Colibrí de Mar near the home dock. */
  spawnPlayerShip(x: number, z: number, heading = Math.PI): Ship {
    if (this.playerShip) return this.playerShip;
    const ship = new Ship({
      id: 'colibri', name: 'Sea Hummingbird', kind: 'caravel', isPlayer: true,
      x, z, heading,
    });
    ship.anchored = true;
    ship.frozen = false;
    ship.onCreak = () => this.cb.sound('creak');
    this.scene.add(ship.group);
    if (this.colliders) ship.bindColliderRegistry(this.colliders);
    this.playerShip = ship;
    this.dressShip(ship);
    this.applyPerks();
    return ship;
  }

  /** Fase 7 — attach the repository GLB hull to a ship when available. */
  private dressShip(ship: Ship): void {
    if (!this.shipModelLoader) return;
    this.shipModelLoader(ship.kind).then((model) => {
      if (!model || ship.sunk) return;
      // the player's caravel gets warm cream canvas; pirates keep black sails
      ship.attachGlb(model, ship.kind === 'caravel' ? { sailTint: 0xd8c49a } : {});
    }).catch(() => { /* procedural hull stays */ });
  }

  /**
   * Fase 8 — admin panel: drop a decorative anchored ship near a point.
   * It rides the waves (buoyancy on) but carries no AI — it will not chase
   * or fire at the player. Returns the spawn position.
   */
  spawnAdminShip(x: number, z: number): THREE.Vector3 {
    // find the nearest deep-water spot (ring scan)
    let bestX = x, bestZ = z, bestD = Infinity;
    for (let r = 6; r <= 90; r += 6) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        const sx = x + Math.cos(ang) * r;
        const sz = z + Math.sin(ang) * r;
        if (this.terrain.height(sx, sz) < -2.2) {
          const d = Math.hypot(sx - x, sz - z);
          if (d < bestD) { bestD = d; bestX = sx; bestZ = sz; }
        }
      }
      if (bestD < Infinity) break;
    }
    const ship = new Ship({
      id: `admin_${Date.now() % 100000}`,
      name: 'Wandering Vessel', kind: 'pirate', isPlayer: false,
      x: bestX, z: bestZ, heading: Math.random() * Math.PI * 2,
    });
    ship.anchored = true;
    this.scene.add(ship.group);
    if (this.colliders) ship.bindColliderRegistry(this.colliders);
    this.extraShips.push(ship);
    this.dressShip(ship);
    return new THREE.Vector3(bestX, 0, bestZ);
  }

  spawnEnemies(): void {
    // Morwen's brig — anchored in the cove of the Crow Isle (quest ship)
    const gaviota = new Ship({
      id: 'gaviota', name: 'Bloody Gull', kind: 'pirate', isPlayer: false,
      x: -425, z: -308, heading: 2.2, hullHp: 120, cannonCd: 6.5,
    });
    this.scene.add(gaviota.group);
    if (this.colliders) gaviota.bindColliderRegistry(this.colliders);
    this.dressShip(gaviota);
    this.enemies.push({
      ship: gaviota,
      mode: 'patrol',
      waypoints: [
        { x: -425, z: -308 }, { x: -560, z: -250 }, { x: -600, z: -620 }, { x: -350, z: -500 },
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
      id: 'zharpa', name: 'Salt Claw', kind: 'pirate', isPlayer: false,
      x: 110, z: 430, heading: 0.4, hullHp: 100, cannonCd: 7,
    });
    this.scene.add(zharpa.group);
    if (this.colliders) zharpa.bindColliderRegistry(this.colliders);
    this.dressShip(zharpa);
    this.enemies.push({
      ship: zharpa,
      mode: 'patrol',
      waypoints: [
        { x: 110, z: 430 }, { x: -60, z: 480 }, { x: 60, z: 540 },
      ],
      wpIndex: 0,
      fireCd: 4,
      aggroNotified: false,
      quest: false,
      respawnAt: { x: 110, z: 430 },
      respawnTimer: 0,
    });
  }

  /** Fase 15 — PIRATE AMBUSH: spawn the Black Siren already hunting.
   *  Returns the brain so the ambush system can watch her fate. */
  spawnAmbushPirate(x: number, z: number, name: string): EnemyBrain {
    const ship = new Ship({
      id: 'sirena', name, kind: 'pirate', isPlayer: false,
      x, z, heading: Math.PI, hullHp: 130, cannonCd: 4.2,
    });
    this.scene.add(ship.group);
    if (this.colliders) ship.bindColliderRegistry(this.colliders);
    this.dressShip(ship);
    const brain: EnemyBrain = {
      ship,
      mode: 'chase',
      waypoints: [],
      wpIndex: 0,
      fireCd: 2,
      aggroNotified: true,
      quest: false,
      respawnAt: null,
      respawnTimer: 0,
    };
    this.enemies.push(brain);
    return brain;
  }

  /** Fase 27 - LEGENDARY EVENTS: the Pirate King's war galleon (and his
   *  elite escorts) join the hunt with real stats: huge hull, fast guns. */
  spawnLegendaryGalleon(x: number, z: number, name: string, hullHp: number, cannonCd: number): EnemyBrain {
    const ship = new Ship({
      id: `legend_${Date.now() % 100000}_${Math.floor(Math.random() * 999)}`, name, kind: 'pirate', isPlayer: false,
      x, z, heading: Math.PI, hullHp, cannonCd,
    });
    this.scene.add(ship.group);
    if (this.colliders) ship.bindColliderRegistry(this.colliders);
    this.dressShip(ship);
    const brain: EnemyBrain = {
      ship,
      mode: 'chase',
      waypoints: [],
      wpIndex: 0,
      fireCd: 2,
      aggroNotified: true,
      quest: false,
      respawnAt: null,
      respawnTimer: 0,
    };
    this.enemies.push(brain);
    return brain;
  }

  /** Fase 15 — the ambush ends without loot: the Siren slips away quietly. */
  fleeAmbushPirate(brain: EnemyBrain): void {
    const i = this.enemies.indexOf(brain);
    if (i >= 0) this.enemies.splice(i, 1);
    // Free her collider cells (far-away sync = out of range) and hide the hull
    brain.ship.syncColliders(-9999, -9999);
    this.scene.remove(brain.ship.group);
  }

  /** Fase 15 — true when the ambush ship is no longer a threat. */
  isBrainGone(brain: EnemyBrain): boolean {
    return !this.enemies.includes(brain) || brain.ship.sunk || brain.ship.sinking > 0;
  }

  /** Real effects for learned navigation skills. */
  applyPerks(): void {
    const ship = this.playerShip;
    if (!ship) return;
    // Fase 16 — Marinería raised 1.12→1.2: the hull got its +40% base and
    // the skill must still feel like it's WORTH a point on top of it.
    ship.perks.speedMult = this.state.learnedSkills.has('nav_marino') ? 1.2 : 1;
    ship.perks.windEase = this.state.learnedSkills.has('nav_viento') ? 2.2 : 1;
    ship.perks.cannonCdMult = this.state.learnedSkills.has('nav_bordo') ? 1.35 : 1;
  }

  // ---------------------------------------------------------- player helm

  /** Fase 11 — the ship actually steered right now (never a sinking one). */
  get activeShip(): Ship | null {
    if (this.helmShip && !this.helmShip.sunk && this.helmShip.sinking === 0) return this.helmShip;
    if (this.playerShip && !this.playerShip.sunk && this.playerShip.sinking === 0) return this.playerShip;
    return this.helmShip;
  }

  /** Fase 11 — nearest sailable ship (the Colibrí always; admin ships only
   *  while at anchor). Enemy AI ships are NEVER candidates.
   *  Fase 18 — reach measured to the HULL, not the center of mass. */
  helmCandidate(playerWorld: THREE.Vector3): Ship | null {
    let best: Ship | null = null;
    let bestD = Infinity;
    const consider = (s: Ship, isPlayer: boolean) => {
      if (s.sunk || s.sinking > 0) return;
      const d = s.hullDistanceTo(playerWorld.x, playerWorld.z);
      if (d < 5 && d < bestD && (isPlayer || s.anchored)) {
        best = s;
        bestD = d;
      }
    };
    if (this.playerShip) consider(this.playerShip, true);
    for (const s of this.extraShips) consider(s, false);
    return best;
  }

  /** Fase 11 — take the wheel of a specific ship (any anchored vessel). */
  takeHelmAt(ship: Ship): void {
    if (ship.sunk || ship.sinking > 0) return;
    this.helmShip = ship;
    this.playerSailing = true;
    ship.anchored = false;
    ship.frozen = false;
    ship.rudderInput = 0;
  }

  /** Fase 11 — drop the wheel in place (the ship stays where she is). */
  leaveHelm(): void {
    this.playerSailing = false;
    if (this.helmShip) {
      this.helmShip.rudderInput = 0;
      this.helmShip.anchored = true;
      this.helmShip.sailState = 0;
    }
    this.helmShip = null;
  }

  /** Fase 11 — hand the helm back mid-voyage (post-ending "Colibrí sails"
   *  handoff: control resumes at the wheel, sails already set). */
  resumeHelm(ship: Ship): void {
    if (ship.sunk || ship.sinking > 0) return;
    this.helmShip = ship;
    this.playerSailing = true;
    ship.anchored = false;
    ship.frozen = false;
    this.applyPerks();
  }

  setSailState(s: 0 | 1 | 2): void {
    const ship = this.activeShip ?? this.playerShip;
    if (!ship || ship.sailState === s) return;
    ship.sailState = s;
    if (s > 0) ship.anchored = false;
    this.cb.sound('sail');
  }

  toggleAnchor(): void {
    const ship = this.activeShip ?? this.playerShip;
    if (!ship) return;
    ship.anchored = !ship.anchored;
    if (ship.anchored) {
      ship.sailState = 0;
      ship.rudderInput = 0;
    }
    this.cb.sound('anchor');
    this.cb.notify('info', ship.anchored ? 'Anchor dropped' : 'Anchor raised',
      ship.anchored ? `${ship.name} comes to a stop. You can go ashore if land is near.` : 'Ready to sail.');
  }

  firePlayer(side: 'port' | 'starboard'): void {
    const ship = this.activeShip ?? this.playerShip;
    if (!ship || !this.playerSailing || this.boarding) return;
    const shots = ship.fire(side);
    if (!shots) {
      if (this.t - this.lastDenyT > 1.2) {
        this.lastDenyT = this.t;
        this.cb.notify('info', 'Cannons reloading…', 'The broadside is not ready yet.');
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
      // Muzzle flash + gun smoke (Fase 7: real flame burst at the muzzle)
      getFlameFX().burst(shot.from, 0.9, 3, 0.75);
      this.flashes.spawn(shot.from, 1.2, 0.14, undefined, { grow: 3 });
      this.smoke.spawn(shot.from.clone().add(new THREE.Vector3(0, 0.4, 0)), 1.8, 1.6,
        new THREE.Vector3(dir.x * 2, 0.6, dir.z * 2), { grow: 1.4 });
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
        // Fase 18 — hull-to-hull reach: the old 17 m center-to-center circle
        // asked the player to park their mast inside the enemy hull.
        const other = this.playerShip;
        const d = Math.hypot(brain.ship.pos.x - other.pos.x, brain.ship.pos.z - other.pos.z)
          - (brain.ship.length / 2 + other.length / 2);
        if (d < 9) return brain;
      }
    }
    return null;
  }

  /** Fase 18 — BOARD FROM THE WATER: a crippled QUEST ship can be boarded on
   *  foot or while swimming (no own ship alongside needed). This is the fix
   *  for the Old Crow Isle quest: arrive, cripple the Bloody Gull with
   *  broadsides, drop anchor, swim to her side and climb aboard to face
   *  Morwen — the mission can no longer soft-lock. */
  canBoardFromWorld(playerWorld: THREE.Vector3): EnemyBrain | null {
    if (this.boarding) return null;
    for (const brain of this.enemies) {
      if (brain.questBoarded || !brain.quest) continue;
      const s = brain.ship;
      if (s.crippled && !s.sunk && s.sinking === 0
        && s.hullDistanceTo(playerWorld.x, playerWorld.z) < 7) {
        return brain;
      }
    }
    return null;
  }

  startBoarding(brain: EnemyBrain): void {
    if (this.boarding) return;
    const enemy = brain.ship;
    // Grapple: both ships freeze, sails down. (Fase 18: boarding from the
    // water must survive a sunk/absent player ship — only freeze what floats.)
    enemy.grappled = true;
    enemy.frozen = true;
    enemy.sailState = 0;
    enemy.rudderInput = 0;
    if (this.playerShip && !this.playerShip.sunk && this.playerShip.sinking === 0) {
      this.playerShip.grappled = true;
      this.playerShip.frozen = true;
      this.playerShip.sailState = 0;
      this.playerShip.rudderInput = 0;
    }
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
    // Fase 9 — surround bearings: each pirate owns a slice of the ring
    // around the player instead of stacking into a conga line.
    crew.forEach((c, i) => {
      c.ringAngle = (i / crew.length) * Math.PI * 2 + Math.PI / 7;
    });
    for (const c of crew) this.scene.add(c.group);

    this.boarding = { brain, crew, done: false, endTimer: 0, finisherT: 0, finisherDone: false };
    // The player leaves the wheel and jumps onto the enemy deck
    this.playerSailing = false;
    this.cb.sound('grapple');
    this.cb.music(0.95);
    if (brain.quest) {
      this.cb.lore('Boarding!', [
        'Grappling hooks bite into the Bloody Gull’s hull. The two ships lie lashed together, rocked by the same wave.',
        'On deck, among the barrels and the crow cages, Captain Morwen draws her cutlass. “The Warden raises pups… Come take your seal, pup.”',
      ]);
    } else {
      this.cb.lore('Boarding!', [
        'The hooks fly and the decks nearly touch. The crow’s crew charges with knives between their teeth.',
        'Cut down the corsairs and strip the loot from that rotten hull.',
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
          this.flashes.spawn(cw.clone().setY(cw.y + 1.2), 0.5, 0.1, undefined, { grow: 2 });
          // Fase 9 — hit reaction: reel back along the blow direction
          // (the captain has poise; the corsairs get bullied)
          if (c.hp > 0) {
            c.hurtT = Math.max(c.hurtT, c.isCaptain ? 0.28 : 0.5);
            const klen = Math.hypot(dx, dz) || 1;
            const push = c.isCaptain ? 0.35 : 0.8;
            const nlx = c.lx + (dx / klen) * push;
            const nlz = c.lz + (dz / klen) * push;
            const b = enemy.deckBounds;
            c.lx = clamp(nlx, b.minX + 0.2, b.maxX - 0.2);
            c.lz = clamp(nlz, b.minZ + 0.6, b.maxZ - 0.4);
          }
          if (c.hp <= 0) {
            c.dead = true;
            c.moving = false;
            if (c.isCaptain) {
              this.cb.notify('quest', 'Morwen has fallen!', 'The Three-Headed Crow has lost its captain.');
            }
          }
          break;
        }
      }
    }
    return hitAny;
  }

  // ---------------------------------------------- Fase 9: cinematic finisher

  /**
   * PDF §5 — a weakened IMPORTANT enemy (the boarding captain below 30% HP)
   * exposes the REMATE. Returns her position when the execution is armed.
   */
  finisherTarget(): { name: string; x: number; y: number; z: number } | null {
    if (!this.boarding || this.boarding.done || this.boarding.finisherDone) return null;
    if (this.boarding.finisherT > 0) return null;
    for (const c of this.boarding.crew) {
      if (c.dead || !c.isCaptain) continue;
      if (c.hpFrac > 0.3) continue;
      const w = this.boarding.brain.ship.toWorld(c.lx, 1.2, c.lz);
      return { name: c.name, x: w.x, y: w.y, z: w.z };
    }
    return null;
  }

  /** Execute the remate: the hero's heavy blow lands as the captain reels. */
  executeFinisher(): boolean {
    const target = this.finisherTarget();
    if (!target) return false;
    const boarding = this.boarding!;
    boarding.finisherT = 0.001;
    boarding.finisherDone = true;
    // She freezes mid-reel for the killing blow
    for (const c of boarding.crew) {
      if (c.isCaptain && !c.dead) c.hurtT = 1.2;
    }
    // The hero swings (Game plays the animation + camera work)
    this.cb.onFinisher?.(target.x, target.y, target.z);
    return true;
  }

  private updateFinisher(dt: number): void {
    const b = this.boarding;
    if (!b || b.finisherT <= 0) return;
    b.finisherT += dt;
    // 0.55 s of wind-up, then the blow lands
    if (b.finisherT >= 0.55) {
      b.finisherT = 0;
      for (const c of b.crew) {
        if (c.isCaptain && !c.dead) {
          c.hp = 0;
          c.dead = true;
          c.moving = false;
          const w = b.brain.ship.toWorld(c.lx, 1.1, c.lz);
          this.flashes.spawn(w.clone().setY(w.y + 0.4), 1.6, 0.16, undefined, { grow: 3 });
          this.cb.sound('hit_hull');
          this.cb.notify('quest', 'FINISHER!', `${c.name} falls beneath the Warden’s blow. The deck falls silent.`);
          this.cb.music(0.5);
        }
      }
    }
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
    this.cb.notify('quest', 'The Bloody Gull is yours!',
      'Seal of the Order, 90 coins, and prime timber added to your inventory.');
    this.cb.music(0.8);
    // The pirate brig is scuttled by her own boiling powder store
    brain.ship.grappled = false;
    brain.ship.frozen = false;
    brain.ship.applyDamage(brain.ship.hullHp + 1);
    // Player jumps back aboard the Colibrí
    this.cb.returnPlayerToShip(this.playerShip!);
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
    if (this.boarding) return null; // mid-boarding: hands are full

    if (!this.playerSailing) {
      // Fase 18 — on foot / swimming: a crippled QUEST ship in reach can be
      // boarded directly from the water (Old Crow Isle quest fix).
      const fromWater = this.canBoardFromWorld(playerWorld);
      if (fromWater) {
        return {
          prompt: `Climb aboard the ${fromWater.ship.name}`,
          run: () => this.startBoarding(fromWater),
        };
      }
      // Fase 11 — ANY anchored ship in reach offers her wheel: the Colibrí
      // always, admin ships while at anchor (hull-accurate reach, Fase 18)
      const cand = this.helmCandidate(playerWorld);
      if (cand) {
        return {
          prompt: `Set sail aboard the ${cand.name}`,
          run: () => this.cb.returnPlayerToShip(cand),
        };
      }
      return null;
    }

    const ship = this.playerShip;
    if (!ship) return null;

    // Sailing: boarding has priority
    const boardable = this.canBoard();
    if (boardable) {
      return {
        prompt: `Board the ${boardable.ship.name}`,
        run: () => this.startBoarding(boardable),
      };
    }

    // Disembark when (almost) stopped
    const active = this.activeShip ?? ship;
    if (Math.abs(active.speed) < 0.8) {
      const spot = this.findLandingSpot(active);
      if (spot) {
        return {
          prompt: 'Go ashore',
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
          prompt: 'Recover the floating loot',
          run: () => {
            barrel.claimed = true;
            barrel.mesh.visible = false;
            const coins = 25 + Math.floor(Math.random() * 30);
            this.state.addItem('coin', coins);
            if (Math.random() < 0.5) this.state.addItem('madera', 1);
            // Fase 28 — corsair cargo: artillery-grade powder for the still
            if (Math.random() < 0.35) this.state.addItem('polvo_fina', 1);
            this.state.giveXp(20);
            this.cb.sound('hit_hull');
            this.cb.notify('item', 'Loot recovered', `${coins} gold coins from the sunken hull.`);
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
    const ship = this.activeShip ?? this.playerShip!;
    this.playerSailing = false;
    ship.anchored = true;
    ship.frozen = false;
    ship.sailState = 0;
    this.helmShip = null;
    this.onDisembark?.(spot);
    this.cb.notify('info', 'You have gone ashore', `${ship.name} lies at anchor here. Come back to her side to set sail again.`);
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

  /** Fase 15 — hull vs hull: circle-approximated collision between every
   *  live pair of ships. Pushes both hulls apart, kills the closing speed
   *  and deals RAM damage when the impact is hard. Anchored/admin ships
   *  are pushed too (the sea gives a little) but take no damage at rest. */
  private resolveShipCollisions(dt: number): void {
    void dt;
    const live: Ship[] = [];
    if (this.playerShip && this.playerShip.sinking === 0 && !this.playerShip.sunk) {
      live.push(this.playerShip);
    }
    for (const brain of this.enemies) {
      if (brain.ship.sinking === 0 && !brain.ship.sunk) live.push(brain.ship);
    }
    for (const s of this.extraShips) {
      if (s.sinking === 0 && !s.sunk) live.push(s);
    }
    const R = 7.4; // collision circle per hull (16 m hull, beam-beam contact)
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        // Grappled/frozen hulls (mid-boarding) sit together ON PURPOSE
        if (a.grappled && b.grappled) continue;
        if (a.frozen || b.frozen) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = R + R;
        if (d >= minD || d < 0.001) continue;
        // push both apart along the contact axis (half each)
        const push = (minD - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        a.syncTransform();
        b.syncTransform();
        // closing speed along the axis → ram damage when hard
        const vaX = Math.sin(a.heading) * a.speed;
        const vaZ = Math.cos(a.heading) * a.speed;
        const vbX = Math.sin(b.heading) * b.speed;
        const vbZ = Math.cos(b.heading) * b.speed;
        const closing = (vaX - vbX) * nx + (vaZ - vbZ) * nz;
        if (closing > 2.2) {
          const dmg = closing * 1.9;
          a.applyDamage(dmg);
          b.applyDamage(dmg);
          if (this.t - this.lastRamT > 0.6) {
            this.lastRamT = this.t;
            this.cb.sound('hit_hull');
            this.cb.sound('creak');
            const mid = new THREE.Vector3(
              a.pos.x + nx * R, this.water.waveHeightAt(a.pos.x + nx * R, a.pos.z + nz * R) + 1, a.pos.z + nz * R,
            );
            this.splashes.spawn(mid, 2.2, 0.8, undefined, { grow: 2.4 });
            this.smoke.spawn(mid, 1.6, 1.2, new THREE.Vector3(0, 1.4, 0), { grow: 1.8 });
          }
        }
        a.speed *= 0.35;
        b.speed *= 0.35;
      }
    }
  }

  private lastRamT = -10;

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
      this.cb.notify('quest', 'The Sea Hummingbird is sinking!',
        'The waves wash you back to shore. Bram will promise to look over the hull… for a price.');
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
      // Fase 4 — enemy ships starting to sink count as pirate kills
      // (the elite hunter of q11 + the general bounty flag)
      if (brain.ship.sinking > 0 && !(brain as EnemyBrain & { sinkNotified?: boolean }).sinkNotified) {
        (brain as EnemyBrain & { sinkNotified?: boolean }).sinkNotified = true;
        if (this.state.hasFlag('ship_repaired')) {
          this.cb.setFlag('elite_hunter_sunk');
          this.cb.setFlag('pirate_sunk_any');
        }
      }
    }

    // --- Cannonballs ---
    this.updateBalls(dt);

    // --- Fase 9 — solid hulls: refresh the collision AABBs of every ship
    //     near the player (far ships free their cells; sunk ships clear) ---
    ship?.syncColliders(playerWorld.x, playerWorld.z);
    for (const brain of this.enemies) {
      brain.ship.syncColliders(playerWorld.x, playerWorld.z);
    }
    // Fase 11 — admin/decorative ships LIVE: real buoyancy, sails and helm
    // (they used to be static buoys — now they can actually be sailed).
    // Far ones (>300 m) skip physics but keep their colliders in sync.
    for (const s of this.extraShips) {
      if (Math.hypot(s.pos.x - playerWorld.x, s.pos.z - playerWorld.z) < 300) {
        s.update(dt, this.water, this.terrain, WIND.dir);
      }
      s.syncColliders(playerWorld.x, playerWorld.z);
    }

    // --- Fase 15 — ship-vs-ship collision: hulls are SOLID against each
    //     other (they used to ghost through). Push-out + ram damage. ---
    this.resolveShipCollisions(dt);

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
    // Fase 15 — while sailing, the HUD follows the ship at the HELM (admin
    // ships included): `ship` is only the Colibrí, which doesn't exist yet
    // during an admin-ship voyage.
    const hudShip = this.playerSailing ? (this.activeShip ?? ship) : ship;
    if (hudShip && (this.playerSailing || this.playerNearShip(playerWorld))) {
      let enemyHud: SailingHud['enemy'] = null;
      let bestD = Infinity;
      for (const brain of this.enemies) {
        if (brain.ship.sunk || brain.ship.sinking > 0) continue;
        const d = Math.hypot(brain.ship.pos.x - hudShip.pos.x, brain.ship.pos.z - hudShip.pos.z);
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
      const rel = Math.atan2(Math.sin(WIND.dir - hudShip.heading), Math.cos(WIND.dir - hudShip.heading));
      return {
        hull: hudShip.hullHp,
        hullMax: hudShip.maxHullHp,
        knots: Math.abs(hudShip.speed) * 1.944,
        sailState: hudShip.sailState,
        windRel: rel,
        cdPort: clamp(1 - hudShip.cdPort / hudShip.cannonCd, 0, 1),
        cdStar: clamp(1 - hudShip.cdStar / hudShip.cannonCd, 0, 1),
        anchored: hudShip.anchored,
        shipName: hudShip.name,
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
        this.cb.notify('quest', 'Black sail on the prowl!', `${enemy.name} has come about toward you. Man the cannons!`);
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
            this.smoke.spawn(p.clone(), 1.4, 1.1, new THREE.Vector3(0, 1.2, 0), { grow: 1.6 });
            getFlameFX().burst(p.clone(), 0.8, 3, 0.6);
            this.flashes.spawn(p.clone(), 1.1, 0.1, undefined, { grow: 2 });
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
          this.flashes.spawn(p.clone(), 1.7, 0.12, undefined, { grow: 2 });
          this.smoke.spawn(p.clone(), 1.5, 1.0, new THREE.Vector3(0, 1, 0), { grow: 1.9 });
          this.cb.sound('hit_hull');
          dead = true;
        }
      }

      // --- Sea-serpent impacts (Fase 15: the beasts of the abyss) ---
      if (!dead && this.seaBeasts) {
        const beast = this.seaBeasts.projectileHitTest(p, 0.55, ballPrev);
        if (beast) {
          this.seaBeasts.damage(beast, (ball.fromPlayer ? 9 : 6) + Math.random() * 5);
          this.flashes.spawn(p.clone(), 1.6, 0.12, undefined, { grow: 2.2 });
          this.splashes.spawn(new THREE.Vector3(p.x, p.y + 0.6, p.z), 1.5, 0.9, undefined, { grow: 2.4 });
          this.cb.sound('hit_hull');
          dead = true;
        }
      }

      // --- Water splash ---
      if (!dead) {
        const wh = this.water.waveHeightAt(p.x, p.z);
        if (p.y <= wh + 0.05) {
          this.splashes.spawn(new THREE.Vector3(p.x, Math.max(0.2, wh + 0.2), p.z), 1.4, 0.9, undefined, { grow: 2.2 });
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

    // Fase 9 — cinematic finisher timer
    this.updateFinisher(dt);

    // Fase 9 — attack token: at most ONE pirate swings at a time (the
    // captain may always attack). No more getting melted by a blender.
    let swinging = 0;
    for (const c of this.boarding.crew) {
      if (!c.dead && c.attackT > 0) swinging++;
    }

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

      // Fase 9 — reeling from a hit or a parry: no actions while staggered
      if (c.hurtT > 0) {
        c.hurtT -= dt;
        c.moving = false;
        c.attackT = 0;
        const face = Math.atan2(dx, dz);
        c.yaw = dampAngle(c.yaw, face, 8, dt);
        const world = enemy.toWorld(c.lx, enemy.deckHeightAt(c.lx, c.lz) ?? 1, c.lz);
        c.group.position.set(world.x, world.y, world.z);
        c.group.rotation.y = c.yaw;
        c.updateAnim(dt);
        continue;
      }

      const reach = c.isCaptain ? 1.55 : 1.45;
      if (dist > reach) {
        // Fase 9 — SURROUND: each pirate closes on its own bearing around
        // the player (ring post 1.1 m out), so a 3v1 reads as a ring of
        // steel instead of a queue.
        const ringR = 1.15;
        const tx = local.x - Math.sin(c.ringAngle) * ringR;
        const tz = local.y - Math.cos(c.ringAngle) * ringR;
        const sdx = tx - c.lx;
        const sdz = tz - c.lz;
        const sd = Math.hypot(sdx, sdz);
        const spd = c.isCaptain ? 1.5 : 1.8;
        if (sd > 0.08) {
          c.lx += (sdx / sd) * spd * dt;
          c.lz += (sdz / sd) * spd * dt;
          c.moving = true;
        } else {
          // On post: hold ground (shuffling would look nervous)
          c.moving = false;
        }
        // Keep aboard
        const b = enemy.deckBounds;
        c.lx = clamp(c.lx, b.minX + 0.2, b.maxX - 0.2);
        c.lz = clamp(c.lz, b.minZ + 0.6, b.maxZ - 0.4);
      } else {
        c.moving = false;
        // Attack cycle (Fase 9: needs the token when a mate is mid-swing)
        const tokenFree = swinging === 0 || c.isCaptain;
        if (c.attackT === 0) {
          if (tokenFree) {
            c.attackCd -= dt;
            if (c.attackCd <= 0) {
              c.attackT = 0.001;
              c.attackCd = c.isCaptain ? 1.5 : 1.9;
              swinging++;
            }
          }
        } else {
          c.attackT += dt / 0.55;
          if (c.attackT >= 0.5 && c.attackT < 0.55) {
            // Strike lands once mid-swing if still in range
            if (dist < reach + 0.7) {
              const lost = this.cb.playerDamage(c.isCaptain ? 15 : 9, 'pirate');
              // Fase 9 — PARRIED: the perfect block staggers the attacker
              // wide open (1.5 s) and knocks them back a full pace.
              if (lost <= 0 && this.cb.wasParried()) {
                c.hurtT = 1.5;
                const klen = Math.hypot(dx, dz) || 1;
                const b = enemy.deckBounds;
                c.lx = clamp(c.lx - (dx / klen) * 1.3, b.minX + 0.2, b.maxX - 0.2);
                c.lz = clamp(c.lz - (dz / klen) * 1.3, b.minZ + 0.6, b.maxZ - 0.4);
              }
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
      // Fase 16 — admin ships survive a load: they are "yours" like the
      // Colibrí, and used to evaporate on every reload.
      extras: this.extraShips
        .filter((s) => !s.sunk)
        .map((s) => ({ id: s.id, ...s.serialize() })),
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
    this.restoreExtras(data?.extras);
  }

  /**
   * Fase 16 — rebuild the saved admin ships on a fresh session. Each extra
   * is recreated exactly where it was anchored (heading, hull, sails), then
   * re-dressed with the GLB hull. Live extras without a save entry stay.
   */
  private restoreExtras(list: NavalSaveData['extras']): void {
    if (!list) return;
    for (const d of list) {
      if (!d || this.extraShips.some((s) => s.id === d.id)) continue;
      const ship = new Ship({
        id: d.id,
        name: 'Wandering Vessel',
        kind: 'pirate',
        isPlayer: false,
        x: d.x, z: d.z, heading: d.heading,
      });
      ship.anchored = true;
      this.scene.add(ship.group);
      if (this.colliders) ship.bindColliderRegistry(this.colliders);
      this.extraShips.push(ship);
      this.dressShip(ship);
      ship.deserialize({ ...d });
    }
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
  /** Fase 16 — admin ships, so they survive a reload (optional: old saves). */
  extras?: Array<{
    id: string; x: number; z: number; heading: number; hullHp: number;
    sailState: 0 | 1 | 2; anchored: boolean; sunk: boolean; sinking: number;
  }>;
}
