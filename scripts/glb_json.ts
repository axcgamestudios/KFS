// glb_json.ts — extract the JSON chunk of a GLB to inspect materials/textures/meshes/nodes
import { readFileSync } from 'fs';

const file = process.argv[2];
const buf = readFileSync(file);
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) { console.error('not a glb'); process.exit(1); }
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));

const g = json;
console.log('=== GENERATOR ===');
console.log(g.asset?.generator, '| version', g.asset?.version);

console.log('\n=== MESHES (primitives) ===');
for (const m of g.meshes ?? []) {
  for (const p of m.primitives) {
    const attrs = Object.keys(p.attributes ?? {}).join(',');
    console.log(`mesh "${m.name}" prim: attrs=${attrs} tris=${(p.indices != null ? (g.accessories ? '' : '') : '')}${p.indices != null ? Math.round(g.accessors[p.indices].count / 3) : 'n/a'} mat=${p.material != null ? g.materials[p.material].name : 'none'}`);
  }
}

console.log('\n=== MATERIALS ===');
for (const m of g.materials ?? []) {
  const texIds: string[] = [];
  const push = (t: any, tag: string) => { if (t?.index != null) texIds.push(`${tag}:${t.index}`); };
  push(m.pbrMetallicRoughness?.baseColorTexture, 'baseColor');
  push(m.normalTexture, 'normal');
  push(m.pbrMetallicRoughness?.metallicRoughnessTexture, 'metalRough');
  push(m.occlusionTexture, 'occlusion');
  console.log(`mat "${m.name}" tex=[${texIds.join(', ')}] baseColorFactor=${JSON.stringify(m.pbrMetallicRoughness?.baseColorFactor)} metallic=${m.pbrMetallicRoughness?.metallicFactor} roughness=${m.pbrMetallicRoughness?.roughnessFactor}`);
}

console.log('\n=== IMAGES / TEXTURES ===');
for (const t of g.textures ?? []) console.log(`texture ${g.textures.indexOf(t)}: source=image${t.source} sampler=${t.sampler ?? '-'}`);
for (const i of g.images ?? []) {
  const bufView = i.bufferView != null ? g.bufferViews[i.bufferView] : null;
  console.log(`image ${g.images.indexOf(i)}: "${i.name ?? ''}" mime=${i.mimeType ?? '?'} ${bufView ? `size=${bufView.byteLength}` : (i.uri ?? '').slice(0, 60)}`);
}

console.log('\n=== NODES ===');
for (const n of g.nodes ?? []) {
  const hasMesh = n.mesh != null ? ` mesh=${g.meshes[n.mesh].name}` : '';
  const hasSkin = n.skin != null ? ` skin=${n.skin}` : '';
  const rot = n.rotation ? ' rot' : '';
  const scl = n.scale ? ` scale=${JSON.stringify(n.scale)}` : '';
  console.log(`node ${g.nodes.indexOf(n)} "${n.name}"${hasMesh}${hasSkin}${rot}${scl} children=${JSON.stringify(n.children ?? [])}`);
}

console.log('\n=== SKINS ===');
console.log('skins:', (g.skins ?? []).length);
console.log('\n=== ANIMATIONS ===');
console.log('animations:', (g.animations ?? []).length);
console.log('\n=== SAMPLER MIN/MAX of key accessors (mesh 0 prim) ===');
const p0 = g.meshes?.[0]?.primitives?.[0];
if (p0) {
  const posAcc = g.accessors[p0.attributes.POSITION];
  console.log('POSITION accessor min/max:', JSON.stringify(posAcc.min), JSON.stringify(posAcc.max));
  const hasJoints = p0.attributes.JOINTS_0 != null;
  const hasWeights = p0.attributes.WEIGHTS_0 != null;
  console.log('has JOINTS_0/WEIGHTS_0:', hasJoints, hasWeights);
  if (p0.attributes.COLOR_0 != null) {
    const cAcc = g.accessors[p0.attributes.COLOR_0];
    console.log('COLOR_0 type:', cAcc.type, 'count:', cAcc.count);
  }
}
