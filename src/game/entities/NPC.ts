import * as THREE from 'three';
import { CharacterModel, villagerPalette } from './CharacterModel';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import { dampAngle } from '../core/MathUtils';

export interface NPCDef {
  id: string;
  name: string;
  paletteIndex: number;
  cape?: boolean;
  dialogueId: string;
  /** Day schedule: positions by time. */
  home: THREE.Vector3;
  work: THREE.Vector3;
  /** Optional extra spot (tavern / square). */
  evening: THREE.Vector3;
  nightAtHome: boolean;
}

export type NPCActivity = 'home' | 'work' | 'evening';

/** Simple boid-free gull flock circling the bay. */
class Gull {
  private angle: number;
  private radius: number;
  private height: number;
  private speed: number;
  private wobble: number;
  readonly group = new THREE.Group();

  constructor(center: THREE.Vector3, seed: number) {
    this.angle = seed * 1.7;
    this.radius = 14 + (seed % 5) * 7;
    this.height = 16 + (seed % 4) * 5;
    this.speed = 0.25 + (seed % 3) * 0.06;
    this.wobble = seed;

    const mat = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.8, side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry();
    // Two wings from 4 triangles
    wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, -0.22, 0, 0, 0.1, -0.85, 0.08, 0.16,
      0, 0, -0.22, -0.85, 0.08, 0.16, -0.85, 0.08, -0.14,
      0, 0, -0.22, 0.85, 0.08, 0.16, 0, 0, 0.1,
      0.85, 0.08, 0.16, 0, 0, 0.1, 0, 0, -0.22,
    ]), 3));
    wingGeo.computeVertexNormals();
    const wings = new THREE.Mesh(wingGeo, mat);
    wings.name = 'wings';
    this.group.add(wings);
    this.group.position.set(
      center.x + Math.cos(this.angle) * this.radius,
      center.y + this.height,
      center.z + Math.sin(this.angle) * this.radius,
    );
  }

  update(dt: number, t: number, center: THREE.Vector3): void {
    this.angle += dt * this.speed;
    const r = this.radius + Math.sin(t * 0.3 + this.wobble) * 4;
    this.group.position.set(
      center.x + Math.cos(this.angle) * r,
      center.y + this.height + Math.sin(t * 0.7 + this.wobble * 2) * 1.5,
      center.z + Math.sin(this.angle) * r,
    );
    // Face travel direction (tangent)
    this.group.rotation.y = -this.angle;
    // Flap
    const wings = this.group.getObjectByName('wings');
    if (wings) {
      const flap = Math.sin(t * 7 + this.wobble * 3) * 0.5;
      wings.rotation.z = flap;
      wings.position.y = Math.abs(flap) * 0.06;
    }
  }
}

export class WildlifeSystem {
  private gulls: Gull[] = [];
  private t = 0;

  constructor(scene: THREE.Scene, center: THREE.Vector3, count = 9) {
    for (let i = 0; i < count; i++) {
      const gull = new Gull(center, i * 2.3 + 1);
      this.gulls.push(gull);
      scene.add(gull.group);
    }
  }

  update(dt: number): void {
    this.t += dt;
    for (const g of this.gulls) g.update(dt, this.t, this.center);
  }

  private center = new THREE.Vector3(20, 2, 240);

  dispose(): void {
    for (const g of this.gulls) g.group.parent?.remove(g.group);
    this.gulls.length = 0;
  }
}

export class NPC {
  readonly model: CharacterModel;
  readonly group = new THREE.Group();
  readonly def: NPCDef;
  private target = new THREE.Vector3();
  private activity: NPCActivity = 'work';
  private yaw = 0;
  private moving = false;
  private talkTimer = 0;

  constructor(def: NPCDef, scene: THREE.Scene) {
    this.def = def;
    const palette = { ...villagerPalette(def.paletteIndex) };
    if (def.cape) palette.cape = 0x5a1f1f;
    this.model = new CharacterModel(palette);
    this.group.add(this.model.root);
    this.group.position.copy(def.work);
    scene.add(this.group);
    this.target.copy(def.work);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get name(): string {
    return this.def.name;
  }

  /** Face the player while talking. */
  talkTo(playerPos: THREE.Vector3): void {
    this.talkTimer = 1.2;
    this.yaw = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
  }

  update(dt: number, dayFraction: number, terrain: TerrainHeight, colliders: ColliderRegistry, playerPos: THREE.Vector3): void {
    // --- Pick activity by hour ---
    const hour = dayFraction * 24;
    const wanted: NPCActivity = hour >= 7 && hour < 19 ? 'work' : hour >= 19 && hour < 23 ? 'evening' : 'home';
    if (wanted !== this.activity) {
      this.activity = wanted;
      this.target.copy(
        this.activity === 'work' ? this.def.work : this.activity === 'evening' ? this.def.evening : this.def.home,
      );
    }

    // --- Steering ---
    const dx = this.target.x - this.position.x;
    const dz = this.target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const speed = 1.15;
    if (dist > 0.8) {
      this.moving = true;
      const nx = dx / dist;
      const nz = dz / dist;
      this.position.x += nx * speed * dt;
      this.position.z += nz * speed * dt;
      this.yaw = dampAngle(this.yaw, Math.atan2(nx, nz), 8, dt);
      // Simple collision push-out
      for (const c of colliders.query(this.position.x, this.position.z, 1.5)) {
        if (c.kind === 'cylinder') {
          const ddx = this.position.x - c.x;
          const ddz = this.position.z - c.z;
          const d = Math.hypot(ddx, ddz);
          const minD = c.r + 0.3;
          if (d < minD && d > 0.001) {
            this.position.x += (ddx / d) * (minD - d);
            this.position.z += (ddz / d) * (minD - d);
          }
        }
      }
    } else {
      this.moving = false;
      // Idle: face the player if nearby
      const pd = this.position.distanceTo(playerPos);
      if (pd < 4.5) {
        this.yaw = dampAngle(this.yaw, Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z), 6, dt);
      }
    }

    if (this.talkTimer > 0) this.talkTimer -= dt;

    // Ground clamp
    this.position.y = terrain.height(this.position.x, this.position.z);
    this.group.rotation.y = this.yaw;

    this.model.update({
      dt,
      speed: this.moving ? 1.15 : 0,
      moving: this.moving,
      grounded: true,
      swimming: false,
      attackT: 0,
      talking: this.talkTimer > 0,
    });
  }

  serialize() {
    return { x: this.position.x, y: this.position.y, z: this.position.z, yaw: this.yaw };
  }

  deserialize(d: { x: number; y: number; z: number; yaw: number }): void {
    this.group.position.set(d.x, d.y, d.z);
    this.yaw = d.yaw;
    this.activity = 'work';
    this.target.copy(this.group.position);
  }
}
