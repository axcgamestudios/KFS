/** Validate knight_rigged.glb through the real GLTFLoader (node-side parse). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as fs from 'fs';

const buf = fs.readFileSync('public/game/models/knight_rigged.glb');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const loader = new GLTFLoader();
loader.parse(
  ab as ArrayBuffer,
  '',
  (gltf) => {
    const s = gltf.scene;
    const root = s.getObjectByName('j_root');
    const skinned: THREE.SkinnedMesh[] = [];
    s.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
    const sword = s.getObjectByName('j_sword_held');
    const shield = s.getObjectByName('j_shield_held');
    console.log('PARSE OK');
    console.log('j_root:', !!root, '| skinned meshes:', skinned.length, '| sword:', !!sword, '| shield:', !!shield);
    for (const m of skinned) {
      console.log(`  ${m.name}: verts=${m.geometry.getAttribute('position').count} joints=${m.geometry.getAttribute('joints_0' in m.geometry.attributes ? 'joints_0' : 'JOINTS_0')?.count ?? '??'} skeleton bones=${m.skeleton?.bones.length}`);
      m.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m);
      console.log(`    bbox y: ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)} (bind pose, world)`);
    }
    // pose test: rotate j_hipR and verify vertices move
    if (root) {
      const hip = s.getObjectByName('j_hipR');
      if (hip) hip.rotation.x = -0.6;
      s.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(skinned[0]);
      console.log('after hipR -0.6 rad, skinned[0] bbox y:', box2.min.y.toFixed(2), '..', box2.max.y.toFixed(2));
    }
    process.exit(0);
  },
  (err) => {
    console.error('PARSE FAILED:', err?.message ?? err);
    const anyErr = err as any;
    if (anyErr?.issues) console.error(JSON.stringify(anyErr.issues).slice(0, 800));
    process.exit(1);
  },
);
