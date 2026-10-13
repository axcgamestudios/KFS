/**
 * KFS — COMPLETE WORLD MAP RENDERER (no fog of war).
 * Renders the full [-716, 716] world from the REAL game terrain code
 * (same algorithm as GameWorld.renderMapCanvas, at 4x resolution)
 * and emits the cartography HTML page for the final screenshot.
 *
 * Outputs:
 *   scripts/map_base.rgba    (2048x2048 raw RGBA terrain)
 *   scripts/map_page.html    (cartography overlay page)
 */
import { TerrainHeight } from '../src/game/world/TerrainHeight';
import { POIS, ROADS } from '../src/game/world/WorldConfig';

const SIZE = 2048;
const HALF = 716;
const SPACING = (HALF * 2) / (SIZE - 1);

const terrain = new TerrainHeight();
// heightRaw is private in TS but public at runtime — skips the hCache thrash.
const heightRaw = (terrain as unknown as {
  heightRaw: (x: number, z: number) => number;
}).heightRaw.bind(terrain);

console.log('[1/3] Sampling terrain height grid', SIZE, 'x', SIZE, '...');
const H = new Float32Array(SIZE * SIZE);
for (let j = 0; j < SIZE; j++) {
  const z = -HALF + j * SPACING;
  const row = j * SIZE;
  for (let i = 0; i < SIZE; i++) {
    H[row + i] = heightRaw(-HALF + i * SPACING, z);
  }
  if (j % 256 === 0) console.log('   height', ((j / SIZE) * 100) | 0, '%');
}

console.log('[2/3] Painting terrain colors + hillshade + water ...');
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const SLOPE_STEP = Math.round(1.4 / SPACING); // = 2 px  (game uses e=1.4)
const SHADE_STEP = Math.round(8 / SPACING);   // = 11 px (game uses 8 m)
const rgba = new Uint8Array(SIZE * SIZE * 4);
const col: [number, number, number] = [0, 0, 0];

const at = (i: number, j: number) =>
  H[Math.min(SIZE - 1, Math.max(0, j)) * SIZE + Math.min(SIZE - 1, Math.max(0, i))];

for (let j = 0; j < SIZE; j++) {
  const z = -HALF + j * SPACING;
  for (let i = 0; i < SIZE; i++) {
    const x = -HALF + i * SPACING;
    const h = H[j * SIZE + i];
    const idx = (j * SIZE + i) * 4;

    // slope (finite differences, same formula as TerrainHeight.slope)
    const dxs = (at(i + SLOPE_STEP, j) - h) / 1.4;
    const dzs = (at(i, j + SLOPE_STEP) - h) / 1.4;
    const slope = Math.min(1, Math.sqrt(dxs * dxs + dzs * dzs) * 0.9);

    terrain.colorAt(x, z, h, slope, col);

    // Hillshade: light from NW (game formula)
    const hx = at(i - SHADE_STEP, j) - h;
    const hz = at(i, j - SHADE_STEP) - h;
    const shade = clamp(1 + (hx + hz) * 0.04, 0.55, 1.25);

    let r: number, g: number, b: number;
    if (h < 0) {
      // Water depth blues (game formula)
      const deep = Math.min(1, -h / 14);
      r = 30 + (1 - deep) * 40;
      g = 58 + (1 - deep) * 50;
      b = 74 + (1 - deep) * 46;
    } else {
      r = Math.min(255, col[0] * 235 * shade);
      g = Math.min(255, col[1] * 235 * shade);
      b = Math.min(255, col[2] * 235 * shade);
    }
    // Sepia tint for parchment feel (game formula)
    const avg = (r + g + b) / 3;
    r = Math.min(255, r * 0.9 + avg * 0.12 + 14);
    g = Math.min(255, g * 0.9 + avg * 0.08 + 8);
    b = Math.min(255, b * 0.9 + avg * 0.05);

    rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = 255;
  }
  if (j % 256 === 0) console.log('   paint', ((j / SIZE) * 100) | 0, '%');
}

