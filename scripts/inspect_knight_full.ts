/**
 * Inspecciona TODOS los meshes de knight_rigged.glb con sus bboxes y jerarquía,
 * para encontrar el culpable del bbox de 30m y las matrices NaN.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

const path = '/home/z/my-project/public/game/models/knight_rigged.glb';
const buf = readFileSync(path);
const loader = new GLTFLoader();

loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf) => {
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  console.log('=== JERARQUÍA COMPLETA ===');
  const dump = (o: THREE.Object3D, depth = 0) => {
    const m = o as THREE.Mesh;
    let extra = '';
    if (m.isMesh) {
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      extra = ` [MESH tris=${(m.geometry.index ? m.geometry.index.count : (m.geometry.getAttribute('position') as THREE.BufferAttribute).count) / 3 | 0} bb=${bb.min.toArray().map(v => v.toFixed(2))}→${bb.max.toArray().map(v => v.toFixed(2))}]`;
    }
    const b = o as THREE.Bone;
    if (b.isBone) {
      const wp = new THREE.Vector3(); b.getWorldPosition(wp);
      extra = ` [BONE pos=(${o.position.x.toFixed(3)}, ${o.position.y.toFixed(3)}, ${o.position.z.toFixed(3)}) world=(${wp.x.toFixed(2)}, ${wp.y.toFixed(2)}, ${wp.z.toFixed(2)})]`;
    }
    console.log(`${'  '.repeat(depth)}${o.name || '(sin nombre)'}${extra}`);
    for (const c of o.children) dump(c, depth + 1);
  };
  dump(root);

  console.log('\n=== SKELETON: boneInverses ===');
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  const sk = meshes[0].skeleton;
  for (let i = 0; i < sk.bones.length; i++) {
    const inv = new THREE.Matrix4().fromArray(sk.boneInverses as unknown as number[], i * 16);
    const e = inv.elements;
    const hasNaN = e.some((v) => Number.isNaN(v));
    console.log(`${sk.bones[i].name}: inverse${hasNaN ? ' ⚠️ NaN!' : ' ok'} det=${inv.determinant().toFixed(3)}`);
  }

  // ¿De dónde sale el bbox de 30m? Recorrer meshes individuales
  console.log('\n=== TODOS LOS MESHES (bbox en MUNDO) ===');
  const box = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      console.log(`${m.name}: mundo ${b.min.toArray().map(v => v.toFixed(2))} → ${b.max.toArray().map(v => v.toFixed(2))}`);
      box.union(b);
    }
  });
  console.log('UNION:', box.min.toArray().map(v => v.toFixed(2)), '→', box.max.toArray().map(v => v.toFixed(2)));
}, (err) => console.error('PARSE ERROR:', err));
