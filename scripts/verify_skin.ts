// verify_skin.ts — load medieval_knight_rigged.glb with GLTFLoader and check
// the SKINNED bounding box using three's own applyBoneTransform (the exact
// math the GPU uses). If the bind-pose bbox collapses, the GLB skin data is
// wrong; if it matches the source silhouette, the game wiring is at fault.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

const file = process.argv[2] ?? 'public/game/models/medieval_knight_rigged.glb';
const buf = readFileSync(file);

new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  let mesh: THREE.SkinnedMesh | null = null;
  scene.traverse((o: any) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) { console.error('NO SKINNED MESH'); process.exit(1); }
  const m = mesh as THREE.SkinnedMesh;

  console.log('skin joints:', m.skeleton.bones.length);
  console.log('boneInverses sample (j_root):', m.skeleton.boneInverses[0].elements.map((n: number) => n.toFixed(3)).join(','));

  // bind-pose bbox via three's own skinning
  const pos = m.geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  const N = Math.min(pos.count, 20000);
  for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / N))) {
    v.fromBufferAttribute(pos, i);
    m.applyBoneTransform(i, v);
    m.localToWorld(v); // account for mesh world matrix
    box.expandByPoint(v);
  }
  const size = box.getSize(new THREE.Vector3());
  console.log('SKINNED bind-pose bbox size:', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3));
  console.log('min:', box.min.x.toFixed(3), box.min.y.toFixed(3), box.min.z.toFixed(3));
  const okBBox = size.y > 1.5 && size.y < 2.4 && size.x < 1.5;
  console.log(okBBox ? 'SKIN OK (humanoid bbox)' : 'SKIN BROKEN (collapsed or exploded)');

  // pose test: raise the right arm hard, re-measure
  const sh = m.skeleton.bones.find((b) => b.name === 'j_shoulderR');
  if (sh) sh.rotation.x = -2.6;
  scene.updateMatrixWorld(true);
  const box2 = new THREE.Box3();
  for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / N))) {
    v.fromBufferAttribute(pos, i);
    m.applyBoneTransform(i, v);
    m.localToWorld(v);
    box2.expandByPoint(v);
  }
  const size2 = box2.getSize(new THREE.Vector3());
  console.log('posed bbox size:', size2.x.toFixed(3), size2.y.toFixed(3), size2.z.toFixed(3), '(wider = arm raised ✓)');
}, (err) => { console.error('PARSE ERROR:', err); process.exit(1); });
