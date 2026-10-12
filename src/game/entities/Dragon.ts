import * as THREE from 'three';
import { DragonModel, type DragonColors, type DragonAnimState } from './DragonModel';
import { DragonModelGLB } from './DragonModelGLB';
import type { TerrainHeight } from '../world/TerrainHeight';
import { clamp, damp, dampAngle } from '../core/MathUtils';

/** Species/encounter configuration. */
export interface DragonDef {
  id: string;
  name: string;
  title?: string;
  boss: boolean;
  wyvern: boolean;
  canFly: boolean;
  colors: DragonColors;
  scale: number;
  maxHp: number;
  home: { x: number; z: number };
  territory: number;
  aggroRange: number;
  attacks: Array<'bite' | 'claw' | 'tail' | 'fire'>;
  meleeRange: number;
  fireRange: number;
  fireDps: number;
  meleeDamage: number;
  speedGround: number;
  speedFly: number;
  xp: number;
  deathFlag: string;
  introFlag?: string;
  /** Fase 4: dragon is NOT spawned at boot — it waits for this flag
   *  (Kraivenn awakens at the black altar when the player calls it). */
  spawnFlag?: string;
  /** Fase 4: use the repository's black dragon GLB with its native idle clip. */
  useGlbModel?: boolean;
  /** HP fractions where behaviour changes (bosses). */
  phase2At?: number;
  phase3At?: number;
  drops?: Array<{ id: string; count: number }>;
  lootGold?: number;
  /** Starts asleep until the player comes close (guardian / ancestor). */
  startsAsleep?: boolean;
}

export type DragonState =
  | 'sleep' | 'idle' | 'patrol' | 'chase' | 'windup' | 'strike'
  | 'recover' | 'hurt' | 'stagger' | 'takeoff' | 'landing' | 'return'
  | 'die' | 'dead';

export interface DragonHooks {
  roar(big: boolean): void;
  wing(big: boolean): void;
  fire(): void;
  thud(big: boolean): void;
  step(): void;
  onAggro(d: Dragon): void;
  onDeath(d: Dragon): void;
  onPhase(d: Dragon, phase: number): void;
  /** Fire breath frame: cone check + damage handled inside the Dragon. */
  fireStream(from: THREE.Vector3, dir: THREE.Vector3, dt: number, power: number): void;
  firePuff(pos: THREE.Vector3, scale: number): void;
  landingDust(pos: THREE.Vector3, scale: number): void;
  /** A dragon melee attack connected with the player. */
  onMelee(d: Dragon, dmg: number): void;
  /** Fire breath tick damage on the player. */
  onFireDamage(d: Dragon, dmg: number): void;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();

/** Fase 9 — ÉPICA: the dragons read as overgrown lizards; every species is
 *  now 3× bigger. The multiplier is applied to the whole envelope (model,
 *  hit spheres, leg height, melee/fire reach) so a giant still fights like one. */
/** Fase 12 — 2.2× (down from 3×): still EPIC bosses (~27-39 m) but the
 *  giants no longer scrape terrain or clip through hillsides. */
export const DRAGON_SIZE_MULT = 2.2;

/**
 * One dragon creature: AI state machine + locomotion (ground walk with
 * terrain clamping, 3D flight with terrain avoidance) + attack execution
 * with telegraphs, vulnerable recovery windows and boss phases.
 */
export class Dragon {
  readonly def: DragonDef;
  readonly model: DragonModel | DragonModelGLB;
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();

  state: DragonState = 'idle';
  hp: number;
  phase = 1;
  flying = false;
  aggro = false;
  /** Seconds until the next attack may start. */
  attackCd = 1.5;
  stateT = 0;
  staggerMeter = 0;
  visibleToPlayer = true;

  private yaw = 0;
  private target = new THREE.Vector3();
  private action: 'bite' | 'claw' | 'tail' | 'fire' | 'none' = 'none';
  private hitDone = false;
  private patrolAngle: number;
  private perceptionT = Math.random() * 0.4;
  private fireTickT = 0;
  private stepT = 0;
  private wingT = 0;
  private anim: DragonAnimState = { mode: 'idle', t: 0, speed: 0, turn: 0, grounded: true };
  private readonly rng: () => number;
  /** Approximate body height above ground when standing (model units). */
  private readonly legHeight: number;

