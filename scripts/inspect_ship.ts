/**
 * Measure pirate_ship.glb: bbox in raw units + Y span of each material
 * (the dark anti-fouling hull below the waterline vs the painted topsides).
 * This verifies/refines the WATERLINE_RAW = -60 assumption in Ship.attachGlb.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as fs from 'node:fs';

const path = '/home/z/my-project/public/game/models/pirate_ship.glb';
const data = fs.readFileSync(path);
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  console.log('BBOX size :', size.x.toFixed(1), size.y.toFixed(1), size.z.toFixed(1));
  console.log('BBOX min  :', box.min.x.toFixed(1), box.min.y.toFixed(1), box.min.z.toFixed(1));
  console.log('BBOX max  :', box.max.x.toFixed(1), box.max.y.toFixed(1), box.max.z.toFixed(1));

  // Node scales along the root chain
  console.log('\nscene children:');
  for (const c of scene.children) {
    console.log(`  ${c.name || c.type} scale=(${c.scale.x}, ${c.scale.y}, ${c.scale.z})`);
  }

  // Per-material Y spans (WORLD space, after matrixWorld)
  const spans = new Map<string, { min: number; max: number; count: number }>();
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const step = Math.max(1, Math.floor(pos.count / 500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      v.applyMatrix4(m.matrixWorld);   // WORLD space
      for (const mat of mats) {
        const name = (mat as THREE.Material).name || 'unnamed';
        let s = spans.get(name);
        if (!s) { s = { min: Infinity, max: -Infinity, count: 0 }; spans.set(name, s); }
        if (v.y < s.min) s.min = v.y;
        if (v.y > s.max) s.max = v.y;
        s.count++;
      }
    }
  });
  console.log('\nPer-material WORLD Y spans (sampled):');
  for (const [name, s] of spans) {
    console.log(`  ${name}: y ${s.min.toFixed(0)} .. ${s.max.toFixed(0)} (${s.count} samples)`);
  }
  process.exit(0);
}, (err) => { console.error('PARSE ERROR', err); process.exit(1); });
