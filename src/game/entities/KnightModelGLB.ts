import * as THREE from 'three';
import { type AnimParams, type CharacterVisual, type WeaponKind } from './CharacterModel';
import { damp } from '../core/MathUtils';

/**
 * Fase 5 — KnightModelGLB.
 * The player's body: the repository's medieval knight, rigged offline into
 * knight_rigged.glb (real glTF skin + 15 landmark bones + the statue sword
 * and shield as hideable rigid props hanging from the wrists).
 *
 * This class drives the skeleton procedurally — a full animation layer:
 *   locomotion (idle / walk / run with counter-rotation, bob and knee
 *   extension), jump / fall / landing absorb, dodge roll (full somersault),
 *   surface swim, horse riding, block (shield brace), bow aim + release,
 *   five attack curves (diagonal, backhand, overhead smash, thrust, bow
 *   snap) and a hit-reaction recoil. The statue sword rests in the right
 *   hand; when the game equips a weapon it swaps for the kit model, and the
 *   statue shield yields to the kit shield on the left forearm.
 *
 * Convention: character faces +Z. RIGHT side = -X (sword arm, j_*R bones),
 * LEFT side = +X (shield arm, j_*L bones). Limb rotation about +X moves a
 * hanging limb backward (-Z); about -Z the right arm raises outward.
 */
export interface KnightVisualDeps {
  scene: THREE.Object3D;
  weaponFactory?: (kind: Exclude<WeaponKind, 'none'>) => THREE.Object3D | null;
  shieldFactory?: () => THREE.Object3D | null;
}

type Euler3 = [number, number, number];
interface PoseTarget { [bone: string]: Euler3 }

const BONE_NAMES = [
  'j_root', 'j_torso', 'j_head',
  'j_shoulderR', 'j_elbowR', 'j_wristR',
  'j_shoulderL', 'j_elbowL', 'j_wristL',
  'j_hipR', 'j_kneeR', 'j_ankleR',
  'j_hipL', 'j_kneeL', 'j_ankleL',
] as const;

export class KnightModelGLB implements CharacterVisual {
  readonly root = new THREE.Group();
  private bones = new Map<string, THREE.Object3D>();
  private inner = new THREE.Group();       // bob / pitch wrapper inside root
  private flashMats: THREE.MeshStandardMaterial[] = [];
  private swordProp: THREE.Object3D | null = null;
  private shieldProp: THREE.Object3D | null = null;
  private handSlot = new THREE.Group();    // active weapon — right wrist
  private armSlot = new THREE.Group();     // active shield — left forearm

  private weaponKind: WeaponKind = 'none';
  private activeWeapon: THREE.Object3D | null = null;
  private activeShield: THREE.Object3D | null = null;
  private wantsShield = false;

  private t = 0;
  private phase = Math.random() * 8;
  private flashT = 0;
  private hitT = 0;
  private landT = 0;
  private wasGrounded = true;
  private airT = 0;
  private speedSm = 0;
  private cur: PoseTarget = {};
  private weaponFactory?: KnightVisualDeps['weaponFactory'];
  private shieldFactory?: KnightVisualDeps['shieldFactory'];

