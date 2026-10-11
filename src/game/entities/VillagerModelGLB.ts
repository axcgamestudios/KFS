import * as THREE from 'three';
import type { AnimParams, CharacterVisual, CharacterPalette, WeaponKind } from './CharacterModel';
import { damp } from '../core/MathUtils';
import type { AssetSystem } from '../world/AssetSystem';

/**
 * Fase 8 — VillagerModelGLB.
 * The repository's fuse_civilian_2.glb (Mixamo-rigged civilian) becomes the
 * body of every NPC of Puerto Cuervo. The GLB ships NO animations, so this
 * class drives the mixamo skeleton procedurally:
 *
 *   · T-pose → relaxed I-pose correction applied on load (arms down)
 *   · idle: breathing, weight shift, occasional glance
 *   · walk: leg swing + knee bend + counter-arm swing + torso bob
 *   · talk: head nods + hand gestures toward the player
 *
 * Per-NPC variety: clothes tinted from the villager palettes, seeded hair /
 * beard / moustache shades (some clean-shaven), role tools in the right hand
 * and a personal build scale. All clones share ONE geometry/texture set via
 * AssetSystem.loadAnimatedModelShared (SkeletonUtils clone).
 *
 * Bone map (fuse_civilian_2.glb, Mixamo 'mixamorig' prefix):
 *   hips → Hips_01 · spine → Spine1_03 · chest → Spine2_04
 *   neck → Neck_05 · head → Head_06
 *   arms: {L,R}Arm → {L,R}ForeArm → {L,R}Hand
 *   legs: {L,R}UpLeg → {L,R}Leg → {L,R}Foot
 */
const B = {
  hips: 'mixamorigHips_01',
  spine: 'mixamorigSpine1_03',
  chest: 'mixamorigSpine2_04',
  neck: 'mixamorigNeck_05',
  head: 'mixamorigHead_06',
  armR: 'mixamorigRightArm_027',
  foreR: 'mixamorigRightForeArm_028',
  handR: 'mixamorigRightHand_029',
  armL: 'mixamorigLeftArm_08',
  foreL: 'mixamorigLeftForeArm_09',
  handL: 'mixamorigLeftHand_010',
  upLegR: 'mixamorigRightUpLeg_049',
  legR: 'mixamorigRightLeg_050',
  footR: 'mixamorigRightFoot_051',
  upLegL: 'mixamorigLeftUpLeg_045',
  legL: 'mixamorigLeftLeg_046',
  footL: 'mixamorigLeftFoot_047',
} as const;

type BoneName = keyof typeof B;
type Euler3 = [number, number, number];
interface PoseTarget { [bone: string]: Euler3 }

/** T-pose → arms-down: computed at runtime in WORLD space (quaternion
 *  shortest-arc from the current arm direction to "hanging down, slightly
 *  out"), then converted back to the bone's local quaternion — immune to
 *  every rig's local-axis conventions. */
export function armDownQuaternion(
  armBone: THREE.Object3D,
  handBone: THREE.Object3D,
  sideOut: number,
): void {
  armBone.updateWorldMatrix(true, true);
  const shoulder = new THREE.Vector3().setFromMatrixPosition(armBone.matrixWorld);
  const hand = new THREE.Vector3().setFromMatrixPosition(handBone.matrixWorld);
  const cur = hand.sub(shoulder).normalize();
  if (cur.lengthSq() < 0.5) return; // degenerate bind
  const target = new THREE.Vector3(sideOut * 0.18, -1, 0).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(cur, target);
  const worldQ = armBone.getWorldQuaternion(new THREE.Quaternion());
  const newWorldQ = delta.multiply(worldQ);
  const parentQ = armBone.parent.getWorldQuaternion(new THREE.Quaternion());
  armBone.quaternion.copy(parentQ.invert().multiply(newWorldQ));
  armBone.updateMatrix();
}

export interface VillagerVisualDeps {
  palette: CharacterPalette;
  seed: number;
  role?: string;
  assets: AssetSystem;
  /** Built only if the GLB fails to arrive (procedural fallback body). */
  fallback?: () => CharacterVisual;
}

