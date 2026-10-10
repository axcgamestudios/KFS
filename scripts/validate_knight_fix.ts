/**
 * Validación matemática del skinning de knight_rigged.glb (post-fix).
 * El skinning en bind pose debe reproducir la geometría cruda (identidad).
 * Se usa la MISMA ruta del juego: SkeletonUtils.clone.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { readFileSync } from 'fs';

const path = '/home/z/my-project/public/game/models/knight_rigged.glb';
const buf = readFileSync(path);

loader: {
const loader = new GLTFLoader();
loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf) => {
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  console.log('=== BIND POSE: skinned bbox vs geometría cruda ===');
  let allOk = true;
  for (const m of meshes) {
    m.geometry.computeBoundingBox();
    const raw = m.geometry.boundingBox!.clone();
    m.computeBoundingBox(); // aplica huesos (getVertexPosition → applyBoneTransform)
    const sk = m.boundingBox!;
    const rawSize = raw.getSize(new THREE.Vector3());
    const skSize = sk.getSize(new THREE.Vector3());
    const diff = skSize.clone().sub(rawSize).length();
    const ok = diff < 0.01;
    allOk = allOk && ok;
    console.log(`${m.name}: raw ${rawSize.x.toFixed(3)}×${rawSize.y.toFixed(3)}×${rawSize.z.toFixed(3)} | skinned ${skSize.x.toFixed(3)}×${skSize.y.toFixed(3)}×${skSize.z.toFixed(3)} | diff=${diff.toFixed(4)} ${ok ? '✓ IDENTIDAD' : '✗ ROTO'}`);
  }

  // Prueba de animación: rotar j_hipR 45° y verificar que los vértices de la pierna derecha se mueven
  console.log('\n=== RESPUESTA A ANIMACIÓN (ruta del juego: SkeletonUtils.clone) ===');
  const clone = skeletonClone(root);
  // simular que el clon se coloca en la escena
  const scene = new THREE.Scene();
  scene.add(clone);
  const cloneMesh = clone.getObjectByName('knight_lower') as THREE.SkinnedMesh;
  const ownBones = cloneMesh.skeleton.bones.filter((b) => clone.getObjectByName(b.name) === b).length;
  console.log(`huesos propios del clon: ${ownBones}/${cloneMesh.skeleton.bones.length} ${ownBones === cloneMesh.skeleton.bones.length ? '✓' : '✗ COMPARTIDO'}`);

  cloneMesh.computeBoundingBox();
  const before = cloneMesh.boundingBox!.clone();
  const hipR = clone.getObjectByName('j_hipR');
  if (hipR) {
    hipR.rotation.x = -0.8; // levantar pierna
    scene.updateMatrixWorld(true);
    cloneMesh.skeleton.update();
    cloneMesh.computeBoundingBox();
    const after = cloneMesh.boundingBox!;
    const moved = before.min.distanceTo(after.min) + before.max.distanceTo(after.max);
    console.log(`rotación j_hipR -0.8rad → desplazamiento bbox: ${moved.toFixed(3)} ${moved > 0.05 ? '✓ LA MALLA ANIMA' : '✗ NO RESPONDE'}`);
    const sizeAfter = after.getSize(new THREE.Vector3());
    console.log(`bbox tras pose: ${sizeAfter.x.toFixed(2)}×${sizeAfter.y.toFixed(2)}×${sizeAfter.z.toFixed(2)} (la pierna adelantada cambia profundidad Z)`);
  }

  // Proporciones finales del caballero completo
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  for (const m of meshes) {
    m.computeBoundingBox();
    const bb = m.boundingBox!;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
      v.applyMatrix4(m.matrixWorld);
      box.expandByPoint(v);
    }
  }
  const s = box.getSize(new THREE.Vector3());
  console.log(`\nCaballero completo (bind): ${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)} m — esperado ~0.8×1.95×0.5 ${Math.abs(s.y - 1.95) < 0.15 ? '✓' : '✗'}`);
  console.log(allOk && ownBones === cloneMesh.skeleton.bones.length ? '\nTODO OK' : '\nHAY FALLOS');
  process.exit(allOk ? 0 : 1);
}, (err) => { console.error('PARSE ERROR:', err); process.exit(2); });
}
