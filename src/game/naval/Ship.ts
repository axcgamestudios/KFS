import * as THREE from 'three';
import { StaticBuilder, MAT } from '../structures/Materials';
import { damp, dampAngle, clamp } from '../core/MathUtils';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { WaterSystem } from '../world/WaterSystem';
import { ColliderRegistry } from '../systems/ColliderRegistry';

export type ShipKind = 'caravel' | 'pirate';
/** 0 furled · 1 half · 2 full sail. */
export type SailState = 0 | 1 | 2;

export interface ShipPerks {
  speedMult?: number;
  windEase?: number;
  cannonCdMult?: number;
}

/** One broadside cannon battery descriptor. */
export interface CannonShot {
  from: THREE.Vector3;
  dir: THREE.Vector3;
  side: 'port' | 'starboard';
}

const DECK_Y = 1.0;
const QUARTER_Y = 2.16;

/**
 * A fully simulated sailing ship: procedural hull, animated sails, wheel,
 * rudder and cannons; Gerstner buoyancy shared with the ocean shader;
 * wind-based speed model, hull damage, smoke and sinking.
 */
export class Ship {
  readonly group = new THREE.Group();       // world transform (position = waterline center)
  readonly hull = new THREE.Group();        // pitch/roll applied here
  readonly id: string;
  readonly kind: ShipKind;
  readonly name: string;
  readonly isPlayer: boolean;

  /** XZ position; Y is computed from buoyancy. */
  readonly pos = new THREE.Vector3();
  heading = 0;
  speed = 0;
  sailState: SailState = 0;
  rudder = 0;              // smoothed -1..1
  rudderInput = 0;         // raw input -1..1
  anchored = false;
  frozen = false;          // grappled/anchored: buoyancy frozen (walkable deck)
  hullHp: number;
  readonly maxHullHp: number;
  sinking = 0;             // 0 = afloat; grows to 1
  sunk = false;
  removable = false;       // fully sunk & faded → parent may recycle
  grappled = false;

  /** Cannon cooldowns (seconds remaining). */
  cdPort = 0;
  cdStar = 0;
  readonly cannonCd: number;

  perks: ShipPerks = {};

  // Visual handles
  private sailMain!: THREE.Mesh;
  private sailFore!: THREE.Mesh;
  private flag!: THREE.Mesh;
  private wheel!: THREE.Group;
  private smoke: THREE.Sprite[] = [];
  private smokeTimer = 0;
  private sternFoam!: THREE.Mesh;
  private t = 0;

  /** Local (deck space) muzzle offsets — [port, starboard] × 3 guns. */
  private muzzles: Array<{ x: number; y: number; z: number }> = [];

  onCreak?: (pos: THREE.Vector3) => void;

  constructor(opts: {
    id: string;
    name: string;
    kind: ShipKind;
    isPlayer: boolean;
    x: number; z: number;
    heading?: number;
    hullHp?: number;
    cannonCd?: number;
  }) {
    this.id = opts.id;
    this.name = opts.name;
    this.kind = opts.kind;
    this.isPlayer = opts.isPlayer;
    this.hullHp = opts.hullHp ?? (opts.kind === 'caravel' ? 140 : 110);
    this.maxHullHp = this.hullHp;
    this.cannonCd = opts.cannonCd ?? 5.2;
    this.pos.set(opts.x, 0, opts.z);
    this.heading = opts.heading ?? 0;
    this.buildModel();
    this.group.add(this.hull);
    this.syncTransform();
  }

  // ------------------------------------------------------------- model

