import { TerrainHeight } from '../src/game/world/TerrainHeight';

const t = new TerrainHeight();

// Coarse grid over the whole ocean: find points where terrain is water (h < -2)
// and compute approximate distance to nearest land via a precomputed land mask.
const STEP = 24;
const HALF = 700;
const N = Math.floor((HALF * 2) / STEP) + 1;
const mask: boolean[] = new Array(N * N); // true = land (h > 0.5)
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const x = -HALF + i * STEP;
    const z = -HALF + j * STEP;
    mask[i * N + j] = t.height(x, z) > 0.5;
  }
}

function distToLand(x: number, z: number): number {
  // ring search on the mask
  const ci = Math.round((x + HALF) / STEP);
  const cj = Math.round((z + HALF) / STEP);
  for (let r = 1; r < N; r++) {
    for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || i >= N) continue;
      for (let j = cj - r; j <= cj + r; j++) {
        if (j < 0 || j >= N) continue;
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue; // ring only
        if (mask[i * N + j]) return Math.hypot(i - ci, j - cj) * STEP;
      }
    }
  }
  return 9999;
}

// Candidate: ocean points ranked by distance to land, tie-break by closeness to map center (0,0)
const cands: Array<{ x: number; z: number; dl: number; dc: number; depth: number }> = [];
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const x = -HALF + i * STEP;
    const z = -HALF + j * STEP;
    const h = t.height(x, z);
    if (h > -2) continue; // needs to be water
    const dl = distToLand(x, z);
    const dc = Math.hypot(x, z);
    cands.push({ x, z, dl, dc, depth: h });
  }
}
// "navel of the ocean": maximize distance to land; among top ones prefer closer to center
cands.sort((a, b) => (b.dl - a.dl) || (a.dc - b.dc));
console.log('TOP 12 ocean navel candidates (max dist-to-land, closest to map center):');
for (const c of cands.slice(0, 12)) {
  console.log(`(${c.x}, ${c.z}) distToLand=${c.dl.toFixed(0)}m distToCenter=${c.dc.toFixed(0)}m depth=${c.depth.toFixed(1)}m`);
}

// Also probe depth at specific candidate points with fine sampling
console.log('\nFine probe around best candidates:');
for (const c of cands.slice(0, 6)) {
  const pts: string[] = [];
  for (const [ox, oz] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [80, 80], [-80, -80]]) {
    pts.push(`(${c.x + ox},${c.z + oz}):${t.height(c.x + ox, c.z + oz).toFixed(1)}`);
  }
  console.log(`center (${c.x},${c.z}) → ${pts.join(' ')}`);
}

// ============ LITERAL OCEAN CENTROID ============
// The centroid of all deep-water cells (h < -2) = "el centro exacto del océano"
let sx = 0, sz = 0, n = 0;
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const x = -HALF + i * STEP;
    const z = -HALF + j * STEP;
    if (t.height(x, z) < -2) { sx += x; sz += z; n++; }
  }
}
const cx = Math.round(sx / n), cz = Math.round(sz / n);
console.log(`\nOCEAN CENTROID = (${cx}, ${cz}) over ${n} water cells`);
console.log(`  depth at centroid: ${t.height(cx, cz).toFixed(1)}`);
console.log(`  distToLand at centroid: ${distToLand(cx, cz).toFixed(0)}m`);

// Search near the centroid for the best island spot: deepest + farthest from land
let best: { x: number; z: number; score: number; dl: number; h: number } | null = null;
for (let r = 0; r <= 260; r += 6) {
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    const x = cx + Math.cos(ang) * r;
    const z = cz + Math.sin(ang) * r;
    const h = t.height(x, z);
    if (h > -2) continue;
    const dl = distToLand(x, z);
    const score = Math.min(dl, 300) * 1.5 + Math.min(-h, 25) - r * 0.35;
    if (!best || score > best.score) best = { x: Math.round(x), z: Math.round(z), score, dl, h };
  }
}
if (best) {
  console.log(`\nBEST ISLAND SPOT near centroid: (${best.x}, ${best.z})`);
  console.log(`  distToLand=${best.dl.toFixed(0)}m depth=${best.h.toFixed(1)}m`);
  console.log(`  probe ring ±90m depths:`);
  const ring: string[] = [];
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const x = best.x + Math.cos(ang) * 90;
    const z = best.z + Math.sin(ang) * 90;
    ring.push(`(${Math.round(x)},${Math.round(z)}):${t.height(x, z).toFixed(0)}`);
  }
  console.log(`  ${ring.join(' ')}`);
  console.log(`  dist to village dock (20,258): ${Math.hypot(best.x - 20, best.z - 258).toFixed(0)}m`);
  console.log(`  dist to Zarpa patrol (110,430): ${Math.hypot(best.x - 110, best.z - 430).toFixed(0)}m`);
  console.log(`  dist to Skarnvind corridor (0,460): ${Math.hypot(best.x, best.z - 460).toFixed(0)}m`);
}

// ============ NAVAL OF THE SEA: remote AND central ============
// maximize distToLand (cap 380) minus a pull toward the literal centroid,
// constrained ≥120 m inside the world boundary (boss arena room).
console.log('\n=== NAVAL-OF-THE-SEA SEARCH (remote + central + inside bounds) ===');
let best2: { x: number; z: number; score: number; dl: number; h: number; dc: number } | null = null;
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const x = -HALF + i * STEP;
    const z = -HALF + j * STEP;
    if (Math.abs(x) > 590 || Math.abs(z) > 590) continue; // arena margin
    const h = t.height(x, z);
    if (h > -3) continue;
    const dl = distToLand(x, z);
    const dc = Math.hypot(x - cx, z - cz);
    const score = Math.min(dl, 380) - 0.55 * dc;
    if (!best2 || score > best2.score) best2 = { x, z, score, dl, h, dc };
  }
}
if (best2) {
  console.log(`NAVAL = (${best2.x}, ${best2.z})`);
  console.log(`  distToLand=${best2.dl.toFixed(0)}m depth=${best2.h.toFixed(1)}m distToCentroid=${best2.dc.toFixed(0)}m`);
  const ring: string[] = [];
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const x = best2.x + Math.cos(ang) * 110;
    const z = best2.z + Math.sin(ang) * 110;
    ring.push(`(${Math.round(x)},${Math.round(z)}):${t.height(x, z).toFixed(0)}`);
  }
  console.log(`  ring ±110m: ${ring.join(' ')}`);
  console.log(`  dist to dock: ${Math.hypot(best2.x - 20, best2.z - 258).toFixed(0)}m`);
  // top 8 alternatives for context
  const alts: Array<{x:number;z:number;s:number}> = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = -HALF + i * STEP, z = -HALF + j * STEP;
    if (Math.abs(x) > 590 || Math.abs(z) > 590) continue;
    const h = t.height(x, z);
    if (h > -3) continue;
    const dl = distToLand(x, z);
    const dc = Math.hypot(x - cx, z - cz);
    alts.push({ x, z, s: Math.min(dl, 380) - 0.55 * dc });
  }
  alts.sort((a, b) => b.s - a.s);
  console.log('  top alternatives:', alts.slice(0, 8).map(a => `(${a.x},${a.z})`).join(' '));
}
