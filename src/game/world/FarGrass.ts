import * as THREE from 'three';
import { TerrainHeight } from './TerrainHeight';
import { Noise } from '../core/Noise';
import { mulberry32, hash2, clamp, lerp } from '../core/MathUtils';
import { FLATS } from './WorldConfig';

/**
 * Fase 9 — FarGrass: la pradera del mundo entero.
 *
 * El GrassField fino (briznas de 5–10 mm) solo vive en una ventana de ~76 m
 * alrededor del jugador; más allá el terreno era solo textura. Esta capa
 * cubre un radio de ~0.5 km con MATTAS de hierba 3D instanciadas — cruces de
 * planos con siluetas de briznas alpha-testeadas — que siguen las mismas
 * exclusiones (sin pasto en agua/arena/caminos/roca/nieve/recintos) y el
 * mismo viento. Así el pasto 3D existe en TODAS las regiones del mapa
 * (islas, colinas, praderas), cerca y lejos, sin sacrificar FPS:
 *
 *  · Un único InstancedMesh (~17k mattas ultra, 6 tris c/u ≈ 105k tris).
 *  · Ventana envolvente wrap-around idéntica a GrassField (tiles de 48 m).
 *  · Densidad por anillos: tupido a media distancia, ralos en el horizonte,
 *    con niebla del cielo fundiendo el borde (sin popping perceptible).
 *  · Color muestreado del terreno + variación seca/oliva por ruido → las
 *    mattas se funden con la textura del suelo y con las briznas finas.
 */

const TILE = 48;           // m por tile (ventana grande, pocas actualizaciones)
const GRID = 23;           // tiles por lado (impar) → ventana de 1.10 km
const HALF = (GRID - 1) / 2;
const MAX_RING = 11.4;

/** Presupuesto de mattas por tile según su anillo (calidad ultra). */
function bandCapacity(ringDist: number): number {
  if (ringDist > MAX_RING) return 0;
  if (ringDist <= 3) return 150;    // Fase 12: ≤ 144 m  ~1 mata / 15 m²
  if (ringDist <= 6) return 92;     // ≤ 288 m  ~1 mata / 25 m²
  return 44;                        // horizonte ~1 mata / 52 m²
}

/** Tiles re-llenados por frame. */
const FILLS_PER_FRAME = 4;

export interface FarGrassOpts {
  density: number;
  timeUniform: { value: number };
  gustUniform: { value: number };
}

interface GridSlot {
  index: number;
  capacity: number;
  wtx: number;
  wtz: number;
  assigned: boolean;
  ringDist: number;
}

export class FarGrass {
  private mesh: THREE.InstancedMesh | null = null;
  private material: THREE.MeshStandardMaterial;
  private geometry: THREE.BufferGeometry;
  private slots: GridSlot[] = [];
  private worldSlot = new Map<string, number>();
  private fillQueue: number[] = [];
  private totalCapacity = 0;
  private density: number;
  private lastCtx = NaN;
  private lastCtz = NaN;
  private timeUniform: { value: number };
  private gustUniform: { value: number };
  private terrain: TerrainHeight;
  private scene: THREE.Scene;
  private noiseDensity = new Noise(313_371);
  private noiseDry = new Noise(77_411);
  private tmpSplat: [number, number, number, number] = [0, 0, 0, 0];
  private tmpCol: [number, number, number] = [0, 0, 0];

