import * as THREE from 'three';
import type { DragonColors, DragonAnimState } from './DragonModel';
import { gfxRuntime } from '../core/Graphics';

/**
 * Fase 4 — the black dragon from the asset repository, driven by its own
 * skeleton. The GLB ships ONE native animation (an idle loop) which plays
 * while the beast rests; every other behaviour (flight, bite, fire, hurt,
 * death) is procedurally animated over its rigged joints — the same approach
 * as the procedural DragonModel, but on the repository's real mesh.
 *
 * Joint map (from the glTF node table):
 *   neck: ACT_neck_1..4 → head_022, jaw: lower_lip_025
 *   tail: tail_1_04 → tail_2_05 → tail_3_06
 *   hind legs: Oberschenkel_L/R → lowerleg_L/R
 *   wings: upper_arm_L/R → w_C_L.001 → w1..w9 (finger fan)
 */
const NECK_CHAIN = ['ACT_neck_1_021', 'ACT_neck_2_020', 'ACT_neck_3_019', 'ACT_neck_4_01'];
const TAIL_CHAIN = ['tail_1_04', 'tail_2_05', 'tail_3_06'];
const LEGS: Array<{ hip: string; knee: string }> = [
  { hip: 'Oberschenkel_L_08', knee: 'lowerleg_L_09' },
  { hip: 'Oberschenkel_R_012', knee: 'lowerleg_R_013' },
];
const WING_ARMS = ['upper_arm_L_052', 'upper_arm_R_054'];
const WING_FINGERS: Record<string, string[]> = {
  'upper_arm_L_052': ['w1_L_058', 'w3_L_060', 'w5_L_063', 'w7_L_065', 'w9_L_067'],
  'upper_arm_R_054': ['w1_R_070', 'w3_R_072', 'w5_R_075', 'w7_R_076', 'w9_R_077'],
};

function findJoint(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && o.name === name) found = o;
  });
  return found;
}

const lerp = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);

export class DragonModelGLB {
  readonly root = new THREE.Group();
  private inner: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private joints: Record<string, THREE.Object3D> = {};
  private restPose = new Map<THREE.Object3D, THREE.Euler>();
  private t = 0;
  private phase = 0;
  private loaded = false;
  private glow = 0;
  private eyeGlow = 0;
  private mouthLight: THREE.PointLight;
  private mouthFlare: THREE.Sprite;
  private mouthAnchor = new THREE.Object3D();
  private tmp = new THREE.Vector3();

