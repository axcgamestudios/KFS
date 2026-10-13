import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { TerrainHeight } from '../world/TerrainHeight';
import { clamp, damp, dampAngle } from '../core/MathUtils';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import type { Ship } from '../naval/Ship';

/**
 * Third-person orbit camera: mouse look with pointer lock, scroll zoom,
 * spring-arm collision against terrain & props, smooth follow, sprint FOV.
 */
export class CameraRig {
  yaw = Math.PI;       // looking north initially
  pitch = 0.22;
  distance = 4.6;
  targetDistance = 4.6;
  sensitivity = 1.0;
  invertY = false;

  private currentPos = new THREE.Vector3(0, 30, 60);
  private lookAt = new THREE.Vector3();
  private fov = 62;
  /** Fase 9 — combat camera punch: quick FOV kick, decays fast. */
  private fovKick = 0;
  /** While sailing the rig orbits the ship instead of the player. */
  shipTarget: Ship | null = null;
  private savedDistance = 4.6;

  /** Fase 20 — FREE CAM (P): a detached fly camera for exploring/filming
   *  the world. While on, the rig ignores the hero: WASD flies along the
   *  look direction, SPACE/SHIFT rise/sink, the wheel tunes fly speed. */
  freeCam = false;
  freeSpeed = 14;
  private freePos = new THREE.Vector3();
  private freeFwd = new THREE.Vector3();
  private freeRight = new THREE.Vector3();

  /** Enter/leave free cam. Handoff is seamless both ways: entering keeps
   *  the current view (position + yaw/pitch), leaving lets the follow
   *  spring glide the rig back behind the hero. */
  setFreeCam(on: boolean): void {
    if (on === this.freeCam) return;
    if (on) {
      this.freeCam = true;
      this.freePos.copy(this.camera.position);
    } else {
      this.freeCam = false;
      this.currentPos.copy(this.camera.position); // spring continues from here
    }
  }

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** Fase 9 — cinematic combat feedback: parries, counters and finishers
   *  land with a short FOV punch (never a disorienting shake). */
  punch(intensity: number): void {
    this.fovKick = Math.min(15, this.fovKick + intensity * 9);
  }

  /** Fase 10 — cinematic dialogue: tighten the lens + step closer while a
   *  conversation plays, ease back out when it closes. */
  setDialogueFocus(active: boolean): void {
    if (active === this.dialogueFocus) return;
    this.dialogueFocus = active;
    if (active) {
      this.savedDistance = this.targetDistance;
      this.targetDistance = clamp(this.savedDistance * 0.72, 2.2, 8.5);
    } else {
      this.targetDistance = this.savedDistance;
    }
  }
  private dialogueFocus = false;

  /** Fase 11 — combat framing: while enemies are hot, the rig sits a touch
   *  wider and higher so the pack stays in frame with the hero (it never
   *  fights the player's zoom — it scales whatever zoom they chose). */
  setCombatFraming(active: boolean): void {
    if (active === this.combatFraming) return;
    this.combatFraming = active;
    const k = active ? 1.18 : 1 / 1.18;
    this.targetDistance = clamp(this.targetDistance * k, 2.2, this.shipTarget ? 42 : 8.5);
  }
  private combatFraming = false;

  handleInput(input: Input, dt: number): void {
    if (this.freeCam) {
      // Fase 20 — free cam look: wider pitch, the wheel retunes fly speed
      // (2–90 m/s) instead of zooming.
      if (!input.pointerLocked) return;
      const sens = 0.0023 * this.sensitivity;
      this.yaw -= input.mouseDX * sens;
      this.pitch += (this.invertY ? input.mouseDY : -input.mouseDY) * sens;
      this.pitch = clamp(this.pitch, -1.5, 1.5);
      if (input.wheelDelta !== 0) {
        this.freeSpeed = clamp(this.freeSpeed * (input.wheelDelta < 0 ? 1.22 : 0.82), 2, 90);
      }
      return;
    }
    if (!input.pointerLocked) return;
    const sens = 0.0023 * this.sensitivity;
    this.yaw -= input.mouseDX * sens;
    this.pitch += (this.invertY ? input.mouseDY : -input.mouseDY) * sens;
    if (this.shipTarget) {
      this.pitch = clamp(this.pitch, 0.04, 1.15);
      if (input.wheelDelta !== 0) {
        this.targetDistance = clamp(this.targetDistance + input.wheelDelta * 1.6, 7, 42);
      }
    } else {
      this.pitch = clamp(this.pitch, -0.55, 1.25);
      if (input.wheelDelta !== 0) {
        this.targetDistance = clamp(this.targetDistance + input.wheelDelta * 0.6, 2.2, 8.5);
      }
    }
    void dt;
  }

  /** Direction the camera looks at on the XZ plane (for player movement). */
  get yawForward(): number {
    return this.yaw;
  }

