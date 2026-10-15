import * as THREE from 'three';
import { type AnimParams, type CharacterVisual, type WeaponKind } from './CharacterModel';
import { damp } from '../core/MathUtils';
import { gfxRuntime } from '../core/Graphics';
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
   *  red-steel armour). When set the statue props never show. Fase 17:
   *  `shield: true` arms heavies with a kit shield on the left forearm.
   *  Fase 22: `tint`/`eyes` recolour legends and temple guardians. */
  bandit?: {
    seed: number; captain?: boolean; shield?: boolean;
    tint?: { h: number; s: number; l: number };
    eyes?: number;
  };
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

  /** Fase 22 — public bone lookup (legends hang their hats on the head). */
  boneByName(name: string): THREE.Object3D | null {
    return this.bones.get(name) ?? null;
  }
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
  private banditShield = false;
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
  // ---- Fase 24 — POSE MEMORY + ATTACK WEAPON CHANNEL ----
  // A swing used to teleport the arm to the curve's zero-start in one frame
  // (the "tieso" pop). We capture the live pose at the swing's first frame
  // and blend the first ~90 ms of the curve out of it.
  private lastAttackT = 0;
  private attackFrom: PoseTarget | null = null;
  private attackFromY = 0;
  /** Per-attack extra weapon pitch (spear thrust align / plunge flip) —
   *  applied on top of the tuned grip in post() and decays when idle. */
  private attackWeaponPitch = 0;
  // ---- Fase 22 — THE CAPE CLOTH LAYER (spring-damper secondary motion) ----
  private capeBone1: THREE.Object3D | null = null;
  private capeBone2: THREE.Object3D | null = null;
  private cape1st = { r: [0.05, 0], v: [0, 0] }; // [pitch, yaw] + velocities
  private cape2st = { r: [0.09, 0], v: [0, 0] };
  private weaponFactory?: KnightVisualDeps['weaponFactory'];
  private shieldFactory?: KnightVisualDeps['shieldFactory'];

  constructor(deps: KnightVisualDeps) {
    this.weaponFactory = deps.weaponFactory;
    this.shieldFactory = deps.shieldFactory;
    const scene = deps.scene;
    this.isVillager = !!deps.villager;
    this.isBandit = !!deps.bandit;
    this.banditShield = !!deps.bandit?.shield;

    // collect bones + meshes
    for (const name of BONE_NAMES) {
      const b = scene.getObjectByName(name);
      if (b) this.bones.set(name, b);
    }
    this.swordProp = scene.getObjectByName('j_sword_held') ?? null;
    this.shieldProp = scene.getObjectByName('j_shield_held') ?? null;
    // Fase 22 — the cape chain (absent in pre-F22 rigs: dynamics no-ops)
    this.capeBone1 = scene.getObjectByName('j_cape1') ?? null;
    this.capeBone2 = scene.getObjectByName('j_cape2') ?? null;

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
    if (elbowL) { elbowL.add(this.armSlot); this.armSlot.position.set(0, -0.09, 0.045); }

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

  /** Fase 21 — FIRST PERSON: collapse the head bone so the great helm never
   *  blocks the eye-level camera (the neck folds smoothly into the collar;
   *  chest, hands and cape stay visible when you look down). */
  setHeadHidden(hidden: boolean): void {
    const head = this.bones.get('j_head');
    if (head) head.scale.setScalar(hidden ? 0.0001 : 1);
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

  /** Fase 22 — world position of the GRIP (base of the blade). The slash-arc
   *  ribbon spans grip→tip: the swept plane of the cut, not a floating streak. */
  weaponHandWorld(out: THREE.Vector3): boolean {
    const w = this.activeWeapon ?? this.swordProp;
    if (!w) return false;
    out.set(0, 0.06, 0);
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
          // Fase 25 — elemental legendaries repaint the uploaded blade's glow
          const elem = this.weaponElement;
          const elemColor = elem === 'fire' ? 0xff5a1a : elem === 'frost' ? 0x6fd6ff : elem === 'storm' ? 0xb08aff : null;
          std.emissive?.setHex(elemColor ?? glow);
          std.emissiveIntensity = 0.55 + this.weaponTier * 0.3;
        }
        std.needsUpdate = true;
      }
    });
    // each tier forges a slightly longer, prouder blade — MULTIPLIED onto the
    // weapon's own base scale (the F25 uploaded models carry a normalizing
    // scale: setting it outright restored the raw 2-metre mesh!)
    const s = 1 + this.weaponTier * 0.06;
    const base = w.userData?.baseScale as [number, number, number] | undefined;
    if (base) w.scale.set(base[0] * s, base[1] * s, base[2] * s);
    else w.scale.set(s, s, s);
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
    if (this.wantsShield && !this.isVillager && (!this.isBandit || this.banditShield) && this.shieldFactory) {
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
      this.shieldProp.visible = !this.isVillager && this.wantsShield && !this.activeShield
        && (!this.isBandit || this.banditShield);
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
  private dressAsBandit(scene: THREE.Object3D, v: { seed: number; captain?: boolean; tint?: { h: number; s: number; l: number }; eyes?: number }): void {
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
          // (Fase 22 — legends/guardians wear their own HSL instead)
          if (v.tint) {
            tint.setHSL(v.tint.h, v.tint.s, v.tint.l);
            std.metalness = 0.62;
            std.roughness = 0.42;
          } else {
            tint.setHSL(0.985 + r(3) * 0.012, 0.52 + r(4) * 0.2, 0.26 + r(5) * 0.08);
            std.metalness = 0.55;
            std.roughness = 0.5;
          }
          std.color.copy(tint);
        } else {
          // dark crimson trousers / leather (or the legend's own shade)
          if (v.tint) {
            tint.setHSL(v.tint.h, Math.min(1, v.tint.s + 0.1), v.tint.l * 0.72);
          } else {
            tint.setHSL(0.99, 0.42, 0.16 + r(6) * 0.07);
          }
          std.color.copy(tint);
          std.metalness = 0.12;
          std.roughness = 0.85;
        }
        std.needsUpdate = true;
      }
      mesh.material = clones.length === 1 ? clones[0] : clones;
    });
    // ember eyes — a tiny malevolent glow under the helm
    // (Fase 22 — legends and guardians choose their own colour)
    const head = this.bones.get('j_head') ?? scene.getObjectByName('j_head');
    if (head) {
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x220000, emissive: v.eyes ?? 0xff2a1a, emissiveIntensity: 2.4, roughness: 0.4,
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

  /** Per-weapon grip orientation in the hand.
   *
   * Fase 24 — THE REAL GRIP. The rig's bones carry IDENTITY axes at bind
   * (the arm hangs at the side in the statue pose), so the sword's +Y blade
   * axis maps to "model up" — a small pitch made the blade stand straight
   * out of the fist like a torch, and during the windups the accumulated
   * arm rotation carried it to point DOWN-BACK at the ground behind the
   * knight (the literal "pegas al revés"). A blade held in a hammer grip
   * rides roughly PERPENDICULAR to the forearm, along the curled fingers:
   * pitch ≈ +1.52 rad. Then the idle reads as a low guard (tip forward-up),
   * every windup cocks the steel back over the shoulder, and every strike
   * sweeps it down THROUGH the target in front.
   *
   * The tuned pose is stored on userData.gripPose — post() restores it
   * EXACTLY (the old baseRotX damp eroded the pitch to 0 within half a
   * second, which is why the blade kept reading "pose predeterminada"). */
  private tuneWeaponPose(kind: WeaponKind): void {
    if (!this.activeWeapon) return;
    switch (kind) {
      case 'sword':
        // grip centre inside the fist (the F23-measured fist centroid);
        // blade along the curled fingers, edge forward, guard just past the
        // knuckles, pommel out the heel of the hand.
        this.activeWeapon.position.set(0.012, -0.046, 0.052);
        this.activeWeapon.rotation.set(1.52, -0.12, 0.1);
        break;
      case 'axe':
        // haft along the fingers, head up-forward — a working carry
        this.activeWeapon.position.set(0.01, -0.042, 0.05);
        this.activeWeapon.rotation.set(1.32, -0.1, 0.14);
        break;
      case 'spear':
        // shaft along the fingers, tip forward-up: a ready pike. The thrust
        // channel in post() pitches it the rest of the way into the stab.
        this.activeWeapon.position.set(0.01, -0.034, 0.06);
        this.activeWeapon.rotation.set(1.35, -0.06, 0.04);
        break;
      case 'bow':
        // bow held vertically in the LEFT hand — moved at aim time
        this.activeWeapon.rotation.set(0, 0, 0);
        break;
      default:
        break;
    }
    // Fase 24 — remember the tuned pose: the swim shouldering restores to
    // THIS, never to a bare zero.
    this.activeWeapon.userData.gripPose = {
      pos: this.activeWeapon.position.toArray(),
      rot: this.activeWeapon.rotation.toArray(),
    };
  }

  /** Fase 23 — the shield lies ALONG the left forearm like a strapped
   *  heater shield: its height axis follows the forearm, the face looks
   *  out-and-forward, and the whole board rides high enough to clear the
   *  thigh (the old tray-carry clipped the leg). */
  private tuneShieldPose(): void {
    if (!this.activeShield) return;
    this.activeShield.rotation.set(0.12, 1.02, 0.0);
    this.activeShield.position.set(0.062, 0.02, 0.05);
  }

  // ------------------------------------------------------------ animation

  /** Fase 14 — scratch reutilizable: zero() creaba un objeto + 15 arrays por
   *  frame POR MODELO (17 caballeros = 270 arrays/frame de presión de GC). */
  private zeroScratch: PoseTarget = {};
  private zero(): PoseTarget {
    const p = this.zeroScratch;
    for (const n of BONE_NAMES) {
      const e = p[n];
      if (e) { e[0] = 0; e[1] = 0; e[2] = 0; }
      else p[n] = [0, 0, 0];
    }
    return p;
  }

  update(p: AnimParams): void {
    // Fase 14 — culling de animación: lejos del jugador el sistema dueño
    // pasa dt = 0 y la pose queda congelada (invisible a esa distancia,
    // todo el álgebra de huesos ahorrada). El propio modelo sigue en su sitio.
    if (p.dt <= 0) return;
    this.t += p.dt;
    const dt = Math.max(1e-4, p.dt);
    const target = this.zero();

    // speed smoothing + phase
    this.speedSm = damp(this.speedSm, p.speed, 8, dt);
    const moving = p.moving && this.speedSm > 0.25;
    // Fase 23 — CONTINUOUS STRIDE CADENCE: the old two-step switch (6.6 walk
    // / 9.4 run at 4.4 m/s) made the gait hitch the instant the threshold
    // was crossed. The stride rate now glides with speed — no seam.
    const cadence = 6.6 + THREE.MathUtils.clamp((this.speedSm - 3.0) / 3.6, 0, 1) * 3.4;
    if (moving) this.phase += dt * cadence;
    const ph = this.phase;

    // landing detection
    if (p.grounded && !this.wasGrounded) this.landT = p.attackT > 0 || (p.rollT ?? 0) > 0 ? 0 : 0.34;
    if (!p.grounded) this.airT += dt; else this.airT = 0;
    this.wasGrounded = p.grounded;
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);

    // ---- roll/swim/ride overrides ----
    const rollT = p.rollT ?? 0;
    if (rollT > 0) { this.poseRoll(target, rollT, moving, ph, p.dodgeStep === true); this.apply(target, dt, true); this.post(p); return; }
    if (p.swimming) { this.poseSwim(target, ph, p); this.apply(target, dt, true); this.post(p); return; }
    if (p.riding) { this.poseRide(target, p); this.apply(target, dt, true); this.post(p); return; }

    // ---- Fase 17 — the HOOK DASH flying kick: the rope carries the body
    //      and both heels lead the way. Held while the kick lingers. ----
    if (p.dashKick && p.attackT === 0) {
      this.poseHookKick(target);
      this.apply(target, dt, true);
      this.post(p);
      return;
    }

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
      // Fase 24 — POSE MEMORY: a swing used to snap the arm from the
      // locomotion pose straight to the curve's zero-start — a one-frame
      // teleport, the loudest "tieso" tell the game had. Capture the live
      // pose at the swing's first frame and blend the first ~90 ms of the
      // curve out of it; a chained swing blends out of the previous swing's
      // follow-through, which is what makes a combo read as ONE motion.
      if (this.lastAttackT <= 0) {
        const cap: PoseTarget = {};
        for (const n of BONE_NAMES) {
          const c = this.cur[n];
          cap[n] = c ? [c[0], c[1], c[2]] : [0, 0, 0];
        }
        this.attackFrom = cap;
        this.attackFromY = this.inner.position.y;
      }
      this.lastAttackT = p.attackT;
      this.poseAttack(target, p.attackT, p.attackKind ?? 'light1', bowDraw);
      const elapsed = p.attackT * (p.attackDur ?? 0.5);
      if (this.attackFrom && elapsed < 0.09) {
        let b = THREE.MathUtils.clamp(elapsed / 0.09, 0, 1);
        b = b * b * (3 - 2 * b);
        for (const n of BONE_NAMES) {
          const tv = target[n];
          const fv = this.attackFrom[n];
          if (tv && fv) {
            target[n] = [
              THREE.MathUtils.lerp(fv[0], tv[0], b),
              THREE.MathUtils.lerp(fv[1], tv[1], b),
              THREE.MathUtils.lerp(fv[2], tv[2], b),
            ];
          }
        }
        this.inner.position.y = THREE.MathUtils.lerp(this.attackFromY, this.inner.position.y, b);
      }
      this.apply(target, dt, true);
      this.post(p);
      return;
    }
    this.lastAttackT = 0;

    // Fase 17 — the sweep-kick spin unwinds when the kick isn't driving it
    this.inner.rotation.y = damp(this.inner.rotation.y, 0, 14, dt);

    // ---- hit reaction ----
    if (this.hitT > 0) {
      const k = this.hitT;
      // Fase 22 — the flinch reads through the WHOLE upper body now: chest
      // caves, head snaps down and rolls, both shoulders recoil off the line
      // of the blow — a reaction with mass, not a red flash.
      target.j_torso = [target.j_torso[0] - 0.22 * k, target.j_torso[1], 0.05 * k];
      target.j_head = [target.j_head[0] - 0.18 * k, target.j_head[1] * (1 - k), -0.08 * k];
      target.j_shoulderR = [target.j_shoulderR[0], target.j_shoulderR[1], target.j_shoulderR[2] - 0.16 * k];
      target.j_shoulderL = [target.j_shoulderL[0], target.j_shoulderL[1], target.j_shoulderL[2] + 0.12 * k];
    }

    this.apply(target, dt, false);
    this.post(p);
  }

  /** Per-frame post steps (flash decay, prop visibility by context). */
  private post(p: AnimParams): void {
    // Fase 22 — THE CAPE CLOTH LAYER runs on every path (locomotion, attack
    // early-returns included — the cape answers to the swing's coil-whip)
    if (p.dt > 0) this.updateCape(p, Math.max(1e-4, p.dt));
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
        this.torchLight.intensity = gfxRuntime.pointLights ? 2.4 * fl : 0;
      }
    }
    // the kit weapon stays in the hand; while swimming it is shouldered up
    // (Fase 24 — restores the EXACT tuned grip afterwards. The old code
    // damped rotation.x toward userData.baseRotX, which the hero sword sets
    // to 0 — the grip pitch eroded to nothing in half a second and the blade
    // stood straight up out of the fist like a torch)
    if (this.activeWeapon) {
      const gp = this.activeWeapon.userData.gripPose as { rot?: number[] } | undefined;
      // NB: Euler.toArray() = [x, y, z, order-string] — length 4
      if (gp?.rot && gp.rot.length >= 3) {
        const dtd = Math.max(1e-4, p.dt);
        const tx = p.swimming ? -1.2 : gp.rot[0] + this.attackWeaponPitch;
        this.activeWeapon.rotation.x = damp(this.activeWeapon.rotation.x, tx, 10, dtd);
        this.activeWeapon.rotation.y = damp(this.activeWeapon.rotation.y, gp.rot[1], 10, dtd);
        this.activeWeapon.rotation.z = damp(this.activeWeapon.rotation.z, gp.rot[2], 10, dtd);
      }
    }
    // the attack weapon channel (spear thrust align / plunge flip) bleeds
    // back to the tuned grip once the swing is over
    if (p.attackT <= 0 && this.attackWeaponPitch !== 0) {
      this.attackWeaponPitch = damp(this.attackWeaponPitch, 0, 8, Math.max(1e-4, p.dt));
    }
  }

  // ------------------------------------------------------------ pose blocks

  private poseLocomotion(t: PoseTarget, p: AnimParams, moving: boolean, ph: number): void {
    const runK = Math.min(1, this.speedSm / 6.2);
    if (moving) {
      // ---- Fase 17 — the charge blend: past ~65% of top speed the knight
      // drops into the SHIELD CHARGE — shield forward, body low, blade
      // trailing. It eases in with speed so walking never triggers it. ----
      const hasShield = this.wantsShield
        && (this.activeShield !== null || (this.shieldProp?.visible ?? false));
      const charge = hasShield
        ? THREE.MathUtils.smoothstep(runK, 0.55, 0.88)
        : THREE.MathUtils.smoothstep(runK, 0.68, 0.92);
      const armed = this.weaponKind !== 'none' && this.weaponKind !== 'bow';

      const amp = 0.52 + runK * 0.5 + charge * 0.12;
      const legPhL = Math.sin(ph);
      const legPhR = Math.sin(ph + Math.PI);
      // Fase 12 — pelvis rocks over the stance leg (secondary motion: the
      // walk stops reading as two stiff pistons and starts swinging from
      // the hips like a real gait).
      const hipRoll = Math.sin(ph) * (0.035 + runK * 0.05);
      // right leg (x<0) — j_hipR: -X = forward
      t.j_hipR = [-legPhR * amp, 0, -hipRoll];
      t.j_kneeR = [Math.max(0, -Math.sin(ph + Math.PI - 0.7)) * (0.55 + runK * 0.75 + charge * 0.22), 0, 0];
      t.j_ankleR = [-0.1 + legPhR * 0.18, 0, Math.max(0, legPhR) * 0.08];
      // left leg
      t.j_hipL = [-legPhL * amp, 0, hipRoll];
      t.j_kneeL = [Math.max(0, -Math.sin(ph - 0.7)) * (0.55 + runK * 0.75 + charge * 0.22), 0, 0];
      t.j_ankleL = [-0.1 + legPhL * 0.18, 0, Math.max(0, legPhL) * 0.08];

      // ---- ARMS ----
      // Fase 24 — the armed arm swings LIKE AN ARM: ±0.2-0.34 rad with the
      // gait (the F23 ±0.13 was sub-perceptual at walking speed and read as
      // a pinned statue limb — the core of the "tieso" complaint). Charging
      // still settles back into the lance-at-rest trail.
      const armAmp = 0.34 + runK * 0.5;
      if (armed) {
        const gait = Math.sin(ph + 0.35);                  // arm lags the leg a touch
        const ready = -0.32 + gait * (0.2 + runK * 0.14);  // low carry that SWINGS
        const trailing = 0.55 + gait * 0.08;
        t.j_shoulderR = [THREE.MathUtils.lerp(ready, trailing, charge), -gait * 0.05, THREE.MathUtils.lerp(-0.12, -0.18, charge)];
        t.j_elbowR = [THREE.MathUtils.lerp(-0.72 - Math.max(0, -gait) * 0.16, -0.3, charge), 0, 0];
        t.j_wristR = [-0.1 + gait * 0.1, 0, 0.1 + Math.sin(ph * 2) * 0.04];
      } else {
        t.j_shoulderR = [legPhR * armAmp * (1 - charge * 0.5), 0, -0.06];
        t.j_elbowR = [-0.18 - runK * 0.35 - Math.max(0, -legPhR) * (0.3 + runK * 0.3), 0, 0];
      }
      // Fase 10/17 — SHIELD CARRY → SHIELD CHARGE: a knight does NOT swing
      // the shield arm like a pendulum. Walking: elbow bent, shield held low
      // across the thigh with a touch of bob. Charging: the shield snaps UP
      // AND FORWARD — the battering-ram brace.
      const shieldCarry = hasShield && (p.blockT ?? 0) < 0.1;
      if (shieldCarry) {
        const bob = Math.sin(ph * 2) * 0.045;
        const walkPose: [number, number, number] = [-0.36 + bob - runK * 0.12, 0.18, 0.32];
        const chargePose: [number, number, number] = [-1.12, 0.28, 0.3];
        t.j_shoulderL = [
          THREE.MathUtils.lerp(walkPose[0], chargePose[0], charge),
          THREE.MathUtils.lerp(walkPose[1], chargePose[1], charge),
          THREE.MathUtils.lerp(walkPose[2], chargePose[2], charge),
        ];
        t.j_elbowL = [THREE.MathUtils.lerp(-0.94, -1.02, charge), 0, 0.16];
      } else {
        t.j_shoulderL = [legPhL * armAmp * 0.8 * (1 - charge * 0.5), 0, 0.06];
        t.j_elbowL = [-0.25 - runK * 0.3 - Math.max(0, -legPhL) * (0.28 + runK * 0.28), 0, 0];
      }

      // ---- TORSO & HEAD ----
      // The charge crouches into the run: deep lean, eyes UP over the rim.
      // Fase 24 — the counter-rotation grew: shoulders twist AGAINST the
      // hips like a real gait (the old ±0.05-0.13 was barely a shrug).
      const lean = 0.05 + runK * 0.2 + charge * 0.16;
      t.j_torso = [lean, Math.sin(ph) * (0.07 + runK * 0.12), 0];
      t.j_head = [
        -0.04 - runK * 0.08 - charge * 0.2,
        -Math.sin(ph) * (0.07 + runK * 0.05),
        -Math.sin(ph) * 0.02,
      ];
      // Fase 21 — the whole body ROLLS over the stance foot (weight shift in
      // the ribcage, not just a positional sway: kills the stiff-plank read)
      this.inner.rotation.z = damp(this.inner.rotation.z, Math.sin(ph) * (0.025 + runK * 0.045), 8, 1 / 60);
      // Fase 24 — the bounce grew with speed: the stride now has a real
      // flight phase at a sprint (the old 2.8 cm bob never left the ground)
      this.inner.position.y = Math.abs(Math.sin(ph)) * 0.042 * (0.5 + runK + charge * 0.5) - charge * 0.05;
      // Fase 12 — subtle lateral sway of the whole body over the stance foot
      this.inner.position.x = Math.sin(ph) * 0.014 * (0.6 + runK);
      // Fase 21 — WRIST follow-through: the hands lag the arm swing a beat
      // (relaxed wrists are half of "not rigid"). Fase 23: the armed wrist
      // is now authored inside the armed-arm block above — it rocks the
      // BLADE with the gait instead of a fixed grip.
      if (!armed) {
        t.j_wristR = [legPhR * 0.14 * (0.4 + runK), 0, -0.05 + Math.sin(ph * 2) * 0.03];
        t.j_wristL = [legPhL * 0.12 * (0.4 + runK), 0, 0.05 - Math.sin(ph * 2) * 0.03];
      } else {
        t.j_wristL = [-0.05, 0, -Math.sin(ph) * 0.025];
      }
    } else {
      // idle: breathing, weight shift, relaxed sword arm.
      // Fase 23 — the weight shift is VISIBLE now (the old ±0.012 sway was
      // sub-pixel): the hips load onto one leg, the ribcage follows a half
      // beat later, the shoulders breathe against it — the idle reads as a
      // man standing, not a mannequin plugged in.
      const br = Math.sin(this.t * 1.7);
      const sway = Math.sin(this.t * 0.33);
      const swayL = Math.sin(this.t * 0.33 - 0.5);   // ribcage lags the hips
      const armedIdle = this.weaponKind !== 'none' && this.weaponKind !== 'bow';
      t.j_torso = [0.025 + br * 0.02, Math.sin(this.t * 0.4) * 0.035, swayL * 0.03];
      // Fase 21 — idle head GLANCES: the knight scans the horizon now and
      // then instead of staring dead ahead
      const glance = Math.sin(this.t * 0.21) * Math.sin(this.t * 0.07 + 1.3);
      t.j_head = [0.0, Math.sin(this.t * 0.5) * 0.13 + glance * 0.22, Math.sin(this.t * 0.33) * 0.05];
      if (armedIdle) {
        // the sword arm holds a relaxed low carry that still breathes:
        // shoulder rocks with the ribcage, elbow folds a touch on the
        // exhale, wrist tips the blade out from the thigh.
        t.j_shoulderR = [br * 0.045 - 0.1, -0.03, -0.13 + swayL * 0.02];
        t.j_elbowR = [-0.34 - br * 0.05, 0, 0];
        t.j_wristR = [-0.12 + br * 0.03, 0, 0.14];
      } else {
        t.j_shoulderR = [br * 0.045 - 0.05, 0, -0.06];
        t.j_elbowR = [-0.16 - br * 0.035, 0, 0];
        // Fase 21 — relaxed wrists at rest (a touch of life in the hands)
        t.j_wristR = [-0.04 + br * 0.02, 0, -0.04];
      }
      t.j_shoulderL = [-br * 0.045, 0, 0.07];
      t.j_elbowL = [-0.24 - br * 0.02, 0, 0];
      t.j_wristL = [-0.05 - br * 0.02, 0, 0.05];
      // Fase 12 — the knees breathe with the weight shift
      t.j_kneeR = [-0.04 + Math.max(0, sway) * 0.05, 0, 0];
      t.j_kneeL = [-0.06 + Math.max(0, -sway) * 0.05, 0, 0];
      t.j_hipR = [0, 0, -sway * 0.032];
      t.j_hipL = [0, 0, sway * 0.032];
      this.inner.position.y = damp(this.inner.position.y, 0, 8, 1 / 60);
      this.inner.position.x = damp(this.inner.position.x, sway * 0.02, 6, 1 / 60);
      this.inner.rotation.z = damp(this.inner.rotation.z, swayL * 0.022, 6, 1 / 60);
      if (p.talking) {
        t.j_head = [0, Math.sin(this.t * 2.1) * 0.07, 0];
        t.j_shoulderR = [Math.sin(this.t * 3.0) * 0.16 - 0.12, 0, -0.05];
        t.j_elbowR = [-0.5, 0, 0];
      }
    }
  }

  private poseAir(t: PoseTarget, airT: number): void {
    // Fase 22 — a real JUMP ARC, not one frozen fall pose:
    //   TOFF (0..0.12)  the body leaves the ground EXTENDED — drive leg fully
    //                    down, toe pointed, chest tall (the anticipation is
    //                    the extension: you jump UP through the toes)
    //   RISE (0.12..0.5) knees tuck in, arms settle — the hang
    //   FALL (>0.5)     legs trail, chest opens, arms spread wide — the cape
    //                    cloth layer does the rest of the storytelling
    if (airT < 0.12) {
      const u = airT / 0.12;
      t.j_hipR = [THREE.MathUtils.lerp(-0.12, -0.3, u), 0, 0];
      t.j_kneeR = [THREE.MathUtils.lerp(0.5, 0.1, u), 0, 0];
      t.j_ankleR = [0.15 + 0.3 * u, 0, 0]; // toe off
      t.j_hipL = [THREE.MathUtils.lerp(0.1, -0.12, u), 0, 0];
      t.j_kneeL = [THREE.MathUtils.lerp(0.75, 0.35, u), 0, 0];
      t.j_ankleL = [0.3, 0, 0];
      t.j_torso = [0.14 - 0.06 * u, 0, 0];
      t.j_head = [-0.1, 0, 0];
      t.j_shoulderR = [-0.5 - 0.2 * u, 0, -0.3 - 0.1 * u];
      t.j_shoulderL = [0.3 - 0.55 * u, 0, 0.25 + 0.1 * u];
      t.j_elbowR = [-0.35, 0, 0];
      t.j_elbowL = [-0.3, 0, 0];
      this.inner.position.y = 0;
      return;
    }
    const rise = Math.min(1, (airT - 0.12) / 0.38);
    const fall = Math.min(1, Math.max(0, airT - 0.5) / 0.45);
    const fallInv = 1 - fall;
    // rise: tuck / fall: open — blended continuously by the two ramps
    t.j_shoulderR = [THREE.MathUtils.lerp(-0.7, -1.05, fall), 0, -0.35 - fall * 0.2 + rise * 0.1];
    t.j_shoulderL = [THREE.MathUtils.lerp(-0.25, -0.85, fall), 0, 0.4 + fall * 0.2 - rise * 0.1];
    t.j_elbowR = [-0.35 - fall * 0.25, 0, 0];
    t.j_elbowL = [-0.3 - fall * 0.3, 0, 0];
    t.j_hipR = [THREE.MathUtils.lerp(-0.45, -1.0, fall) + rise * 0.2, 0, 0];
    t.j_kneeR = [THREE.MathUtils.lerp(0.9, 0.35, fall), 0, 0];
    t.j_hipL = [0.2 + fall * 0.35, 0, 0];
    t.j_kneeL = [0.5 + fall * 0.6, 0, 0];
    t.j_ankleR = [0.2 + fall * 0.25, 0, 0];
    t.j_ankleL = [0.3, 0, 0];
    t.j_torso = [0.1 + fall * 0.12, 0, 0];
    t.j_head = [-0.12 + fall * 0.22, 0, 0];
    this.inner.position.y = 0;
    // Fase 22 — micro roll into the fall (weight reads through the ribcage)
    this.inner.rotation.z = fall * 0.02 * fallInv;
    // Fase 24 — the fall LIVES: the old spread-eagle froze rock-solid after
    // half a second aloft. Slow micro-scissor in the legs + opposing arm
    // drift keep the silhouette moving against the air.
    const wob = Math.sin(airT * 5.3) * 0.05;
    const wob2 = Math.cos(airT * 4.1) * 0.045;
    t.j_shoulderR = [t.j_shoulderR[0] + wob2 * 0.6, t.j_shoulderR[1], t.j_shoulderR[2] + wob];
    t.j_shoulderL = [t.j_shoulderL[0] + wob2 * 0.6, t.j_shoulderL[1], t.j_shoulderL[2] - wob];
    t.j_hipR = [t.j_hipR[0] + wob * 0.7, t.j_hipR[1], t.j_hipR[2]];
    t.j_hipL = [t.j_hipL[0] - wob * 0.7, t.j_hipL[1], t.j_hipL[2]];
    t.j_kneeR = [t.j_kneeR[0] + Math.abs(wob) * 0.35, 0, 0];
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

  /** Fase 17 — the flying kick of the hook dash: a drop-kick silhouette
   *  that reads at full speed — lead leg extended, body arched behind it,
   *  arms tucked for the aerodynamics of a man who has made a mistake. */
  private poseHookKick(t: PoseTarget): void {
    // lead leg (right) drives the kick
    t.j_hipR = [-1.62, 0.06, -0.06];
    t.j_kneeR = [0.14, 0, 0];
    t.j_ankleR = [0.55, 0, 0];
    // trailing leg folded under
    t.j_hipL = [0.62, 0, 0.1];
    t.j_kneeL = [1.35, 0, 0];
    t.j_ankleL = [0.4, 0, 0];
    // body arched back, chest proud, chin up
    t.j_torso = [-0.3, 0, 0];
    t.j_head = [0.18, 0, 0];
    // arms swept back like a diver
    t.j_shoulderR = [0.85, 0, -0.55];
    t.j_elbowR = [-0.5, 0, 0];
    t.j_shoulderL = [0.7, 0, 0.6];
    t.j_elbowL = [-0.45, 0, 0];
    this.inner.position.y = 0;
  }

  /** Attack curves. attackT: 0→1 across the whole swing. */
  private poseAttack(t: PoseTarget, k: number, kind: string, bowDraw: number): void {
    const L = THREE.MathUtils.lerp;
    const ease = (u: number) => u * u * (3 - 2 * u);
    // Fase 22 — the AAA easing set:
    //  · wuEase (quadratic-OUT): launches into the gather, then settles into
    //    the hold. The windup reads as WEIGHT TRANSFER — anticipation — not a
    //    linear wind-up clock.
    //  · strikeEase (cubic-OUT): the blade EXPLODES out of the windup and
    //    decelerates through the target. A whip, not a ramp.
    const wuEase = (u: number) => 1 - (1 - u) * (1 - u);
    const strikeEase = (u: number) => 1 - Math.pow(1 - u, 3);
    if (kind === 'heavy') {
      // overhead smash: windup raised through X (arm swings forward-up
      // overhead — Fase 24: raising via Z left the blade pointing
      // forward-down at the ground; raising via X cocks it up-back over
      // the shoulder like a headsman's windup), slam (0.42..0.68), recover
      if (k < 0.42) {
        const u = wuEase(k / 0.42);
        t.j_shoulderR = [L(0, -2.35, u), 0, L(0, -0.55, u)];
        t.j_elbowR = [-0.6, 0, 0];
        // the wrist cocks the blade back over the shoulder
        t.j_wristR = [0.55 * u, 0, 0.05 * u];
        t.j_torso = [0.1, L(0, -0.5, u), 0];
        t.j_head = [L(0, -0.3, u), 0, 0];
        this.inner.position.y = -0.09 * u;
      } else if (k < 0.68) {
        const u = strikeEase((k - 0.42) / 0.26);
        t.j_shoulderR = [L(-2.35, 1.08, u), 0, L(-0.55, -0.45, u)];
        t.j_elbowR = [L(-0.6, -0.1, u), 0, 0];
        // Fase 24 — the wrist WHIP: un-cocks through the smash so the edge
        // leads the drop (the old -0.4 sin flick dragged the blade backward
        // through the cut — reversed)
        t.j_wristR = [L(0.55, 0.3, u), 0, 0];
        t.j_torso = [L(0.1, 0.5, u), L(-0.5, 0.5, u), 0];
        t.j_head = [L(-0.3, 0.34, u), 0, 0];
        t.j_kneeR = [0.5 * u, 0, 0];
        t.j_kneeL = [0.55 * u, 0, 0];
        this.inner.position.y = -0.07 * (1 - u) - 0.05 * u;
      } else {
        const u = (k - 0.68) / 0.32;
        t.j_shoulderR = [L(0.95, 0, u), 0, L(-0.35, -0.06, u)];
        t.j_elbowR = [L(-0.1, -0.25, u), 0, 0];
        t.j_wristR = [L(0.2, -0.1, u), 0, 0];
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
        const u = wuEase(k / 0.35);
        t.j_shoulderR = [L(0, -0.58, u), 0, L(0, -0.18, u)];
        t.j_elbowR = [L(0, -1.95, u), 0, 0];
        // Fase 24 — chamber: the fist pulls in, the blade tips up-back
        t.j_wristR = [0.2 * u, 0, 0];
        t.j_torso = [0.08, L(0, 0.5, u), 0];
        t.j_hipR = [L(0, 0.15, u), 0, 0];
        this.inner.position.y = -0.03 * u;
      } else if (k < 0.62) {
        const u = strikeEase((k - 0.35) / 0.27);
        t.j_shoulderR = [L(-0.58, -1.75, u), 0, L(-0.18, -0.05, u)];
        t.j_elbowR = [L(-1.95, -0.05, u), 0, 0];
        // Fase 24 — the wrist HOLDS the blade on the thrust line: with the
        // perpendicular grip, +1.7 rad of wrist pitches the steel out along
        // the extended arm — the stab finally points AT the enemy (it used
        // to poke up-back). The same ramp aligns the spear: its 1.35 grip +
        // 1.7 wrist ≈ π, the shaft rides straight out the fist.
        t.j_wristR = [L(0.2, 1.7, u), 0, 0];
        this.attackWeaponPitch = 0; // the wrist alone aligns ANY weapon (grip 1.35-1.52 + 1.7 ≈ π) on the thrust line
        t.j_torso = [0.16, L(0.4, -0.32, u), 0];
        t.j_hipR = [L(0.15, -0.4, u), 0, 0];
        t.j_kneeR = [0.25, 0, 0];
      } else {
        const u = (k - 0.62) / 0.38;
        t.j_shoulderR = [L(-1.55, 0, u), 0, -0.05 * (1 - u)];
        t.j_elbowR = [L(-0.05, -0.2, u), 0, 0];
        t.j_wristR = [L(1.7, -0.1, u), 0, 0];
        this.attackWeaponPitch = 0;
        t.j_torso = [L(0.16, 0.04, u), L(-0.32, 0, u), 0];
        t.j_hipR = [L(-0.4, 0, u), 0, 0];
      }
      t.j_shoulderL = [-0.3, 0, 0.2];
      t.j_elbowL = [-0.85, 0, 0];
    } else if (kind === 'light2') {
      // backhand: windup right, sweep across left
      if (k < 0.35) {
        const u = wuEase(k / 0.35);
        t.j_shoulderR = [L(0, -2.05, u), 0, L(0, 0.68, u)];
        t.j_torso = [0.08, L(0, 0.5, u), 0];
        t.j_elbowR = [-0.3, 0, 0];
        t.j_wristR = [0.15 * u, 0, 0];
      } else if (k < 0.75) {
        const u = strikeEase((k - 0.35) / 0.4);
        t.j_shoulderR = [L(-2.05, 0.62, u), 0, L(0.68, -1.05, u)];
        t.j_torso = [0.12, L(0.5, -0.58, u), 0];
        t.j_head = [0, L(0, -0.2, u), 0];
        t.j_hipR = [-0.2 * u, 0, 0];
        // Fase 24 — the backhand whip: the blade snaps across the body
        t.j_wristR = [L(0.15, -0.3, u), 0, 0];
      } else {
        const u = (k - 0.75) / 0.25;
        t.j_shoulderR = [L(0.5, 0, u), 0, L(-0.9, -0.06, u)];
        t.j_torso = [L(0.12, 0.03, u), L(-0.5, 0, u), 0];
        t.j_head = [0, L(-0.2, 0, u), 0];
        t.j_wristR = [L(-0.2, -0.08, u), 0, 0];
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
        const u = wuEase(k / 0.34);
        t.j_shoulderR = [L(0, -2.45, u), 0, L(0, -0.95, u)];
        // Fase 24 — the wrist cocks the blade UP-BACK over the shoulder as
        // the arm lifts (with the perpendicular grip this is what makes the
        // windup read RAISED instead of dropped behind the back)
        t.j_wristR = [0.5 * u, 0, 0.06 * u];
        t.j_torso = [0.08, L(0, -0.5, u), 0];
        t.j_elbowR = [-0.5, 0, 0];
        this.inner.position.y = -0.05 * u;
      } else if (k < 0.74) {
        const u = strikeEase((k - 0.34) / 0.4);
        t.j_shoulderR = [L(-2.45, 0.68, u), 0, L(-0.95, 0.62, u)];
        // Fase 24 — the wrist UNCOCKS through the cut: the hand leads, the
        // steel snaps after — from the cocked +0.5 back through the plane
        // of the cut into the follow-through wrap (-0.35)
        t.j_wristR = [L(0.5, -0.35, u), 0, L(0.06, -0.2, u)];
        t.j_torso = [L(0.08, 0.44, u), L(-0.5, 0.52, u), 0];
        t.j_head = [0, L(0, 0.18, u), 0];
        t.j_hipR = [-0.22 * u, 0, 0];
        t.j_kneeR = [0.3 * u, 0, 0];
        this.inner.position.y = -0.03 * (1 - u);
      } else {
        const u = (k - 0.74) / 0.26;
        t.j_shoulderR = [L(0.55, 0, u), 0, L(0.5, -0.06, u)];
        t.j_wristR = [L(-0.25, -0.1, u), 0, -0.1 * (1 - u)];
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
    if (kind === 'sweep') {
      // Fase 17 — the SPINNING SWEEP KICK (chain hit 3): a low arc that
      // takes the ankles. The whole body pivots through it (inner yaw) while
      // the lead leg scythes the deck.
      const spin = (u: number) => THREE.MathUtils.lerp(0.5, -2.45, u);
      if (k < 0.24) {
        // coil: drop the weight, wind the torso
        const u = wuEase(k / 0.24);
        t.j_torso = [0.3 * u + 0.06, THREE.MathUtils.lerp(0, 0.5, u), 0];
        t.j_hipR = [-0.25 * u, 0, 0];
        t.j_kneeR = [1.05 * u, 0, 0];
        t.j_hipL = [-0.15 * u, 0, 0];
        t.j_kneeL = [0.35 * u, 0, 0];
        this.inner.position.y = -0.16 * u;
        this.inner.rotation.y = THREE.MathUtils.lerp(0, 0.5, u);
      } else if (k < 0.66) {
        // THE SWEEP: the pivot unloads, the leg scythes low
        const u = strikeEase((k - 0.24) / 0.42);
        t.j_torso = [0.36, THREE.MathUtils.lerp(0.5, -0.6, u), 0];
        t.j_hipR = [THREE.MathUtils.lerp(-0.25, -1.35, u), 0, 0];
        t.j_kneeR = [THREE.MathUtils.lerp(1.05, 0.1, u), 0, 0];
        t.j_ankleR = [0.3, 0, 0];
        t.j_hipL = [-0.35, 0, 0];
        t.j_kneeL = [1.25, 0, 0];
        this.inner.position.y = -0.24;
        this.inner.rotation.y = spin(u);
      } else {
        // recover: rise out of the crouch, unwind
        const u = (k - 0.66) / 0.34;
        t.j_torso = [THREE.MathUtils.lerp(0.36, 0.05, u), THREE.MathUtils.lerp(-0.6, 0, u), 0];
        t.j_hipR = [THREE.MathUtils.lerp(-1.35, 0, u), 0, 0];
        t.j_kneeR = [THREE.MathUtils.lerp(0.1, 0.2, u), 0, 0];
        t.j_hipL = [THREE.MathUtils.lerp(-0.35, 0, u), 0, 0];
        t.j_kneeL = [THREE.MathUtils.lerp(1.25, 0.15, u), 0, 0];
        this.inner.position.y = -0.24 * (1 - u);
        this.inner.rotation.y = THREE.MathUtils.lerp(-2.45, -Math.PI * 2, u);
      }
      // arms: whipsaw counter-rotation
      t.j_shoulderR = [-0.6, 0, -0.4];
      t.j_elbowR = [-0.8, 0, 0];
      t.j_shoulderL = [-0.5, 0, 0.55];
      t.j_elbowL = [-0.7, 0, 0];
      t.j_head = [-0.1, 0.2, 0];
    } else if (kind === 'spin') {
      // 360° horizontal sweep: coil left (0..0.3), whip around
      // (0.3..0.72 — the torso drives the turn), settle the follow-through.
      // Fase 17: the whole body rotates with it (inner yaw) — a true
      // whirlwind, not a torso twist.
      if (k < 0.3) {
        const u = wuEase(k / 0.3);
        t.j_shoulderR = [L(0, -1.15, u), 0, L(0, 1.05, u)];
        t.j_elbowR = [-0.2, 0, 0];
        t.j_torso = [0.06, L(0, 0.85, u), 0];
        t.j_hipR = [0.12, 0, 0];
        t.j_hipL = [-0.18, 0, 0];
        this.inner.position.y = -0.05 * u;
        this.inner.rotation.y = L(0, 0.55, u);
      } else if (k < 0.72) {
        const u = strikeEase((k - 0.3) / 0.42);
        t.j_shoulderR = [L(-1.15, -1.05, u), 0, L(1.05, -1.15, u)];
        t.j_elbowR = [L(-0.2, -0.08, u), 0, 0];
        // Fase 24 — the wrist keeps the blade laid out through the whirl
        t.j_wristR = [0.25, 0, 0];
        t.j_torso = [0.1, L(0.85, -0.95, u), 0];
        t.j_head = [0, L(0.5, -0.55, u), 0];
        t.j_hipR = [0.1, L(0.3, -0.35, u), 0];
        t.j_hipL = [-0.1, L(-0.3, 0.35, u), 0];
        t.j_kneeR = [0.35, 0, 0];
        this.inner.position.y = -0.09;
        this.inner.rotation.y = L(0.55, -3.6, u); // the full whirl
      } else {
        const u = (k - 0.72) / 0.28;
        t.j_shoulderR = [L(-1.05, -0.2, u), 0, L(-1.15, -0.1, u)];
        t.j_elbowR = [L(-0.08, -0.25, u), 0, 0];
        t.j_torso = [L(0.1, 0.03, u), L(-0.95, 0, u), 0];
        t.j_head = [0, L(-0.55, 0, u), 0];
        t.j_hipR = [0, L(-0.35, 0, u), 0];
        this.inner.position.y = -0.09 * (1 - u);
        this.inner.rotation.y = L(-3.6, -Math.PI * 2, u);
      }
      t.j_shoulderL = [-0.75, 0, 0.5];
      t.j_elbowL = [-0.7, 0, 0];
    } else if (kind === 'uppercut') {
      // rising slash: coil low (0..0.38), launch upward (0.38..0.66),
      // the body rides the rising blade
      if (k < 0.38) {
        const u = wuEase(k / 0.38);
        t.j_shoulderR = [L(0, -0.9, u), 0, L(0, 0.85, u)];
        t.j_elbowR = [L(0, -1.5, u), 0, 0];
        t.j_torso = [L(0, 0.5, u), L(0, 0.55, u), 0];
        t.j_kneeR = [0.85 * u, 0, 0];
        t.j_kneeL = [0.7 * u, 0, 0];
        this.inner.position.y = -0.22 * u;
      } else if (k < 0.66) {
        const u = strikeEase((k - 0.38) / 0.28);
        t.j_shoulderR = [L(-0.9, -2.6, u), 0, L(0.85, -0.15, u)];
        t.j_elbowR = [L(-1.5, -0.12, u), 0, 0];
        // Fase 24 — the rising slash: the wrist sweeps the blade up through
        // the launch so the steel leads the rise (it used to end pointing
        // back over the shoulder — the launch read as a shrug)
        t.j_wristR = [L(0, 0.9, u), 0, 0];
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
      // Fase 24 — the weapon FLIPS into the dive: the blade reverses down
      // the arm line (the old pose held the sword pointing back over the
      // shoulder while falling — a dive that read backwards)
      t.j_wristR = [0.35 * u, 0, 0];
      this.attackWeaponPitch = Math.PI * Math.min(1, u * 1.5);
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
        const u = wuEase(k / 0.3);
        t.j_shoulderR = [L(0, -2.3, u), 0, L(0, -0.7, u)];
        t.j_elbowR = [-0.3, 0, 0];
        t.j_torso = [0.1, L(0, -0.5, u), 0];
      } else if (k < 0.68) {
        const u = strikeEase((k - 0.3) / 0.38);
        t.j_shoulderR = [L(-2.3, 0.35, u), 0, L(-0.7, 0.85, u)];
        t.j_elbowR = [L(-0.3, -0.1, u), 0, 0];
        // Fase 24 — mild whip through the air cut
        t.j_wristR = [0.25 * Math.sin(u * Math.PI), 0, 0];
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

  // ------------------------------------------------------------ Fase 22 — cape

  /**
   * THE CAPE CLOTH LAYER — spring-damper secondary motion for the cloak.
   *
   * Two chain bones (j_cape1 shoulder-line, j_cape2 mid-panel) are skinned to
   * the real cape sheet of the GLB. Every frame we drive them from the
   * character's motion state: the cape streams back at a run, billows in
   * long falls, tucks on the rise, trails flat in the water, lags a beat
   * behind turns, and answers the coil-whip of an attack with a pulse.
   * j_cape1 is a stiff spring (settles fast); j_cape2 follows cape1 with a
   * beat of lag and more overshoot — the wave travels down the fabric.
   */
  private updateCape(p: AnimParams, dt: number): void {
    if (!this.capeBone1 || !this.capeBone2) return;
    const sm = (x: number, lo: number, hi: number) => THREE.MathUtils.smoothstep(x, lo, hi);
    const clamp = THREE.MathUtils.clamp;
    const speed = this.speedSm;
    const vy = p.vy ?? 0;
    const yawRate = p.yawRate ?? 0;

    // idle flutter: two sines, quiet at speed (the air is doing the talking)
    const flutter = (Math.sin(this.t * 3.1) * 0.028 + Math.sin(this.t * 7.7) * 0.014)
      * (1 - Math.min(1, speed / 5.2));

    // pitch target: hang → stream back at a run → flare in long falls
    let pitch = 0.05
      + sm(speed, 0.6, 6.4) * 0.44        // streams back at a run
      + (vy < -3 ? Math.min(0.38, (-vy - 3) * 0.05) : 0)  // skydive flare
      - (vy > 3 ? 0.10 : 0)               // tucked on the rise of a jump
      + (p.swimming ? 0.5 : 0)            // trails flat in the water
      + flutter;
    // the coil-whip of a swing shoves the fabric back through the cut
    if (p.attackT > 0) pitch += Math.sin(Math.min(1, p.attackT) * Math.PI) * 0.16;
    pitch = clamp(pitch, -0.15, 1.05);

    // yaw target: the cape lags the turn (counter-rotation = secondary action)
    const yawT = clamp(-yawRate * 0.055, -0.30, 0.30) + flutter * 0.4;

    // integrate: critically-snappy springs, cape1 stiff / cape2 loose
    const spring = (st: { r: number[]; v: number[] }, tx: number, ty: number, K: number, D: number) => {
      for (let a = 0; a < 2; a++) {
        const target = a === 0 ? tx : ty;
        const acc = (target - st.r[a]) * K - st.v[a] * D;
        st.v[a] += acc * dt;
        st.r[a] = clamp(st.r[a] + st.v[a] * dt, -0.5, 1.2);
      }
    };
    spring(this.cape1st, pitch, yawT, 26, 8.0);
    // cape2 chases cape1's CURRENT pose ×1.28 — the wave travels down the hem
    spring(this.cape2st, this.cape1st.r[0] * 1.28 + 0.03, this.cape1st.r[1] * 1.35 + flutter * 0.5, 11, 4.2);

    this.capeBone1.rotation.set(this.cape1st.r[0], this.cape1st.r[1], 0);
    this.capeBone2.rotation.set(this.cape2st.r[0], this.cape2st.r[1], 0);
  }

  // ------------------------------------------------------------ apply

  /** Write target eulers onto the bones. `direct` skips damping (attacks,
   * rolls, swims) so the curves stay crisp.
   *
   * Fase 23 — SETTLE CASCADE: instead of one uniform rate, the legs track
   * the ground fast (they must — the foot plants), the arms settle a beat
   * later and the torso/head last. The staggered rates are what make a
   * stop from a sprint READ as weight transferring up the body instead of
   * a whole puppet snapping to rest. */
  private static readonly DAMP_RATE: Record<string, number> = {
    j_hipR: 20, j_kneeR: 20, j_ankleR: 22,
    j_hipL: 20, j_kneeL: 20, j_ankleL: 22,
    j_shoulderR: 11, j_elbowR: 13, j_wristR: 15,
    j_shoulderL: 11, j_elbowL: 13, j_wristL: 15,
    j_root: 12, j_torso: 9, j_head: 8,
  };
  private apply(target: PoseTarget, dt: number, direct: boolean): void {
    for (const name of BONE_NAMES) {
      const b = this.bones.get(name);
      if (!b) continue;
      const tv = target[name];
      if (!tv) continue;
      if (direct) {
        b.rotation.set(tv[0], tv[1], tv[2]);
      } else {
        const rate = KnightModelGLB.DAMP_RATE[name] ?? 14;
        const c = this.cur[name] ?? [0, 0, 0] as Euler3;
        c[0] = damp(c[0], tv[0], rate, dt);
        c[1] = damp(c[1], tv[1], rate, dt);
        c[2] = damp(c[2], tv[2], rate, dt);
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
