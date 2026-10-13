import * as THREE from 'three';
import { damp, dampAngle, clamp } from '../core/MathUtils';
import type { WaterSystem } from '../world/WaterSystem';

/**
 * Fase 15 — SEA SERPENT ("Serpe de la Marea" / "El Rey del Mar").
 *
 * A procedural serpent: the head is driven by the AI and every body segment
 * follows the path HISTORY of the head (breadcrumb trail), so the whole
 * body carves organic curves through the water. Dorsal fins, an animated
 * jaw and (for the King) a gold crown + bioluminescent dots.
 */

// ---- Shared materials & geometries (every serpent reuses them) ----
const MAT_COMMON = {
  body: new THREE.MeshStandardMaterial({ color: 0x23434a, roughness: 0.72, metalness: 0.08 }),
  belly: new THREE.MeshStandardMaterial({ color: 0x8fa89a, roughness: 0.8, metalness: 0.02 }),
  fin: new THREE.MeshStandardMaterial({ color: 0x17323a, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide }),
  eye: new THREE.MeshStandardMaterial({ color: 0x0a1416, emissive: 0x9fe8ff, emissiveIntensity: 2.1, roughness: 0.4 }),
};
const MAT_KING = {
  body: new THREE.MeshStandardMaterial({ color: 0x1c2f4a, roughness: 0.55, metalness: 0.25 }),
  belly: new THREE.MeshStandardMaterial({ color: 0xb8c4d4, roughness: 0.7, metalness: 0.05 }),
  fin: new THREE.MeshStandardMaterial({ color: 0x14263d, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide }),
  eye: new THREE.MeshStandardMaterial({ color: 0x140f06, emissive: 0xffc040, emissiveIntensity: 2.6, roughness: 0.4 }),
  crown: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.32, metalness: 0.85 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x0a1a20, emissive: 0x35d8c0, emissiveIntensity: 1.4, roughness: 0.5 }),
};

const GEO = {
  // one ellipsoid reused for every segment, scaled per segment
  seg: new THREE.SphereGeometry(1, 10, 8),
  fin: new THREE.ConeGeometry(0.55, 1.5, 5),
  fluke: new THREE.ConeGeometry(0.85, 1.6, 6),
  eye: new THREE.SphereGeometry(0.16, 7, 6),
  tooth: new THREE.ConeGeometry(0.05, 0.22, 4),
  crownSpike: new THREE.ConeGeometry(0.16, 0.85, 5),
  glowDot: new THREE.SphereGeometry(0.09, 6, 5),
};

/** What the serpent needs from the world to think and bite. */
export interface SerpentContext {
  /** The ship it hunts (null = no target: idle lurk). */
  ship: {
    pos: THREE.Vector3;
    heading: number;
    speed: number;
    length: number;
  } | null;
  water: WaterSystem;
  /** Hull damage + effects. */
  hullDamage: (dmg: number, at: THREE.Vector3) => void;
  playerDamage: (dmg: number, fromX: number, fromZ: number, reason: string) => number;
  splash: (pos: THREE.Vector3, strength: number) => void;
  ink: (pos: THREE.Vector3, strength: number) => void;
  sound: (kind: 'splash' | 'hit_hull' | 'roar_big' | 'thud' | 'sink' | 'creak') => void;
  shake: (intensity: number) => void;
  /** Fase 15 — leave a wake ring on the water surface. */
  wake: (x: number, z: number, force: number, radius: number, decay: number) => void;
}

export type SerpentState =
  | 'emerge' | 'lurk' | 'circle' | 'dive' | 'rush'
  | 'gnaw' | 'retreat' | 'flee' | 'sink' | 'gone';

export class SeaSerpent {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  hp: number;
  readonly maxHp: number;
  readonly isKing: boolean;
  readonly name: string;
  state: SerpentState = 'emerge';
  stateT = 0;
  alive = true;
  /** Phase (King only): 1, 2, 3. */
  phase = 1;
  /** Callback when the king enters phase 2 (spawns adds). */
  onKingPhase2?: (king: SeaSerpent) => void;

