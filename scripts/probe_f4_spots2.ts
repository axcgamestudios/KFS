// Refined scan for Fase 4 POI locations.
import { TerrainHeight } from '../src/game/world/TerrainHeight';

const t = new TerrainHeight();

console.log('-- Shallow sanctuary (-3..-5.5m, low slope) near main island coast --');
for (let x = 20; x <= 200; x += 10) {
  for (let z = 200; z <= 360; z += 10) {
    const h = t.height(x, z);
    if (h < -2.8 && h > -5.5) {
      // count neighbours also in range (area check)
      let ok = 0;
      for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
        const hh = t.height(x + dx, z + dz);
        if (hh < -2 && hh > -6.5) ok++;
      }
      if (ok >= 3) console.log(`  (${x},${z}) h=${h.toFixed(1)} ok=${ok}`);
    }
  }
}

console.log('-- Crow Isle shoreline ring (h 0.5..4, slope<0.5) --');
for (let a = 0; a < 360; a += 10) {
  const rad = (a * Math.PI) / 180;
  for (let r = 200; r <= 330; r += 10) {
    const x = -620 + Math.cos(rad) * r;
    const z = -520 + Math.sin(rad) * r;
    const h = t.height(x, z);
    if (h > 0.5 && h < 4) {
      const slope = t.slope(x, z, h);
      if (slope < 0.5) console.log(`  (${x.toFixed(0)},${z.toFixed(0)}) h=${h.toFixed(1)} s=${slope.toFixed(2)} r=${r} a=${a}`);
    }
  }
}

console.log('-- Great Maple flat (h 12..30, slope<0.3, north valley) --');
for (let x = -160; x <= 0; x += 10) {
  for (let z = -320; z <= -180; z += 10) {
    const h = t.height(x, z);
    if (h > 12 && h < 32) {
      const slope = t.slope(x, z, h);
      if (slope < 0.3) {
        const fm = t.forestMask(x, z);
        console.log(`  (${x},${z}) h=${h.toFixed(1)} s=${slope.toFixed(2)} fm=${fm.toFixed(2)}`);
      }
    }
  }
}

console.log('-- East shore for treasure dig (main island, h 1.5..3.5) --');
for (let x = 380; x <= 560; x += 10) {
  for (let z = 60; z <= 280; z += 10) {
    const h = t.height(x, z);
    if (h > 1.5 && h < 3.5) {
      const slope = t.slope(x, z, h);
      if (slope < 0.4) console.log(`  (${x},${z}) h=${h.toFixed(1)} s=${slope.toFixed(2)}`);
    }
  }
}

console.log('-- Wild horse meadows (slope<0.35, h 8..25) --');
for (let x = -260; x <= -40; x += 10) {
  for (let z = -200; z <= 20; z += 10) {
    const h = t.height(x, z);
    if (h > 8 && h < 25) {
      const slope = t.slope(x, z, h);
      if (slope < 0.3) console.log(`  (${x},${z}) h=${h.toFixed(1)} s=${slope.toFixed(2)}`);
    }
  }
}
