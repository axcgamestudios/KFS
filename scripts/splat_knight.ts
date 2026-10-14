// splat_knight.ts — rasterize the GLB vertices (z-buffered point splat) to 4 PNG views
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const file = process.argv[2] ?? 'public/game/models/medieval_knight.glb';
const outDir = process.argv[3] ?? '/tmp/kfs_splat';
mkdirSync(outDir, { recursive: true });

const buf = readFileSync(file);
const loader = new GLTFLoader();

loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // collect world-space positions + normals
  const pts: Array<{ x: number; y: number; z: number; nx: number; ny: number; nz: number }> = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  scene.traverse((o: any) => {
    if (!o.isMesh) return;
    const g = o.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      pts.push({ x: v.x, y: v.y, z: v.z, nx: n.x, ny: n.y, nz: n.z });
    }
  });
  console.log(`splat points: ${pts.length}`);

  const views: Array<{ name: string; dir: THREE.Vector3; up: THREE.Vector3 }> = [
    { name: 'front', dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
    { name: 'back', dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
    { name: 'right', dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
    { name: 'left', dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  ];

  const W = 900, H = 1200;
  const camDist = Math.max(size.x, size.y, size.z) * 2.2;
  const right = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const rel = new THREE.Vector3();

  for (const view of views) {
    const zbuf = new Float32Array(W * H).fill(Infinity);
    const img = Buffer.alloc(W * H * 4, 0);
    // fill background dark gray
    for (let i = 0; i < W * H; i++) { img[i * 4] = 28; img[i * 4 + 1] = 28; img[i * 4 + 2] = 32; img[i * 4 + 3] = 255; }

    right.crossVectors(view.up, view.dir).normalize().negate(); // screen-right
    camPos.copy(view.dir).multiplyScalar(camDist).add(center);
    // light from camera
    for (const p of pts) {
      rel.set(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z).normalize();
      const depth = -rel.dot(view.dir) * camDist; // approx depth along view dir
      const sx = (right.x * (p.x - center.x) + right.y * (p.y - center.y) + right.z * (p.z - center.z));
      const sy = (view.up.x * (p.x - center.x) + view.up.y * (p.y - center.y) + view.up.z * (p.z - center.z));
      const scale = (H * 0.42) / Math.max(size.y, 1) * 1.15;
      const px = Math.round(W / 2 + sx * scale);
      const py = Math.round(H / 2 - sy * scale);
      if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1) continue;
      const idx = py * W + px;
      if (depth < zbuf[idx]) {
        zbuf[idx] = depth;
        // lambert from camera + key light
        const lam = Math.max(0, -(p.nx * rel.x + p.ny * rel.y + p.nz * rel.z));
        const key = Math.max(0, p.nx * 0.4 + p.ny * 0.7 + p.nz * 0.3);
        const shade = 0.28 + lam * 0.55 + key * 0.25;
        img[idx * 4] = Math.min(255, 200 * shade + 30);
        img[idx * 4 + 1] = Math.min(255, 200 * shade + 30);
        img[idx * 4 + 2] = Math.min(255, 210 * shade + 40);
      }
    }
    // write raw → PNG via sharp
    const sharpMod = (require as any)('/home/z/my-project/node_modules/sharp');
    sharpMod(img, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toFile(path.join(outDir, `${view.name}.png`))
      .then(() => console.log(`view ${view.name} png written`))
      .catch((e: any) => console.error(`${view.name} png FAILED`, e.message));
    console.log(`view ${view.name} done`);
  }
}, (err) => { console.error('PARSE ERROR:', err); process.exit(1); });
