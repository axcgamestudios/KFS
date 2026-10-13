import { TerrainHeight } from '../src/game/world/TerrainHeight';
const t = new TerrainHeight();
console.log('Isla Ombligo profile (center 476,476):');
for (const r of [0, 15, 25, 32, 40, 50, 62, 75, 90, 110, 140]) {
  const pts: number[] = [];
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2;
    pts.push(t.height(476 + Math.cos(ang) * r, 476 + Math.sin(ang) * r));
  }
  console.log(`r=${r}: ${pts.map(h => h.toFixed(1)).join(' ')}`);
}
// ship route verification
console.log('\nZarpa waypoints depth:', [[110,430],[-60,480],[60,540]].map(([x,z]) => `(${x},${z}):${t.height(x,z).toFixed(1)}`).join(' '));
console.log('Gaviota waypoints depth:', [[-425,-308],[-560,-250],[-600,-620],[-350,-500]].map(([x,z]) => `(${x},${z}):${t.height(x,z).toFixed(1)}`).join(' '));
// boss arena ring depth (king circles the island)
console.log('\nArena ring r=100:', [0,1,2,3,4,5].map(a => t.height(476 + Math.cos(a) * 100, 476 + Math.sin(a) * 100).toFixed(1)).join(' '));
console.log('Arena ring r=140:', [0,1,2,3,4,5].map(a => t.height(476 + Math.cos(a) * 140, 476 + Math.sin(a) * 140).toFixed(1)).join(' '));
