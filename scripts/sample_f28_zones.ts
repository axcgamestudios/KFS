// sample_f28_zones.ts — calibrate legendary event zones: find summits (>30m),
// mountain bands, plains, deep sea extents and village safe radii.
import { TerrainHeight } from '../src/game/world/TerrainHeight';

const terrain = new TerrainHeight(1234);

// 1. height histogram over the world grid
let n = 0;
const bands = new Map<string, number>();
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (let x = -700; x <= 700; x += 10) {
  for (let z = -700; z <= 700; z += 10) {
    const h = terrain.height(x, z);
    n++;
    let b: string;
    if (h < -8) b = 'deep(<-8)';
    else if (h < 0) b = 'shallow(-8..0)';
    else if (h < 3) b = 'beach(0..3)';
    else if (h < 12) b = 'plains(3..12)';
    else if (h < 20) b = 'hills(12..20)';
    else if (h < 30) b = 'mountain(20..30)';
    else b = 'SUMMIT(>30)';
    bands.set(b, (bands.get(b) ?? 0) + 1);
    if (h > 30) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
}
console.log('bands (% of world):');
for (const [k, v] of [...bands.entries()].sort()) console.log(`  ${k}: ${(100 * v / n).toFixed(1)}%`);
console.log('summit bbox:', { minX, maxX, minZ, maxZ });

// 2. highest peaks (local maxima)
const peaks: Array<{ x: number; z: number; h: number }> = [];
for (let x = -680; x <= 680; x += 20) {
  for (let z = -680; z <= 680; z += 20) {
    const h = terrain.height(x, z);
    if (h < 32) continue;
    let isMax = true;
    for (let dx = -20; dx <= 20 && isMax; dx += 20) {
      for (let dz = -20; dz <= 20 && isMax; dz += 20) {
        if (dx === 0 && dz === 0) continue;
        if (terrain.height(x + dx, z + dz) > h) isMax = false;
      }
    }
    if (isMax) peaks.push({ x, z, h: Math.round(h * 10) / 10 });
  }
}
peaks.sort((a, b) => b.h - a.h);
console.log('top peaks:', peaks.slice(0, 12));

// 3. known POIs for zone exclusion
const pois: Array<[string, number, number]> = [
  ['crowhaven', 24, 162], ['navel', 476, 476], ['mist_temple', -12, 616],
  ['crow_fortress', -536, -455], ['ancestor_nest', 20, -300],
  ['sanctuary', 0, 0],
];
for (const [name, x, z] of pois) {
  console.log(`${name} (${x},${z}) height: ${terrain.height(x, z).toFixed(1)}`);
}
