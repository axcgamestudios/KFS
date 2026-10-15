// analyze_f25_anatomy.ts — vertical slices of the NEW armour model (scaled to
// 1.95 m, feet at 0) to locate landmarks for the rig: where are hips, knees,
// ankles, shoulders, elbows, wrists, head; how wide is the torso; how far out
// do the A-pose arms sit; is there a tasset skirt in front that must not
// follow the legs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

(globalThis as any).self = globalThis;
const file = process.argv[2] ?? 'uploads/medieval_knight_armour.glb';
const TARGET_H = 1.95;

async function main() {
  const buf = readFileSync(file);
  const gltf = await new Promise<any>((res, rej) => {
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej);
  });
  const scene: THREE.Object3D = gltf.scene;
  scene.updateMatrixWorld(true);

  const pts: Array<[number, number, number]> = [];
  const v = new THREE.Vector3();
  scene.traverse((o: any) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      pts.push([v.x, v.y, v.z]);
    }
  });
  let minY = Infinity, maxY = -Infinity;
  for (const q of pts) { if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
  const s = TARGET_H / (maxY - minY);
  const P = pts.map(([x, y, z]) => [x * s, (y - minY) * s, z * s] as [number, number, number]);
  console.log(`verts=${pts.length} scale=${s.toFixed(4)} rawH=${(maxY - minY).toFixed(3)}`);

  const band = (y0: number, y1: number, fn?: (x: number, y: number, z: number) => boolean) => {
    const sel = P.filter(([x, y, z]) => y >= y0 && y < y1 && (!fn || fn(x, y, z)));
    if (!sel.length) return null;
    let x = 0, z = 0, xl = Infinity, xh = -Infinity, zl = Infinity, zh = -Infinity;
    for (const q of sel) {
      x += q[0]; z += q[2];
      if (q[0] < xl) xl = q[0]; if (q[0] > xh) xh = q[0];
      if (q[2] < zl) zl = q[2]; if (q[2] > zh) zh = q[2];
    }
    const n = sel.length;
    return { n, cx: x / n, cz: z / n, xl, xh, zl, zh, w: xh - xl, d: zh - zl };
  };
  const fmt = (b: ReturnType<typeof band>) => b
    ? `n=${String(b.n).padStart(5)} cx=${b.cx.toFixed(3)} cz=${b.cz.toFixed(3)} x[${b.xl.toFixed(3)},${b.xh.toFixed(3)}] z[${b.zl.toFixed(3)},${b.zh.toFixed(3)}]`
    : 'EMPTY';

  console.log('\n=== HORIZONTAL BANDS (y in metres, H=1.95) ===');
  for (let y = 0; y < 1.95; y += 0.05) {
    console.log(`y ${y.toFixed(2)}-${(y + 0.05).toFixed(2)}: ${fmt(band(y, y + 0.05))}`);
  }

  console.log('\n=== LATERAL SPLIT (|x| > 0.14 — outside torso) ===');
  for (let y = 0.7; y < 1.75; y += 0.05) {
    const l = band(y, y + 0.05, (x) => x > 0.14);
    const r = band(y, y + 0.05, (x) => x < -0.14);
    console.log(`y ${y.toFixed(2)}: L ${l ? `n=${l.n} cx=${l.cx.toFixed(3)} cz=${l.cz.toFixed(3)}` : '--'}  |  R ${r ? `n=${r.n} cx=${r.cx.toFixed(3)} cz=${r.cz.toFixed(3)}` : '--'}`);
  }

  console.log('\n=== LEGS SPLIT (below y=1.0, |x|>0.08) ===');
  for (let y = 0; y < 1.05; y += 0.05) {
    const l = band(y, y + 0.05, (x, _yy, z) => x > 0.08 && z > -0.25 && z < 0.25);
    const r = band(y, y + 0.05, (x, _yy, z) => x < -0.08 && z > -0.25 && z < 0.25);
    console.log(`y ${y.toFixed(2)}: L ${l ? `n=${l.n} cx=${l.cx.toFixed(3)} cz=${l.cz.toFixed(3)} x[${l.xl.toFixed(2)},${l.xh.toFixed(2)}]` : '--'}  |  R ${r ? `n=${r.n} cx=${r.cx.toFixed(3)} cz=${r.cz.toFixed(3)} x[${r.xl.toFixed(2)},${r.xh.toFixed(2)}]` : '--'}`);
  }

  // Facing check: at shin height, does more geometry sit at +Z (toes) than -Z?
  const shin = P.filter(([, y]) => y > 0.15 && y < 0.35);
  let zp = 0, zm = 0;
  for (const q of shin) { if (q[2] > 0.05) zp++; if (q[2] < -0.05) zm++; }
  console.log(`\nshin z-split: +Z(${zp}) vs -Z(${zm}) -> toes face ${zp > zm ? '+Z' : '-Z'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
