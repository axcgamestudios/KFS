import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ChunkScatter } from './TerrainSystem';
import { TerrainHeight } from './TerrainHeight';
import { mulberry32, hash2, clamp } from '../core/MathUtils';
import { distToRoads } from './WorldConfig';
import { GrassField } from './GrassField';
import { FarGrass } from './FarGrass';

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
 * Fase 12 — trees are TWO textured parts (bark trunk + leaf canopy) for every
 * species, with organically noise-displaced canopies so they read as leaf
 * clusters instead of angular blobs. Species:
 * 0 oak · 1 pine · 2 birch · 3 maple (golden) · 4 spruce · 5 dead/ancient
 */
function displacedBlob(radius: number, seed: number, amp = 0.24, squashY = 0.9): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  // Hash the position (not the index): shared corners displace identically → no cracks.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = (frac(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) * 2 - 1) * amp;
    const h2 = (frac(Math.sin(x * 93.989 + y * 47.233 + z * 17.719) * 24634.6345) * 2 - 1) * amp * 0.55;
    pos.setXYZ(i, x * (1 + h), y * (1 + h2) * squashY, z * (1 + h));
  }
  g.computeVertexNormals();
  return g;
}
const frac = (v: number) => v - Math.floor(v);

/** Per-species [bark trunk geometry, leaf canopy geometry]. */
function buildTreeGeometries(): Array<[THREE.BufferGeometry, THREE.BufferGeometry]> {
  const rand = mulberry32(999);
  const parts: Array<[THREE.BufferGeometry, THREE.BufferGeometry]> = [];

  // --- Species 0: Oak — broad, muscular, green ---
  {
    const trunk: THREE.BufferGeometry[] = [];
    const trunkCol = new THREE.Color(0x8a6a4a);
    const t = new THREE.CylinderGeometry(0.22, 0.46, 3.0, 10);
    colorize(t, trunkCol, 0.07, 1);
    trunk.push(transformGeo(t, 0, 1.5, 0));
    for (let i = 0; i < 4; i++) {
      const b = new THREE.CylinderGeometry(0.09, 0.17, 1.9, 8);
      colorize(b, trunkCol, 0.07, 2 + i);
      const ang = (i / 4) * Math.PI * 2 + rand() * 0.5;
      trunk.push(transformGeo(b, Math.cos(ang) * 0.8, 2.6 + rand() * 0.6, Math.sin(ang) * 0.8, 1, 1, 1, 0, 0.55 + rand() * 0.35));
    }
    const canopy: THREE.BufferGeometry[] = [];
    const leafCols = [new THREE.Color(0x86a34a), new THREE.Color(0x74a040), new THREE.Color(0x92ac54)];
    const blobs: Array<[number, number, number, number]> = [
      [0, 4.6, 0, 2.0], [1.35, 3.9, 0.6, 1.45], [-1.2, 4.0, -0.65, 1.4], [0.35, 3.8, -1.3, 1.35],
      [-0.45, 4.1, 1.25, 1.3], [0.9, 5.4, 0.7, 1.15], [-0.8, 5.5, -0.6, 1.1], [0.1, 6.3, 0.2, 1.0],
    ];
    blobs.forEach((b, i) => {
      const g = displacedBlob(b[3], 11 + i, 0.22, 0.88);
      colorize(g, leafCols[i % 3], 0.1, 20 + i);
      canopy.push(transformGeo(g, b[0], b[1], b[2], 1.12, 1, 1.12, rand() * 3, rand() * 0.25));
    });
    parts.push([mergeGeometries(trunk)!, mergeGeometries(canopy)!]);
  }

  // --- Species 1: Pine — layered cones with wobbled rims ---
  {
    const trunk: THREE.BufferGeometry[] = [];
    const pineTrunk = new THREE.CylinderGeometry(0.16, 0.34, 2.2, 9);
    colorize(pineTrunk, new THREE.Color(0x6e5238), 0.07, 21);
    trunk.push(transformGeo(pineTrunk, 0, 1.1, 0));
    const canopy: THREE.BufferGeometry[] = [];
    const pineCols = [new THREE.Color(0x3f6b46), new THREE.Color(0x35624a), new THREE.Color(0x49734a)];
    const tiers: Array<[number, number, number, number]> = [
      [2.3, 2.1, 2.7, 1.0], [3.7, 1.6, 2.3, 0.95], [4.95, 1.15, 1.95, 0.9], [5.95, 0.72, 1.55, 0.85], [6.7, 0.38, 1.1, 0.8],
    ];
    tiers.forEach((tier, i) => {
      const c = new THREE.ConeGeometry(tier[1], tier[2], 11);
      colorize(c, pineCols[i % 3], 0.09, 30 + i);
      canopy.push(transformGeo(c, 0, tier[0], 0, 1, 1, 1, rand() * 3));
    });
    parts.push([mergeGeometries(trunk)!, mergeGeometries(canopy)!]);
  }

  // --- Species 2: Birch — pale slim trunk, airy light-green crown ---
  {
    const trunk: THREE.BufferGeometry[] = [];
    const btrunk = new THREE.CylinderGeometry(0.10, 0.19, 3.6, 9);
    colorize(btrunk, new THREE.Color(0xe8e4d8), 0.05, 41);
    trunk.push(transformGeo(btrunk, 0, 1.8, 0));
    const canopy: THREE.BufferGeometry[] = [];
    const bCols = [new THREE.Color(0xa9c465), new THREE.Color(0xbcd07a)];
    const bBlobs: Array<[number, number, number, number]> = [
      [0, 4.1, 0, 1.25], [0.65, 3.5, 0.35, 0.9], [-0.6, 3.7, -0.3, 0.85], [0.15, 4.9, -0.45, 0.8], [-0.15, 5.3, 0.4, 0.72],
    ];
    bBlobs.forEach((b, i) => {
      const g = displacedBlob(b[3], 51 + i, 0.26, 1.2);
      colorize(g, bCols[i % 2], 0.11, 50 + i);
      canopy.push(transformGeo(g, b[0], b[1], b[2], 1.05, 1, 1.05, rand() * 3));
    });
    parts.push([mergeGeometries(trunk)!, mergeGeometries(canopy)!]);
  }

  // --- Species 3: Maple — the golden landmark tree ---
  {
    const trunk: THREE.BufferGeometry[] = [];
    const mt = new THREE.CylinderGeometry(0.18, 0.46, 3.2, 10);
    colorize(mt, new THREE.Color(0x9a8574), 0.05, 61);
    trunk.push(transformGeo(mt, 0, 1.6, 0));
    for (let i = 0; i < 4; i++) {
      const b = new THREE.CylinderGeometry(0.07, 0.15, 2.1, 7);
      colorize(b, new THREE.Color(0x9a8574), 0.06, 62 + i);
      const ang = (i / 4) * Math.PI * 2 + 0.4;
      trunk.push(transformGeo(b, Math.cos(ang) * 0.9, 3.6 + rand() * 0.6, Math.sin(ang) * 0.9, 1, 1, 1, 0, 0.7 + rand() * 0.25));
    }
    const canopy: THREE.BufferGeometry[] = [];
    const mCols = [new THREE.Color(0xe8bc50), new THREE.Color(0xd8a83c), new THREE.Color(0xf0cc66), new THREE.Color(0xc9952e)];
    const mBlobs: Array<[number, number, number, number]> = [
      [0, 5.5, 0, 1.95], [1.4, 4.7, 0.65, 1.35], [-1.25, 4.9, -0.6, 1.3], [0.5, 4.5, -1.35, 1.25],
      [-0.55, 4.8, 1.3, 1.2], [0.15, 6.6, 0.25, 1.1], [1.0, 6.1, -0.7, 0.95],
    ];
    mBlobs.forEach((b, i) => {
      const g = displacedBlob(b[3], 71 + i, 0.24, 0.9);
      colorize(g, mCols[i % 4], 0.09, 70 + i);
      canopy.push(transformGeo(g, b[0], b[1], b[2], 1.1, 0.95, 1.1, rand() * 3, rand() * 0.25));
    });
    parts.push([mergeGeometries(trunk)!, mergeGeometries(canopy)!]);
  }

  // --- Species 4: Spruce — tall, narrow, dark, high altitude ---
  {
    const trunk: THREE.BufferGeometry[] = [];
    const sTrunk = new THREE.CylinderGeometry(0.13, 0.28, 2.8, 9);
    colorize(sTrunk, new THREE.Color(0x5c4430), 0.07, 81);
    trunk.push(transformGeo(sTrunk, 0, 1.4, 0));
    const canopy: THREE.BufferGeometry[] = [];
    const sCols = [new THREE.Color(0x2e5240), new THREE.Color(0x274c38), new THREE.Color(0x355942)];
    const sTiers: Array<[number, number, number, number]> = [
      [3.0, 1.85, 2.6, 1.0], [4.5, 1.4, 2.2, 0.95], [5.9, 1.0, 1.8, 0.9], [7.15, 0.66, 1.45, 0.88], [8.2, 0.35, 1.05, 0.85], [9.0, 0.16, 0.7, 0.82],
    ];
    sTiers.forEach((tier, i) => {
      const c = new THREE.ConeGeometry(tier[1], tier[2], 11);
      colorize(c, sCols[i % 3], 0.08, 85 + i);
      canopy.push(transformGeo(c, 0, tier[0], 0, 1, 1, 1, rand() * 3));
    });
    parts.push([mergeGeometries(trunk)!, mergeGeometries(canopy)!]);
  }

  // --- Species 5: Dead / ancient — bare twisted branches (bark both groups) ---
  {
    const trunk: THREE.BufferGeometry[] = [];
    const dCol = new THREE.Color(0x8a7a68);
    const dTrunk = new THREE.CylinderGeometry(0.17, 0.42, 3.8, 9);
    colorize(dTrunk, dCol, 0.12, 91);
    trunk.push(transformGeo(dTrunk, 0, 1.9, 0, 1, 1, 1, 0, 0.06));
    const canopy: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const len = 1.3 + rand() * 1.5;
      const b = new THREE.CylinderGeometry(0.03, 0.11, len, 6);
      colorize(b, dCol, 0.14, 92 + i);
      const ang = (i / 7) * Math.PI * 2 + rand() * 0.8;
      const h = 2.4 + rand() * 1.7;
      canopy.push(transformGeo(b, Math.cos(ang) * 0.55, h, Math.sin(ang) * 0.55, 1, 1, 1, ang, 0.7 + rand() * 0.5));
      if (rand() < 0.7) {
        const tb = new THREE.CylinderGeometry(0.02, 0.055, len * 0.6, 5);
        colorize(tb, dCol, 0.14, 100 + i);
        canopy.push(transformGeo(tb, Math.cos(ang + 0.5) * 0.95, h + len * 0.42, Math.sin(ang + 0.5) * 0.95, 1, 1, 1, ang + 0.6, 0.4 + rand() * 0.4));
      }
    }
    parts.push([mergeGeometries(trunk)!, mergeGeometries(canopy)!]);
  }

  return parts;
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

