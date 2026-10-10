import * as THREE from 'three';
import { CharacterModel, PLAYER_PALETTE, type WeaponKind } from './CharacterModel';
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
}

export class Player {
  readonly model: CharacterModel;
  readonly group = new THREE.Group(); // world transform (position = feet)
  readonly velocity = new THREE.Vector3();
  yaw = 0; // facing
  health = 100;
  stamina = 100;
  grounded = true;
  swimming = false;
  attackT = 0;
  lanternOn = false;

  // ---- Fase 3 combat state (driven by CombatSystem, read for animation) ----
  /** Current attack animation variant. */
  attackKind: 'light1' | 'light2' | 'heavy' | 'thrust' | 'bowRelease' = 'light1';
  /** Duration of the current swing (heavy attacks are slower). */
  attackDur = 0.5;
  /** Recovery gate after a swing before the next may start. */
  attackRecovery = 0;
  /** Block pose blend target (RMB). */
  blocking = false;
  blockT = 0;
  /** Dodge roll in progress (0..1). */
  rollT = 0;
  readonly rollDir = new THREE.Vector3(0, 0, -1);
  /** Bow draw progress: -1 = not drawing, else 0..1. */
  bowDraw = -1;
  /** Post-hit invulnerability window (seconds left). */
  invulnT = 0;
  /** Movement multiplier (block / bow draw slow the player). */
  moveMult = 1;
  /** Damage taken while blocking is also paid with stamina. */
  hasShieldEquipped = false;

  private verticalVel = 0;
  private stepTimer = 0;
  private lanternLight: THREE.PointLight;
  private lanternFlame: THREE.Sprite;
  private wasGrounded = true;
  private airTime = 0;
  private speedSm = 0;

  stats: PlayerStats = {
    maxHealth: 100, maxStamina: 100,
    walkSpeed: 3.6, runSpeed: 6.6, swimSpeed: 2.3,
  };

  onFootstep?: (surface: FootstepSurface) => void;
  onAttackSwing?: () => void;
  onDamaged?: (amount: number, reason: string) => void;
  onBlockSparks?: (pos: THREE.Vector3) => void;

  /** Optional ship-deck ground probe (set while walking a ship's deck).
   *  Returns the deck height at a world XZ or null when off-deck. */
  platformProbe?: (x: number, z: number) => number | null;

  constructor(scene: THREE.Scene) {
    this.model = new CharacterModel(PLAYER_PALETTE);
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
    this.bowDraw = -1;
    this.invulnT = 0;
  }

  toggleLantern(): void {
    this.lanternOn = !this.lanternOn;
    this.lanternFlame.visible = this.lanternOn;
  }

  // ---------------------------------------------------------------- combat

