import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Fase 14 — fusión de props estáticos en pocos draw calls.
 *
 * El vestuario del mundo (mesas, barriles, faroles, estandartes…) colocaba
 * ~45 clones de kits, cada uno un grupo de meshes individuales: 150-200 draw
 * calls (y otras tantas en el pase de sombras) SIEMPRE que el pueblo estaba
 * a la vista. Esta utilidad recorre un grupo estático, apila la geometría de
 * todos los meshes que comparten material en un único buffer y deja 1 mesh
 * por material. Los colliders y las llamas no viven aquí, así que nada del
 * gameplay se toca: solo cómo se empaquetan los vértices.
 *
 * Requisitos del grupo: transform estático (nada se mueve ni anima dentro).
 */

/** Atributos que se conservan al fusionar (el set común de los kits GLB). */
const KEEP_ATTRS = ['position', 'normal', 'uv'];

function sanitize(src: THREE.BufferGeometry): THREE.BufferGeometry {
  // no-indexado: mergeGeometries exige homogeneidad; los kits son pequeños
  const g = (src.index ? src.toNonIndexed() : src.clone()) as THREE.BufferGeometry;
  for (const name of Object.keys(g.attributes)) {
    if (!KEEP_ATTRS.includes(name)) g.deleteAttribute(name);
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    const n = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  g.deleteAttribute('skinIndex');
  g.deleteAttribute('skinWeight');
  return g;
}

export function mergeStaticGroup(root: THREE.Object3D): { before: number; after: number } {
  root.updateWorldMatrix(true, true);
  // geometría en el espacio LOCAL de root (root puede tener transform)
  const rootInv = root.matrixWorld.clone().invert();

  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const mergedMeshes: THREE.Mesh[] = [];
  let before = 0;

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    // los de multi-material usan geometry.groups: se dejan como están
    if (Array.isArray(mesh.material)) return;
    before++;
    const rel = mesh.matrixWorld.clone().premultiply(rootInv);
    const g = sanitize(mesh.geometry);
    g.applyMatrix4(rel);
    const arr = buckets.get(mesh.material);
    if (arr) arr.push(g);
    else buckets.set(mesh.material, [g]);
    mergedMeshes.push(mesh);
  });

  if (mergedMeshes.length === 0) return { before: 0, after: 0 };

  // quita los originales
  for (const m of mergedMeshes) m.parent?.remove(m);

  // 1 mesh por material
  let after = 0;
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue; // atributos incompatibles: se pierde el bucket (raro)
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'kfs_merged_static';
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
    after++;
  }
  return { before, after };
}
