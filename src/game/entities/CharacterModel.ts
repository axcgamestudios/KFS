import * as THREE from 'three';

/**
 * Procedural humanoid character with articulated joints and code-driven
 * animations (idle breathing, walk, run, jump, swim, weapon swings, block,
 * dodge roll, bow draw). Reused for the player and all villagers with
 * different palettes.
 */

export interface CharacterPalette {
  skin: number;
  hair: number;
  tunic: number;
  sleeves: number;
  pants: number;
  boots: number;
  cape?: number;
}

export const PLAYER_PALETTE: CharacterPalette = {
  skin: 0xc9a17a,
  hair: 0x4a3120,
  tunic: 0x3d5a3a,
  sleeves: 0x8a7a5c,
  pants: 0x4a3a28,
  boots: 0x33261a,
  cape: 0x5a2e22,
};

const VILLAGER_PALETTES: CharacterPalette[] = [
  { skin: 0xc9a17a, hair: 0x3a2a1a, tunic: 0x7a5a38, sleeves: 0x9a8a6a, pants: 0x4a4038, boots: 0x33261a },
  { skin: 0xd9b18a, hair: 0x6a4a2a, tunic: 0x5a6a7a, sleeves: 0x8a9aa5, pants: 0x3a3a42, boots: 0x2a2620 },
  { skin: 0xb98a62, hair: 0x2a1e12, tunic: 0x8a4a3a, sleeves: 0xa89a88, pants: 0x4a3a2a, boots: 0x302818 },
  { skin: 0xd9b18a, hair: 0x8a6a3a, tunic: 0x6a7a4a, sleeves: 0xa8a88a, pants: 0x48402a, boots: 0x38301e },
  { skin: 0xc9a17a, hair: 0x1e1610, tunic: 0x4a4a5e, sleeves: 0x7a8290, pants: 0x38343c, boots: 0x26221c },
];

export function villagerPalette(i: number): CharacterPalette {
  return VILLAGER_PALETTES[i % VILLAGER_PALETTES.length];
}

function box(w: number, h: number, d: number, color: number, rough = 0.85): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 }),
  );
  m.castShadow = true;
  return m;
}

/**
 * Common visual surface every character body implements (procedural
 * CharacterModel, GLB-skinned KnightModelGLB, ...). Lets Player / NPCs /
 * crews swap bodies without touching gameplay code.
 */
export interface CharacterVisual {
  readonly root: THREE.Group;
  update(p: AnimParams): void;
  flash(): void;
  setWeapon(kind: WeaponKind): void;
  setShield(visible: boolean): void;
  setEquippedState(equipped: boolean): void;
  faceYaw?(yaw: number): void;
  setSwordEquipped?(equipped: boolean): void;
  dispose(): void;
}

/** Weapon visual categories (mapped from item ids by the game). */
export type WeaponKind = 'none' | 'sword' | 'axe' | 'spear' | 'bow';

export interface AnimParams {
  dt: number;
  speed: number;        // horizontal speed m/s
  moving: boolean;
  grounded: boolean;
  swimming: boolean;
  attackT: number;      // 0 = idle, 0..1 during swing
  talking?: boolean;
  /** Attack animation variant (Fase 3). Default keeps the classic diagonal slash. */
  attackKind?: 'light1' | 'light2' | 'heavy' | 'thrust' | 'bowRelease';
  /** Block pose blend 0..1. */
  blockT?: number;
  /** Dodge roll progress 0..1 (drives the whole-body forward roll). */
  rollT?: number;
  /** Bow draw blend 0..1 (aim pose while drawing). */
  bowDraw?: number;
  /** Fase 4 — riding pose on horseback (legs bent around the saddle, reins). */
  riding?: boolean;
  /** Fase 4 — riding bounce phase (0..1), driven by the horse gait. */
  rideBounce?: number;
}

