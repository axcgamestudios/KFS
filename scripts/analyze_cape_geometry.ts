// Back-column (|x|<0.28, z<-0.02) y/z histogram of the knight — where does
// the cape sheet actually live? Rows = 10cm y bands, cols = z bands.
import * as THREE from 'three';
import { readFileSync } from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const buf = readFileSync('public/game/models/medieval_knight_rigged.glb');
const gltf: any = await new Promise<any>((res, rej) =>
  new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej));
let sm: THREE.SkinnedMesh | null = null;
gltf.scene.traverse((o: any) => { if (o.isSkinnedMesh && !sm) sm = o; });
const pos = (sm as THREE.SkinnedMesh).geometry.getAttribute('position') as THREE.BufferAttribute;

const zEdges = [-0.36, -0.30, -0.26, -0.23, -0.20, -0.18, -0.16, -0.14, -0.12, -0.10, -0.08, -0.06, -0.04, -0.02];
const zLabels = zEdges.slice(0, -1).map((v, i) => `${v.toFixed(2)}`);
const yBands: number[] = [];
for (let y = 0.0; y <= 1.6001; y += 0.1) yBands.push(Math.round(y * 10) / 10);
const grid = new Map<string, number[]>();
const zeros = () => new Array(zEdges.length - 1).fill(0);
for (const yb of yBands) grid.set(yb.toFixed(1), zeros());

for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
  if (Math.abs(x) > 0.28 || z >= -0.02) continue;
  const yb = Math.min(1.6, Math.floor(y / 0.1) * 0.1).toFixed(1);
  let zi = -1;
  for (let k = 0; k < zEdges.length - 1; k++) if (z >= zEdges[k] && z < zEdges[k + 1]) { zi = k; break; }
  if (z < zEdges[0]) zi = 0;
  if (zi < 0) continue;
  const row = grid.get(yb);
  if (row) row[zi]++;
}
console.log('y \\ z to | ' + zLabels.map((s) => s.padStart(6)).join(''));
for (const yb of yBands.slice().reverse()) {
  const row = grid.get(yb.toFixed(1))!;
  const total = row.reduce((a, b) => a + b, 0);
  if (total === 0) continue;
  console.log(`y ${yb.toFixed(1).padEnd(5)} |` + row.map((n) => String(n).padStart(6)).join('') + `   = ${total}`);
}
