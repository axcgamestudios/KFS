import * as THREE from 'three';
import { KnightModelGLB } from '../entities/KnightModelGLB';
import type { AssetSystem } from '../world/AssetSystem';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { KitSystem } from '../world/KitSystem';
import { buildHeroSword } from '../world/HeroSword';
import { damp, dampAngle } from '../core/MathUtils';

/**
 * Fase 10 — BanditSystem: RED KNIGHT bandits roaming set zones of the map.
 *
 * The Order's discipline gone rotten: deserters and road-wolves wearing
 * oxidised crimson plate. Every camp is 3 swords + 1 captain (taller, cloaked,
 * more health). They patrol their camp, spot the player at ~16 m, chase and
 * swing real melee attacks (dodgeable, blockable, parryable through the
 * player's own takeHit), and drop coins/potions. Camps respawn slowly so the
 * roads stay dangerous without ever becoming a grind.
 *
 * Fase 11 — CHOREOGRAPHED FIGHTS (the Spider-Man-grade combat spec):
 *  · ATTACK TOKENS: at most 2 bandits press the attack at once; everyone
 *    else holds a ring around the player and strafes for an opening —
 *    no more 4-on-1 blender
 *  · GUARD: when the hero's blade whistles past (a whiff), nearby bandits
 *    snap into a weapon-up guard that soaks light hits (sparks + clang);
 *    heavies smash it open
 *  · UNBLOCKABLE captain heavies: the guard does nothing — those MUST be
 *    dodged (Player.takeHit(opts.unblockable) breaks the stance)
 *  · PHYSICAL reactions: every landed hit shoves the bandit back a step
 *    (they stumble, they don't just flash)
 *  · REMATES: a bandit under 30% HP (captain 35%) can be executed with E —
 *    a short hit-stop, a heavy hero swing and a clean kill
 *  · first-contact help: the opening scrape of a fight prints the controls
 */

export interface BanditHooks {
  playerDamage: (dmg: number, fromX?: number, fromZ?: number, reason?: string, opts?: { unblockable?: boolean }) => void;
  sound: (kind: 'swing' | 'damage' | 'hit_scale' | 'block' | 'stagger') => void;
  notify: (kind: 'info' | 'item' | 'quest', title: string, body?: string) => void;
  giveXp: (xp: number) => void;
  addCoins: (n: number) => void;
  weaponImpact: (pos: THREE.Vector3) => void;
  blockSparks: (pos: THREE.Vector3) => void;
  cameraShake: (i: number) => void;
  hitStop: (dur: number) => void;
  /** Fase 12 — a bandit died (kill streaks + bounty counters). */
  onBanditKilled?: (captain: boolean) => void;
}

interface CampDef {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

/** Four hand-placed camps guarding roads and POI approaches. */
const CAMPS: CampDef[] = [
  { id: 'camp_camino', name: 'Emboscada del Camino Real', x: 62, z: 58, radius: 10 },
  { id: 'camp_vaelthara', name: 'Lobos de Vaelthara', x: -206, z: -112, radius: 11 },
  { id: 'camp_vigilias', name: 'La Peña del Cuervo Rojo', x: -118, z: -232, radius: 10 },
  { id: 'camp_costa', name: 'Corsarios de la Costa Oeste', x: -286, z: 170, radius: 11 },
];

/** HP fraction under which the REMATE prompt lights up. */
const FINISHER_HP_FRAC = 0.3;
const CAPTAIN_FINISHER_HP_FRAC = 0.35;

type BanditState = 'patrol' | 'chase' | 'hold' | 'attack' | 'stagger' | 'dead';

class Bandit {
  readonly group = new THREE.Group();
  model: KnightModelGLB | null = null;
  state: BanditState = 'patrol';
  hp: number;
  maxHp: number;
  readonly captain: boolean;
  readonly camp: CampDef;
  private campIndex: number;
  private angle = Math.random() * Math.PI * 2;
  private anchor = new THREE.Vector3();
  private target = new THREE.Vector3();
  private yaw = Math.random() * Math.PI * 2;
  private speedSm = 0;
  private phase = Math.random() * 8;
  private attackT = 0;
  private attackKind: 'light1' | 'light2' | 'heavy' = 'light1';
  private attackDur = 0.75;
  /** Post-swing cooldown (s) — the token system reads it (Fase 11). */
  attackCooldown = 0;
  private hitDone = false;
  private staggerT = 0;
  private deathT = 0;
  respawnT = 0;
  private moving = false;
  private aggro = false;
  private idlePause = 2 + Math.random() * 3;
  readonly pos = new THREE.Vector3();