  constructor(terrain: TerrainHeight, scene: THREE.Scene, opts: FarGrassOpts) {
    this.terrain = terrain;
    this.scene = scene;
    this.density = opts.density;
    this.timeUniform = opts.timeUniform;
    this.gustUniform = opts.gustUniform;

    this.geometry = buildClumpGeometry();
    this.material = new THREE.MeshStandardMaterial({
      map: makeClumpTexture(),
      alphaTest: 0.42,
      transparent: false,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.patchMaterial();
    if (this.density > 0.01) this.build();
  }

  // ------------------------------------------------------------ clump shader

  /** Viento compartido con el prado fino: balanceo suave por altura de mata. */
  private patchMaterial(): void {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.timeUniform;
      shader.uniforms.uWindStrength = this.gustUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
uniform float uTime;
uniform float uWindStrength;`,
        )
        .replace(
          '#include <project_vertex>',
          /* glsl */ `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  // balanceo del haz: la base quieta, la copa sigue la racha
  float hFrac = clamp(uv.y, 0.0, 1.0);
  float bendK = hFrac * hFrac;
  vec2 wp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  float gust = sin(dot(wp, vec2(0.061, 0.037)) - uTime * 1.9)
             + 0.55 * sin(dot(wp, vec2(-0.023, 0.089)) - uTime * 1.23);
  float amp = (0.55 + 0.45 * gust) * uWindStrength;
  mvPosition.x += (gust * 0.55 + sin(uTime * 1.35 + wp.x * 0.21) * 0.3) * 0.16 * amp * bendK;
  mvPosition.z += cos(uTime * 1.05 + wp.y * 0.17) * 0.09 * amp * bendK;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    this.material.customProgramCacheKey = () => 'fargrass_v1';
  }

  // ------------------------------------------------------------------ build

  private build(): void {
    let total = 0;
    this.slots = [];
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const ringDist = Math.hypot(i - HALF, j - HALF);
        const cap = Math.floor(bandCapacity(ringDist) * this.density);
        if (cap <= 0) continue;
        this.slots.push({
          index: total, capacity: cap,
          wtx: 0, wtz: 0, assigned: false, ringDist,
        });
        total += cap;
      }
    }
    this.totalCapacity = total;
    if (total === 0) return;

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, total);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'far_grass';
    this.scene.add(this.mesh);

