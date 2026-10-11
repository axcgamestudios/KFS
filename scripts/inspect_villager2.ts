/**
 * Measure the TRUE rendered height of fuse_civilian_2.glb:
 * skinning follows the BONES, so world-space bone positions (with node
 * scales applied) give the real on-screen height. Also print node scales.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as fs from 'node:fs';

const path = '/home/z/my-project/public/game/models/fuse_civilian_2.glb';
const data = fs.readFileSync(path);
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  console.log('--- scene children (name, scale, pos) ---');
  for (const c of scene.children) {
    console.log(`  ${c.name || c.type} scale=(${c.scale.x}, ${c.scale.y}, ${c.scale.z}) pos=(${c.position.x}, ${c.position.y}, ${c.position.z})`);
  }
  console.log('--- full ancestor chain of Hips ---');
  const hips = scene.getObjectByName('mixamorigHips_01');
  let node: THREE.Object3D | null = hips;
  while (node) {
    console.log(`  ${node.name || node.type} scale=(${node.scale.x}, ${node.scale.y}, ${node.scale.z})`);
    node = node.parent;
  }

  const v = new THREE.Vector3();
  const names = ['mixamorigHips_01', 'mixamorigHead_end_053', 'mixamorigLeftFoot_047', 'mixamorigRightFoot_051', 'mixamorigLeftHand_010', 'mixamorigRightHand_029', 'mixamorigHead_06'];
  console.log('--- world bone positions (rendered skeleton) ---');
  for (const n of names) {
    const b = scene.getObjectByName(n);
    if (!b) { console.log(`  ${n}: MISSING`); continue; }
    v.setFromMatrixPosition(b.matrixWorld);
    console.log(`  ${n}: (${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`);
  }

  // skinned mesh bind geometry bbox (unscaled mesh space)
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) {
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      console.log(`--- SkinnedMesh ${m.name}: mesh-space bbox y ${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)} (size ${(bb.max.y - bb.min.y).toFixed(2)})`);
      // boneTransform check: apply the bind matrix to see where vertices land
      // using the skeleton's boneMatrices at bind: sample the head_top vertex
    }
  });
  process.exit(0);
}, (err) => { console.error('PARSE ERROR', err); process.exit(1); });