  // ---- Fase 11 — choreography state ----
  /** Weapon-up guard timer (raised after a hero whiff nearby). */
  guardT = 0;
  /** Hit knockback impulse (world), decays fast. */
  knockX = 0;
  knockZ = 0;
  knockT = 0;
  /** This bandit currently owns one of the attack slots. */
  hasToken = false;
  /** Orbit direction on the ring (+1/-1) — assigned per camp slot. */
  ringSide = 1;
  /** Feint timer: a fake lunge from the ring to keep the hero honest. */
  private feintT = 0;
  private feintCd = 3 + Math.random() * 5;

  constructor(campIndex: number, camp: CampDef, captain: boolean, seed: number) {
    this.camp = camp;
    this.captain = captain;
    this.campIndex = campIndex;
    this.maxHp = captain ? 130 : 65;
    this.hp = this.maxHp;
    this.aggroRadius = captain ? 20 : 16;
    this.damage = captain ? 20 : 12;
    this.anchor.set(camp.x, 0, camp.z);
    void seed;
    this.ringSide = Math.random() < 0.5 ? 1 : -1;
    this.pickPatrolTarget();
  }

  readonly aggroRadius: number;
  readonly damage: number;

  get indexSeed(): number {
    return this.campIndex;
  }

  private pickPatrolTarget(): void {
    this.angle += 0.6 + Math.random() * 1.4;
    const r = 2.5 + Math.random() * (this.camp.radius - 2);
    this.target.set(
      this.camp.x + Math.cos(this.angle) * r,
      0,
      this.camp.z + Math.sin(this.angle) * r,
    );
  }

  get alive(): boolean {
    return this.state !== 'dead' || this.respawnT > 0;
  }

  get dead(): boolean {
    return this.state === 'dead';
  }

  /** Centre of the torso for hit tests. */
  center(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.15, this.pos.z);
  }

  get aggroed(): boolean {
    return this.aggro && !this.dead;
  }

  /** Fase 12 — ambush spawns come in already hunting. */
  forceAggro(): void {
    this.aggro = true;
  }

  /** Can the player execute a REMATE on this bandit right now? */
  get finisherable(): boolean {
    if (this.dead || this.respawnT > 0) return false;
    const frac = this.hp / this.maxHp;
    return frac <= (this.captain ? CAPTAIN_FINISHER_HP_FRAC : FINISHER_HP_FRAC);
  }

