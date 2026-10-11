import { TerrainHeight } from '../src/game/world/TerrainHeight';
const t = new TerrainHeight();
// Grid scan of the mountain massif to find high ridges
let best: Array<{x:number;z:number;h:number}> = [];
for (let x = -60; x <= 160; x += 20) {
  for (let z = -480; z <= -180; z += 20) {
    const h = t.height(x, z);
    best.push({ x, z, h });
  }
}
best.sort((a, b) => b.h - a.h);
console.log('TOP 15 highest points:');
for (const p of best.slice(0, 15)) console.log(`(${p.x}, ${p.z}) h=${p.h.toFixed(1)}`);
// Probe a possible ascent route from the north side of the island toward (40,-320)
console.log('\nRoute probe from waterfall area up the massif (west→east ridge):');
for (const [x, z] of [[-95,-195],[-60,-250],[-20,-280],[10,-300],[40,-320],[70,-300],[100,-260],[130,-220],[160,-180]]) {
  console.log(`(${x}, ${z}) h=${t.height(x, z).toFixed(1)} slope=${t.slope(x, z).toFixed(2)}`);
}
