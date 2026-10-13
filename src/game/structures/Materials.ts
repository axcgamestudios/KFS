import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ColliderRegistry, Collider } from '../systems/ColliderRegistry';

/**
 * Shared material library for all structures. A limited, coherent palette
 * keeps the world looking hand-crafted rather than neon.
 */
export const MAT = {
  stone: new THREE.MeshStandardMaterial({ color: 0x8d887b, roughness: 0.94, metalness: 0 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x6f6a5e, roughness: 0.96, metalness: 0 }),
  stoneMoss: new THREE.MeshStandardMaterial({ color: 0x6e7562, roughness: 0.95, metalness: 0 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6f4d30, roughness: 0.88, metalness: 0 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9, metalness: 0 }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0x93714c, roughness: 0.85, metalness: 0 }),
  plaster: new THREE.MeshStandardMaterial({ color: 0xd9cfbd, roughness: 0.92, metalness: 0 }),
  plasterWarm: new THREE.MeshStandardMaterial({ color: 0xcfc0a4, roughness: 0.92, metalness: 0 }),
  timber: new THREE.MeshStandardMaterial({ color: 0x402c15, roughness: 0.9, metalness: 0 }),
  roofRed: new THREE.MeshStandardMaterial({ color: 0x743a2c, roughness: 0.86, metalness: 0 }),
  roofThatch: new THREE.MeshStandardMaterial({ color: 0x9a7f42, roughness: 0.95, metalness: 0 }),
  roofSlate: new THREE.MeshStandardMaterial({ color: 0x4e545c, roughness: 0.8, metalness: 0.05 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: 0.45, metalness: 0.75 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.8 }),
  clothRed: new THREE.MeshStandardMaterial({ color: 0x7a1f1f, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  clothGold: new THREE.MeshStandardMaterial({ color: 0xb08a2e, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  sail: new THREE.MeshStandardMaterial({ color: 0xd8cdb4, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  sailDark: new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
  clothRaven: new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
  woodShip: new THREE.MeshStandardMaterial({ color: 0x5c3f26, roughness: 0.88, metalness: 0 }),
  woodPirate: new THREE.MeshStandardMaterial({ color: 0x33241a, roughness: 0.92, metalness: 0 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4a6a30, roughness: 0.9, metalness: 0 }),
  glow: new THREE.MeshStandardMaterial({
    color: 0x2a1f14,
    emissive: 0xff9a3c,
    emissiveIntensity: 1.6,
    roughness: 0.6,
  }),
  /** Fase 4: cobbled ground (castle courtyard, stable yard, market plaza). */
  cobble: new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.94, metalness: 0 }),
  /** Fase 4: worn dirt path / stable floor. */
  dirt: new THREE.MeshStandardMaterial({ color: 0x8a7255, roughness: 0.96, metalness: 0 }),
  /** Fase 4: sun-bleached bone (cove decoration). */
  bone: new THREE.MeshStandardMaterial({ color: 0xd9d2c0, roughness: 0.85, metalness: 0 }),
  rune: new THREE.MeshStandardMaterial({
    color: 0x22262c,
    emissive: 0x6fd6c0,
    emissiveIntensity: 0.9,
    roughness: 0.5,
  }),
  /** Fase 16 — white concrete: the merchants' establishments (smithies).
   *  Photo-based albedo comes from AssetSystem (white_concrete PBR set). */
  concreteWhite: new THREE.MeshStandardMaterial({ color: 0xf2f0ec, roughness: 0.88, metalness: 0 }),
  /** Fase 18 — fountain water: clear, slightly metallic catchlight. */
  fountainWater: new THREE.MeshStandardMaterial({
    color: 0x4d8ba8, roughness: 0.16, metalness: 0.4,
    transparent: true, opacity: 0.82,
  }),
} as const;

export type MatKey = keyof typeof MAT;

/** World meters covered by one texture tile, per material family (Fase 4 PBR).
 *  Used to scale box/cylinder UVs so photos don't stretch on big walls. */
const TEX_WORLD_SCALE: Partial<Record<MatKey, number>> = {
  stone: 3.2, stoneDark: 3.2, stoneMoss: 3.2, cobble: 2.6, dirt: 3.0,
  wood: 2.2, woodDark: 2.2, woodLight: 2.2, timber: 2.0, woodShip: 2.4, woodPirate: 2.4,
  roofRed: 1.9, roofSlate: 1.9, roofThatch: 1.7,
  concreteWhite: 3.0,
};

/** Scale a BoxGeometry's UVs so each face tiles the texture at world size.
 *  Face order in three.js: +X,-X,+Y,-Y,+Z,-Z with 4 verts each (indexed). */
function worldUvBox(geo: THREE.BufferGeometry, w: number, h: number, d: number, tex: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return;
  const dims: Array<[number, number]> = [
    [d, h], [d, h],   // ±X
    [w, d], [w, d],   // ±Y
    [w, h], [w, h],   // ±Z
  ];
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (i >= uv.count) break;
      uv.setXY(i, uv.getX(i) * (du / tex), uv.getY(i) * (dv / tex));
    }
  }
  uv.needsUpdate = true;
}

/** Scale a CylinderGeometry's UVs by circumference & height. */
function worldUvCylinder(geo: THREE.BufferGeometry, rTop: number, rBottom: number, h: number, tex: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return;
  const circ = Math.PI * (rTop + rBottom);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (circ / tex), uv.getY(i) * (h / tex));
  }
  uv.needsUpdate = true;
}