  // --- body parts ---
  private headG = new THREE.Group();
  private jawTop!: THREE.Mesh;
  private jawBottom = new THREE.Group();
  private segMeshes: THREE.Mesh[] = [];
  private segRadius: number[] = [];
  private eyeL!: THREE.Mesh;
  private eyeR!: THREE.Mesh;
  private jawOpen = 0;

  // --- trail following ---
  private trail: Array<{ x: number; y: number; z: number }> = [];
  private trailLen = 0;
  private readonly segSpacing: number;
  private readonly segCount: number;
  private readonly scale: number;

  // --- temp ---
  private tmpB = new THREE.Vector3();
  private t = 0;
  private wavePhase = Math.random() * Math.PI * 2;
  private bobPhase = Math.random() * Math.PI * 2;
  private lurkAngle: number;
  private attackCycles = 0;

  constructor(opts: {
    x: number; z: number;
    king?: boolean;
    hp?: number;
    scale?: number;
    facing?: number;
  }) {
    this.isKing = !!opts.king;
    this.scale = opts.scale ?? (this.isKing ? 3.0 : 0.95 + Math.random() * 0.25);
    this.maxHp = opts.hp ?? (this.isKing ? 1400 : 150 + Math.round(Math.random() * 40));
    this.hp = this.maxHp;
    this.name = this.isKing ? 'The King of the Sea' : 'Tide Serpent';
    this.segCount = this.isKing ? 13 : 8;
    this.segSpacing = 1.85 * this.scale;
    this.lurkAngle = Math.random() * Math.PI * 2;
    this.yaw = opts.facing ?? Math.random() * Math.PI * 2;
    this.pos.set(opts.x, this.isKing ? -34 : -9, opts.z);
    this.build();
    this.group.add(this.headG);
    // Seed the trail straight behind so the body starts stretched out
    for (let i = 0; i < 60; i++) {
      this.trail.push({
        x: opts.x - Math.sin(this.yaw) * i * 0.9,
        y: this.pos.y,
        z: opts.z - Math.cos(this.yaw) * i * 0.9,
      });
    }
    this.syncBody(0);
    this.group.visible = false; // hidden until it emerges
  }

  // ------------------------------------------------------------------ model

