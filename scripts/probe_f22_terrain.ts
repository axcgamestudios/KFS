// probe_f22_terrain.ts — verify the four F22 structure sites sit on walkable
// ground (above water, gentle slope) using the REAL terrain function.
import { TerrainHeight } from '../src/game/world/TerrainHeight';

const SITES: Array<[string, number, number]> = [
  ['Great Anvil (village)', 45, 166],
  ['Altar of the Gods (Circle of Vigils)', -148, -268],
  ['Anvil of the Titans (Nest)', 26, -292],
  ['First Light cache (lighthouse)', 570, 102],
  ['Pirate King spawn', -536, -455],
  ['Storm Ronin spawn', -20, 640],
  ['Samurai A', -38, 610],
  ['Samurai B', 6, 632],
  ['Samurai C', -28, 655],
  ['Sister Ysolt (sanctuary)', 160, 276],
];

const t = new TerrainHeight(1234);
let ok = 0;
for (const [name, x, z] of SITES) {
  const h = t.height(x, z);
  // slope estimate: sample ±1.5m
  const hx = t.height(x + 1.5, z) - t.height(x - 1.5, z);
  const hz = t.height(x, z + 1.5) - t.height(x, z - 1.5);
  const slope = Math.hypot(hx, hz) / 3;
  const good = h > 0.6 && slope < 0.55;
  if (good) ok++;
  console.log(`${good ? 'PASS' : 'WARN'} ${name}: h=${h.toFixed(2)} slope=${(slope * 100).toFixed(0)}%`);
}
console.log(`${ok}/${SITES.length} sites pass`);
