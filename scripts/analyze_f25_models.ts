// analyze_f25_models.ts — deep inspection of the 3 newly uploaded GLBs
// Usage: npx tsx scripts/analyze_f25_models.ts <file.glb>
(globalThis as any).self = globalThis; // GLTFLoader Node polyfill
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

const file = process.argv[2];
if (!file) { console.error('need file'); process.exit(1); }
console.log(`\n############ ${file} ############`);
const buf = readFileSync(file);
console.log(`file size: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
const loader = new GLTFLoader();

loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  const box = new THREE.Box3().setFromObject(scene);
  const H = box.max.y - box.min.y;
  console.log(`bbox: y ${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)} (H=${H.toFixed(3)})  x ${box.min.x.toFixed(3)}..${box.max.x.toFixed(3)}  z ${box.min.z.toFixed(3)}..${box.max.z.toFixed(3)}`);

  console.log(`\n=== ANIMATIONS (${gltf.animations.length}) ===`);
  for (const a of gltf.animations) {
    console.log(`  "${a.name}" dur=${a.duration.toFixed(2)}s tracks=${a.tracks.length}`);
    const names = new Set(a.tracks.map(t => t.name.split('.')[0]));
    console.log(`    bones: ${[...names].slice(0, 20).join(', ')}`);
  }

  console.log(`\n=== SKELETON ===`);
  const bones: THREE.Bone[] = [];
  scene.traverse((o: any) => { if (o.isBone) bones.push(o); });
  console.log(`bone count: ${bones.length}`);
  const byName = new Map(bones.map(b => [b.name, b]));
  const printed = new Set<string>();
  const printTree = (b: THREE.Bone, depth: number) => {
    const p = new THREE.Vector3(); b.getWorldPosition(p);
    console.log(`${'  '.repeat(depth)}${b.name}  [world y=${p.y.toFixed(3)}] children=${b.children.filter((c: any) => c.isBone).length}`);
    for (const c of b.children as any[]) if (c.isBone) printTree(c, depth + 1);
  };
  for (const root of bones) {
    let isRoot = true;
    let p: any = root.parent;
    while (p) { if (p.isBone) { isRoot = false; break; } p = p.parent; }
    if (isRoot) printTree(root, 0);
  }

  console.log(`\n=== MESHES ===`);
  let totalVerts = 0, totalTris = 0, meshCount = 0;
  const matNames = new Set<string>();
  scene.traverse((o: any) => {
    if (!o.isMesh) return;
    meshCount++;
    const g = o.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index ? g.index.count / 3 : pos.count / 3;
    totalVerts += pos.count; totalTris += idx;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) matNames.add(m.name || '(unnamed)');
    const b = new THREE.Box3().setFromObject(o);
    console.log(`  ${o.name}: verts=${pos.count} tris=${Math.round(idx)} mats=[${mats.map((m: any) => m.name).join('|')}] skin=${!!o.isSkinnedMesh ? (o.skeleton ? `bones=${o.skeleton.bones.length}` : '?') : 'no'}`);
    console.log(`     bbox y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} z ${b.min.z.toFixed(2)}..${b.max.z.toFixed(2)}`);
    // material detail
    for (const m of mats as any[]) {
      const hasTex = !!m.map;
      console.log(`     mat "${m.name}": map=${hasTex ? (m.map.image ? `embedded ${m.map.image.width}x${m.map.image.height}` : 'ext') : 'none'} color=${m.color ? `#${m.color.getHexString()}` : '?'} metal=${m.metalness ?? '?'} rough=${m.roughness ?? '?'} normalMap=${!!m.normalMap}`);
    }
  });
  console.log(`\nTOTALS: meshes=${meshCount} verts=${totalVerts} tris=${Math.round(totalTris)}`);
  console.log(`materials: ${[...matNames].join(', ')}`);

  // texture images
  console.log(`\n=== EMBEDDED TEXTURES ===`);
  const imgs: any[] = [];
  scene.traverse((o: any) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        const t = (m as any)[slot];
        if (t && t.image && !imgs.includes(t.image)) imgs.push(t.image);
      }
    }
  });
  for (const im of imgs) console.log(`  ${im.width}x${im.height} ${im.data ? `(has data)` : ''} `);
  console.log(`embedded image count: ${imgs.length}`);

  // extra: skinning bone names for skinned meshes
  scene.traverse((o: any) => {
    if (o.isSkinnedMesh && o.skeleton) {
      const boneNames = o.skeleton.bones.map((b: any) => b.name);
      console.log(`\nSkinnedMesh "${o.name}" bones (${boneNames.length}): ${boneNames.join(', ')}`);
    }
  });
}, (err) => { console.error('PARSE ERROR', err); process.exit(1); });