  /** Start a dodge roll toward a world-space direction (length-irrelevant). */
  beginRoll(dirX: number, dirZ: number): void {
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.001) this.rollDir.set(dirX / len, 0, dirZ / len);
    else this.rollDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); // backward
    this.rollT = 0.001;
    this.attackT = 0;
    this.bowDraw = -1;
  }

  get rolling(): boolean {
    return this.rollT > 0;
  }

  get invulnerable(): boolean {
    return this.invulnT > 0 || this.rollT > 0; // roll grants i-frames
  }

  /**
   * Central damage entry — applies i-frames, block reduction and stamina
   * drain. Returns the health actually lost (0 when fully avoided/blocked)
   * so callers can spawn the right VFX.
   */
  takeHit(damage: number, fromX?: number, fromZ?: number): number {
    if (this.invulnerable) return 0;
    // Blocking: absorb if the source is roughly in front (±60°)
    if (this.blockT > 0.5) {
      let facing = true;
      if (fromX !== undefined && fromZ !== undefined) {
        const toSrc = Math.atan2(fromX - this.position.x, fromZ - this.position.z);
        let d = toSrc - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        facing = Math.abs(d) < 1.05;
      }
      if (facing) {
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
    this.health = Math.max(0, this.health - damage);
    this.invulnT = 0.7;
    this.model.flash();
    return damage;
  }

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

    const wantRun = input.isDown('sprint') && inputLen > 0 && this.stamina > 1 && !this.swimming;
    let speed = this.swimming ? this.stats.swimSpeed : wantRun ? this.stats.runSpeed : this.stats.walkSpeed;
    // Combat movement modifiers (Fase 3)
    if (this.rollT > 0) speed = 7.6;                 // dodge roll burst
    else speed *= this.moveMult;                     // block / bow-draw slow

    // --- Stamina ---
    if (wantRun && inputLen > 0) this.stamina = Math.max(0, this.stamina - dt * 13);
    else if (this.swimming) this.stamina = Math.max(0, this.stamina - dt * 2.2);
    else if (inputLen > 0) this.stamina = Math.min(this.stats.maxStamina, this.stamina + dt * 9);
    else this.stamina = Math.min(this.stats.maxStamina, this.stamina + dt * 17);

    // --- Horizontal velocity (smooth accel) ---
    let targetVX: number;
    let targetVZ: number;
    if (this.rollT > 0) {
      // Dodge roll: fixed burst along the roll direction, input ignored
      targetVX = this.rollDir.x * speed;
      targetVZ = this.rollDir.z * speed;
    } else {
      targetVX = moveX * speed;
      targetVZ = moveZ * speed;
    }
    const accel = this.grounded || this.swimming ? 12 : 4;
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
    // Swimming only when actually in the water (not standing on a pier)
    this.swimming = terrainH < -1.2 && this.position.y < 0.35;

    if (!dialogueActive && input.pressed('jump') && this.grounded && !this.swimming && this.stamina > 10) {
      this.verticalVel = 7.4;
      this.grounded = false;
      this.stamina -= 10;
    }

    if (this.swimming) {
      // Float at the surface
      const targetY = -0.45;
      this.verticalVel = damp(this.verticalVel, (targetY - (this.position.y)) * 4, 6, dt);
      this.position.y += this.verticalVel * dt;
      this.grounded = false;
      this.airTime = 0;
    } else {
      this.verticalVel -= 19 * dt;
      this.position.y += this.verticalVel * dt;
      const groundY = groundH;
      if (this.position.y <= groundY) {
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

    // --- Facing ---
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.speedSm = damp(this.speedSm, hSpeed, 8, dt);
    if (hSpeed > 0.4) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.yaw = dampAngle(this.yaw, targetYaw, 12, dt);
    }
    this.group.rotation.y = this.yaw;

    // --- Swim pitch (lean body forward in water) ---
    this.model.root.rotation.x = damp(this.model.root.rotation.x, this.swimming ? 1.15 : 0, 8, dt);
    this.model.root.position.y = damp(this.model.root.position.y, this.swimming ? 0.55 : 0, 8, dt);

    // --- Combat timers (Fase 3) ---
    if (this.rollT > 0) {
      this.rollT += dt / 0.55;
      if (this.rollT >= 1) this.rollT = 0;
    }
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.attackRecovery > 0) this.attackRecovery -= dt;
    // Block pose blend
    const blockTarget = this.blocking && this.grounded && this.rollT === 0 && this.attackT === 0 ? 1 : 0;
    this.blockT = damp(this.blockT, blockTarget, 14, dt);
    // Movement multiplier from context
    let mm = 1;
    if (this.blockT > 0.1) mm *= 1 - 0.55 * this.blockT;
    if (this.bowDraw >= 0) mm *= 0.55;
    if (this.attackT > 0) mm *= 0.35;
    this.moveMult = mm;

    // --- Animate ---
    this.model.update({
      dt,
      speed: this.speedSm,
      moving: inputLen > 0,
      grounded: this.grounded,
      swimming: this.swimming,
      attackT: this.attackT,
      attackKind: this.attackKind,
      blockT: this.blockT,
      rollT: this.rollT,
      bowDraw: this.bowDraw,
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
      this.lanternLight.intensity = 2.1 + Math.sin(performance.now() * 0.011) * 0.25;
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
