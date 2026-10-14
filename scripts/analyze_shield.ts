import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as fs from 'fs';
const load = (p: string): Promise<THREE.Group> => new Promise((res, rej) => {
  const d = fs.readFileSync(p);
  new GLTFLoader().parse(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength), '', (g) => res(g.scene as unknown as THREE.Group), rej);
});
(async () => {
  const scene = await load('public/game/models/medieval_props.glb');
  scene.updateMatrixWorld(true);
  const byName = new Map<string, THREE.Object3D>();
  scene.traverse((o) => { if (o.name && !byName.has(o.name)) byName.set(o.name, o); });
  for (const nm of ['shield_02', 'shield_01', 'sword_02']) {
    const n = byName.get(nm);
    if (!n) { console.log(nm, 'NOT FOUND'); continue; }
    const box = new THREE.Box3().setFromObject(n);
    const sz = box.getSize(new THREE.Vector3());
    // dominant normal
    const cnt = new Map<string, number>();
    n.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh || !m.geometry) return;
      const nor = m.geometry.getAttribute('normal') as THREE.BufferAttribute;
      const nm3 = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
      const v = new THREE.Vector3();
      for (let i = 0; i < nor.count; i += 2) {
        v.fromBufferAttribute(nor, i).applyMatrix3(nm3);
        const ax = Math.abs(v.x) > Math.abs(v.y) && Math.abs(v.x) > Math.abs(v.z) ? 'X' : Math.abs(v.y) > Math.abs(v.z) ? 'Y' : 'Z';
        cnt.set(ax, (cnt.get(ax) ?? 0) + 1);
      }
    });
    console.log(nm, 'bbox size', sz.toArray().map((x) => x.toFixed(2)).join(','), 'dominant normal:', [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]);
  }
})();