export class CharacterModel {
  readonly root = new THREE.Group();
  protected hips = new THREE.Group();
  protected chest = new THREE.Group();
  protected head = new THREE.Group();
  protected legL = new THREE.Group();
  protected legR = new THREE.Group();
  protected kneeL = new THREE.Group();
  protected kneeR = new THREE.Group();
  protected armL = new THREE.Group();
  protected armR = new THREE.Group();
  protected elbowL = new THREE.Group();
  protected elbowR = new THREE.Group();
  protected cape: THREE.Mesh | null = null;
  private hipSlots: Partial<Record<WeaponKind, THREE.Group>> = {};
  private handSlots: Partial<Record<WeaponKind, THREE.Group>> = {};
  private shieldGroup = new THREE.Group();
  private bowInHand = new THREE.Group();
  private phase = Math.random() * 10;
  private t = 0;
  private weapon: WeaponKind = 'none';
  private weaponEquippedVisible = false;
  private flashT = 0;
  private flashMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(palette: CharacterPalette) {
    const mkMat = (c: number) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.02 });
      this.flashMaterials.push(m);
      return m;
    };

    this.root.add(this.hips);
    this.hips.position.y = 0.94;

    // --- Torso ---
    this.hips.add(this.chest);
    this.chest.position.y = 0.08;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.26), mkMat(palette.tunic));
    torso.position.y = 0.3;
    torso.castShadow = true;
    this.chest.add(torso);
    this.flashMaterials.push(torso.material as THREE.MeshStandardMaterial);
    // Belt
    const belt = box(0.45, 0.08, 0.28, 0x2e2118);
    belt.position.y = 0.06;
    this.chest.add(belt);
    const buckle = box(0.09, 0.07, 0.03, 0xc9a227, 0.4);
    buckle.material = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.8 });
    buckle.position.set(0, 0.06, 0.15);
    this.chest.add(buckle);
    // Shoulder pads
    for (const s of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), mkMat(palette.sleeves));
      pad.position.set(s * 0.26, 0.5, 0);
      pad.castShadow = true;
      this.chest.add(pad);
    }

    // --- Head ---
    this.chest.add(this.head);
    this.head.position.y = 0.62;
    const skull = box(0.24, 0.26, 0.24, palette.skin, 0.7);
    skull.position.y = 0.13;
    this.head.add(skull);
    // Hair cap
    const hair = box(0.26, 0.12, 0.26, palette.hair, 0.9);
    hair.position.set(0, 0.245, -0.01);
    this.head.add(hair);
    // Eyes (dark insets facing +Z)
    for (const s of [-1, 1]) {
      const eye = box(0.035, 0.03, 0.02, 0x1e1610, 0.6);
      eye.position.set(s * 0.055, 0.13, 0.121);
      this.head.add(eye);
    }

    // --- Arms (shoulder pivot → elbow pivot → hand) ---
    const buildArm = (side: number, arm: THREE.Group, elbow: THREE.Group) => {
      arm.position.set(side * 0.27, 0.48, 0);
      this.chest.add(arm);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.13), mkMat(palette.sleeves));
      upper.position.y = -0.17;
      upper.castShadow = true;
      arm.add(upper);
      elbow.position.y = -0.34;
      arm.add(elbow);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.3, 0.11), mkMat(palette.sleeves));
      fore.position.y = -0.15;
      fore.castShadow = true;
      elbow.add(fore);
      const hand = box(0.09, 0.1, 0.1, palette.skin, 0.7);
      hand.position.y = -0.33;
      elbow.add(hand);
    };
    buildArm(-1, this.armL, this.elbowL);
    buildArm(1, this.armR, this.elbowR);

    // --- Legs (hip pivot → knee pivot → foot) ---
    const buildLeg = (side: number, leg: THREE.Group, knee: THREE.Group) => {
      leg.position.set(side * 0.12, -0.02, 0);
      this.hips.add(leg);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.16), mkMat(palette.pants));
      thigh.position.y = -0.21;
      thigh.castShadow = true;
      leg.add(thigh);
      knee.position.y = -0.44;
      leg.add(knee);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.14), mkMat(palette.pants));
      shin.position.y = -0.2;
      shin.castShadow = true;
      knee.add(shin);
      const boot = box(0.15, 0.12, 0.24, palette.boots);
      boot.position.set(0, -0.4, 0.04);
      knee.add(boot);
    };
    buildLeg(-1, this.legL, this.kneeL);
    buildLeg(1, this.legR, this.kneeR);

    // --- Cape (only if palette defines it) ---
    if (palette.cape !== undefined) {
      const capeGeo = new THREE.PlaneGeometry(0.44, 0.85, 1, 4);
      const capeMat = new THREE.MeshStandardMaterial({
        color: palette.cape, roughness: 0.9, side: THREE.DoubleSide,
      });
      this.cape = new THREE.Mesh(capeGeo, capeMat);
      this.cape.position.set(0, 0.28, -0.16);
      this.cape.castShadow = true;
      this.chest.add(this.cape);
    }

    // --- Weapon park: one hip slot + one hand slot per weapon kind ---
    for (const kind of ['sword', 'axe', 'spear'] as WeaponKind[]) {
      const hip = new THREE.Group();
      const hand = new THREE.Group();
      this.buildWeapon(kind, hip, hand);
      hip.visible = false;
      hand.visible = false;
      this.chest.add(hip);
      this.elbowR.add(hand);
      this.hipSlots[kind] = hip;
      this.handSlots[kind] = hand;
    }
    // Hip weapon rest pose (sword at the belt, axe & spear across the back)
    if (this.hipSlots.sword) this.hipSlots.sword.position.set(0.22, 0.02, -0.05);
    if (this.hipSlots.axe) {
      this.hipSlots.axe.position.set(-0.2, 0.32, -0.18);
      this.hipSlots.axe.rotation.set(0.35, 0, 2.6);
    }
    if (this.hipSlots.spear) {
      this.hipSlots.spear.position.set(-0.24, 0.1, -0.12);
      this.hipSlots.spear.rotation.set(0.25, 0, 2.35);
    }
    for (const hand of Object.values(this.handSlots)) {
      hand.position.set(0, -0.36, 0.05);
      hand.rotation.set(0, 0, Math.PI);
    }

    // --- Bow: carried on the back at rest, in the LEFT hand while drawn ---
    this.buildBow(this.bowInHand);
    this.bowInHand.position.set(0, -0.34, 0.1);
    this.bowInHand.visible = false;
    this.elbowL.add(this.bowInHand);

    // --- Shield on the left forearm ---
    this.buildShield(this.shieldGroup);
    this.shieldGroup.position.set(-0.02, -0.3, 0.12);
    this.shieldGroup.rotation.set(Math.PI / 2, 0, 0);
    this.shieldGroup.visible = false;
    this.elbowL.add(this.shieldGroup);
  }

  // ------------------------------------------------------------ weapons

  private buildWeapon(kind: WeaponKind, hip: THREE.Group, hand: THREE.Group): void {
    const steel = new THREE.MeshStandardMaterial({ color: 0xaab0b6, roughness: 0.35, metalness: 0.85 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x767c82, roughness: 0.45, metalness: 0.75 });
    const guardM = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.4, metalness: 0.7 });
    const woodM = new THREE.MeshStandardMaterial({ color: 0x4a3624, roughness: 0.85 });
    const gripM = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });

    if (kind === 'sword') {
      const mk = (parent: THREE.Group) => {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.78, 0.012), steel);
        blade.position.y = 0.52;
        blade.castShadow = true;
        parent.add(blade);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.033, 0.12, 4), steel);
        tip.position.y = 0.96;
        parent.add(tip);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.045), guardM);
        guard.position.y = 0.13;
        parent.add(guard);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.22, 6), gripM);
        grip.position.y = 0.0;
        parent.add(grip);
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), guardM);
        pommel.position.y = -0.12;
        parent.add(pommel);
      };
      mk(hip);
      mk(hand);
      return;
    }

    if (kind === 'axe') {
      const mk = (parent: THREE.Group) => {
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.92, 7), woodM);
        haft.position.y = 0.42;
        haft.castShadow = true;
        parent.add(haft);
        // Axe head: two flaring blades joined at the socket
        const headCore = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), darkSteel);
        headCore.position.set(0, 0.82, 0);
        parent.add(headCore);
        for (const s of [-1, 1]) {
          const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.05, 0.03, 3), darkSteel);
          blade.rotation.set(0, 0, -s * Math.PI / 2);
          blade.rotation.x = Math.PI / 2;
          blade.position.set(s * 0.13, 0.82, 0);
          blade.castShadow = true;
          parent.add(blade);
        }
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.18, 7), gripM);
        grip.position.y = 0.02;
        parent.add(grip);
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), guardM);
        pommel.position.y = -0.06;
        parent.add(pommel);
      };
      mk(hip);
      mk(hand);
      return;
    }

    // spear
    const mk = (parent: THREE.Group) => {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.023, 1.72, 7), woodM);
      shaft.position.y = 0.55;
      shaft.castShadow = true;
      parent.add(shaft);
      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.1, 7), guardM);
      socket.position.y = 1.42;
      parent.add(socket);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 6), steel);
      tip.position.y = 1.6;
      tip.castShadow = true;
      parent.add(tip);
      const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.12, 6), darkSteel);
      butt.position.y = -0.32;
      parent.add(butt);
    };
    mk(hip);
    mk(hand);
  }

  private buildBow(parent: THREE.Group): void {
    const woodM = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 0.75 });
    // Arc of the bow: 5 short segments following a curve
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const k = i / (segs - 1);          // 0..1 along the bow
      const ang = (k - 0.5) * 1.9;       // sweep
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.19, 5), woodM);
      seg.position.set(Math.cos(ang) * 0.12 - 0.12, Math.sin(ang) * 0.52, 0);
      seg.rotation.z = -ang + Math.PI / 2;
      seg.castShadow = true;
      parent.add(seg);
    }
    // String
    const stringM = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9 });
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.04, 4), stringM);
    str.position.set(-0.085, 0, 0);
    parent.add(str);
  }

  private buildShield(parent: THREE.Group): void {
    // Heater shield: extruded 2D silhouette + iron boss + scale bands
    const shape = new THREE.Shape();
    shape.moveTo(-0.26, 0.32);
    shape.quadraticCurveTo(0, 0.4, 0.26, 0.32);
    shape.quadraticCurveTo(0.3, 0.05, 0.2, -0.18);
    shape.quadraticCurveTo(0.1, -0.36, 0, -0.44);
    shape.quadraticCurveTo(-0.1, -0.36, -0.2, -0.18);
    shape.quadraticCurveTo(-0.3, 0.05, -0.26, 0.32);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
    const woodM = new THREE.MeshStandardMaterial({ color: 0x4c3a26, roughness: 0.8 });
    const shield = new THREE.Mesh(geo, woodM);
    shield.castShadow = true;
    parent.add(shield);
    // Iron boss
    const boss = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8a9198, roughness: 0.35, metalness: 0.85 }),
    );
    boss.rotation.x = Math.PI / 2;
    boss.position.z = 0.03;
    boss.castShadow = true;
    parent.add(boss);
    // Scale bands (dragon-scale look, tide blue)
    const scaleM = new THREE.MeshStandardMaterial({ color: 0x2e5a5e, roughness: 0.5, metalness: 0.35 });
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4; i++) {
        const scale = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 6), scaleM);
        scale.rotation.x = Math.PI / 2;
        scale.position.set(-0.15 + i * 0.1 + (row % 2) * 0.05, 0.2 - row * 0.19, 0.032);
        parent.add(scale);
      }
    }
  }

  // ------------------------------------------------------------ state API

  /** Equip a weapon visual by kind (null/'none' hides all). */
  setWeapon(kind: WeaponKind): void {
    this.weapon = kind;
    this.weaponEquippedVisible = kind !== 'none';
    this.refreshWeaponVisibility();
  }

  /** Show the shield on the left forearm. */
  setShield(visible: boolean): void {
    this.shieldGroup.visible = visible;
  }

  get hasShieldVisible(): boolean {
    return this.shieldGroup.visible;
  }

  /** Legacy API (NPCs, boarding crew): sword shown at the hip. */
  setSwordEquipped(equipped: boolean): void {
    this.weapon = equipped ? 'sword' : 'none';
    this.weaponEquippedVisible = equipped;
    this.refreshWeaponVisibility();
  }

  /** Legacy API used by the game: any weapon equipped? */
  setEquippedState(equipped: boolean): void {
    this.weaponEquippedVisible = equipped;
    if (equipped && this.weapon === 'none') this.weapon = 'sword';
    if (!equipped) this.weapon = 'none';
    this.refreshWeaponVisibility();
  }

  /** Brief red flash on the body when the character takes damage. */
  flash(): void {
    this.flashT = 1;
  }

  private refreshWeaponVisibility(): void {
    for (const kind of ['sword', 'axe', 'spear'] as WeaponKind[]) {
      const hip = this.hipSlots[kind];
      const hand = this.handSlots[kind];
      if (hip) hip.visible = this.weapon === kind && this.weaponEquippedVisible;
      if (hand) hand.visible = false; // shown only mid-swing by update()
    }
  }

  /** Face target yaw (world). */
  faceYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  update(p: AnimParams): void {
    this.t += p.dt;
    const walkFreq = p.swimming ? 2.2 : p.speed > 4.5 ? 9.2 : 6.4;
    if (p.moving) this.phase += p.dt * walkFreq;
    const ph = this.phase;

    // Damage flash decay (discrete hit feedback)
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - p.dt * 3.2);
      const e = this.flashT * 0.55;
      for (const m of this.flashMaterials) m.emissive.setRGB(e, e * 0.12, e * 0.08);
    }

    const resetPose = () => {
      this.legL.rotation.x = 0; this.legR.rotation.x = 0;
      this.kneeL.rotation.x = 0; this.kneeR.rotation.x = 0;
      this.armL.rotation.x = 0; this.armR.rotation.x = 0;
      this.armL.rotation.z = 0.06; this.armR.rotation.z = -0.06;
      this.elbowL.rotation.x = 0; this.elbowR.rotation.x = 0;
      this.chest.rotation.x = 0; this.chest.rotation.y = 0;
      this.hips.position.y = 0.94; this.head.rotation.x = 0; this.head.rotation.y = 0;
      this.root.rotation.x = 0;
    };
    resetPose();

    // --- Dodge roll: full-body tumble, overrides everything else ---
    const rollT = p.rollT ?? 0;
    if (rollT > 0) {
      this.root.rotation.x = rollT * Math.PI * 2;
      this.hips.position.y = 0.94 - 0.32 * Math.sin(rollT * Math.PI);
      this.legL.rotation.x = -1.9; this.legR.rotation.x = -1.7;
      this.kneeL.rotation.x = -1.9; this.kneeR.rotation.x = -1.7;
      this.armL.rotation.x = -1.4; this.armR.rotation.x = -1.2;
      this.elbowL.rotation.x = -1.6; this.elbowR.rotation.x = -1.6;
      this.chest.rotation.x = 0.7;
      this.head.rotation.x = 0.5;
      if (this.cape) this.cape.rotation.x = 1.2;
      this.updateWeaponPose(p, false);
      return;
    }

    if (p.swimming) {
      // Breaststroke: body pitched forward, sweeping arms, flutter kick
      this.hips.position.y = 0.94;
      this.root.rotation.x = 0; // pitch handled by Player on a parent group
      const sweep = Math.sin(ph * 2.2);
      this.armL.rotation.x = -1.2 + sweep * 1.1;
      this.armR.rotation.x = -1.2 + sweep * 1.1;
      this.armL.rotation.z = 0.35 + sweep * 0.3;
      this.armR.rotation.z = -0.35 - sweep * 0.3;
      this.elbowL.rotation.x = -0.5;
      this.elbowR.rotation.x = -0.5;
      this.legL.rotation.x = 0.25 + Math.sin(ph * 6) * 0.3;
      this.legR.rotation.x = 0.25 + Math.sin(ph * 6 + Math.PI) * 0.3;
      this.kneeL.rotation.x = -0.2;
      this.kneeR.rotation.x = -0.2;
      this.head.rotation.x = -0.5;
      if (this.cape) this.cape.rotation.x = 0.9;
      this.updateWeaponPose(p, false);
      return;
    }

    if (p.riding) {
      // Fase 4 — seat pose: legs wrap the saddle, hands hold the reins,
      // torso leans into the gait with a two-phase bounce.
      const bounce = p.rideBounce ?? 0;
      const bob = Math.sin(bounce * Math.PI * 2);
      this.hips.position.y = 0.94 + Math.abs(bob) * 0.05;
      this.root.rotation.x = 0;
      // Legs bent outward around the horse's barrel
      this.legL.rotation.x = -0.85;
      this.legR.rotation.x = -0.85;
      this.kneeL.rotation.x = -1.35;
      this.kneeR.rotation.x = -1.35;
      this.legL.rotation.z = 0.28;
      this.legR.rotation.z = -0.28;
      // Arms forward on the reins
      this.armL.rotation.x = -0.55 + bob * 0.06;
      this.armR.rotation.x = -0.55 + bob * 0.06;
      this.armL.rotation.z = 0.18;
      this.armR.rotation.z = -0.18;
      this.elbowL.rotation.x = -0.5;
      this.elbowR.rotation.x = -0.5;
      this.chest.rotation.x = 0.08 + bob * 0.03;
      this.head.rotation.x = -0.08;
      if (this.cape) this.cape.rotation.x = 0.35 + Math.abs(bob) * 0.12;
      this.updateWeaponPose(p, false);
      return;
    }

    if (!p.grounded) {
      // Airborne pose
      this.armL.rotation.x = -0.7; this.armR.rotation.x = -0.5;
      this.armL.rotation.z = 0.5; this.armR.rotation.z = -0.5;
      this.legL.rotation.x = -0.5; this.legR.rotation.x = 0.35;
      this.kneeL.rotation.x = -0.7; this.kneeR.rotation.x = -0.3;
      this.chest.rotation.x = 0.12;
      if (this.cape) this.cape.rotation.x = 0.55 + Math.sin(this.t * 6) * 0.06;
      this.updateWeaponPose(p, false);
      return;
    }

    // --- Bow draw aim pose (overrides walk arms while aiming) ---
    const bowDraw = p.bowDraw ?? 0;
    if (bowDraw > 0) {
      const sway = Math.sin(this.t * 1.8) * 0.015;
      this.armL.rotation.x = -1.45 + sway;
      this.armL.rotation.z = 0.12;
      this.elbowL.rotation.x = -0.1;
      this.armR.rotation.x = -1.2 + bowDraw * 0.25 + sway;
      this.armR.rotation.z = -0.3;
      this.elbowR.rotation.x = -0.25 - bowDraw * 1.15;
      this.chest.rotation.y = -0.22;
      this.chest.rotation.x = 0.05;
      this.head.rotation.y = 0.12;
      if (p.moving) {
        const amp = 0.28;
        this.legL.rotation.x = Math.sin(ph) * amp;
        this.legR.rotation.x = Math.sin(ph + Math.PI) * amp;
        this.hips.position.y = 0.94 + Math.abs(Math.sin(ph)) * 0.03;
      } else {
        this.kneeL.rotation.x = -0.12;
        this.kneeR.rotation.x = -0.18;
        this.hips.position.y = 0.94 - bowDraw * 0.03;
      }
      if (this.cape) this.cape.rotation.x = 0.18 + Math.sin(this.t * 2) * 0.03;
      this.updateWeaponPose(p, true);
      return;
    }

    if (p.moving) {
      const runK = Math.min(1, p.speed / 6.0);
      const amp = 0.5 + runK * 0.42;
      this.legL.rotation.x = Math.sin(ph) * amp;
      this.legR.rotation.x = Math.sin(ph + Math.PI) * amp;
      this.kneeL.rotation.x = Math.max(0, -Math.sin(ph - 0.6)) * (0.5 + runK * 0.5);
      this.kneeR.rotation.x = Math.max(0, -Math.sin(ph + Math.PI - 0.6)) * (0.5 + runK * 0.5);
      this.armL.rotation.x = Math.sin(ph + Math.PI) * (0.35 + runK * 0.45);
      this.armR.rotation.x = Math.sin(ph) * (0.35 + runK * 0.45);
      this.armL.rotation.z = 0.08; this.armR.rotation.z = -0.08;
      this.elbowL.rotation.x = -0.25 - runK * 0.3;
      this.elbowR.rotation.x = -0.25 - runK * 0.3;
      // Body bob & forward lean
      this.hips.position.y = 0.94 + Math.abs(Math.sin(ph)) * 0.045 * (0.5 + runK);
      this.chest.rotation.x = 0.05 + runK * 0.14;
      this.chest.rotation.y = Math.sin(ph) * 0.06;
      if (this.cape) this.cape.rotation.x = 0.12 + runK * 0.5 + Math.sin(this.t * 5) * 0.05;
    } else {
      // Idle: breathing, subtle sway, weight shift
      const breathe = Math.sin(this.t * 1.6);
      this.chest.rotation.x = 0.015 + breathe * 0.012;
      this.chest.scale.y = 1 + breathe * 0.008;
      this.armL.rotation.x = breathe * 0.03;
      this.armR.rotation.x = -breathe * 0.03;
      this.armL.rotation.z = 0.07 + breathe * 0.012;
      this.armR.rotation.z = -0.07 - breathe * 0.012;
      this.head.rotation.y = Math.sin(this.t * 0.5) * 0.14;
      this.hips.position.y = 0.94 + breathe * 0.006;
      if (p.talking) {
        this.head.rotation.y = Math.sin(this.t * 2.2) * 0.06;
        this.armR.rotation.x = Math.sin(this.t * 3.1) * 0.22 - 0.15;
        this.elbowR.rotation.x = -0.45;
      }
      if (this.cape) this.cape.rotation.x = 0.06 + Math.sin(this.t * 1.2) * 0.02;
    }

    // --- Block pose overlay (right mouse hold) ---
    const blockT = p.blockT ?? 0;
    if (blockT > 0) {
      const k = Math.min(1, blockT);
      if (this.shieldGroup.visible) {
        // Shield forward, braced
        this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -1.15, k);
        this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, 0.3, k);
        this.elbowL.rotation.x = THREE.MathUtils.lerp(this.elbowL.rotation.x, -0.85, k);
        this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, -0.35, k);
        this.elbowR.rotation.x = THREE.MathUtils.lerp(this.elbowR.rotation.x, -1.5, k);
      } else {
        // Sword held vertical in front
        this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, -0.95, k);
        this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, -0.25, k);
        this.elbowR.rotation.x = THREE.MathUtils.lerp(this.elbowR.rotation.x, -1.35, k);
        this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -0.5, k);
        this.elbowL.rotation.x = THREE.MathUtils.lerp(this.elbowL.rotation.x, -1.0, k);
      }
      this.chest.rotation.x = THREE.MathUtils.lerp(this.chest.rotation.x, 0.12, k);
      this.hips.position.y -= k * 0.06;
    }

    // --- Attack overlays ---
    if (p.attackT > 0) {
      const k = p.attackT;
      let armX: number, armZ: number, chestY: number, elbow = -0.15;
      const kind = p.attackKind ?? 'light1';
      if (kind === 'heavy') {
        // Overhead smash: big windup up-back, crouch, then slam down
        let ax: number, az: number, cy: number, hipY = 0;
        if (k < 0.42) {
          const u = k / 0.42;
          ax = THREE.MathUtils.lerp(0, -2.7, u);
          az = THREE.MathUtils.lerp(-0.08, -0.35, u);
          cy = THREE.MathUtils.lerp(0, -0.42, u);
          hipY = -0.1 * u;
        } else if (k < 0.68) {
          const u = (k - 0.42) / 0.26;
          ax = THREE.MathUtils.lerp(-2.7, 0.85, u);
          az = THREE.MathUtils.lerp(-0.35, 0, u);
          cy = THREE.MathUtils.lerp(-0.42, 0.38, u);
          hipY = -0.1 * (1 - u);
        } else {
          const u = (k - 0.68) / 0.32;
          ax = THREE.MathUtils.lerp(0.85, 0, u);
          az = THREE.MathUtils.lerp(0, -0.06, u);
          cy = THREE.MathUtils.lerp(0.38, 0, u);
        }
        this.armR.rotation.x = ax;
        this.armR.rotation.z = az;
        this.chest.rotation.y = cy;
        this.hips.position.y += hipY;
        this.chest.rotation.x = 0.18 * Math.sin(k * Math.PI);
        this.elbowR.rotation.x = -0.5 + Math.max(0, k - 0.42) * 1.6;
      } else if (kind === 'thrust') {
        // Spear jab: pull back, lunge forward
        if (k < 0.35) {
          const u = k / 0.35;
          this.armR.rotation.x = THREE.MathUtils.lerp(0, -0.5, u);
          this.elbowR.rotation.x = THREE.MathUtils.lerp(-0.15, -1.7, u);
          this.chest.rotation.y = THREE.MathUtils.lerp(0, 0.35, u);
        } else if (k < 0.6) {
          const u = (k - 0.35) / 0.25;
          this.armR.rotation.x = THREE.MathUtils.lerp(-0.5, -1.5, u);
          this.elbowR.rotation.x = THREE.MathUtils.lerp(-1.7, -0.05, u);
          this.chest.rotation.y = THREE.MathUtils.lerp(0.35, -0.3, u);
          this.chest.rotation.x = 0.15 * u;
        } else {
          const u = (k - 0.6) / 0.4;
          this.armR.rotation.x = THREE.MathUtils.lerp(-1.5, 0, u);
          this.elbowR.rotation.x = THREE.MathUtils.lerp(-0.05, -0.15, u);
          this.chest.rotation.y = THREE.MathUtils.lerp(-0.3, 0, u);
        }
      } else if (kind === 'light2') {
        // Backhand: windup right, sweep left
        if (k < 0.35) {
          const u = k / 0.35;
          armX = THREE.MathUtils.lerp(0, -1.9, u);
          armZ = THREE.MathUtils.lerp(-0.08, 0.55, u);
          chestY = THREE.MathUtils.lerp(0, 0.4, u);
        } else if (k < 0.75) {
          const u = (k - 0.35) / 0.4;
          armX = THREE.MathUtils.lerp(-1.9, 0.4, u);
          armZ = THREE.MathUtils.lerp(0.55, -0.85, u);
          chestY = THREE.MathUtils.lerp(0.4, -0.45, u);
        } else {
          const u = (k - 0.75) / 0.25;
          armX = THREE.MathUtils.lerp(0.4, 0, u);
          armZ = THREE.MathUtils.lerp(-0.85, -0.06, u);
          chestY = THREE.MathUtils.lerp(-0.45, 0, u);
        }
        this.armR.rotation.x = armX!;
        this.armR.rotation.z = armZ!;
        this.chest.rotation.y = chestY!;
        this.elbowR.rotation.x = elbow;
      } else if (kind === 'bowRelease') {
        // String snap: right hand flies forward off the cheek
        const u = Math.min(1, k * 2.2);
        this.armL.rotation.x = -1.45;
        this.elbowL.rotation.x = -0.1;
        this.armR.rotation.x = THREE.MathUtils.lerp(-1.45, -1.2, u);
        this.elbowR.rotation.x = THREE.MathUtils.lerp(-1.4, -0.2, u);
        this.chest.rotation.y = -0.22;
      } else {
        // light1 — classic diagonal slash (windup → slash → recover)
        if (k < 0.35) {
          const u = k / 0.35;
          armX = THREE.MathUtils.lerp(this.armR.rotation.x, -2.3, u);
          armZ = THREE.MathUtils.lerp(-0.08, -0.9, u);
          chestY = THREE.MathUtils.lerp(0, -0.4, u);
        } else if (k < 0.75) {
          const u = (k - 0.35) / 0.4;
          armX = THREE.MathUtils.lerp(-2.3, 0.5, u);
          armZ = THREE.MathUtils.lerp(-0.9, 0.55, u);
          chestY = THREE.MathUtils.lerp(-0.4, 0.45, u);
        } else {
          const u = (k - 0.75) / 0.25;
          armX = THREE.MathUtils.lerp(0.5, 0, u);
          armZ = THREE.MathUtils.lerp(0.55, -0.06, u);
          chestY = THREE.MathUtils.lerp(0.45, 0, u);
        }
        this.armR.rotation.x = armX!;
        this.armR.rotation.z = armZ!;
        this.chest.rotation.y = chestY!;
        this.elbowR.rotation.x = elbow;
      }
    }

    this.updateWeaponPose(p, p.attackT > 0);
  }

  /** Show hip/hand weapon copies + bow according to the current context. */
  private updateWeaponPose(p: AnimParams, attacking: boolean): void {
    const hip = this.hipSlots[this.weapon];
    const showHip = this.weaponEquippedVisible && this.weapon !== 'none';
    if (hip) hip.visible = showHip && !attacking;
    // Hand copy: visible only mid-swing for melee weapons
    if (this.weapon !== 'none' && this.weapon !== 'bow') {
      const hand = this.handSlots[this.weapon];
      if (hand) hand.visible = attacking;
    }
    // Bow: visible only while aiming/drawing (held in the left hand)
    const bowDraw = p.bowDraw ?? 0;
    this.bowInHand.visible = this.weapon === 'bow' && (bowDraw > 0 || (p.attackKind === 'bowRelease' && p.attackT > 0));
  }

  dispose(): void {
    this.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}

