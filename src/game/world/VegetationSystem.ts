import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ChunkScatter } from './TerrainSystem';
import { TerrainHeight } from './TerrainHeight';
import { mulberry32, hash2, clamp } from '../core/MathUtils';

/** Shared time uniform injected into all wind-swaying materials. */
export const windTime = { value: 0 };

/** Patch a MeshStandardMaterial so its vertices sway with the wind. */
export function patchWind(material: THREE.Material, opts: { strength: number; minHeight: number; maxHeight: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float windPhase = instanceMatrix[3][0] * 0.08 + instanceMatrix[3][2] * 0.11;
          float swayK = smoothstep(${opts.minHeight.toFixed(2)}, ${opts.maxHeight.toFixed(2)}, position.y) * ${opts.strength.toFixed(3)};
          transformed.x += (sin(uTime * 1.35 + windPhase) + 0.5 * sin(uTime * 2.3 + windPhase * 1.7)) * 0.5 * swayK;
          transformed.z += (cos(uTime * 1.05 + windPhase * 1.3) + 0.4 * sin(uTime * 2.9 + windPhase)) * 0.4 * swayK;
        #endif
        `,
      );
  };
  material.customProgramCacheKey = () => `wind_${opts.strength}_${opts.minHeight}_${opts.maxHeight}`;
}

/** Set a vertex color attribute on a geometry (with subtle per-vertex noise). */
function colorize(geo: THREE.BufferGeometry, color: THREE.Color, variation = 0.05, seed = 1): void {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const v = 1 + (rand() - 0.5) * 2 * variation;
    colors[i * 3] = clamp(color.r * v, 0, 1);
    colors[i * 3 + 1] = clamp(color.g * v, 0, 1);
    colors[i * 3 + 2] = clamp(color.b * v, 0, 1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function transformGeo(geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rotY = 0, rotZ = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, rotZ));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  const g = geo.index ? geo.toNonIndexed() : geo;
  return g.applyMatrix4(m);
}

/** Build the three tree species as merged geometries with vertex colors. */
function buildTreeGeometries(): THREE.BufferGeometry[] {
  const rand = mulberry32(999);
  // --- Species 0: Oak ---
  const oakParts: THREE.BufferGeometry[] = [];
  const trunkCol = new THREE.Color(0x5a4028);
  const leafCols = [new THREE.Color(0x3e5a2a), new THREE.Color(0x4a6a30), new THREE.Color(0x35502a)];
  const t = new THREE.CylinderGeometry(0.20, 0.38, 2.8, 7);
  colorize(t, trunkCol, 0.08, 1);
  oakParts.push(transformGeo(t, 0, 1.4, 0, 1, 1, 1));
  // Branches
  for (let i = 0; i < 3; i++) {
    const b = new THREE.CylinderGeometry(0.08, 0.14, 1.6, 5);
    colorize(b, trunkCol, 0.08, 2 + i);
    const ang = (i / 3) * Math.PI * 2 + rand() * 0.5;
    oakParts.push(transformGeo(b, Math.cos(ang) * 0.7, 2.4 + rand() * 0.5, Math.sin(ang) * 0.7, 1, 1, 1, 0, 0.5 + rand() * 0.3));
  }
  // Canopy blobs
  const blobs: Array<[number, number, number, number]> = [
    [0, 4.1, 0, 1.9], [1.2, 3.5, 0.5, 1.35], [-1.05, 3.6, -0.6, 1.3], [0.3, 3.4, -1.2, 1.25], [-0.4, 3.7, 1.15, 1.2],
  ];
  blobs.forEach((b, i) => {
    const g = new THREE.IcosahedronGeometry(b[3], 1);
    colorize(g, leafCols[i % 3], 0.12, 10 + i);
    oakParts.push(transformGeo(g, b[0], b[1], b[2], 1.15, 0.92, 1.15, rand() * 3, rand() * 0.4));
  });
  const oak = mergeGeometries(oakParts)!;

  // --- Species 1: Pine ---
  const pineParts: THREE.BufferGeometry[] = [];
  const pineTrunk = new THREE.CylinderGeometry(0.14, 0.30, 2.0, 7);
  colorize(pineTrunk, new THREE.Color(0x4d3520), 0.08, 21);
  pineParts.push(transformGeo(pineTrunk, 0, 1.0, 0));
  const pineCols = [new THREE.Color(0x2a4a30), new THREE.Color(0x22513a), new THREE.Color(0x2f5533)];
  const tiers: Array<[number, number, number, number]> = [
    [2.15, 2.0, 2.6, 1.0], [3.55, 1.5, 2.2, 0.95], [4.75, 1.05, 1.9, 0.9], [5.7, 0.62, 1.5, 0.85],
  ];
  tiers.forEach((tier, i) => {
    const c = new THREE.ConeGeometry(tier[1], tier[2], 8);
    colorize(c, pineCols[i % 3], 0.1, 30 + i);
    pineParts.push(transformGeo(c, 0, tier[0], 0, 1, 1, 1, rand() * 3));
  });
  const pine = mergeGeometries(pineParts)!;

  // --- Species 2: Birch ---
  const birchParts: THREE.BufferGeometry[] = [];
  const btrunk = new THREE.CylinderGeometry(0.09, 0.17, 3.4, 6);
  colorize(btrunk, new THREE.Color(0xc9c4b4), 0.06, 41);
  birchParts.push(transformGeo(btrunk, 0, 1.7, 0));
  const bCols = [new THREE.Color(0x6f8f3a), new THREE.Color(0x87a344)];
  const bBlobs: Array<[number, number, number, number]> = [
    [0, 3.7, 0, 1.15], [0.6, 3.2, 0.3, 0.85], [-0.55, 3.35, -0.25, 0.8], [0.1, 4.4, -0.4, 0.75],
  ];
  bBlobs.forEach((b, i) => {
    const g = new THREE.IcosahedronGeometry(b[3], 1);
    colorize(g, bCols[i % 2], 0.13, 50 + i);
    birchParts.push(transformGeo(g, b[0], b[1], b[2], 1.1, 1.25, 1.1, rand() * 3));
  });
  const birch = mergeGeometries(birchParts)!;

  return [oak, pine, birch];
}

function buildRockGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rand = mulberry32(777);
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) * (0.8 + rand() * 0.4),
      pos.getY(i) * (0.55 + rand() * 0.3),
      pos.getZ(i) * (0.8 + rand() * 0.4),
    );
  }
  g.computeVertexNormals();
  colorize(g, new THREE.Color(0x6e6a62), 0.16, 60);
  return g;
}

function buildGrassGeometry(): THREE.BufferGeometry {
  // Three crossed blade fans, dark base → light tip.
  const parts: THREE.BufferGeometry[] = [];
  const rand = mulberry32(555);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(0.55, 0.55, 1, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(0x2e4a20);
    const tip = new THREE.Color(0x7fa050);
    for (let v = 0; v < pos.count; v++) {
      const t = (pos.getY(v) + 0.275) / 0.55;
      const c = base.clone().lerp(tip, t * t);
      colors[v * 3] = c.r * (0.9 + rand() * 0.2);
      colors[v * 3 + 1] = c.g * (0.9 + rand() * 0.2);
      colors[v * 3 + 2] = c.b * (0.9 + rand() * 0.2);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.translate(0, 0.275, 0);
    parts.push(transformGeo(g, 0, 0, 0, 1, 1, 1, (i / 3) * Math.PI));
  }
  return mergeGeometries(parts)!;
}

interface TreeInstance { species: number; matrix: THREE.Matrix4; color: THREE.Color }
interface RockInstance { matrix: THREE.Matrix4; color: THREE.Color }

interface ChunkVegetation {
  trees: TreeInstance[];
  rocks: RockInstance[];
  grass?: THREE.InstancedMesh;
  near?: boolean;
}

/** Vegetation is instanced per CLUSTER (2×2 chunks of 64 m = 128 m cell) so the
 *  renderer can frustum-cull distant geometry — the old global instanced meshes
 *  drew every streamed tree every frame (major GPU cost when sailing). */
const CLUSTER_CHUNKS = 2;
const CLUSTER_SIZE = 64 * CLUSTER_CHUNKS;

interface ClusterMeshes {
  trees: THREE.InstancedMesh[];
  rock: THREE.InstancedMesh;
}

interface ClusterData {
  key: string;
  ccx: number;
  ccz: number;
  chunks: Set<string>;
  meshes: ClusterMeshes | null;
  dirty: boolean;
}

export class VegetationSystem {
  private treeGeos: THREE.BufferGeometry[];
  private treeMat: THREE.MeshStandardMaterial;
  private rockGeo: THREE.BufferGeometry;
  private rockMat: THREE.MeshStandardMaterial;
  private speciesCapacity = 170; // 4 chunks × ~34 attempts headroom
  private rockCapacity = 44;

  private chunkData = new Map<string, ChunkVegetation>();
  private clusters = new Map<string, ClusterData>();
  private grassDensity: number;
  private sceneRef: THREE.Scene;

  private treeColliderSink?: (x: number, z: number, r: number, key: string) => void;
  private treeColliderRemove?: (prefix: string) => void;

  constructor(
    private terrain: TerrainHeight,
    grassDensity: number,
    scene: THREE.Scene,
  ) {
    this.grassDensity = grassDensity;
    this.sceneRef = scene;
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    patchWind(this.treeMat, { strength: 0.10, minHeight: 2.0, maxHeight: 6.0 });
    this.treeGeos = buildTreeGeometries();

    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 });
    this.rockGeo = buildRockGeometry();
  }

  setColliderSinks(
    add: (x: number, z: number, r: number, key: string) => void,
    removePrefix: (prefix: string) => void,
  ): void {
    this.treeColliderSink = add;
    this.treeColliderRemove = removePrefix;
  }

  setGrassDensity(d: number): void {
    if (Math.abs(d - this.grassDensity) < 0.001) return;
    this.grassDensity = d;
    // Rebuild existing grass right away so the change is visible: drop all
    // current patches and re-flag them so refreshGrassNear() recreates the
    // near ring at the new density this same frame.
    for (const data of this.chunkData.values()) {
      if (data.grass) {
        this.sceneRef.remove(data.grass);
        data.grass.geometry.dispose();
        data.grass.dispose();
        data.grass = undefined;
      }
      if (data.near) data.near = false;
    }
    this.grassDirty = true;
  }

  private grassDirty = false;

  onChunkScatter(scatter: ChunkScatter): void {
    const trees: TreeInstance[] = [];
    const rocks: RockInstance[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euro = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    for (const t of scatter.trees) {
      euro.set(0, t.rot, 0);
      q.setFromEuler(euro);
      pos.set(t.x, t.y - 0.15, t.z);
      scl.set(t.scale, t.scale * (0.9 + (t.x % 1) * 0.25), t.scale);
      m.compose(pos, q, scl);
      const c = new THREE.Color().setHSL(0.28 + ((t.z * 13.7) % 1) * 0.04, 0.32, 0.5 + ((t.x * 7.3) % 1) * 0.08);
      trees.push({ species: t.species, matrix: m.clone(), color: c });
      this.treeColliderSink?.(t.x, t.z, 0.42 * t.scale, `tree:${scatter.key}:${trees.length}`);
    }
    for (const r of scatter.rocks) {
      euro.set(0, r.rot, 0);
      q.setFromEuler(euro);
      pos.set(r.x, r.y - r.scale * 0.35, r.z);
      scl.set(r.scale, r.scale, r.scale);
      m.compose(pos, q, scl);
      rocks.push({ matrix: m.clone(), color: new THREE.Color().setHSL(0.08, 0.05, 0.42 + ((r.x * 3.1) % 1) * 0.12) });
    }
    this.chunkData.set(scatter.key, { trees, rocks });
    this.markClusterDirty(scatter.cx, scatter.cz, scatter.key);
  }

  onChunkRemoved(key: string): void {
    const data = this.chunkData.get(key);
    if (!data) return;
    if (data.grass) {
      this.sceneRef.remove(data.grass);
      data.grass.geometry.dispose();
      data.grass.dispose();
    }
    this.chunkData.delete(key);
    this.treeColliderRemove?.(`tree:${key}:`);
    this.markClusterDirtyByKey(key);
  }

  // ------------------------------------------------------------- clusters

  private clusterKey(ccx: number, ccz: number): string {
    return `${ccx},${ccz}`;
  }

  private markClusterDirty(cx: number, cz: number, chunkKey: string): void {
    const ccx = Math.floor(cx / CLUSTER_CHUNKS);
    const ccz = Math.floor(cz / CLUSTER_CHUNKS);
    const key = this.clusterKey(ccx, ccz);
    let cluster = this.clusters.get(key);
    if (!cluster) {
      cluster = { key, ccx, ccz, chunks: new Set(), meshes: null, dirty: true };
      this.clusters.set(key, cluster);
    }
    cluster.chunks.add(chunkKey);
    cluster.dirty = true;
  }

  private markClusterDirtyByKey(chunkKey: string): void {
    const [cx, cz] = chunkKey.split(',').map(Number);
    const ccx = Math.floor(cx / CLUSTER_CHUNKS);
    const ccz = Math.floor(cz / CLUSTER_CHUNKS);
    const key = this.clusterKey(ccx, ccz);
    const cluster = this.clusters.get(key);
    if (!cluster) return;
    cluster.chunks.delete(chunkKey);
    cluster.dirty = true;
    if (cluster.chunks.size === 0 && cluster.meshes) {
      this.disposeClusterMeshes(cluster.meshes);
      cluster.meshes = null;
      this.clusters.delete(key);
    }
  }

  private disposeClusterMeshes(meshes: ClusterMeshes): void {
    for (const mesh of meshes.trees) {
      this.sceneRef.remove(mesh);
      mesh.dispose();
    }
    this.sceneRef.remove(meshes.rock);
    meshes.rock.dispose();
  }

  /** (Re)build the instanced meshes of one cluster from its member chunks. */
  private buildCluster(cluster: ClusterData): void {
    if (!cluster.meshes) {
      const trees: THREE.InstancedMesh[] = [];
      for (let s = 0; s < 3; s++) {
        const mesh = new THREE.InstancedMesh(this.treeGeos[s], this.treeMat, this.speciesCapacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.count = 0;
        mesh.frustumCulled = true; // per-cluster bounding sphere → real culling
        this.sceneRef.add(mesh);
        trees.push(mesh);
      }
      const rock = new THREE.InstancedMesh(this.rockGeo, this.rockMat, this.rockCapacity);
      rock.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.count = 0;
      rock.frustumCulled = true;
      this.sceneRef.add(rock);
      cluster.meshes = { trees, rock };
    }
    const meshes = cluster.meshes!;
    const speciesCount = [0, 0, 0];
    let rockCount = 0;
    for (const chunkKey of cluster.chunks) {
      const data = this.chunkData.get(chunkKey);
      if (!data) continue;
      for (const t of data.trees) {
        if (speciesCount[t.species] >= this.speciesCapacity) continue;
        meshes.trees[t.species].setMatrixAt(speciesCount[t.species], t.matrix);
        meshes.trees[t.species].setColorAt(speciesCount[t.species], t.color);
        speciesCount[t.species]++;
      }
      for (const r of data.rocks) {
        if (rockCount >= this.rockCapacity) continue;
        meshes.rock.setMatrixAt(rockCount, r.matrix);
        meshes.rock.setColorAt(rockCount, r.color);
        rockCount++;
      }
    }
    meshes.trees.forEach((mesh, i) => {
      mesh.count = speciesCount[i];
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (mesh.count > 0) mesh.computeBoundingSphere();
    });
    meshes.rock.count = rockCount;
    meshes.rock.visible = rockCount > 0;
    meshes.rock.instanceMatrix.needsUpdate = true;
    if (meshes.rock.instanceColor) meshes.rock.instanceColor.needsUpdate = true;
    if (rockCount > 0) meshes.rock.computeBoundingSphere();
    cluster.dirty = false;
  }

  // --------------------------------------------------------------- grass

  /** Re-evaluate which chunks are 'near' (grass ring) after player moves. */
  refreshGrassNear(px: number, pz: number, nearRadius = 2): void {
    const pcx = Math.floor(px / 64);
    const pcz = Math.floor(pz / 64);
    for (const [key, data] of this.chunkData) {
      const [cx, cz] = key.split(',').map(Number);
      const isNear = Math.abs(cx - pcx) <= nearRadius && Math.abs(cz - pcz) <= nearRadius;
      if (data.near === isNear && !(this.grassDirty && isNear)) continue;
      data.near = isNear;
      if (isNear && !data.grass && this.grassDensity > 0.01) {
        data.grass = this.buildGrassForChunk({ key, cx, cz, trees: [], rocks: [], near: true });
        this.sceneRef.add(data.grass);
      } else if (!isNear && data.grass) {
        this.sceneRef.remove(data.grass);
        data.grass.geometry.dispose();
        data.grass.dispose();
        data.grass = undefined;
      }
    }
    this.grassDirty = false;
  }

  private grassMaterial?: THREE.MeshStandardMaterial;

  private buildGrassForChunk(scatter: ChunkScatter): THREE.InstancedMesh {
    if (!this.grassMaterial) {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      });
      patchWind(mat, { strength: 0.14, minHeight: 0.0, maxHeight: 0.4 });
      this.grassMaterial = mat;
    }
    const count = Math.round(110 * this.grassDensity);
    const geo = buildGrassGeometry();
    const mesh = new THREE.InstancedMesh(geo, this.grassMaterial, count);
    const rand = mulberry32(hash2(scatter.cx * 3 + 11, scatter.cz * 7 + 3));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    const terrainCol: [number, number, number] = [0, 0, 0];
    let placed = 0;
    const ox = scatter.cx * 64;
    const oz = scatter.cz * 64;
    for (let i = 0; i < count * 2 && placed < count; i++) {
      const x = ox + rand() * 64;
      const z = oz + rand() * 64;
      const h = this.terrain.height(x, z);
      if (h < 2.2 || h > 56) continue;
      const slope = this.terrain.slope(x, z, h);
      if (slope > 0.5) continue;
      q.setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0));
      pos.set(x, h - 0.03, z);
      const s = 0.7 + rand() * 0.7;
      scl.set(s, s * (0.8 + rand() * 0.5), s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(placed, m);
      this.terrain.colorAt(x, z, h, slope, terrainCol);
      // Slightly lighter than ground + occasional flower tint
      const flower = rand() < 0.045;
      if (flower) {
        const hues = [0.12, 0.0, 0.65, 0.9];
        col.setHSL(hues[Math.floor(rand() * 4)], 0.65, 0.6);
      } else {
        col.setRGB(
          clamp(terrainCol[0] * 1.35 + 0.08, 0, 1),
          clamp(terrainCol[1] * 1.3 + 0.1, 0, 1),
          clamp(terrainCol[2] * 1.2 + 0.05, 0, 1),
        );
      }
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  // -------------------------------------------------------------- update

  /** Rebuild at most 2 dirty clusters per frame (avoids hitches while streaming). */
  update(): void {
    let budget = 2;
    for (const cluster of this.clusters.values()) {
      if (!cluster.dirty) continue;
      this.buildCluster(cluster);
      budget--;
      if (budget <= 0) break;
    }
  }

  dispose(): void {
    for (const cluster of this.clusters.values()) {
      if (cluster.meshes) this.disposeClusterMeshes(cluster.meshes);
    }
    this.clusters.clear();
    this.treeGeos.forEach((g) => g.dispose());
    this.rockGeo.dispose();
    this.treeMat.dispose();
    this.rockMat.dispose();
    this.grassMaterial?.dispose();
    for (const data of this.chunkData.values()) {
      if (data.grass) {
        data.grass.parent?.remove(data.grass);
        data.grass.geometry.dispose();
        data.grass.dispose();
      }
    }
    this.chunkData.clear();
  }

  /** Debug/stats: number of active clusters & meshes. */
  get stats(): { clusters: number; drawCalls: number } {
    let meshes = 0;
    for (const cluster of this.clusters.values()) {
      if (!cluster.meshes) continue;
      meshes += 1 + cluster.meshes.trees.length;
    }
    return { clusters: this.clusters.size, drawCalls: meshes };
  }
}
