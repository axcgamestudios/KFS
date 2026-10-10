import { Noise } from '../core/Noise';
import { WORLD, WORLD_SEED, ROADS, distToRoads, gauss } from './WorldConfig';
import { clamp, smoothstep, lerp } from '../core/MathUtils';

/**
 * Analytic terrain of the island of Aldmor. The same height() function is
 * used to generate chunk meshes, place vegetation, clamp the player and NPCs,
 * and pre-render the world map — guaranteeing perfect consistency.
 */
export class TerrainHeight {
  readonly noise: Noise;
  private nCoast: Noise;
  private nHills: Noise;
  private nDetail: Noise;
  private nMountain: Noise;
  private nTint: Noise;

  constructor(seed = WORLD_SEED) {
    this.noise = new Noise(seed);
    this.nCoast = new Noise(seed + 11);
    this.nHills = new Noise(seed + 23);
    this.nDetail = new Noise(seed + 37);
    this.nMountain = new Noise(seed + 53);
    this.nTint = new Noise(seed + 71);
  }

  /** Terrain height in meters at world (x, z). Sea level = 0. */
  height(x: number, z: number): number {
    // --- Island mask with organic coastline ---
    const dxI = x - WORLD.islandCenter.x;
    const dzI = z - WORLD.islandCenter.z;
    const distI = Math.sqrt(dxI * dxI + dzI * dzI);
    const coastWobble = this.nCoast.fbm(x * 0.006, z * 0.006, 4) * 0.14;
    const coastWobble2 = this.nCoast.noise2(x * 0.02 + 40, z * 0.02 - 17) * 0.035;
    const islandEdge = WORLD.islandRadius * (1 + coastWobble + coastWobble2);
    const islandMask = 1 - smoothstep(islandEdge - 110, islandEdge + 30, distI);

    // --- Rolling hills ---
    const hills =
      this.nHills.fbm(x * 0.011, z * 0.011, 5) * 17 +
      this.nHills.fbm(x * 0.033 + 7, z * 0.033 - 3, 3) * 4;
    let land = hills + 9;

    // --- Mountain massif (ridged) ---
    const mM = gauss(x - WORLD.mountainCenter.x, z - WORLD.mountainCenter.z, WORLD.mountainRadius);
    if (mM > 0.01) {
      const ridge = this.nMountain.ridged(x * 0.0075, z * 0.0075, 5);
      land += Math.pow(ridge, 1.7) * 135 * mM;
    }

    // --- Bay carve (harbor inlet) ---
    const bay = gauss(x - WORLD.bayCenter.x, z - WORLD.bayCenter.z, WORLD.bayRadius);
    land -= bay * 26;

    // --- Castle plateau ---
    const plateau = gauss(x - WORLD.castlePos.x, z - WORLD.castlePos.z, WORLD.castleRadius);
    if (plateau > 0.01) {
      const pTop = WORLD.castlePlateauHeight + this.nDetail.fbm(x * 0.05, z * 0.05, 2) * 1.2;
      land = lerp(land, pTop, clamp(plateau * 1.35, 0, 1));
    }

    // --- Village flattening ---
    const v = gauss(x - WORLD.villageCenter.x, z - WORLD.villageCenter.z, WORLD.villageRadius);
    if (v > 0.01) {
      const vTop = WORLD.villageHeight + this.nDetail.fbm(x * 0.045 + 3, z * 0.045, 2) * 0.8;
      land = lerp(land, vTop, clamp(v * 1.3, 0, 1));
    }

    // --- Waterfall pool basin ---
    const pool = gauss(x + 95, z + 195, 30);
    if (pool > 0.01) {
      const poolH = 2.5 + this.nDetail.fbm(x * 0.08, z * 0.08, 2) * 0.5;
      land = lerp(land, poolH, clamp(pool * 1.4, 0, 1));
    }

    // --- Beach compression: anything slightly above sea flattens gently ---
    if (land > 0 && land < 4.5 && islandMask > 0.35) {
      land = Math.pow(land / 4.5, 1.35) * 4.5;
    }

    // --- Ocean floor blend ---
    const shelf = this.nDetail.fbm(x * 0.008, z * 0.008, 3) * 5;
    const oceanFloor = -15 + shelf + smoothstep(500, 900, distI) * -12;

    return lerp(oceanFloor, land, islandMask);
  }

