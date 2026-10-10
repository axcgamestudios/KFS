import * as THREE from 'three';
import { TerrainHeight } from './TerrainHeight';
import { QUALITY_PRESETS, type QualityLevel } from '../core/Engine';
import { hash2, mulberry32 } from '../core/MathUtils';

export const CHUNK_SIZE = 64;

/** Per-chunk scatter data handed to the vegetation system. */
export interface ChunkScatter {
  key: string;
  cx: number;
  cz: number;
  trees: Array<{ x: number; z: number; y: number; species: number; scale: number; rot: number }>;
  rocks: Array<{ x: number; z: number; y: number; scale: number; rot: number }>;
  near: boolean; // inside the grass ring
}

interface Chunk {
  key: string;
  cx: number;
  cz: number;
  mesh: THREE.Mesh;
  scatter?: ChunkScatter;
}

/**
 * Streams terrain chunks around the player. Deterministic generation from
 * world position, so chunks can be destroyed and rebuilt identically.
 */
export class TerrainSystem {
  private chunks = new Map<string, Chunk>();
  private material: THREE.MeshStandardMaterial;
  private buildQueue: Array<{ cx: number; cz: number; dist: number }> = [];
  private radius: number;
  private res: number;
  private scatterSink?: (s: ChunkScatter) => void;
  private onChunkRemoved?: (key: string) => void;

