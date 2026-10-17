import * as THREE from 'three';
import { CharacterModel, PLAYER_PALETTE, type CharacterVisual, type WeaponKind } from './CharacterModel';
import { gfxRuntime } from '../core/Graphics';
import type { Input } from '../core/Input';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import { clamp, damp, dampAngle } from '../core/MathUtils';

export type FootstepSurface = 'grass' | 'sand' | 'stone' | 'wood';

export interface PlayerStats {
  maxHealth: number;
  maxStamina: number;
  walkSpeed: number;
  runSpeed: number;
  swimSpeed: number;
  /** Fase 16 — armor: fraction of damage removed from every landed hit. */
  damageReduction?: number;
  /** Fase 16 — wings: glide descent (m/s, negative) while gliding. */
  glideSink?: number;
  /** Fase 16 — wings: forward glide speed (m/s) sustained in the air. */
  glideSpeed?: number;
}

export class Player {
  readonly model: CharacterVisual;
  readonly group = new THREE.Group(); // world transform (position = feet)
  readonly velocity = new THREE.Vector3();
  yaw = 0; // facing
  health = 100;
  stamina = 100;
  grounded = true;
  swimming = false;
  /** Fase 15 — underwater dive state (Mayús = down, Espacio = up). */
  diving = false;
  attackT = 0;
  lanternOn = false;
  /** Fase 8 — admin free-fly: WASD + ESPACIO sube / E baja. */
  flying = false;

  // ---- Fase 3 combat state (driven by CombatSystem, read for animation) ----
  /** Current attack animation variant. Fase 11 adds the cinematic set:
   *  spin (360 sweep), uppercut (launcher), plunge (air dive) and
   *  aircut (floating air slash). */
  attackKind: 'light1' | 'light2' | 'heavy' | 'thrust' | 'bowRelease'
    | 'spin' | 'uppercut' | 'plunge' | 'aircut'
    | 'sweep' | 'hookkick' = 'light1';
  /** Fase 17 — HOOK DASH in flight (CombatSystem drives it; the mover
   *  suspends normal control while the rope pulls). */
  dashing = false;
  /** Fase 17 — the dash connects a flying kick (pose hint for the model). */
  dashKick = false;
  /** Fase 11 — a plunge is in flight: extra gravity until the ground, then
   *  onPlungeImpact fires the AoE. */
  plunging = false;
  onPlungeImpact?: () => void;
  /** Fase 11 — an incoming hit was dodged with i-frames (perfect dodge):
   *  CombatSystem opens a counter window. Fase 17: the source coordinates
   *  let the counter THROW itself (knife/sand at the attacker). */
  onPerfectDodge?: (fromX?: number, fromZ?: number) => void;
  /** Fase 11 — dodge style: 'roll' = full somersault (forward),
   *  'step' = quick low dash (side/back). Set by CombatSystem. */
  dodgeStyle: 'roll' | 'step' = 'roll';
  /** Duration of the current swing (heavy attacks are slower). */
  attackDur = 0.5;
  /** Recovery gate after a swing before the next may start. */
  attackRecovery = 0;
  /** Block pose blend target (RMB). */
  blocking = false;
  blockT = 0;
  /** Fase 9 — seconds since the block pose snapped up (parry window clock). */
  blockAge = 99;
  /** Fase 9 — > 0 while the parry flash glows (attackers can check this). */
  parryT = 0;
  /** Dodge roll in progress (0..1). */
  rollT = 0;
  readonly rollDir = new THREE.Vector3(0, 0, -1);
  /** Fase 10 — DOUBLE JUMP: second mid-air jump (marometa). flipT drives
   *  the full forward somersault (0..1); jumpsUsed resets on landing. */
  flipT = 0;
  jumpsUsed = 0;
  onDoubleJump?: () => void;
  /** Bow draw progress: -1 = not drawing, else 0..1. */
  bowDraw = -1;
  /** Post-hit invulnerability window (seconds left). */
  invulnT = 0;
  /** Movement multiplier (block / bow draw slow the player). */
  moveMult = 1;
  /** Fase 22 — APOLLO: aim without the stride penalty (walk at full speed). */
  bowFreeMove = false;
  /** Fase 22 — GOLIATH: super armor while charging the heavy — damage −50%,
   *  no stagger, no knockdown (set by CombatSystem each frame). */
  superArmor = false;
  /** Fase 22 — the equipped armor's passive tag (set by Game on equip sync):
   *  harapos (weightless) · kimono (wind) · peto_vigia (anchor) ·
  *  do_sombras (silent) · coraza_tormenta (conductive) · coraza_cria
  *  (thermal) · armadura_ancestral (titan skin). '' = mundane steel. */
  armorPassive = '';
  /** Fase 22 — ARMADURA ANCESTRAL: melee wounds answer with a burning
   *  shockwave (wired by Game to an AoE strike back at the attacker). */
  onRetaliation?: (fromX: number, fromZ: number) => void;
  /** Damage taken while blocking is also paid with stamina. */
  hasShieldEquipped = false;

  /** Fase 17 — set by CombatSystem when it consumes the Space press (the
   *  Shift+Space finisher) — the jump must not also fire that frame. */
  suppressJump = false;

  /** Fase 18 — PRECISION AIM: true while RMB is held with a bow equipped
   *  (set by CombatSystem each frame; slows movement 40%). */
  bowAiming = false;
  /** Fase 18 — the equipped bow's draw-time movement penalty multiplier
   *  (short 0.8 / recurve 0.6 / greatbow 0 = planted). */
  bowDrawMult = 0.6;
  /** Fase 18 — GREATBOW planted stance: zero movement while aiming. */
  bowPlanted = false;

