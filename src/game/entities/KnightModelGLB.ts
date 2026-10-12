import * as THREE from 'three';
import { type AnimParams, type CharacterVisual, type WeaponKind } from './CharacterModel';
import { damp } from '../core/MathUtils';
import { getFlameFX, type PersistentFlameHandle } from '../world/FlameFX';
import { applyHeroSwordTier, applyHeroSwordElement, type SwordElement } from '../world/HeroSword';

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
  /** Villager variant: re-tints the armour into clothes + headwear variety.
   *  When set, the statue sword & shield NEVER show. */
  villager?: { palette: import('./CharacterModel').CharacterPalette; seed: number; role?: string };
  /** Fase 10 — bandit variant: RED knights (dark crimson cloth + oxidised
   *  red-steel armour). When set the statue props never show. */
  bandit?: { seed: number; captain?: boolean };
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
  private isVillager = false;
  private isBandit = false;
  private blockHitT = 0;   // shield impact recoil (0..1)
  private blockHitDir = 1;
  // Fase 8 — night torch: replaces the shield after dusk (light source)
  private torchProp: THREE.Group | null = null;
  private torchFlame: PersistentFlameHandle | null = null;
  private torchLight: THREE.PointLight | null = null;
  private torchOn = false;
  private torchT = 0;

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
    this.isVillager = !!deps.villager;
    this.isBandit = !!deps.bandit;

    // collect bones + meshes
    for (const name of BONE_NAMES) {
      const b = scene.getObjectByName(name);
      if (b) this.bones.set(name, b);
    }
    this.swordProp = scene.getObjectByName('j_sword_held') ?? null;
    this.shieldProp = scene.getObjectByName('j_shield_held') ?? null;

    if (deps.villager) this.dressAsVillager(scene, deps.villager);
    if (deps.bandit) this.dressAsBandit(scene, deps.bandit);

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

  /** Shield / guard just deflected a hit — recoil impulse on the arms. */
  blockImpact(): void {
    this.blockHitT = 1;
    this.blockHitDir = Math.random() < 0.5 ? -1 : 1;
  }

  /**
   * Fase 8 — at dusk the shield gives way to a lit torch: a wooden brand
   * with a real FlameFX flame and a warm flickering light, riding the left
   * forearm slot. At dawn the torch goes out and the shield returns.
   */
  setNightTorch(on: boolean): void {
    if (on === this.torchOn || this.isVillager) return;
    this.torchOn = on;
    if (on) {
      const g = new THREE.Group();
      g.name = 'night_torch';
      const wood = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 });
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, 0.52, 6), wood);
      stick.position.y = 0.16;
      stick.castShadow = true;
      g.add(stick);
      const wrap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.05, 0.15, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 1 }),
      );
      wrap.position.y = 0.46;
      g.add(wrap);
      this.torchLight = new THREE.PointLight(0xff9a3c, 2.4, 20, 1.7);
      this.torchLight.position.y = 0.55;
      g.add(this.torchLight);
      this.armSlot.add(g);
      g.rotation.set(-0.35, 0, 0);
      g.position.set(-0.02, -0.05, 0.1);
      this.torchProp = g;
      // the flame mesh lives at the scene root (additive) — synced every frame
      this.torchFlame = getFlameFX().addFlame(new THREE.Vector3(0, -100, 0), {
        scale: 0.17, height: 0.42, heat: 0.5,
      });
      // the shield hides while the torch burns
      if (this.activeShield) this.activeShield.visible = false;
      if (this.shieldProp) this.shieldProp.visible = false;
    } else {
      if (this.torchProp) { this.armSlot.remove(this.torchProp); this.torchProp = null; }
      if (this.torchFlame) { this.torchFlame.dispose(); this.torchFlame = null; }
      this.torchLight = null;
      this.torchOn = false;
      // the shield returns with the sun
      this.refreshProps();
    }
  }

  get nightTorchOn(): boolean {
    return this.torchOn;
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

  /** Fase 10 — sword upgrade tier (Bram's forge): adds an ember/runic glow
   *  to the active blade + a subtle length boost so progress is VISIBLE. */
  setWeaponTier(tier: number): void {
    this.weaponTier = Math.max(0, Math.min(3, Math.floor(tier)));
    this.applyWeaponGlow();
  }

  /** Fase 12 — elemental legendary form of the equipped sword. */
  setWeaponElement(element: SwordElement | null): void {
    this.weaponElement = element;
    this.applyWeaponGlow();
  }

  /** Fase 12 — world position of the blade tip (elemental particle trail). */
  weaponTipWorld(out: THREE.Vector3): boolean {
    const w = this.activeWeapon ?? this.swordProp;
    if (!w) return false;
    out.set(0, (w.userData.height as number ?? 1) * 0.72, 0);
    w.localToWorld(out);
    return true;
  }

  private weaponTier = 0;
  private weaponElement: SwordElement | null = null;

  private applyWeaponGlow(): void {
    const w = this.activeWeapon ?? this.swordProp;
    if (!w) return;
    // Fase 11 — the master-forged sword carries its own rune-glow materials
    if (w.userData?.heroSword) {
      applyHeroSwordTier(w, this.weaponTier, false);
      if (this.weaponElement) applyHeroSwordElement(w, this.weaponElement);
      const s = 1 + this.weaponTier * 0.05 + (this.weaponElement ? 0.06 : 0);
      w.scale.set(s, s, s);
      return;
    }
    const glows = [null, 0xff9a3c, 0xe8c96a, 0x7ec8ff] as const;
    const glow = glows[this.weaponTier];
    w.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial) continue;
        if (glow === null) {
          std.emissive?.setHex(0x000000);
        } else {
          std.emissive?.setHex(glow);
          std.emissiveIntensity = 0.55 + this.weaponTier * 0.3;
        }
        std.needsUpdate = true;
      }
    });
    // each tier forges a slightly longer, prouder blade
    const s = 1 + this.weaponTier * 0.06;
    w.scale.set(s, s, s);
  }

  private refreshProps(): void {
    // Kit weapon in the right hand (detaches the previous one first)
    if (this.activeWeapon) {
      this.handSlot.remove(this.activeWeapon);
      if (this.activeWeapon.parent) this.activeWeapon.parent.remove(this.activeWeapon);
      this.activeWeapon = null;
    }
    const showKitWeapon = !this.isVillager && this.weaponKind !== 'none';
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
        this.applyWeaponGlow();
      }
    }
    // shields: the kit shield on the left forearm
    if (this.activeShield) {
      this.armSlot.remove(this.activeShield);
      this.activeShield = null;
    }
    if (this.wantsShield && !this.isVillager && !this.isBandit && this.shieldFactory) {
      const s = this.shieldFactory();
      if (s) {
        this.armSlot.add(s);
        this.activeShield = s;
        this.tuneShieldPose();
      }
    }
    // Fase 7 — NOTHING is shown until equipped:
    //   · bare hands → no statue sword, no statue shield
    //   · the statue props only appear as FALLBACKS when the matching kit
    //     object could not be produced (kit GLB missing)
    if (this.swordProp) {
      this.swordProp.visible = !this.isVillager && !this.isBandit
        && this.weaponKind !== 'none'
        && this.weaponKind !== 'bow'
        && !this.activeWeapon;
    }
    if (this.shieldProp) {
      this.shieldProp.visible = !this.isVillager && !this.isBandit && this.wantsShield && !this.activeShield;
    }
  }

  /**
   * Fase 7 — villager variant: the repository knight's body re-dressed as a
   * commoner. Materials are CLONED first (the AssetSystem shares them with
   * the player), the armour is re-tinted to cloth/leather tones and each NPC
   * gets seeded headwear (hood / straw hat / cap) + a work tool by role.
   */
  private dressAsVillager(scene: THREE.Object3D, v: { palette: import('./CharacterModel').CharacterPalette; seed: number; role?: string }): void {
    const r = (k: number) => {
      const x = Math.sin(v.seed * 37.71 + k * 91.13) * 43758.5453;
      return x - Math.floor(x);
    };
    const tint = new THREE.Color();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = mats.map((m) => (m as THREE.Material).clone());
      for (const m of clones) {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial) continue;
        const isUpper = /upper/i.test(std.name ?? '');
        const base = isUpper ? v.palette.tunic : v.palette.pants;
        tint.setHex(base);
        // seeded shade variety per NPC (avoid clone-army look)
        const shade = 0.82 + r(9) * 0.36;
        tint.multiplyScalar(shade);
        std.color.copy(tint);
        std.roughness = 0.92;
        std.metalness = 0.04;
        std.emissive?.setHex(0x000000);
        std.needsUpdate = true;
      }
      mesh.material = clones.length === 1 ? clones[0] : clones;
    });

    // --- headwear on the head bone (rigid props ride the skeleton) ---
    const head = this.bones.get('j_head') ?? scene.getObjectByName('j_head');
    if (head) {
      const cloth = (c: number, rough = 0.95) =>
        new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.02 });
      const wear = r(2);
      if (wear < 0.34) {
        // hood
        const hood = new THREE.Mesh(new THREE.ConeGeometry(0.155, 0.3, 8, 1, true), cloth(v.palette.tunic));
        hood.position.y = 0.22;
        hood.rotation.x = -0.14;
        hood.castShadow = true;
        hood.userData.villagerProp = true;
        head.add(hood);
      } else if (wear < 0.64) {
        // straw hat (brim + crown)
        const g = new THREE.Group();
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.025, 12), cloth(0xb59a58));
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.13, 10), cloth(0xa8894a));
        crown.position.y = 0.07;
        brim.castShadow = crown.castShadow = true;
        g.add(brim, crown);
        g.userData.villagerProp = true;
        g.position.y = 0.26;
        g.rotation.z = (r(3) - 0.5) * 0.24;
        head.add(g);
      } else if (wear < 0.85) {
        // soft cap
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
          cloth(v.palette.sleeves),
        );
        cap.position.y = 0.17;
        cap.castShadow = true;
        cap.userData.villagerProp = true;
        head.add(cap);
      }
    }

    // --- role tool in the right hand ---
    const wristR = scene.getObjectByName('j_wristR');
    if (wristR && v.role) {
      const wood = new THREE.MeshStandardMaterial({ color: 0x6a4e2e, roughness: 0.9, metalness: 0.02 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x767c82, roughness: 0.42, metalness: 0.78 });
      if (v.role === 'smith') {
        const hammer = new THREE.Group();
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.34, 6), wood);
        haft.position.y = 0.14;
        const hm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.05), steel);
        hm.position.y = 0.3;
        hammer.add(haft, hm);
        hammer.rotation.x = 1.35;
        hammer.userData.villagerProp = true;
        wristR.add(hammer);
      } else if (v.role === 'merchant') {
        const sack = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x9a8a66, roughness: 0.98, metalness: 0.0 }),
        );
        sack.scale.y = 1.2;
        sack.position.set(0.02, -0.14, 0.05);
        sack.userData.villagerProp = true;
        wristR.add(sack);
      } else if (v.role === 'fisher') {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.85, 5), wood);
        rod.position.set(0, 0.3, 0.05);
        rod.rotation.x = 0.5;
        rod.userData.villagerProp = true;
        wristR.add(rod);
      }
    }

    // --- per-NPC build variety ---
    const build = r(1);
    const s = 0.93 + r(5) * 0.1 + (build > 0.7 ? 0.05 : 0);
    this.root.scale.setScalar(s);
  }

  /**
   * Fase 10 — BANDIT variant: the same repository knight re-forged as a RED
   * KNIGHT — dark crimson cloth, oxidised red-steel armour, ember eyes and
   * a torn red cloak. Materials are CLONED (they are shared with the player).
   */
  private dressAsBandit(scene: THREE.Object3D, v: { seed: number; captain?: boolean }): void {
    const r = (k: number) => {
      const x = Math.sin(v.seed * 37.71 + k * 91.13) * 43758.5453;
      return x - Math.floor(x);
    };
    const tint = new THREE.Color();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = mats.map((m) => (m as THREE.Material).clone());
      for (const m of clones) {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.isMeshStandardMaterial) continue;
        const name = (std.name ?? '').toLowerCase();
        const isUpper = /upper/i.test(name);
        if (isUpper) {
          // oxidised red steel with seeded shade variety
          tint.setHSL(0.985 + r(3) * 0.012, 0.52 + r(4) * 0.2, 0.26 + r(5) * 0.08);
          std.color.copy(tint);
          std.metalness = 0.55;
          std.roughness = 0.5;
        } else {
          // dark crimson trousers / leather
          tint.setHSL(0.99, 0.42, 0.16 + r(6) * 0.07);
          std.color.copy(tint);
          std.metalness = 0.12;
          std.roughness = 0.85;
        }
        std.needsUpdate = true;
      }
      mesh.material = clones.length === 1 ? clones[0] : clones;
    });
    // ember eyes — a tiny malevolent glow under the helm
    const head = this.bones.get('j_head') ?? scene.getObjectByName('j_head');
    if (head) {
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 2.4, roughness: 0.4,
      });
      for (const ex of [-0.055, 0.055]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), eyeMat);
        eye.position.set(ex, 0.055, 0.135);
        eye.userData.villagerProp = true;
        head.add(eye);
      }
    }
    // torn crimson cloak for captains
    if (v.captain) {
      const torso = this.bones.get('j_torso');
      if (torso) {
        const cloakMat = new THREE.MeshStandardMaterial({
          color: 0x5a1216, roughness: 0.95, side: THREE.DoubleSide,
        });
        const cloak = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.95, 1, 3), cloakMat);
        cloak.position.set(0, -0.28, -0.16);
        cloak.rotation.x = 0.16;
        cloak.userData.villagerProp = true;
        torso.add(cloak);
      }
      this.root.scale.setScalar(1.08); // captains stand taller
    } else {
      this.root.scale.setScalar(0.97 + r(7) * 0.07);
    }
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
    if (rollT > 0) { this.poseRoll(target, rollT, moving, ph, p.dodgeStep === true); this.apply(target, dt, true); this.post(p); return; }
    if (p.swimming) { this.poseSwim(target, ph, p); this.apply(target, dt, true); this.post(p); return; }
    if (p.riding) { this.poseRide(target, p); this.apply(target, dt, true); this.post(p); return; }

    // ---- Fase 11 — LAYERED base: air OR locomotion (no early return any
    // more: the attack/block overlays now layer over the airborne pose too,
    // which is what makes mid-air slashes and plunges readable) ----
    if (!p.grounded) {
      this.poseAir(target, this.airT);
    } else {
      this.poseLocomotion(target, p, moving, ph);
    }

    // ---- landing absorb (grounded only) ----
    if (p.grounded) {
      if (this.landT > 0) {
        const k = this.landT / 0.34;
        const e = k * k;
        target.j_kneeR = [target.j_kneeR[0] + 0.85 * e, 0, 0];
        target.j_kneeL = [target.j_kneeL[0] + 0.85 * e, 0, 0];
        target.j_hipR = [target.j_hipR[0] - 0.5 * e, 0, 0];
        target.j_hipL = [target.j_hipL[0] - 0.5 * e, 0, 0];
        target.j_torso = [target.j_torso[0] + 0.28 * e, target.j_torso[1], 0];
        this.inner.position.y = -0.09 * e;
      } else if (this.inner.position.y !== 0) {
        this.inner.position.y = damp(this.inner.position.y, 0, 10, dt);
      }
    }

    // ---- bow aim (overrides arms) ----
    const bowDraw = p.bowDraw ?? 0;
    if (bowDraw > 0) this.poseBowAim(target, p, bowDraw, moving, ph);

    // ---- block overlay (grounded stance only) ----
    const blockT = p.blockT ?? 0;
    if (blockT > 0 && p.grounded) this.poseBlock(target, blockT, this.activeShield !== null || (!!this.shieldProp && this.shieldProp.visible));

    // ---- attack overlays (timed curves — ground OR air) ----
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
    // the statue shield (fallback only) tucks away while aiming a bow
    if (this.shieldProp && !this.isVillager) {
      this.shieldProp.visible = this.wantsShield && !this.activeShield && (p.bowDraw ?? 0) < 0;
    }
    // shield impact recoil decay
    if (this.blockHitT > 0) this.blockHitT = Math.max(0, this.blockHitT - p.dt * 4.2);
    // Fase 8 — the night torch rides the left forearm: sync the flame to the
    // brand head and flicker the light with the same rhythm
    if (this.torchOn && this.torchProp && this.torchFlame) {
      this.torchT += p.dt;
      this.torchProp.updateWorldMatrix(true, false);
      this.torchFlame.position.setFromMatrixPosition(this.torchProp.matrixWorld);
      this.torchFlame.position.y += 0.55;
      if (this.torchLight) {
        const fl = 0.8 + Math.sin(this.torchT * 11.3) * 0.14 + Math.sin(this.torchT * 23.7) * 0.07;
        this.torchLight.intensity = 2.4 * fl;
      }
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
      // Fase 12 — pelvis rocks over the stance leg (secondary motion: the
      // walk stops reading as two stiff pistons and starts swinging from
      // the hips like a real gait).
      const hipRoll = Math.sin(ph) * (0.035 + runK * 0.05);
      // right leg (x<0) — j_hipR: -X = forward
      t.j_hipR = [-legPhR * amp, 0, -hipRoll];
      t.j_kneeR = [Math.max(0, -Math.sin(ph + Math.PI - 0.7)) * (0.55 + runK * 0.75), 0, 0];
      t.j_ankleR = [-0.1 + legPhR * 0.18, 0, Math.max(0, legPhR) * 0.08];
      // left leg
      t.j_hipL = [-legPhL * amp, 0, hipRoll];
      t.j_kneeL = [Math.max(0, -Math.sin(ph - 0.7)) * (0.55 + runK * 0.75), 0, 0];
      t.j_ankleL = [-0.1 + legPhL * 0.18, 0, Math.max(0, legPhL) * 0.08];
      // arms counter-swing; the sword arm (R) carries the relaxed sword.
      // Fase 12 — elbows flex on the BACK swing (the arm folds as it trails
      // behind, opens as it swings forward — the classic follow-through).
      const armAmp = 0.34 + runK * 0.5;
      t.j_shoulderR = [legPhR * armAmp, 0, -0.06];
      t.j_elbowR = [-0.18 - runK * 0.35 - Math.max(0, -legPhR) * (0.3 + runK * 0.3), 0, 0];
      // Fase 10 — SHIELD CARRY: a knight does NOT swing the shield arm like a
      // pendulum while running (the old full counter-swing looked broken).
      // With a shield visible the left arm locks into a steady carry: elbow
      // bent, shield held low across the thigh, a touch of vertical bob so it
      // still breathes with the gait.
      const shieldCarry = this.wantsShield
        && (this.activeShield !== null || (this.shieldProp?.visible ?? false))
        && (p.blockT ?? 0) < 0.1;
      if (shieldCarry) {
        const bob = Math.sin(ph * 2) * 0.045;
        t.j_shoulderL = [-0.34 + bob - runK * 0.1, 0.16, 0.3];
        t.j_elbowL = [-0.92, 0, 0.18];
      } else {
        t.j_shoulderL = [legPhL * armAmp * 0.8, 0, 0.06];
        t.j_elbowL = [-0.25 - runK * 0.3 - Math.max(0, -legPhL) * (0.28 + runK * 0.28), 0, 0];
      }
      // torso: bob, forward lean, counter-rotation (amplified at speed)
      t.j_torso = [0.05 + runK * 0.2, Math.sin(ph) * (0.05 + runK * 0.08), 0];
      // head stabilizes against the torso sway (vestibular reflex)
      t.j_head = [-0.04 - runK * 0.08, -Math.sin(ph) * 0.06, -Math.sin(ph) * 0.02];
      this.inner.position.y = Math.abs(Math.sin(ph)) * 0.028 * (0.5 + runK);
      // Fase 12 — subtle lateral sway of the whole body over the stance foot
      this.inner.position.x = Math.sin(ph) * 0.012 * (0.6 + runK);
    } else {
      // idle: breathing, weight shift, relaxed sword arm
      const br = Math.sin(this.t * 1.7);
      const sway = Math.sin(this.t * 0.33);
      t.j_torso = [0.02 + br * 0.012, Math.sin(this.t * 0.4) * 0.02, sway * 0.012];
      t.j_head = [0.0, Math.sin(this.t * 0.5) * 0.13, Math.sin(this.t * 0.33) * 0.05];
      t.j_shoulderR = [br * 0.03 - 0.04, 0, -0.05];
      t.j_shoulderL = [-br * 0.03, 0, 0.06];
      t.j_elbowR = [-0.15 - br * 0.02, 0, 0];
      t.j_elbowL = [-0.22, 0, 0];
      // Fase 12 — the knees breathe with the weight shift
      t.j_kneeR = [-0.04 + Math.max(0, sway) * 0.05, 0, 0];
      t.j_kneeL = [-0.06 + Math.max(0, -sway) * 0.05, 0, 0];
      t.j_hipR = [0, 0, -sway * 0.018];
      t.j_hipL = [0, 0, sway * 0.018];
      this.inner.position.y = damp(this.inner.position.y, 0, 8, 1 / 60);
      this.inner.position.x = damp(this.inner.position.x, 0, 8, 1 / 60);
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

  private poseRoll(t: PoseTarget, rollT: number, moving: boolean, ph: number, step = false): void {
    if (step) {
      // Fase 11 — QUICKSTEP: a low lateral dash. No tuck, no spin — the
      // body coils toward the dash side: deep lunge on the leading leg,
      // trailing leg extended, torso banked, sword arm trailing for balance.
      const k = Math.sin(rollT * Math.PI); // 0→1→0 arc through the dash
      t.j_hipR = [-0.95 * k - 0.2, 0, 0];
      t.j_hipL = [0.55 * k, 0, 0];
      t.j_kneeR = [1.35 * k + 0.25, 0, 0];
      t.j_kneeL = [0.12, 0, 0];
      t.j_ankleR = [0.35, 0, 0];
      t.j_ankleL = [0.3, 0, 0];
      t.j_shoulderR = [-0.5 - k * 0.5, 0, -0.5 * k];
      t.j_shoulderL = [-0.2 + k * 0.7, 0, 0.45 * k + 0.1];
      t.j_elbowR = [-0.6, 0, 0];
      t.j_elbowL = [-0.35, 0, 0];
      t.j_torso = [0.42 * k, -0.3 * k, 0];
      t.j_head = [-0.2 * k, 0.24 * k, 0];
      this.inner.position.y = -0.26 * k;
      return;
    }
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
    // impact recoil: quick pushback on the guard side
    const hit = this.blockHitT * this.blockHitT;
    const shake = hit * this.blockHitDir;
    if (hasKitShield) {
      // shield raised across the front, braced behind it
      t.j_shoulderL = [L(t.j_shoulderL[0], -1.02, k) + hit * 0.5, 0, L(t.j_shoulderL[1], 0.34, k) + shake * 0.12];
      t.j_elbowL = [L(t.j_elbowL[0], -0.78, k), 0, 0];
      t.j_shoulderR = [L(t.j_shoulderR[0], -0.3, k) + hit * 0.3, 0, L(t.j_shoulderR[1], -0.14, k)];
      t.j_elbowR = [L(t.j_elbowR[0], -1.45, k), 0, 0];
      t.j_head = [L(t.j_head[0], 0.12, k), 0, 0];
    } else {
      // no shield: weapon held vertical in a high guard
      t.j_shoulderR = [L(t.j_shoulderR[0], -1.0, k) + hit * 0.45, 0, L(t.j_shoulderR[1], -0.3, k) + shake * 0.1];
      t.j_elbowR = [L(t.j_elbowR[0], -1.32, k), 0, 0];
      t.j_shoulderL = [L(t.j_shoulderL[0], -0.55, k) + hit * 0.3, 0, L(t.j_shoulderL[1], 0.1, k)];
      t.j_elbowL = [L(t.j_elbowL[0], -1.05, k), 0, 0];
      t.j_head = [L(t.j_head[0], 0.1, k), 0, 0];
    }
    t.j_torso = [L(t.j_torso[0], 0.17, k) + hit * 0.2, (t.j_torso[1] ?? 0) + shake * 0.08, 0];
    t.j_kneeR = [t.j_kneeR[0] + 0.3 * k, 0, 0];
    t.j_kneeL = [t.j_kneeL[0] + 0.34 * k, 0, 0];
    this.inner.position.y -= 0.06 * k;
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
    // ----------------------------------------------------------- Fase 11
    // — the cinematic set —
    if (kind === 'spin') {
      // 360° horizontal sweep: coil left (0..0.3), whip around
      // (0.3..0.72 — the torso drives the turn), settle the follow-through
      if (k < 0.3) {
        const u = ease(k / 0.3);
        t.j_shoulderR = [L(0, -1.15, u), 0, L(0, 1.05, u)];
        t.j_elbowR = [-0.2, 0, 0];
        t.j_torso = [0.06, L(0, 0.85, u), 0];
        t.j_hipR = [0.12, 0, 0];
        t.j_hipL = [-0.18, 0, 0];
        this.inner.position.y = -0.05 * u;
      } else if (k < 0.72) {
        const u = ease((k - 0.3) / 0.42);
        t.j_shoulderR = [L(-1.15, -1.05, u), 0, L(1.05, -1.15, u)];
        t.j_elbowR = [L(-0.2, -0.08, u), 0, 0];
        t.j_torso = [0.1, L(0.85, -0.95, u), 0];
        t.j_head = [0, L(0.5, -0.55, u), 0];
        t.j_hipR = [0.1, L(0.3, -0.35, u), 0];
        t.j_hipL = [-0.1, L(-0.3, 0.35, u), 0];
        t.j_kneeR = [0.35, 0, 0];
        this.inner.position.y = -0.09;
      } else {
        const u = (k - 0.72) / 0.28;
        t.j_shoulderR = [L(-1.05, -0.2, u), 0, L(-1.15, -0.1, u)];
        t.j_elbowR = [L(-0.08, -0.25, u), 0, 0];
        t.j_torso = [L(0.1, 0.03, u), L(-0.95, 0, u), 0];
        t.j_head = [0, L(-0.55, 0, u), 0];
        t.j_hipR = [0, L(-0.35, 0, u), 0];
        this.inner.position.y = -0.09 * (1 - u);
      }
      t.j_shoulderL = [-0.75, 0, 0.5];
      t.j_elbowL = [-0.7, 0, 0];
    } else if (kind === 'uppercut') {
      // rising slash: coil low (0..0.38), launch upward (0.38..0.66),
      // the body rides the rising blade
      if (k < 0.38) {
        const u = ease(k / 0.38);
        t.j_shoulderR = [L(0, -0.9, u), 0, L(0, 0.85, u)];
        t.j_elbowR = [L(0, -1.5, u), 0, 0];
        t.j_torso = [L(0, 0.5, u), L(0, 0.55, u), 0];
        t.j_kneeR = [0.85 * u, 0, 0];
        t.j_kneeL = [0.7 * u, 0, 0];
        this.inner.position.y = -0.22 * u;
      } else if (k < 0.66) {
        const u = ease((k - 0.38) / 0.28);
        t.j_shoulderR = [L(-0.9, -2.6, u), 0, L(0.85, -0.15, u)];
        t.j_elbowR = [L(-1.5, -0.12, u), 0, 0];
        t.j_torso = [L(0.5, -0.38, u), L(0.55, -0.5, u), 0];
        t.j_head = [L(0, -0.4, u), 0, 0];
        t.j_hipR = [L(0, -0.3, u), 0, 0];
        this.inner.position.y = L(-0.22, 0.1, u);
      } else {
        const u = (k - 0.66) / 0.34;
        t.j_shoulderR = [L(-2.6, -0.3, u), 0, L(-0.15, -0.06, u)];
        t.j_elbowR = [L(-0.12, -0.3, u), 0, 0];
        t.j_torso = [L(-0.38, 0.04, u), L(-0.5, 0, u), 0];
        t.j_head = [L(-0.4, 0, u), 0, 0];
        this.inner.position.y = L(0.1, 0, u);
      }
      t.j_shoulderL = [-0.4, 0, 0.35];
      t.j_elbowL = [-0.8, 0, 0];
    } else if (kind === 'plunge') {
      // the falling spear: sword aimed straight down, body arched above it.
      // (Player drives the dive; this pose sells the read from any angle)
      const u = Math.min(1, k * 3);
      t.j_shoulderR = [L(0, -2.9, u), 0, 0];
      t.j_elbowR = [L(0, -0.06, u), 0, 0];
      t.j_shoulderL = [L(0, -1.4, u), 0, 0.55];
      t.j_elbowL = [L(0, -1.1, u), 0, 0];
      t.j_torso = [L(0, -0.24, u), 0, 0];
      t.j_head = [L(0, 0.5, u), 0, 0];
      t.j_hipR = [-0.5, 0, 0];
      t.j_hipL = [-0.35, 0, 0];
      t.j_kneeR = [1.15, 0, 0];
      t.j_kneeL = [0.9, 0, 0];
      t.j_ankleR = [0.5, 0, 0];
      this.inner.position.y = 0.06 * u;
    } else if (kind === 'aircut') {
      // floating air slash: a tight horizontal figure-eight — quick out,
      // quick back, body banked like it is carving the air
      if (k < 0.3) {
        const u = ease(k / 0.3);
        t.j_shoulderR = [L(0, -2.3, u), 0, L(0, -0.7, u)];
        t.j_elbowR = [-0.3, 0, 0];
        t.j_torso = [0.1, L(0, -0.5, u), 0];
      } else if (k < 0.68) {
        const u = ease((k - 0.3) / 0.38);
        t.j_shoulderR = [L(-2.3, 0.35, u), 0, L(-0.7, 0.85, u)];
        t.j_elbowR = [L(-0.3, -0.1, u), 0, 0];
        t.j_torso = [0.14, L(-0.5, 0.55, u), 0];
        t.j_head = [0, L(0, 0.2, u), 0];
        t.j_hipR = [-0.25 * u, 0, 0];
        t.j_kneeR = [0.4 * u, 0, 0];
      } else {
        const u = (k - 0.68) / 0.32;
        t.j_shoulderR = [L(0.35, -0.2, u), 0, L(0.85, -0.08, u)];
        t.j_elbowR = [L(-0.1, -0.25, u), 0, 0];
        t.j_torso = [L(0.14, 0.04, u), L(0.55, 0, u), 0];
      }
      t.j_shoulderL = [-0.45, 0, 0.4];
      t.j_elbowL = [-0.6, 0, 0];
      t.j_kneeL = [0.2, 0, 0];
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
    if (this.isVillager) {
      // Villager clones SHARE geometry with the player's knight (SkeletonUtils
      // clone) — only the per-instance headwear may be freed.
      this.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.userData.villagerProp) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) (m as THREE.Material).dispose();
        }
      });
      return;
    }
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