  update(dt: number, playerPos: THREE.Vector3, sprinting: boolean, terrain: TerrainHeight, colliders: ColliderRegistry): void {
    if (this.shipTarget) {
      this.updateShip(dt, this.shipTarget, terrain);
      return;
    }
    this.distance = damp(this.distance, this.targetDistance, 8, dt);

    // Desired pivot: player head (Fase 11 — combat framing lifts it a hair
    // so the ring of enemies reads below the hero's silhouette)
    const combatLift = this.combatFraming ? 0.3 : 0;
    const pivotY = playerPos.y + 1.55 + combatLift;
    this.lookAt.set(
      playerPos.x,
      pivotY + 0.1,
      playerPos.z,
    );

    // Desired camera position on the orbit sphere (behind the yaw direction)
    const cosP = Math.cos(this.pitch);
    const dirX = Math.sin(this.yaw) * cosP;
    const dirY = Math.sin(this.pitch);
    const dirZ = Math.cos(this.yaw) * cosP;
    let dist = this.distance;

    // Spring arm: march along the boom and stop before terrain/props
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * this.distance;
      const sx = this.lookAt.x - dirX * t;
      const sy = this.lookAt.y - dirY * t;
      const sz = this.lookAt.z - dirZ * t;
      const groundAt = terrain.height(sx, sz) + 0.35;
      if (sy < groundAt) {
        dist = Math.max(0.8, t - this.distance / steps);
        break;
      }
      // Props
      let blocked = false;
      for (const c of colliders.query(sx, sz, 1.2)) {
        if (c.kind === 'box' &&
          sx > c.minX - 0.3 && sx < c.maxX + 0.3 &&
          sz > c.minZ - 0.3 && sz < c.maxZ + 0.3 &&
          sy > c.minY && sy < c.maxY) {
          blocked = true;
          break;
        }
        if (c.kind === 'cylinder' && sy > c.minY && sy < c.maxY) {
          const d = Math.hypot(sx - c.x, sz - c.z);
          if (d < c.r + 0.3) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) {
        dist = Math.max(0.8, t - this.distance / steps);
        break;
      }
    }

    const desired = new THREE.Vector3(
      this.lookAt.x - dirX * dist,
      Math.max(this.lookAt.y - dirY * dist, terrain.height(this.lookAt.x - dirX * dist, this.lookAt.z - dirZ * dist) + 0.4),
      this.lookAt.z - dirZ * dist,
    );
    this.currentPos.x = damp(this.currentPos.x, desired.x, 16, dt);
    this.currentPos.y = damp(this.currentPos.y, desired.y, 12, dt);
    this.currentPos.z = damp(this.currentPos.z, desired.z, 16, dt);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.lookAt);