  /** Fase 16 — WINGS: true while the equipped wings carry the fall. */
  gliding = false;
  /** Fase 16 — the equipped wings item (visuals + glide stats owner). */
  wingsItemId: string | null = null;
  /** Fase 16 — wing rig: two pivots, spread 0..1 animated in update(). */
  private wingsRig: { root: THREE.Group; pivotL: THREE.Object3D; pivotR: THREE.Object3D } | null = null;
  private wingSpread = 0;
  private wingFlapT = 0;

  verticalVel = 0; // (admin fly needs to reset it externally)
  private stepTimer = 0;
  private lanternLight: THREE.PointLight;
  private lanternFlame: THREE.Sprite;
  private wasGrounded = true;
  /** Seconds since the body left the ground (Fase 11: air-combat windows read it). */
  airTime = 0;
  private speedSm = 0;
  // Fase 22 — cape cloth layer inputs: smoothed yaw rate + last-yaw tracking
  private yawRateSm = 0;
  private lastYawAnim = 0;
  /** Fase 4 — water-vault lunge window: horizontal damping disabled. */
  private vaultT = 0;
  /** Fase 4 — walking through shallow water (slowed, no swimming). */
  wading = false;
  // ---- Fase 27 — external statuses from the bestiary ----
  /** Mud (grimpote) / roar debuffs: movement multiplier window (mul < 1). */
  externSlowT = 0;
  externSlowMul = 1;
  /** Druid roots / Krog's club / King Slime swallow: hard stop window (s). */
  rootedT = 0;
  /** Apply an external movement status (the Bestiary's hooks call this). */
  applyExternStatus(kind: 'slow' | 'root', dur: number, mul?: number): void {
    if (kind === 'root') {
      this.rootedT = Math.max(this.rootedT, dur);
    } else {
      this.externSlowT = Math.max(this.externSlowT, dur);
      this.externSlowMul = mul ?? 0.9;
    }
  }

  stats: PlayerStats = {
    maxHealth: 100, maxStamina: 100,
    walkSpeed: 3.6, runSpeed: 6.6, swimSpeed: 2.3,
  };

  /** Fase 22 — cape cloth layer: smoothed yaw rate from the body's turning
   *  (wrap-safe) + vertical velocity. Drives the cape springs in the model. */
  private tickCloth(dt: number): void {
    let dy = this.yaw - this.lastYawAnim;
    if (dy > Math.PI) dy -= Math.PI * 2;
    else if (dy < -Math.PI) dy += Math.PI * 2;
    this.lastYawAnim = this.yaw;
    const rate = dt > 1e-4 ? dy / dt : 0;
    this.yawRateSm = damp(this.yawRateSm, rate, 10, Math.max(1e-4, dt));
  }

  onFootstep?: (surface: FootstepSurface) => void;
  onAttackSwing?: () => void;
  onDamaged?: (amount: number, reason: string) => void;
  onBlockSparks?: (pos: THREE.Vector3) => void;
  /** Fase 9 — a hit was PARRIED (perfect block): attackers stagger. */
  onParry?: (fromX: number, fromZ: number) => void;
  /** Fase 4 — fired when the body enters/leaves the water (splash VFX+SFX). */
  onWaterEvent?: (kind: 'enter' | 'exit', speed: number) => void;

  /** Optional ship-deck ground probe (set while walking a ship's deck).
   *  Returns the deck height at a world XZ or null when off-deck. */
  platformProbe?: (x: number, z: number) => number | null;
  /** Fase 4 — local water surface height incl. waves (wired to WaterSystem).
   *  When absent, sea level (y=0) is assumed. */
  waterHeightAt?: (x: number, z: number) => number;

  constructor(scene: THREE.Scene, visual?: CharacterVisual) {
    this.model = visual ?? new CharacterModel(PLAYER_PALETTE);
    this.group.add(this.model.root);
    scene.add(this.group);

    // Lantern (F) — warm personal light
    this.lanternLight = new THREE.PointLight(0xffb066, 0, 14, 1.6);
    this.lanternLight.position.set(0.35, 1.35, 0.25);
    this.group.add(this.lanternLight);
    const flameCanvas = document.createElement('canvas');
    flameCanvas.width = flameCanvas.height = 32;
    const ctx = flameCanvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,235,180,1)');
    grad.addColorStop(0.5, 'rgba(255,160,60,0.7)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(flameCanvas);
    this.lanternFlame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.lanternFlame.position.set(0.35, 1.42, 0.3);
    this.lanternFlame.scale.set(0.28, 0.34, 1);
    this.lanternFlame.visible = false;
    this.group.add(this.lanternFlame);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  teleport(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.verticalVel = 0;
    // Cancel any combat action in progress
    this.attackT = 0;
    this.rollT = 0;
    this.flipT = 0;
    this.jumpsUsed = 0;
    this.bowDraw = -1;
    this.invulnT = 0;
    this.gliding = false;
    this.dashing = false;
    this.dashKick = false;
    this.plunging = false;
    this.model.root.rotation.x = 0;
  }

  toggleLantern(): void {
    this.lanternOn = !this.lanternOn;
    this.lanternFlame.visible = this.lanternOn;
  }

  // ---------------------------------------------------------------- wings

  /**
   * Fase 16 — equip/unequip the wings VISUAL (the glide stats live in
   * `stats`). Pass the item id (or null to take them off). The rig is built
   * lazily once and toggled visible; both pivots animate in update().
   */
  setWingsVisual(itemId: string | null): void {
    this.wingsItemId = itemId;
    if (itemId && !this.wingsRig) {
      this.wingsRig = this.buildWings();
      this.model.root.add(this.wingsRig.root);
    }
    if (this.wingsRig) this.wingsRig.root.visible = !!itemId;
    if (!itemId) this.gliding = false;
  }

  /** Lona encerada over whalebone ribs: two pivots at the shoulder blades. */
  private buildWings(): { root: THREE.Group; pivotL: THREE.Object3D; pivotR: THREE.Object3D } {
    const root = new THREE.Group();
    root.name = 'wings_rig';
    root.position.set(0, 1.16, -0.30);
    const canvas = new THREE.MeshStandardMaterial({
      color: 0xd8cfba, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
    });
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x402c15, roughness: 0.9 });