  takeDamage(amount: number, heavy: boolean, fromX?: number, fromZ?: number): { died: boolean; guarded: boolean } {
    if (this.dead) return { died: false, guarded: false };
    let guarded = false;
    let dealt = amount;
    // Fase 11 — the guard soaks LIGHT hits (sparks + clang); heavies smash it
    if (this.guardT > 0 && !heavy) {
      guarded = true;
      dealt = amount * 0.35;
      this.guardT = Math.min(this.guardT, 0.3); // the guard buckles a little
    }
    this.hp -= dealt;
    this.aggro = true;
    // physical reaction: every landed hit shoves the bandit a step back
    if (fromX !== undefined && fromZ !== undefined) {
      const dx = this.pos.x - fromX;
      const dz = this.pos.z - fromZ;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        const power = heavy ? 3.6 : 2.4;
        this.knockX = (dx / len) * power;
        this.knockZ = (dz / len) * power;
        this.knockT = 0.24;
      }
    } else {
      this.knockX = this.knockZ = 0;
      this.knockT = 0.2;
    }
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deathT = 0;
      this.respawnT = 360 + Math.random() * 120; // 6–8 min
      this.attackT = 0;
      return { died: true, guarded };
    }
    // captains have poise — light hits don't stagger them (guards neither)
    if ((heavy || !this.captain) && this.guardT <= 0) {
      this.state = 'stagger';
      this.staggerT = this.captain && heavy ? 0.55 : 0.42;
      this.attackT = 0;
    }
    return { died: false, guarded };
  }

  /** Instant kill used by the REMATE (the blow itself is the hero's anim). */
  execute(hooks: BanditHooks): void {
    if (this.dead) return;
    this.hp = 0;
    this.state = 'dead';
    this.deathT = 0;
    this.respawnT = 360 + Math.random() * 120;
    this.attackT = 0;
    this.guardT = 0;
    hooks.sound('hit_scale');
    hooks.cameraShake(this.captain ? 0.55 : 0.35);
    hooks.hitStop(0.14);
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    terrain: TerrainHeight,
    playerVulnerable: boolean,
    hooks: BanditHooks,
    /** Fase 14 — true cuando está lejos: la IA sigue (barata) pero la pose
     *  del caballero se congela (dt 0) — el álgebra de huesos es lo caro. */
    farAnim = false,
  ): void {
    const g = this.group;

    if (this.state === 'dead') {
      this.deathT += dt;
      this.respawnT -= dt;
      // fall over, then sink into the ground and free the slot
      if (this.deathT < 0.55) {
        g.rotation.x = -Math.PI / 2 * Math.min(1, this.deathT / 0.55);
        this.model?.update({ dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1 });
      } else if (this.deathT > 6) {
        const s = Math.max(0, 1 - (this.deathT - 6) / 2.2);
        g.position.y -= dt * 0.22;
        g.scale.setScalar(Math.max(0.01, s));
        if (this.deathT > 8.5) g.visible = false;
      }
      return;
    }

    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // --- perception ---
    if (!this.aggro && dist < this.aggroRadius && Math.abs(playerPos.y - this.pos.y) < 6) {
      this.aggro = true;
      hooks.sound('swing'); // a bark as they draw steel
    }
    // leash: far from camp or player dead/dialog -> back to patrol
    if (this.aggro && (dist > 34 || Math.hypot(this.pos.x - this.camp.x, this.pos.z - this.camp.z) > 46)) {
      this.aggro = false;
      this.hasToken = false;
      this.pickPatrolTarget();
    }

    // --- timers (Fase 11) ---
    if (this.guardT > 0) this.guardT -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.knockT > 0) this.knockT = Math.max(0, this.knockT - dt);

    // --- state logic ---
    let targetSpeed = 0;
    this.moving = false;

    if (this.state === 'stagger') {
      this.staggerT -= dt;
      if (this.staggerT <= 0) this.state = 'chase';
    } else if (this.state === 'attack') {
      this.attackT += dt / this.attackDur;
      // damage lands mid-swing if the player is still in range
      if (!this.hitDone && this.attackT >= (this.attackKind === 'heavy' ? 0.55 : 0.45)) {
        this.hitDone = true;
        if (playerVulnerable && dist < 2.6) {
          const facing = Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz;
          if (facing > 0) {
            // Fase 11 — the captain's overhead is UNBLOCKABLE: it must be dodged
            const unblockable = this.captain && this.attackKind === 'heavy';
            hooks.playerDamage(this.damage, this.pos.x, this.pos.z, 'bandit', { unblockable });
          }
        }
      }
      if (this.attackT >= 1) {
        this.attackT = 0;
        this.state = 'chase';
        this.hasToken = false; // the slot frees up the moment the swing ends
        this.attackCooldown = this.captain ? 0.9 + Math.random() * 0.5 : 1.25 + Math.random() * 0.75;
      }
    } else if (this.aggro && this.guardT <= 0) {
      this.state = 'chase';
      if (this.hasToken) {
        // ---- ATTACKER: close the distance and swing ----
        if (dist < 2.05) {
          if (this.attackCooldown <= 0) {
            this.state = 'attack';
            this.hitDone = false;
            this.attackT = 0.001;
            const roll = Math.random();
            this.attackKind = this.captain && roll < 0.35 ? 'heavy' : roll < 0.55 ? 'light2' : 'light1';
            this.attackDur = this.attackKind === 'heavy' ? 0.95 : 0.7;
            hooks.sound('swing');
            this.yaw = Math.atan2(dx, dz); // square up for the blow
          } else {
            // token holder waiting on cooldown: circle menacingly
            this.state = 'hold';
          }
        } else {
          this.target.set(playerPos.x, 0, playerPos.z);
          targetSpeed = this.captain ? 3.9 : 4.3;
          this.moving = true;
        }
      } else {
        // ---- HOLDER: the ring. No token -> orbit the player at ~3.1 m,
        // shifting with your ring side, feinting now and then. The pack
        // reads like it is taking turns — because it is. ----
        this.state = 'hold';
        const ringR = 3.1;
        const nx = -dx / Math.max(0.001, dist);
        const nz = -dz / Math.max(0.001, dist);
        // tangential direction * ringSide
        const tx = -nz * this.ringSide;
        const tz = nx * this.ringSide;
        if (dist > ringR + 0.45) {
          this.target.set(playerPos.x + nx * ringR + tx * 0.8, 0, playerPos.z + nz * ringR + tz * 0.8);
          targetSpeed = 2.6;
          this.moving = true;
        } else if (dist < ringR - 0.5) {
          this.target.set(playerPos.x + nx * (ringR + 0.6) + tx * 0.8, 0, playerPos.z + nz * (ringR + 0.6) + tz * 0.8);
          targetSpeed = 2.4;
          this.moving = true;
        } else {
          // on the ring: sidestep along it
          this.target.set(this.pos.x + tx * 2.2, 0, this.pos.z + tz * 2.2);
          targetSpeed = 1.7;
          this.moving = true;
          // occasional feint — half a lunge, then back
          this.feintT -= dt;
          if (this.feintT <= 0 && this.feintCd <= 0) {
            this.feintT = 0.32;
            this.feintCd = 3 + Math.random() * 5;
          }
          if (this.feintT > 0) {
            this.target.set(playerPos.x, 0, playerPos.z);
            targetSpeed = 4.4;
          }
          this.feintCd -= dt;
        }
      }
    } else if (this.aggro && this.guardT > 0) {
      // guarding in place: face the hero, weapon up
      this.state = 'hold';
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
    } else {
      // patrol the camp
      this.state = 'patrol';
      const tdx = this.target.x - this.pos.x;
      const tdz = this.target.z - this.pos.z;
      const td = Math.hypot(tdx, tdz);
      if (td < 0.6) {
        this.idlePause -= dt;
        this.moving = false;
        if (this.idlePause <= 0) {
          this.idlePause = 1.5 + Math.random() * 3.5;
          this.pickPatrolTarget();
        }
      } else {
        this.moving = true;
        targetSpeed = 1.25;
      }
    }

    // --- steering + terrain ---
    const tdx = this.target.x - this.pos.x;
    const tdz = this.target.z - this.pos.z;
    const tdl = Math.hypot(tdx, tdz);
    if (this.moving && tdl > 0.01 && this.state !== 'attack' && this.state !== 'stagger') {
      const nx = tdx / tdl;
      const nz = tdz / tdl;
      this.speedSm = damp(this.speedSm, targetSpeed, 6, dt);
      this.pos.x += nx * this.speedSm * dt;
      this.pos.z += nz * this.speedSm * dt;
      this.yaw = dampAngle(this.yaw, Math.atan2(nx, nz), 8, dt);
    } else {
      this.speedSm = damp(this.speedSm, 0, 8, dt);
      if (this.aggro && dist < 7) {
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
      }
    }
    // hit knockback: a physical shove on top of the steering
    if (this.knockT > 0) {
      const k = this.knockT / 0.24;
      this.pos.x += this.knockX * k * dt * 4.2;
      this.pos.z += this.knockZ * k * dt * 4.2;
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -1005, 1005);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -1005, 1005);
    this.pos.y = terrain.height(this.pos.x, this.pos.z);
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    g.rotation.x = damp(g.rotation.x, 0, 10, dt);

    // --- animation ---
    this.phase += dt * (this.speedSm > 3.2 ? 8.6 : 5.4) * (this.moving ? 1 : 0);
    this.model?.update({
      dt: farAnim ? 0 : dt,
      speed: this.speedSm,
      moving: this.moving,
      grounded: true,
      swimming: false,
      attackT: this.attackT,
      attackKind: this.attackKind,
      // Fase 11 — the guard is a real weapon-up stance (block pose layer)
      blockT: this.guardT > 0 ? Math.min(1, this.guardT * 4) : 0,
      rollT: 0,
      bowDraw: -1,
    });
  }

  /** The hero's blade just cut air near this bandit — snap to guard. */
  onPlayerWhiff(playerPos: THREE.Vector3): void {
    if (this.dead || !this.aggro) return;
    const d = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    if (d < 4.2 && this.state !== 'attack') {
      this.guardT = Math.max(this.guardT, 0.85);
    }
  }

  respawn(terrain: TerrainHeight): void {
    this.hp = this.maxHp;
    this.state = 'patrol';
    this.aggro = false;
    this.deathT = 0;
    this.attackT = 0;
    this.staggerT = 0;
    this.guardT = 0;
    this.hasToken = false;
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.angle = Math.random() * Math.PI * 2;
    this.pickPatrolTarget();
    this.pos.set(this.camp.x, 0, this.camp.z);
    this.pos.y = terrain.height(this.pos.x, this.pos.z);
    this.group.position.copy(this.pos);
  }
}

