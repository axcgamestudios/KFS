import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ChunkScatter } from './TerrainSystem';
import { TerrainHeight } from './TerrainHeight';
import { mulberry32, hash2, clamp } from '../core/MathUtils';
import { distToRoads } from './WorldConfig';

/** Shared time uniform injected into all wind-swaying materials. */
export const windTime = { value: 0 };
/** Fase 4 — global wind gust multiplier (weather-driven). */
export const windGust = { value: 1 };

/** Patch a MeshStandardMaterial so its vertices sway with the wind. */
export function patchWind(material: THREE.Material, opts: { strength: number; minHeight: number; maxHeight: number }): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.uniforms.uWindStrength = windGust;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWindStrength;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float windPhase = instanceMatrix[3][0] * 0.08 + instanceMatrix[3][2] * 0.11;
          float swayK = smoothstep(${opts.minHeight.toFixed(2)}, ${opts.maxHeight.toFixed(2)}, position.y) * ${opts.strength.toFixed(3)} * uWindStrength;
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

/**
 * Build the SIX tree species as merged geometries with vertex colors.
 * 0 oak · 1 pine · 2 birch · 3 maple (textured, two material groups) ·
 * 4 spruce · 5 dead/ancient
 */
function buildTreeGeometries(): { geos: THREE.BufferGeometry[]; mapleParts: [THREE.BufferGeometry, THREE.BufferGeometry] } {
  const rand = mulberry32(999);
  const geos: THREE.BufferGeometry[] = [];

  // --- Species 0: Oak ---
  const oakParts: THREE.BufferGeometry[] = [];
  const trunkCol = new THREE.Color(0x5a4028);
  const leafCols = [new THREE.Color(0x3e5a2a), new THREE.Color(0x4a6a30), new THREE.Color(0x35502a)];
  const t = new THREE.CylinderGeometry(0.20, 0.38, 2.8, 7);
  colorize(t, trunkCol, 0.08, 1);
  oakParts.push(transformGeo(t, 0, 1.4, 0, 1, 1, 1));
  for (let i = 0; i < 3; i++) {
    const b = new THREE.CylinderGeometry(0.08, 0.14, 1.6, 5);
    colorize(b, trunkCol, 0.08, 2 + i);
    const ang = (i / 3) * Math.PI * 2 + rand() * 0.5;
    oakParts.push(transformGeo(b, Math.cos(ang) * 0.7, 2.4 + rand() * 0.5, Math.sin(ang) * 0.7, 1, 1, 1, 0, 0.5 + rand() * 0.3));
  }
  const blobs: Array<[number, number, number, number]> = [
    [0, 4.1, 0, 1.9], [1.2, 3.5, 0.5, 1.35], [-1.05, 3.6, -0.6, 1.3], [0.3, 3.4, -1.2, 1.25], [-0.4, 3.7, 1.15, 1.2],
  ];
  blobs.forEach((b, i) => {
    const g = new THREE.IcosahedronGeometry(b[3], 1);
    colorize(g, leafCols[i % 3], 0.12, 10 + i);
    oakParts.push(transformGeo(g, b[0], b[1], b[2], 1.15, 0.92, 1.15, rand() * 3, rand() * 0.4));
  });
  geos.push(mergeGeometries(oakParts)!);

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
  geos.push(mergeGeometries(pineParts)!);

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
  geos.push(mergeGeometries(birchParts)!);

  // --- Species 3: Maple (built as two parts for textured materials) ---
  // Elegant trunk with forking branches (bark material group)
  const mapleTrunkParts: THREE.BufferGeometry[] = [];
  const mt = new THREE.CylinderGeometry(0.16, 0.42, 3.0, 8);
  colorize(mt, new THREE.Color(0x9a8574), 0.05, 61);
  mapleTrunkParts.push(transformGeo(mt, 0, 1.5, 0));
  for (let i = 0; i < 4; i++) {
    const b = new THREE.CylinderGeometry(0.06, 0.13, 2.0, 6);
    colorize(b, new THREE.Color(0x9a8574), 0.06, 62 + i);
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    mapleTrunkParts.push(
      transformGeo(b, Math.cos(ang) * 0.85, 3.4 + rand() * 0.6, Math.sin(ang) * 0.85, 1, 1, 1, 0, 0.7 + rand() * 0.25),
    );
  }
  const mapleTrunkGeo = mergeGeometries(mapleTrunkParts)!;
  // Broad canopy blobs (leaf material group)
  const mapleCanopyParts: THREE.BufferGeometry[] = [];
  const mCols = [new THREE.Color(0xd8a83c), new THREE.Color(0xc98f2e), new THREE.Color(0xe0b84e), new THREE.Color(0xb97f28)];
  const mBlobs: Array<[number, number, number, number]> = [
    [0, 5.2, 0, 1.85], [1.35, 4.4, 0.6, 1.3], [-1.2, 4.6, -0.55, 1.25], [0.45, 4.2, -1.3, 1.2], [-0.5, 4.5, 1.25, 1.15], [0.1, 6.2, 0.2, 1.05],
  ];
  mBlobs.forEach((b, i) => {
    const g = new THREE.IcosahedronGeometry(b[3], 1);
    colorize(g, mCols[i % 4], 0.1, 70 + i);
    mapleCanopyParts.push(transformGeo(g, b[0], b[1], b[2], 1.12, 0.9, 1.12, rand() * 3, rand() * 0.3));
  });
  const mapleCanopyGeo = mergeGeometries(mapleCanopyParts)!;
  geos.push(mergeGeometries([mapleTrunkGeo, mapleCanopyGeo])!);

  // --- Species 4: Spruce (tall, narrow, dark — high altitude) ---
  const spruceParts: THREE.BufferGeometry[] = [];
  const sTrunk = new THREE.CylinderGeometry(0.12, 0.26, 2.6, 7);
  colorize(sTrunk, new THREE.Color(0x42301e), 0.08, 81);
  spruceParts.push(transformGeo(sTrunk, 0, 1.3, 0));
  const sCols = [new THREE.Color(0x1d3a2a), new THREE.Color(0x24452e), new THREE.Color(0x1a3626)];
  const sTiers: Array<[number, number, number, number]> = [
    [2.8, 1.75, 2.5, 1.0], [4.3, 1.32, 2.1, 0.95], [5.65, 0.95, 1.75, 0.9], [6.85, 0.6, 1.4, 0.88], [7.85, 0.32, 1.05, 0.85],
  ];
  sTiers.forEach((tier, i) => {
    const c = new THREE.ConeGeometry(tier[1], tier[2], 8);
    colorize(c, sCols[i % 3], 0.09, 85 + i);
    spruceParts.push(transformGeo(c, 0, tier[0], 0, 1, 1, 1, rand() * 3));
  });
  geos.push(mergeGeometries(spruceParts)!);

  // --- Species 5: Dead / ancient tree (bare branches) ---
  const deadParts: THREE.BufferGeometry[] = [];
  const dCol = new THREE.Color(0x54483c);
  const dTrunk = new THREE.CylinderGeometry(0.16, 0.40, 3.6, 7);
  colorize(dTrunk, dCol, 0.14, 91);
  deadParts.push(transformGeo(dTrunk, 0, 1.8, 0, 1, 1, 1, 0, 0.06));
  for (let i = 0; i < 6; i++) {
    const len = 1.2 + rand() * 1.3;
    const b = new THREE.CylinderGeometry(0.03, 0.10, len, 5);
    colorize(b, dCol, 0.16, 92 + i);
    const ang = (i / 6) * Math.PI * 2 + rand() * 0.8;
    const h = 2.2 + rand() * 1.6;
    deadParts.push(transformGeo(
      b, Math.cos(ang) * 0.5, h, Math.sin(ang) * 0.5, 1, 1, 1, ang, 0.7 + rand() * 0.5,
    ));
    // secondary twig
    if (rand() < 0.7) {
      const tb = new THREE.CylinderGeometry(0.02, 0.05, len * 0.6, 4);
      colorize(tb, dCol, 0.16, 100 + i);
      deadParts.push(transformGeo(
        tb, Math.cos(ang + 0.5) * 0.9, h + len * 0.42, Math.sin(ang + 0.5) * 0.9, 1, 1, 1, ang + 0.6, 0.4 + rand() * 0.4,
      ));
    }
  }
  geos.push(mergeGeometries(deadParts)!);

  return { geos, mapleParts: [mapleTrunkGeo, mapleCanopyGeo] };
}