  constructor(deps: KnightVisualDeps) {
    this.weaponFactory = deps.weaponFactory;
    this.shieldFactory = deps.shieldFactory;
    const scene = deps.scene;

    // collect bones + meshes
    for (const name of BONE_NAMES) {
      const b = scene.getObjectByName(name);
      if (b) this.bones.set(name, b);
    }
    this.swordProp = scene.getObjectByName('j_sword_held') ?? null;
    this.shieldProp = scene.getObjectByName('j_shield_held') ?? null;

    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // skeleton moves beyond the bind bbox
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.isMeshStandardMaterial && !this.flashMats.includes(std)) this.flashMats.push(std);
        }
      }
    });

    // attach slots
    const wristR = this.bones.get('j_wristR');
    if (wristR) { wristR.add(this.handSlot); }
    const elbowL = this.bones.get('j_elbowL');
    if (elbowL) { elbowL.add(this.armSlot); this.armSlot.position.set(0, -0.12, 0.05); }

    // The GLB clone root can arrive with visible=false (something in the boot
    // pipeline toggles loaded model roots); the knight must always render.
    // GLTF scene roots can arrive with visible=false after loader round-trips;
    // the player's body must always render.
    scene.visible = true;

    this.inner.add(scene);
    this.root.add(this.inner);
    this.refreshProps();
  }

  // ------------------------------------------------------------ state API

  setWeapon(kind: WeaponKind): void {
    this.weaponKind = kind;
    this.refreshProps();
  }

  setShield(visible: boolean): void {
    this.wantsShield = visible;
    this.refreshProps();
  }

  get hasShieldVisible(): boolean {
    return this.wantsShield;
  }

  /** Legacy API: sword shown at rest (used by boarding crews / menus). */
  setSwordEquipped(equipped: boolean): void {
    // naval-crew legacy call: sword shown at rest
    this.setEquippedState(equipped);
  }

  setEquippedState(equipped: boolean): void {
    if (!equipped && this.weaponKind !== 'none') {
      this.weaponKind = 'none'; // holster: statue sword returns to the hand
    } else if (equipped && this.weaponKind === 'none') {
      this.weaponKind = 'sword';
    }
    this.refreshProps();
  }

  faceYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  flash(): void {
    this.flashT = 1;
    this.hitT = 1;
  }

  private refreshProps(): void {
    // statue sword: rests in the right hand whenever no kit weapon is wielded
    const showKitWeapon = this.weaponKind !== 'none';
    if (this.swordProp) this.swordProp.visible = !showKitWeapon && this.weaponKind !== 'bow';
    // kit weapon in the right hand
    if (this.activeWeapon) {
      this.handSlot.remove(this.activeWeapon);
      this.activeWeapon = null;
    }
    if (showKitWeapon && this.weaponFactory) {
      const w = this.weaponFactory(this.weaponKind as Exclude<WeaponKind, 'none'>);
      if (w) {
        if (this.weaponKind === 'bow') {
          // bows live permanently in the LEFT hand (aim code extends the arm)
          const wristL = this.bones.get('j_wristL');
          if (wristL) {
            wristL.add(w);
            w.position.set(0.02, -0.08, 0.05);
            w.rotation.set(0, 0, 0.08);
          }
        } else {
          this.handSlot.add(w);
        }
        this.activeWeapon = w;
        this.tuneWeaponPose(this.weaponKind);
      }
    }
    // shields: the statue shield yields to the kit shield
    if (this.activeShield) {
      this.armSlot.remove(this.activeShield);
      this.activeShield = null;
    }
    if (this.wantsShield && this.shieldFactory) {
      const s = this.shieldFactory();
      if (s) {
        this.armSlot.add(s);
        this.activeShield = s;
        this.tuneShieldPose();
      }
    }
    if (this.shieldProp) this.shieldProp.visible = !this.activeShield;
  }

  /** Per-weapon grip orientation in the hand (tuned by eye). */
  private tuneWeaponPose(kind: WeaponKind): void {
    if (!this.activeWeapon) return;
    switch (kind) {
      case 'sword':
        this.activeWeapon.rotation.set(0.25, 0, 0.12);
        this.activeWeapon.position.set(0, -0.02, 0.04);
        break;
      case 'axe':
        this.activeWeapon.rotation.set(0.3, 0, 0.2);
        break;
      case 'spear':
        this.activeWeapon.rotation.set(0.12, 0, 0.06);
        break;
      case 'bow':
        // bow held vertically in the LEFT hand — moved at aim time
        this.activeWeapon.rotation.set(0, 0, 0);
        break;
      default:
        break;
    }
  }

  private tuneShieldPose(): void {
    if (!this.activeShield) return;
    this.activeShield.rotation.set(-Math.PI / 2 + 0.35, 0, 0);
    this.activeShield.position.set(-0.02, 0, 0.1);
  }

  // ------------------------------------------------------------ animation

  private zero(): PoseTarget {
    const p: PoseTarget = {};
    for (const n of BONE_NAMES) p[n] = [0, 0, 0];
    return p;
  }

  update(p: AnimParams): void {
    this.t += p.dt;
    const dt = Math.max(1e-4, p.dt);
    const target = this.zero();

    // speed smoothing + phase
    this.speedSm = damp(this.speedSm, p.speed, 8, dt);
    const moving = p.moving && this.speedSm > 0.25;
    if (moving) this.phase += dt * (this.speedSm > 4.4 ? 9.4 : 6.6);
    const ph = this.phase;

    // landing detection
    if (p.grounded && !this.wasGrounded) this.landT = p.attackT > 0 || (p.rollT ?? 0) > 0 ? 0 : 0.34;
    if (!p.grounded) this.airT += dt; else this.airT = 0;
    this.wasGrounded = p.grounded;
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);

    // ---- global overrides, in priority order ----
    const rollT = p.rollT ?? 0;
    if (rollT > 0) { this.poseRoll(target, rollT, moving, ph); this.apply(target, dt, true); this.post(p); return; }
    if (p.swimming) { this.poseSwim(target, ph, p); this.apply(target, dt, true); this.post(p); return; }
    if (p.riding) { this.poseRide(target, p); this.apply(target, dt, true); this.post(p); return; }
    if (!p.grounded) { this.poseAir(target, this.airT); this.apply(target, dt, true); this.post(p); return; }

    // ---- base locomotion ----
    this.poseLocomotion(target, p, moving, ph);

    // ---- landing absorb ----
    if (this.landT > 0) {
      const k = this.landT / 0.34;
      const e = k * k;
      target.j_kneeR = [target.j_kneeR[0] + 0.85 * e, 0, 0];
      target.j_kneeL = [target.j_kneeL[0] + 0.85 * e, 0, 0];
      target.j_hipR = [target.j_hipR[0] - 0.5 * e, 0, 0];
      target.j_hipL = [target.j_hipL[0] - 0.5 * e, 0, 0];
      target.j_torso = [target.j_torso[0] + 0.28 * e, target.j_torso[1], 0];
      this.inner.position.y = -0.09 * e;
    } else if (p.grounded && this.inner.position.y !== 0) {
      this.inner.position.y = damp(this.inner.position.y, 0, 10, dt);
    }

    // ---- bow aim (overrides arms) ----
    const bowDraw = p.bowDraw ?? 0;
    if (bowDraw > 0) this.poseBowAim(target, p, bowDraw, moving, ph);

    // ---- block overlay ----
    const blockT = p.blockT ?? 0;
    if (blockT > 0) this.poseBlock(target, blockT, this.activeShield !== null);

    // ---- attack overlays (timed curves — applied directly) ----
    if (p.attackT > 0) {
      this.poseAttack(target, p.attackT, p.attackKind ?? 'light1', bowDraw);
      this.apply(target, dt, true);
      this.post(p);
      return;
    }

    // ---- hit reaction ----
    if (this.hitT > 0) {
      const k = this.hitT;
      target.j_torso = [target.j_torso[0] - 0.22 * k, target.j_torso[1], 0];
      target.j_head = [target.j_head[0] - 0.18 * k, 0, 0];
    }

    this.apply(target, dt, false);
    this.post(p);
  }

  /** Per-frame post steps (flash decay, prop visibility by context). */
  private post(p: AnimParams): void {
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - p.dt * 3.2);
      const e = this.flashT * 0.6;
      for (const m of this.flashMats) m.emissive.setRGB(e, e * 0.12, e * 0.08);
    }
    if (this.hitT > 0) this.hitT = Math.max(0, this.hitT - p.dt * 2.6);
    // the statue shield tucks away while aiming a bow
    if (this.shieldProp) {
      this.shieldProp.visible = !this.activeShield && (p.bowDraw ?? 0) < 0;
    }
    // the kit weapon stays in the hand; while swimming it is shouldered up
    if (this.activeWeapon) {
      const swim = p.swimming;
      this.activeWeapon.rotation.x = damp(
        this.activeWeapon.rotation.x, swim ? -1.2 : this.activeWeapon.userData.baseRotX ?? this.activeWeapon.rotation.x, 6, Math.max(1e-4, p.dt),
      );
    }
  }

  // ------------------------------------------------------------ pose blocks

  private poseLocomotion(t: PoseTarget, p: AnimParams, moving: boolean, ph: number): void {
    const runK = Math.min(1, this.speedSm / 6.2);
    if (moving) {
      const amp = 0.52 + runK * 0.5;
      const legPhL = Math.sin(ph);
      const legPhR = Math.sin(ph + Math.PI);
      // right leg (x<0) — j_hipR: -X = forward
      t.j_hipR = [-legPhR * amp, 0, 0];
      t.j_kneeR = [Math.max(0, -Math.sin(ph + Math.PI - 0.7)) * (0.55 + runK * 0.75), 0, 0];
      t.j_ankleR = [-0.1 + legPhR * 0.18, 0, 0];
      // left leg
      t.j_hipL = [-legPhL * amp, 0, 0];
      t.j_kneeL = [Math.max(0, -Math.sin(ph - 0.7)) * (0.55 + runK * 0.75), 0, 0];
      t.j_ankleL = [-0.1 + legPhL * 0.18, 0, 0];
      // arms counter-swing; the sword arm (R) carries the relaxed sword
      const armAmp = 0.34 + runK * 0.5;
      t.j_shoulderR = [legPhR * armAmp, 0, -0.06];
      t.j_shoulderL = [legPhL * armAmp * 0.8, 0, 0.06];
      t.j_elbowR = [-0.18 - runK * 0.35, 0, 0];
      t.j_elbowL = [-0.25 - runK * 0.3, 0, 0];
      // torso: bob, forward lean, counter-rotation
      t.j_torso = [0.05 + runK * 0.17, Math.sin(ph) * (0.05 + runK * 0.06), 0];
      t.j_head = [-0.04 - runK * 0.08, -Math.sin(ph) * 0.04, 0];
      this.inner.position.y = Math.abs(Math.sin(ph)) * 0.028 * (0.5 + runK);
    } else {
      // idle: breathing, weight shift, relaxed sword arm
      const br = Math.sin(this.t * 1.7);
      t.j_torso = [0.02 + br * 0.012, Math.sin(this.t * 0.4) * 0.02, 0];
      t.j_head = [0.0, Math.sin(this.t * 0.5) * 0.13, Math.sin(this.t * 0.33) * 0.05];
      t.j_shoulderR = [br * 0.03 - 0.04, 0, -0.05];
      t.j_shoulderL = [-br * 0.03, 0, 0.06];
      t.j_elbowR = [-0.15, 0, 0];
      t.j_elbowL = [-0.22, 0, 0];
      t.j_kneeR = [-0.04, 0, 0];
      t.j_kneeL = [-0.06, 0, 0];
      this.inner.position.y = damp(this.inner.position.y, 0, 8, 1 / 60);
      if (p.talking) {
        t.j_head = [0, Math.sin(this.t * 2.1) * 0.07, 0];
        t.j_shoulderR = [Math.sin(this.t * 3.0) * 0.16 - 0.12, 0, -0.05];
        t.j_elbowR = [-0.5, 0, 0];
      }
    }
  }

  private poseAir(t: PoseTarget, airT: number): void {
    // rising vs falling
    const fall = Math.min(1, airT / 0.45);
    t.j_shoulderR = [-0.55 - fall * 0.5, 0, -0.35 - fall * 0.2];
    t.j_shoulderL = [-0.4 - fall * 0.45, 0, 0.4 + fall * 0.2];
    t.j_elbowR = [-0.35, 0, 0];
    t.j_elbowL = [-0.3, 0, 0];
    t.j_hipR = [-0.45 + fall * 0.75, 0, 0];
    t.j_kneeR = [0.9 - fall * 0.35, 0, 0];
    t.j_hipL = [0.2 + fall * 0.35, 0, 0];
    t.j_kneeL = [0.5 + fall * 0.6, 0, 0];
    t.j_ankleR = [0.2, 0, 0];
    t.j_ankleL = [0.3, 0, 0];
    t.j_torso = [0.1 + fall * 0.1, 0, 0];
    t.j_head = [-0.12, 0, 0];
    this.inner.position.y = 0;
  }

  private poseRoll(t: PoseTarget, rollT: number, moving: boolean, ph: number): void {
    // full-body somersault around the model root (Player adds the roll pose
    // through model.root — here we tuck the limbs)
    t.j_hipR = [-1.9, 0, 0];
    t.j_hipL = [-1.7, 0, 0];
    t.j_kneeR = [1.9, 0, 0];
    t.j_kneeL = [1.75, 0, 0];
    t.j_ankleR = [0.4, 0, 0];
    t.j_ankleL = [0.35, 0, 0];
    t.j_shoulderR = [-1.35, 0, -0.3];
    t.j_shoulderL = [-1.2, 0, 0.3];
    t.j_elbowR = [-1.6, 0, 0];
    t.j_elbowL = [-1.5, 0, 0];
    t.j_torso = [0.55, 0, 0];
    t.j_head = [0.35, 0, 0];
    this.inner.position.y = -0.18 * Math.sin(rollT * Math.PI);
  }

  private poseSwim(t: PoseTarget, ph: number, p: AnimParams): void {
    // breaststroke: sweeping arms + flutter kick (body pitch handled by Player)
    const sweep = Math.sin(ph * 2.1);
    t.j_shoulderR = [-1.15 + sweep * 0.95, 0, -0.3];
    t.j_shoulderL = [-1.15 + sweep * 0.95, 0, 0.3];
    t.j_elbowR = [-0.45, 0, 0];
    t.j_elbowL = [-0.45, 0, 0];
    t.j_hipR = [0.22 + Math.sin(ph * 6) * 0.3, 0, 0];
    t.j_hipL = [0.22 + Math.sin(ph * 6 + Math.PI) * 0.3, 0, 0];
    t.j_kneeR = [-0.15, 0, 0];
    t.j_kneeL = [-0.15, 0, 0];
    t.j_ankleR = [0.35, 0, 0];
    t.j_ankleL = [0.35, 0, 0];
    t.j_torso = [0.06, 0, 0];
    t.j_head = [-0.55, 0, 0];
    this.inner.position.y = 0;
  }

  private poseRide(t: PoseTarget, p: AnimParams): void {
    const bob = Math.sin((p.rideBounce ?? 0) * Math.PI * 2);
    // legs wrap the saddle
    t.j_hipR = [-0.8, 0, -0.3];
    t.j_hipL = [-0.8, 0, 0.3];
    t.j_kneeR = [1.3, 0, 0];
    t.j_kneeL = [1.3, 0, 0];
    t.j_ankleR = [0.25, 0, 0];
    t.j_ankleL = [0.25, 0, 0];
    // arms forward on the reins
    t.j_shoulderR = [-0.5 + bob * 0.05, 0, -0.12];
    t.j_shoulderL = [-0.5 + bob * 0.05, 0, 0.12];
    t.j_elbowR = [-0.5, 0, 0];
    t.j_elbowL = [-0.5, 0, 0];
    t.j_torso = [0.1 + bob * 0.03, 0, 0];
    t.j_head = [-0.08, 0, 0];
    this.inner.position.y = Math.abs(bob) * 0.03;
  }

  private poseBowAim(t: PoseTarget, p: AnimParams, bowDraw: number, moving: boolean, ph: number): void {
    const sway = Math.sin(this.t * 1.9) * 0.014;
    // bow arm (LEFT — the kit bow sits on the hand slot at aim time)
    t.j_shoulderL = [-1.42 + sway, 0, 0.1];
    t.j_elbowL = [-0.08, 0, 0];
    // draw hand (RIGHT) pulls to the cheek as the draw completes
    t.j_shoulderR = [-1.18 + bowDraw * 0.22 + sway, 0, -0.28];
    t.j_elbowR = [-0.22 - bowDraw * 1.15, 0, 0];
    t.j_torso = [0.06, -0.24, 0];
    t.j_head = [0, 0.1, 0];
    if (moving) {
      t.j_hipR = [Math.sin(ph) * 0.26, 0, 0];
      t.j_hipL = [Math.sin(ph + Math.PI) * 0.26, 0, 0];
      t.j_kneeR = [0.2, 0, 0];
      t.j_kneeL = [0.24, 0, 0];
      this.inner.position.y = Math.abs(Math.sin(ph)) * 0.024;
    } else {
      t.j_kneeR = [-0.1, 0, 0];
      t.j_kneeL = [-0.18, 0, 0];
      this.inner.position.y = -bowDraw * 0.025;
    }

  }

  private poseBlock(t: PoseTarget, blockT: number, hasKitShield: boolean): void {
    const k = Math.min(1, blockT);
    const L = THREE.MathUtils.lerp;
    if (hasKitShield) {
      // shield raised across the front, braced
      t.j_shoulderL = [L(t.j_shoulderL[0], -1.05, k), 0, L(t.j_shoulderL[1], 0.32, k)];
      t.j_elbowL = [L(t.j_elbowL[0], -0.8, k), 0, 0];
      t.j_shoulderR = [L(t.j_shoulderR[0], -0.32, k), 0, L(t.j_shoulderR[1], -0.1, k)];
      t.j_elbowR = [L(t.j_elbowR[0], -1.4, k), 0, 0];
    } else {
      // no shield: sword held vertical in guard
      t.j_shoulderR = [L(t.j_shoulderR[0], -0.95, k), 0, L(t.j_shoulderR[1], -0.28, k)];
      t.j_elbowR = [L(t.j_elbowR[0], -1.3, k), 0, 0];
      t.j_shoulderL = [L(t.j_shoulderL[0], -0.5, k), 0, 0];
      t.j_elbowL = [L(t.j_elbowL[0], -1.0, k), 0, 0];
    }
    t.j_torso = [L(t.j_torso[0], 0.14, k), t.j_torso[1], 0];
    t.j_kneeR = [t.j_kneeR[0] + 0.28 * k, 0, 0];
    t.j_kneeL = [t.j_kneeL[0] + 0.3 * k, 0, 0];
    this.inner.position.y -= 0.05 * k;
  }

  /** Attack curves. attackT: 0→1 across the whole swing. */
  private poseAttack(t: PoseTarget, k: number, kind: string, bowDraw: number): void {
    const L = THREE.MathUtils.lerp;
    const ease = (u: number) => u * u * (3 - 2 * u);
    if (kind === 'heavy') {
      // overhead smash: windup up-back (0..0.42), slam (0.42..0.68), recover
      if (k < 0.42) {
        const u = ease(k / 0.42);
        t.j_shoulderR = [L(0, -0.4, u), 0, L(0, -2.75, u)];
        t.j_elbowR = [-0.6, 0, 0];
        t.j_torso = [0.1, L(0, -0.4, u), 0];
        t.j_head = [L(0, -0.25, u), 0, 0];
        this.inner.position.y = -0.07 * u;
      } else if (k < 0.68) {
        const u = ease((k - 0.42) / 0.26);
        t.j_shoulderR = [L(-0.4, 0.95, u), 0, L(-2.75, -0.35, u)];
        t.j_elbowR = [L(-0.6, -0.1, u), 0, 0];
        t.j_torso = [L(0.1, 0.42, u), L(-0.4, 0.42, u), 0];
        t.j_head = [L(-0.25, 0.3, u), 0, 0];
        t.j_kneeR = [0.5 * u, 0, 0];
        t.j_kneeL = [0.55 * u, 0, 0];
        this.inner.position.y = -0.07 * (1 - u) - 0.05 * u;
      } else {
        const u = (k - 0.68) / 0.32;
        t.j_shoulderR = [L(0.95, 0, u), 0, L(-0.35, -0.06, u)];
        t.j_elbowR = [L(-0.1, -0.25, u), 0, 0];
        t.j_torso = [L(0.42, 0.05, u), L(0.42, 0, u), 0];
        t.j_head = [L(0.3, 0, u), 0, 0];
        t.j_kneeR = [0.5 * (1 - u), 0, 0];
        t.j_kneeL = [0.55 * (1 - u), 0, 0];
        this.inner.position.y = -0.05 * (1 - u);
      }
      t.j_shoulderL = [-0.35, 0, 0.25];
      t.j_elbowL = [-0.9, 0, 0];
    } else if (kind === 'thrust') {
      if (k < 0.35) {
        const u = ease(k / 0.35);
        t.j_shoulderR = [L(0, -0.45, u), 0, L(0, -0.15, u)];
        t.j_elbowR = [L(0, -1.75, u), 0, 0];
        t.j_torso = [0.08, L(0, 0.4, u), 0];
        t.j_hipR = [L(0, 0.15, u), 0, 0];
        this.inner.position.y = -0.03 * u;
      } else if (k < 0.62) {
        const u = ease((k - 0.35) / 0.27);
        t.j_shoulderR = [L(-0.45, -1.55, u), 0, L(-0.15, -0.05, u)];
        t.j_elbowR = [L(-1.75, -0.05, u), 0, 0];
        t.j_torso = [0.16, L(0.4, -0.32, u), 0];
        t.j_hipR = [L(0.15, -0.4, u), 0, 0];
        t.j_kneeR = [0.25, 0, 0];
      } else {
        const u = (k - 0.62) / 0.38;
        t.j_shoulderR = [L(-1.55, 0, u), 0, -0.05 * (1 - u)];
        t.j_elbowR = [L(-0.05, -0.2, u), 0, 0];
        t.j_torso = [L(0.16, 0.04, u), L(-0.32, 0, u), 0];
        t.j_hipR = [L(-0.4, 0, u), 0, 0];
      }
      t.j_shoulderL = [-0.3, 0, 0.2];
      t.j_elbowL = [-0.85, 0, 0];
    } else if (kind === 'light2') {
      // backhand: windup right, sweep across left
      if (k < 0.35) {
        const u = ease(k / 0.35);
        t.j_shoulderR = [L(0, -1.85, u), 0, L(0, 0.6, u)];
        t.j_torso = [0.08, L(0, 0.42, u), 0];
        t.j_elbowR = [-0.3, 0, 0];
      } else if (k < 0.75) {
        const u = ease((k - 0.35) / 0.4);
        t.j_shoulderR = [L(-1.85, 0.5, u), 0, L(0.6, -0.9, u)];
        t.j_torso = [0.12, L(0.42, -0.5, u), 0];
        t.j_head = [0, L(0, -0.2, u), 0];
        t.j_hipR = [-0.2 * u, 0, 0];
      } else {
        const u = (k - 0.75) / 0.25;
        t.j_shoulderR = [L(0.5, 0, u), 0, L(-0.9, -0.06, u)];
        t.j_torso = [L(0.12, 0.03, u), L(-0.5, 0, u), 0];
        t.j_head = [0, L(-0.2, 0, u), 0];
      }
      t.j_elbowR = [-0.25, 0, 0];
      t.j_shoulderL = [-0.35, 0, 0.22];
      t.j_elbowL = [-0.9, 0, 0];
    } else if (kind === 'bowRelease') {
      // string snap: draw hand flies forward off the cheek
      const u = Math.min(1, k * 2.2);
      t.j_shoulderL = [-1.42, 0, 0.1];
      t.j_elbowL = [-0.08, 0, 0];
      t.j_shoulderR = [L(-1.4, -1.15, u), 0, -0.28];
      t.j_elbowR = [L(-1.35, -0.15, u), 0, 0];
      t.j_torso = [0.06, -0.24, 0];
    } else {
      // light1 — diagonal slash: windup up-right, cut down-left, recover
      if (k < 0.34) {
        const u = ease(k / 0.34);
        t.j_shoulderR = [L(0, -2.25, u), 0, L(0, -0.85, u)];
        t.j_torso = [0.08, L(0, -0.42, u), 0];
        t.j_elbowR = [-0.5, 0, 0];
        this.inner.position.y = -0.03 * u;
      } else if (k < 0.74) {
        const u = ease((k - 0.34) / 0.4);
        t.j_shoulderR = [L(-2.25, 0.55, u), 0, L(-0.85, 0.5, u)];
        t.j_torso = [L(0.08, 0.38, u), L(-0.42, 0.45, u), 0];
        t.j_head = [0, L(0, 0.15, u), 0];
        t.j_hipR = [-0.22 * u, 0, 0];
        t.j_kneeR = [0.3 * u, 0, 0];
        this.inner.position.y = -0.03 * (1 - u);
      } else {
        const u = (k - 0.74) / 0.26;
        t.j_shoulderR = [L(0.55, 0, u), 0, L(0.5, -0.06, u)];
        t.j_torso = [L(0.38, 0.04, u), L(0.45, 0, u), 0];
        t.j_head = [0, L(0.15, 0, u), 0];
        t.j_hipR = [-0.22 * (1 - u), 0, 0];
        t.j_kneeR = [0.3 * (1 - u), 0, 0];
      }
      t.j_elbowR = [-0.25, 0, 0];
      t.j_shoulderL = [-0.3, 0, 0.2];
      t.j_elbowL = [-0.85, 0, 0];
    }
    // free leg counter for balance on most attacks
    if (kind === 'light1' || kind === 'light2') {
      t.j_hipL = [0.1, 0, 0];
      t.j_kneeL = [0.12, 0, 0];
    }
  }

  // ------------------------------------------------------------ apply

  /** Write target eulers onto the bones. `direct` skips damping (attacks,
   * rolls, swims) so the curves stay crisp. */
  private apply(target: PoseTarget, dt: number, direct: boolean): void {
    for (const name of BONE_NAMES) {
      const b = this.bones.get(name);
      if (!b) continue;
      const tv = target[name];
      if (!tv) continue;
      if (direct) {
        b.rotation.set(tv[0], tv[1], tv[2]);
      } else {
        const c = this.cur[name] ?? [0, 0, 0] as Euler3;
        c[0] = damp(c[0], tv[0], 14, dt);
        c[1] = damp(c[1], tv[1], 14, dt);
        c[2] = damp(c[2], tv[2], 14, dt);
        this.cur[name] = c;
        b.rotation.set(c[0], c[1], c[2]);
      }
      if (direct) this.cur[name] = [tv[0], tv[1], tv[2]];
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) (m as THREE.Material).dispose();
      }
    });
  }
}