/**
 * Accumulates geometry per material and merges into few draw calls.
 * Also records colliders for the physics registry.
 */
export class StaticBuilder {
  private buckets = new Map<MatKey, THREE.BufferGeometry[]>();
  private mat4 = new THREE.Matrix4();
  private quat = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private colliderSeq = 0;
  /** All colliders created by this builder (allows re-registering them). */
  private created: Array<[string, Collider]> = [];

  constructor(
    private colliders: ColliderRegistry,
    private idPrefix: string,
  ) {}

  private bucketFor(key: MatKey): THREE.BufferGeometry[] {
    let arr = this.buckets.get(key);
    if (!arr) {
      arr = [];
      this.buckets.set(key, arr);
    }
    return arr;
  }

  add(geo: THREE.BufferGeometry, key: MatKey, x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, rotZ = 0, rotX = 0): this {
    // 'YXZ' order: yaw first, then pitch/roll in the yawed local frame —
    // exactly what roof slopes and ship parts need.
    this.euler.set(rotX, rotY, rotZ, 'YXZ');
    this.quat.setFromEuler(this.euler);
    this.mat4.compose(new THREE.Vector3(x, y, z), this.quat, new THREE.Vector3(sx, sy, sz));
    // Normalize to non-indexed: merging requires consistent indexing
    // (Extrude/Icosahedron are non-indexed while Box/Cylinder are indexed).
    const raw = geo.index ? geo.toNonIndexed() : geo;
    const g = raw.applyMatrix4(this.mat4);
    this.bucketFor(key).push(g);
    return this;
  }

  /** Box part. Size is full extent; position is the CENTER. */
  box(key: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): this {
    const geo = new THREE.BoxGeometry(w, h, d);
    const tex = TEX_WORLD_SCALE[key];
    if (tex) worldUvBox(geo, w, h, d, tex);
    return this.add(geo, key, x, y, z, rotY);
  }

  /** Axis-aligned solid box with collider (position = center). */
  solidBox(key: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, collide = true): this {
    this.box(key, w, h, d, x, y, z, rotY);
    if (collide) {
      this.addBoxCollider(x, y, z, w, h, d, rotY);
    }
    return this;
  }

  /** Rotated box collider approximation (uses rotated AABB for small angles). */
  addBoxCollider(cx: number, cy: number, cz: number, w: number, h: number, d: number, rotY: number): void {
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const ex = (w * cos + d * sin) / 2;
    const ez = (w * sin + d * cos) / 2;
    const id = `${this.idPrefix}:b${this.colliderSeq++}`;
    const collider: Collider = {
      kind: 'box',
      minX: cx - ex, maxX: cx + ex,
      minY: cy - h / 2, maxY: cy + h / 2,
      minZ: cz - ez, maxZ: cz + ez,
    };
    this.colliders.add(id, collider);
    this.created.push([id, collider]);
  }

  cylinder(key: MatKey, rTop: number, rBottom: number, h: number, seg: number, x: number, y: number, z: number, collide = false): this {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    const tex = TEX_WORLD_SCALE[key];
    if (tex) worldUvCylinder(geo, rTop, rBottom, h, tex);
    return this.add(geo, key, x, y, z, 0);
  }

  addCylinderCollider(x: number, z: number, r: number, minY: number, maxY: number): void {
    const id = `${this.idPrefix}:c${this.colliderSeq++}`;
    const collider: Collider = { kind: 'cylinder', x, z, r, minY, maxY };
    this.colliders.add(id, collider);
    this.created.push([id, collider]);
  }

  /** Re-register every collider this builder created (after a prefix wipe). */
  reRegisterColliders(): void {
    for (const [id, collider] of this.created) this.colliders.add(id, collider);
  }

  /** Remove every collider this builder created. */
  removeAllColliders(): void {
    this.colliders.removePrefix(`${this.idPrefix}:`);
  }

  /** Merge everything into meshes attached to a group. */
  build(group: THREE.Group, opts: { shadows?: boolean } = {}): void {
    const shadows = opts.shadows !== false;
    for (const [key, geos] of this.buckets) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, MAT[key]);
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      group.add(mesh);
      geos.forEach((g) => g.dispose());
    }
    this.buckets.clear();
  }
}