/** Denser grass blade geometry: fine single-blade field handled by GrassField. */

interface TreeInstance { species: number; matrix: THREE.Matrix4; color: THREE.Color }
interface RockInstance { matrix: THREE.Matrix4; color: THREE.Color }

interface ChunkVegetation {
  trees: TreeInstance[];
  rocks: RockInstance[];
  near?: number;
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
  /** Per-species [trunk, canopy] geometries + the merged two-group geo. */
  private speciesParts: Array<[THREE.BufferGeometry, THREE.BufferGeometry]> = [];
  private treeGeos: THREE.BufferGeometry[];
  private treeMat: THREE.MeshStandardMaterial;
  private barkMat: THREE.MeshStandardMaterial;
  private leafMat: THREE.MeshStandardMaterial;
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
  /** Fase 6 — el prado de briznas finas que envuelve al jugador. */
  private grassField: GrassField;
  /** Fase 9 — la pradera lejana del mundo entero (mattas instanciadas
   *  cubriendo ~0.5 km: el pasto 3D existe en todas las regiones). */
  private farGrass: FarGrass;

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

    // Fase 12 — EVERY species wears real textures: bark on trunks/branches,
    // leaf on canopies, vertex colours as per-species hue tints.
    if (mapleTextures) {
      const bark = mapleTextures.bark.clone();
      bark.repeat.set(2, 2);
      bark.needsUpdate = true;
      const leaf = mapleTextures.leaf.clone();
      leaf.repeat.set(2, 2);
      leaf.needsUpdate = true;
      this.barkMat = new THREE.MeshStandardMaterial({
        map: bark, vertexColors: true, roughness: 0.95, metalness: 0,
      });
      this.leafMat = new THREE.MeshStandardMaterial({
        map: leaf, vertexColors: true, roughness: 0.82, metalness: 0,
      });
    } else {
      this.barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
      this.leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    }
    patchWind(this.barkMat, { strength: 0.08, minHeight: 2.0, maxHeight: 6.5 });
    patchWind(this.leafMat, { strength: 0.15, minHeight: 2.5, maxHeight: 7.5 });

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
    this.speciesParts = built;
    this.treeGeos = built.map(([trunk, canopy]) => {
      const g = mergeGeometries([trunk, canopy])!;
      g.clearGroups();
      g.addGroup(0, trunk.attributes.position.count, 0);
      g.addGroup(trunk.attributes.position.count, canopy.attributes.position.count, 1);
      return g;
    });