/**
 * Fase 5 — VillagerModel.
 * The NPCs of Puerto Cuervo as proper ALDEANOS: seeded per-NPC variety with
 * hoods, head scarves, aprons, rope belts with pouches, hair (braids, bald
 * elders), beards, rolled sleeves and body builds (slim / burly). Animates
 * through the regular CharacterModel layer (walk / pause / talk).
 */
export class VillagerModel extends CharacterModel {
  constructor(palette: CharacterPalette, seed: number, role?: string) {
    super(palette);
    const r = (k: number) => {
      // deterministic per-NPC variety
      const x = Math.sin(seed * 37.71 + k * 91.13) * 43758.5453;
      return x - Math.floor(x);
    };
    const mkMat = (c: number, rough = 0.9) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.02 });

    // --- build variety: slim <0.5, burly >0.5 ---
    const build = r(1);
    if (build < 0.42) this.chest.scale.set(0.92, 1.03, 0.94);
    else if (build > 0.62) { this.chest.scale.set(1.1, 1, 1.08); this.hips.scale.setScalar(1.06); }

    // --- head wear: hood / scarf / bald + beard ---
    const headWear = r(2);
    if (headWear < 0.3) {
      // hood: open cone framing the face
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.3, 8, 1, true), mkMat(palette.tunic, 0.95));
      hood.position.y = 0.24;
      hood.rotation.x = -0.16;
      hood.castShadow = true;
      this.head.add(hood);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.028, 6, 12),
        mkMat(palette.boots),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.13;
      this.head.add(rim);
    } else if (headWear < 0.55) {
      // head scarf over the hair
      const scarf = new THREE.Mesh(
        new THREE.SphereGeometry(0.155, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        mkMat(palette.sleeves, 0.95),
      );
      scarf.position.y = 0.16;
      scarf.scale.set(1.06, 1, 1.1);
      scarf.castShadow = true;
      this.head.add(scarf);
    } else if (headWear > 0.88) {
      // bald elder with a beard
      // (bald look: the hair cap stays but is recoloured to skin)
      const hairCap = this.head.children.find((c) => (c as THREE.Mesh).isMesh && Math.abs(c.position.y - 0.245) < 0.02) as THREE.Mesh | undefined;
      if (hairCap) (hairCap.material as THREE.MeshStandardMaterial).color.setHex(palette.skin);
      const beard = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.1), mkMat(palette.hair, 0.95));
      beard.position.set(0, 0.02, 0.09);
      this.head.add(beard);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.06), mkMat(palette.hair));
      brow.position.set(0, 0.045, 0.1);
      this.head.add(brow);
    } else if (r(3) < 0.5) {
      // long hair down the back
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.07), mkMat(palette.hair, 0.95));
      hair.position.set(0, 0.08, -0.135);
      hair.castShadow = true;
      this.head.add(hair);
    }

    // --- working clothes: apron + rope belt with pouch ---
    if (r(4) < 0.62 || role === 'smith' || role === 'merchant') {
      const apron = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.34, 0.015),
        mkMat(role === 'smith' ? 0x3f2f22 : 0x9a8f7c, 0.95),
      );
      apron.position.set(0, 0.16, 0.155);
      apron.castShadow = true;
      this.chest.add(apron);
    }
    const belt = this.chest.getObjectByName('belt_0') as THREE.Mesh | undefined ?? this.chest.children.find((c) => (c as THREE.Mesh).isMesh && Math.abs((c as THREE.Mesh).position.y - 0.06) < 0.02) as THREE.Mesh | undefined;
    void belt;
    // rope belt over the tunic + a worn pouch on the hip
    const rope = new THREE.Mesh(
      new THREE.TorusGeometry(0.235, 0.02, 6, 14),
      mkMat(0x6e5a3e, 1),
    );
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 0.075;
    rope.scale.set(1.02, 1, 0.95);
    this.chest.add(rope);
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.06), mkMat(0x5a4630, 1));
    pouch.position.set(0.19, 0.02, 0.03);
    this.chest.add(pouch);

    // --- shoulders: patched sleeves for the elders of the port ---
    if (r(5) < 0.4) {
      const patch = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.09, 0.13),
        mkMat(0x8a7a5c, 0.98),
      );
      patch.position.set(0.2, 0.5, 0);
      this.chest.add(patch);
    }

    // --- work tool on the belt (smith/merchant flavour) ---
    if (role === 'smith') {
      const hammer = new THREE.Group();
      const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.34, 6), mkMat(0x5a4028, 0.9));
      haft.position.y = 0.17;
      hammer.add(haft);
      const headM = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: 0x767c82, roughness: 0.45, metalness: 0.75 }));
      headM.position.y = 0.34;
      hammer.add(headM);
      hammer.position.set(0.23, 0.02, -0.02);
      hammer.rotation.z = 0.35;
      this.chest.add(hammer);
    }
  }
}
