import * as THREE from 'three';
import { TerrainHeight } from './TerrainHeight';
import { Noise } from '../core/Noise';
import { mulberry32, hash2, clamp, lerp } from '../core/MathUtils';
import { FLATS } from './WorldConfig';

/**
 * Fase 6 — GrassField: el prado vivo.
 *
 * Miles de briznas individuales de hierba 3D — finas, estrechas, alargadas y
 * puntiagudas — instanciadas sobre la textura del terreno (que sigue siendo la
 * base visual). Cada brizna es una cinta estrecha de 8 triángulos con curvatura
 * orgánica propia, inclinación variada y tono entre verde oliva y amarillento.
 *
 * Arquitectura:
 *  · Un único InstancedMesh con campo de tiles envolvente (wrap-around) que
 *    sigue al jugador: los tiles que quedan atrás se reciclan al frente y solo
 *    se re-sube al GPU el rango de instancias cambiado (addUpdateRange).
 *  · Densidad por bandas de distancia: cerca del jugador cada brizna se
 *    distingue; a media distancia se ralea; lejos el terreno texturizado
 *    termina el trabajo (LOD por densidad, sin coste de CPU).
 *  · Exclusiones: la brizna nace donde el splat del terreno dice que hay
 *    PASTO (respeta caminos de tierra, arena de playa, roca y nieve), fuera
 *    de pendientes fuertes y de los recintos construidos.
 *  · Manchas naturales: ruido de densidad que deja ver la tierra, grupos
 *    micro-clusterizados y zonas reservadas de hierba alta.
 *  · Viento en shader: rachas viajeras que cruzan el prado + aleteo por
 *    brizna desfasado, integrado con el viento global del clima.
 */

const TILE = 8;            // m por tile
const GRID = 23;           // Fase 12: tiles por lado (impar) → ventana de 184 m
const HALF = (GRID - 1) / 2;
/** Radio circular de la ventana (los tiles de las esquinas quedan fuera). */
const MAX_RING = 11.4;   // Fase 12: ventana más ancha

/** Presupuesto de briznas por tile según su anillo de distancia (calidad ultra). */
function bandCapacity(ringDist: number): number {
  if (ringDist > MAX_RING) return 0;
  if (ringDist <= 2.6) return 2100;   // Fase 12: prado cercano ~32 briznas/m²
  if (ringDist <= 5.2) return 850;    // media distancia    ~13/m²
  if (ringDist <= 7.6) return 340;    // raleado             ~5.3/m²
  return 130;                         // silueta lejana     ~2/m²
}

/** Tiles re-llenados por frame (pop-in progresivo y sin tirones).
 *  Fase 14 — escalonable: cada tile son cientos de briznas × ~5 llamadas a
 *  altura de terreno; con 8/frame cruzar el borde de un tile clavaba el
 *  frame 100+ ms (el famoso “trabado”). Ahora el ritmo lo decide el escalón. */
let FILLS_PER_FRAME = 8;

export interface GrassFieldOpts {
  /** Multiplicador global de densidad 0..1 (calidad). */
  density: number;
  /** Uniforms compartidos de viento (clima) del VegetationSystem. */
  timeUniform: { value: number };
  gustUniform: { value: number };
}

interface GridSlot {
  index: number;        // índice dentro del buffer de instancias
  capacity: number;
  /** Tile de mundo asignado; null = libre. */
  wtx: number;
  wtz: number;
  assigned: boolean;
  ringDist: number;
}

export class GrassField {
  private mesh: THREE.InstancedMesh | null = null;
  private material: THREE.MeshStandardMaterial;
  private geometry: THREE.BufferGeometry;
  private aBlade!: THREE.InstancedBufferAttribute;
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
  // ruidos deterministas del prado
  private noiseDensity = new Noise(910_731);
  private noiseTall = new Noise(511_237);
  private noiseDry = new Noise(77_411);
  private tmpSplat: [number, number, number, number] = [0, 0, 0, 0];
  private tmpCol: [number, number, number] = [0, 0, 0];