  private buildModel(): void {
    const pirate = this.kind === 'pirate';
    const b = new StaticBuilder(new ColliderRegistry(), `${this.id}_visual`);
    const hullKey = pirate ? 'woodPirate' : 'woodShip';
    const sailKey = pirate ? 'sailDark' : 'sail';
    const L = 16;
    const W = 4.3;

    // --- Hull sections (curved profile, bow at +Z) ---
    const sections = 11;
    for (let i = 0; i < sections; i++) {
      const t = i / (sections - 1); // 0 stern … 1 bow
      const along = (t - 0.5) * L;
      const widthProf = Math.sin(Math.PI * Math.min(1, 0.14 + t * 0.74)) * 0.74 + 0.26;
      const w = W * widthProf;
      const rocker = Math.pow(Math.abs(t - 0.42) * 2, 2.1) * 1.35;
      const hullH = 2.1;
      const py = DECK_Y - 1.05 + rocker * 0.55;
      b.add(new THREE.BoxGeometry(w * 0.96, hullH * 0.5, L / sections + 0.06), hullKey, 0, py - hullH * 0.25, along);
      for (const side of [-1, 1]) {
        b.add(new THREE.BoxGeometry(0.17, hullH, L / sections + 0.05), hullKey, side * (w / 2), py, along);
        b.add(new THREE.BoxGeometry(0.15, hullH * 0.52, L / sections + 0.04), 'wood',
          side * (w / 2 + 0.1), py + hullH * 0.62, along, 0, 1, 1, 1, 0, side * 0.1);
        // Gold/dark trim wale
        b.add(new THREE.BoxGeometry(0.1, 0.14, L / sections + 0.05), pirate ? 'metal' : 'gold',
          side * (w / 2 + 0.16), py + hullH * 0.1, along);
      }
    }

    // --- Deck platforms (main, quarter, bow) ---
    b.add(new THREE.BoxGeometry(W * 0.88, 0.14, 10.6), 'woodLight', 0, DECK_Y - 0.02, 0.6);
    b.add(new THREE.BoxGeometry(W * 0.8, 1.2, 3.6), hullKey, 0, QUARTER_Y - 0.6, -L / 2 + 2.0);
    b.add(new THREE.BoxGeometry(W * 0.9, 0.14, 3.9), 'woodLight', 0, QUARTER_Y, -L / 2 + 2.0);
    b.add(new THREE.BoxGeometry(W * 0.62, 0.14, 3.0), 'woodLight', 0, DECK_Y - 0.02, L / 2 - 1.9);
    // Rear gallery windows (stern)
    b.add(new THREE.BoxGeometry(W * 0.7, 0.5, 0.12), 'glow', 0, QUARTER_Y - 0.2, -L / 2 - 0.02);
    // Hatch + crates on deck
    b.box('woodDark', 1.1, 0.32, 1.5, 0, DECK_Y + 0.2, 0.6);
    b.box('woodDark', 0.8, 0.7, 0.8, 1.2, DECK_Y + 0.42, -1.6, 0.3);
    if (pirate) {
      b.box('woodDark', 0.8, 0.7, 0.8, -1.2, DECK_Y + 0.42, -0.4, 1.1);
      // Grapple rope coil
      b.add(new THREE.TorusGeometry(0.3, 0.06, 6, 12), 'roofThatch', 0.9, DECK_Y + 0.1, 2.4, 0, 1, 1, 1, Math.PI / 2);
    }

    // --- Railings ---
    for (const side of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.09, 0.09, 10.2), 'wood', side * (W / 2 - 0.15), DECK_Y + 0.72, 0.6);
      for (let i = 0; i < 11; i++) {
        const z = -4.6 + i * 0.95;
        b.cylinder('woodDark', 0.045, 0.045, 0.66, 5, side * (W / 2 - 0.15), DECK_Y + 0.36, z);
      }
      b.add(new THREE.BoxGeometry(0.09, 0.09, 3.4), 'wood', side * (W * 0.36), QUARTER_Y + 0.72, -L / 2 + 2.0);
    }

    // --- Bowsprit ---
    b.add(new THREE.CylinderGeometry(0.08, 0.13, 5.2, 7), 'wood',
      0, DECK_Y + 1.45, L / 2 + 1.4, 0, 1, 1, 1, 0, Math.PI / 2 + 0.12);

    // --- Masts (main + fore) + yards ---
    const mainZ = -0.8, foreZ = 4.6;
    for (const [mz, mh, mr] of [[mainZ, 15.5, 0.19], [foreZ, 12.0, 0.15]] as Array<[number, number, number]>) {
      b.cylinder('wood', mr, mr + 0.07, mh, 8, 0, DECK_Y - 0.4 + mh / 2, mz);
      b.add(new THREE.BoxGeometry(8.2, 0.13, 0.13), 'woodDark', 0, DECK_Y + mh - 3.4, mz);
      // Shrouds
      for (const side of [-1, 1]) {
        b.add(new THREE.BoxGeometry(0.05, mh - 2.4, 0.05), 'woodDark',
          side * 1.9, DECK_Y + (mh - 2.4) / 2, mz - 0.4, 0, 1, 1, 1, side * 0.1);
      }
    }
    // Crow nest
    b.cylinder('woodDark', 0.55, 0.55, 0.5, 8, 0, DECK_Y + 9.6, mainZ);

    // --- Wheel + rudder ---
    const wheelG = new THREE.Group();
    const wheelMat = MAT.wood;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 16), wheelMat);
    wheelG.add(ring);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.86, 5), wheelMat);
      spoke.rotation.z = (i / 4) * Math.PI;
      wheelG.add(spoke);
    }
    wheelG.position.set(0, QUARTER_Y + 0.55, -L / 2 + 2.6);
    wheelG.rotation.x = Math.PI / 2 - 0.35;
    this.wheel = wheelG;
    this.hull.add(wheelG);
    // Rudder below stern
    b.add(new THREE.BoxGeometry(0.14, 2.2, 0.9), 'woodDark', 0, DECK_Y - 1.4, -L / 2 - 0.3);

    // --- Cannons: 3 per side (port +X, starboard -X) ---
    const cannonMat = MAT.metal;
    for (const side of [1, -1]) {
      for (const z of [-3.0, -0.6, 1.8]) {
        const c = new THREE.Group();
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.15, 8), cannonMat);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.x = side * 0.35;
        c.add(barrel);
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.34), MAT.woodDark);
        c.add(mount);
        c.position.set(side * (W / 2 - 0.45), DECK_Y + 0.32, z);
        c.rotation.y = side * Math.PI / 2;
        this.hull.add(c);
        this.muzzles.push({ x: side * (W / 2 + 0.35), y: DECK_Y + 0.32, z });
      }
    }

    // --- Lanterns (stern + bow) ---
    const lantern = (x: number, y: number, z: number) => {
      b.cylinder('metal', 0.14, 0.18, 0.36, 6, x, y, z);
      b.add(new THREE.BoxGeometry(0.2, 0.26, 0.2), 'glow', x, y, z);
    };
    lantern(0, QUARTER_Y + 0.95, -L / 2 - 0.2);
    lantern(0, DECK_Y + 0.5, L / 2 - 0.1);

    // Merge static hull parts
    b.build(this.hull, { shadows: true });

    // --- Animated sails (separate meshes) ---
    const mkSail = (y: number, z: number, w: number, h: number) => {
      const geo = new THREE.PlaneGeometry(w, h, 6, 4);
      // slight belly curve
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) / w) * 2;
        pos.setZ(i, (1 - u * u) * w * 0.09);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, MAT[sailKey]);
      mesh.position.set(0, y, z);
      mesh.rotation.y = Math.PI / 2; // face fore-aft
      this.hull.add(mesh);
      return mesh;
    };
    this.sailMain = mkSail(DECK_Y + 10.4, mainZ, 7.6, 5.4);
    this.sailFore = mkSail(DECK_Y + 7.3, foreZ, 5.0, 4.2);

    // --- Flag at main mast top ---
    const flagGeo = new THREE.PlaneGeometry(1.5, 0.7, 4, 1);
    this.flag = new THREE.Mesh(flagGeo, pirate ? MAT.clothRaven : MAT.clothGold);
    this.flag.position.set(0.76, DECK_Y + 14.6, mainZ - 0.3);
    this.flag.castShadow = false;
    this.hull.add(this.flag);

    // --- Damage smoke sprites (pooled, hidden until hull low) ---
    const smokeCanvas = document.createElement('canvas');
    smokeCanvas.width = smokeCanvas.height = 64;
    const sctx = smokeCanvas.getContext('2d')!;
    const sgrad = sctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    sgrad.addColorStop(0, 'rgba(60,58,56,0.85)');
    sgrad.addColorStop(1, 'rgba(60,58,56,0)');
    sctx.fillStyle = sgrad;
    sctx.fillRect(0, 0, 64, 64);
    const smokeTex = new THREE.CanvasTexture(smokeCanvas);
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, transparent: true, depthWrite: false, opacity: 0,
      }));
      sp.scale.set(2.4, 2.4, 1);
      sp.position.set((i - 1) * 0.9, DECK_Y + 2.4, -1 - i * 1.4);
      this.hull.add(sp);
      this.smoke.push(sp);
    }

    // --- Stern wake foam strip ---
    const foamGeo = new THREE.PlaneGeometry(W * 0.9, 1);
    foamGeo.rotateX(-Math.PI / 2);
    this.sternFoam = new THREE.Mesh(foamGeo, new THREE.MeshBasicMaterial({
      color: 0xe8f2ee, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.sternFoam.position.set(0, 0.12, -L / 2 - 1.6);
    this.hull.add(this.sternFoam);
  }

  // ------------------------------------------------------------ helpers

  get length(): number {
    return 16;
  }

  /** Ship-local ↔ world transforms. Local +Z = bow. */
  toWorld(lx: number, ly: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    return out.set(
      this.pos.x + lx * c + lz * s,
      ly + this.group.position.y,
      this.pos.z - lx * s + lz * c,
    );
  }

  toLocal(wx: number, wz: number, out = new THREE.Vector2()): THREE.Vector2 {
    const dx = wx - this.pos.x;
    const dz = wz - this.pos.z;
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    return out.set(dx * c - dz * s, dx * s + dz * c);
  }

  /** Deck platform height at ship-local coords, or null when off-deck. */
  deckHeightAt(lx: number, lz: number): number | null {
    if (Math.abs(lx) > 1.62) return null;
    if (lz >= -4.7 && lz <= 5.9) return DECK_Y + this.group.position.y;       // main + bow deck
    if (lz >= -7.9 && lz <= -4.3 && Math.abs(lx) < 1.5) return QUARTER_Y + this.group.position.y; // quarterdeck
    return null;
  }

  /** Deck bounds for keeping crew aboard. */
  get deckBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
    return { minX: -1.55, maxX: 1.55, minZ: -7.8, maxZ: 5.7 };
  }

  get wheelWorld(): THREE.Vector3 {
    return this.toWorld(0, QUARTER_Y + 0.15, -5.2);
  }

  get crippled(): boolean {
    return this.hullHp < this.maxHullHp * 0.35 && !this.sunk;
  }

  // ------------------------------------------------------------- physics

  /** Wind factor 0.12..1 by angle between heading and wind blowing direction. */
  windFactor(windDir: number): number {
    const cosA = Math.sin(this.heading) * Math.sin(windDir) + Math.cos(this.heading) * Math.cos(windDir);
    const ease = this.perks.windEase ?? 1; // nav_viento raises ease → adverse wind hurts less
    const base = 0.16 + 0.84 * Math.pow(cosA * 0.5 + 0.5, Math.max(0.6, 1.45 / ease));
    return clamp(base, 0.12, 1);
  }

  get maxSpeed(): number {
    return (this.kind === 'caravel' ? 8.6 : 7.4) * (this.perks.speedMult ?? 1) * (this.crippled ? 0.55 : 1);
  }

  update(
    dt: number,
    water: WaterSystem,
    terrain: TerrainHeight,
    windDir: number,
  ): void {
    this.t += dt;

    if (this.sunk) {
      this.removable = true;
      return;
    }

    // --- Sinking animation ---
    if (this.sinking > 0) {
      this.sinking = Math.min(1, this.sinking + dt / 14);
      this.group.position.y -= dt * (0.35 + this.sinking * 0.8);
      this.hull.rotation.z += dt * 0.06;
      this.hull.rotation.x -= dt * 0.03;
      this.speed = damp(this.speed, 0, 1.2, dt);
      if (this.sinking >= 1) {
        this.sunk = true;
        this.group.visible = false;
      }
      this.syncTransform();
      return;
    }

    // --- Grounding: caravels need ~1.8 m of water ---
    const depth = terrain.height(this.pos.x, this.pos.z);
    if (depth > -1.7 && this.speed > 0.1) {
      this.speed = 0;
    }

    // --- Sails & wind ---
    const wf = this.windFactor(windDir);
    const sailK = this.sailState / 2;
    const target = this.anchored || this.grappled ? 0 : sailK * this.maxSpeed * wf;
    const accel = target > this.speed ? 0.32 : 0.8;
    this.speed = damp(this.speed, target, accel, dt);

    // --- Rudder & heading ---
    this.rudder = damp(this.rudder, this.rudderInput, 3.2, dt);
    if (!this.frozen && Math.abs(this.speed) > 0.15) {
      const turnRate = 0.62 * (0.35 + 0.65 * Math.abs(this.speed) / this.maxSpeed);
      this.heading += this.rudder * turnRate * dt;
    }

    // --- Integrate ---
    if (!this.frozen) {
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
      this.pos.x = clamp(this.pos.x, -1010, 1010);
      this.pos.z = clamp(this.pos.z, -1010, 1010);
    }

    // --- Buoyancy (4-point sampling of the same Gerstner waves as the shader) ---
    if (!this.frozen) {
      const pBow = this.toWorld(0, 0, 6.4);
      const pStern = this.toWorld(0, 0, -6.4);
      const pPort = this.toWorld(1.9, 0, 0);
      const pStar = this.toWorld(-1.9, 0, 0);
      const hBow = water.waveHeightAt(pBow.x, pBow.z);
      const hStern = water.waveHeightAt(pStern.x, pStern.z);
      const hPort = water.waveHeightAt(pPort.x, pPort.z);
      const hStar = water.waveHeightAt(pStar.x, pStar.z);
      const avg = (hBow + hStern + hPort + hStar) / 4;
      this.group.position.y = damp(this.group.position.y, avg + 0.12, 5, dt);
      const targetPitch = Math.atan2(hStern - hBow, 12.8);
      const targetRoll = Math.atan2(hPort - hStar, 3.8) + this.rudder * clamp(this.speed / this.maxSpeed, 0, 1) * 0.09;
      this.hull.rotation.x = dampAngle(this.hull.rotation.x, targetPitch, 4, dt);
      this.hull.rotation.z = dampAngle(this.hull.rotation.z, targetRoll, 4, dt);
    }

    this.syncTransform();

    // --- Sails visual state ---
    const sailScale = [0.1, 0.62, 1.0][this.sailState];
    const billow = 1 + (this.speed / Math.max(1, this.maxSpeed)) * 0.18 + Math.sin(this.t * 1.7) * 0.03;
    this.sailMain.scale.set(sailScale * billow, sailScale, 1);
    this.sailFore.scale.set(sailScale * billow, sailScale, 1);
    // Sails trim slightly toward the wind
    const relWind = Math.atan2(Math.sin(windDir - this.heading), Math.cos(windDir - this.heading));
    this.sailMain.rotation.x = clamp(relWind * 0.1, -0.2, 0.2);
    this.sailFore.rotation.x = clamp(relWind * 0.12, -0.25, 0.25);

    // --- Flag flutter ---
    this.flag.rotation.y = Math.sin(this.t * 6) * 0.22 + relWind * 0.4;
    this.flag.scale.x = 0.7 + Math.abs(Math.sin(this.t * 2.3)) * 0.3;

    // --- Wheel spins with the rudder ---
    this.wheel.rotation.z = this.rudder * 1.9;

    // --- Damage smoke when crippled ---
    if (this.crippled) {
      this.smokeTimer += dt;
      for (let i = 0; i < this.smoke.length; i++) {
        const sp = this.smoke[i];
        const k = 1 - (this.smokeTimer * 0.4 + i * 0.33) % 1;
        sp.material.opacity = k * 0.5;
        sp.position.y = DECK_Y + 2.2 + (1 - k) * 2.6;
        sp.scale.setScalar(1.8 + (1 - k) * 2.2);
      }
    } else {
      for (const sp of this.smoke) sp.material.opacity = 0;
    }

    // --- Wake foam ---
    const spd = Math.abs(this.speed);
    (this.sternFoam.material as THREE.MeshBasicMaterial).opacity = clamp(spd / 3, 0, 0.55);
    this.sternFoam.scale.set(1 + spd * 0.12, 1, 2.4 + spd * 0.9);
    if (spd > 0.2) {
      this.sternFoam.position.z = -this.length / 2 - 1.4 - spd * 0.25;
    }

    // --- Hull creaks while underway (audio callback, throttled) ---
    if (spd > 2.5 && Math.random() < dt * 0.12) {
      this.onCreak?.(this.group.position);
    }

    // --- Cannon cooldowns ---
    if (this.cdPort > 0) this.cdPort -= dt / (this.perks.cannonCdMult ?? 1);
    if (this.cdStar > 0) this.cdStar -= dt / (this.perks.cannonCdMult ?? 1);
  }

  private syncTransform(): void {
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    this.group.rotation.y = this.heading;
  }

  /** Broadside spawn descriptors for one side (null if on cooldown). */
  fire(side: 'port' | 'starboard'): CannonShot[] | null {
    if (side === 'port' ? this.cdPort > 0 : this.cdStar > 0) return null;
    if (side === 'port') this.cdPort = this.cannonCd;
    else this.cdStar = this.cannonCd;
    const dirSign = side === 'port' ? 1 : -1;
    const out: CannonShot[] = [];
    for (const m of this.muzzles.filter((mm) => (side === 'port' ? mm.x > 0 : mm.x < 0))) {
      const from = this.toWorld(m.x, m.y, m.z);
      // Broadside direction: perpendicular to heading, plus slight forward bias
      const dx = Math.cos(this.heading) * dirSign + Math.sin(this.heading) * 0.18;
      const dz = -Math.sin(this.heading) * dirSign + Math.cos(this.heading) * 0.18;
      out.push({ from, dir: new THREE.Vector3(dx, 0.16, dz).normalize(), side });
    }
    return out;
  }

  /** Muzzle world position for flash placement. */
  muzzleFlashPos(side: 'port' | 'starboard', index: number): THREE.Vector3 {
    const arr = this.muzzles.filter((mm) => (side === 'port' ? mm.x > 0 : mm.x < 0));
    const m = arr[index % arr.length];
    return this.toWorld(m.x, m.y, m.z);
  }

  applyDamage(amount: number): void {
    if (this.sinking > 0 || this.sunk) return;
    this.hullHp = Math.max(0, this.hullHp - amount);
    if (this.hullHp <= 0) {
      this.sinking = 0.001;
    }
  }

  serialize() {
    return {
      x: this.pos.x, z: this.pos.z, heading: this.heading,
      hullHp: this.hullHp, sailState: this.sailState,
      anchored: this.anchored, sunk: this.sunk, sinking: this.sinking,
    };
  }

  deserialize(d: ReturnType<Ship['serialize']>): void {
    this.pos.set(d.x, 0, d.z);
    this.heading = d.heading;
    this.hullHp = d.hullHp;
    this.sailState = d.sailState;
    this.anchored = d.anchored;
    this.sinking = d.sinking;
    this.sunk = d.sunk;
    this.group.visible = !d.sunk;
    this.speed = 0;
    this.syncTransform();
    this.group.position.y = 0.12;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    });
  }
}
