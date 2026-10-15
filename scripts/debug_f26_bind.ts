// debug_f26_bind.ts — at BIND (all identity) skinning must be the identity:
// v' = Σ w · (boneWorld · IBM_bone) · v = v. If not, the IBMs are broken.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

const SRC = process.argv[2] ?? 'public/game/models/knight_rigged.glb';

async function main(): Promise<void> {
  const buf = readFileSync(SRC);
  const gltf = await new Promise<any>((res, rej) => {
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej);
  });
  const scene: THREE.Object3D = gltf.scene;
  scene.updateMatrixWorld(true);

  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) meshes.push(m); });
  const sk = meshes.find((m) => m.name === 'knight_lower')!;
  const pos = sk.geometry.attributes.position as THREE.BufferAttribute;
  const sIdx = sk.geometry.attributes.skinIndex as THREE.BufferAttribute;
  const sW = sk.geometry.attributes.skinWeight as THREE.BufferAttribute;
  const bones = sk.skeleton.bones;
  const inv = sk.skeleton.boneInverses;

  console.log('bone order in skeleton:');
  bones.forEach((b, i) => console.log(`  [${i}] ${b.name} invTrans=(${inv[i].elements[12].toFixed(3)},${inv[i].elements[13].toFixed(3)},${inv[i].elements[14].toFixed(3)}) boneWorldTrans=(${b.matrixWorld.elements[12].toFixed(3)},${b.matrixWorld.elements[13].toFixed(3)},${b.matrixWorld.elements[14].toFixed(3)})`));

  // pick a few foot verts (y<0.06, z>0) and check bind identity
  const v = new THREE.Vector3();
  let checked = 0;
  for (let i = 0; i < pos.count && checked < 5; i++) {
    if (pos.getY(i) > 0.06 || pos.getZ(i) <= 0) continue;
    const joints: string[] = [];
    v.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sW.getComponent(i, k);
      const b = sIdx.getComponent(i, k);
      joints.push(`${bones[b].name}=${w.toFixed(2)}`);
      if (w <= 0) continue;
      const tmp = new THREE.Matrix4().multiplyMatrices(bones[b].matrixWorld, inv[b]);
      v.addScaledVector(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(tmp), w);
    }
    const bind = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    console.log(`vert ${i} bind=(${bind.x.toFixed(3)},${bind.y.toFixed(3)},${bind.z.toFixed(3)}) skinned=(${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}) dev=${(bind.distanceTo(v) * 1000).toFixed(1)}mm [${joints.join(' ')}]`);
    checked++;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