  constructor(
    def: DragonDef,
    scene: THREE.Scene,
    seed: number,
    glbLoader?: () => Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }>,
  ) {
    this.def = def;
    this.hp = def.maxHp;
    // Fase 9 — triple size: scale the def copy so model, hit spheres, ranges
    // and leg height all grow together. Speeds get a gentler boost (×1.5) so
    // the giants still feel ponderous instead of teleporting.
    def = {
      ...def,
      scale: def.scale * DRAGON_SIZE_MULT,
      meleeRange: def.meleeRange * DRAGON_SIZE_MULT,
      fireRange: def.fireRange * DRAGON_SIZE_MULT,
      speedGround: def.speedGround * 1.5,
      speedFly: def.speedFly * 1.5,
    };
    this.def = def;
    this.hp = def.maxHp;
    this.model = def.useGlbModel && glbLoader
      ? new DragonModelGLB(def.colors, def.scale, glbLoader)
      : new DragonModel(def.colors, def.scale, def.wyvern);
    this.group.add(this.model.root);
    scene.add(this.group);
    // Fase 8 — the GLB normalises to a 10.5 m body (was 7.5): the hips sit higher
    this.legHeight = 1.8 * def.scale;
    let a = (seed * 2654435761) >>> 0 || 7;
    this.rng = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.patrolAngle = this.rng() * Math.PI * 2;
    if (def.startsAsleep) this.state = 'sleep';
  }

  /** Spawn at home position on the ground / in the air. */
  spawnAt(terrain: TerrainHeight, air = false): void {
    const g = terrain.height(this.def.home.x, this.def.home.z);
    if (air) {
      this.pos.set(this.def.home.x, Math.max(g, 0) + 26, this.def.home.z);
      this.flying = true;
    } else {
      this.pos.set(this.def.home.x, g + this.legHeight, this.def.home.z);
      this.flying = false;
    }
    this.group.position.copy(this.pos);
    this.hp = this.def.maxHp;
    this.state = this.def.startsAsleep && !this.aggro ? 'sleep' : 'idle';
    this.aggro = false;
    this.phase = 1;
    this.staggerMeter = 0;
  }

  get alive(): boolean {
    return this.state !== 'die' && this.state !== 'dead';
  }

  get bodyRadius(): number {
    return 1.55 * this.def.scale;
  }

  get headRadius(): number {
    return 0.85 * this.def.scale;
  }

  // ---------------------------------------------------------------- damage

  /**
   * Take a hit. Returns what happened so callers can play the right FX.
   * Heavy hits build extra stagger; a full meter breaks the creature open.
   */
  takeDamage(amount: number, heavy: boolean, hooks: DragonHooks): 'hit' | 'stagger' | 'die' {
    if (!this.alive) return 'hit';
    this.hp = Math.max(0, this.hp - amount);
    this.model.flash();
    if (this.hp <= 0) {
      this.enterState('die');
      this.aggro = true;
      hooks.roar(this.def.boss);
      return 'die';
    }
    // Boss phase changes
    const frac = this.hp / this.def.maxHp;
    if (this.def.phase3At !== undefined && this.phase === 2 && frac <= this.def.phase3At) {
      this.phase = 3;
      hooks.onPhase(this, 3);
      hooks.roar(true);
      this.model.setEyeGlow(1);
    } else if (this.def.phase2At !== undefined && this.phase === 1 && frac <= this.def.phase2At) {
      this.phase = 2;
      hooks.onPhase(this, 2);
      hooks.roar(true);
    }
    // Stagger meter (heavier weapons break guards faster)
    this.staggerMeter += amount * (heavy ? 1.6 : 0.8);
    const staggerLimit = this.def.boss ? this.def.maxHp * 0.34 : this.def.maxHp * 0.5;
    if (this.staggerMeter >= staggerLimit && (this.state === 'recover' || this.state === 'chase' || this.state === 'windup')) {
      this.staggerMeter = 0;
      this.enterState('stagger');
      return 'stagger';
    }
    // Brief flinch when idle/chasing (attacks have poise during windup)
    if (this.state !== 'windup' && this.state !== 'strike' && this.state !== 'stagger' && this.rng() < 0.5) {
      this.enterState('hurt');
    }
    return 'hit';
  }

  // ---------------------------------------------------------------- helpers

