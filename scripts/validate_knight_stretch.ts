/**
 * Valida knight_rigged.glb: bind pose, escalas de huesos, skinning matemático
 * y la ruta de clonación que usa AssetSystem (root.clone(true)).
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

  // 1) Escalas y posiciones de nodos
  console.log('=== ESCENAS / NODOS ===');
  root.traverse((o) => {
    const s = o.scale;
    const nonUniform = Math.abs(s.x - 1) > 1e-4 || Math.abs(s.y - 1) > 1e-4 || Math.abs(s.z - 1) > 1e-4;
    if (nonUniform) {
      console.log(`ESCALA NO-UNIFORME: ${o.name} scale=(${s.x.toFixed(4)}, ${s.y.toFixed(4)}, ${s.z.toFixed(4)})`);
    }
  });
  console.log('root scale:', root.scale.x, root.scale.y, root.scale.z);
  console.log('root position:', root.position.x, root.position.y, root.position.z);

  // 2) SkinnedMeshes: comprobar bind pose
  console.log('\n=== SKINNED MESHES ===');
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  console.log('count:', meshes.length);

  for (const m of meshes) {
    const sk = m.skeleton;
    console.log(`\n--- ${m.name} ---`);
    console.log('bones:', sk.bones.length, 'bindMode:', m.bindMode);
    const bm = m.bindMatrix; const bmi = m.bindMatrixInverse;
    console.log('bindMatrix det:', bm.determinant().toFixed(4), 'pos:', bm.elements.slice(12, 15).map(v => v.toFixed(3)));
    // comprobar bone scales
    for (const b of sk.bones) {
      const ls = b.scale;
      if (Math.abs(ls.x - 1) > 1e-3 || Math.abs(ls.y - 1) > 1e-3 || Math.abs(ls.z - 1) > 1e-3) {
        console.log(`  BONE ESCALA: ${b.name} (${ls.x.toFixed(3)}, ${ls.y.toFixed(3)}, ${ls.z.toFixed(3)})`);
      }
    }
    // bbox de la geometría SIN skin
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!;
    console.log('geom bbox (sin skin):', bb.min.toArray().map(v => v.toFixed(2)), '→', bb.max.toArray().map(v => v.toFixed(2)));
  }

  // 3) Simular el cálculo del vertex shader en bind pose con el esqueleto
  //    tal como lo tiene el ORIGINAL (matrixWorld del parse).
  console.log('\n=== SKINNING MATEMÁTICO BIND POSE (original) ===');
  for (const m of meshes) {
    const sk = m.skeleton;
    // boneMatrices como Skeleton.update()
    sk.update();
    const bm = sk.boneMatrices; // Float32Array 16*n
    const geo = m.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const skinIdx = geo.getAttribute('skinIndex') as THREE.BufferAttribute;
    const skinWgt = geo.getAttribute('skinWeight') as THREE.BufferAttribute;
    const bbMin = new THREE.Vector3(1e9, 1e9, 1e9);
    const bbMax = new THREE.Vector3(-1e9, -1e9, -1e9);
    const bind = m.bindMatrix;
    const bindInv = m.bindMatrixInverse;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(bind);
      const out = new THREE.Vector3(0, 0, 0);
      let wsum = 0;
      for (let j = 0; j < 4; j++) {
        const w = skinWgt.getComponent(i * 4 + j);
        if (w <= 0) continue;
        const bi = skinIdx.getComponent(i * 4 + j);
        const mm = new THREE.Matrix4().fromArray(bm as unknown as number[], bi * 16);
        out.add(new THREE.Vector3().copy(v).applyMatrix4(mm).multiplyScalar(w));
        wsum += w;
      }
      if (wsum > 0) out.divideScalar(wsum);
      out.applyMatrix4(bindInv);
      bbMin.min(out); bbMax.max(out);
    }
    console.log(`${m.name}: skinned bbox = ${bbMin.toArray().map(v => v.toFixed(2))} → ${bbMax.toArray().map(v => v.toFixed(2))} (mundo-local, sin root matrix)`);
    // aplicar root matrixWorld
    const size = new THREE.Vector3().subVectors(bbMax, bbMin);
    console.log(`  tamaño: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} — altura esperada ~1.9-2.0m, ancho ~0.5-0.9`);
  }

  // 4) Simular la RUTA DE CLONACIÓN del AssetSystem
  console.log('\n=== CLONACIÓN (root.clone(true)) ===');
  const clone = root.clone(true);
  clone.updateMatrixWorld(true);
  const origMesh = meshes[0];
  let cloneMesh: THREE.SkinnedMesh | null = null;
  clone.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name === origMesh.name) cloneMesh = o as THREE.SkinnedMesh; });
  if (cloneMesh) {
    const sameSkeleton = (cloneMesh as THREE.SkinnedMesh).skeleton === origMesh.skeleton;
    console.log('El clon COMPARTTE el esqueleto original:', sameSkeleton);
    if (sameSkeleton) {
      // Los huesos del esqueleto son los ORIGINALES (fuera del grafo del clon)
      const boneNames = origMesh.skeleton.bones.map(b => b.name).slice(0, 5);
      console.log('huesos del esqueleto compartido (primeros 5):', boneNames);
      // ¿Están esos huesos dentro del clon?
      const inClone = origMesh.skeleton.bones.map(b => clone.getObjectByName(b.name) !== null);
      console.log('huesos presentes también en el clon (nuevos objetos):', inClone.filter(Boolean).length, '/', inClone.length);
      console.log('⚠️ El mesh clonado se skinnea con los huesos ORIGINALES (detachados),');
      console.log('   pero KnightModelGLB rota los huesos CLONADOS → el mesh no sigue la animación');
      console.log('   Y si los huesos originales tienen matrixWorld rancio/actualizado por otro');
      console.log('   contexto, el mesh se deforma (estiramiento).');
    }
  }

  // 5) Caja total del caballero completo (mundo)
  const box = new THREE.Box3().setFromObject(root);
  console.log('\nBBox total del root (bind pose):', box.min.toArray().map(v => v.toFixed(2)), '→', box.max.toArray().map(v => v.toFixed(2)));
  console.log('altura total:', (box.max.y - box.min.y).toFixed(3), 'm (esperado 1.95)');
}, (err) => {
  console.error('PARSE ERROR:', err);
});
