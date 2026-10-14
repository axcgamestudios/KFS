// Verify the cape chain exists in the rigged GLB and carries real weight mass.
import { readFileSync } from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const buf = readFileSync('public/game/models/medieval_knight_rigged.glb');
const gltf: any = await new Promise<any>((res, rej) => {
  new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej);
});
const scene: THREE.Object3D = gltf.scene;
scene.updateMatrixWorld(true);
let skinnedMesh: THREE.SkinnedMesh | null = null;
scene.traverse((o: any) => { if (o.isSkinnedMesh && !skinnedMesh) skinnedMesh = o as THREE.SkinnedMesh; });
const sm = skinnedMesh!;
const bones: THREE.Bone[] = sm.skeleton.bones;
const names = bones.map((b) => b.name);
console.log('bones:', names.join(','));
const cape1 = scene.getObjectByName('j_cape1');
const cape2 = scene.getObjectByName('j_cape2');
console.log('cape1 found:', !!cape1, 'parent:', cape1?.parent?.name, 'worldY:', cape1?.getWorldPosition(new THREE.Vector3()).y.toFixed(3));
console.log('cape2 found:', !!cape2, 'parent:', cape2?.parent?.name, 'worldY:', cape2?.getWorldPosition(new THREE.Vector3()).y.toFixed(3));

// weight mass per bone
const idxAttr = sm.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
const wAttr = sm.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
const mass = new Float64Array(bones.length);
let total = 0;
const N = idxAttr.count;
for (let i = 0; i < N; i++) {
  for (let k = 0; k < 4; k++) {
    const bi = idxAttr.getComponent(i, k);
    const w = wAttr.getComponent(i, k);
    mass[bi] += w; total += w;
  }
}
const byIdx = new Map<number, string>();
bones.forEach((b, i) => byIdx.set(i, b.name));
const sorted = Array.from(mass).map((m, i) => ({ name: byIdx.get(i), m })).sort((a, b) => b.m - a.m);
console.log('--- weight mass by bone (fraction of total) ---');
for (const s of sorted.slice(0, 12)) console.log(`${s.name}: ${(s.m / total * 100).toFixed(2)}%`);
const c1i = names.indexOf('j_cape1'), c2i = names.indexOf('j_cape2');
console.log(`j_cape1 mass: ${(mass[c1i] / total * 100).toFixed(2)}%  j_cape2 mass: ${(mass[c2i] / total * 100).toFixed(2)}%`);
// where do cape verts live (y distribution of verts with cape weight)?
const pos = sm.geometry.getAttribute('position') as THREE.BufferAttribute;
let capeCount = 0, yMin = 9, yMax = -9, zMin = 9, zMax = -9;
for (let i = 0; i < N; i++) {
  let cw = 0;
  for (let k = 0; k < 4; k++) {
    const bi = idxAttr.getComponent(i, k);
    if (bi === c1i || bi === c2i) cw += wAttr.getComponent(i, k);
  }
  if (cw > 0.25) {
    capeCount++;
    yMin = Math.min(yMin, pos.getY(i)); yMax = Math.max(yMax, pos.getY(i));
    zMin = Math.min(zMin, pos.getZ(i)); zMax = Math.max(zMax, pos.getZ(i));
  }
}
console.log(`cape-dominant verts: ${capeCount}  y:[${yMin.toFixed(2)},${yMax.toFixed(2)}]  z:[${zMin.toFixed(2)},${zMax.toFixed(2)}]`);
