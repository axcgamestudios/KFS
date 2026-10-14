// probe_f22_grid.ts — find flat walkable spots near the 3 problem sites.
import { TerrainHeight } from '../src/game/world/TerrainHeight';

const t = new TerrainHeight(1234);

const scan = (name: string, cx: number, cz: number, r: number) => {
  console.log(`--- ${name} (center ${cx},${cz}) ---`);
  let best: [number, number, number, number] = [cx, cz, t.height(cx, cz), 99];
  for (let x = cx - r; x <= cx + r; x += 4) {
    for (let z = cz - r; z <= cz + r; z += 4) {
      const h = t.height(x, z);
      if (h < 1.2) continue;
      const hx = t.height(x + 1.5, z) - t.height(x - 1.5, z);
      const hz = t.height(x, z + 1.5) - t.height(x, z - 1.5);
      const slope = Math.hypot(hx, hz) / 3;
      if (slope < best[3]) best = [x, z, h, slope];
    }
  }
  console.log(`BEST: (${best[0]}, ${best[1]}) h=${best[2].toFixed(2)} slope=${(best[3] * 100).toFixed(0)}%`);
};

scan('Storm Ronin / Mist Isles', -20, 640, 24);
scan('Samurai C / Mist Isles south', -28, 655, 20);
scan('Sister Ysolt / Sanctuary', 160, 276, 20);
