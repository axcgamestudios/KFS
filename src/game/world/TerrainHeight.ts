import { Noise } from '../core/Noise';
import { WORLD, WORLD_SEED, ROADS, ISLANDS, FLATS, distToRoads, gauss } from './WorldConfig';
import { clamp, smoothstep, lerp } from '../core/MathUtils';

/** Per-island precomputed bounds for fast rejection in height(). */
interface IslandBounds {
  id: string;
  x: number; z: number;
  radius: number;
  height: number;
  biome: 'volcanic' | 'sandy' | 'meadow';
  /** Beyond this distance the island contributes nothing. */
  maxDist: number;
}

/**
 * Analytic terrain of the island of Aldmor plus the outer isles of the
 * Forgotten Seas. The same height() function is used to generate chunk
 * meshes, place vegetation, clamp the player and NPCs, float the ships and
 * pre-render the world map — guaranteeing perfect consistency.
 */
export class TerrainHeight {
  readonly noise: Noise;
  private nCoast: Noise;
  private nHills: Noise;
  private nDetail: Noise;
  private nMountain: Noise;
  private nTint: Noise;
  private islandBounds: IslandBounds[];

  constructor(seed = WORLD_SEED) {
    this.noise = new Noise(seed);
    this.nCoast = new Noise(seed + 11);
    this.nHills = new Noise(seed + 23);
    this.nDetail = new Noise(seed + 37);
    this.nMountain = new Noise(seed + 53);
    this.nTint = new Noise(seed + 71);
    this.islandBounds = ISLANDS.map((i) => ({
      id: i.id, x: i.x, z: i.z, radius: i.radius, height: i.height, biome: i.biome,
      maxDist: i.radius * 1.35 + 24,
    }));
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
    let height = lerp(oceanFloor, land, islandMask);

    // --- Outer isles: applied AFTER the main-island blend so the open-sea
    // mask never erases them. Each isle brings its own mass + shallow shelf. ---
    for (const isl of this.islandBounds) {
      const dx = x - isl.x;
      const dz = z - isl.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > isl.maxDist * isl.maxDist) continue;
      const dist = Math.sqrt(d2);
      const wob = this.nCoast.noise2(x * 0.012 + isl.x * 0.1, z * 0.012 - isl.z * 0.1) * 0.16;
      const edge = isl.radius * (1 + wob);
      const mask = 1 - smoothstep(edge - 26, edge + 16, dist);
      if (mask <= 0.01) continue;
      const relief = this.nHills.fbm(x * 0.02 + isl.z, z * 0.02 - isl.x, 4) * 0.5 + 0.5;
      const peak = Math.pow(mask, 1.25);
      const islandH = isl.height * peak * (0.5 + relief * 0.75) - (1 - mask) * 9;
      if (islandH > height) height = islandH;
    }

    // --- Flattened build sites on the isles (fort, lighthouse, camp) ---
    for (const flat of FLATS) {
      const dx = x - flat.x;
      const dz = z - flat.z;
      if (dx * dx + dz * dz > flat.r * flat.r * 2.4) continue;
      const m = gauss(dx, dz, flat.r);
      if (m <= 0.02) continue;
      const top = flat.h + this.nDetail.fbm(x * 0.06, z * 0.06, 2) * 0.7;
      height = lerp(height, top, clamp(m * 1.45, 0, 1));
    }

    return height;
  }

  /** The island whose region contains this point (null = main island/ocean). */
  islandAt(x: number, z: number): IslandBounds | null {
    for (const isl of this.islandBounds) {
      const d = Math.hypot(x - isl.x, z - isl.z);
      if (d < isl.radius * 1.05) return isl;
    }
    return null;
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
    let density = clamp(base * (0.45 + 0.75 * patches), 0, 1);
    // Sparse groves on the outer isles (pines on volcanic rock)
    const isl = this.islandAt(x, z);
    if (isl && isl.biome === 'volcanic') {
      const grove = clamp(this.noise.fbm(x * 0.02 - 300, z * 0.02 + 300, 3) * 0.5 + 0.5, 0, 1);
      density = Math.max(density, grove * 0.55);
    }
    return density;
  }

  /** Terrain albedo color at a point (vertex color). Returns [r,g,b]. */
  colorAt(x: number, z: number, h: number, slope: number, out: [number, number, number]): void {
    const tint = this.nTint.noise2(x * 0.05, z * 0.05);
    const macro = this.nTint.fbm(x * 0.013, z * 0.013, 3);

    // --- Outer isle biomes ---
    const isl = this.islandAt(x, z);
    if (isl) {
      if (isl.biome === 'volcanic') {
        // Black basalt with ash meadows and pale lichen
        if (h < 1.6 && slope < 0.4) {
          out[0] = 0.42 + tint * 0.05; out[1] = 0.38 + tint * 0.05; out[2] = 0.34;
        } else if (h > isl.height * 0.66) {
          const g = 0.28 + tint * 0.05;
          out[0] = g * 1.1; out[1] = g; out[2] = g * 1.02;
        } else {
          const g = 0.3 + tint * 0.06;
          out[0] = g * 1.08; out[1] = g * 1.04; out[2] = g * 0.98;
          const ashK = clamp(0.35 + macro * 0.5, 0, 1) * (1 - smoothstep(0.5, 0.75, slope));
          out[0] = lerp(out[0], 0.34, ashK);
          out[1] = lerp(out[1], 0.4, ashK);
          out[2] = lerp(out[2], 0.26, ashK);
        }
        if (slope > 0.66) {
          const g = 0.2 + tint * 0.04;
          out[0] = g; out[1] = g; out[2] = g * 1.05;
        }
        return;
      }
      // sandy isles: white sand + dune grass + palm greenery pockets
      if (h < 4.5 && slope < 0.45) {
        out[0] = 0.88 + tint * 0.04; out[1] = 0.83 + tint * 0.04; out[2] = 0.68 + tint * 0.03;
        return;
      }
      const palm = clamp(this.noise.fbm(x * 0.03 + 400, z * 0.03, 3) * 0.5 + 0.55, 0, 1);
      out[0] = lerp(0.55, 0.32, palm);
      out[1] = lerp(0.58, 0.5, palm);
      out[2] = lerp(0.38, 0.3, palm);
      if (slope > 0.6) {
        const g = 0.5 + tint * 0.05;
        out[0] = g; out[1] = g * 0.96; out[2] = g * 0.86;
      }
      return;
    }

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
    // Keep the isle build sites clear
    for (const flat of FLATS) {
      if (Math.hypot(x - flat.x, z - flat.z) < flat.r * 0.95) return false;
    }
    // Outer isles: allow trees anywhere sensible (no roads there)
    const isl = this.islandAt(x, z);
    if (isl) {
      if (isl.biome === 'sandy' && h > 3 && slope < 0.4) return true;
      if (isl.biome === 'volcanic' && h > 3.5 && h < isl.height * 0.8 && slope < 0.5) return true;
      return false;
    }
    const dv = Math.hypot(x - WORLD.villageCenter.x, z - WORLD.villageCenter.z);
    if (dv < 82) return false;
    const dc = Math.hypot(x - WORLD.castlePos.x, z - WORLD.castlePos.z);
    if (dc < 72) return false;
    return true;
  }
}

/** Roads data re-export for chunk builders. */
export { ROADS };
