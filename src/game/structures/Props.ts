import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT } from './Materials';
import { gfxRuntime } from '../core/Graphics';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import { getFlameFX, type PersistentFlameHandle } from '../world/FlameFX';

/** ---------------- Torch posts with a shared flickering light pool ---------------- */

interface Torch {
  pos: THREE.Vector3;
  flame: PersistentFlameHandle;
}

export class TorchSystem {
  private torches: Torch[] = [];
  private lights: THREE.PointLight[] = [];
  private time = 0;

  constructor(private scene: THREE.Scene, lightCount = 4) {
    // Fase 7 — the shared procedural-flame system (created here on first use)
    getFlameFX(scene);
    for (let i = 0; i < lightCount; i++) {
      const l = new THREE.PointLight(0xff9a3c, 0, 26, 1.8);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  /** Add a torch post (visual) + a living flame. */
  addTorchPost(x: number, y: number, z: number, colliders?: ColliderRegistry): void {
    // Post
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.09, 2.6, 6),
      MAT.woodDark,
    );
    post.position.set(x, y + 1.3, z);
    post.castShadow = true;
    this.scene.add(post);
    // Cage + bowl
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.16, 8), MAT.metal);
    bowl.position.set(x, y + 2.62, z);
    this.scene.add(bowl);
    // Fase 7 — real shader flame (teardrop + fbm turbulence)
    const flame = getFlameFX().addFlame(
      new THREE.Vector3(x, y + 2.68, z),
      { scale: 0.34, height: 0.78, heat: 0.42 },
    );
    this.torches.push({ pos: new THREE.Vector3(x, y + 2.7, z), flame });
    colliders?.add(`torch:${x.toFixed(1)}:${z.toFixed(1)}`, {
      kind: 'cylinder', x, z, r: 0.14, minY: y, maxY: y + 2.6,
    });
  }

  update(dt: number, nightFactor: number, playerPos: THREE.Vector3): void {
    this.time += dt;
    getFlameFX().update(); // frame-guarded
    // Flame flicker (always a little alive; stronger glow at night)
    for (const t of this.torches) {
      const flick = 0.75 + Math.sin(this.time * 11 + t.pos.x * 7.3) * 0.12 + Math.sin(this.time * 23 + t.pos.z * 3.1) * 0.08;
      t.flame.setIntensity(0.62 + flick * 0.34);
    }
    // Assign the light pool to the nearest torches
    const maxDist = 42;
    const near = this.torches
      .map((t) => ({ t, d: t.pos.distanceToSquared(playerPos) }))
      .filter((e) => e.d < maxDist * maxDist)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lights.length);
    this.lights.forEach((l, i) => {
      if (i < near.length) {
        const t = near[i].t;
        l.position.copy(t.pos);
        const flick = 0.8 + Math.sin(this.time * 9 + i * 2.7) * 0.14 + Math.sin(this.time * 27 + i) * 0.06;
        l.intensity = gfxRuntime.pointLights ? (0.25 + nightFactor * 1.65) * flick : 0;
        l.distance = 20 + nightFactor * 8;
      } else {
        l.intensity = 0;
      }
    });
  }

  dispose(): void {
    for (const t of this.torches) t.flame.dispose();
    this.torches.length = 0;
  }
}

/** ---------------- Chests ---------------- */

export interface ChestHandles {
  group: THREE.Group;
  lid: THREE.Mesh;
  open(): void;
  isOpen(): boolean;
}

export function createChest(x: number, y: number, z: number, rotY: number, scene: THREE.Scene, colliders: ColliderRegistry): ChestHandles {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotY;

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.55, 0.62), MAT.woodDark);
  base.position.y = 0.28;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  // Metal bands
  for (const off of [-0.38, 0.38]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.58, 0.66), MAT.metal);
    band.position.set(off, 0.28, 0);
    group.add(band);
  }
  // Lid (hinged at the back edge)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.3, 0.64), MAT.wood);
  lid.geometry.translate(0, 0.15, -0.31);
  lid.position.set(0, 0.55, 0.31);
  lid.castShadow = true;
  group.add(lid);
  // Lock plate
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), MAT.gold);
  lock.position.set(0, 0.45, 0.34);
  group.add(lock);

  scene.add(group);
  colliders.add(`chest:${x.toFixed(1)}:${z.toFixed(1)}`, {
    kind: 'box', minX: x - 0.55, maxX: x + 0.55, minY: y, maxY: y + 0.85, minZ: z - 0.4, maxZ: z + 0.4,
  });

  let openFlag = false;
  let openT = 0;
  const handles: ChestHandles = {
    group,
    lid,
    open() {
      if (openFlag) return;
      openFlag = true;
      openT = 0;
    },
    isOpen: () => openFlag,
  };
  // Animation handled by the interaction system via userData
  lid.userData.chestAnim = { handles, openT: 0 };
  group.userData.chest = handles;
  return handles;
}

/** Animate chest lids each frame. */
export function updateChests(dt: number, chests: ChestHandles[]): void {
  for (const c of chests) {
    if (c.isOpen()) {
      const target = -1.85;
      if (c.lid.rotation.x > target) {
        c.lid.rotation.x = Math.max(target, c.lid.rotation.x - dt * 3.2);
      }
    }
  }
}

/** ---------------- Herb plants (pétalos de marfil) ---------------- */

export function createHerb(x: number, y: number, z: number, scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  // Stem + leaves
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 5), MAT.leaf);
  stem.position.y = 0.25;
  group.add(stem);
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.07), MAT.leaf);
    leaf.position.set(0, 0.18 + i * 0.12, 0);
    leaf.rotation.y = i * 2.1;
    leaf.rotation.z = 0.4;
    group.add(leaf);
  }
  // Glowing ivory petals
  const petalMat = new THREE.MeshStandardMaterial({
    color: 0xf2ead2, emissive: 0xd8c98a, emissiveIntensity: 0.75, roughness: 0.6,
  });
  const petals = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), petalMat);
  petals.position.y = 0.52;
  group.add(petals);
  group.userData.herb = true;
  scene.add(group);
  return group;
}

/** ---------------- Signpost ---------------- */

export function createSignpost(
  x: number, y: number, z: number, rotY: number, labels: Array<{ text: string; angle: number }>,
  scene: THREE.Scene,
): void {
  void labels; // Text rendering via canvas texture kept simple: boards only
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotY;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), MAT.woodDark);
  post.position.y = 1.3;
  post.castShadow = true;
  group.add(post);
  let boardY = 1.95;
  for (let i = 0; i < Math.min(2, 2); i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.06), MAT.woodLight);
    board.position.set(0.45, boardY, 0);
    board.rotation.y = i * 0.5 - 0.25;
    board.castShadow = true;
    group.add(board);
    boardY -= 0.5;
  }
  scene.add(group);
}

/** Merge helper for one-off static meshes. */
export function mergedMesh(geos: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const merged = mergeGeometries(geos);
  const mesh = new THREE.Mesh(merged ?? new THREE.BufferGeometry(), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