// Coast ink pass: darken land pixels near water (nautical chart coastline)
console.log('[3/3] Inking coastlines ...');
const isWater = new Uint8Array(SIZE * SIZE);
for (let p = 0; p < SIZE * SIZE; p++) isWater[p] = H[p] < 0 ? 1 : 0;
const INK = 0.24;
for (let j = 0; j < SIZE; j++) {
  for (let i = 0; i < SIZE; i++) {
    const p = j * SIZE + i;
    if (isWater[p]) continue;
    let near = false;
    for (let dj = -2; dj <= 2 && !near; dj++) {
      for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= SIZE || jj >= SIZE) continue;
        if (isWater[jj * SIZE + ii]) { near = true; break; }
      }
    }
    if (!near) continue;
    const idx = p * 4;
    rgba[idx] = rgba[idx] * (1 - INK) + 42 * INK;
    rgba[idx + 1] = rgba[idx + 1] * (1 - INK) + 33 * INK;
    rgba[idx + 2] = rgba[idx + 2] * (1 - INK) + 24 * INK;
  }
}

// Write raw RGBA (converted to PNG by map_rgba2png.js)
await Bun.write('/home/z/my-project/scripts/map_base.rgba', rgba);
console.log('map_base.rgba written:', (rgba.length / 1048576).toFixed(1), 'MB');

// ---------------------------------------------------------------------------
// Cartography data — POIs from the real WorldConfig + hand-tuned label layout
// (dx/dy offsets in px, anchor, leader lines, flavor sub-labels).
// ---------------------------------------------------------------------------
interface PoiLayout {
  id: string; name: string; x: number; z: number;
  anchor?: 'center' | 'start' | 'end';
  dx?: number; dy?: number;
  leader?: [number, number];
  gold?: boolean;
  sub?: string; subDy?: number; subStyle?: 'dragon' | 'gold' | 'lore';
}
const byId = new Map(POIS.map((p) => [p.id, p]));
const L: PoiLayout[] = [
  { id: 'village', name: byId.get('village')!.name, x: 20, z: 150, gold: true, sub: 'Home Port', subDy: 44, subStyle: 'gold' },
  { id: 'castle', name: byId.get('castle')!.name, x: 110, z: -40 },
  { id: 'waterfall', name: byId.get('waterfall')!.name, x: -95, z: -195, dy: 42 },
  { id: 'ruins', name: byId.get('ruins')!.name, x: -240, z: -140, anchor: 'end', dx: -26, dy: 6, sub: 'Lair of Vaelthara · Warden of the Ruins', subDy: 48 },
  { id: 'stones', name: byId.get('stones')!.name, x: -140, z: -260, anchor: 'end', dx: -26, dy: 6 },
  { id: 'granarce', name: byId.get('granarce')!.name, x: -120, z: -270, anchor: 'start', dx: 30, dy: 72, leader: [16, 64] },
  { id: 'wreck', name: byId.get('wreck')!.name, x: -330, z: 190 },
  { id: 'tower', name: byId.get('tower')!.name, x: 300, z: 60 },
  { id: 'grotto', name: byId.get('grotto')!.name, x: 200, z: -180 },
  { id: 'peak', name: byId.get('peak')!.name, x: 40, z: -320 },
  { id: 'nido', name: byId.get('nido')!.name, x: 20, z: -300, dy: 42, sub: 'Vaelyx · Ancestor of the Iceclaw Peaks', subDy: 70 },
  { id: 'fortaleza', name: byId.get('fortaleza')!.name, x: -540, z: -450, anchor: 'end', dx: -26, dy: 6, sub: 'Kraivenn · The Three-Headed Crow', subDy: 52 },
  { id: 'faro', name: byId.get('faro')!.name, x: 575, z: 108, anchor: 'end', dx: -24, dy: 6 },
  { id: 'ombligo', name: byId.get('ombligo')!.name, x: 476, z: 476, sub: 'Domain of the King of the Sea', subDy: 44, subStyle: 'lore' },
  { id: 'bruma', name: byId.get('bruma')!.name, x: -15, z: 622, sub: 'Skarnvind · Wyvern of the Mists', subDy: 44 },
  { id: 'santuario', name: byId.get('santuario')!.name, x: 160, z: 270, sub: 'City of the Sunken Kings', subDy: 44, subStyle: 'lore' },
  { id: 'cala', name: byId.get('cala')!.name, x: -398, z: -450 },
  { id: 'insignia', name: byId.get('insignia')!.name, x: -360, z: -490, dy: -30 },
];