  constructor(terrain: TerrainHeight, scene: THREE.Scene, opts: GrassFieldOpts) {
    this.terrain = terrain;
    this.scene = scene;
    this.density = opts.density;
    this.timeUniform = opts.timeUniform;
    this.gustUniform = opts.gustUniform;

    this.geometry = buildBladeGeometry();
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.patchBladeMaterial();
    if (this.density > 0.01) this.build();
  }

  // ------------------------------------------------------------ blade shader

  /** Curvatura orgánica por brizna + viento con rachas viajeras. */
  private patchBladeMaterial(): void {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.timeUniform;
      shader.uniforms.uWindStrength = this.gustUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
attribute vec4 aBlade;
uniform float uTime;
uniform float uWindStrength;`,
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
{
  // curvatura propia de la brizna: arco progresivo hacia la punta
  float yy = position.y * position.y;
  transformed.z += aBlade.x * yy * position.y * 0.34;
  // ligera torsión del filo en la mitad alta
  transformed.x *= 1.0 - aBlade.w * 0.18 * yy;
}`,
        )
        .replace(
          '#include <project_vertex>',
          /* glsl */ `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  // --- viento del prado (espacio de mundo; la malla vive en el origen) ---
  float hFrac = clamp(position.y, 0.0, 1.0);
  float bendK = hFrac * hFrac * aBlade.z;          // la base nunca se mueve
  vec2 wp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  // racha viajera: dos trenes de onda cruzando el prado en direcciones distintas
  float gust = sin(dot(wp, vec2(0.061, 0.037)) - uTime * 1.9)
             + 0.55 * sin(dot(wp, vec2(-0.023, 0.089)) - uTime * 1.23);
  // aleteo individual desfasado
  float flut = sin(uTime * 2.7 + aBlade.y * 6.2831 + wp.x * 0.21 + wp.y * 0.17);
  float amp = (0.55 + 0.45 * gust) * (0.65 + 0.35 * flut) * uWindStrength;
  mvPosition.x += (sin(uTime * 1.35 + aBlade.y * 6.2831) * 0.5 + gust * 0.55) * 0.085 * amp * bendK;
  mvPosition.z += (cos(uTime * 1.05 + aBlade.y * 6.2831) * 0.5) * 0.065 * amp * bendK;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    this.material.customProgramCacheKey = () => 'grassblade_v1';
  }

  // ------------------------------------------------------------------ build

  private build(): void {
    // capacidades por slot de rejilla (el anillo de distancia es del SLOT,
    // no del tile de mundo: la rejilla siempre está centrada en el jugador)
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

    this.aBlade = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4);
    this.aBlade.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aBlade', this.aBlade);

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, total);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;      // el campo envuelve a la cámara
    this.mesh.castShadow = false;         // sombras por brizna = prohibitivo
    this.mesh.receiveShadow = true;       // árboles/edificios sombrean el prado
    this.mesh.matrixAutoUpdate = false;   // vive en el origen
    this.mesh.name = 'grass_field';
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
    this.geometry.deleteAttribute('aBlade');
    this.slots = [];
    this.worldSlot.clear();
    this.fillQueue.length = 0;
    this.totalCapacity = 0;
  }

  /** Calidad cambiada en caliente (misma semántica que el sistema anterior). */
  setDensity(d: number, fillsPerFrame?: number): void {
    if (fillsPerFrame && fillsPerFrame > 0) FILLS_PER_FRAME = fillsPerFrame;
    if (Math.abs(d - this.density) < 0.001) return;
    this.density = d;
    this.destroy();
    if (d > 0.01) this.build();
  }

  get enabled(): boolean { return this.density > 0.01 && !!this.mesh; }

  /** Fase 14 — el mesh del prado (para excluirlo del pase de reflexión). */
  get meshObject(): THREE.InstancedMesh | null { return this.mesh; }

  // ------------------------------------------------------------------ update

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

  /** Re-asigna los slots a la nueva ventana de tiles. Los tiles que siguen
   *  dentro conservan su contenido (cero coste); solo se rellenan los que
   *  entran (columna/fila nueva ≈ 2·GRID tiles). */
  private moveWindow(ctx: number, ctz: number): void {
    const key = (tx: number, tz: number) => `${tx},${tz}`;

    // 1. liberar slots cuyo tile de mundo salió de la ventana
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k];
      if (!s.assigned) continue;
      if (Math.abs(s.wtx - ctx) > HALF || Math.abs(s.wtz - ctz) > HALF) {
        this.worldSlot.delete(key(s.wtx, s.wtz));
        s.assigned = false;
      }
    }

    // 2. tiles que entran: posiciones válidas de la rejilla sin slot asignado
    const entering: { tx: number; tz: number; ring: number }[] = [];
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const ring = Math.hypot(i - HALF, j - HALF);
        if (ring > MAX_RING) continue;                    // esquinas sin capacidad
        const tx = ctx + i - HALF;
        const tz = ctz + j - HALF;
        if (!this.worldSlot.has(key(tx, tz))) entering.push({ tx, tz, ring });
      }
    }

    // 3. emparejar con slots libres (por anillo de distancia — capacidades
    //    compatibles: los que salen son de borde, los que entran también)
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

  /** Fase 21 — synchronous drain for the LOADING screen: the meadow is
   *  fully grown when the hero spawns instead of popping in for ~3 s
   *  (the per-frame budget only fills 1-2 tiles — perfect while playing,
   *  too slow for the initial window). */
  prefill(px: number, pz: number): void {
    if (!this.mesh) return;
    const ctx = Math.floor(px / TILE);
    const ctz = Math.floor(pz / TILE);
    if (ctx !== this.lastCtx || ctz !== this.lastCtz) {
      this.lastCtx = ctx;
      this.lastCtz = ctz;
      this.moveWindow(ctx, ctz);
    }
    this.drainFillQueue(px, pz, true);
  }

  private drainFillQueue(px: number, pz: number, all = false): void {
    if (this.fillQueue.length === 0) return;
    // los tiles más cercanos primero (el prado crece alrededor del jugador)
    if (this.fillQueue.length > 1) {
      const slotOf = (k: number) => this.slots[k];
      this.fillQueue.sort((a, b) => {
        const sa = slotOf(a), sb = slotOf(b);
        const da = Math.hypot(sa.wtx * TILE + TILE / 2 - px, sa.wtz * TILE + TILE / 2 - pz);
        const db = Math.hypot(sb.wtx * TILE + TILE / 2 - px, sb.wtz * TILE + TILE / 2 - pz);
        return da - db;
      });
    }
    let n = all ? this.fillQueue.length : Math.min(FILLS_PER_FRAME, this.fillQueue.length);
    let touched = false;
    // Fase 21 — time-sliced fills: a slot fill costs ~1-2 ms (each blade
    // samples splat/color/noise). Six of them in one frame = the meadow
    // hitching while you run. Now the drain spends at most ~3 ms; the
    // far edge of the ring simply grows in a beat later.
    const fillT0 = performance.now();
    while (n-- > 0) {
      if (!all && performance.now() - fillT0 > 3 && touched) break;
      const k = this.fillQueue.shift()!;
      const s = this.slots[k];
      if (!s || !s.assigned) continue;
      this.fillSlot(s);
      touched = true;
      this.aBlade.addUpdateRange(s.index * 4, s.capacity * 4);
      this.mesh!.instanceMatrix.addUpdateRange(s.index * 16, s.capacity * 16);
      if (this.mesh!.instanceColor) {
        this.mesh!.instanceColor.addUpdateRange(s.index * 3, s.capacity * 3);
      }
    }
    if (touched) {
      this.aBlade.needsUpdate = true;
      this.mesh!.instanceMatrix.needsUpdate = true;
      if (this.mesh!.instanceColor) this.mesh!.instanceColor.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------- fill

  /** Rellena un slot con briznas deterministas del tile de mundo dado. */
  private fillSlot(s: GridSlot): void {
    const mesh = this.mesh!;
    if (!mesh.instanceColor) mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // inicializa buffer
    const rand = mulberry32(hash2(s.wtx * 3 + 17, s.wtz * 7 + 11) >>> 0);
    const ox = s.wtx * TILE;
    const oz = s.wtz * TILE;
    const terrain = this.terrain;

    // semillas de micro-clusters (grupitos de briznas — evita la alfombra uniforme)
    const seedCount = Math.max(4, Math.floor(s.capacity * 0.22));
    const seeds = new Float32Array(seedCount * 2);
    for (let i = 0; i < seedCount; i++) {
      seeds[i * 2] = ox + rand() * TILE;
      seeds[i * 2 + 1] = oz + rand() * TILE;
    }

    const m = new THREE.Matrix4();
    const qSpin = new THREE.Quaternion();
    const qLean = new THREE.Quaternion();
    const eSpin = new THREE.Euler();
    const eLean = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    let gaussianSpare: number | null = null;
    const gauss = () => {
      if (gaussianSpare !== null) { const v = gaussianSpare; gaussianSpare = null; return v; }
      let u = 0, v = 0, s2 = 0;
      do { u = rand() * 2 - 1; v = rand() * 2 - 1; s2 = u * u + v * v; } while (s2 >= 1 || s2 < 1e-6);
      const f = Math.sqrt((-2 * Math.log(s2)) / s2);
      gaussianSpare = v * f;
      return u * f;
    };

    let placed = s.index;
    const end = s.index + s.capacity;
    for (let i = 0; i < s.capacity; i++, placed++) {
      // --- posición: cluster o uniforme ---
      let x: number, z: number;
      if (rand() < 0.58) {
        const si = (i % seedCount) * 2;
        x = seeds[si] + gauss() * 0.42;
        z = seeds[si + 1] + gauss() * 0.42;
        if (x < ox) x = ox + rand() * 0.5; if (x > ox + TILE) x = ox + TILE - rand() * 0.5;
        if (z < oz) z = oz + rand() * 0.5; if (z > oz + TILE) z = oz + TILE - rand() * 0.5;
      } else {
        x = ox + rand() * TILE;
        z = oz + rand() * TILE;
      }

      const h = terrain.height(x, z);
      // playa / agua / nieve: el splat manda (arena no lleva prado)
      const slope = terrain.slope(x, z, h);
      terrain.splatAt(x, z, h, slope, this.tmpSplat);
      const grassW = this.tmpSplat[0];
      if (grassW < 0.22 || h < 2.5 || h > 56 || slope > 0.55) {
        mesh.setMatrixAt(placed, ZERO);
        continue;
      }
      // recintos construidos (aldea, castillo, obras de las islas)
      let blocked = Math.hypot(x - 20, z - 175) < 46 || Math.hypot(x - 60, z + 55) < 48;
      if (!blocked) {
        for (let f = 0; f < FLATS.length; f++) {
          const fl = FLATS[f];
          if (Math.hypot(x - fl.x, z - fl.z) < fl.r * 0.92) { blocked = true; break; }
        }
      }
      if (blocked) { mesh.setMatrixAt(placed, ZERO); continue; }

      // manchas de densidad: dos escalas — claros grandes de pradera + parches pequeños
      const nLow = this.noiseDensity.fbm(x * 0.013, z * 0.013, 2) * 0.5 + 0.5;
      const nHigh = this.noiseDensity.fbm(x * 0.052 + 37.7, z * 0.052 - 19.3, 2) * 0.5 + 0.5;
      const dn = 0.22 + 0.78 * (0.62 * nLow + 0.38 * nHigh);
      const accept = grassW * dn;
      if (rand() > accept) { mesh.setMatrixAt(placed, ZERO); continue; }

      // zona de hierba alta reservada (praderas específicas)
      const tall = this.noiseTall.fbm(x * 0.014, z * 0.014, 2);
      const tallK = tall > 0.34 ? 1 + (tall - 0.34) * 1.5 : 1;

      // --- construcción de la brizna ---
      let bh = 0.14 + rand() * 0.2;                      // 14–34 cm
      const wild = rand() < 0.035;
      if (wild) bh *= 1.55;                                 // alguna brizna suelta
      bh *= tallK * (1 - slope * 0.5);                      // más corta en pendiente
      bh = clamp(bh, 0.08, 0.62);
      const bw = (0.0055 + rand() * 0.0042) * (wild ? 1.25 : 1);   // 5.5–10 mm: filo fino real
      const lean = (2 + rand() * 13) * (Math.PI / 180);
      const spin = rand() * Math.PI * 2;
      const curve = 0.3 + rand() * 0.95;
      const phase = rand();
      const swayVar = 0.7 + rand() * 0.6;
      const twist = rand();

      eLean.set(lean, 0, 0);
      qLean.setFromEuler(eLean);
      eSpin.set(0, spin, 0);
      qSpin.setFromEuler(eSpin).multiply(qLean);
      pos.set(x, h - 0.028, z);                             // base ligeramente enterrada
      scl.set(bw, bh, 1);
      m.compose(pos, qSpin, scl);
      mesh.setMatrixAt(placed, m);
      this.aBlade.setXYZW(placed, curve, phase, swayVar, twist);

      // --- tono: muestreo del terreno hacia verdes oliva / pajizos ---
      terrain.colorAt(x, z, h, slope, this.tmpCol);
      const dry = clamp(0.35 + 0.65 * (this.noiseDry.fbm(x * 0.028, z * 0.028, 2) * 0.5 + 0.5), 0, 1);
      const flower = rand() < 0.02;
      if (flower) {
        // florecillas silvestres discretas
        const warm = rand() < 0.6;
        col.setRGB(warm ? 0.86 : 0.74, warm ? 0.82 : 0.78, warm ? 0.5 : 0.88);
      } else {
        const jit = 0.84 + rand() * 0.32;
        col.setRGB(
          clamp(lerp(this.tmpCol[0] * 1.18, 0.64, dry * 0.55) * jit, 0, 1),
          clamp(lerp(this.tmpCol[1] * 1.2, 0.56, dry * 0.45) * jit, 0, 1),
          clamp(lerp(this.tmpCol[2] * 1.05, 0.32, dry * 0.6) * jit, 0, 1),
        );
      }
      mesh.setColorAt(placed, col);
    }
  }

  dispose(): void {
    this.destroy();
    this.material.dispose();
    this.geometry.dispose();
  }

  /** Estadísticas para el HUD de depuración. */
  get stats(): { blades: number; tiles: number } {
    let assigned = 0;
    for (const s of this.slots) if (s.assigned) assigned++;
    return { blades: this.totalCapacity, tiles: assigned };
  }
}

// ------------------------------------------------------------ blade geometry

/**
 * Una brizna: cinta estrecha de 5 niveles (9 vértices, 8 triángulos) que se
 * afila hasta punta, con curvatura base suave, normales sesgadas hacia arriba
 * (el prado se ilumina como el terreno, no como cuchillas oscuras) y gradiente
 * de oclusión en el color de vértice (base oscura → punta luminosa).
 * Altura local 1 (la instancia escala a la altura real), ancho local 1
 * (la instancia escala al ancho real ~1.2 cm).
 */
function buildBladeGeometry(): THREE.BufferGeometry {
  const rows = 5;
  const ys = [0.0, 0.27, 0.54, 0.79, 1.0];
  // silueta de huso: estrecha en la raíz, ancho máximo al 27%, afilada en punta
  const ws = [0.38, 1.0, 0.8, 0.42, 0.0];
  const zs = [0.0, 0.012, 0.045, 0.095, 0.16]; // arco base sutil hacia +Z
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    const y = ys[r];
    const w = ws[r] * 0.5;
    const z = zs[r];
    const tip = r === rows - 1;
    const nVerts = tip ? 1 : 2;
    for (let v = 0; v < nVerts; v++) {
      const x = tip ? 0 : (v === 0 ? -w : w);
      positions.push(x, y, z);
      // normal con sesgo hacia arriba: mezcla del lateral con +Y
      let nx = 0, ny = 0.55, nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      normals.push(nx / nl, ny / nl, nz / nl);
      // oclusión ambiental base → luz de punta
      const ao = 0.52 + 0.55 * y * y;
      colors.push(ao, ao, ao);
      uvs.push(tip ? 0.5 : v, y);
    }
  }
  // índices: quads entre filas (la fila final tiene un solo vértice → triángulos)
  let base = 0;
  for (let r = 0; r < rows - 1; r++) {
    const nextCount = r + 1 === rows - 1 ? 1 : 2;
    if (nextCount === 2) {
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      base += 2;
    } else {
      // fila penúltima (2 verts) → punta (1 vert)
      indices.push(base, base + 1, base + 2);
      base += 2;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}