  private enterState(s: DragonState): void {
    this.state = s;
    this.stateT = 0;
    this.hitDone = false;
    if (s === 'windup') this.model.mouthGlow(0);
  }

  /** Terrain/obstacle line of sight between dragon head and the player. */
  private hasLOS(playerPos: THREE.Vector3, terrain: TerrainHeight): boolean {
    this.model.headWorldPos(tmpA);
    const steps = 4;
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      tmpB.lerpVectors(tmpA, playerPos, k);
      const ground = terrain.height(tmpB.x, tmpB.z);
      if (ground > tmpB.y + 1.2) return false;
    }
    return true;
  }

  /** Face target yaw (world XZ). */
  private faceToward(x: number, z: number, dt: number, rate = 6): void {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw = dampAngle(this.yaw, want, rate, dt);
  }

  /** Fire breath cone test: is the target inside length/width from the mouth? */
  private inFireCone(playerPos: THREE.Vector3, terrain: TerrainHeight, maxLen: number): boolean {
    this.model.mouthWorldPos(tmpA);
    tmpB.copy(playerPos).sub(tmpA);
    const len = tmpB.length();
    if (len > maxLen) return false;
    // Direction the head faces (+Z of the group — Object3D.getWorldDirection
    // returns +Z; only Camera is overridden to -Z)
    this.group.getWorldDirection(tmpC);
    tmpB.normalize();
    const along = tmpB.dot(tmpC);
    if (along < 0.35) return false; // ~70° half-angle cone
    // Fire must not pass through terrain
    for (let i = 1; i <= 3; i++) {
      const k = (i / 3) * Math.min(len, maxLen);
      tmpC.copy(tmpA).addScaledVector(tmpB, k);
      if (terrain.height(tmpC.x, tmpC.z) > tmpC.y + 0.4) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- update

  /**
   * @param targetPos what the dragon hunts (player position, or the ship
   *        position for the sea wyvern).
   */
  update(
    dt: number,
    targetPos: THREE.Vector3,
    targetAlive: boolean,
    terrain: TerrainHeight,
    hooks: DragonHooks,
  ): void {
    this.stateT += dt;
    this.terrainRef = terrain;
    const def = this.def;
    const distHome = Math.hypot(this.pos.x - def.home.x, this.pos.z - def.home.z);
    const dx = targetPos.x - this.pos.x;
    const dz = targetPos.z - this.pos.z;
    const distTarget = Math.hypot(dx, dz);
    const distTarget3 = Math.hypot(dx, targetPos.y - this.pos.y, dz);
    this.anim.speed = 0;
    this.anim.turn = 0;

    // ------- perception (throttled) -------
    this.perceptionT -= dt;
    if (this.perceptionT <= 0) {
      this.perceptionT = 0.35;
      if (this.alive && !this.aggro && this.state !== 'die' && targetAlive) {
        if (this.state === 'sleep') {
          // Sleeping dragons wake ANGRY when disturbed — bosses present on wake
          if (distTarget3 < 26) {
            this.enterState('chase');
            this.aggro = true;
            this.attackCd = 1.6;
            this.model.setEyeGlow(0.4);
            hooks.onAggro(this);
            hooks.roar(def.boss);
          }
        } else if (distTarget < def.aggroRange && this.hasLOS(targetPos, terrain)) {
          this.aggro = true;
          this.attackCd = 1.2;
          hooks.onAggro(this);
          hooks.roar(def.boss);
        }
      }
    }

    if (!this.alive) {
      this.updateDeath(dt, terrain, hooks);
      return;
    }

    // De-aggro when far from home or target dead → return & heal
    if (this.aggro && (distHome > def.territory || !targetAlive)) {
      this.aggro = false;
      if (this.state !== 'stagger') this.enterState(this.flying ? 'return' : 'return');
    }
    if (this.state === 'return') {
      this.hp = Math.min(def.maxHp, this.hp + def.maxHp * 0.05 * dt);
      this.staggerMeter = Math.max(0, this.staggerMeter - dt * 20);
    }

    // ------- state machine -------
    switch (this.state) {
      case 'sleep': {
        this.anim.mode = 'sleep';
        this.anim.t = 0;
        break;
      }
      case 'idle': {
        this.anim.mode = 'idle';
        if (this.aggro) this.enterState('chase');
        else if (this.stateT > 2 + this.rng() * 3) this.enterState('patrol');
        break;
      }
      case 'patrol': {
        this.anim.mode = 'walk';
        // Slow circuit around home
        this.patrolAngle += dt * (this.rng() < 0.5 ? 0.12 : -0.12) * 2;
        const pr = 16 + this.rng() * 8;
        this.target.set(
          def.home.x + Math.cos(this.patrolAngle) * pr,
          0,
          def.home.z + Math.sin(this.patrolAngle) * pr,
        );
        this.moveGround(dt, terrain, def.speedGround * 0.32);
        this.anim.speed = def.speedGround * 0.32;
        if (this.aggro) this.enterState('chase');
        if (this.stateT > 6 + this.rng() * 5) this.enterState('idle');
        break;
      }
      case 'chase': {
        if (!this.aggro) {
          this.enterState('return');
          break;
        }
        // Ranged fire opportunity while closing in
        if (this.flying) {
          this.updateFlyingChase(dt, targetPos, terrain, hooks, distTarget);
        } else {
          this.anim.mode = 'walk';
          this.anim.speed = def.speedGround;
          this.target.copy(targetPos);
          this.moveGround(dt, terrain, def.speedGround);
          // Ground dragon: hop over to the player when too far for too long
          if (def.canFly && distTarget > def.meleeRange * 2.6 && this.stateT > 4.5) {
            this.enterState('takeoff');
            break;
          }
          // Try an attack whenever inside weapon envelope (melee OR fire band)
          if (distTarget <= Math.max(def.meleeRange * 1.2, def.fireRange)) {
            this.tryPickAttack(targetPos, distTarget, hooks);
          }
        }
        break;
      }
      case 'takeoff': {
        // Leap into the air toward the target
        this.anim.mode = 'takeoff';
        this.anim.t = Math.min(1, this.stateT / 0.8);
        if (this.stateT < 0.05) {
          this.vel.set(dx / Math.max(1, distTarget) * 6, 8.5, dz / Math.max(1, distTarget) * 6);
          this.flying = true;
          hooks.wing(true);
        }
        this.updateFlightPhysics(dt, terrain, this.vel, true);
        if (this.stateT > 1.1) this.enterState('chase');
        break;
      }
      case 'landing': {
        this.anim.mode = 'land';
        this.anim.t = Math.min(1, this.stateT / 1.0);
        const ground = terrain.height(this.pos.x, this.pos.z);
        const targetY = Math.max(ground, 0.2) + this.legHeight;
        // Descend toward the ground
        this.vel.x = damp(this.vel.x, 0, 3, dt);
        this.vel.z = damp(this.vel.z, 0, 3, dt);
        this.vel.y = damp(this.vel.y, (targetY - this.pos.y) * 2.2, 4, dt);
        this.pos.addScaledVector(this.vel, dt);
        this.pos.y = Math.min(this.pos.y, Math.max(ground, 0.2) + 40);
        if (this.pos.y <= targetY + 0.25 && Math.abs(this.vel.y) < 6) {
          // Touchdown
          this.pos.y = targetY;
          this.flying = false;
          this.vel.set(0, 0, 0);
          this.enterState('chase');
          hooks.thud(true);
          tmpA.set(this.pos.x, terrain.height(this.pos.x, this.pos.z) + 0.3, this.pos.z);
          hooks.landingDust(tmpA, def.scale);
        }
        break;
      }
      case 'return': {
        // Fly home
        this.flying = def.canFly;
        if (this.flying) {
          this.anim.mode = 'glide';
          tmpA.set(def.home.x, Math.max(terrain.height(def.home.x, def.home.z), 0) + 30, def.home.z);
          this.steerFlight(dt, tmpA, def.speedFly * 0.8, terrain, false);
        } else {
          this.anim.mode = 'walk';
          this.anim.speed = def.speedGround * 0.7;
          this.target.set(def.home.x, 0, def.home.z);
          this.moveGround(dt, terrain, def.speedGround * 0.7);
        }
        if (distHome < (this.flying ? 14 : 6)) {
          if (this.flying) {
            this.enterState('landing');
          } else {
            this.enterState('idle');
          }
        }
        break;
      }
      case 'windup': {
        this.updateWindup(dt, targetPos, terrain, hooks, distTarget);
        break;
      }
      case 'strike': {
        this.updateStrike(dt, targetPos, terrain, hooks, distTarget);
        break;
      }
      case 'recover': {
        this.anim.mode = this.flying ? 'glide' : 'idle';
        // After fire, ground bosses rest on the floor — a clear opening
        if (this.flying && this.action === 'fire' && !def.canFly) {
          // (flightless creatures never fire from the air — unreachable)
        }
        if (this.attackCd > 0) this.attackCd -= dt;
        if (this.stateT > (this.action === 'fire' ? 2.6 : 1.3)) {
          this.action = 'none';
          this.enterState('chase');
        }
        break;
      }
      case 'hurt': {
        this.anim.mode = 'hurt';
        this.anim.t = Math.min(1, this.stateT / 0.4);
        if (this.flying) this.updateFlightPhysics(dt, terrain, this.vel, false);
        if (this.stateT > 0.4) this.enterState(this.aggro ? 'chase' : 'return');
        break;
      }
      case 'stagger': {
        this.anim.mode = 'hurt';
        this.anim.t = 1 - Math.min(1, this.stateT / 2.2);
        this.model.setEyeGlow(0);
        if (!this.flying) this.faceToward(targetPos.x, targetPos.z, dt, 1);
        if (this.stateT > 2.2) {
          this.model.setEyeGlow(this.phase >= 3 ? 1 : 0.3);
          this.attackCd = 0.4;
          this.enterState('chase');
        }
        break;
      }
      default:
        break;
    }

    // Shared cooldown
    if (this.state !== 'recover' && this.attackCd > 0) this.attackCd -= dt;
    // Stagger decays slowly
    this.staggerMeter = Math.max(0, this.staggerMeter - dt * 6);

    this.applyTransform(dt);
    this.model.update(dt, this.anim);
  }

  // ------------------------------------------------------- attack selection

  private tryPickAttack(targetPos: THREE.Vector3, distTarget: number, hooks: DragonHooks): void {
    if (this.attackCd > 0 || !this.alive || !this.aggro) return;
    const def = this.def;
    // Angle to target relative to facing (tail punishes flanking)
    const toTarget = Math.atan2(targetPos.x - this.pos.x, targetPos.z - this.pos.z);
    let dYaw = toTarget - this.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const behind = Math.abs(dYaw) > 2.1;

    const opts: Array<'bite' | 'claw' | 'tail' | 'fire'> = [];
    for (const a of def.attacks) {
      if (a === 'bite' && distTarget < def.meleeRange * 0.95) opts.push('bite');
      if (a === 'claw' && distTarget < def.meleeRange * 1.15) opts.push('claw');
      if (a === 'tail' && distTarget < def.meleeRange * 1.6 && behind) opts.push('tail');
      if (a === 'fire' && distTarget > 6 && distTarget < def.fireRange) opts.push('fire');
    }
    if (opts.length === 0) return;
    this.action = opts[Math.floor(this.rng() * opts.length)];
    this.enterState('windup');
    if (this.action === 'fire') hooks.roar(false);
  }

  private updateWindup(dt: number, targetPos: THREE.Vector3, terrain: TerrainHeight, hooks: DragonHooks, distTarget: number): void {
    const def = this.def;
    const windupDur = this.action === 'fire' ? 1.25 : this.action === 'tail' ? 0.75 : 0.5;
    this.anim.mode = this.action === 'fire' ? 'fire_windup' : 'idle';
    this.anim.t = Math.min(1, this.stateT / windupDur);
    if (this.action === 'fire') {
      this.model.mouthGlow(this.anim.t);
      // Face the target while charging
      this.faceToward(targetPos.x, targetPos.z, dt, 3.5);
      if (!this.flying) this.moveGround(dt, terrain, 0);
    } else {
      this.faceToward(targetPos.x, targetPos.z, dt, 5);
      if (!this.flying) this.moveGround(dt, terrain, 0);
    }
    if (this.stateT >= windupDur) {
      this.enterState('strike');
      if (this.action === 'fire') {
        hooks.fire();
        this.fireTickT = 0;
      }
    }
    void distTarget;
  }

  private updateStrike(dt: number, targetPos: THREE.Vector3, terrain: TerrainHeight, hooks: DragonHooks, distTarget: number): void {
    const def = this.def;
    switch (this.action) {
      case 'bite': {
        this.anim.mode = 'attack_bite';
        this.anim.t = Math.min(1, this.stateT / 0.55);
        // Lunge forward a bit
        if (!this.flying) {
          this.target.copy(targetPos);
          this.moveGround(dt, terrain, def.speedGround * 1.3);
          this.anim.speed = def.speedGround * 1.3;
        }
        if (!this.hitDone && this.stateT >= 0.24) {
          this.hitDone = true;
          this.meleeHitCheck(targetPos, def.meleeRange * 1.05, 1.35, def.meleeDamage, hooks);
        }
        if (this.stateT > 0.55) this.finishAttack(0.9);
        break;
      }
      case 'claw': {
        this.anim.mode = 'attack_claw';
        this.anim.t = Math.min(1, this.stateT / 0.7);
        if (!this.hitDone && this.stateT >= 0.28) {
          this.hitDone = true;
          this.meleeHitCheck(targetPos, def.meleeRange * 1.2, 1.15, def.meleeDamage * 1.25, hooks);
        }
        if (this.stateT > 0.7) this.finishAttack(1.0);
        break;
      }
      case 'tail': {
        this.anim.mode = 'attack_tail';
        this.anim.t = Math.min(1, this.stateT / 0.9);
        if (!this.hitDone && this.stateT >= 0.34) {
          this.hitDone = true;
          // Tail sweeps around — hits at any angle within reach
          this.meleeHitCheck(targetPos, def.meleeRange * 1.7, Math.PI, def.meleeDamage * 1.4, hooks);
        }
        if (this.stateT > 0.9) this.finishAttack(1.4);
        break;
      }
      case 'fire': {
        this.anim.mode = 'fire_breath';
        const fireDur = def.boss ? 2.6 : 1.8;
        this.anim.t = Math.min(1, this.stateT / fireDur);
        // Emission point + direction (+Z of the group = where the head faces)
        this.model.mouthWorldPos(tmpA);
        this.group.getWorldDirection(tmpB);
        hooks.fireStream(tmpA, tmpB, dt, def.scale);
        this.model.mouthGlow(1);
        // Damage ticks while the target stays inside the cone
        this.fireTickT -= dt;
        if (this.fireTickT <= 0) {
          this.fireTickT = 0.45;
          if (this.inFireCone(targetPos, terrain, def.fireRange)) {
            hooks.onFireDamage?.(this, def.fireDps * 0.45);
          }
        }
        // Slight head tracking while breathing
        this.faceToward(targetPos.x, targetPos.z, dt, 1.6);
        if (this.stateT > fireDur) {
          this.model.mouthGlow(0);
          this.finishAttack(def.boss ? 2.4 : 3.2);
        }
        break;
      }
      default:
        this.enterState('chase');
        break;
    }
    void distTarget;
  }

  private finishAttack(cd: number): void {
    this.attackCd = cd * (this.phase >= 3 ? 0.6 : this.phase === 2 ? 0.8 : 1);
    this.enterState('recover');
  }

  /** Melee hit resolution — calls back into the manager's damage hook. */
  private meleeHitCheck(targetPos: THREE.Vector3, reach: number, arc: number, dmg: number, hooks: DragonHooks): void {
    const dx = targetPos.x - this.pos.x;
    const dz = targetPos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > reach + 0.6) return;
    if (Math.abs(targetPos.y - this.pos.y) > 4.5) return;
    if (arc < Math.PI) {
      const toTarget = Math.atan2(dx, dz);
      let dYaw = toTarget - this.yaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      if (Math.abs(dYaw) > arc / 2) return;
    }
    hooks.onMelee?.(this, dmg);
  }

  // ---------------------------------------------------------------- flight

  private updateFlyingChase(dt: number, targetPos: THREE.Vector3, terrain: TerrainHeight, hooks: DragonHooks, distTarget: number): void {
    const def = this.def;
    const enraged = this.phase >= 3;
    const speed = def.speedFly * (enraged ? 1.3 : 1);
    // Fire when aligned & in range
    if (this.attackCd <= 0 && distTarget < def.fireRange * 1.05) {
      const facing = tmpA.set(targetPos.x - this.pos.x, 0, targetPos.z - this.pos.z).normalize();
      const fwd = tmpB.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      if (facing.dot(fwd) > 0.8 && Math.abs(targetPos.y - this.pos.y) < 16) {
        this.action = 'fire';
        this.enterState('windup');
        return;
      }
    }
    // Give melee players a fighting chance: land periodically when the
    // ground below is dry land (never over open water / the sea wyvern).
    const groundBelow = terrain.height(this.pos.x, this.pos.z);
    const landChance = this.phase === 2 ? 0.5 : enraged ? 0.1 : 0.22;
    if (
      def.id !== 'skarnvind' && groundBelow > 0.5 &&
      distTarget < def.meleeRange * 3 && this.rng() < dt * landChance
    ) {
      this.enterState('landing');
      return;
    }
    if (this.attackCd <= 0) {
      // Attack run: dive straight at the target so the breath connects —
      // a pure orbit never faces it (tangent vs radius).
      const tgtGround = Math.max(terrain.height(targetPos.x, targetPos.z), 0);
      // Fase 12 — dive height scales with the body so the breath connects
      // without the chest going through the hillside.
      const diveAlt = def.id === 'skarnvind' ? 9 : Math.max(16, this.legHeight * 1.35);
      tmpA.set(targetPos.x, tgtGround + diveAlt, targetPos.z);
      this.anim.mode = 'glide';
      this.anim.turn = 0;
      this.steerFlight(dt, tmpA, speed, terrain, true);
    } else {
      // Orbit at attack altitude while the breath recharges
      // Fase 9 — the orbit widens with the giant body so the wings read
      // clearly instead of scraping the target.
      const orbitR = 62 * (def.boss ? 1.4 : 1);
      const spin = this.rng() < 0.5 ? 1 : -1;
      this.patrolAngle += dt * spin * (enraged ? 0.55 : 0.4);
      // Fase 9 — giant dragons need more sky: altitude bands doubled so the
      // wings never scrape the terrain while orbiting.
      const altBand = def.id === 'skarnvind' ? 26 : this.phase >= 2 ? 30 : 46;
      const desiredAlt = Math.max(terrain.height(this.pos.x, this.pos.z), 0) + altBand;
      tmpA.set(
        targetPos.x + Math.cos(this.patrolAngle) * orbitR,
        Math.max(desiredAlt, targetPos.y + 26),
        targetPos.z + Math.sin(this.patrolAngle) * orbitR,
      );
      this.anim.mode = 'glide';
      this.anim.turn = spin;
      this.steerFlight(dt, tmpA, speed, terrain, true);
    }
    // Flap bursts
    this.wingT -= dt;
    if (this.wingT <= 0) {
      this.wingT = 1.6 + this.rng() * 1.6;
      hooks.wing(def.boss);
      this.anim.mode = 'fly';
    }
  }

  /** Steering flight toward a world point with terrain avoidance. */
  private steerFlight(dt: number, to: THREE.Vector3, speed: number, terrain: TerrainHeight, hunt: boolean): void {
    tmpC.copy(to).sub(this.pos);
    const dist = tmpC.length();
    if (dist > 0.001) tmpC.multiplyScalar(1 / dist);
    const desired = tmpA.copy(tmpC).multiplyScalar(speed);
    // Terrain avoidance: push up when the ground rises near the flight path
    // Fase 12 — the lookahead margin scales with the body (giants need runway)
    const ahead = terrain.height(this.pos.x + tmpC.x * 14, this.pos.z + tmpC.z * 14);
    const clearance = Math.max(9, this.legHeight * 0.85 + 5);
    if (this.pos.y < ahead + clearance) desired.y = Math.max(desired.y, 10 + clearance * 0.35);
    // Gentle gravity bias when gliding
    if (!hunt) desired.y -= 3;
    this.vel.x = damp(this.vel.x, desired.x, 1.6, dt);
    this.vel.y = damp(this.vel.y, desired.y, 2.2, dt);
    this.vel.z = damp(this.vel.z, desired.z, 1.6, dt);
    this.updateFlightPhysics(dt, terrain, this.vel, true);
  }

  private updateFlightPhysics(dt: number, terrain: TerrainHeight, vel: THREE.Vector3, orient: boolean): void {
    this.pos.addScaledVector(vel, dt);
    const ground = Math.max(terrain.height(this.pos.x, this.pos.z), -1);
    // Fase 12 — clearance scales with the BODY: the hips ride legHeight above
    // ground when standing, so flying at ground+3.5 buried the belly and legs
    // into hillsides (the "broken dragons"). Keep at least 85% of the leg
    // column clear while airborne.
    const minY = ground + Math.max(3.5, this.legHeight * 0.85);
    if (this.pos.y < minY) {
      this.pos.y = minY;
      if (vel.y < 0) vel.y *= -0.25;
    }
    const maxY = ground + 85;
    if (this.pos.y > maxY) {
      this.pos.y = maxY;
      if (vel.y > 0) vel.y = 0;
    }
    if (orient) {
      const hs = Math.hypot(vel.x, vel.z);
      if (hs > 0.5) {
        const want = Math.atan2(vel.x, vel.z);
        const prev = this.yaw;
        this.yaw = dampAngle(this.yaw, want, 3.2, dt);
        let dY = this.yaw - prev;
        while (dY > Math.PI) dY -= Math.PI * 2;
        while (dY < -Math.PI) dY += Math.PI * 2;
        // Bank into turns
        this.group.rotation.z = damp(this.group.rotation.z, clamp(-dY * 26, -0.55, 0.55), 4, dt);
      }
      // Pitch follows vertical motion
      const pitch = clamp(-Math.atan2(vel.y, Math.max(2, hs)) * 0.7, -0.7, 0.7);
      this.group.rotation.x = damp(this.group.rotation.x, pitch, 3, dt);
    }
  }

  // ---------------------------------------------------------------- ground

  private moveGround(dt: number, terrain: TerrainHeight, speed: number): void {
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.4) {
      this.pos.x += (dx / d) * speed * dt;
      this.pos.z += (dz / d) * speed * dt;
      this.faceToward(this.target.x, this.target.z, dt, 7);
      this.anim.speed = speed;
      // Heavy steps
      if (this.def.boss) {
        this.stepT -= dt * speed;
        if (this.stepT <= 0) {
          this.stepT = 2.2;
          this.stepHooks?.();
        }
      }
    } else {
      this.anim.speed = 0;
    }
    const ground = terrain.height(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, ground + this.legHeight, 12, dt);
  }

  private stepHooks?: () => void;
  /** Assign the heavy footstep sound/dust callback (manager). */
  setStepHook(fn: () => void): void {
    this.stepHooks = fn;
  }

  // ---------------------------------------------------------------- death

  private updateDeath(dt: number, terrain: TerrainHeight, hooks: DragonHooks): void {
    if (this.state === 'die') {
      this.anim.mode = 'die';
      this.anim.t = Math.min(1, this.stateT / 2.8);
      if (this.flying) {
        // Fall out of the sky
        this.vel.y -= 12 * dt;
        this.updateFlightPhysics(dt, terrain, this.vel, false);
        const ground = terrain.height(this.pos.x, this.pos.z);
        if (this.pos.y <= Math.max(ground, 0.4) + this.legHeight) {
          this.pos.y = Math.max(ground, 0.4) + this.legHeight;
          this.flying = false;
          this.vel.set(0, 0, 0);
          hooks.thud(true);
          tmpA.set(this.pos.x, Math.max(ground, 0) + 0.3, this.pos.z);
          hooks.landingDust(tmpA, this.def.scale * 1.4);
        }
      }
      if (this.stateT > 2.8) {
        this.state = 'dead';
        this.stateT = 0;
        this.model.mouthGlow(0);
        hooks.onDeath(this);
      }
    } else {
      this.anim.mode = 'dead';
      this.anim.t = 1;
    }
  }

  private terrainRef: TerrainHeight | null = null;

  // ---------------------------------------------------------------- output

  private applyTransform(dt: number): void {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (!this.flying) {
      this.group.rotation.z = damp(this.group.rotation.z, 0, 6, dt);
      this.group.rotation.x = damp(this.group.rotation.x, 0, 6, dt);
    }
  }

  /** Hit spheres for player weapons: body + head (headshot bonus). */
  getHitSpheres(): Array<{ center: THREE.Vector3; radius: number; head: boolean }> {
    this.model.bodyWorldPos(tmpA);
    this.model.headWorldPos(tmpB);
    return [
      { center: tmpA.clone(), radius: this.bodyRadius, head: false },
      { center: tmpB.clone(), radius: this.headRadius, head: true },
    ];
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.model.dispose();
  }
}
