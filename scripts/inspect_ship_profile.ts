/**
 * Profile the ship hull by world-Y buckets: which materials live at which
 * height + the hull's width profile. The designed waterline shows as the
 * top of the dark anti-fouling band (Main/Mat.1/Mat.5), and the deck edge
 * as the width plateau. Renders nothing — pure numbers.
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

  const BUCKET = 60; // raw units per bucket
  interface Bucket { mats: Set<string>; maxX: number; n: number }
  const buckets = new Map<number, Bucket>();
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const names = mats.map((mm) => (mm as THREE.Material).name || 'unnamed');
    const step = Math.max(1, Math.floor(pos.count / 3000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      v.applyMatrix4(m.matrixWorld);
      const bi = Math.floor(v.y / BUCKET);
      let b = buckets.get(bi);
      if (!b) { b = { mats: new Set(), maxX: 0, n: 0 }; buckets.set(bi, b); }
      for (const nm of names) b.mats.add(nm);
      if (Math.abs(v.x) > b.maxX) b.maxX = Math.abs(v.x);
      b.n++;
    }
  });

  const keys = [...buckets.keys()].sort((a, b) => a - b);
  console.log('bucket(y range) | n | maxX | materials');
  for (const k of keys) {
    const b = buckets.get(k)!;
    const y0 = k * BUCKET, y1 = y0 + BUCKET;
    console.log(
      `${y0.toFixed(0).padStart(6)}..${y1.toFixed(0).padStart(6)} | ${String(b.n).padStart(5)} | ${b.maxX.toFixed(0).padStart(4)} | ${[...b.mats].join(',')}`,
    );
  }
  process.exit(0);
}, (err) => { console.error('PARSE ERROR', err); process.exit(1); });
