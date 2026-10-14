// analyze_knight.ts — per-mesh bboxes + facing detection (feet direction)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

const file = process.argv[2] ?? 'public/game/models/medieval_knight.glb';
const buf = readFileSync(file);
const loader = new GLTFLoader();

loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  // shift so feet are at y=0
  const box = new THREE.Box3().setFromObject(scene);
  const H = box.max.y - box.min.y;
  console.log(`total bbox: y ${box.min.y.toFixed(3)} .. ${box.max.y.toFixed(3)} H=${H.toFixed(3)}`);
  console.log(`x ${box.min.x.toFixed(3)}..${box.max.x.toFixed(3)} z ${box.min.z.toFixed(3)}..${box.max.z.toFixed(3)}`);

  interface Slice { y: number; x: number; z: number; n: number; spreadX: number; spreadZ: number }
  const slices: Slice[] = [];
  const SLICES = 40;
  const buckets: Array<Array<{x:number;z:number}>> = Array.from({length: SLICES}, () => []);

  const meshes: Array<{name:string; box:THREE.Box3; count:number}> = [];
  scene.traverse((o: any) => {
    if (!o.isMesh) return;
    const g = o.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const b = new THREE.Box3().setFromObject(o);
    meshes.push({ name: o.name, box: b, count: pos.count });
    // global slices (world-ish, model is at origin untransformed except root offsets)
    o.updateWorldMatrix(true, false);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      o.localToWorld(v);
      const rel = (v.y - box.min.y) / H;
      const bi = Math.max(0, Math.min(SLICES - 1, Math.floor(rel * SLICES)));
      buckets[bi].push({ x: v.x, z: v.z });
    }
  });

  console.log('\n=== MESHES ===');
  for (const m of meshes) {
    console.log(`${m.name}: verts=${m.count} y ${m.box.min.y.toFixed(2)}..${m.box.max.y.toFixed(2)} x ${m.box.min.x.toFixed(2)}..${m.box.max.x.toFixed(2)} z ${m.box.min.z.toFixed(2)}..${m.box.max.z.toFixed(2)}`);
  }

  console.log('\n=== VERTICAL SLICES (y%, centroid x/z, spread, L/R split) ===');
  for (let i = 0; i < SLICES; i++) {
    const b = buckets[i];
    if (!b.length) continue;
    let sx = 0, sz = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let leftCount = 0, rightCount = 0;
    for (const p of b) {
      sx += p.x; sz += p.z;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      if (p.x < -0.05) leftCount++; else if (p.x > 0.05) rightCount++;
    }
    const yPct = ((i + 0.5) / SLICES * 100).toFixed(0);
    console.log(`y${yPct.padStart(3)}% n=${String(b.length).padStart(6)} cx=${(sx/b.length).toFixed(3)} cz=${(sz/b.length).toFixed(3)} x:${minX.toFixed(2)}..${maxX.toFixed(2)} z:${minZ.toFixed(2)}..${maxZ.toFixed(2)} L=${leftCount} R=${rightCount}`);
  }

  // Feet direction: lowest 4% vertices, cluster per foot by x sign, compare z extents
  const feet = buckets[0].concat(buckets[1] ?? []);
  const footR = feet.filter(p => p.x < 0);
  const footL = feet.filter(p => p.x > 0);
  const zR = footR.length ? footR.reduce((a, p) => a + p.z, 0) / footR.length : 0;
  const zL = footL.length ? footL.reduce((a, p) => a + p.z, 0) / footL.length : 0;
  console.log(`\n=== FEET (lowest 5%): L mean z=${zL.toFixed(3)} (n=${footL.length}) · R mean z=${zR.toFixed(3)} (n=${footR.length}) ===`);
  // body z centroid at chest for comparison
  const chest = buckets[Math.floor(SLICES * 0.72)] ?? [];
  const zChest = chest.length ? chest.reduce((a, p) => a + p.z, 0) / chest.length : 0;
  console.log(`chest z centroid=${zChest.toFixed(3)} — feet point ${zR + zL > zChest * 2 ? '+Z (FORWARD = +Z OK)' : '-Z (model faces -Z, needs 180° flip)'}`);
}, (err) => { console.error('PARSE ERROR:', err); process.exit(1); });
