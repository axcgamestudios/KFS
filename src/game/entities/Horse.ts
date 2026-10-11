import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/MathUtils';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import { MAT } from '../structures/Materials';

/**
 * Fase 4 — mountable horses and hauling carts.
 *
 * The horse is a fully articulated procedural model (no external rig in the
 * asset repository contains a horse — we build one rather than substitute a
 * cube): segmented barrel, neck, head, four 2-joint legs with hooves, tail
 * and mane, plus a saddle. Gaits are procedural: 4-beat walk, 2-beat trot
 * with suspension, rotary gallop, plus idle grazing and a jump tuck.
 */

export type HorseGait = 'idle' | 'walk' | 'trot' | 'gallop' | 'jump';

export interface HorsePalette {
  coat: number;
  mane: number;
  muzzle?: number;
  socks?: boolean;
}

export const HORSE_PALETTES: Record<string, HorsePalette> = {
  bay: { coat: 0x6b4a2e, mane: 0x241a12, socks: true },
  black: { coat: 0x26221f, mane: 0x151210 },
  chestnut: { coat: 0x8a5a30, mane: 0x5a3a1e, socks: true },
  grey: { coat: 0x9d9d99, mane: 0x55534f },
};

interface LegRig {
  hip: THREE.Object3D;
  knee: THREE.Object3D;
  hoof: THREE.Object3D;
  front: boolean;
}

export class HorseModel {
  readonly root = new THREE.Group();
  readonly saddle = new THREE.Object3D();
  private body = new THREE.Group();
  private neck = new THREE.Object3D();
  private head = new THREE.Object3D();
  private jaw: THREE.Object3D;
  private earL: THREE.Object3D;
  private earR: THREE.Object3D;
  private tailSegs: THREE.Object3D[] = [];
  private legs: LegRig[] = [];
  private maneStrips: THREE.Object3D[] = [];
  private coatMat: THREE.MeshStandardMaterial;
  private phase = 0;
  private grazeT = 0;
  private idleT = 0;