    // FOV kick while sprinting (+ Fase 9 combat punch decay) + the dialogue
    // lens (Fase 10): conversations play tighter, like a film close-up
    this.fovKick = damp(this.fovKick, 0, 7, dt);
    const targetFov = (sprinting ? 70 : 62) + this.fovKick - (this.dialogueFocus ? 7 : 0);
    this.fov = damp(this.fov, targetFov, 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Fase 20 — free-cam flight step. Runs INSTEAD of update() while the
   *  camera is detached: no terrain/prop collision, no follow spring. */
  updateFree(dt: number, input: Input): void {
    const cosP = Math.cos(this.pitch);
    this.freeFwd.set(Math.sin(this.yaw) * cosP, Math.sin(this.pitch), Math.cos(this.yaw) * cosP);
    this.freeRight.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    const shifting = input.isDown('sprint');
    const horizontal = input.isDown('forward') || input.isDown('back') ||
      input.isDown('left') || input.isDown('right');

    let vx = 0, vy = 0, vz = 0;
    if (input.isDown('forward')) { vx += this.freeFwd.x; vy += this.freeFwd.y; vz += this.freeFwd.z; }
    if (input.isDown('back')) { vx -= this.freeFwd.x; vy -= this.freeFwd.y; vz -= this.freeFwd.z; }
    if (input.isDown('right')) { vx += this.freeRight.x; vz += this.freeRight.z; }
    if (input.isDown('left')) { vx -= this.freeRight.x; vz -= this.freeRight.z; }
    if (input.isDown('jump')) vy += 1;
    // SHIFT alone sinks; SHIFT held with WASD doubles as turbo instead
    if (shifting && !horizontal) vy -= 1;

    const len = Math.hypot(vx, vy, vz);
    if (len > 1e-4) {
      const k = (shifting ? this.freeSpeed * 2.6 : this.freeSpeed) * dt / len;
      this.freePos.x += vx * k;
      this.freePos.y += vy * k;
      this.freePos.z += vz * k;
    }
    this.camera.position.copy(this.freePos);
    this.camera.lookAt(
      this.freePos.x + this.freeFwd.x,
      this.freePos.y + this.freeFwd.y,
      this.freePos.z + this.freeFwd.z,
    );
    // calm lens: settle FOV back to base while flying
    this.fovKick = damp(this.fovKick, 0, 7, dt);
    const targetFov = 62 + this.fovKick;
    this.fov = damp(this.fov, targetFov, 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Instant placement (loading / teleports). */
  snapBehind(playerPos: THREE.Vector3): void {
    const pivotY = playerPos.y + 1.55;
    const cosP = Math.cos(this.pitch);
    this.currentPos.set(
      playerPos.x - Math.sin(this.yaw) * cosP * this.distance,
      pivotY - Math.sin(this.pitch) * this.distance,
      playerPos.z - Math.cos(this.yaw) * cosP * this.distance,
    );
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(playerPos.x, pivotY, playerPos.z);
  }

  /** Enter/leave sailing camera. Restores the previous zoom when returning. */
  setShipMode(ship: Ship | null): void {
    if (ship && !this.shipTarget) {
      this.savedDistance = this.targetDistance;
      // Fase 16 — the sailing cam was cramped and low: sails ate the view.
      // Wider orbit (17→21 m) + higher base pitch: the whole hull reads.
      this.targetDistance = 21;
      this.distance = 21;
      this.pitch = Math.max(this.pitch, 0.34);
      this.shipTarget = ship;
    } else if (!ship && this.shipTarget) {
      this.shipTarget = null;
      this.targetDistance = this.savedDistance;
      this.distance = this.savedDistance;
    }
  }

  /** Fase 4 — horseback camera: a touch wider, slightly higher pitch.
   *  Fase 15 — `distance` param: dragons need a much wider orbit (15 m)
   *  than horses (7.4 m) or the wings fill the whole screen. */
  setMountMode(on: boolean, distance = 7.4): void {
    if (on && !this.mountMode) {
      this.mountMode = true;
      this.savedMountDistance = this.targetDistance;
      this.targetDistance = distance;
      this.distance = Math.max(this.distance, distance * 0.55); // glide out, no snap
      this.pitch = Math.max(this.pitch, 0.26);
    } else if (!on && this.mountMode) {
      this.mountMode = false;
      this.targetDistance = this.savedMountDistance;
      this.distance = this.savedMountDistance;
    }
  }

  mountMode = false;
  private savedMountDistance = 4.6;

  /** Sailing camera: wide orbit around the helm, clamped above the waves. */
  private updateShip(dt: number, ship: Ship, terrain: TerrainHeight): void {
    this.distance = damp(this.distance, this.targetDistance, 6, dt);
    const pivot = ship.wheelWorld;
    // Fase 16 — pivot raised 1.5→2.6 m: the camera looks DOWN the deck
    // from above the bulwark line instead of peering through the rigging.
    pivot.y += 2.6;
    this.lookAt.copy(pivot);

    const cosP = Math.cos(this.pitch);
    const dirX = Math.sin(this.yaw) * cosP;
    const dirY = Math.sin(this.pitch);
    const dirZ = Math.cos(this.yaw) * cosP;

    // Keep the boom above the sea, allow glancing under the sails
    let dist = this.distance;
    const probe = (t: number) => {
      const sx = pivot.x - dirX * t;
      const sz = pivot.z - dirZ * t;
      const sy = pivot.y - dirY * t;
      return sy < terrain.height(sx, sz) + 1.2;
    };
    for (let i = 1; i <= 8; i++) {
      const t = (i / 8) * this.distance;
      if (probe(t)) {
        dist = Math.max(8, t - this.distance / 8);
        break;
      }
    }

    const desired = new THREE.Vector3(
      pivot.x - dirX * dist,
      Math.max(pivot.y - dirY * dist, 2.2),
      pivot.z - dirZ * dist,
    );
    this.currentPos.x = damp(this.currentPos.x, desired.x, 14, dt);
    this.currentPos.y = damp(this.currentPos.y, desired.y, 10, dt);
    this.currentPos.z = damp(this.currentPos.z, desired.z, 14, dt);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.lookAt);

    // Speed FOV (+ Fase 9 combat punch decay)
    this.fovKick = damp(this.fovKick, 0, 7, dt);
    const fast = ship.speed / Math.max(1, ship.maxSpeed) > 0.72;
    const targetFov = (fast ? 72 : 62) + this.fovKick;
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Used by cinematics to drive the camera directly. */
  setManual(position: THREE.Vector3, lookAt: THREE.Vector3, fov?: number): void {
    this.camera.position.copy(position);
    this.camera.lookAt(lookAt);
    this.currentPos.copy(position);
    if (fov !== undefined && Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  yawDelta(d: number): void {
    this.yaw += d;
  }
}
