// Inspecciona la jerarquía de nodos de los GLB del proyecto
const fs = require('fs');
const path = require('path');

// GLB parser mínimo: leer chunks JSON + BIN
function parseGLB(file) {
  const buf = fs.readFileSync(file);
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);
  let offset = 12;
  let json = null;
  while (offset < length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
    offset += 8 + chunkLength;
  }
  return { magic, version, length, json };
}

function summarize(file) {
  const { json } = parseGLB(file);
  console.log('='.repeat(70));
  console.log('FILE:', path.basename(file));
  const scenes = json.scenes || [];
  const roots = scenes[0]?.nodes || [];
  console.log('nodes:', (json.nodes || []).length, 'meshes:', (json.meshes || []).length,
    'materials:', (json.materials || []).length, 'animations:', (json.animations || []).length,
    'skins:', (json.skins || []).length, 'images:', (json.images || []).length);
  if ((json.animations || []).length) {
    for (const a of json.animations) console.log('  anim:', a.name, '- channels:', (a.channels || []).length);
  }
  // árbol de nodos (profundidad limitada)
  const nodes = json.nodes || [];
  function walk(i, depth, prefix) {
    const n = nodes[i];
    if (!n) return;
    const parts = [n.name ?? `#${i}`];
    if (n.mesh !== undefined) parts.push(`[mesh:${json.meshes[n.mesh]?.name ?? n.mesh}]`);
    if (n.skin !== undefined) parts.push('[skinned]');
    if (n.translation) parts.push(`t=(${n.translation.map(v => v.toFixed(2)).join(',')})`);
    if (n.rotation) parts.push('r');
    if (n.scale && (n.scale[0] !== 1 || n.scale[1] !== 1 || n.scale[2] !== 1)) parts.push(`s=(${n.scale.map(v => v.toFixed(2)).join(',')})`);
    console.log(`${prefix}${parts.join(' ')}`);
    for (const c of n.children || []) walk(c, depth + 1, prefix + '  ');
  }
  const maxNodes = 60;
  let count = 0;
  for (const r of roots) {
    walk(r, 0, '');
    count++;
    if (count > maxNodes) break;
  }
  // accesores bbox aproximado: min/max de POSITION accessors de los meshes
  if (json.accessors) {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const mesh of json.meshes || []) {
      for (const prim of mesh.primitives || []) {
        const acc = json.accessors[prim.attributes?.POSITION];
        if (acc?.min && acc?.max) {
          minX = Math.min(minX, acc.min[0]); minY = Math.min(minY, acc.min[1]); minZ = Math.min(minZ, acc.min[2]);
          maxX = Math.max(maxX, acc.max[0]); maxY = Math.max(maxY, acc.max[1]); maxZ = Math.max(maxZ, acc.max[2]);
        }
      }
    }
    if (isFinite(minX)) {
      console.log(`bbox aprox (raw accessor): min=(${minX.toFixed(2)},${minY.toFixed(2)},${minZ.toFixed(2)}) max=(${maxX.toFixed(2)},${maxY.toFixed(2)},${maxZ.toFixed(2)})`);
    }
  }
  for (const m of (json.materials || []).slice(0, 10)) {
    console.log('  mat:', m.name, m.pbrMetallicRoughness?.baseColorFactor ? `color=${m.pbrMetallicRoughness.baseColorFactor.map(v=>v.toFixed(2)).join(',')}` : '');
  }
}

for (const f of [
  '/home/z/my-project/public/game/models/pirate_ship.glb',
  '/home/z/my-project/public/game/models/knight_rigged.glb',
  '/home/z/my-project/public/game/models/black_dragon.glb',
  '/home/z/my-project/public/game/models/medieval_props.glb',
]) {
  if (fs.existsSync(f)) summarize(f);
}