    this.lastCtx = NaN;
    this.lastCtz = NaN;
    this.worldSlot.clear();
    this.fillQueue.length = 0;
  }

  private destroy(): void {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
    this.slots = [];
    this.worldSlot.clear();
    this.fillQueue.length = 0;
    this.totalCapacity = 0;
  }

  setDensity(d: number): void {
    if (Math.abs(d - this.density) < 0.001) return;
    this.density = d;
    this.destroy();
    if (d > 0.01) this.build();
  }

  get enabled(): boolean { return this.density > 0.01 && !!this.mesh; }

  // ----------------------------------------------------------------- update

  update(px: number, pz: number): void {
    if (!this.mesh) return;
    const ctx = Math.floor(px / TILE);
    const ctz = Math.floor(pz / TILE);
    if (ctx !== this.lastCtx || ctz !== this.lastCtz) {
      this.lastCtx = ctx;
      this.lastCtz = ctz;
      this.moveWindow(ctx, ctz);
    }
    this.drainFillQueue(px, pz);
  }

  private moveWindow(ctx: number, ctz: number): void {
    const key = (tx: number, tz: number) => `${tx},${tz}`;

    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k];
      if (!s.assigned) continue;
      if (Math.abs(s.wtx - ctx) > HALF || Math.abs(s.wtz - ctz) > HALF) {
        this.worldSlot.delete(key(s.wtx, s.wtz));
        s.assigned = false;
      }
    }

    const entering: { tx: number; tz: number; ring: number }[] = [];
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const ring = Math.hypot(i - HALF, j - HALF);
        if (ring > MAX_RING) continue;
        const tx = ctx + i - HALF;
        const tz = ctz + j - HALF;
        if (!this.worldSlot.has(key(tx, tz))) entering.push({ tx, tz, ring });
      }
    }

    const pool = this.slots
      .map((s, k) => ({ s, k }))
      .filter((e) => !e.s.assigned)
      .sort((a, b) => a.s.ringDist - b.s.ringDist);
    entering.sort((a, b) => a.ring - b.ring);
    const n = Math.min(entering.length, pool.length);
    for (let i = 0; i < n; i++) {
      const e = entering[i];
      const slot = pool[i];
      slot.s.wtx = e.tx;
      slot.s.wtz = e.tz;
      slot.s.assigned = true;
      this.worldSlot.set(key(e.tx, e.tz), slot.k);
      this.queueFill(slot.k);
    }
  }

  private queueFill(slotIndex: number): void {
    if (!this.fillQueue.includes(slotIndex)) this.fillQueue.push(slotIndex);
  }

  private drainFillQueue(px: number, pz: number): void {
    if (this.fillQueue.length === 0) return;
    if (this.fillQueue.length > 1) {
      const slotOf = (k: number) => this.slots[k];
      this.fillQueue.sort((a, b) => {
        const sa = slotOf(a), sb = slotOf(b);
        const da = Math.hypot(sa.wtx * TILE + TILE / 2 - px, sa.wtz * TILE + TILE / 2 - pz);
        const db = Math.hypot(sb.wtx * TILE + TILE / 2 - px, sb.wtz * TILE + TILE / 2 - pz);
        return da - db;
      });
    }
    let n = Math.min(FILLS_PER_FRAME, this.fillQueue.length);
    let touched = false;
    while (n-- > 0) {
      const k = this.fillQueue.shift()!;
      const s = this.slots[k];
      if (!s || !s.assigned) continue;
      this.fillSlot(s);
      touched = true;
      this.mesh!.instanceMatrix.addUpdateRange(s.index * 16, s.capacity * 16);
      if (this.mesh!.instanceColor) {
        this.mesh!.instanceColor.addUpdateRange(s.index * 3, s.capacity * 3);
      }
    }
    if (touched) {
      this.mesh!.instanceMatrix.needsUpdate = true;
      if (this.mesh!.instanceColor) this.mesh!.instanceColor.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------- fill

  private fillSlot(s: GridSlot): void {
    const mesh = this.mesh!;
    if (!mesh.instanceColor) mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    const rand = mulberry32(hash2(s.wtx * 5 + 101, s.wtz * 11 + 59) >>> 0);
    const ox = s.wtx * TILE;
    const oz = s.wtz * TILE;
    const terrain = this.terrain;

    const m = new THREE.Matrix4();
    const qSpin = new THREE.Quaternion();
    const eSpin = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

    let placed = s.index;
    const end = s.index + s.capacity;
    for (; placed < end; placed++) {
      // jitter orgánico dentro del tile (sin rejilla perceptible)
      const x = ox + rand() * TILE;
      const z = oz + rand() * TILE;

      const h = terrain.height(x, z);
      const slope = terrain.slope(x, z, h);
      terrain.splatAt(x, z, h, slope, this.tmpSplat);
      const grassW = this.tmpSplat[0];
      // mismas exclusiones que el prado fino (el splat manda)
      if (grassW < 0.24 || h < 2.5 || h > 62 || slope > 0.62) {
        mesh.setMatrixAt(placed, ZERO);
        continue;
      }
      let blocked = Math.hypot(x - 20, z - 175) < 46 || Math.hypot(x - 60, z + 55) < 48;
      if (!blocked) {
        for (let f = 0; f < FLATS.length; f++) {
          const fl = FLATS[f];
          if (Math.hypot(x - fl.x, z - fl.z) < fl.r * 0.92) { blocked = true; break; }
        }
      }
      if (blocked) { mesh.setMatrixAt(placed, ZERO); continue; }

      // claros de pradera (mismo carácter que el campo cercano)
      const nLow = this.noiseDensity.fbm(x * 0.013, z * 0.013, 2) * 0.5 + 0.5;
      if (rand() > 0.3 + 0.7 * nLow * grassW) { mesh.setMatrixAt(placed, ZERO); continue; }

      // --- mata: tamaño según distancia (más grandes lejos, leen como masa) ---
      const ringScale = 1 + Math.min(1.6, s.ringDist * 0.11);
      const cw = (0.55 + rand() * 0.5) * ringScale;    // 0.55–1.7 m de ancho
      const ch = (0.34 + rand() * 0.3) * ringScale;    // 0.34–1.0 m de alto
      const spin = rand() * Math.PI * 2;

      eSpin.set(0, spin, 0);
      qSpin.setFromEuler(eSpin);
      pos.set(x, h - 0.03, z);
      scl.set(cw, ch, cw);
      m.compose(pos, qSpin, scl);
      mesh.setMatrixAt(placed, m);

      // --- tono: terreno → oliva/pajizo (idéntico al prado fino) ---
      terrain.colorAt(x, z, h, slope, this.tmpCol);
      const dry = clamp(0.35 + 0.65 * (this.noiseDry.fbm(x * 0.028, z * 0.028, 2) * 0.5 + 0.5), 0, 1);
      const jit = 0.82 + rand() * 0.34;
      col.setRGB(
        clamp(lerp(this.tmpCol[0] * 1.14, 0.6, dry * 0.5) * jit, 0, 1),
        clamp(lerp(this.tmpCol[1] * 1.16, 0.53, dry * 0.42) * jit, 0, 1),
        clamp(lerp(this.tmpCol[2] * 1.02, 0.3, dry * 0.58) * jit, 0, 1),
      );
      mesh.setColorAt(placed, col);
    }
  }

  dispose(): void {
    this.destroy();
    this.material.dispose();
    this.material.map?.dispose();
    this.geometry.dispose();
  }

  get stats(): { clumps: number; tiles: number } {
    let assigned = 0;
    for (const s of this.slots) if (s.assigned) assigned++;
    return { clumps: this.totalCapacity, tiles: assigned };
  }
}

// ------------------------------------------------------------ clump geometry

/**
 * Una mata: 3 planos cruzados a 60° (36 vértices, 6 triángulos), altura
 * local 1, base ligeramente enterrada. El UV.y alimenta el balanceo y el
 * gradiente de oclusión (base oscura → copa luminosa) va en el color de
 * vértice — igual que las briznas finas.
 */
function buildClumpGeometry(): THREE.BufferGeometry {
  const planes = 3;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let p = 0; p < planes; p++) {
    const angle = (p / planes) * Math.PI; // 0°, 60°, 120° → cruces
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    // quad: base (y=0) → copa (y=1), ancho local 1 centrado
    const corners: Array<[number, number, number]> = [
      [-cx * 0.5, 0, -cz * 0.5],
      [cx * 0.5, 0, cz * 0.5],
      [cx * 0.5, 1, cz * 0.5],
      [-cx * 0.5, 1, -cz * 0.5],
    ];
    const baseIndex = positions.length / 3;
    for (let v = 0; v < 4; v++) {
      const [x, y, z] = corners[v];
      positions.push(x, y, z);
      // normal del plano (perpendicular al ancho)
      normals.push(-cz, 0.35, cx);
      const ao = 0.46 + 0.6 * y;
      colors.push(ao, ao, ao);
      uvs.push(v === 0 || v === 3 ? 0 : 1, y);
    }
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2, baseIndex, baseIndex + 2, baseIndex + 3);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

/**
 * Textura de la mata: siluetas de briznas finas dibujadas en canvas (canal
 * alfa = forma), color blanco — la instancia tiñe. Alpha-test en el material:
 * sin orden de dibujo, sin bordes translúcidos.
 */
function makeClumpTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#ffffff';
  const rand = mulberry32(4242);
  // ~16 briznas por mata, abanicadas desde la base central
  const blades = 16;
  for (let i = 0; i < blades; i++) {
    const t = (i / (blades - 1)) * 2 - 1;          // -1..1 across the base
    const baseX = S * 0.5 + t * S * 0.34;
    const lean = t * S * 0.16 + (rand() - 0.5) * S * 0.1;
    const height = S * (0.55 + rand() * 0.4);
    const w = 1.4 + rand() * 1.6;                   // brizna fina
    const tipX = baseX + lean;
    const tipY = S - height;
    // curva cuadrática de la brizna (base ancha → punta)
    ctx.beginPath();
    ctx.moveTo(baseX - w, S);
    ctx.quadraticCurveTo(baseX - w * 0.4 + lean * 0.4, S - height * 0.55, tipX, tipY);
    ctx.quadraticCurveTo(baseX + w * 0.4 + lean * 0.4, S - height * 0.55, baseX + w, S);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