const data = {
  mapImage: 'map_base.png',
  pois: L,
  islandLabels: [{ name: 'OLD CROW ISLE', x: -520, z: -360 }],
  bigLabels: [
    { text: 'THE ISLE OF ALDMOR', x: 90, z: -140, size: 34, color: 'rgba(42,33,24,0.62)' },
    { text: 'THE FORGOTTEN SEAS', x: -380, z: 430, size: 46, italic: true, rot: -8, color: 'rgba(16,28,40,0.55)' },
  ],
  roads: ROADS.map((r) => r.map((p) => [p.x, p.z])),
};

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:0;background:#d3c5a5}canvas{display:block}</style>
</head><body>
<canvas id="c" width="2320" height="2560"></canvas>
<script>
window.__ready = false;
const DATA = ${JSON.stringify(data)};
const W = 2320, H = 2560, MS = 2048, MX = 136, MY = 330, HALF = 716, SPAN = 1432;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const w2x = (x) => MX + ((x + HALF) / SPAN) * MS;
const w2y = (z) => MY + ((z + HALF) / SPAN) * MS;

// Deterministic parchment speckle
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd = mulberry32(20261010);

function haloText(text, x, y, font, fill, halo, ls, align){
  ctx.font = font; ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
  try { ctx.letterSpacing = (ls || 0) + 'px'; } catch(e) {}
  if (halo) { ctx.strokeStyle = halo; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); }
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
  try { ctx.letterSpacing = '0px'; } catch(e) {}
}