  private build(): void {
    const M = this.isKing ? MAT_KING : MAT_COMMON;
    const s = this.scale;
    const cast = this.isKing; // only the giant pays the shadow cost

    // --- Head: skull dome + snout + jaws + eyes + crest ---
    const skull = new THREE.Mesh(GEO.seg, M.body);
    skull.scale.set(0.95 * s, 0.85 * s, 1.25 * s);
    skull.castShadow = cast;
    this.headG.add(skull);
    const brow = new THREE.Mesh(GEO.seg, M.body);
    brow.scale.set(0.8 * s, 0.55 * s, 0.8 * s);
    brow.position.set(0, 0.42 * s, -0.3 * s);
    this.headG.add(brow);

    // Upper jaw (fixed wedge)
    this.jawTop = new THREE.Mesh(GEO.seg, M.body);
    this.jawTop.scale.set(0.6 * s, 0.3 * s, 1.5 * s);
    this.jawTop.position.set(0, -0.12 * s, 1.05 * s);
    this.headG.add(this.jawTop);

    // Lower jaw (pivots at the back of the mouth)
    this.jawBottom.position.set(0, -0.24 * s, 0.15 * s);
    const lower = new THREE.Mesh(GEO.seg, M.body);
    lower.scale.set(0.52 * s, 0.2 * s, 1.45 * s);
    lower.position.set(0, -0.05 * s, 1.0 * s);
    this.jawBottom.add(lower);
    this.headG.add(this.jawBottom);

    // Teeth on both jaws
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const up = new THREE.Mesh(GEO.tooth, M.belly);
        up.position.set(side * 0.34 * s, -0.16 * s, (0.5 + i * 0.34) * s);
        up.rotation.x = Math.PI;
        up.scale.setScalar(s);
        this.jawTop.add(up);
        const dn = new THREE.Mesh(GEO.tooth, M.belly);
        dn.position.set(side * 0.3 * s, 0.02 * s, (0.55 + i * 0.34) * s);
        dn.scale.setScalar(s);
        this.jawBottom.add(dn);
      }
    }

    // Eyes
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(GEO.eye, M.eye);
      eye.position.set(side * 0.6 * s, 0.28 * s, 0.55 * s);
      eye.scale.setScalar(s * 1.15);
      this.headG.add(eye);
      if (side < 0) this.eyeL = eye; else this.eyeR = eye;
    }

    // Head crest fins (crown of spikes for the King)
    if (this.isKing) {
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(GEO.crownSpike, MAT_KING.crown);
        const a = (i / 4 - 0.5) * 1.5;
        spike.position.set(0, 0.62 * s, (-0.55 + i * 0.34) * s);
        spike.rotation.x = -0.35 - i * 0.06;
        spike.scale.setScalar(s * (i === 2 ? 1.5 : 1));
        this.headG.add(spike);
      }
      // Whisker-like glow dots
      for (const side of [-1, 1]) {
        const dot = new THREE.Mesh(GEO.glowDot, MAT_KING.glow);
        dot.position.set(side * 0.75 * s, -0.1 * s, 1.5 * s);
        dot.scale.setScalar(s * 1.6);
        this.headG.add(dot);
      }
    } else {
      const crest = new THREE.Mesh(GEO.fin, M.fin);
      crest.position.set(0, 0.68 * s, -0.15 * s);
      crest.rotation.x = -0.28;
      crest.scale.set(0.5 * s, 0.75 * s, 0.5 * s);
      this.headG.add(crest);
      // side whiskers
      for (const side of [-1, 1]) {
        const whisk = new THREE.Mesh(GEO.fin, M.fin);
        whisk.position.set(side * 0.8 * s, -0.05 * s, 0.9 * s);
        whisk.rotation.z = side * 1.35;
        whisk.scale.set(0.4 * s, 0.8 * s, 0.4 * s);
        this.headG.add(whisk);
      }
    }

    // --- Body segments + dorsal fins ---
    for (let i = 0; i < this.segCount; i++) {
      const k = i / (this.segCount - 1);
      const r = (1 - k * 0.82) * (this.isKing ? 1.05 : 0.92) * s;
      const seg = new THREE.Mesh(GEO.seg, M.body);
      seg.scale.set(r, r * 0.9, r * 1.35);
      seg.castShadow = cast;
      this.segMeshes.push(seg);
      this.segRadius.push(r);
      this.group.add(seg);
      // pale belly plate
      const belly = new THREE.Mesh(GEO.seg, M.belly);
      belly.scale.set(r * 0.82, r * 0.5, r * 1.05);
      belly.position.y = -r * 0.55;
      seg.add(belly);
      // dorsal fin every other segment
      if (i % 2 === 1 && i < this.segCount - 2) {
        const fin = new THREE.Mesh(GEO.fin, M.fin);
        fin.position.y = r * 0.95;
        fin.rotation.x = -0.22;
        fin.scale.set(r * 0.7, r * 1.7, r * 0.35);
        seg.add(fin);
      }
      // King: bioluminescent flank dots
      if (this.isKing && i % 2 === 0) {
        for (const side of [-1, 1]) {
          const dot = new THREE.Mesh(GEO.glowDot, MAT_KING.glow);
          dot.position.set(side * r * 0.85, 0, 0);
          dot.scale.setScalar(s * 1.3);
          seg.add(dot);
        }
      }
    }

    // --- Tail fluke (two flattened cones) ---
    const fluke = new THREE.Group();
    for (const side of [-1, 1]) {
      const f = new THREE.Mesh(GEO.fluke, M.fin);
      f.scale.set(0.5, 1.15, 0.22);
      f.position.x = side * 0.42 * s;
      f.rotation.z = side * 0.85;
      f.scale.multiplyScalar(s);
      fluke.add(f);
    }
    this.group.add(fluke);
    this.segMeshes.push(fluke as unknown as THREE.Mesh);
    this.segRadius.push(0.5 * s);
  }

  // ------------------------------------------------------------------ state

  get hpFrac(): number {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  /** Near the surface (cannonballs can reach)? */
  get surfaced(): boolean {
    return this.pos.y > -2.6 && this.alive;
  }

  /** Reusable hit-sphere centers (no per-frame allocation). */
  private hitPool: THREE.Vector3[] = Array.from({ length: 6 }, () => new THREE.Vector3());

  /** Head + first segments as hit spheres (cannonball tests).
   *  NOTE: the returned centers are SCRATCH vectors — consume immediately. */
  getHitSpheres(out: Array<{ center: THREE.Vector3; radius: number }>): void {
    if (!this.surfaced) {
      out.length = 0;
      return;
    }
    out.length = 0;
    out.push({ center: this.hitPool[0].copy(this.pos), radius: 1.25 * this.scale });
    for (let i = 0; i < Math.min(4, this.segMeshes.length); i++) {
      const m = this.segMeshes[i];
      out.push({ center: this.hitPool[i + 1].copy(m.position), radius: this.segRadius[i] * 1.25 });
    }
  }

  headWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.pos);
  }

  /** Kill from damage (not from despawn). */
  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'sink';
    this.stateT = 0;
    this.speed = Math.max(this.speed, 2);
  }

  /** Disengage without a fight (player left / died). */
  disengage(): void {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'flee';
    this.stateT = 0;
    this.hp = this.isKing ? this.maxHp : this.hp; // the King heals when you flee
  }

  // ------------------------------------------------------------------ think

  update(dt: number, ctx: SerpentContext): void {
    if (this.state === 'gone') return;
    this.t += dt;
    this.stateT += dt;
    const ship = ctx.ship;

    // King phase transitions
    if (this.isKing && this.alive) {
      if (this.phase === 1 && this.hpFrac <= 0.66) {
        this.phase = 2;
        this.onKingPhase2?.(this);
      } else if (this.phase === 2 && this.hpFrac <= 0.33) {
        this.phase = 3;
      }
    }

    switch (this.state) {
      case 'emerge': this.stEmerge(dt, ctx); break;
      case 'lurk': this.stLurk(dt, ctx); break;
      case 'circle': this.stCircle(dt, ctx); break;
      case 'dive': this.stDive(dt, ctx); break;
      case 'rush': this.stRush(dt, ctx); break;
      case 'gnaw': this.stGnaw(dt, ctx); break;
      case 'retreat': this.stRetreat(dt, ctx); break;
      case 'flee': this.stFlee(dt, ctx); break;
      case 'sink': this.stSink(dt, ctx); break;
    }

    // --- integrate head ---
    if (this.state !== 'gnaw') {
      this.pos.x += Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    }

    // --- vertical target by state ---
    let targetY: number;
    switch (this.state) {
      case 'emerge':
        targetY = ctx.water.waveHeightAt(this.pos.x, this.pos.z) - 0.5 * this.scale;
        break;
      case 'lurk': targetY = -5.5; break;
      case 'circle': case 'rush': case 'retreat':
        targetY = ctx.water.waveHeightAt(this.pos.x, this.pos.z) - 0.5 * this.scale;
        break;
      case 'gnaw':
        targetY = ctx.water.waveHeightAt(this.pos.x, this.pos.z) - 0.15 * this.scale;
        break;
      case 'dive': targetY = -9 - this.scale * 2; break;
      default: targetY = -12 - this.scale * 3;
    }
    const bob = Math.sin(this.t * 1.25 + this.bobPhase) * 0.22 * this.scale;
    this.pos.y = damp(this.pos.y, targetY + bob, this.state === 'emerge' ? 1.6 : 2.6, dt);

    // --- record trail & animate the body ---
    this.pushTrail();
    this.syncBody(dt);

    // --- visibility: deep = hidden (the sea hides it for free) ---
    const visible = this.pos.y > -3.2 - this.scale * 0.4;
    this.group.visible = visible;
    if (visible) {
      this.group.position.set(0, 0, 0); // children are in world space
    }

    // --- surface effects: foam + wake while swimming on top ---
    if (visible && this.speed > 2.5 && Math.random() < dt * 6) {
      const w = ctx.water.waveHeightAt(this.pos.x, this.pos.z);
      this.tmpB.set(this.pos.x, w + 0.1, this.pos.z);
      ctx.splash(this.tmpB, 0.16 * this.scale);
      ctx.wake(this.pos.x, this.pos.z, 0.3 * this.scale, 8 * this.scale, 4 * this.scale);
    }

    // --- jaw animation ---
    const wantJaw =
      this.state === 'gnaw' || this.state === 'rush' || (this.isKing && this.state === 'emerge')
        ? 1 : this.state === 'circle' ? 0.25 + Math.sin(this.t * 2.2) * 0.15 : 0;
    this.jawOpen = damp(this.jawOpen, wantJaw, 6, dt);
    this.jawBottom.rotation.x = this.jawOpen * 0.62;
  }

  // ================================================================ states

  private stEmerge(dt: number, ctx: SerpentContext): void {
    // Rising from the deep: full speed up, forward crawl
    this.speed = damp(this.speed, 3.5 * this.scale, 1.2, dt);
    if (this.stateT > 0.25 && Math.random() < dt * 9) {
      ctx.splash(this.tmpB.copy(this.pos).setY(0.2), 0.5 * this.scale);
      ctx.wake(this.pos.x, this.pos.z, 0.8 * this.scale, 14 * this.scale, 6 * this.scale);
    }
    if (this.pos.y > ctx.water.waveHeightAt(this.pos.x, this.pos.z) - 1.2 * this.scale) {
      // BREACH!
      ctx.splash(this.tmpB.copy(this.pos).setY(0.4), 1.6 * this.scale);
      ctx.wake(this.pos.x, this.pos.z, 1.4 * this.scale, 26 * this.scale, 9 * this.scale);
      ctx.sound(this.isKing ? 'roar_big' : 'splash');
      ctx.shake(this.isKing ? 0.9 : 0.35);
      this.state = 'circle';
      this.stateT = 0;
      this.attackCycles = 0;
    }
  }

  private stLurk(dt: number, ctx: SerpentContext): void {
    // Submerged watching: slow orbit around the ship
    this.speed = damp(this.speed, 2.2, 1.5, dt);
    if (ctx.ship) {
      this.lurkAngle += dt * 0.25;
      const r = 46;
      const tx = ctx.ship.pos.x + Math.cos(this.lurkAngle) * r;
      const tz = ctx.ship.pos.z + Math.sin(this.lurkAngle) * r;
      this.faceToward(tx, tz, dt, 1.4);
    }
    if (this.stateT > (this.isKing ? 4 : 7 + Math.random() * 6)) {
      this.state = 'circle';
      this.stateT = 0;
    }
  }

  private stCircle(dt: number, ctx: SerpentContext): void {
    // The broadside window: surface swim around the target
    const spd = (this.isKing ? 6.5 : 5.2) * (this.phase === 3 ? 1.25 : 1);
    this.speed = damp(this.speed, spd, 1.6, dt);
    if (ctx.ship) {
      this.lurkAngle += dt * (this.isKing ? 0.34 : 0.42) * (this.phase === 3 ? 1.3 : 1);
      const r = this.isKing ? 40 : 32;
      const tx = ctx.ship.pos.x + Math.cos(this.lurkAngle) * r;
      const tz = ctx.ship.pos.z + Math.sin(this.lurkAngle) * r;
      this.faceToward(tx, tz, dt, 2.2);
    }
    const circleTime = this.isKing ? (this.phase === 3 ? 5 : 7) : 9 + Math.random() * 5;
    if (this.stateT > circleTime) {
      this.state = this.attackCycles >= 3 && !this.isKing ? 'retreat' : 'dive';
      this.stateT = 0;
    }
  }

  private stDive(dt: number, ctx: SerpentContext): void {
    // Slip under: brief vanish, then line up the charge
    this.speed = damp(this.speed, 4.5, 1.4, dt);
    if (ctx.ship) this.faceToward(ctx.ship.pos.x, ctx.ship.pos.z, dt, 1.1);
    if (Math.random() < dt * 4) {
      ctx.wake(this.pos.x, this.pos.z, 0.25 * this.scale, 9 * this.scale, 5 * this.scale);
    }
    if (this.stateT > (this.isKing && this.phase === 3 ? 2.0 : 2.6)) {
      this.state = 'rush';
      this.stateT = 0;
      if (this.isKing) ctx.sound('roar_big');
    }
  }

  private stRush(dt: number, ctx: SerpentContext): void {
    // The charge: aim slightly ahead of the ship
    const ship = ctx.ship;
    if (!ship) {
      this.state = 'circle';
      this.stateT = 0;
      return;
    }
    const lead = clamp(ship.speed * 0.6, -3, 6);
    const tx = ship.pos.x + Math.sin(ship.heading) * lead;
    const tz = ship.pos.z + Math.cos(ship.heading) * lead;
    this.faceToward(tx, tz, dt, this.isKing ? 2.0 : 2.6);
    const rushSpd = (this.isKing ? 15.5 : 13) * (this.phase === 3 ? 1.18 : 1);
    this.speed = damp(this.speed, rushSpd, 2.4, dt);
    // foam line while charging
    if (Math.random() < dt * 14) {
      ctx.wake(this.pos.x, this.pos.z, 0.5 * this.scale, 11 * this.scale, 5 * this.scale);
      if (this.pos.y > -1.5) ctx.splash(this.tmpB.copy(this.pos).setY(0.2), 0.3 * this.scale);
    }
    // Impact?
    const dist = Math.hypot(ship.pos.x - this.pos.x, ship.pos.z - this.pos.z);
    if (dist < 4.5 + this.scale * 1.6) {
      // RAM: hull takes the blow, the deck feels it
      const base = this.isKing ? (this.phase === 3 ? 30 : 22) : 8 + Math.random() * 4;
      const hullDmg = Math.round(base);
      ctx.hullDamage(hullDmg, this.pos);
      const playerDmg = this.isKing ? 8 : 4;
      ctx.playerDamage(playerDmg, this.pos.x, this.pos.z, 'serpe');
      ctx.splash(this.tmpB.copy(ship.pos).setY(0.6), 1.4);
      ctx.wake(ship.pos.x, ship.pos.z, 1.2, 20, 8);
      ctx.sound('thud');
      ctx.shake(this.isKing ? 1.0 : 0.55);
      this.attackCycles++;
      this.state = 'gnaw';
      this.stateT = 0;
      this.gnawTicks = 0;
      this.speed *= 0.25;
    } else if (this.stateT > 6.5) {
      // missed (or the ship fled): re-circle
      this.state = 'circle';
      this.stateT = 0;
      this.attackCycles++;
    }
  }

  private gnawTicks = 0;
  private gnawTickT = 0;

  private stGnaw(dt: number, ctx: SerpentContext): void {
    // Latched to the hull: bite ticks, then let go
    this.speed = damp(this.speed, 0.6, 2, dt);
    const ship = ctx.ship;
    if (ship) {
      this.faceToward(ship.pos.x, ship.pos.z, dt, 3);
      // stay glued near the impact point
      const d = Math.hypot(ship.pos.x - this.pos.x, ship.pos.z - this.pos.z);
      if (d > 7 + this.scale) {
        this.pos.x += (ship.pos.x - this.pos.x) * dt * 1.5;
        this.pos.z += (ship.pos.z - this.pos.z) * dt * 1.5;
      }
    }
    this.gnawTickT += dt;
    if (this.gnawTickT > 0.8) {
      this.gnawTickT = 0;
      this.gnawTicks++;
      const dmg = this.isKing ? 6 : 3;
      ctx.hullDamage(dmg, this.pos);
      ctx.sound('hit_hull');
      ctx.ink(this.tmpB.copy(this.pos).setY(this.pos.y + this.scale), 0.6);
      if (this.gnawTicks >= (this.isKing ? 3 : 2)) {
        this.state = 'dive';
        this.stateT = 0;
        this.speed = 7;
      }
    }
  }

  private stRetreat(dt: number, ctx: SerpentContext): void {
    // Common beasts: back off and watch for a while
    this.speed = damp(this.speed, 6, 1.5, dt);
    if (ctx.ship) {
      const dx = this.pos.x - ctx.ship.pos.x;
      const dz = this.pos.z - ctx.ship.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.faceToward(this.pos.x + dx / d * 10, this.pos.z + dz / d * 10, dt, 2);
    }
    if (this.stateT > 3.4) {
      this.state = 'lurk';
      this.stateT = 0;
      this.attackCycles = 0;
    }
  }

  private stFlee(dt: number, ctx: SerpentContext): void {
    // Deep exit: dive and swim away (despawn handled by the system)
    this.speed = damp(this.speed, 8, 1.4, dt);
    if (this.stateT > 1.2 && Math.random() < dt * 3) {
      ctx.wake(this.pos.x, this.pos.z, 0.3 * this.scale, 10 * this.scale, 5 * this.scale);
    }
  }

  private stSink(dt: number, ctx: SerpentContext): void {
    // Death: roll over, bubble foam, sink with the current
    this.speed = damp(this.speed, 1.4, 1.2, dt);
    this.yaw += dt * 0.3;
    if (Math.random() < dt * 8) {
      ctx.ink(this.tmpB.copy(this.pos).setY(Math.max(this.pos.y, 0.2)), 0.8);
      ctx.splash(this.tmpB.copy(this.pos).setY(0.25), 0.35 * this.scale);
    }
  }

  // -------------------------------------------------------------- internals

  private faceToward(tx: number, tz: number, dt: number, rate: number): void {
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    this.yaw = dampAngle(this.yaw, want, rate, dt);
    // gentle serpentine wiggle while cruising (the body carves S-curves)
    if (this.state === 'circle' || this.state === 'lurk') {
      this.yaw += Math.sin(this.t * 1.7 + this.wavePhase) * 0.006;
    }
  }

  private pushTrail(): void {
    const head = this.trail[0];
    if (!head) {
      this.trail.unshift({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
      return;
    }
    const d = Math.hypot(this.pos.x - head.x, this.pos.z - head.z);
    if (d > 0.55) {
      this.trail.unshift({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
      this.trailLen += d;
      if (this.trail.length > 130) this.trail.pop();
    } else if (Math.abs(this.pos.y - head.y) > 0.4) {
      // vertical-only movement still refreshes depth
      this.trail[0] = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    }
  }

  /** Place every segment along the trail at its arc-length offset. */
  private syncBody(dt: number): void {
    // head transform (world space)
    this.headG.position.copy(this.pos);
    const ahead = this.trail[1] ?? this.trail[0];
    let pitch = 0;
    if (ahead) {
      const dy = this.pos.y - ahead.y;
      const dh = Math.hypot(this.pos.x - ahead.x, this.pos.z - ahead.z) || 0.01;
      pitch = clamp(Math.atan2(dy, dh), -0.9, 0.9);
    }
    this.headG.rotation.set(pitch, this.yaw, 0);
    // the head aims along +Z: rotate the model cone offset
    this.headG.rotation.order = 'YXZ';

    // segments along the trail
    let trailIdx = 0;
    let acc = 0;
    const target = this.segSpacing;
    for (let i = 0; i < this.segMeshes.length; i++) {
      const want = target * (i + 1);
      // advance along the trail until we pass 'want'
      while (trailIdx < this.trail.length - 1) {
        const a = this.trail[trailIdx];
        const b = this.trail[trailIdx + 1];
        const segLen = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) || 0.001;
        if (acc + segLen >= want) break;
        acc += segLen;
        trailIdx++;
      }
      const a = this.trail[Math.min(trailIdx, this.trail.length - 1)];
      const b = this.trail[Math.min(trailIdx + 1, this.trail.length - 1)];
      const segLen = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) || 0.001;
      const k = clamp((want - acc) / segLen, 0, 1);
      const m = this.segMeshes[i];
      m.position.set(
        a.x + (b.x - a.x) * k,
        a.y + (b.y - a.y) * k,
        a.z + (b.z - a.z) * k,
      );
      const segYaw = Math.atan2(a.x - b.x, a.z - b.z);
      const segPitch = Math.atan2(a.y - b.y, Math.hypot(a.x - b.x, a.z - b.z));
      m.rotation.set(segPitch, segYaw, 0);
      m.rotation.order = 'YXZ';
      if (i === this.segMeshes.length - 1) {
        // tail fluke sways
        m.rotation.z = Math.sin(this.t * 3.1 + this.wavePhase) * 0.4;
      }
    }

    // eye glow pulse
    const glow = 1.8 + Math.sin(this.t * 2.6) * 0.6;
    (this.eyeL.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    (this.eyeR.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    void dt;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.state = 'gone';
  }
}