  constructor(
    private terrain: TerrainHeight,
    quality: QualityLevel = 'high',
  ) {
    this.radius = QUALITY_PRESETS[quality].viewChunkRadius;
    this.res = quality === 'low' ? 20 : quality === 'medium' ? 24 : 32;
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: false,
    });
  }

  setScatterSink(fn: (s: ChunkScatter) => void, onRemoved: (key: string) => void): void {
    this.scatterSink = fn;
    this.onChunkRemoved = onRemoved;
  }

  updateQuality(quality: QualityLevel): void {
    this.radius = QUALITY_PRESETS[quality].viewChunkRadius;
    // Resolution stays; only radius changes at runtime to avoid chunk churn.
  }

  get chunkRadius(): number {
    return this.radius;
  }

  /** Immediate generation of all chunks around a point (used during loading). */
  async pregenerate(px: number, pz: number, onProgress?: (done: number, total: number) => void): Promise<void> {
    const ccx = Math.floor(px / CHUNK_SIZE);
    const ccz = Math.floor(pz / CHUNK_SIZE);
    const list: Array<{ cx: number; cz: number; dist: number }> = [];
    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        list.push({ cx: ccx + dx, cz: ccz + dz, dist: Math.max(Math.abs(dx), Math.abs(dz)) });
      }
    }
    list.sort((a, b) => a.dist - b.dist);
    // Only the first two rings at full detail during loading; rest stream in.
    const total = list.length;
    let done = 0;
    for (const c of list) {
      if (!this.chunks.has(this.keyOf(c.cx, c.cz))) {
        this.buildChunk(c.cx, c.cz);
        done++;
        if (onProgress && done % 6 === 0) {
          onProgress(done, total);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
    onProgress?.(total, total);
  }

  /** Called every frame with the player position. */
  update(px: number, pz: number): void {
    const ccx = Math.floor(px / CHUNK_SIZE);
    const ccz = Math.floor(pz / CHUNK_SIZE);
    this.lastPlayerChunkX = ccx;
    this.lastPlayerChunkZ = ccz;

    // Queue missing chunks (nearest first), max 2 builds per frame.
    this.buildQueue.length = 0;
    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = this.keyOf(cx, cz);
        if (!this.chunks.has(key)) {
          this.buildQueue.push({ cx, cz, dist: dx * dx + dz * dz });
        }
      }
    }
    if (this.buildQueue.length > 0) {
      this.buildQueue.sort((a, b) => a.dist - b.dist);
      const budget = Math.min(2, this.buildQueue.length);
      for (let i = 0; i < budget; i++) {
        const c = this.buildQueue[i];
        this.buildChunk(c.cx, c.cz);
      }
    }

    // Remove far chunks.
    const cull = this.radius + 1.5;
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - ccx) > cull || Math.abs(chunk.cz - ccz) > cull) {
        this.sceneRef?.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        this.chunks.delete(key);
        this.onChunkRemoved?.(key);
      }
    }
  }

  private sceneRef: THREE.Scene | null = null;
  private lastPlayerChunkX = 0;
  private lastPlayerChunkZ = 0;

  attachTo(scene: THREE.Scene): void {
    this.sceneRef = scene;
  }

  private keyOf(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private buildChunk(cx: number, cz: number): void {
    if (!this.sceneRef) return;
    const key = this.keyOf(cx, cz);
    if (this.chunks.has(key)) return;

    const res = this.res;
    const size = CHUNK_SIZE;
    const ox = cx * size;
    const oz = cz * size;
    const step = size / res;
    const vertCount = (res + 1) * (res + 1);
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices: number[] = [];

    const col: [number, number, number] = [0, 0, 0];
    for (let j = 0; j <= res; j++) {
      for (let i = 0; i <= res; i++) {
        const x = ox + i * step;
        const z = oz + j * step;
        const h = this.terrain.height(x, z);
        const idx = j * (res + 1) + i;
        positions[idx * 3] = x;
        positions[idx * 3 + 1] = h;
        positions[idx * 3 + 2] = z;
        const slope = this.terrain.slope(x, z, h);
        this.terrain.colorAt(x, z, h, slope, col);
        colors[idx * 3] = col[0];
        colors[idx * 3 + 1] = col[1];
        colors[idx * 3 + 2] = col[2];
      }
    }
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const a = j * (res + 1) + i;
        const b = a + 1;
        const c = a + res + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.sceneRef.add(mesh);

    // --- Scatter determination (deterministic per chunk) ---
    const rand = mulberry32(hash2(cx + 4096, cz + 4096));
    const trees: ChunkScatter['trees'] = [];
    const rocks: ChunkScatter['rocks'] = [];
    const worldDistFromCenter = Math.hypot(
      ox + size / 2,
      oz + size / 2,
    );

    if (worldDistFromCenter < 560) {
      const attempts = 34;
      for (let a = 0; a < attempts; a++) {
        const x = ox + rand() * size;
        const z = oz + rand() * size;
        const h = this.terrain.height(x, z);
        const slope = this.terrain.slope(x, z, h);
        const fm = this.terrain.forestMask(x, z);
        if (this.terrain.canPlaceTree(x, z, h, slope) && rand() < fm * 0.92 + 0.035) {
          // Species: 0 oak, 1 pine, 2 birch — by altitude + noise
          const species = h > 34 ? (rand() < 0.75 ? 1 : 0) : fm > 0.45 ? (rand() < 0.7 ? 0 : 2) : rand() < 0.55 ? 2 : 0;
          trees.push({
            x, z, y: h,
            species,
            scale: 0.75 + rand() * 0.6,
            rot: rand() * Math.PI * 2,
          });
        }
      }
      for (let a = 0; a < 7; a++) {
        const x = ox + rand() * size;
        const z = oz + rand() * size;
        const h = this.terrain.height(x, z);
        if (h > 1.5 && rand() < 0.6) {
          rocks.push({ x, z, y: h, scale: 0.4 + rand() * 1.3, rot: rand() * Math.PI * 2 });
        }
      }
    }

    const near =
      Math.abs(cx - this.lastPlayerChunkX) <= 2 && Math.abs(cz - this.lastPlayerChunkZ) <= 2;

    const scatter: ChunkScatter = {
      key, cx, cz, trees, rocks,
      near,
    };

    this.chunks.set(key, { key, cx, cz, mesh, scatter });
    this.scatterSink?.(scatter);
  }

  /** Re-evaluate which chunks are 'near' (grass ring) after player moves. */
  refreshNearFlags(px: number, pz: number, nearRadius = 2): Map<string, boolean> {
    const ccx = Math.floor(px / CHUNK_SIZE);
    const ccz = Math.floor(pz / CHUNK_SIZE);
    const changes = new Map<string, boolean>();
    for (const [key, chunk] of this.chunks) {
      const isNear =
        Math.abs(chunk.cx - ccx) <= nearRadius && Math.abs(chunk.cz - ccz) <= nearRadius;
      if (chunk.scatter && chunk.scatter.near !== isNear) {
        chunk.scatter.near = isNear;
        changes.set(key, isNear);
      }
    }
    return changes;
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) {
      this.sceneRef?.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }
    this.chunks.clear();
    this.material.dispose();
  }
}
