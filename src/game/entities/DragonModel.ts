import * as THREE from 'three';
import { gfxRuntime } from '../core/Graphics';

/**
 * Procedural articulated dragon: body segments, S-curve neck with a hinged
 * jaw, expressive wings (bone + membrane fan), four legs (two for wyverns),
 * spiked tail and glowing eyes. Every animation is code-driven — flight with
 * wing folds, walk cycles, takeoff/landing, bite/claw/tail attacks, fire
 * breath with telegraphed charge, hurt flinch, death collapse and sleep.
 */

export interface DragonColors {
  body: number;
  belly: number;
  membrane: number;
  eye: number;
  horn: number;
}

/** Animation state driven by the Dragon AI. */
export interface DragonAnimState {
  mode:
    | 'sleep' | 'idle' | 'walk' | 'fly' | 'glide' | 'takeoff' | 'land'
    | 'attack_bite' | 'attack_claw' | 'attack_tail'
    | 'fire_windup' | 'fire_breath' | 'hurt' | 'die' | 'dead';
  /** One-shot progress 0..1 (attacks, takeoff, land, hurt, die); continuous for loops. */
  t: number;
  /** Ground movement speed for the walk cycle. */
  speed: number;
  /** Turn input -1..1 for flight banking. */
  turn: number;
  grounded: boolean;
}

