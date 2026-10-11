// Determina proa/popa del pirate_ship.glb analizando el ancho del casco por rebanada Z
const fs = require('fs');
const buf = fs.readFileSync('/home/z/my-project/public/game/models/pirate_ship.glb');
let off = 12, json, bin;
while (off < buf.length) {
  const l = buf.readUInt32LE(off), t = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + l);
  if (t === 0x4E4F534A) json = JSON.parse(data.toString());
  else if (t === 0x004E4942) bin = data;
  off += 8 + l;
}

function accessorData(accIdx) {
  const acc = json.accessors[accIdx];
  const bv = json.bufferViews[acc.bufferView];
  const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const count = acc.count;
  const comp = { VEC3: 3, VEC2: 2, SCALAR: 1 }[acc.type];
  const out = new Float32Array(count * comp);
  for (let i = 0; i < count * comp; i++) out[i] = bin.readFloatLE(start + i * 4);
  return { out, count, comp };
}

// Analiza el mesh del casco (Mat.1 = madera marrón) y también Main
for (const mesh of json.meshes) {
  const prim = mesh.primitives[0];
  const matName = json.materials[prim.material]?.name ?? '?';
  if (!['Mat.1', 'Main', 'Mat.2', 'Mat.3'].includes(matName)) continue;
  const { out, count } = accessorData(prim.attributes.POSITION);
  // rebanadas de Z: ancho X y alto Y por segmento
  const nS = 24;
  const minZ = Math.min(...out.filter((_, i) => i % 3 === 2));
  const maxZ = Math.max(...out.filter((_, i) => i % 3 === 2));
  const slices = Array.from({ length: nS }, () => ({ minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9, n: 0 }));
  for (let i = 0; i < count; i++) {
    const x = out[i * 3], y = out[i * 3 + 1], z = out[i * 3 + 2];
    const si = Math.min(nS - 1, Math.max(0, Math.floor((z - minZ) / (maxZ - minZ + 1e-6) * nS)));
    const s = slices[si];
    s.minX = Math.min(s.minX, x); s.maxX = Math.max(s.maxX, x);
    s.minY = Math.min(s.minY, y); s.maxY = Math.max(s.maxY, y);
    s.n++;
  }
  console.log(`\n=== ${mesh.name} (mat=${matName}) — Z ${minZ.toFixed(0)} → ${maxZ.toFixed(0)} ===`);
  console.log('rebanada Z%:  anchoX   altoY   (n verts)');
  slices.forEach((s, i) => {
    if (s.n === 0) return;
    const w = (s.maxX - s.minX).toFixed(0).padStart(6);
    const h = (s.maxY - s.minY).toFixed(0).padStart(6);
    console.log(`${String(i).padStart(2)} ${((i / nS) * 100).toFixed(0)}%: ${w}  ${h}   (${s.n})`);
  });
}