export class BanditSystem {
  private bandits: Bandit[] = [];
  private scene: THREE.Scene;
  private terrain: TerrainHeight;
  private assets: AssetSystem;
  private kits: KitSystem | null;
  private hooks: BanditHooks;
  /** Alive bandits near a point (for the melee hook). */
  private tmpV = new THREE.Vector3();
  /** Fase 11 — one-time first-contact help (controls of the trade). */
  private helpShown = false;

  constructor(
    scene: THREE.Scene,
    terrain: TerrainHeight,
    assets: AssetSystem,
    kits: KitSystem | null,
    hooks: BanditHooks,
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.assets = assets;
    this.kits = kits;
    this.hooks = hooks;
    this.spawnAll();
  }

  private spawnAll(): void {
    let n = 0;
    for (let c = 0; c < CAMPS.length; c++) {
      const camp = CAMPS[c];
      const crew = 4; // 3 swords + captain
      for (let i = 0; i < crew; i++) {
        const captain = i === 0;
        const bandit = new Bandit(c, camp, captain, c * 31 + i * 7);
        const angle = (i / crew) * Math.PI * 2;
        bandit.pos.set(
          camp.x + Math.cos(angle) * 3.2,
          0,
          camp.z + Math.sin(angle) * 3.2,
        );
        bandit.pos.y = this.terrain.height(bandit.pos.x, bandit.pos.z);
        bandit.group.position.copy(bandit.pos);
        this.scene.add(bandit.group);
        this.bandits.push(bandit);
        this.attachVisual(bandit, captain);
        n++;
      }
    }
    void n;
  }