async function main(){
  // ---- assets ----
  const img = new Image(); img.src = DATA.mapImage; await img.decode();
  await Promise.all([
    document.fonts.load('700 60px Cinzel'),
    document.fonts.load('600 21px Cinzel'),
    document.fonts.load('600 26px "EB Garamond"'),
    document.fonts.load('italic 500 19px "EB Garamond"'),
  ]);
  await document.fonts.ready;

  const INK = '#2a2118', GOLD = '#b98f2e', HALO = 'rgba(213,196,158,0.85)';

  // ---- parchment background ----
  ctx.fillStyle = '#d3c5a5'; ctx.fillRect(0, 0, W, H);
  for (let n = 0; n < 9000; n++) {
    const x = rnd() * W, y = rnd() * H, s = rnd() * 2 + 0.4;
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(42,33,24,' + (rnd()*0.045).toFixed(3) + ')' : 'rgba(255,248,225,' + (rnd()*0.05).toFixed(3) + ')';
    ctx.fillRect(x, y, s, s);
  }
  // aging stains (corners)
  const stains = [[250,150,130,0.10],[2150,2350,160,0.09],[150,2380,110,0.08],[2210,180,95,0.08],[1160,1310,240,0.05]];
  for (const [sx,sy,sr,sa] of stains) {
    const g = ctx.createRadialGradient(sx,sy,0,sx,sy,sr);
    g.addColorStop(0, 'rgba(110,80,35,' + sa + ')'); g.addColorStop(1, 'rgba(110,80,35,0)');
    ctx.fillStyle = g; ctx.fillRect(sx-sr, sy-sr, sr*2, sr*2);
  }

  // ---- decorative double border + corner diamonds ----
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(40, 40, W-80, H-80);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.2; ctx.strokeRect(54, 54, W-108, H-108);
  for (const [cx, cy] of [[48,48],[W-48,48],[48,H-48],[W-48,H-48]]) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI/4);
    ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.fillRect(-9,-9,18,18); ctx.strokeRect(-9,-9,18,18); ctx.restore();
  }

  // ---- title cartouche ----
  ctx.fillStyle = 'rgba(42,33,24,0.05)'; ctx.fillRect(420, 68, 1480, 190);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(420, 68, 1480, 190);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.strokeRect(430, 78, 1460, 170);
  let ts = 56;
  ctx.font = '700 ' + ts + 'px Cinzel'; try { ctx.letterSpacing = '12px'; } catch(e) {}
  while (ctx.measureText('KINGDOMS OF THE FORGOTTEN SEAS').width > 1400 && ts > 40) {
    ts -= 2; ctx.font = '700 ' + ts + 'px Cinzel';
  }
  try { ctx.letterSpacing = '0px'; } catch(e) {}
  haloText('KINGDOMS OF THE FORGOTTEN SEAS', W/2, 168, '700 ' + ts + 'px Cinzel', INK, null, 12);
  haloText('Nautical Chart · The Isle of Aldmor & the Forgotten Seas', W/2, 226, 'italic 500 30px "EB Garamond"', '#4a3826', null, 1);
  // flank ornaments
  for (const s of [-1, 1]) {
    const ox = W/2 + s * 640;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(ox + s*14, 218); ctx.lineTo(ox + s*120, 218); ctx.stroke();
    ctx.save(); ctx.translate(ox, 218); ctx.rotate(Math.PI/4);
    ctx.fillStyle = GOLD; ctx.fillRect(-5,-5,10,10); ctx.restore();
  }

  // ---- map ----
  ctx.fillStyle = '#c9bb9c'; ctx.fillRect(MX, MY, MS, MS);
  ctx.drawImage(img, MX, MY, MS, MS);
  // grid (cartographer feel, 8 divisions)
  ctx.strokeStyle = 'rgba(42,33,24,0.10)'; ctx.lineWidth = 1.2;
  for (let g = 0; g <= 8; g++) {
    const p = MX + (g/8) * MS;
    ctx.beginPath(); ctx.moveTo(p, MY); ctx.lineTo(p, MY+MS); ctx.stroke();
    const q = MY + (g/8) * MS;
    ctx.beginPath(); ctx.moveTo(MX, q); ctx.lineTo(MX+MS, q); ctx.stroke();
  }
  // map frame
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(MX-2, MY-2, MS+4, MS+4);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.strokeRect(MX-7, MY-7, MS+14, MS+14);

  // ---- edge vignette ----
  const corners = [[0,0],[W,0],[0,H],[W,H]];
  for (const [cx, cy] of corners) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 700);
    g.addColorStop(0, 'rgba(42,33,24,0.26)'); g.addColorStop(1, 'rgba(42,33,24,0)');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  }

  // ---- roads (dashed trails) ----
  ctx.save(); ctx.setLineDash([11, 9]); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(66,45,22,0.62)'; ctx.lineWidth = 3.2;
  for (const road of DATA.roads) {
    ctx.beginPath();
    road.forEach(([x, z], k) => k ? ctx.lineTo(w2x(x), w2y(z)) : ctx.moveTo(w2x(x), w2y(z)));
    ctx.stroke();
  }
  ctx.restore();

  // ---- big geographic labels ----
  for (const L2 of DATA.bigLabels) {
    const cx = w2x(L2.x), cy = w2y(L2.z);
    ctx.save();
    if (L2.rot) { ctx.translate(cx, cy); ctx.rotate(L2.rot * Math.PI / 180); ctx.translate(-cx, -cy); }
    haloText(L2.text, cx, cy, (L2.italic ? 'italic 500 ' : '700 ') + L2.size + 'px ' + (L2.italic ? '"EB Garamond"' : 'Cinzel'), L2.color, 'rgba(213,196,158,0.55)', L2.italic ? 14 : 9);
    ctx.restore();
  }
  // ---- island labels ----
  for (const L2 of DATA.islandLabels) {
    haloText(L2.name, w2x(L2.x), w2y(L2.z), '600 21px Cinzel', 'rgba(42,33,24,0.72)', HALO, 8);
  }

  // ---- compass rose (open water, SE region) ----
  const ccx = w2x(555), ccy = w2y(265), R = 88;
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ccx, ccy, R, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ccx, ccy, R*0.64, 0, Math.PI*2); ctx.stroke();
  const pts = 8;
  for (let k = 0; k < pts; k++) {
    const a = -Math.PI/2 + k * Math.PI/4;
    const len = k % 2 === 0 ? R * 0.96 : R * 0.55;
    const tx = ccx + Math.cos(a) * len, ty = ccy + Math.sin(a) * len;
    const w = R * 0.11;
    const px = Math.cos(a + Math.PI/2) * w, py = Math.sin(a + Math.PI/2) * w;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ccx + px, ccy + py); ctx.lineTo(ccx, ccy); ctx.closePath();
    ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ccx - px, ccy - py); ctx.lineTo(ccx, ccy); ctx.closePath();
    ctx.fillStyle = GOLD; ctx.fill();
  }
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ccx, ccy, 4, 0, Math.PI*2); ctx.fill();
  haloText('N', ccx, ccy - R - 16, '700 30px Cinzel', INK, HALO, 0);

  // ---- POI markers + labels ----
  for (const p of DATA.pois) {
    const mx = w2x(p.x), my = w2y(p.z);
    if (p.leader) {
      ctx.strokeStyle = 'rgba(42,33,24,0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(mx, my + 6); ctx.lineTo(mx + p.leader[0], my + p.leader[1]); ctx.stroke();
    }
    if (p.gold) {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = 'rgba(185,143,46,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI*2); ctx.stroke();
    }
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8a2f2f'; ctx.beginPath(); ctx.arc(mx, my, 4.6, 0, Math.PI*2); ctx.fill();

    const anchor = p.anchor || 'center';
    const tx = p.anchor ? mx + (p.dx || 0) : mx;
    const ty = my + (p.dy !== undefined ? p.dy : -21);
    const ax = anchor === 'end' ? 'right' : anchor === 'start' ? 'left' : 'center';
    haloText(p.name, tx, ty, '600 26px "EB Garamond"', INK, HALO, 0.4, ax);
    if (p.sub) {
      const style = p.subStyle || 'dragon';
      const col2 = style === 'gold' ? '#7a5a17' : style === 'lore' ? '#4a3826' : '#6b3116';
      haloText(p.sub, mx, my + (p.subDy || 36), 'italic 500 19px "EB Garamond"', col2, HALO, 0.3);
    }
  }

  // ---- legend band ----
  const ly = 2452, lf = '400 24px "EB Garamond"';
  // POI marker
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(212, ly, 7, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#8a2f2f'; ctx.beginPath(); ctx.arc(212, ly, 4.6, 0, Math.PI*2); ctx.fill();
  haloText('Point of interest', 232, ly + 8, lf, INK, null, 0, 'left');
  // home port
  ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(590, ly, 12, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(590, ly, 7, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#8a2f2f'; ctx.beginPath(); ctx.arc(590, ly, 4.6, 0, Math.PI*2); ctx.fill();
  haloText('Home port — Crowhaven', 612, ly + 8, lf, INK, null, 0, 'left');
  // road sample
  ctx.save(); ctx.setLineDash([11, 9]); ctx.strokeStyle = 'rgba(66,45,22,0.75)'; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(1000, ly); ctx.lineTo(1072, ly); ctx.stroke(); ctx.restore();
  haloText('Road / trail', 1088, ly + 8, lf, INK, null, 0, 'left');
  // dragon lair sample
  haloText('Kraivenn · The Three-Headed Crow', 1340, ly + 8, 'italic 500 19px "EB Garamond"', '#6b3116', null, 0, 'left');
  haloText('Named dragon lair', 1670, ly + 8, lf, INK, null, 0, 'left');

  // scale bar (400 m)
  const sx = 200, sy2 = 2520, segW = (400 / SPAN) * MS / 4;
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k % 2 === 0 ? INK : 'rgba(42,33,24,0.25)';
    ctx.fillRect(sx + k * segW, sy2, segW, 7);
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.strokeRect(sx, sy2, segW * 4, 7);
  ctx.font = '400 17px "EB Garamond"'; ctx.fillStyle = INK; ctx.textAlign = 'center';
  for (let k = 0; k <= 4; k++) {
    const tx2 = sx + k * segW;
    ctx.beginPath(); ctx.moveTo(tx2, sy2 - 4); ctx.lineTo(tx2, sy2); ctx.stroke();
    ctx.fillText(k === 4 ? '400 m' : String(k * 100), tx2, sy2 - 9);
  }
  // credit
  haloText('AXCGAMES STUDIOS · KINGDOMS OF THE FORGOTTEN SEAS · CHAPTER 1: A BRAND NEW BEGINNING', 2120, 2531, '600 15px Cinzel', 'rgba(42,33,24,0.55)', null, 3, 'right');

  window.__ready = true;
}
main().catch((e) => { document.title = 'ERR: ' + e.message; console.error(e); });
</script>
</body></html>
`;

await Bun.write('/home/z/my-project/scripts/map_page.html', html);
console.log('map_page.html written.');
