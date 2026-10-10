import * as THREE from 'three';

/**
 * Procedural humanoid character with articulated joints and code-driven
 * animations (idle breathing, walk, run, jump, swim, sword swing).
 * Reused for the player and all villagers with different palettes.
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

export interface AnimParams {
  dt: number;
  speed: number;        // horizontal speed m/s
  moving: boolean;
  grounded: boolean;
  swimming: boolean;
  attackT: number;      // 0 = idle, 0..1 during swing
  talking?: boolean;
}

export class CharacterModel {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private cape: THREE.Mesh | null = null;
  private swordHip = new THREE.Group();
  private swordHand = new THREE.Group();
  private phase = Math.random() * 10;
  private t = 0;

  constructor(palette: CharacterPalette) {
    const mkMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.02 });

    this.root.add(this.hips);
    this.hips.position.y = 0.94;

    // --- Torso ---
    this.hips.add(this.chest);
    this.chest.position.y = 0.08;
    const torso = box(0.42, 0.52, 0.26, palette.tunic);
    torso.position.y = 0.3;
    this.chest.add(torso);
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
      const pad = box(0.16, 0.1, 0.22, palette.sleeves);
      pad.position.set(s * 0.26, 0.5, 0);
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
      const upper = box(0.11, 0.34, 0.13, palette.sleeves);
      upper.position.y = -0.17;
      arm.add(upper);
      elbow.position.y = -0.34;
      arm.add(elbow);
      const fore = box(0.095, 0.3, 0.11, palette.sleeves);
      fore.position.y = -0.15;
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
      const thigh = box(0.15, 0.42, 0.16, palette.pants);
      thigh.position.y = -0.21;
      leg.add(thigh);
      knee.position.y = -0.44;
      leg.add(knee);
      const shin = box(0.13, 0.4, 0.14, palette.pants);
      shin.position.y = -0.2;
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

    // --- Sword on the hip (visible when equipped) ---
    this.buildSword(this.swordHip);
    this.swordHip.position.set(0.22, 0.02, -0.05);
    this.swordHip.rotation.set(0.2, 0, 0.25);
    this.swordHip.visible = false;
    this.chest.add(this.swordHip);
    // Copy on the right hand (visible only during swings)
    this.buildSword(this.swordHand);
    this.swordHand.position.set(0, -0.36, 0.05);
    this.swordHand.rotation.set(0, 0, Math.PI);
    this.swordHand.visible = false;
    this.elbowR.add(this.swordHand);

    void mkMat;
  }

  private buildSword(parent: THREE.Group): void {
    const steel = new THREE.MeshStandardMaterial({ color: 0xaab0b6, roughness: 0.35, metalness: 0.85 });
    const guardM = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.4, metalness: 0.7 });
    const gripM = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 });
    // Blade (tapered box)
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.78, 0.012), steel);
    blade.position.y = 0.52;
    blade.castShadow = true;
    parent.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.033, 0.12, 4), steel);
    tip.position.y = 0.96;
    parent.add(tip);
    // Guard
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.045), guardM);
    guard.position.y = 0.13;
    parent.add(guard);
    // Grip + pommel
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.22, 6), gripM);
    grip.position.y = 0.0;
    parent.add(grip);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), guardM);
    pommel.position.y = -0.12;
    parent.add(pommel);
  }

  setSwordEquipped(equipped: boolean): void {
    this.swordHip.visible = equipped;
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

    const resetPose = () => {
      this.legL.rotation.x = 0; this.legR.rotation.x = 0;
      this.kneeL.rotation.x = 0; this.kneeR.rotation.x = 0;
      this.armL.rotation.x = 0; this.armR.rotation.x = 0;
      this.armL.rotation.z = 0.06; this.armR.rotation.z = -0.06;
      this.elbowL.rotation.x = 0; this.elbowR.rotation.x = 0;
      this.chest.rotation.x = 0; this.chest.rotation.y = 0;
      this.hips.position.y = 0.94; this.head.rotation.x = 0; this.head.rotation.y = 0;
    };
    resetPose();

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

    // --- Sword swing overlay (0..1) ---
    if (p.attackT > 0) {
      const k = p.attackT;
      // Windup (0..0.35) then slash (0.35..0.75) then recover
      let armX: number, armZ: number, chestY: number;
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
      this.armR.rotation.x = armX;
      this.armR.rotation.z = armZ;
      this.chest.rotation.y = chestY;
      this.swordHand.visible = true;
      this.swordHip.visible = false;
      if (k >= 1) {
        this.swordHand.visible = false;
        // restore hip visibility if equipped
      }
    } else if (this.swordHip.userData.equipped) {
      this.swordHip.visible = true;
      this.swordHand.visible = false;
    }
  }

  setEquippedState(equipped: boolean): void {
    this.swordHip.userData.equipped = equipped;
    this.swordHip.visible = equipped;
    this.swordHand.visible = false;
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