    const makeSide = (mirror: 1 | -1): THREE.Object3D => {
      const pivot = new THREE.Object3D();
      pivot.position.set(0.10 * mirror, 0, 0);
      // three feather slats, tapering out and swept back; span ~1.05 m/side
      const slats: Array<[number, number, number, number]> = [
        // [length, chord, xOffset, zSweep]
        [0.62, 0.34, 0.34, -0.10],
        [0.5, 0.26, 0.82, -0.26],
        [0.34, 0.16, 1.18, -0.40],
      ];
      slats.forEach(([len, chord, xo, zs], i) => {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.035, chord), canvas);
        slat.position.set((xo + len / 2 - 0.05) * mirror, 0.02 * i, zs * mirror);
        slat.rotation.z = -0.06 * i * mirror;
        slat.castShadow = true;
        pivot.add(slat);
        // leading rib
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, chord + 0.1), ribMat);
        rib.position.set(xo * mirror, 0.045, zs * mirror);
        pivot.add(rib);
      });
      // shoulder yoke
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.3), ribMat);
      yoke.position.set(0.05 * mirror, 0.05, 0.02);
      pivot.add(yoke);
      root.add(pivot);
      return pivot;
    };

    const pivotR = makeSide(1);
    const pivotL = makeSide(-1);
    // folded pose (visible but closed against the back)
    pivotR.rotation.z = -1.32;
    pivotL.rotation.z = 1.32;
    return { root, pivotL, pivotR };
  }

  /** One frame of the wing rig: fold/spread + a soft flap while gliding. */
  private updateWings(dt: number): void {
    if (!this.wingsRig || !this.wingsItemId) return;
    const want = this.gliding ? 1 : 0.16;
    this.wingSpread = damp(this.wingSpread, want, 9, dt);
    if (this.gliding) {
      this.wingFlapT += dt;
    } else {
      this.wingFlapT = 0;
    }
    const flap = this.gliding ? Math.sin(this.wingFlapT * 3.1) * 0.05 : 0;
    // folded -1.32 rad (hanging on the back) → spread -0.16 (out & level)
    const r = -1.32 + this.wingSpread * 1.16;
    this.wingsRig.pivotR.rotation.z = r + flap;
    this.wingsRig.pivotL.rotation.z = -r + flap;
  }

  // ---------------------------------------------------------------- combat

  /** Start a dodge toward a world-space direction (length-irrelevant).
   *  Fase 11: style 'roll' (forward) keeps the somersault; 'step' is a fast
   *  low dash used for side/back — different feel, same i-frames. */
  beginRoll(dirX: number, dirZ: number, style: 'roll' | 'step' = 'roll'): void {
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.001) this.rollDir.set(dirX / len, 0, dirZ / len);
    else this.rollDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); // backward
    this.dodgeStyle = style;
    this.rollT = 0.001;
    this.attackT = 0;
    this.plunging = false;
    this.bowDraw = -1;
  }

  get rolling(): boolean {
    return this.rollT > 0;
  }

  /** Fase 22 — KIMONO: +5% stamina recovery (Flowing Movement). */
  get staminaRegenMult(): number {
    return this.armorPassive === 'kimono' ? 1.05 : 1;
  }

  /** Fase 22 — the dodge's cost: HARPOS are weightless (−30%); the
   *  ANCESTRAL plate drags a little (the price of a legend, −5% speed). */
  get dodgeCostMult(): number {
    if (this.armorPassive === 'harapos') return 0.7;
    return 1;
  }

  get dodgeSpeedMult(): number {
    return this.armorPassive === 'armadura_ancestral' ? 0.95 : 1;
  }

  get invulnerable(): boolean {
    return this.invulnT > 0 || this.rollT > 0; // roll grants i-frames
  }

  /**
   * Central damage entry — applies i-frames, block reduction and stamina
   * drain. Returns the health actually lost (0 when fully avoided/blocked)
   * so callers can spawn the right VFX.
   * Fase 11: `opts.unblockable` (captain heavy blows) bypasses the guard —
   * the hit must be DODGED; and a hit absorbed by roll i-frames near the
   * moment of impact reports a PERFECT DODGE (counter window opens).
   */
  takeHit(damage: number, fromX?: number, fromZ?: number, opts?: { unblockable?: boolean }): number {
    if (this.invulnerable) {
      // rolling THROUGH a blow that would have connected = perfect dodge
      if (this.rollT > 0 && this.rollT < 0.8) this.onPerfectDodge?.(fromX, fromZ);
      return 0;
    }
    // Blocking: absorb if the source is roughly in front (±60°)
    if (this.blockT > 0.5 && !opts?.unblockable) {
      let facing = true;
      if (fromX !== undefined && fromZ !== undefined) {
        const toSrc = Math.atan2(fromX - this.position.x, fromZ - this.position.z);
        let d = toSrc - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        facing = Math.abs(d) < 1.05;
      }
      if (facing) {
        // Fase 9 — PARRY: the block snapped up within the last 0.19 s →
        // perfect defense. Zero damage, zero stamina, the attacker staggers
        // and a counterattack window opens (CombatSystem reads parryT).
        if (this.blockAge <= 0.19) {
          this.parryT = 0.55;
          this.invulnT = 0.35;
          this.model.blockImpact?.();
          if (fromX !== undefined && fromZ !== undefined) {
            this.onParry?.(fromX, fromZ);
          } else {
            this.onParry?.(this.position.x + Math.sin(this.yaw), this.position.z + Math.cos(this.yaw));
          }
          return 0;
        }
        const reduce = this.hasShieldEquipped ? 0.82 : 0.5;
        const blocked = damage * reduce;
        // Blocking drains stamina instead of most health
        this.stamina = Math.max(0, this.stamina - blocked * 0.55);
        const through = Math.max(0, damage - blocked);
        this.health = Math.max(0, this.health - through);
        this.invulnT = 0.45;
        this.model.flash();
        if (through <= 0.5 && this.onBlockSparks) {
          this.onBlockSparks(new THREE.Vector3(
            this.position.x + Math.sin(this.yaw) * 0.6,
            this.position.y + 1.1,
            this.position.z + Math.cos(this.yaw) * 0.6,
          ));
        }
        return through;
      }
    }
    // Fase 11 — an UNBLOCKABLE blow met with a raised guard: the stance
    // shatters (extra stamina cost, guard-break recoil)
    if (this.blockT > 0.5 && opts?.unblockable) {
      this.stamina = Math.max(0, this.stamina - damage * 0.8);
      this.model.blockImpact?.();
    }
    // Fase 16 — ARMOR: the smith's cuero/malla/placas eat a fraction of
    // every hit that actually LANDS (unblocked). Never below 0.2 damage.
    const dr = Math.min(0.8, Math.max(0, this.stats.damageReduction ?? 0));
    // Fase 22 — GOLIATH super armor: mid heavy-charge the colossus answers
    // for its wielder — the blow is halved, nothing staggers, nothing moves
    let dealt = Math.max(0.2, damage * (1 - dr));
    const armored = dr > 0 && dealt < damage;
    if (this.superArmor) {
      dealt = Math.max(0.2, dealt * 0.5);
    }
    if (armored) {
      this.onArmored?.(damage - dealt);
    }
    this.health = Math.max(0, this.health - dealt);
    this.invulnT = 0.7;
    this.model.flash();
    // Fase 9 — hit reaction: a light knockback impulse away from the source
    // (PETO VIGÍA anchors −30%; GOLIATH's charge shrugs it off entirely;
    // the ANCESTRAL plate answers melee wounds with a burning shockwave)
    if (fromX !== undefined && fromZ !== undefined) {
      const dx = this.position.x - fromX;
      const dz = this.position.z - fromZ;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        const anchor = this.armorPassive === 'peto_vigia' ? 0.7 : 1;
        const power = this.superArmor ? 0 : 3.1 * anchor;
        this.knockX = (dx / len) * power;
        this.knockZ = (dz / len) * power;
        this.knockT = power > 0 ? 0.22 : 0;
      }
      if (this.armorPassive === 'armadura_ancestral' && dealt > 1) {
        this.onRetaliation?.(fromX, fromZ);
      }
    }
    return dealt;
  }

  /** Fase 16 — fired when the armor absorbs part of a hit (absorbed amount). */
  onArmored?: (absorbed: number) => void;

  /** Fase 9 — knockback impulse state (decays fast, read by the mover). */
  knockX = 0;
  knockZ = 0;
  knockT = 0;

  update(dt: number, input: Input, cameraYaw: number, terrain: TerrainHeight, colliders: ColliderRegistry, dialogueActive: boolean): void {
    // --- Input direction (camera relative) ---
    let ix = 0;
    let iz = 0;
    if (!dialogueActive) {
      if (input.isDown('forward')) iz += 1;
      if (input.isDown('back')) iz -= 1;
      if (input.isDown('left')) ix -= 1;
      if (input.isDown('right')) ix += 1;
    }
    const inputLen = Math.hypot(ix, iz);
    let moveX = 0;
    let moveZ = 0;
    if (inputLen > 0) {
      ix /= inputLen;
      iz /= inputLen;
      // Camera-relative: forward = camera yaw direction (on XZ)
      // CameraRig looks along +(sin yaw, cos yaw); right is forward rotated -90°
      // around Y: right = (-cos yaw, sin yaw).
      const fx = Math.sin(cameraYaw);
      const fz = Math.cos(cameraYaw);
      const rx = -Math.cos(cameraYaw);
      const rz = Math.sin(cameraYaw);
      moveX = fx * iz + rx * ix;
      moveZ = fz * iz + rz * ix;
    }

    // --- Fase 8 — admin free-fly (U+I+O panel): WASD vuela, ESPACIO sube,
    //     E baja, MAYÚS acelera. Gravity, water and collisions are suspended. ---
    if (this.flying && !dialogueActive) {
      const spd = input.isDown('sprint') ? 46 : 17;
      this.velocity.set(moveX * spd, 0, moveZ * spd);
      let vy = 0;
      if (input.isDown('jump')) vy += spd * 0.62;
      if (input.isDown('interact')) vy -= spd * 0.62;
      this.verticalVel = damp(this.verticalVel, vy, 10, dt);
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this.position.y += this.verticalVel * dt;
      // soft floor at the terrain skin (free to skim the sea surface)
      const th = terrain.height(this.position.x, this.position.z);
      if (this.position.y < th + 0.4) {
        this.position.y = th + 0.4;
        this.verticalVel = Math.max(0, this.verticalVel);
      }
      this.position.x = clamp(this.position.x, -1010, 1010);
      this.position.z = clamp(this.position.z, -1010, 1010);
      this.grounded = false;
      this.swimming = false;
      this.wading = false;
      this.rollT = 0;
      this.stamina = this.stats.maxStamina;
      const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      this.speedSm = damp(this.speedSm, hSpeed, 8, dt);
      if (hSpeed > 0.4) {
        this.yaw = dampAngle(this.yaw, Math.atan2(this.velocity.x, this.velocity.z), 12, dt);
      }
      this.group.rotation.y = this.yaw;
      this.tickCloth(dt);
      // sky-diver lean
      this.model.root.rotation.x = damp(this.model.root.rotation.x, 0.32, 6, dt);
      this.model.root.position.y = damp(this.model.root.position.y, 0, 8, dt);
      this.model.update({
        dt, speed: this.speedSm, moving: inputLen > 0, grounded: false,
        swimming: false, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1,
        vy: this.verticalVel, yawRate: this.yawRateSm,
      });
      this.wasGrounded = false;
      return;
    }

    const wantRun = input.isDown('sprint') && inputLen > 0 && this.stamina > 1 && !this.swimming && !this.wading;
    let speed = this.swimming ? this.stats.swimSpeed : wantRun ? this.stats.runSpeed : this.stats.walkSpeed;
    if (this.wading) speed = this.stats.walkSpeed * 0.62; // pushing through chest-deep water
    // Combat movement modifiers (Fase 3)
    if (this.dashing) speed = 0;                       // the rope owns the body
    else if (this.rollT > 0) speed = 7.6;              // dodge roll burst
    else speed *= this.moveMult;                     // block / bow-draw slow
    // Fase 27 — external statuses (mud, roots, the druid's prison): decay the
    // timers here so every movement path this frame sees them
    if (this.externSlowT > 0) { this.externSlowT -= dt; speed *= this.externSlowMul; }
    if (this.rootedT > 0) { this.rootedT -= dt; speed = 0; }

    // --- Stamina ---
    if (wantRun && inputLen > 0) this.stamina = Math.max(0, this.stamina - dt * 13);
    else if (this.swimming) this.stamina = Math.max(0, this.stamina - dt * 2.2);
    // Fase 18 — a held bowstring is exertion: NO regen while drawing
    // (CombatSystem pours the draw trickle + the accelerating overdraw
    // burn; with regen live they cancelled and overdraw never tired you)
    else if (this.bowDraw >= 0) { /* the arms are locked — nothing comes back */ }
    else if (inputLen > 0) this.stamina = Math.min(this.stats.maxStamina, this.stamina + dt * 9 * this.staminaRegenMult);
    else this.stamina = Math.min(this.stats.maxStamina, this.stamina + dt * 17 * this.staminaRegenMult);

    // --- Horizontal velocity (smooth accel) ---
    let targetVX: number;
    let targetVZ: number;
    if (this.dashing) {
      // Fase 17 — hook dash: CombatSystem sets the velocity directly;
      // the mover only damps toward it so the rope snap reads clean.
      targetVX = this.velocity.x;
      targetVZ = this.velocity.z;
    } else if (this.rollT > 0) {
      // Dodge roll: fixed burst along the roll direction, input ignored
      targetVX = this.rollDir.x * speed;
      targetVZ = this.rollDir.z * speed;
    } else {
      targetVX = moveX * speed;
      targetVZ = moveZ * speed;
    }
    const accel = this.vaultT > 0 ? 0.15 : this.grounded || this.swimming ? 12 : 4;
    if (this.vaultT > 0) this.vaultT = Math.max(0, this.vaultT - dt);
    // Fase 9 — hit knockback: brief impulse added on top of the movement
    if (this.knockT > 0) {
      this.knockT = Math.max(0, this.knockT - dt);
      const k = this.knockT / 0.22;
      targetVX += this.knockX * k;
      targetVZ += this.knockZ * k;
    }
    this.velocity.x = damp(this.velocity.x, targetVX, accel, dt);
    this.velocity.z = damp(this.velocity.z, targetVZ, accel, dt);

    // --- Jump & gravity ---
    // Ground = terrain + walkable thin platforms (docks, ship decks)
    const terrainH = terrain.height(this.position.x, this.position.z);
    let groundH = terrainH;
    for (const c of colliders.query(this.position.x, this.position.z, 2)) {
      if (c.kind === 'box' && c.maxY - c.minY <= 0.5) {
        if (
          this.position.x >= c.minX - 0.2 && this.position.x <= c.maxX + 0.2 &&
          this.position.z >= c.minZ - 0.2 && this.position.z <= c.maxZ + 0.2 &&
          this.position.y >= c.maxY - 0.65
        ) {
          groundH = Math.max(groundH, c.maxY);
        }
      }
    }
    // Ship deck (oriented platform, evaluated exactly in ship-local space)
    if (this.platformProbe) {
      const deck = this.platformProbe(this.position.x, this.position.z);
      if (deck !== null && deck > groundH) groundH = deck;
    }

    // --- Fase 4 water state machine (shore → wading → swimming → out) ---
    // The visible, waving surface is the one true reference (ships already
    // float on it via the shared waveHeightAt).
    const surfaceY = this.waterHeightAt
      ? this.waterHeightAt(this.position.x, this.position.z)
      : 0;
    const waterDepth = surfaceY - terrainH; // how deep the water column is
    // Standing on a dock / deck over deep water never counts: groundH then is
    // above the surface and the body never crosses it.
    const bodyInWater = this.position.y < surfaceY - 0.05;
    const deepEnough = waterDepth > 1.25;
    const wasSwimming = this.swimming;
    // The vault grace window keeps climbing players OUT of swim state while
    // their body is still momentarily below the surface.
    this.swimming = deepEnough && bodyInWater && groundH < surfaceY - 0.55 && this.vaultT <= 0;
    // Wading: feet still touch the bottom but the water slows you down
    this.wading = !this.swimming && waterDepth > 0.42 && bodyInWater;

    if (this.swimming && !wasSwimming) {
      // Entry splash (bigger when diving from a height)
      const impact = clamp((-this.verticalVel + 2) / 10, 0.4, 1.6);
      this.onWaterEvent?.('enter', impact);
      // Fase 16 — a glide that splashes into the sea folds the wings
      this.gliding = false;
    } else if (!this.swimming && wasSwimming) {
      this.onWaterEvent?.('exit', 0.7);
    }

    // Jump — only when the jump key is actually pressed this frame.
    // (Regression fix: this used to fire whenever grounded, making the
    // player hop endlessly without any input.)
    // Fase 10 — DOUBLE JUMP: a second press mid-air launches a marometa
    // (forward somersault). The flip itself is pure animation — the impulse
    // is a fresh vertical boost so it always feels responsive.
    // Fase 17 — suppressJump: CombatSystem may claim Shift+Space for the
    // cinematic finisher; the jump then waits a frame.
    if (this.suppressJump) {
      this.suppressJump = false;
    } else if (!dialogueActive && input.pressed('jump') && !this.swimming && this.stamina > 10) {
      if (this.grounded && !this.wading) {
        this.verticalVel = 7.4;
        this.grounded = false;
        this.stamina -= 10;
        this.jumpsUsed = 1;
      } else if (!this.grounded && this.jumpsUsed === 1 && this.airTime < 1.5 && this.flipT === 0) {
        this.verticalVel = 7.0;
        this.stamina = Math.max(0, this.stamina - 12);
        this.jumpsUsed = 2;
        this.flipT = 0.0001;          // marometa! (progresses below)
        this.onDoubleJump?.();
      }
    }

    if (this.swimming) {
      this.grounded = false;
      this.airTime = 0;
      // --- Fase 15 — DIVE: free 3D swimming anywhere in the sea ---
      // Mayús (sprint) descends, Espacio (jump) ascends. Not just at the
      // shore: anywhere the water is deep enough to swim.
      const wantDive = !dialogueActive && input.isDown('sprint') && this.stamina > 1;
      const wantRise = !dialogueActive && input.isDown('jump');
      if (!this.diving && wantDive) {
        this.diving = true;
        this.verticalVel = Math.min(this.verticalVel, -1.4); // the plunge
      }
      if (this.diving) {
        // Underwater: neutral buoyancy, input-driven vertical motion
        let targetVy = -0.35; // gentle sink when idle
        if (wantDive) targetVy = -3.2;
        else if (wantRise) targetVy = 3.4;
        this.verticalVel = damp(this.verticalVel, targetVy, 4.5, dt);
        this.position.y += this.verticalVel * dt;
        // Breath: stamina is the air supply while submerged
        this.stamina = Math.max(0, this.stamina - dt * (wantDive ? 1.6 : 0.8));
        if (this.stamina <= 0) this.diving = false; // out of air: float up
        // The seabed is solid
        if (this.position.y < terrainH + 0.8) {
          this.position.y = terrainH + 0.8;
          this.verticalVel = Math.max(0, this.verticalVel);
        }
        // Break the surface while ascending → back to surface swim
        if (this.position.y >= surfaceY - 0.6 && this.verticalVel > 0) {
          this.diving = false;
          this.position.y = surfaceY - 0.6;
          this.verticalVel = 0.9;
          this.onWaterEvent?.('exit', 0.5);
        }
      } else {
        // --- Surface swimming: float ON the waving surface ---
        // Head & shoulders stay above water; the body bobs with the waves.
        const targetY = surfaceY - 0.52;
        this.verticalVel = damp(this.verticalVel, (targetY - this.position.y) * 4.2, 5.5, dt);
        this.position.y += this.verticalVel * dt;
        // Climb out: when a shore/dock edge is within arm's reach, jump boosts
        // the player up onto it (no more being trapped in the water).
        if (!dialogueActive && input.pressed('jump')) {
          // The vault edge: highest walkable top near the swimmer — docks,
          // decks (platformProbe) and rising terrain all count. Unlike the
          // standing ground check, this scan has NO y-precondition: a dock
          // top 1 m above the water is exactly what we want to grab.
          let edge = groundH;
          let edgeDirX = 0;
          let edgeDirZ = 0;
          for (const c of colliders.query(this.position.x, this.position.z, 3)) {
            if (c.kind !== 'box' || c.maxY - c.minY > 0.5) continue; // walkable slabs only
            if (
              this.position.x >= c.minX - 1.4 && this.position.x <= c.maxX + 1.4 &&
              this.position.z >= c.minZ - 1.4 && this.position.z <= c.maxZ + 1.4 &&
              c.maxY > edge && c.maxY < this.position.y + 2.6 && c.maxY > this.position.y - 1.2
            ) {
              edge = c.maxY;
              // Direction toward the platform (the climb lands ON it, not beside it)
              edgeDirX = (c.minX + c.maxX) / 2 - this.position.x;
              edgeDirZ = (c.minZ + c.maxZ) / 2 - this.position.z;
              const dl = Math.hypot(edgeDirX, edgeDirZ) || 1;
              edgeDirX /= dl;
              edgeDirZ /= dl;
            }
          }
          if (this.platformProbe) {
            const deck = this.platformProbe(this.position.x, this.position.z);
            if (deck !== null && deck > edge && deck < this.position.y + 2.6 && deck > this.position.y - 1.2) {
              edge = deck;
              edgeDirX = 0;
              edgeDirZ = 0;
            }
          }
          if (edge > this.position.y - 0.6 && edge < this.position.y + 2.6) {
            // Vault out of the water toward the edge — a strong climbing boost
            // (reaches ~2.4 m above the feet) plus an undamped lunge ONTO it.
            this.swimming = false;
            this.verticalVel = 9.6;
            this.velocity.x = edgeDirX * 4.2;
            this.velocity.z = edgeDirZ * 4.2;
            this.vaultT = 0.5;
            this.stamina = Math.max(0, this.stamina - 8);
            this.position.y += 0.12;
          } else {
            // Just a paddle hop in deep water
            this.verticalVel = 2.4;
          }
        }
      }
    } else {
      if (this.diving) this.diving = false; // left the water: reset the dive
      // Fase 11 — aircut hover: an air slash carries the knight (anime float)
      if (
        this.attackT > 0 && this.attackKind === 'aircut'
        && this.verticalVel < 1.5 && this.airTime < 1.1
      ) {
        this.verticalVel = Math.max(this.verticalVel, 1.5);
      }
      // Fase 11 — plunge dive: heavy gravity, hard horizontal brake
      if (this.plunging) {
        this.verticalVel -= 30 * dt;
        this.velocity.x = damp(this.velocity.x, this.rollDir.x * 2.2, 10, dt);
        this.velocity.z = damp(this.velocity.z, this.rollDir.z * 2.2, 10, dt);
      }
      // Fase 17 — hook dash: the rope carries the body, gravity waits
      // (a flying kick must not sag mid-flight)
      if (this.dashing) {
        this.verticalVel = damp(this.verticalVel, 0.8, 8, dt);
      }
      // --------------------------------------------------------------
      // Fase 16 — WINGS: elytra-style glide. Falling with the wings on and
      // holding ESPACE opens the glide: the descent locks to glideSink
      // (~-2.6 m/s) and the body surges FORWARD along the facing at
      // glideSpeed. Release (or touch water) and it folds back. Landing
      // speed stays under the fall-damage threshold, so a glide never hurts.
      // --------------------------------------------------------------
      const canGlide = !!this.wingsItemId
        && this.stats.glideSink !== undefined
        && !this.plunging
        && this.verticalVel < -1.2
        && this.airTime > 0.25;
      const wantGlide = canGlide && input.isDown('jump');
      this.gliding = wantGlide;
      if (wantGlide) {
        const sink = this.stats.glideSink ?? -2.6;
        const speed = this.stats.glideSpeed ?? 10.5;
        // vertical: settle on the sink rate (no 19 m/s² gravity while held)
        this.verticalVel = damp(this.verticalVel, Math.max(sink, -12), 4.5, dt);
        // horizontal: the wings carry the body along the facing — steer with
        // the mouse/A-D as usual; velocity snaps toward the facing heading
        const fx = Math.sin(this.yaw);
        const fz = Math.cos(this.yaw);
        this.velocity.x = damp(this.velocity.x, fx * speed, 6, dt);
        this.velocity.z = damp(this.velocity.z, fz * speed, 6, dt);
      }
      if (!this.gliding && !this.dashing) {
        this.verticalVel -= 19 * dt;
      }
      this.position.y += this.verticalVel * dt;
      const groundY = groundH;
      if (this.position.y <= groundY) {
        // Fase 11 — the plunge lands: hand the impact to CombatSystem
        if (this.plunging) {
          this.plunging = false;
          this.onPlungeImpact?.();
        }
        // Landing
        if (!this.wasGrounded && this.airTime > 0.35) {
          const fallSpeed = -this.verticalVel;
          if (fallSpeed > 13) {
            const dmg = Math.round((fallSpeed - 13) * 7);
            this.health = Math.max(0, this.health - dmg);
            this.onDamaged?.(dmg, 'caida');
          }
        }
        this.position.y = groundY;
        this.verticalVel = 0;
        this.grounded = true;
        this.airTime = 0;
        this.jumpsUsed = 0;
        this.gliding = false;
        // Landing mid-flip: the somersault snaps upright over a beat
        if (this.flipT > 0 && this.flipT < 1) this.flipT = Math.max(this.flipT, 0.82);
      } else {
        this.grounded = false;
        this.airTime += dt;
      }
    }
    this.wasGrounded = this.grounded;

    // --- Collisions (XZ push-out against colliders) ---
    this.resolveCollisions(colliders, groundH);

    // Integrate horizontal
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.resolveCollisions(colliders, terrain.height(this.position.x, this.position.z));

      // Facing: the dash steers — a kick flies along the rope, the body
      // faces the target the whole way (no yaw fighting the steer).
      const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      this.speedSm = damp(this.speedSm, hSpeed, 8, dt);
      if (hSpeed > 0.4 && !this.dashing) {
        const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
        this.yaw = dampAngle(this.yaw, targetYaw, 12, dt);
      }
    this.group.rotation.y = this.yaw;

    // --- Swim pitch (lean body forward in water) + whole-body spins ---
    // The dodge ROLL and the double-jump marometa rotate the model root a
    // full 2π forward; the Fase 11 side/back quickstep never spins (it is a
    // low dash — the limbs sell it, not the body rotation).
    const spinT = this.rollT > 0 && this.dodgeStyle === 'roll' ? this.rollT : this.flipT;
    if (spinT > 0) {
      this.model.root.rotation.x = spinT * Math.PI * 2;
    } else {
      // Fase 16 — gliding leans the whole body forward into the wind
      this.model.root.rotation.x = damp(
        this.model.root.rotation.x,
        this.swimming ? 1.15 : this.gliding ? 0.34 : 0,
        8,
        dt,
      );
    }
    this.model.root.position.y = damp(this.model.root.position.y, this.swimming ? 0.55 : 0, 8, dt);

    // Fase 16 — wings fold/spread (skip while a flip owns the body pose)
    this.updateWings(dt);

    // --- Combat timers (Fase 3) ---
    if (this.rollT > 0) {
      // a quickstep recovers faster than a full roll (0.38 s vs 0.55 s)
      this.rollT += dt / (this.dodgeStyle === 'step' ? 0.38 : 0.55);
      if (this.rollT >= 1) this.rollT = 0;
    }
    // Fase 10 — marometa progress (0.62 s full rotation)
    if (this.flipT > 0) {
      this.flipT += dt / 0.62;
      if (this.flipT >= 1) this.flipT = 0;
    }
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.attackRecovery > 0) this.attackRecovery -= dt;
    // Block pose blend
    const blockTarget = this.blocking && this.grounded && this.rollT === 0 && this.attackT === 0 ? 1 : 0;
    // Fase 9 — parry clock: time since the guard snapped up
    if (blockTarget === 1 && this.blockT > 0.5) {
      this.blockAge += dt;
    } else if (blockTarget === 0) {
      this.blockAge = 0;
    }
    // Parry flash decay
    if (this.parryT > 0) this.parryT = Math.max(0, this.parryT - dt);
    this.blockT = damp(this.blockT, blockTarget, 14, dt);
    // Movement multiplier from context
    let mm = 1;
    if (this.blockT > 0.1) mm *= 1 - 0.55 * this.blockT;
    // Fase 18 — archery spec: PRECISION AIM (RMB with a bow out) slows the
    // stride 40%; drawing slows further by bow class; the GREATBOW plants
    // (the stance commits — no movement at all while aiming).
    // Fase 22 — APOLLO exempt: the sun's wielder walks at full speed.
    if (this.bowAiming && !this.bowFreeMove) mm *= 0.6;
    if (this.bowDraw >= 0) {
      if (this.bowPlanted) mm = 0;
      else mm *= this.bowDrawMult;
    }
    if (this.attackT > 0) mm *= 0.35;
    this.moveMult = mm;

    // --- Animate ---
    // Fase 22 — feed the cape cloth layer (turn lag + vertical velocity)
    this.tickCloth(dt);
    this.model.update({
      dt,
      speed: this.speedSm,
      moving: inputLen > 0,
      grounded: this.grounded,
      swimming: this.swimming,
      attackT: this.attackT,
      attackKind: this.attackKind,
      attackDur: this.attackDur,
      blockT: this.blockT,
      // the marometa borrows the roll's tucked pose (limbs folded tight)
      rollT: this.rollT > 0 ? this.rollT : this.flipT,
      dodgeStep: this.rollT > 0 && this.dodgeStyle === 'step',
      bowDraw: this.bowDraw,
      dashKick: this.dashKick,
      vy: this.velocity.y,
      yawRate: this.yawRateSm,
    });

    // --- Footsteps ---
    if (this.grounded && this.speedSm > 0.5) {
      this.stepTimer -= dt * this.speedSm;
      if (this.stepTimer <= 0) {
        this.stepTimer = 1.7;
        this.onFootstep?.(this.surfaceAt(terrain));
      }
    }

    // Lantern flicker
    if (this.lanternOn) {
      this.lanternLight.intensity = gfxRuntime.pointLights
        ? 2.1 + Math.sin(performance.now() * 0.011) * 0.25
        : 0;
    } else {
      this.lanternLight.intensity = 0;
    }
  }

  private resolveCollisions(colliders: ColliderRegistry, groundH: number): void {
    const r = 0.36;
    const feetY = this.position.y;
    const headY = feetY + 1.72;
    for (const c of colliders.query(this.position.x, this.position.z, 3)) {
      if (c.kind === 'cylinder') {
        if (c.maxY <= feetY + 0.25 || c.minY >= headY) continue;
        const dx = this.position.x - c.x;
        const dz = this.position.z - c.z;
        const d = Math.hypot(dx, dz);
        const minD = c.r + r;
        if (d < minD && d > 0.0001) {
          const push = (minD - d);
          this.position.x += (dx / d) * push;
          this.position.z += (dz / d) * push;
        }
      } else {
        // Thin boxes are walkable platforms — never block horizontally
        if (c.maxY - c.minY <= 0.5) continue;
        if (c.maxY <= feetY + 0.25 || c.minY >= headY) continue;
        // Closest point on box to player center
        const px = clamp(this.position.x, c.minX, c.maxX);
        const pz = clamp(this.position.z, c.minZ, c.maxZ);
        const dx = this.position.x - px;
        const dz = this.position.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 0.00001) {
            const d = Math.sqrt(d2);
            const push = r - d;
            this.position.x += (dx / d) * push;
            this.position.z += (dz / d) * push;
          } else {
            // Center inside the box — push toward the nearest face
            const dists = [
              this.position.x - c.minX, c.maxX - this.position.x,
              this.position.z - c.minZ, c.maxZ - this.position.z,
            ];
            const min = Math.min(...dists);
            if (min === dists[0]) this.position.x = c.minX - r;
            else if (min === dists[1]) this.position.x = c.maxX + r;
            else if (min === dists[2]) this.position.z = c.minZ - r;
            else this.position.z = c.maxZ + r;
          }
        }
      }
    }
    void groundH;
  }

  /** Detect surface material for footstep sounds. */
  private surfaceAt(terrain: TerrainHeight): FootstepSurface {
    const x = this.position.x;
    const z = this.position.z;
    const h = terrain.height(x, z);
    // Docks: over water near the pier area with planks below
    if (h < 0.4 && this.position.y > 1.0 && x > 12 && x < 28 && z > 225 && z < 260) return 'wood';
    if (h < 2.2) return 'sand';
    const slope = terrain.slope(x, z, h);
    if (slope > 0.55 || h > 55) return 'stone';
    return 'grass';
  }

  serialize() {
    return {
      x: this.position.x, y: this.position.y, z: this.position.z,
      yaw: this.yaw, health: this.health, stamina: this.stamina,
    };
  }

  deserialize(d: ReturnType<Player['serialize']>): void {
    this.teleport(d.x, d.y, d.z);
    this.yaw = d.yaw;
    this.health = d.health;
    this.stamina = d.stamina;
  }

  /** Weapon visual hookup used by the game (item id → model kind). */
  setWeaponVisual(kind: WeaponKind): void {
    this.model.setWeapon(kind);
  }

  setShieldVisual(visible: boolean): void {
    this.hasShieldEquipped = visible;
    this.model.setShield(visible);
  }
}