  constructor(palette: HorsePalette) {
    const coat = new THREE.MeshStandardMaterial({ color: palette.coat, roughness: 0.86, metalness: 0 });
    const maneMat = new THREE.MeshStandardMaterial({ color: palette.mane, roughness: 0.95, metalness: 0 });
    const hoofMat = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.6, metalness: 0.05 });
    this.coatMat = coat;

    // ---- Barrel (chest → belly → hindquarters) ----
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.62), coat);
    chest.position.set(0, 1.06, 0.55);
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.9), coat);
    belly.position.set(0, 1.02, -0.05);
    const hind = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.68, 0.6), coat);
    hind.position.set(0, 1.08, -0.68);
    const rump = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.3), coat);
    rump.position.set(0, 1.22, -0.95);
    for (const m of [chest, belly, hind, rump]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.body.add(m);
    }

    // ---- Neck & head ----
    this.neck.position.set(0, 1.3, 0.82);
    this.neck.rotation.x = -0.72; // up-forward
    const neckMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.82, 0.36), coat);
    neckMesh.position.y = 0.38;
    neckMesh.castShadow = true;
    this.neck.add(neckMesh);
    // Mane strip
    for (let i = 0; i < 5; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.3), maneMat);
      strip.position.set(0, 0.14 + i * 0.15, -0.16);
      this.neck.add(strip);
      this.maneStrips.push(strip);
    }

    this.head.position.set(0, 0.78, 0.1);
    this.head.rotation.x = 0.86; // balances the neck pitch to look forward
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.44), coat);
    skull.castShadow = true;
    this.head.add(skull);
    const muzzle = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.22, 0.3),
      new THREE.MeshStandardMaterial({ color: palette.muzzle ?? palette.mane, roughness: 0.9 }),
    );
    muzzle.position.set(0, -0.03, 0.34);
    this.head.add(muzzle);
    // Jaw (chewing while grazing)
    this.jaw = new THREE.Object3D();
    this.jaw.position.set(0, -0.14, 0.05);
    this.head.add(this.jaw);
    // Ears
    const earGeo = new THREE.ConeGeometry(0.05, 0.2, 5);
    this.earL = new THREE.Mesh(earGeo, coat);
    this.earL.position.set(0.09, 0.22, -0.05);
    this.earR = new THREE.Mesh(earGeo, coat);
    this.earR.position.set(-0.09, 0.22, -0.05);
    this.head.add(this.earL, this.earR);
    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.3 });
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), eyeMat);
      eye.position.set(s * 0.115, 0.05, 0.16);
      this.head.add(eye);
    }
    this.neck.add(this.head);
    this.body.add(this.neck);

    // ---- Tail ----
    let parent: THREE.Object3D = this.body;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Object3D();
      seg.position.set(0, i === 0 ? 1.18 : -0.2, i === 0 ? -1.02 : 0);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(i === 0 ? 0.07 : 0.05, i === 3 ? 0.02 : 0.06, 0.26, 5),
        maneMat,
      );
      m.position.y = -0.12;
      m.castShadow = true;
      seg.add(m);
      parent.add(seg);
      this.tailSegs.push(seg);
      parent = seg;
    }

    // ---- Legs (front pair at z=0.55, hind pair at z=-0.72) ----
    const legDefs: Array<[number, number, boolean]> = [
      [0.21, 0.55, true], [-0.21, 0.55, true],
      [0.22, -0.72, false], [-0.22, -0.72, false],
    ];
    for (const [x, z, front] of legDefs) {
      const hip = new THREE.Object3D();
      hip.position.set(x, front ? 0.92 : 1.02, z);
      const upperLen = front ? 0.46 : 0.5;
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.07, upperLen, 6),
        coat,
      );
      upper.position.y = -upperLen / 2;
      upper.castShadow = true;
      hip.add(upper);
      const knee = new THREE.Object3D();
      knee.position.y = -upperLen;
      hip.add(knee);
      const lowerLen = front ? 0.42 : 0.46;
      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.045, lowerLen, 6),
        palette.socks
          ? new THREE.MeshStandardMaterial({ color: 0xb8ab98, roughness: 0.9 })
          : coat,
      );
      lower.position.y = -lowerLen / 2;
      lower.castShadow = true;
      knee.add(lower);
      const hoofObj = new THREE.Object3D();
      hoofObj.position.y = -lowerLen;
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.11, 6), hoofMat);
      hoof.position.y = -0.05;
      hoof.castShadow = true;
      hoofObj.add(hoof);
      knee.add(hoofObj);
      this.body.add(hip);
      this.legs.push({ hip, knee, hoof: hoofObj, front });
    }

    // ---- Saddle + reins ----
    const saddleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.1, 0.56),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 }),
    );
    saddleMesh.position.set(0, 1.42, 0.06);
    saddleMesh.castShadow = true;
    this.body.add(saddleMesh);
    const pommel = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.4, metalness: 0.6 }),
    );
    pommel.position.set(0, 1.5, 0.3);
    this.body.add(pommel);
    const cantle = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.12, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 0.7 }),
    );
    cantle.position.set(0, 1.5, -0.18);
    this.body.add(cantle);
    // Stirrups (visual)
    for (const s of [1, -1]) {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.34, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x3a281a, roughness: 0.8 }),
      );
      strap.position.set(s * 0.29, 1.24, 0.06);
      this.body.add(strap);
    }
    this.saddle.position.set(0, 1.5, 0.05);
    this.body.add(this.saddle);

    // Blanket under the saddle (the Order's colours)
    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.04, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x27415c, roughness: 0.9 }),
    );
    blanket.position.set(0, 1.37, 0.06);
    this.body.add(blanket);

    this.root.add(this.body);
  }

  /** Animate by gait & speed. `grazing` when idle for a long time. */
  update(dt: number, gait: HorseGait, speed: number, grazing: boolean): void {
    // Stride frequency: cycles per second ≈ speed / stride length
    const strideLen = gait === 'gallop' ? 3.4 : gait === 'trot' ? 2.2 : 1.5;
    const freq = clamp(speed / strideLen, 0, 3.2);
    this.phase += dt * Math.max(freq, gait === 'idle' ? 0.5 : 0.8);
    const ph = this.phase;

    // Reset base pose
    this.neck.rotation.x = -0.72;
    this.head.rotation.x = 0.86;
    this.body.rotation.x = 0;
    this.body.position.y = 0;

    if (gait === 'idle') {
      this.idleT += dt;
      // Weight shift + breathing
      this.body.rotation.z = Math.sin(this.idleT * 0.7) * 0.02;
      this.body.position.y = Math.sin(this.idleT * 1.6) * 0.008;
      // Tail swish
      for (let i = 0; i < this.tailSegs.length; i++) {
        this.tailSegs[i].rotation.x = 0.35;
        this.tailSegs[i].rotation.z = Math.sin(this.idleT * 1.3 + i * 0.6) * 0.16;
      }
      // Ear flicks
      const flick = Math.max(0, Math.sin(this.idleT * 0.9)) > 0.985 ? 0.5 : 0;
      this.earL.rotation.z = 0.2 + flick;
      this.earR.rotation.z = -0.2 - flick * 0.5;
      // Graze after standing still for a while
      if (grazing) {
        this.grazeT = Math.min(1, this.grazeT + dt * 1.4);
      } else {
        this.grazeT = Math.max(0, this.grazeT - dt * 2);
      }
      const g = this.grazeT;
      this.neck.rotation.x = -0.72 + g * 1.28;          // down to the grass
      this.head.rotation.x = 0.86 - g * 0.55;
      this.jaw.rotation.x = g * (0.06 + Math.sin(this.idleT * 5) * 0.05); // chewing
      // Legs at rest
      for (const leg of this.legs) {
        leg.hip.rotation.x = 0;
        leg.knee.rotation.x = 0;
        leg.hoof.rotation.x = 0;
      }
      return;
    }

    this.grazeT = 0;
    this.idleT = 0;

    if (gait === 'jump') {
      // Tuck: forelegs folded back, hind legs pushed back
      const t = clamp(speed, 0, 1); // 0 = takeoff, 1 = landing
      for (const leg of this.legs) {
        if (leg.front) {
          leg.hip.rotation.x = -0.9 + t * 0.9;
          leg.knee.rotation.x = -1.3 + t * 1.3;
        } else {
          leg.hip.rotation.x = 0.55 - t * 0.9;
          leg.knee.rotation.x = 0.5 - t * 0.5;
        }
      }
      this.neck.rotation.x = -0.95 + t * 0.4;
      this.body.rotation.x = -0.18 + t * 0.25;
      for (let i = 0; i < this.tailSegs.length; i++) {
        this.tailSegs[i].rotation.x = 0.5;
        this.tailSegs[i].rotation.z = Math.sin(ph + i * 0.7) * 0.12;
      }
      return;
    }

    // ---- Walk / trot / gallop leg cycles ----
    // Leg phase offsets (LF, RF, LH, RH)
    let offsets: number[];
    let amp = 0.42;
    let kneeAmp = 0.55;
    let bob = 0;
    let pitch = 0;
    if (gait === 'walk') {
      offsets = [0, 0.5, 0.25, 0.75]; // 4-beat lateral sequence
      amp = 0.4;
      kneeAmp = 0.5;
      bob = 0.012;
    } else if (gait === 'trot') {
      offsets = [0, 0.5, 0.5, 0]; // diagonal pairs
      amp = 0.5;
      kneeAmp = 0.75;
      bob = 0.045; // 2-beat bounce
    } else {
      offsets = [0.92, 0.8, 0.32, 0.12]; // rotary gallop
      amp = 0.62;
      kneeAmp = 0.95;
      bob = 0.07;
      pitch = 0.06;
    }

    this.legs.forEach((leg, i) => {
      const p = ph * Math.PI * 2 + offsets[i] * Math.PI * 2;
      const swing = Math.sin(p);
      const lift = Math.max(0, Math.sin(p + Math.PI / 2));
      leg.hip.rotation.x = swing * amp * (leg.front ? 1 : 0.9);
      leg.knee.rotation.x = -lift * kneeAmp - (leg.front ? 0.08 : 0.15);
      leg.hoof.rotation.x = lift * 0.35;
    });

    // Body bob & pitch, head counter-bob, tail streaming
    const gaitCycles = gait === 'walk' ? 2 : gait === 'trot' ? 2 : 1;
    this.body.position.y = Math.abs(Math.sin(ph * Math.PI * gaitCycles)) * bob;
    this.body.rotation.x = Math.sin(ph * Math.PI * gaitCycles) * pitch;
    this.neck.rotation.x = -0.72 - Math.sin(ph * Math.PI * gaitCycles) * 0.05 + (gait === 'gallop' ? -0.14 : 0);
    this.head.rotation.x = 0.86 + Math.sin(ph * Math.PI * gaitCycles) * 0.07;
    for (let i = 0; i < this.tailSegs.length; i++) {
      this.tailSegs[i].rotation.x = 0.32 + speed * 0.03;
      this.tailSegs[i].rotation.z = Math.sin(ph * 3 + i * 0.7) * (0.14 - i * 0.02);
    }
    for (let i = 0; i < this.maneStrips.length; i++) {
      this.maneStrips[i].rotation.x = -speed * 0.035 + Math.sin(ph * 4 + i) * 0.05;
    }
  }

  flash(): void {
    this.coatMat.emissive.setHex(0x552222);
    setTimeout(() => this.coatMat.emissive.setHex(0x000000), 140);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.coatMat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Cart (carreta) — wooden hauling cart with rotating spoked wheels
// ---------------------------------------------------------------------------

export class CartModel {
  readonly root = new THREE.Group();
  readonly seat = new THREE.Object3D();
  readonly hitch = new THREE.Object3D(); // shaft attachment point (front)
  private wheelL: THREE.Object3D;
  private wheelR: THREE.Object3D;
  private wheelSpinL: THREE.Object3D;
  private wheelSpinR: THREE.Object3D;
  private wheelRadius = 0.62;

  constructor(cargo = true) {
    const g = new THREE.Group();
    // Bed
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 2.5), MAT.woodDark);
    bed.position.y = 0.78;
    bed.castShadow = true;
    bed.receiveShadow = true;
    g.add(bed);
    // Side rails
    for (const s of [1, -1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 2.5), MAT.wood);
      rail.position.set(s * 0.74, 0.98, 0);
      rail.castShadow = true;
      g.add(rail);
      for (let i = 0; i < 3; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.09), MAT.woodDark);
        post.position.set(s * 0.74, 0.94, -1.1 + i * 1.1);
        g.add(post);
      }
    }
    // Back rail
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.08), MAT.wood);
    back.position.set(0, 0.98, -1.22);
    g.add(back);
    // Front rail (lower — shafts pass here)
    const front = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.08), MAT.wood);
    front.position.set(0, 0.92, 1.22);
    g.add(front);

    // Wheels: spoked discs built in the XY plane (spin = local Z),
    // yawed 90° by the parent so they stand sideways on the axle.
    const wheel = (): { pivot: THREE.Object3D; spin: THREE.Object3D } => {
      const pivot = new THREE.Object3D();
      pivot.rotation.y = Math.PI / 2;
      const w = new THREE.Group(); // inner: spins around Z (the axle after yaw)
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 8), MAT.woodDark);
      hub.rotation.x = Math.PI / 2; // align the cylinder with Z
      w.add(hub);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.05), MAT.wood);
        // Spokes radiate in the XY plane, centred so they span hub→rim
        spoke.position.set(Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0);
        spoke.rotation.z = a + Math.PI / 2;
        spoke.castShadow = true;
        w.add(spoke);
        // Rim arc segment
        const rim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.055), MAT.wood);
        rim.position.set(Math.cos(a) * 0.58, Math.sin(a) * 0.58, 0);
        rim.rotation.z = a;
        w.add(rim);
      }
      // Iron tyre
      const tyre = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.028, 6, 20),
        new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.5, metalness: 0.7 }),
      );
      w.add(tyre);
      pivot.add(w);
      return { pivot, spin: w };
    };
    const wl = wheel();
    const wr = wheel();
    this.wheelL = wl.pivot;
    this.wheelSpinL = wl.spin;
    this.wheelR = wr.pivot;
    this.wheelSpinR = wr.spin;
    this.wheelL.position.set(0.86, 0.62, 0.25);
    this.wheelR.position.set(-0.86, 0.62, 0.25);
    g.add(this.wheelL, this.wheelR);

    // Axle
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6), MAT.woodDark);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, 0.62, 0.25);
    g.add(axle);

    // Shafts (varas) reaching forward to the horse
    for (const s of [1, -1]) {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 1.9), MAT.wood);
      shaft.position.set(s * 0.3, 0.82, 1.95);
      shaft.rotation.x = 0.04;
      shaft.castShadow = true;
      g.add(shaft);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.08), MAT.woodDark);
      cross.position.set(0, 0.86, 2.82);
      g.add(cross);
    }

    // Driver's seat (front-left)
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.5), MAT.woodLight);
    seat.position.set(-0.35, 1.06, 0.95);
    g.add(seat);
    this.seat.position.set(-0.35, 1.16, 0.95);
    g.add(this.seat);

    // Cargo: barrels, sacks and a crate
    if (cargo) {
      const barrel = (x: number, z: number) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.55, 9), MAT.woodLight);
        b.position.set(x, 1.12, z);
        b.castShadow = true;
        g.add(b);
        for (const yy of [1.0, 1.24]) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.014, 4, 12), MAT.metal);
          band.rotation.x = Math.PI / 2;
          band.position.set(x, yy, z);
          g.add(band);
        }
      };
      barrel(0.35, -0.55);
      barrel(-0.35, -0.55);
      const sackMat = new THREE.MeshStandardMaterial({ color: 0xb9a983, roughness: 0.95 });
      for (const [x, z] of [[0.3, 0.15], [-0.32, 0.1], [0, 0.35]] as Array<[number, number]>) {
        const sack = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 6), sackMat);
        sack.scale.y = 0.8;
        sack.position.set(x, 1.0, z);
        sack.castShadow = true;
        g.add(sack);
      }
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), MAT.woodDark);
      crate.position.set(0, 1.04, -1.0);
      crate.castShadow = true;
      g.add(crate);
    }

    this.hitch.position.set(0, 0.86, 2.9);
    g.add(this.hitch);
    this.root.add(g);
  }

  /** Spin the wheels by travelled distance. */
  update(distance: number): void {
    const ang = distance / this.wheelRadius;
    this.wheelSpinL.rotation.z = -ang;
    this.wheelSpinR.rotation.z = -ang;
  }
}
