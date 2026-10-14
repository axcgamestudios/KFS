import * as THREE from 'three';
import { TerrainHeight } from './TerrainHeight';
import { QUALITY_PRESETS, type QualityLevel } from '../core/Engine';
import { hash2, mulberry32 } from '../core/MathUtils';
import { ISLANDS } from './WorldConfig';

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
  /** Fase 21 — LOD: resolution this chunk was built at (near ring = full
   *  this.res, far rings = 16). Upgraded on approach. */
  res: number;
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

  /** Fase 5 — true when the repository ground textures are wired into the shader. */
  groundTextured = false;

  /** Repository photo textures for the ground (optional — plain colour when absent). */
  private tex: { grass?: THREE.Texture; dirt?: THREE.Texture; stone?: THREE.Texture } = {};

  constructor(
    private terrain: TerrainHeight,
    quality: QualityLevel = 'high',
    groundTextures?: { grass?: THREE.Texture; dirt?: THREE.Texture; stone?: THREE.Texture },
    chunkRadius?: number,
  ) {
    this.radius = chunkRadius ?? QUALITY_PRESETS[quality].viewChunkRadius;
    this.res = quality === 'low' ? 20 : quality === 'medium' ? 24 : 32;
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: false,
    });
    if (groundTextures) {
      this.tex = groundTextures;
      this.wireSplatShader();
    }
  }

  /**
   * Fase 5 — repository ground textures (Pasto on all green terrain, Tierra
   * on the road network, Piedra on rock, sand = Tierra re-scaled) blended by
   * per-vertex splat weights, on top of the biome vertex tint.
   */
  private wireSplatShader(): void {
    const make = (t: THREE.Texture) => {
      const c = t.clone();
      c.wrapS = THREE.RepeatWrapping;
      c.wrapT = THREE.RepeatWrapping;
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    };
    const tGrass = this.tex.grass ? make(this.tex.grass) : null;
    const tDirt = this.tex.dirt ? make(this.tex.dirt) : null;
    const tStone = this.tex.stone ? make(this.tex.stone) : null;
    if (!tGrass || !tDirt || !tStone) return;
    this.groundTextured = true;
    const uni = {
      tGrass: { value: tGrass },
      tDirt: { value: tDirt },
      tStone: { value: tStone },
    };
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.tGrass = uni.tGrass;
      shader.uniforms.tDirt = uni.tDirt;
      shader.uniforms.tStone = uni.tStone;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec4 aSplat;
varying vec4 vSplat;
varying vec2 vWorldUV;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vSplat = aSplat;
vWorldUV = vec2(position.x, position.z);`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform sampler2D tGrass;
uniform sampler2D tDirt;
uniform sampler2D tStone;
varying vec4 vSplat;
varying vec2 vWorldUV;
vec3 terrainTex(sampler2D t, vec2 uv, float s1, float s2) {
  // two sampling scales kill the repeating-grid look
  return texture2D(t, uv * s1).rgb * 0.62 + texture2D(t, uv * s2).rgb * 0.38;
}`)
        .replace(
          '#include <map_fragment>',
          `{
    vec2 uv = vWorldUV;
    vec3 gG = terrainTex(tGrass, uv, 0.32, 0.083);
    vec3 gD = terrainTex(tDirt,  uv, 0.42, 0.11);
    vec3 gR = terrainTex(tStone, uv, 0.24, 0.062);
    // sand: dirt photo at a much larger scale, warmed — reads as beach sand
    vec3 gS = texture2D(tDirt, uv * 0.16).rgb * vec3(1.07, 0.98, 0.80) + texture2D(tDirt, uv * 0.05).rgb * vec3(0.9, 0.85, 0.7) * 0.35;
    gS *= 0.7;
    vec3 ground = gG * vSplat.x + gD * vSplat.y + gS * vSplat.z + gR * vSplat.w;
    diffuseColor.rgb = ground;
  }`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
    // biome tint modulates the photo ground (keeps meadow greens, road browns,
    // snow whites) without double-darkening
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vColor.rgb * 1.85, 0.74);`);
    };
  }

  setScatterSink(fn: (s: ChunkScatter) => void, onRemoved: (key: string) => void): void {
    this.scatterSink = fn;
    this.onChunkRemoved = onRemoved;
  }

  updateQuality(quality: QualityLevel): void {
    this.radius = QUALITY_PRESETS[quality].viewChunkRadius;
    // Resolution stays; only radius changes at runtime to avoid chunk churn.
  }

  /** Fase 13 — distancia de renderizado del jugador (chunks de 64 m,
   *  como Minecraft): se puede cambiar en caliente desde los ajustes. */
  setChunkRadius(radius: number): void {
    this.radius = Math.max(2, Math.min(12, Math.round(radius)));
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
    // Only the first two rings at full detail during loading; the rest
    // stream in (Fase 21 — far rings now build at LOD res 16: the loading
    // screen got faster too).
    const total = list.length;
    let done = 0;
    for (const c of list) {
      if (!this.chunks.has(this.keyOf(c.cx, c.cz))) {
        this.buildChunk(c.cx, c.cz, c.dist <= 2 ? this.res : 16);
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

    // Queue missing chunks (nearest first).
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
    // Fase 21 — TIME-SLICED building: the old flat "2 chunks per frame"
    // could land two 8-20 ms builds in ONE frame — the stutter the player
    // felt while exploring. Now the builder spends AT MOST ~4 ms of the
    // frame (always at least one chunk so distant travel still streams in);
    // the far ring simply pops in a frame or two later.
    if (this.buildQueue.length > 0) {
      this.buildQueue.sort((a, b) => a.dist - b.dist);
      const t0 = performance.now();
      for (let i = 0; i < this.buildQueue.length && i < 6; i++) {
        const c = this.buildQueue[i];
        // Fase 21 — chunk LOD: the near ring keeps full detail, far rings
        // build at res 16 (a quarter of the vertices: 5× fewer noise evals
        // per build, visually identical at 130+ m)
        const ring = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz));
        const res = ring <= 2 ? this.res : 16;
        this.buildChunk(c.cx, c.cz, res);
        if (performance.now() - t0 > 4) break;
      }
    } else {
      // upgrades: a far-LOD chunk entering the near ring rebuilds at full
      // detail (max one per frame — the same time-slice spirit)
      for (const [, chunk] of this.chunks) {
        if (
          chunk.res < this.res &&
          Math.abs(chunk.cx - ccx) <= 2 && Math.abs(chunk.cz - ccz) <= 2
        ) {
          this.sceneRef?.remove(chunk.mesh);
          chunk.mesh.geometry.dispose();
          this.chunks.delete(chunk.key);
          this.onChunkRemoved?.(chunk.key);
          this.buildChunk(chunk.cx, chunk.cz, this.res);
          break;
        }
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

  private buildChunk(cx: number, cz: number, res = this.res): void {
    if (!this.sceneRef) return;
    const key = this.keyOf(cx, cz);
    if (this.chunks.has(key)) return;

    const size = CHUNK_SIZE;
    const ox = cx * size;
    const oz = cz * size;
    const step = size / res;
    const vertCount = (res + 1) * (res + 1);
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices: number[] = [];

    const col: [number, number, number] = [0, 0, 0];
    const splat = new Float32Array(vertCount * 4);
    const sp: [number, number, number, number] = [1, 0, 0, 0];
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
        this.terrain.splatAt(x, z, h, slope, sp);
        splat[idx * 4] = sp[0];
        splat[idx * 4 + 1] = sp[1];
        splat[idx * 4 + 2] = sp[2];
        splat[idx * 4 + 3] = sp[3];
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
    geo.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
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

    if (worldDistFromCenter < 560 || ISLANDS.some((i) => Math.hypot(ox + size / 2 - i.x, oz + size / 2 - i.z) < i.radius * 1.25)) {
      // Fase 4: denser forests (was 34 attempts) with 6 species
      const attempts = 52;
      for (let a = 0; a < attempts; a++) {
        const x = ox + rand() * size;
        const z = oz + rand() * size;
        const h = this.terrain.height(x, z);
        const slope = this.terrain.slope(x, z, h);
        const fm = this.terrain.forestMask(x, z);
        if (this.terrain.canPlaceTree(x, z, h, slope) && rand() < fm * 0.94 + 0.035) {
          // Species: 0 oak · 1 pine · 2 birch · 3 maple · 4 spruce · 5 dead —
          // chosen by altitude, forest density and slope (biome feel).
          let species: number;
          if (h > 44) {
            // High ground: spruce dominate, some pines, lone dead snags
            species = rand() < 0.68 ? 4 : rand() < 0.85 ? 1 : 5;
          } else if (slope > 0.42) {
            // Rough ground: gnarled oaks and dead trees cling on
            species = rand() < 0.55 ? 0 : rand() < 0.6 ? 5 : 1;
          } else if (fm > 0.45) {
            // Dense forest: oak & maple with birch understory
            species = rand() < 0.42 ? 0 : rand() < 0.68 ? 3 : rand() < 0.88 ? 2 : 1;
          } else {
            // Open meadow: birch groves and lone oaks/maples
            species = rand() < 0.38 ? 2 : rand() < 0.72 ? 0 : 3;
          }
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

    this.chunks.set(key, { key, cx, cz, mesh, res, scatter });
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