export class VillagerModelGLB implements CharacterVisual {
  readonly root = new THREE.Group();
  private bones = new Map<BoneName, THREE.Object3D>();
  private inner = new THREE.Group();
  private rest = new Map<BoneName, Euler3>();
  private cur: PoseTarget = {};
  private t = 0;
  private phase = Math.random() * 8;
  private speedSm = 0;
  private glanceT = 0;
  private glanceYaw = 0;
  private handSlot: THREE.Group | null = null;
  private body: THREE.Group | null = null;

  constructor(deps: VillagerVisualDeps) {
    // async body; the group stays empty until the shared model arrives
    deps.assets.loadAnimatedModelShared('fuse_civilian_2.glb').then((loaded) => {
      this.build(loaded.scene, deps);
    }).catch(() => {
      // GLB unavailable: hand the NPC the procedural villager body instead
      if (deps.fallback) {
        const fb = deps.fallback();
        this.root.add(fb.root);
        this.fallback = fb;
      }
    });
  }

  private fallback: CharacterVisual | null = null;

  private build(scene: THREE.Object3D, deps: VillagerVisualDeps): void {
    const r = (k: number) => {
      const x = Math.sin(deps.seed * 37.71 + k * 91.13) * 43758.5453;
      return x - Math.floor(x);
    };

    // --- bind bones ---
    // Bind by SEMANTIC key ('armR' → 'mixamorigRightArm_027') so the pose
    // system and applyArmsDown address bones through the short names.
    for (const [key, boneName] of Object.entries(B) as Array<[BoneName, string]>) {
      const b = scene.getObjectByName(boneName);
      if (b) {
        this.bones.set(key, b);
        this.rest.set(key, [b.rotation.x, b.rotation.y, b.rotation.z]);
      }
    }

    // --- normalise: raw export is in centimetres (bbox 180 = 1.8 m) ---
    const height = 1.68 + r(5) * 0.16;           // personal build variety
    const build = 0.94 + r(1) * 0.12;
    const scale = height / 1.80;
    this.inner.scale.setScalar(scale);

    // --- materials: clone + per-NPC tint (they are shared across clones!) ---
    const tint = new THREE.Color();
    const hairShade = new THREE.Color().setHSL(0.07 + r(7) * 0.05, 0.45 + r(8) * 0.3, 0.12 + r(9) * 0.42);
    const beardShade = new THREE.Color().setHSL(0.08, 0.4, 0.1 + r(11) * 0.45);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = mats.map((m) => (m as THREE.Material).clone());
      for (const c of clones) {
        const std = c as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial) continue;
        const name = (std.name ?? '').toLowerCase();
        if (name === 'body') {
          tint.setHex(deps.palette.tunic);
          std.color.copy(tint).multiplyScalar(0.85 + r(3) * 0.3);
          std.roughness = 0.92;
        } else if (name === 'bottom') {
          tint.setHex(deps.palette.pants);
          std.color.copy(tint).multiplyScalar(0.85 + r(4) * 0.3);
          std.roughness = 0.94;
        } else if (name === 'shoes') {
          std.color.setHex(deps.palette.boots);
        } else if (name === 'hair') {
          std.color.copy(hairShade);
        } else if (name === 'beard' || name === 'moustache') {
          std.color.copy(beardShade);
          // some villagers clean-shaven
          mesh.visible = r(10) < 0.45;
        }
        std.needsUpdate = true;
      }
      mesh.material = clones.length === 1 ? clones[0] : clones;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    });
    // slim ↔ burly variety through the chest bone scale
    const chest = this.bones.get('chest');
    if (chest) chest.scale.set(build, 1, build);

    // --- role tool in the right hand ---
    const handR = this.bones.get('handR');
    if (handR && deps.role) {
      const wood = new THREE.MeshStandardMaterial({ color: 0x6a4e2e, roughness: 0.9, metalness: 0.02 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x767c82, roughness: 0.42, metalness: 0.78 });
      let tool: THREE.Object3D | null = null;
      if (deps.role === 'smith') {
        const g = new THREE.Group();
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.3, 6), wood);
        const headM = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), steel);
        headM.position.y = 0.15;
        g.add(haft, headM);
        g.userData.villagerProp = true;
        tool = g;
      } else if (deps.role === 'fisher') {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.006, 0.75, 5), wood);
        rod.position.y = 0.3;
        rod.userData.villagerProp = true;
        tool = rod;
      } else if (deps.role === 'merchant') {
        const sack = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x9a8a66, roughness: 0.98 }),
        );
        sack.scale.y = 1.2;
        sack.userData.villagerProp = true;
        tool = sack;
      }
      if (tool) {
        handR.add(tool);
        this.handSlot = new THREE.Group();
        this.handSlot.add(tool);
        handR.add(this.handSlot);
      }
    }

    this.body = new THREE.Group();
    this.body.add(scene);
    this.inner.add(this.body);
    this.root.add(this.inner);
    // base pose: arms down from the exported T-pose
    this.applyArmsDown();
  }

  /** T-pose → relaxed A-pose (arms hang at the sides). */
  private applyArmsDown(): void {
    const armL = this.bones.get('armL');
    const armR = this.bones.get('armR');
    const handL = this.bones.get('handL');
    const handR = this.bones.get('handR');
    if (armR && handR) armDownQuaternion(armR, handR, -1);
    if (armL && handL) armDownQuaternion(armL, handL, 1);
    // update the stored rest pose so overlays start from here
    for (const [name, b] of this.bones) {
      this.rest.set(name, [b.rotation.x, b.rotation.y, b.rotation.z]);
    }
  }

  // ------------------------------------------------------------ CharacterVisual

  setWeapon(kind: WeaponKind): void { void kind; /* villagers never fight */ }
  setShield(visible: boolean): void { void visible; }
  setEquippedState(equipped: boolean): void { void equipped; }
  setSwordEquipped(equipped: boolean): void { void equipped; }
  blockImpact(): void { /* not a combatant */ }
  flash(): void { /* villagers don't take hits */ }

  faceYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  update(p: AnimParams): void {
    if (this.fallback) { this.fallback.update(p); return; }
    this.t += p.dt;
    const dt = Math.max(1e-4, p.dt);
    if (!this.body) return; // model still loading — the group is invisible

    this.speedSm = damp(this.speedSm, p.speed, 8, dt);
    const moving = p.moving && this.speedSm > 0.25;
    if (moving) this.phase += dt * (this.speedSm > 3.4 ? 8.8 : 6.2);
    const ph = this.phase;

    const target = this.basePose();
    if (moving) this.poseWalk(target, ph);
    else this.poseIdle(target, p.talking ?? false);
    this.apply(target, dt);
  }

  /** Zero-target built from the REST pose (arms-down corrected). */
  private basePose(): PoseTarget {
    const t: PoseTarget = {};
    for (const [name, e] of this.rest) t[name] = [...e] as Euler3;
    return t;
  }

  /** Idle: breathing, weight shift, glances; talk gestures override head/hand. */
  private poseIdle(t: PoseTarget, talking: boolean): void {
    const br = Math.sin(this.t * 1.6);
    const spine = t.spine ?? [0, 0, 0];
    t.spine = [spine[0] + br * 0.02, spine[1] + Math.sin(this.t * 0.4) * 0.02, spine[2]];
    const chest = t.chest ?? [0, 0, 0];
    t.chest = [chest[0] + br * 0.012, chest[1], chest[2]];
    // occasional glance to the side
    this.glanceT -= 1 / 60;
    if (this.glanceT < -2.4 && Math.random() < 0.004) {
      this.glanceT = 1.1 + Math.random() * 0.9;
      this.glanceYaw = (Math.random() - 0.5) * 0.55;
    }
    const head = t.head ?? [0, 0, 0];
    const glance = this.glanceT > 0 ? this.glanceYaw * Math.min(1, this.glanceT) : 0;
    t.head = [head[0] + Math.sin(this.t * 0.5) * 0.03, head[1] + glance, head[2]];
    // weight shift through the hips
    const hips = t.hips ?? [0, 0, 0];
    t.hips = [hips[0], hips[1], hips[2] + Math.sin(this.t * 0.33) * 0.015];

    if (talking) {
      t.head = [t.head[0] + Math.sin(this.t * 2.3) * 0.06, t.head[1] + Math.sin(this.t * 0.9) * 0.08, t.head[2]];
      // right hand gestures mid-air
      const armR = t.armR ?? [0, 0, 0];
      t.armR = [armR[0] + Math.sin(this.t * 3.1) * 0.16 - 0.28, armR[1], armR[2] + 0.5];
      const foreR = t.foreR ?? [0, 0, 0];
      t.foreR = [foreR[0] - 0.5 - Math.sin(this.t * 2.7) * 0.12, foreR[1], foreR[2]];
    }
  }

  /** Walk cycle on the mixamo rig (legs + counter-arms + bob). */
  private poseWalk(t: PoseTarget, ph: number): void {
    const runK = Math.min(1, this.speedSm / 4.2);
    const amp = 0.5 + runK * 0.35;
    const legL = Math.sin(ph);
    const legR = Math.sin(ph + Math.PI);
    // legs (mixamo legs point down: +X rotation swings back, −X forward)
    t.upLegR = [this.rz('upLegR', -legR * amp), this.ry('upLegR', 0), this.rz('upLegR', 0)];
    t.upLegL = [this.rz('upLegL', -legL * amp), this.ry('upLegL', 0), this.rz('upLegL', 0)];
    // knees bend on the passing phase
    t.legR = [this.rz('legR', Math.max(0, -Math.sin(ph + Math.PI - 0.65)) * (0.6 + runK * 0.4)), 0, 0];
    t.legL = [this.rz('legL', Math.max(0, -Math.sin(ph - 0.65)) * (0.6 + runK * 0.4)), 0, 0];
    // counter arm swing around the arms-down rest pose
    const armAmp = 0.3 + runK * 0.3;
    t.armR = [this.rx('armR', legR * armAmp), this.ry('armR', 0), this.rz('armR', 0)];
    t.armL = [this.rx('armL', legL * armAmp), this.ry('armL', 0), this.rz('armL', 0)];
    const fore = 0.25 + runK * 0.3;
    t.foreR = [this.rx('foreR', -fore), 0, 0];
    t.foreL = [this.rx('foreL', -fore), 0, 0];
    // torso: bob + counter-rotation
    const spine = t.spine ?? [0, 0, 0];
    t.spine = [spine[0] + 0.04 + runK * 0.1, spine[1] + Math.sin(ph) * 0.06, spine[2]];
    const chest = t.chest ?? [0, 0, 0];
    t.chest = [chest[0], chest[1] - Math.sin(ph) * 0.05, chest[2]];
    const head = t.head ?? [0, 0, 0];
    t.head = [head[0] - 0.03 - runK * 0.05, head[1], head[2]];
    // vertical bob through the inner wrapper (scaled space)
    this.inner.position.y = Math.abs(Math.sin(ph)) * 0.028 * (0.5 + runK);
  }

  /** rest-pose accessors (fall back to 0 when a bone is missing) */
  private rx(name: BoneName, add: number): number { return (this.rest.get(name)?.[0] ?? 0) + add; }
  private ry(name: BoneName, add: number): number { return (this.rest.get(name)?.[1] ?? 0) + add; }
  private rz(name: BoneName, add: number): number { return (this.rest.get(name)?.[2] ?? 0) + add; }

  private apply(target: PoseTarget, dt: number): void {
    for (const [name, b] of this.bones) {
      const tv = target[name];
      if (!tv) continue;
      const c = (this.cur[name] ?? [b.rotation.x, b.rotation.y, b.rotation.z]) as Euler3;
      c[0] = damp(c[0], tv[0], 12, dt);
      c[1] = damp(c[1], tv[1], 12, dt);
      c[2] = damp(c[2], tv[2], 12, dt);
      this.cur[name] = c;
      b.rotation.set(c[0], c[1], c[2]);
    }
  }

  dispose(): void {
    // shared GPU resources (SkeletonUtils clone) — only per-instance props
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.userData.villagerProp) {
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material)?.dispose?.();
      }
    });
  }
}
