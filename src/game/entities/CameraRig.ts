import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { TerrainHeight } from '../world/TerrainHeight';
import { clamp, damp, dampAngle } from '../core/MathUtils';
import type { ColliderRegistry } from '../systems/ColliderRegistry';

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

  constructor(private camera: THREE.PerspectiveCamera) {}

  handleInput(input: Input, dt: number): void {
    if (!input.pointerLocked) return;
    const sens = 0.0023 * this.sensitivity;
    this.yaw -= input.mouseDX * sens;
    this.pitch += (this.invertY ? input.mouseDY : -input.mouseDY) * sens;
    this.pitch = clamp(this.pitch, -0.55, 1.25);
    if (input.wheelDelta !== 0) {
      this.targetDistance = clamp(this.targetDistance + input.wheelDelta * 0.6, 2.2, 8.5);
    }
    void dt;
  }

  /** Direction the camera looks at on the XZ plane (for player movement). */
  get yawForward(): number {
    return this.yaw;
  }

  update(dt: number, playerPos: THREE.Vector3, sprinting: boolean, terrain: TerrainHeight, colliders: ColliderRegistry): void {
    this.distance = damp(this.distance, this.targetDistance, 8, dt);

    // Desired pivot: player head
    const pivotY = playerPos.y + 1.55;
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

    // FOV kick while sprinting
    const targetFov = sprinting ? 70 : 62;
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

  /** Used by cinematics to drive the camera directly. */
  setManual(position: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.camera.position.copy(position);
    this.camera.lookAt(lookAt);
    this.currentPos.copy(position);
  }

  yawDelta(d: number): void {
    this.yaw += d;
  }
}