    // Fase 6 — prado de briznas individuales (sustituye a los matas de planos)
    this.grassField = new GrassField(terrain, scene, {
      density: grassDensity,
      timeUniform: windTime,
      gustUniform: windGust,
    });
    // Fase 9 — capa lejana: mattas por todo el mundo visible (misma ventana
    // de exclusiónes y mismo viento que el prado fino)
    this.farGrass = new FarGrass(terrain, scene, {
      density: Math.min(1, grassDensity * 1.1),
      timeUniform: windTime,
      gustUniform: windGust,
    });
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
    this.grassField.setDensity(d);
    this.farGrass.setDensity(Math.min(1, d * 1.1));
  }

  /** Fase 6 — el GrassField se autogestiona por frame en update(); esta
   *  entrada forcea una comprobación inmediata de la ventana de tiles. */
  refreshGrassNear(px: number, pz: number): void {
    this.grassField.update(px, pz);
  }

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
        // Fase 12 — every species is a two-group geometry (bark + leaf);
        // the dead tree keeps bark on BOTH groups (bare branches, no foliage)
        const mesh = new THREE.InstancedMesh(
          this.treeGeos[s],
          s === 5 ? [this.barkMat, this.barkMat] : [this.barkMat, this.leafMat],
          this.speciesCapacity,
        );
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

  // -------------------------------------------------------------- update

  /** Rebuild at most 2 dirty clusters per frame + LOD swap by distance.
   *  Fase 6: el prado de briznas se actualiza aquí también (envuelve al jugador). */
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
      // Fase 6 — el prado sigue al jugador (ventana envolvente de tiles)
      this.grassField.update(px, pz);
      // Fase 9 — la pradera lejana también (ventana de 1.1 km)
      this.farGrass.update(px, pz);
    }
  }

  dispose(): void {
    for (const cluster of this.clusters.values()) {
      if (cluster.meshes) this.disposeClusterMeshes(cluster.meshes);
    }
    this.clusters.clear();
    this.treeGeos.forEach((g) => g.dispose());
    for (const [t, c] of this.speciesParts) { t.dispose(); c.dispose(); }
    this.billboardGeo.dispose();
    this.rockGeo.dispose();
    this.treeMat.dispose();
    this.barkMat.dispose();
    this.leafMat.dispose();
    (this.billboardMat.map as THREE.Texture)?.dispose();
    this.billboardMat.dispose();
    this.rockMat.dispose();
    this.grassField.dispose();
    this.farGrass.dispose();
    this.chunkData.clear();
  }

  /** Debug/stats: clusters + el prado de briznas + la pradera lejana. */
  get stats(): { clusters: number; drawCalls: number; blades: number } {
    let meshes = 0;
    for (const cluster of this.clusters.values()) {
      if (!cluster.meshes) continue;
      meshes += 2 + cluster.meshes.trees.length;
    }
    return {
      clusters: this.clusters.size,
      drawCalls: meshes,
      blades: this.grassField.stats.blades + this.farGrass.stats.clumps,
    };
  }
}