  /** Fase 12 — living red knights (E2E/admin). */
  aliveCount(): number {
    return this.bandits.filter((b) => !b.dead).length;
  }

  /**
   * Fase 12 — AMBUSH: a surprise squad of red knights materialises around a
   * point (collection pickups triggering action). They spawn ALERTED and
   * charge straight in — the player can never gather in peace.
   */
  spawnAmbush(x: number, z: number, count = 3): number {
    let spawned = 0;
    const camp = { ...CAMPS[0], x, z, radius: 4 };
    for (let i = 0; i < count; i++) {
      const captain = i === 0 && count >= 3;
      const bandit = new Bandit(0, camp as CampDef, captain, 9000 + this.bandits.length * 13 + i);
      const a = (i / count) * Math.PI * 2 + Math.random();
      const r = 13 + Math.random() * 5;
      bandit.pos.set(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
      bandit.pos.y = this.terrain.height(bandit.pos.x, bandit.pos.z);
      bandit.group.position.copy(bandit.pos);
      bandit.forceAggro();          // they come in swinging
      this.scene.add(bandit.group);
      this.bandits.push(bandit);
      this.attachVisual(bandit, captain);
      spawned++;
    }
    return spawned;
  }

  private attachVisual(bandit: Bandit, captain: boolean): void {
    this.assets.loadModel('knight_rigged.glb').then((scene) => {
      if (bandit.dead) return; // died before the model arrived
      const model = new KnightModelGLB({
        scene,
        bandit: { seed: bandit.pos.x * 3.1 + bandit.pos.z, captain },
        // Fase 11 — bandits carry the rusted variant of the master-forged
        // sword (red-black steel, plain pommel); captains get a garnet.
        weaponFactory: (kind) => (kind === 'sword'
          ? buildHeroSword({ rusted: true, captain })
          : this.kits ? this.kits.weapon(kind) : null),
      });
      model.setWeapon('sword');
      model.setShield(false);
      bandit.model = model;
      bandit.group.add(model.root);
    }).catch(() => {
      // GLB unavailable — leave an empty group (bandits simply don't spawn)
      bandit.group.visible = false;
      bandit.takeDamage(99999, true);
    });
  }

  // ------------------------------------------------------------ combat API

  /** Player melee swing: nearest bandit inside reach+arc from origin/yaw. */
  meleeHitCheck(
    origin: THREE.Vector3,
    yaw: number,
    reach: number,
    arc: number,
  ): { bandit: Bandit; point: THREE.Vector3 } | null {
    let best: Bandit | null = null;
    let bestD = Infinity;
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const dx = b.pos.x - origin.x;
      const dz = b.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + 0.55) continue;
      const facing = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      const ang = Math.atan2(dx, dz) - yaw;
      const wrapped = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
      if (facing > 0 && wrapped < arc * 0.5 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (!best) return null;
    const c = best.center();
    return {
      bandit: best,
      point: this.tmpV.set(
        best.pos.x,
        c.y,
        best.pos.z,
      ).clone(),
    };
  }

  /** Fase 11 — multi-target sweep (spin finishers): up to `max` victims. */
  meleeHitCheckMulti(
    origin: THREE.Vector3,
    yaw: number,
    reach: number,
    arc: number,
    max: number,
  ): Array<{ bandit: Bandit; point: THREE.Vector3 }> {
    const found: Array<{ bandit: Bandit; d: number }> = [];
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const dx = b.pos.x - origin.x;
      const dz = b.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + 0.55) continue;
      const facing = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      const ang = Math.atan2(dx, dz) - yaw;
      const wrapped = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
      if (facing > 0 && wrapped < arc * 0.5) found.push({ bandit: b, d });
    }
    found.sort((a, z) => a.d - z.d);
    return found.slice(0, max).map((f) => ({
      bandit: f.bandit,
      point: f.bandit.center(),
    }));
  }

  /** Fase 11 — radial AoE (plunge landing): everyone in the ring. */
  meleeHitCheckRadius(
    center: THREE.Vector3,
    radius: number,
    max: number,
  ): Array<{ bandit: Bandit; point: THREE.Vector3 }> {
    const found: Array<{ bandit: Bandit; d: number }> = [];
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const d = Math.hypot(b.pos.x - center.x, b.pos.z - center.z);
      if (Math.abs(b.pos.y - center.y) < 2.6 && d < radius) found.push({ bandit: b, d });
    }
    found.sort((a, z) => a.d - z.d);
    return found.slice(0, max).map((f) => ({
      bandit: f.bandit,
      point: f.bandit.center(),
    }));
  }

  /** Arrow/projectile sweep: bandit whose capsule contains the point. */
  projectileHitTest(pos: THREE.Vector3, radius: number): Bandit | null {
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const dx = pos.x - b.pos.x;
      const dz = pos.z - b.pos.z;
      const dy = pos.y - (b.pos.y + 0.95);
      if (dx * dx + dz * dz < (radius + 0.45) ** 2 && Math.abs(dy) < 1.05) return b;
    }
    return null;
  }

  /** Apply player damage to a bandit; handles loot/XP on death. */
  damage(bandit: unknown, amount: number, heavy: boolean): void {
    const b = bandit as Bandit;
    const p = this.playerPos();
    const res = b.takeDamage(amount, heavy, p?.x, p?.z);
    if (res.guarded) {
      // light hit into a raised weapon: sparks + clang, no real harm
      this.hooks.blockSparks(b.center());
      this.hooks.sound('block');
      this.hooks.weaponImpact(b.center());
      return;
    }
    this.hooks.weaponImpact(b.center());
    if (res.died) {
      const coins = b.captain ? 25 + Math.floor(Math.random() * 35) : 8 + Math.floor(Math.random() * 14);
      this.hooks.addCoins(coins);
      this.hooks.giveXp(b.captain ? 60 : 18);
      this.hooks.sound('hit_scale');
      this.hooks.cameraShake(b.captain ? 0.5 : 0.25);
      this.hooks.hitStop(b.captain ? 0.12 : 0.07);
      this.hooks.onBanditKilled?.(b.captain);
      this.hooks.notify(
        'item',
        b.captain ? '¡Capitán bandido derrotado!' : 'Bandido abatido',
        `Botín: ${coins} monedas de oro.`,
      );
    } else {
      this.hooks.sound('damage');
    }
  }

  /** Best-known player position (kept fresh by update()). */
  private lastPlayer = new THREE.Vector3();
  private playerPos(): THREE.Vector3 | undefined {
    return this.lastPlayerDefined ? this.lastPlayer : undefined;
  }
  private lastPlayerDefined = false;

  // ------------------------------------------------------------ remates

  /** A finisherable bandit within reach of the player (for the E prompt). */
  finisherTarget(playerPos: THREE.Vector3): Bandit | null {
    let best: Bandit | null = null;
    let bestD = Infinity;
    for (const b of this.bandits) {
      if (!b.finisherable || !b.group.visible) continue;
      const d = Math.hypot(b.pos.x - playerPos.x, b.pos.z - playerPos.z);
      if (d < 2.5 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /** RUN the remate: the hero's heavy (Game plays the anim) + the kill. */
  executeFinisher(bandit: unknown): void {
    const b = bandit as Bandit;
    if (!b || b.dead) return;
    b.execute(this.hooks);
    const coins = b.captain ? 30 + Math.floor(Math.random() * 40) : 10 + Math.floor(Math.random() * 16);
    this.hooks.addCoins(coins);
    this.hooks.giveXp(b.captain ? 70 : 22);
    this.hooks.notify(
      'quest',
      '¡REMATE!',
      b.captain
        ? 'El capitán cae de rodillas. El camino vuelve a ser de los viajeros.'
        : 'Limpio y sin drama. Los cuervos rojos aprenderán a temerte.',
    );
  }

  /** The hero's swing cut only air — nearby bandits snap to guard. */
  onPlayerWhiff(playerPos: THREE.Vector3): void {
    for (const b of this.bandits) {
      if (b.dead) continue;
      b.onPlayerWhiff(playerPos);
    }
  }

  /** Is anyone hot on the player right now (for the combat camera framing)? */
  combatHeat(playerPos: THREE.Vector3): number {
    let n = 0;
    for (const b of this.bandits) {
      if (!b.aggroed) continue;
      if (Math.hypot(b.pos.x - playerPos.x, b.pos.z - playerPos.z) < 16) n++;
    }
    return n;
  }

  // ------------------------------------------------------------ frame

  update(dt: number, playerPos: THREE.Vector3, playerVulnerable: boolean): void {
    this.lastPlayer.copy(playerPos);
    this.lastPlayerDefined = true;

    // ---- Fase 11: attack tokens — at most 2 press at once ----
    let attackers = 0;
    const engaged: Bandit[] = [];
    for (const b of this.bandits) {
      if (b.aggroed && !b.dead) engaged.push(b);
    }
    for (const b of engaged) {
      if (b.state === 'attack') attackers++;
    }
    const maxAttackers = Math.max(1, Math.min(2, Math.ceil(engaged.length / 2)));
    for (const b of engaged) {
      if (b.state === 'attack') {
        b.hasToken = true; // keep it until the swing ends
        continue;
      }
      if (!b.hasToken && attackers < maxAttackers && b.attackCooldown <= 0 && b.guardT <= 0) {
        b.hasToken = true;
        attackers++;
      }
    }

    // first-contact help (once per session)
    if (!this.helpShown && engaged.length > 0) {
      this.helpShown = true;
      this.hooks.notify(
        'info',
        'Primera escaramuza',
        'Clic con ritmo: combos · mantener clic: golpe pesado · C: esquivar · clic derecho: bloqueo — justo antes del golpe = parada perfecta · en el aire, mantener: colapso · 1-4: cambiar de arma',
      );
    }

    for (const b of this.bandits) {
      if (b.dead && b.respawnT <= 0 && !b.group.visible) continue; // already despawned
      if (b.dead && b.respawnT <= 0) {
        b.respawn(this.terrain);
        this.attachVisual(b, b.captain);
        continue;
      }
      // culling Fase 14 — tres anillos:
      //  · >330 m: ni se dibuja (los vivos; los muertos gestionan su visible)
      //  · >210 m: ni IA (comportamiento previo, se re-engancha al volver)
      //  · >70 m: IA sí, pose congelada (el hueso es lo caro, no el steering)
      const d2 = (b.pos.x - playerPos.x) ** 2 + (b.pos.z - playerPos.z) ** 2;
      if (!b.dead) b.group.visible = d2 < 330 * 330;
      if (d2 > 210 * 210) continue;
      b.update(dt, playerPos, this.terrain, playerVulnerable, this.hooks, d2 > 70 * 70);
    }
  }

  /** Debug/test surface. */
  stats(): { total: number; alive: number; camps: number } {
    return {
      total: this.bandits.length,
      alive: this.bandits.filter((b) => !b.dead).length,
      camps: CAMPS.length,
    };
  }

  campList(): Array<{ id: string; name: string; x: number; z: number }> {
    return CAMPS.map((c) => ({ id: c.id, name: c.name, x: c.x, z: c.z }));
  }

  dispose(): void {
    for (const b of this.bandits) {
      this.scene.remove(b.group);
      b.model?.dispose();
    }
    this.bandits.length = 0;
  }
}
