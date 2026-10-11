// Encuentra la cubierta real del pirate_ship.glb: histograma de densidad de
// vértices por banda Y + ancho X por banda (la cubierta = banda plana ancha).
const fs = require('fs');
const buf = fs.readFileSync('/home/z/my-project/public/game/models/pirate_ship.glb');
let off = 12, json, bin;
while (off < buf.length) {
  const l = buf.readUInt32LE(off), t = buf.readUInt32LE(off + 4);
  const d = buf.subarray(off + 8, off + 8 + l);
  if (t === 0x4E4F534A) json = JSON.parse(d.toString());
  else if (t === 0x004E4942) bin = d;
  off += 8 + l;
}
function acc(a) {
  const A = json.accessors[a], bv = json.bufferViews[A.bufferView];
  const st = (bv.byteOffset || 0) + (A.byteOffset || 0);
  const n = A.count * 3;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = bin.readFloatLE(st + i * 4);
  return out;
}

// banda Y de 150 unidades, para TODOS los meshes juntos
const BAND = 120;
const bands = new Map();
for (const mesh of json.meshes) {
  const mat = json.materials[mesh.primitives[0].material]?.name ?? '?';
  const d = acc(mesh.primitives[0].attributes.POSITION);
  for (let i = 0; i < d.length / 3; i++) {
    const y = d[i * 3 + 1];
    const bi = Math.floor(y / BAND);
    const k = bi * BAND;
    if (!bands.has(k)) bands.set(k, { n: 0, minX: 1e9, maxX: -1e9, mats: new Set() });
    const b = bands.get(k);
    b.n++;
    const x = d[i * 3];
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    b.mats.add(mat);
  }
}
console.log('bandaY_raw   verts   anchoX   materiales');
const keys = [...bands.keys()].sort((a, b) => a - b);
for (const k of keys) {
  const b = bands.get(k);
  console.log(
    String(k).padStart(6), String(b.n).padStart(7),
    String(Math.round(b.maxX - b.minX)).padStart(7),
    '  ', [...b.mats].join(',').slice(0, 46),
  );
}