function seg(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class DragonModel {
  readonly root = new THREE.Group();
  /** All body materials — tinted/emissive-pulsed for hit flashes. */
  private mats: THREE.MeshStandardMaterial[] = [];
  private bodyMat: THREE.MeshStandardMaterial;
  private bellyMat: THREE.MeshStandardMaterial;
  private membraneMat: THREE.MeshStandardMaterial;
  private eyeMatL!: THREE.MeshStandardMaterial;
  private eyeMatR!: THREE.MeshStandardMaterial;
  private mouthGlowSprite: THREE.Sprite;
  private mouthGlowLight: THREE.PointLight;

  private body = new THREE.Group();
  private chest = new THREE.Group();
  private neckSegs: THREE.Group[] = [];
  private head = new THREE.Group();
  private jaw = new THREE.Group();
  private tailSegs: THREE.Group[] = [];
  private legFL = new THREE.Group(); private legFR = new THREE.Group();
  private legBL = new THREE.Group(); private legBR = new THREE.Group();
  private kneeFL = new THREE.Group(); private kneeFR = new THREE.Group();
  private kneeBL = new THREE.Group(); private kneeBR = new THREE.Group();
  private shoulderL = new THREE.Group(); private shoulderR = new THREE.Group();
  private elbowL = new THREE.Group(); private elbowR = new THREE.Group();
  private spineSpikes: THREE.Object3D[] = [];

  private t = Math.random() * 10;
  private flapPhase = Math.random() * Math.PI * 2;
  private flashT = 0;
  private walkPhase = 0;
  private hasFrontLegs: boolean;
  private mouthOpenSm = 0;
  private eyeGlowSm = 0;

  constructor(readonly colors: DragonColors, scale: number, wyvern = false) {
    this.hasFrontLegs = !wyvern;

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: colors.body, roughness: 0.62, metalness: 0.16, flatShading: true,
    });
    this.bellyMat = new THREE.MeshStandardMaterial({
      color: colors.belly, roughness: 0.7, metalness: 0.05, flatShading: true,
    });
    this.membraneMat = new THREE.MeshStandardMaterial({
      color: colors.membrane, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.93,
    });
    this.mats.push(this.bodyMat, this.bellyMat);

    this.root.add(this.body);
    this.root.scale.setScalar(scale);

    this.buildTorso();
    this.buildNeckAndHead();
    this.buildTail();
    this.buildLeg(this.legFL, this.kneeFL, 1.05, 0.55, true);
    this.buildLeg(this.legFR, this.kneeFR, -1.05, 0.55, true);
    this.buildLeg(this.legBL, this.kneeBL, 0.95, -1.0, false);
    this.buildLeg(this.legBR, this.kneeBR, -0.95, -1.0, false);
    if (!this.hasFrontLegs) {
      // Wyverns: walk on their wings' wrist claws — small stubs instead of front legs
      this.legFL.visible = false;
      this.legFR.visible = false;
    }
    this.buildWing(this.shoulderL, this.elbowL, 1);
    this.buildWing(this.shoulderR, this.elbowR, -1);

    // Mouth fire-glow (telegraph): sprite + shared light
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,220,140,1)');
    grad.addColorStop(0.4, 'rgba(255,140,50,0.8)');
    grad.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.mouthGlowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0,
    }));
    this.mouthGlowSprite.scale.setScalar(1.6);
    this.head.add(this.mouthGlowSprite);
    this.mouthGlowSprite.position.set(0, 0.02, 0.62);
    this.mouthGlowLight = new THREE.PointLight(0xff8a30, 0, 26, 1.8);
    this.mouthGlowLight.position.set(0, 0.05, 0.8);
    this.head.add(this.mouthGlowLight);
  }

  private buildTorso(): void {
    this.body.add(this.chest);
    // Chest → belly → hips as overlapping scaled spheres (organic silhouette)
    const chestMesh = seg(this.chest, new THREE.SphereGeometry(0.72, 10, 8), this.bodyMat, 0, 0, 0.55);
    chestMesh.scale.set(0.92, 0.86, 1.35);
    const belly = seg(this.chest, new THREE.SphereGeometry(0.6, 10, 8), this.bellyMat, 0, -0.18, -0.35);
    belly.scale.set(0.82, 0.74, 1.5);
    const hips = seg(this.chest, new THREE.SphereGeometry(0.58, 10, 8), this.bodyMat, 0, 0.02, -1.25);
    hips.scale.set(0.8, 0.78, 1.05);
    // Spine spikes from neck base to tail base
    for (let i = 0; i < 7; i++) {
      const k = i / 6;
      const spike = seg(
        this.chest,
        new THREE.ConeGeometry(0.09 + 0.05 * Math.sin(k * Math.PI), 0.34 + 0.22 * Math.sin(k * Math.PI), 4),
        this.bellyMat,
        0, 0.62 - k * 0.08, 0.85 - k * 2.15,
      );
      spike.rotation.x = -0.35;
      this.spineSpikes.push(spike);
    }
  }

  private buildNeckAndHead(): void {
    let parent: THREE.Object3D = this.chest;
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.set(0, i === 0 ? 0.34 : 0.16, i === 0 ? 1.05 : 0.5);
      parent.add(g);
      const s = seg(g, new THREE.SphereGeometry(0.3 - i * 0.03, 9, 7), this.bodyMat, 0, 0, 0.22);
      s.scale.set(1, 1, 1.7);
      this.neckSegs.push(g);
      parent = g;
    }
    // Head
    parent.add(this.head);
    this.head.position.set(0, 0.14, 0.52);
    const skull = seg(this.head, new THREE.SphereGeometry(0.3, 10, 8), this.bodyMat, 0, 0.08, 0.18);
    skull.scale.set(0.85, 0.8, 1.25);
    // Snout
    const snout = seg(this.head, new THREE.SphereGeometry(0.19, 8, 7), this.bodyMat, 0, 0.0, 0.55);
    snout.scale.set(0.75, 0.62, 1.6);
    // Upper teeth
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const tooth = seg(this.head, new THREE.ConeGeometry(0.028, 0.13, 4), this.bellyMat, s * 0.13, -0.07, 0.42 + i * 0.16);
        tooth.rotation.x = Math.PI;
      }
    }
    // Hinged lower jaw
    this.head.add(this.jaw);
    this.jaw.position.set(0, -0.08, 0.12);
    const jawMesh = seg(this.jaw, new THREE.SphereGeometry(0.16, 8, 6), this.bellyMat, 0, -0.05, 0.34);
    jawMesh.scale.set(0.8, 0.5, 1.9);
    for (const s of [-1, 1]) {
      const tooth = seg(this.jaw, new THREE.ConeGeometry(0.026, 0.11, 4), this.bellyMat, s * 0.12, 0.02, 0.55);
      tooth.rotation.x = 0.2;
    }
    // Horns (two swept-back segments each)
    const hornMat = new THREE.MeshStandardMaterial({ color: this.colors.horn, roughness: 0.5, metalness: 0.25, flatShading: true });
    this.mats.push(hornMat);
    for (const s of [-1, 1]) {
      const horn1 = seg(this.head, new THREE.ConeGeometry(0.07, 0.42, 5), hornMat, s * 0.16, 0.28, -0.02);
      horn1.rotation.set(-0.75, 0, s * 0.28);
      const horn2 = seg(this.head, new THREE.ConeGeometry(0.045, 0.3, 5), hornMat, s * 0.28, 0.16, -0.18);
      horn2.rotation.set(-1.15, 0, s * 0.5);
      // Brow
      const brow = seg(this.head, new THREE.BoxGeometry(0.16, 0.05, 0.22), this.bodyMat, s * 0.17, 0.2, 0.3);
      brow.rotation.z = s * -0.25;
    }
    // Eyes (emissive)
    this.eyeMatL = new THREE.MeshStandardMaterial({
      color: this.colors.eye, emissive: this.colors.eye, emissiveIntensity: 1.4, roughness: 0.3,
    });
    this.eyeMatR = this.eyeMatL.clone();
    const eyeL = seg(this.head, new THREE.SphereGeometry(0.055, 8, 6), this.eyeMatL, 0.2, 0.12, 0.3);
    const eyeR = seg(this.head, new THREE.SphereGeometry(0.055, 8, 6), this.eyeMatR, -0.2, 0.12, 0.3);
    void eyeL; void eyeR;
  }

  private buildTail(): void {
    let parent: THREE.Object3D = this.chest;
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.position.set(0, i === 0 ? 0 : 0.02, i === 0 ? -1.7 : -0.48);
      parent.add(g);
      const r = 0.3 - i * 0.04;
      const s = seg(g, new THREE.SphereGeometry(Math.max(0.06, r), 8, 6), this.bodyMat, 0, 0, -0.24);
      s.scale.set(1, 1, 1.5);
      if (i < 5) {
        const spike = seg(g, new THREE.ConeGeometry(0.05, 0.18, 4), this.bellyMat, 0, r * 0.9, -0.1);
        spike.rotation.x = -0.3;
      }
      this.tailSegs.push(g);
      parent = g;
    }
    // Tail spade
    const spade = seg(parent as THREE.Group, new THREE.ConeGeometry(0.22, 0.5, 4), this.bellyMat, 0, 0, -0.5);
    spade.rotation.x = -Math.PI / 2;
    spade.scale.set(1, 1, 0.4);
  }

  private buildLeg(hip: THREE.Group, knee: THREE.Group, x: number, z: number, front: boolean): void {
    hip.position.set(x, -0.32, z);
    this.chest.add(hip);
    const thigh = seg(hip, new THREE.SphereGeometry(0.24, 8, 6), this.bodyMat, 0, -0.14, 0);
    thigh.scale.set(0.9, 1.6, 1);
    knee.position.set(0, -0.5, 0.04);
    hip.add(knee);
    const shin = seg(knee, new THREE.SphereGeometry(0.16, 7, 6), this.bodyMat, 0, -0.2, 0);
    shin.scale.set(0.8, 1.8, 0.9);
    const foot = seg(knee, new THREE.BoxGeometry(0.22, 0.1, 0.34), this.bellyMat, 0, -0.44, 0.08);
    // Claws
    for (let i = -1; i <= 1; i++) {
      const claw = seg(knee, new THREE.ConeGeometry(0.035, 0.16, 4), this.bellyMat, i * 0.08, -0.47, 0.26);
      claw.rotation.x = Math.PI / 2.2;
    }
    void front;
  }

  private buildWing(shoulder: THREE.Group, elbow: THREE.Group, side: number): void {
    shoulder.position.set(side * 0.55, 0.35, 0.42);
    this.chest.add(shoulder);
    // Upper arm bone
    const upper = seg(shoulder, new THREE.CylinderGeometry(0.075, 0.09, 1.05, 6), this.bodyMat, side * 0.42, 0.06, 0);
    upper.rotation.z = side * Math.PI / 2;
    elbow.position.set(side * 0.95, 0.06, 0);
    shoulder.add(elbow);
    // Forearm bone
    const fore = seg(elbow, new THREE.CylinderGeometry(0.055, 0.07, 1.15, 6), this.bodyMat, side * 0.5, 0, 0);
    fore.rotation.z = side * Math.PI / 2;
    // Finger bones fanning from the wrist + a membrane fan between them
    const fingerTips: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      const ang = (-0.42 + i * 0.3) * side;
      const len = 1.35 - Math.abs(i - 1.4) * 0.14;
      const finger = seg(elbow, new THREE.CylinderGeometry(0.018, 0.032, len, 5), this.bodyMat, side * (0.98 + Math.cos(ang) * len * 0.5), Math.sin(ang) * len * 0.62, -0.12 + i * 0.09);
      finger.rotation.z = side * (Math.PI / 2 - ang * 0.55);
      fingerTips.push(new THREE.Vector3(side * (1.0 + len), Math.sin(ang) * len * 1.05, -0.05 + i * 0.16));
    }
    // Membrane: triangle fan wrist → tips → back to the torso flank
    const wrist = new THREE.Vector3(side * 1.0, 0, -0.05);
    const flank = new THREE.Vector3(side * 0.1, -0.1, -1.1);
    const verts: number[] = [];
    const push = (v: THREE.Vector3) => verts.push(v.x, v.y, v.z);
    push(wrist);
    for (const tip of fingerTips) push(tip);
    push(new THREE.Vector3(side * 1.05, -0.45, -0.7));
    push(flank);
    const indices: number[] = [];
    for (let i = 1; i <= 4; i++) {
      indices.push(0, i, i + 1);
    }
    indices.push(0, 5, 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const membrane = new THREE.Mesh(geo, this.membraneMat);
    membrane.castShadow = true;
    elbow.add(membrane);
    // Small wing claw at the wrist
    const claw = seg(elbow, new THREE.ConeGeometry(0.04, 0.18, 4), this.bellyMat, side * 1.02, 0.08, 0.06);
    claw.rotation.z = side * -0.9;
  }

  // ---------------------------------------------------------------- queries

  /** World-space mouth position (fire origin). */
  mouthWorldPos(out: THREE.Vector3): THREE.Vector3 {
    return this.head.localToWorld(out.set(0, -0.02, 0.75));
  }

  /** World-space head center (hit sphere / aim reference). */
  headWorldPos(out: THREE.Vector3): THREE.Vector3 {
    return this.head.localToWorld(out.set(0, 0.1, 0.3));
  }

  /** World-space body center. */
  bodyWorldPos(out: THREE.Vector3): THREE.Vector3 {
    return this.chest.localToWorld(out.set(0, 0, -0.2));
  }

  /** Hit flash on the scales. */
  flash(): void {
    this.flashT = 1;
  }

  /** Mouth charge glow 0..1 (fire telegraph). */
  mouthGlow(k: number): void {
    this.mouthGlowSprite.material.opacity = k * 0.95;
    this.mouthGlowSprite.scale.setScalar(1.1 + k * 1.5);
    this.mouthGlowLight.intensity = gfxRuntime.pointLights ? k * 5.5 : 0;
  }

  /** Eye glow intensity (aggression / enrage). */
  setEyeGlow(k: number): void {
    this.eyeGlowSm = k;
  }

  // ---------------------------------------------------------------- animate

  update(dt: number, s: DragonAnimState): void {
    this.t += dt;

    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 3);
      const e = this.flashT * 0.7;
      this.bodyMat.emissive.setRGB(e, e * 0.35, e * 0.1);
      this.bellyMat.emissive.setRGB(e, e * 0.35, e * 0.1);
    }
    const eyeGlow = 1.2 + this.eyeGlowSm * 2.2 + (s.mode === 'fire_windup' ? s.t * 2 : 0);
    this.eyeMatL.emissiveIntensity = eyeGlow;
    this.eyeMatR.emissiveIntensity = eyeGlow;

    // Default neutral pose (folded, everything smoothed toward targets)
    const flapRate = s.mode === 'takeoff' ? 8.5 : s.mode === 'fly' ? 5.2 : 2.2;
    if (s.mode === 'fly' || s.mode === 'takeoff' || s.mode === 'glide' || s.mode === 'land') {
      this.flapPhase += dt * flapRate;
    } else if (s.mode !== 'dead' && s.mode !== 'die') {
      this.flapPhase += dt * 1.1;
    }
    const ph = this.flapPhase;
    if (s.mode === 'walk' || s.mode === 'idle' || s.mode === 'sleep') {
      this.walkPhase += dt * (2.2 + s.speed * 1.6);
    }
    const wp = this.walkPhase;

    // Interp helper (damp current toward target)
    const lerpTo = (g: THREE.Object3D, x: number, y: number, z: number, k = 10 * dt) => {
      g.rotation.x += (x - g.rotation.x) * Math.min(1, k);
      g.rotation.y += (y - g.rotation.y) * Math.min(1, k);
      g.rotation.z += (z - g.rotation.z) * Math.min(1, k);
    };

    // Wing defaults
    let shL = { x: 0, y: 0.15, z: 0.25 };  // folded against the body
    let shR = { x: 0, y: -0.15, z: -0.25 };
    let elb = 0.85;

    switch (s.mode) {
      case 'sleep': {
        // Curled up: neck and tail wrapped, legs folded
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], 0.12, 0.5, 0, 6 * dt);
        }
        lerpTo(this.head, 0.25, 0, 0, 6 * dt);
        for (let i = 0; i < this.tailSegs.length; i++) {
          lerpTo(this.tailSegs[i], 0.02, -0.42, 0, 5 * dt);
        }
        this.foldLegs(6 * dt, true);
        const breathe = Math.sin(this.t * 0.9) * 0.03;
        this.chest.scale.setScalar(1 + breathe).multiplyScalar(1);
        this.jaw.rotation.x = 0.06 + Math.sin(this.t * 0.7) * 0.03;
        break;
      }
      case 'idle': {
        for (let i = 0; i < this.neckSegs.length; i++) {
          const sway = Math.sin(this.t * 0.6 + i * 0.5) * 0.1;
          lerpTo(this.neckSegs[i], -0.08, sway, 0);
        }
        lerpTo(this.head, -0.06 + Math.sin(this.t * 0.8) * 0.06, Math.sin(this.t * 0.35) * 0.25, 0);
        for (let i = 0; i < this.tailSegs.length; i++) {
          lerpTo(this.tailSegs[i], 0, Math.sin(this.t * 1.1 - i * 0.55) * 0.14, 0, 6 * dt);
        }
        this.foldLegs(8 * dt, false);
        this.jaw.rotation.x = 0.05 + Math.sin(this.t * 1.7) * 0.02;
        this.chest.scale.setScalar(1 + Math.sin(this.t * 1.5) * 0.02);
        break;
      }
      case 'walk': {
        const stride = Math.min(1, s.speed / 3.5);
        const pairs: Array<[THREE.Group, number]> = [
          [this.legFL, 0], [this.legBR, 0], [this.legFR, Math.PI], [this.legBL, Math.PI],
        ];
        for (const [leg, off] of pairs) {
          if (!leg.visible) continue;
          const sw = Math.sin(wp * 2.4 + off) * 0.55 * stride;
          lerpTo(leg, sw, 0, 0, 18 * dt);
          const knee = leg === this.legFL ? this.kneeFL : leg === this.legFR ? this.kneeFR : leg === this.legBL ? this.kneeBL : this.kneeBR;
          lerpTo(knee, Math.max(0, -Math.sin(wp * 2.4 + off - 0.7)) * 0.85 * stride, 0, 0, 18 * dt);
        }
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], -0.06 + Math.sin(wp * 4.8 + i) * 0.05, 0, 0);
        }
        lerpTo(this.head, -0.05, Math.sin(wp * 2.4) * 0.08, 0);
        for (let i = 0; i < this.tailSegs.length; i++) {
          lerpTo(this.tailSegs[i], Math.sin(this.t * 2 - i * 0.6) * 0.06, Math.sin(wp * 2.4 - i * 0.6) * 0.18 * stride, 0, 8 * dt);
        }
        this.body.position.y = Math.abs(Math.sin(wp * 2.4)) * 0.07 * stride;
        this.chest.scale.setScalar(1);
        this.jaw.rotation.x = 0.04;
        break;
      }
      case 'fly':
      case 'takeoff': {
        const amp = s.mode === 'takeoff' ? 1.15 : 0.85;
        const flap = Math.sin(ph) * amp;
        shL = { x: -0.1, y: 0.25 + flap * 0.55, z: -0.5 - flap * 0.75 };
        shR = { x: -0.1, y: -0.25 - flap * 0.55, z: 0.5 + flap * 0.75 };
        elb = 0.55 + Math.sin(ph - 0.9) * 0.35;
        // Body undulates slightly with each beat; tail streams a wave
        this.body.position.y = Math.sin(ph) * 0.1;
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], 0.1 + Math.sin(ph - i * 0.5) * 0.06, 0, 0);
        }
        lerpTo(this.head, -0.12, 0, 0);
        for (let i = 0; i < this.tailSegs.length; i++) {
          lerpTo(this.tailSegs[i], Math.sin(this.t * 2.6 - i * 0.7) * 0.1, Math.sin(ph * 0.5 - i * 0.5) * 0.08, 0, 6 * dt);
        }
        // Legs tucked in flight
        this.foldLegs(8 * dt, false, true);
        this.chest.scale.setScalar(1);
        this.jaw.rotation.x = 0.08 + Math.sin(this.t * 1.3) * 0.04;
        break;
      }
      case 'glide': {
        // Wings wide and still, banking with the turn
        const bank = s.turn;
        shL = { x: -0.05, y: 0.55 + bank * 0.2, z: -1.05 };
        shR = { x: -0.05, y: -0.55 - bank * 0.2, z: 1.05 };
        elb = 0.22 + Math.sin(this.t * 1.4) * 0.04;
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], 0.06, 0, 0);
        }
        lerpTo(this.head, -0.05, 0, 0);
        for (let i = 0; i < this.tailSegs.length; i++) {
          lerpTo(this.tailSegs[i], 0, -bank * 0.22 + Math.sin(this.t * 2 - i * 0.6) * 0.05, 0, 5 * dt);
        }
        this.foldLegs(8 * dt, false, true);
        this.body.position.y = 0;
        break;
      }
      case 'land': {
        // Wings flared wide to brake, legs reaching down
        const k = s.t;
        shL = { x: 0.1, y: 0.7, z: -1.25 - k * 0.15 };
        shR = { x: 0.1, y: -0.7, z: 1.25 + k * 0.15 };
        elb = 0.15;
        const reach = k * 0.5;
        for (const [leg, knee] of [[this.legFL, this.kneeFL], [this.legFR, this.kneeFR], [this.legBL, this.kneeBL], [this.legBR, this.kneeBR]] as Array<[THREE.Group, THREE.Group]>) {
          if (!leg.visible) continue;
          lerpTo(leg, 0.35 - reach, 0, 0, 12 * dt);
          lerpTo(knee, 0.4 - k * 0.3, 0, 0, 12 * dt);
        }
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], 0.05, 0, 0);
        }
        lerpTo(this.head, 0.1, 0, 0);
        for (let i = 0; i < this.tailSegs.length; i++) {
          lerpTo(this.tailSegs[i], 0, Math.sin(i * 0.5) * 0.1, 0, 6 * dt);
        }
        break;
      }
      case 'attack_bite': {
        const k = s.t;
        let neckX: number, headX: number, lunge: number;
        if (k < 0.3) {
          const u = k / 0.3;
          neckX = 0.35 * u; headX = 0.3 * u; lunge = -0.15 * u;
        } else if (k < 0.55) {
          const u = (k - 0.3) / 0.25;
          neckX = 0.35 - 0.95 * u; headX = 0.3 - 0.4 * u; lunge = -0.15 + 0.75 * u;
        } else {
          const u = (k - 0.55) / 0.45;
          neckX = -0.6 + 0.6 * u; headX = -0.1 + 0.1 * u; lunge = 0.6 - 0.6 * u;
        }
        for (let i = 0; i < this.neckSegs.length; i++) {
          this.neckSegs[i].rotation.x += (neckX / 3 - this.neckSegs[i].rotation.x) * Math.min(1, 22 * dt);
          this.neckSegs[i].position.z = 0.5 + lunge * 0.16;
        }
        lerpTo(this.head, headX, 0, 0, 22 * dt);
        // Jaw: opens on the lunge, snaps shut
        this.mouthOpenSm += ((k > 0.3 && k < 0.62 ? 0.7 : 0.06) - this.mouthOpenSm) * Math.min(1, 25 * dt);
        this.jaw.rotation.x = this.mouthOpenSm;
        this.foldLegs(10 * dt, false);
        break;
      }
      case 'attack_claw': {
        const k = s.t;
        // Sweep the left wing-claw / front leg in an arc
        const leg = this.legFL.visible ? this.legFL : this.shoulderL;
        const knee = this.legFL.visible ? this.kneeFL : this.elbowL;
        let lift: number, sweep: number;
        if (k < 0.35) {
          const u = k / 0.35;
          lift = -1.15 * u; sweep = 0.5 * u;
        } else if (k < 0.65) {
          const u = (k - 0.35) / 0.3;
          lift = -1.15 + 1.35 * u; sweep = 0.5 - 1.5 * u;
        } else {
          const u = (k - 0.65) / 0.35;
          lift = 0.2 * (1 - u); sweep = -1 + u;
        }
        if (this.legFL.visible) {
          lerpTo(this.legFL, lift, sweep, 0, 26 * dt);
          lerpTo(this.kneeFL, Math.max(0, -lift * 0.6), 0, 0, 26 * dt);
        } else {
          lerpTo(this.shoulderL, lift * 0.6, 0.4 + sweep * 0.5, -0.7, 26 * dt);
        }
        void knee;
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], -0.12, 0.14, 0, 12 * dt);
        }
        lerpTo(this.head, 0.05, 0, 0, 12 * dt);
        this.foldLegs(10 * dt, false);
        this.jaw.rotation.x = 0.15;
        break;
      }
      case 'attack_tail': {
        const k = s.t;
        // Travelling yaw impulse down the tail
        for (let i = 0; i < this.tailSegs.length; i++) {
          const local = Math.sin((k * Math.PI * 2.2 - i * 0.55)) * Math.exp(-Math.abs(k - 0.45) * 1.2);
          const amp = 0.55 * (i / this.tailSegs.length + 0.3);
          this.tailSegs[i].rotation.y += (local * amp - this.tailSegs[i].rotation.y) * Math.min(1, 26 * dt);
          this.tailSegs[i].rotation.x += (0 - this.tailSegs[i].rotation.x) * Math.min(1, 10 * dt);
        }
        // Body counter-twist
        this.chest.rotation.y = -Math.sin(k * Math.PI * 2) * 0.28;
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], 0.05, -0.18, 0, 12 * dt);
        }
        this.foldLegs(10 * dt, false);
        break;
      }
      case 'fire_windup': {
        const k = s.t;
        // Rear back, chest swells, jaw cracks open with growing glow
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], 0.34 * k, 0, 0, 9 * dt);
        }
        lerpTo(this.head, 0.36 * k, 0, 0, 9 * dt);
        this.mouthOpenSm += (k * 0.5 - this.mouthOpenSm) * Math.min(1, 9 * dt);
        this.jaw.rotation.x = this.mouthOpenSm;
        this.chest.scale.setScalar(1 + k * 0.09);
        // Wings half-spread for balance
        shL = { x: 0, y: 0.2 + k * 0.25, z: -0.3 - k * 0.55 };
        shR = { x: 0, y: -0.2 - k * 0.25, z: 0.3 + k * 0.55 };
        elb = 0.75;
        this.foldLegs(10 * dt, false);
        break;
      }
      case 'fire_breath': {
        // Head thrust forward, jaw wide, shaking with the roar
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], -0.2, Math.sin(this.t * 34) * 0.03, 0, 14 * dt);
        }
        lerpTo(this.head, -0.08, Math.sin(this.t * 29) * 0.05, 0, 14 * dt);
        this.mouthOpenSm += (0.95 - this.mouthOpenSm) * Math.min(1, 18 * dt);
        this.jaw.rotation.x = this.mouthOpenSm;
        this.chest.scale.setScalar(1.06);
        shL = { x: 0, y: 0.45, z: -0.6 };
        shR = { x: 0, y: -0.45, z: 0.6 };
        elb = 0.6;
        this.foldLegs(12 * dt, false);
        break;
      }
      case 'hurt': {
        const k = 1 - s.t;
        // Recoil backward, wings thrown out
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], 0.4 * k, 0, 0, 20 * dt);
        }
        lerpTo(this.head, 0.3 * k, Math.sin(this.t * 26) * 0.08 * k, 0, 20 * dt);
        shL = { x: 0, y: 0.3 + k * 0.5, z: -0.4 - k * 0.8 };
        shR = { x: 0, y: -0.3 - k * 0.5, z: 0.4 + k * 0.8 };
        elb = 0.5;
        for (let i = 0; i < this.tailSegs.length; i++) {
          lerpTo(this.tailSegs[i], 0.1 * k, Math.sin(i * 0.6) * 0.3 * k, 0, 18 * dt);
        }
        this.foldLegs(10 * dt, false);
        this.jaw.rotation.x = 0.3 * k;
        break;
      }
      case 'die':
      case 'dead': {
        const k = s.mode === 'dead' ? 1 : s.t;
        // Collapse: roll to the side, wings splay, neck droops
        this.chest.rotation.z = 0.95 * Math.min(1, k * 1.4);
        this.chest.rotation.x = 0;
        this.body.position.y = -0.25 * Math.min(1, k * 1.6);
        for (let i = 0; i < this.neckSegs.length; i++) {
          lerpTo(this.neckSegs[i], -0.12, 0.3, 0, 5 * dt);
        }
        lerpTo(this.head, 0.15, 0, 0, 5 * dt);
        for (let i = 0; i < this.tailSegs.length; i++) {
          lerpTo(this.tailSegs[i], 0, 0.35, 0, 5 * dt);
        }
        shL = { x: 0.2, y: 0.8, z: -1.35 };
        shR = { x: 0.2, y: -0.5, z: 0.9 };
        elb = 0.1;
        for (const [leg, knee] of [[this.legFL, this.kneeFL], [this.legFR, this.kneeFR], [this.legBL, this.kneeBL], [this.legBR, this.kneeBR]] as Array<[THREE.Group, THREE.Group]>) {
          if (!leg.visible) continue;
          lerpTo(leg, 0.9, 0, 0, 5 * dt);
          lerpTo(knee, 1.2, 0, 0, 5 * dt);
        }
        this.mouthOpenSm += (0.35 - this.mouthOpenSm) * Math.min(1, 4 * dt);
        this.jaw.rotation.x = this.mouthOpenSm;
        this.mouthGlow(0);
        this.eyeMatL.emissiveIntensity = Math.max(0, 1.2 * (1 - k * 1.5));
        this.eyeMatR.emissiveIntensity = Math.max(0, 1.2 * (1 - k * 1.5));
        break;
      }
    }

    // Apply wing pose (each mode sets its own targets above; death splays them)
    lerpTo(this.shoulderL, shL.x, shL.y, shL.z, 12 * dt);
    lerpTo(this.shoulderR, shR.x, shR.y, shR.z, 12 * dt);
    this.elbowL.rotation.z += (elb - this.elbowL.rotation.z) * Math.min(1, 10 * dt);
    this.elbowR.rotation.z += (-elb - this.elbowR.rotation.z) * Math.min(1, 10 * dt);
    // Reset chest twist unless the tail attack set it
    if (s.mode !== 'attack_tail') {
      this.chest.rotation.y += (0 - this.chest.rotation.y) * Math.min(1, 8 * dt);
    }
    if (s.mode !== 'sleep' && s.mode !== 'walk' && s.mode !== 'fire_windup' && s.mode !== 'fire_breath') {
      this.chest.scale.x += (1 - this.chest.scale.x) * Math.min(1, 6 * dt);
      this.chest.scale.y += (1 - this.chest.scale.y) * Math.min(1, 6 * dt);
      this.chest.scale.z += (1 - this.chest.scale.z) * Math.min(1, 6 * dt);
    }
  }

  /** Fold all legs (idle tuck / flight tuck / sleep curl). */
  private foldLegs(k: number, sleep: boolean, flight = false): void {
    const pairs: Array<[THREE.Group, THREE.Group]> = [
      [this.legFL, this.kneeFL], [this.legFR, this.kneeFR],
      [this.legBL, this.kneeBL], [this.legBR, this.kneeBR],
    ];
    for (const [leg, knee] of pairs) {
      if (!leg.visible) continue;
      const tx = sleep ? 0.65 : flight ? -1.25 : -0.1;
      const tk = sleep ? 1.15 : flight ? 1.9 : 0.15;
      leg.rotation.x += (tx - leg.rotation.x) * Math.min(1, k);
      leg.rotation.y += (0 - leg.rotation.y) * Math.min(1, k);
      leg.rotation.z += (0 - leg.rotation.z) * Math.min(1, k);
      knee.rotation.x += (tk - knee.rotation.x) * Math.min(1, k);
      knee.rotation.y += (0 - knee.rotation.y) * Math.min(1, k);
    }
  }

  dispose(): void {
    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
      }
    });
    for (const m of this.mats) m.dispose();
    this.membraneMat.dispose();
    this.eyeMatL.dispose();
    this.eyeMatR.dispose();
    (this.mouthGlowSprite.material as THREE.SpriteMaterial).map?.dispose();
    (this.mouthGlowSprite.material as THREE.SpriteMaterial).dispose();
  }
}