/** Average canopy color per species (billboard tint & minimap). */
export const TREE_BILLBOARD_COLOR = [
  new THREE.Color(0x44632e), // oak
  new THREE.Color(0x274c33), // pine
  new THREE.Color(0x76923f), // birch
  new THREE.Color(0xc99a34), // maple
  new THREE.Color(0x1f3d2a), // spruce
  new THREE.Color(0x5c5044), // dead
];

/** Procedural billboard texture: a soft tree silhouette (impostor LOD). */
function makeBillboardTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  // Trunk
  ctx.fillStyle = 'rgba(70,52,36,0.95)';
  ctx.fillRect(60, 70, 8, 56);
  // Canopy blobs (layered, soft edges via radial gradients)
  const blob = (x: number, y: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.75, `rgba(255,255,255,${a * 0.85})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(64, 46, 40, 0.95);
  blob(40, 58, 26, 0.85);
  blob(88, 58, 26, 0.85);
  blob(64, 26, 24, 0.9);
  blob(46, 38, 20, 0.8);
  blob(82, 38, 20, 0.8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Crossed-plane impostor geometry (~2 tris × 2 planes per tree). */
function buildBillboardGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.PlaneGeometry(7.5, 10.5);
    g.translate(0, 5.25, 0);
    parts.push(transformGeo(g, 0, 0, 0, 1, 1, 1, (i / 2) * Math.PI));
  }
  return mergeGeometries(parts)!;
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

/** Denser grass blade geometry: 4 crossed fans with curved tips. */
function buildGrassGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rand = mulberry32(555);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.PlaneGeometry(0.6, 0.62, 1, 3);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(0x2e4a20);
    const tip = new THREE.Color(0x86a558);
    for (let v = 0; v < pos.count; v++) {
      const t = (pos.getY(v) + 0.31) / 0.62;
      const c = base.clone().lerp(tip, t * t);
      colors[v * 3] = c.r * (0.9 + rand() * 0.2);
      colors[v * 3 + 1] = c.g * (0.9 + rand() * 0.2);
      colors[v * 3 + 2] = c.b * (0.9 + rand() * 0.2);
      // Slight outward curve at the tip
      if (t > 0.8) pos.setX(v, pos.getX(v) * (1 + (t - 0.8) * 1.6));
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.translate(0, 0.31, 0);
    parts.push(transformGeo(g, 0, 0, 0, 1, 1, 1, (i / 4) * Math.PI + rand() * 0.4));
  }
  return mergeGeometries(parts)!;
}

interface TreeInstance { species: number; matrix: THREE.Matrix4; color: THREE.Color }
interface RockInstance { matrix: THREE.Matrix4; color: THREE.Color }

interface ChunkVegetation {
  trees: TreeInstance[];
  rocks: RockInstance[];
  grass?: THREE.InstancedMesh;
  near?: number; // 0 = none, 1 = full density ring, 2.. = sparse rings
}

/** Vegetation is instanced per CLUSTER (2×2 chunks of 64 m = 128 m cell) so the
 *  renderer can frustum-cull distant geometry. */
const CLUSTER_CHUNKS = 2;
const CLUSTER_SIZE = 64 * CLUSTER_CHUNKS;
/** Beyond this distance clusters swap to billboard impostors. */
const LOD_IMPOSTOR_DIST = 250;

interface ClusterMeshes {
  trees: THREE.InstancedMesh[];
  billboards: THREE.InstancedMesh;
  rock: THREE.InstancedMesh;
  centerX: number;
  centerZ: number;
  /** 0 = full detail, 1 = impostors. */
  lod: number;
}

interface ClusterData {
  key: string;
  ccx: number;
  ccz: number;
  chunks: Set<string>;
  meshes: ClusterMeshes | null;
  dirty: boolean;
  /** All instances (kept for billboard rebuilds). */
  allTrees: TreeInstance[];
}

const SPECIES_COUNT = 6;

export class VegetationSystem {
  private treeGeos: THREE.BufferGeometry[];
  private mapleTrunkGeo: THREE.BufferGeometry;
  private mapleCanopyGeo: THREE.BufferGeometry;
  private treeMat: THREE.MeshStandardMaterial;
  private mapleBarkMat: THREE.MeshStandardMaterial;
  private mapleLeafMat: THREE.MeshStandardMaterial;
  private billboardMat: THREE.MeshStandardMaterial;
  private billboardGeo: THREE.BufferGeometry;
  private rockGeo: THREE.BufferGeometry;
  private rockMat: THREE.MeshStandardMaterial;
  private speciesCapacity = 300;
  private rockCapacity = 44;
  private billboardCapacity = 1300;

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
    mapleTextures?: { bark: THREE.Texture; leaf: THREE.Texture },
  ) {
    this.grassDensity = grassDensity;
    this.sceneRef = scene;

    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    patchWind(this.treeMat, { strength: 0.10, minHeight: 2.0, maxHeight: 6.0 });

    // Maple: real textures from the asset repository
    if (mapleTextures) {
      const bark = mapleTextures.bark.clone();
      bark.repeat.set(2, 2);
      bark.needsUpdate = true;
      const leaf = mapleTextures.leaf.clone();
      leaf.repeat.set(3, 3);
      leaf.needsUpdate = true;
      this.mapleBarkMat = new THREE.MeshStandardMaterial({
        map: bark, vertexColors: true, roughness: 0.92, metalness: 0,
      });
      this.mapleLeafMat = new THREE.MeshStandardMaterial({
        map: leaf, vertexColors: true, roughness: 0.85, metalness: 0,
      });
    } else {
      this.mapleBarkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
      this.mapleLeafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    }
    patchWind(this.mapleBarkMat, { strength: 0.07, minHeight: 2.5, maxHeight: 6.5 });
    patchWind(this.mapleLeafMat, { strength: 0.13, minHeight: 3.5, maxHeight: 7.0 });

    // Billboard impostor material (alpha-tested)
    this.billboardMat = new THREE.MeshStandardMaterial({
      map: makeBillboardTexture(),
      transparent: true,
      alphaTest: 0.32,
      depthWrite: true,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.billboardGeo = buildBillboardGeometry();

    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 });
    this.rockGeo = buildRockGeometry();

    const built = buildTreeGeometries();
    this.treeGeos = built.geos;
    this.mapleTrunkGeo = built.mapleParts[0];
    this.mapleCanopyGeo = built.mapleParts[1];
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
    for (const data of this.chunkData.values()) {
      if (data.grass) {
        this.sceneRef.remove(data.grass);
        data.grass.geometry.dispose();
        data.grass.dispose();
        data.grass = undefined;
      }
      if (data.near) data.near = 0;
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
      cluster = { key, ccx, ccz, chunks: new Set(), meshes: null, dirty: true, allTrees: [] };
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
    this.sceneRef.remove(meshes.billboards);
    meshes.billboards.dispose();
    this.sceneRef.remove(meshes.rock);
    meshes.rock.dispose();
  }

  /** (Re)build the instanced meshes of one cluster from its member chunks. */
  private buildCluster(cluster: ClusterData): void {
    if (!cluster.meshes) {
      const trees: THREE.InstancedMesh[] = [];
      for (let s = 0; s < SPECIES_COUNT; s++) {
        let mesh: THREE.InstancedMesh;
        if (s === 3) {
          // Maple: two material groups (bark trunk / leaf canopy)
          const geo = this.treeGeos[3];
          const trunkCount = this.mapleTrunkGeo.attributes.position.count;
          const canopyCount = this.mapleCanopyGeo.attributes.position.count;
          geo.clearGroups();
          geo.addGroup(0, trunkCount, 0);
          geo.addGroup(trunkCount, canopyCount, 1);
          mesh = new THREE.InstancedMesh(
            geo, [this.mapleBarkMat, this.mapleLeafMat], this.speciesCapacity,
          );
        } else {
          mesh = new THREE.InstancedMesh(this.treeGeos[s], this.treeMat, this.speciesCapacity);
        }
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.count = 0;
        mesh.frustumCulled = true;
        this.sceneRef.add(mesh);
        trees.push(mesh);
      }
      const billboards = new THREE.InstancedMesh(this.billboardGeo, this.billboardMat, this.billboardCapacity);
      billboards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      billboards.castShadow = false;
      billboards.receiveShadow = false;
      billboards.count = 0;
      billboards.frustumCulled = true;
      billboards.visible = false;
      this.sceneRef.add(billboards);
      const rock = new THREE.InstancedMesh(this.rockGeo, this.rockMat, this.rockCapacity);
      rock.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.count = 0;
      rock.frustumCulled = true;
      this.sceneRef.add(rock);
      cluster.meshes = {
        trees, billboards, rock,
        centerX: (cluster.ccx + 0.5) * CLUSTER_SIZE,
        centerZ: (cluster.ccz + 0.5) * CLUSTER_SIZE,
        lod: 0,
      };
    }
    const meshes = cluster.meshes!;
    const speciesCount = new Array(SPECIES_COUNT).fill(0);
    let rockCount = 0;
    const allTrees: TreeInstance[] = [];
    for (const chunkKey of cluster.chunks) {
      const data = this.chunkData.get(chunkKey);
      if (!data) continue;
      for (const t of data.trees) {
        allTrees.push(t);
        if (speciesCount[t.species] < this.speciesCapacity) {
          meshes.trees[t.species].setMatrixAt(speciesCount[t.species], t.matrix);
          meshes.trees[t.species].setColorAt(speciesCount[t.species], t.color);
          speciesCount[t.species]++;
        }
      }
      for (const r of data.rocks) {
        if (rockCount >= this.rockCapacity) continue;
        meshes.rock.setMatrixAt(rockCount, r.matrix);
        meshes.rock.setColorAt(rockCount, r.color);
        rockCount++;
      }
    }
    cluster.allTrees = allTrees;
    meshes.trees.forEach((mesh, i) => {
      mesh.count = speciesCount[i];
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (mesh.count > 0) mesh.computeBoundingSphere();
    });
    // Billboard impostors: one plane per tree (used when far away)
    let bb = 0;
    for (const t of allTrees) {
      if (bb >= this.billboardCapacity) break;
      meshes.billboards.setMatrixAt(bb, t.matrix);
      meshes.billboards.setColorAt(bb, TREE_BILLBOARD_COLOR[t.species] ?? TREE_BILLBOARD_COLOR[0]);
      bb++;
    }
    meshes.billboards.count = bb;
    meshes.billboards.instanceMatrix.needsUpdate = true;
    if (meshes.billboards.instanceColor) meshes.billboards.instanceColor.needsUpdate = true;
    if (bb > 0) meshes.billboards.computeBoundingSphere();
    meshes.rock.count = rockCount;
    meshes.rock.visible = rockCount > 0;
    meshes.rock.instanceMatrix.needsUpdate = true;
    if (meshes.rock.instanceColor) meshes.rock.instanceColor.needsUpdate = true;
    if (rockCount > 0) meshes.rock.computeBoundingSphere();
    cluster.dirty = false;
  }

  // --------------------------------------------------------------- grass

  /** Re-evaluate the grass rings after the player moves. */
  refreshGrassNear(px: number, pz: number): void {
    const pcx = Math.floor(px / 64);
    const pcz = Math.floor(pz / 64);
    for (const [key, data] of this.chunkData) {
      const [cx, cz] = key.split(',').map(Number);
      const ring = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
      // Ring 0-1: full density · ring 2: 45% · ring 3: sparse
      const ringLevel = ring <= 1 ? 1 : ring === 2 ? 2 : ring === 3 ? 3 : 0;
      if (data.near === ringLevel && !(this.grassDirty && ringLevel > 0)) continue;
      data.near = ringLevel;
      if (ringLevel > 0 && !data.grass && this.grassDensity > 0.01) {
        data.grass = this.buildGrassForChunk({ key, cx, cz, trees: [], rocks: [], near: true }, ringLevel);
        this.sceneRef.add(data.grass);
      } else if (ringLevel === 0 && data.grass) {
        this.sceneRef.remove(data.grass);
        data.grass.geometry.dispose();
        data.grass.dispose();
        data.grass = undefined;
      } else if (data.grass && ringLevel > 0) {
        // Density of an existing patch only ever refreshes on rebuild
        // (moving between ring 2↔3 keeps the old patch — cheap and stable).
      }
    }
    this.grassDirty = false;
  }

  private grassMaterial?: THREE.MeshStandardMaterial;

  private buildGrassForChunk(scatter: ChunkScatter, ringLevel: number): THREE.InstancedMesh {
    if (!this.grassMaterial) {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
      });
      patchWind(mat, { strength: 0.15, minHeight: 0.0, maxHeight: 0.42 });
      this.grassMaterial = mat;
    }
    const ringMul = ringLevel === 1 ? 1 : ringLevel === 2 ? 0.45 : 0.22;
    const count = Math.round(300 * this.grassDensity * ringMul);
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
    for (let i = 0; i < count * 2.2 && placed < count; i++) {
      const x = ox + rand() * 64;
      const z = oz + rand() * 64;
      const h = this.terrain.height(x, z);
      if (h < 2.2 || h > 56) continue;
      const slope = this.terrain.slope(x, z, h);
      if (slope > 0.5) continue;
      // Fase 4: keep grass off roads and out of buildings/compounds
      if (distToRoads(x, z) < 2.3) continue;
      const dv = Math.hypot(x - 20, z - 175);
      if (dv < 55) continue; // village
      const dc = Math.hypot(x - 60, z - -55);
      if (dc < 58) continue; // castle
      q.setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0));
      pos.set(x, h - 0.03, z);
      const s = 0.7 + rand() * 0.75;
      scl.set(s, s * (0.8 + rand() * 0.55), s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(placed, m);
      this.terrain.colorAt(x, z, h, slope, terrainCol);
      const flower = rand() < 0.05;
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

  /** Rebuild at most 2 dirty clusters per frame + LOD swap by distance. */
  update(px = NaN, pz = NaN): void {
    let budget = 2;
    for (const cluster of this.clusters.values()) {
      if (!cluster.dirty) continue;
      this.buildCluster(cluster);
      budget--;
      if (budget <= 0) break;
    }
    // LOD: full detail near, billboards far (Fase 4)
    if (!Number.isNaN(px)) {
      for (const cluster of this.clusters.values()) {
        const meshes = cluster.meshes;
        if (!meshes) continue;
        const d = Math.hypot(meshes.centerX - px, meshes.centerZ - pz);
        const wantLod = d > LOD_IMPOSTOR_DIST ? 1 : 0;
        if (wantLod !== meshes.lod) {
          meshes.lod = wantLod;
          for (const t of meshes.trees) t.visible = wantLod === 0 && t.count > 0;
          meshes.billboards.visible = wantLod === 1 && meshes.billboards.count > 0;
        }
      }
    }
  }

  dispose(): void {
    for (const cluster of this.clusters.values()) {
      if (cluster.meshes) this.disposeClusterMeshes(cluster.meshes);
    }
    this.clusters.clear();
    this.treeGeos.forEach((g) => g.dispose());
    this.mapleTrunkGeo.dispose();
    this.mapleCanopyGeo.dispose();
    this.billboardGeo.dispose();
    this.rockGeo.dispose();
    this.treeMat.dispose();
    this.mapleBarkMat.dispose();
    this.mapleLeafMat.dispose();
    (this.billboardMat.map as THREE.Texture)?.dispose();
    this.billboardMat.dispose();
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
      meshes += 2 + cluster.meshes.trees.length;
    }
    return { clusters: this.clusters.size, drawCalls: meshes };
  }
}