  constructor(
    private colors: DragonColors,
    private scale: number,
    loadNow: () => Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }>,
  ) {
    // Fire glow follows the mouth even before the mesh arrives
    // (Fase 9 — 60 m range: the giants are 3× bigger, the glow must reach)
    this.mouthLight = new THREE.PointLight(0xff7a2a, 0, 60, 1.8);
    // Fase 14 — fuera de la escena salvo modo clásico (ver SHARED_MOUTH_LIGHT)
    if (!DragonModelGLB.SHARED_MOUTH_LIGHT) this.mouthAnchor.add(this.mouthLight);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,220,150,1)');
    grad.addColorStop(0.5, 'rgba(255,120,40,0.6)');
    grad.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.mouthFlare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.mouthFlare.scale.setScalar(0.001);
    this.mouthAnchor.add(this.mouthFlare);
    this.root.add(this.mouthAnchor);

    loadNow().then(({ scene, clips }) => {
      this.inner = new THREE.Group();
      this.inner.add(scene);
      this.root.add(this.inner);
      // Normalize size to ~7.5 m body length, then apply def scale
      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const len = Math.max(size.x, size.z) || 6;
      // Fase 8 — bigger beasts: ~10.5 m body length before the def scale
      // (was 7.5 — the bosses read as overgrown lizards at that size)
      this.inner.scale.setScalar((10.5 / len) * this.scale);
      // The model faces +Z? Sketchfab exports usually face +Z; if the fight
      // shows it backwards we flip at integration. Rotate to face +Z (yaw 0).
      // this.inner.rotation.y = Math.PI;

      // Fase 8 — strip the export's ground plane (Plane_Material_0: a big
      // dark disc under the dragon that reads as a floating floor in-game)
      const junk: THREE.Object3D[] = [];
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && /plane/i.test(mesh.name)) junk.push(mesh);
        const light = o as unknown as { isLight?: boolean; isCamera?: boolean };
        if (light.isLight || light.isCamera) junk.push(o);
      });
      for (const j of junk) j.parent?.remove(j);

      // Bind joints
      const bind = (name: string) => {
        const j = findJoint(scene, name);
        if (j) {
          this.joints[name] = j;
          this.restPose.set(j, j.rotation.clone());
        }
        return j;
      };
      NECK_CHAIN.forEach(bind);
      bind('head_022');
      bind('lower_lip_025');
      TAIL_CHAIN.forEach(bind);
      LEGS.forEach((l) => { bind(l.hip); bind(l.knee); });
      WING_ARMS.forEach(bind);
      Object.values(WING_FINGERS).forEach((fingers) => fingers.forEach(bind));
      // Mouth anchor rides the head
      const head = this.joints['head_022'];
      if (head) {
        head.add(this.mouthAnchor);
        this.mouthAnchor.position.set(0, -0.05, 0.55);
      }

      // Fase 7 — per-dragon tint. The clone shares materials with the cached
      // template (and every other dragon), so clone FIRST then pull the body
      // toward this dragon's colours. The GLB material map:
      //   Game_dragon / Game_dragon.001 → body plates & belly · EYES → eyes
      this.applyTint(scene);

      // Native idle clip (plays while resting)
      if (clips.length > 0) {
        this.mixer = new THREE.AnimationMixer(scene);
        this.idleAction = this.mixer.clipAction(clips[0]);
        this.idleAction.play();
      }
      this.loaded = true;
    }).catch(() => {
      // Model unavailable: leave a dark scaled silhouette so the fight still works
      const fb = new THREE.Mesh(
        new THREE.IcosahedronGeometry(3.4, 1),
        new THREE.MeshStandardMaterial({ color: 0x17151a, roughness: 0.6, flatShading: true }),
      );
      this.inner = new THREE.Group();
      this.inner.add(fb);
      this.inner.scale.setScalar(this.scale);
      this.root.add(this.inner);
    });
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Fase 7 — per-dragon tint. The SkeletonUtils clone SHARES materials with
   * the cached template (and every other dragon), so clone each material
   * first, then pull the body plates toward this dragon's palette. Material
   * map of the export: Game_dragon / Game_dragon.001 → body & belly plates,
   * EYES → eyes (with a lit emissive). The ground plane ('Material') and any
   * other part stay untouched.
   */
  private applyTint(scene: THREE.Object3D): void {
    const body = new THREE.Color(this.colors.body);
    const belly = new THREE.Color(this.colors.belly);
    const eye = new THREE.Color(this.colors.eye);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = mats.map((m) => (m as THREE.Material).clone());
      let touched = false;
      clones.forEach((c, i) => {
        const std = c as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial) return;
        const name = (std.name ?? '').toLowerCase();
        if (name.includes('eyes')) {
          std.color.copy(eye);
          std.emissive?.copy(eye).multiplyScalar(0.5);
          touched = true;
        } else if (name.includes('dragon')) {
          // first dragon material = body plates, second = belly
          std.color.lerp(i === 0 && clones.length > 1 ? body : belly, 0.62);
          touched = true;
        }
        if (touched) std.needsUpdate = true;
      });
      if (touched) mesh.material = clones.length === 1 ? clones[0] : clones;
    });
  }

  flash(): void {
    if (!this.inner) return;
    this.inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if (std.emissive) {
          std.emissive.setHex(0x661a1a);
          setTimeout(() => std.emissive.setHex(0x000000), 130);
        }
      }
    });
  }

  setEyeGlow(k: number): void {
    this.eyeGlow = k;
    void this.colors;
  }

  /** Fase 14 — luces de aliento compartidas: cada dragón añadía su propia
   *  PointLight a la escena (4-6 slots permanentes multiplicando el bucle
   *  PBR de CADA píxel). Con el flag activo la luz no se cuelga y el
   *  DragonManager posiciona UNA luz compartida en quien esté escupiendo. */
  static SHARED_MOUTH_LIGHT = false;

  mouthGlow(k: number): void {
    this.glow = k;
  }

  /** Fase 14 — carga de fuego actual (0..1) para la luz compartida. */
  get glowValue(): number {
    return this.glow;
  }

  headWorldPos(out: THREE.Vector3): THREE.Vector3 {
    const head = this.joints['head_022'];
    if (head) return head.getWorldPosition(out);
    return out.copy(this.root.position);
  }

  mouthWorldPos(out: THREE.Vector3): THREE.Vector3 {
    if (this.joints['head_022']) {
      this.mouthAnchor.getWorldPosition(out);
      return out;
    }
    return out.copy(this.root.position);
  }

  bodyWorldPos(out: THREE.Vector3): THREE.Vector3 {
    const spine = this.joints[TAIL_CHAIN[0]] ?? this.joints[NECK_CHAIN[0]];
    if (spine) return spine.getWorldPosition(out);
    return out.copy(this.root.position);
  }

  update(dt: number, s: DragonAnimState): void {
    this.t += dt;
    // Mouth glow visual (fire charge)
    const g = this.glow;
    // Fase 14 — la luz propia solo existe en modo clásico; en compartido
    // la lleva el DragonManager.
    if (this.mouthLight.parent) this.mouthLight.intensity = gfxRuntime.pointLights ? g * 26 : 0;
    this.mouthFlare.scale.setScalar(0.001 + g * 2.6);
    (this.mouthFlare.material as THREE.SpriteMaterial).opacity = Math.min(1, g * 1.4);

    if (!this.loaded) return;

    // Native idle while resting; pause it during procedural modes
    if (this.mixer) {
      const idleMode = s.mode === 'sleep' || s.mode === 'idle' || s.mode === 'dead';
      this.idleAction!.setEffectiveWeight(idleMode ? 1 : 0);
      this.mixer.update(dt);
    }
    // Procedural joints must not fight the idle clip: only drive them
    // outside the resting modes.
    if (s.mode === 'sleep' || s.mode === 'idle' || s.mode === 'dead') return;

    const strideLen = s.mode === 'fly' || s.mode === 'glide' ? 5.2 : 2.4;
    this.phase += dt * Math.max(0.5, Math.abs(s.speed) / strideLen);
    const ph = this.phase;

    const set = (joint: THREE.Object3D | undefined, x: number, y: number, z: number, k = 10 * dt) => {
      if (!joint) return;
      const rest = this.restPose.get(joint)!;
      joint.rotation.x = lerp(joint.rotation.x, rest.x + x, k);
      joint.rotation.y = lerp(joint.rotation.y, rest.y + y, k);
      joint.rotation.z = lerp(joint.rotation.z, rest.z + z, k);
    };

    switch (s.mode) {
      case 'fly':
      case 'takeoff': {
        // Fase 17 — CINEMATIC FLIGHT. Real wings don't pendulum: the
        // DOWNSTROKE is a short, violent power stroke; the upstroke is a
        // slow, folded recovery. A shaped phase curve buys both, and each
        // finger trails the one before it — the wingtip whips like a sail.
        const amp = s.mode === 'takeoff' ? 1.25 : 0.85;
        const rate = s.mode === 'takeoff' ? 1.6 : 1.0;
        const cyc = (ph * 0.55 * rate) % 1;
        let flap: number;
        if (cyc < 0.36) {
          // power stroke: sharp, full extension
          flap = Math.sin((cyc / 0.36) * Math.PI);
        } else {
          // recovery: long, gentle, slightly folded
          const u = (cyc - 0.36) / 0.64;
          flap = -Math.sin(u * Math.PI) * 0.72;
        }
        // wings sweep FORWARD on the downstroke (the ellipse real wings trace)
        const sweep = -0.16 + flap * 0.34;
        set(this.joints[WING_ARMS[0]], -0.14 + sweep, 0.06 * flap, 0.55 + flap * amp, 9 * dt);
        set(this.joints[WING_ARMS[1]], -0.14 + sweep, -0.06 * flap, -0.55 - flap * amp, 9 * dt);
        // finger fan: opens hard on the power stroke, folds on recovery —
        // each finger lags a touch so the membrane WHIPS outward
        for (const arm of WING_ARMS) {
          WING_FINGERS[arm].forEach((f, i) => {
            const lag = ((ph * 0.55 * rate - (i + 1) * 0.045) % 1 + 1) % 1;
            const fFlap = lag < 0.36
              ? Math.sin((lag / 0.36) * Math.PI)
              : -Math.sin(((lag - 0.36) / 0.64) * Math.PI) * 0.72;
            set(this.joints[f], fFlap * 0.2, 0, (i % 2 === 0 ? 1 : -1) * (0.22 + Math.max(0, fFlap) * 0.4), 7 * dt);
          });
        }
        // the body rides the stroke: a breath of pitch with every beat
        if (this.inner) {
          this.inner.rotation.x = lerp(this.inner.rotation.x, -flap * 0.055, 5 * dt);
          this.inner.position.y = lerp(this.inner.position.y, flap * 0.12, 6 * dt);
        }
        // hind legs trail & sway with the beat
        LEGS.forEach((l, i) => {
          set(this.joints[l.hip], -0.78 + flap * 0.1 + Math.sin(this.t * 2.2 + i * 3) * 0.05, 0, i === 0 ? 0.08 : -0.08);
          set(this.joints[l.knee], 0.55 + Math.max(0, flap) * 0.18, 0, 0);
        });
        // tail: a travelling wave in both axes, whipping at the tip
        TAIL_CHAIN.forEach((name, i) => {
          const k = i / TAIL_CHAIN.length;
          set(
            this.joints[name],
            Math.sin(this.t * 2.6 - i * 0.8) * 0.06 + flap * 0.05 * (1 - k),
            Math.sin(ph * 3.4 - i * 0.85 + s.turn * 1.4) * (0.09 + k * 0.14),
            -s.turn * 0.2 * (0.4 + k),
            6 * dt,
          );
        });
        // neck: S-curve counter-wave so the head stays locked on the prey
        NECK_CHAIN.forEach((name, i) => {
          set(
            this.joints[name],
            -0.07 - flap * 0.035 + Math.sin(ph * 1.1 - i * 0.6) * 0.045,
            Math.sin(this.t * 1.6 - i * 0.7) * 0.03,
            0,
            5 * dt,
          );
        });
        set(this.joints['head_022'], -0.05 + flap * 0.03, 0, 0);
        break;
      }
      case 'glide': {
        // Fase 17 — the glide: wings wide with a slight dihedral, membranes
        // trembling in the wind, tail fanned as a rudder. Serene and lethal.
        const tremble = Math.sin(this.t * 9.3) * 0.035 + Math.sin(this.t * 15.7) * 0.02;
        const breath = Math.sin(this.t * 1.2) * 0.03;
        set(this.joints[WING_ARMS[0]], -0.1 + breath, 0.08, 0.78 + tremble, 6 * dt);
        set(this.joints[WING_ARMS[1]], -0.1 + breath, -0.08, -0.78 - tremble, 6 * dt);
        for (const arm of WING_ARMS) {
          WING_FINGERS[arm].forEach((f, i) => {
            set(this.joints[f], tremble * 0.5, 0, (i % 2 === 0 ? 1 : -1) * (0.3 + tremble), 5 * dt);
          });
        }
        if (this.inner) {
          this.inner.rotation.x = lerp(this.inner.rotation.x, 0.02, 4 * dt);
          this.inner.position.y = lerp(this.inner.position.y, 0, 5 * dt);
        }
        LEGS.forEach((l) => {
          set(this.joints[l.hip], -0.85, 0, 0);
          set(this.joints[l.knee], 0.72, 0, 0);
        });
        TAIL_CHAIN.forEach((name, i) => {
          const k = i / TAIL_CHAIN.length;
          set(
            this.joints[name],
            Math.sin(this.t * 1.8 - i * 0.7) * 0.04,
            -s.turn * 0.3 * (0.35 + k) + Math.sin(this.t * 2.2 - i * 0.8) * 0.05,
            -s.turn * 0.12,
            5 * dt,
          );
        });
        NECK_CHAIN.forEach((name, i) => {
          set(this.joints[name], -0.05 + Math.sin(this.t * 1.3 - i * 0.5) * 0.03, 0, 0, 5 * dt);
        });
        set(this.joints['head_022'], -0.03, 0, 0);
        break;
      }
      case 'land': {
        // wings flare wide & cup to brake, legs reach for the ground
        const k = s.t;
        const flare = 0.95 + k * 0.25;
        set(this.joints[WING_ARMS[0]], -0.28 + k * 0.1, 0.1, 0.5 + flare, 10 * dt);
        set(this.joints[WING_ARMS[1]], -0.28 + k * 0.1, -0.1, -0.5 - flare, 10 * dt);
        for (const arm of WING_ARMS) {
          WING_FINGERS[arm].forEach((f, i) => {
            set(this.joints[f], 0.1, 0, (i % 2 === 0 ? 1 : -1) * (0.5 - k * 0.2), 8 * dt);
          });
        }
        if (this.inner) {
          this.inner.rotation.x = lerp(this.inner.rotation.x, 0.06, 6 * dt);
          this.inner.position.y = lerp(this.inner.position.y, 0, 6 * dt);
        }
        LEGS.forEach((l, i) => {
          set(this.joints[l.hip], -0.35 - k * 0.5 + Math.sin(this.t * 3 + i) * 0.04, 0, 0, 9 * dt);
          set(this.joints[l.knee], 0.5 - k * 0.25, 0, 0, 9 * dt);
        });
        TAIL_CHAIN.forEach((name, i) => {
          set(this.joints[name], 0.03, Math.sin(i * 0.6 + this.t * 2) * 0.08, 0, 6 * dt);
        });
        NECK_CHAIN.forEach((name) => set(this.joints[name], 0.04, 0, 0, 7 * dt));
        set(this.joints['head_022'], 0.08, 0, 0);
        break;
      }
      case 'walk': {
        // Wing knuckle-walk: arms as front limbs, hind legs stride
        LEGS.forEach((l, i) => {
          const p = ph * Math.PI * 2 + i * Math.PI;
          set(this.joints[l.hip], Math.sin(p) * 0.42, 0, 0, 14 * dt);
          set(this.joints[l.knee], Math.max(0, Math.sin(p + 1.2)) * 0.5, 0, 0, 14 * dt);
        });
        WING_ARMS.forEach((arm, i) => {
          const p = ph * Math.PI * 2 + (i === 0 ? Math.PI : 0);
          set(this.joints[arm], Math.sin(p) * 0.3 - 0.35, 0, i === 0 ? 0.85 : -0.85, 12 * dt);
        });
        TAIL_CHAIN.forEach((name, i) => {
          set(this.joints[name], 0, Math.sin(this.t * 1.4 - i * 0.7) * 0.12, 0, 6 * dt);
        });
        NECK_CHAIN.forEach((name, i) => {
          set(this.joints[name], -0.02 + Math.sin(ph * Math.PI * 2 + i) * 0.03, 0, 0, 6 * dt);
        });
        set(this.joints['head_022'], -0.03, 0, 0);
        break;
      }
      case 'attack_bite':
      case 'fire_windup':
      case 'fire_breath': {
        // Lunge: neck coils back then strikes, jaw opens
        const k = s.t;
        const lunge = s.mode === 'fire_breath' ? k : Math.sin(k * Math.PI) * 0.55;
        NECK_CHAIN.forEach((name, i) => {
          set(this.joints[name], (s.mode === 'fire_windup' ? 0.18 : -0.2) * lunge * (1 - i * 0.15), 0, 0, 16 * dt);
        });
        set(this.joints['head_022'], (s.mode === 'fire_windup' ? 0.3 : -0.35) * lunge, 0, 0, 16 * dt);
        const jaw = this.joints['lower_lip_025'];
        if (jaw) jaw.rotation.x = lerp(jaw.rotation.x, (s.mode === 'fire_windup' ? 0.06 : 0.42) * (s.mode === 'attack_bite' ? Math.sin(k * Math.PI) : 1), 18 * dt);
        // Wings balance the strike
        set(this.joints[WING_ARMS[0]], -0.5, 0, 0.7 + lunge * 0.3, 10 * dt);
        set(this.joints[WING_ARMS[1]], -0.5, 0, -0.7 - lunge * 0.3, 10 * dt);
        break;
      }
      case 'attack_claw': {
        const k = Math.sin(s.t * Math.PI);
        LEGS.forEach((l, i) => {
          set(this.joints[l.hip], i === 0 ? -0.9 * k : 0.1, 0, 0, 16 * dt);
          set(this.joints[l.knee], i === 0 ? 0.8 * k : 0.1, 0, 0, 16 * dt);
        });
        NECK_CHAIN.forEach((name) => set(this.joints[name], -0.12 * k, 0, 0, 12 * dt));
        break;
      }
      case 'attack_tail': {
        const wave = Math.sin(s.t * Math.PI);
        TAIL_CHAIN.forEach((name, i) => {
          set(this.joints[name], 0, Math.sin(s.t * Math.PI * 2 - i * 0.8) * 0.5 * wave, 0.1 * wave, 14 * dt);
        });
        break;
      }
      case 'hurt': {
        const k = 1 - s.t;
        NECK_CHAIN.forEach((name) => set(this.joints[name], 0.3 * k, 0.12 * k, 0, 18 * dt));
        TAIL_CHAIN.forEach((name) => set(this.joints[name], 0.25 * k, 0, 0, 12 * dt));
        set(this.joints[WING_ARMS[0]], -0.4 * k, 0, 1.1 * k, 14 * dt);
        set(this.joints[WING_ARMS[1]], -0.4 * k, 0, -1.1 * k, 14 * dt);
        break;
      }
      case 'die': {
        const k = s.t;
        // Collapse: legs fold, neck and wings drop
        LEGS.forEach((l) => {
          set(this.joints[l.hip], 1.1 * k, 0, 0, 6 * dt);
          set(this.joints[l.knee], -1.2 * k, 0, 0, 6 * dt);
        });
        NECK_CHAIN.forEach((name) => set(this.joints[name], 0.45 * k, 0.15 * k, 0, 5 * dt));
        set(this.joints['head_022'], 0.5 * k, 0, 0, 5 * dt);
        set(this.joints[WING_ARMS[0]], -0.2, 0, 1.35 * k, 4 * dt);
        set(this.joints[WING_ARMS[1]], -0.2, 0, -1.35 * k, 4 * dt);
        TAIL_CHAIN.forEach((name) => set(this.joints[name], 0.1 * k, 0.2 * k, 0, 4 * dt));
        break;
      }
      default:
        break;
    }
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.inner?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
    (this.mouthFlare.material as THREE.SpriteMaterial).map?.dispose();
    (this.mouthFlare.material as THREE.SpriteMaterial).dispose();
    this.root.parent?.remove(this.root);
    void this.tmp;
  }
}