  /** Terrain slope as 0..1 (approx via finite differences). */
  slope(x: number, z: number, h?: number): number {
    const e = 1.4;
    const hh = h ?? this.height(x, z);
    const hx = this.height(x + e, z);
    const hz = this.height(x, z + e);
    const dx = (hx - hh) / e;
    const dz = (hz - hh) / e;
    return Math.min(1, Math.sqrt(dx * dx + dz * dz) * 0.9);
  }

  /** Forest density mask 0..1. */
  forestMask(x: number, z: number): number {
    const dx = x - WORLD.forestCenter.x;
    const dz = z - WORLD.forestCenter.z;
    const base = gauss(dx, dz, WORLD.forestRadius);
    const patches = this.noise.fbm(x * 0.012 + 100, z * 0.012, 3) * 0.5 + 0.5;
    return clamp(base * (0.45 + 0.75 * patches), 0, 1);
  }

  /** Terrain albedo color at a point (vertex color). Returns [r,g,b]. */
  colorAt(x: number, z: number, h: number, slope: number, out: [number, number, number]): void {
    const tint = this.nTint.noise2(x * 0.05, z * 0.05);
    const macro = this.nTint.fbm(x * 0.013, z * 0.013, 3);

    if (h < 1.9 && slope < 0.4) {
      // Beach sand
      out[0] = 0.78 + tint * 0.05;
      out[1] = 0.71 + tint * 0.05;
      out[2] = 0.55 + tint * 0.04;
      return;
    }

    const forest = this.forestMask(x, z);
    if (h > 74 + macro * 10) {
      // Snow caps
      out[0] = 0.93;
      out[1] = 0.95;
      out[2] = 0.97;
      return;
    }

    if (slope > 0.62 || h > 58 + macro * 12) {
      // Rock
      const g = 0.44 + tint * 0.06;
      out[0] = g * 1.06;
      out[1] = g;
      out[2] = g * 0.92;
      return;
    }

    if (h < 3.2 && slope < 0.35) {
      // Wet sand / dune grass transition
      out[0] = 0.66 + tint * 0.05;
      out[1] = 0.65 + tint * 0.05;
      out[2] = 0.44;
      return;
    }

    // Meadow greens (two hues blended by macro noise)
    const dry = 0.42 + macro * 0.1 + tint * 0.04;
    const lush = 0.3 + macro * 0.06 + tint * 0.03;
    const mixK = clamp(0.5 + macro * 0.8, 0, 1);
    out[0] = lerp(dry * 0.72, lush * 0.55, mixK) * (1 - forest * 0.28);
    out[1] = lerp(dry, lush * 1.25, mixK) * (1 - forest * 0.18);
    out[2] = lerp(dry * 0.45, lush * 0.5, mixK) * (1 - forest * 0.3);

    // Rocky patches
    const rockPatch = smoothstep(0.35, 0.65, slope);
    if (rockPatch > 0) {
      const g = 0.42 + tint * 0.05;
      out[0] = lerp(out[0], g * 1.05, rockPatch);
      out[1] = lerp(out[1], g, rockPatch);
      out[2] = lerp(out[2], g * 0.9, rockPatch);
    }

    // Dirt roads
    const roadDist = distToRoads(x, z);
    if (roadDist < 2.6) {
      const k = 1 - smoothstep(1.3, 2.6, roadDist);
      out[0] = lerp(out[0], 0.52, k);
      out[1] = lerp(out[1], 0.43, k);
      out[2] = lerp(out[2], 0.31, k);
    }
  }

  /** True if a tree may be placed here. */
  canPlaceTree(x: number, z: number, h: number, slope: number): boolean {
    if (h < 2.6 || h > 62) return false;
    if (slope > 0.52) return false;
    if (distToRoads(x, z) < 3.5) return false;
    const dv = Math.hypot(x - WORLD.villageCenter.x, z - WORLD.villageCenter.z);
    if (dv < 82) return false;
    const dc = Math.hypot(x - WORLD.castlePos.x, z - WORLD.castlePos.z);
    if (dc < 72) return false;
    return true;
  }
}

/** Roads data re-export for chunk builders. */
export { ROADS };
