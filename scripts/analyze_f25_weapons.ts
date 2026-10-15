// analyze_f25_weapons.ts — orientation probe for the uploaded sword + bow:
// which axis does the blade span, which end is the tip, where is the grip
// centre, which way does the bow's string face.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

(globalThis as any).self = globalThis;

async function load(file: string) {
  const buf = readFileSync(file);
  return new Promise<any>((res, rej) => {
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej);
  });
}

function bandStats(pts: Array<[number, number, number]>, axis: 0 | 1 | 2, lo: number, hi: number) {
  const sel = pts.filter((p) => p[axis] >= lo && p[axis] < hi);
  if (!sel.length) return null;
  const others = ([0, 1, 2].filter((a) => a !== axis)) as Array<0 | 1 | 2>;
  let ext: Array<[number, number]> = [[Infinity, -Infinity], [Infinity, -Infinity]];
  for (const p of sel) {
    for (let k = 0; k < 2; k++) {
      const v = p[others[k]];
      if (v < ext[k][0]) ext[k][0] = v;
      if (v > ext[k][1]) ext[k][1] = v;
    }
  }
  return { n: sel.length, w0: ext[0][1] - ext[0][0], w1: ext[1][1] - ext[1][0], ext };
}

async function main() {
  // ---- SWORD ----
  {
    const gltf = await load('uploads/medieval_sword.glb');
    const pts: Array<[number, number, number]> = [];
    const v = new THREE.Vector3();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o: any) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        pts.push([v.x, v.y, v.z]);
      }
    });
    console.log(`SWORD: ${pts.length} verts`);
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
    console.log(`bbox min=[${mn.map((n) => n.toFixed(3))}] max=[${mx.map((n) => n.toFixed(3))}]`);
    // slice along X in 20 bands: cross-section width in z and y per band
    const x0 = mn[0], x1 = mx[0];
    console.log('band  x-range              n     dy      dz   (narrow=end=tip)');
    for (let i = 0; i < 20; i++) {
      const lo = x0 + (x1 - x0) * (i / 20), hi = x0 + (x1 - x0) * ((i + 1) / 20);
      const b = bandStats(pts, 0, lo, hi);
      if (b) console.log(`${String(i).padStart(2)}  [${lo.toFixed(3)},${hi.toFixed(3)})  ${String(b.n).padStart(5)}  ${b.w0.toFixed(3)}  ${b.w1.toFixed(3)}`);
    }
    // centroid of the whole and of the thin tail
    const tip = pts.filter((p) => p[0] > x0 + (x1 - x0) * 0.92);
    const hilt = pts.filter((p) => p[0] < x0 + (x1 - x0) * 0.15);
    const cen = (arr: Array<[number, number, number]>) => {
      let c = [0, 0, 0]; for (const p of arr) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
      return arr.length ? c.map((n) => n / arr.length) : c;
    };
    console.log('tip centroid:', cen(tip).map((n) => n.toFixed(3)));
    console.log('hilt centroid:', cen(hilt).map((n) => n.toFixed(3)));
  }

  // ---- BOW ----
  {
    const gltf = await load('uploads/medieval_bow_game_model.glb');
    const pts: Array<[number, number, number]> = [];
    const v = new THREE.Vector3();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o: any) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        pts.push([v.x, v.y, v.z]);
      }
    });
    console.log(`\nBOW: ${pts.length} verts`);
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
    console.log(`bbox min=[${mn.map((n) => n.toFixed(3))}] max=[${mx.map((n) => n.toFixed(3))}]`);
    // slice along Y: where is the grip (widest x at centre), which side do limbs bulge (z sign at centre)
    const y0 = mn[1], y1 = mx[1];
    console.log('band  y-range              n     dx      dz');
    for (let i = 0; i < 16; i++) {
      const lo = y0 + (y1 - y0) * (i / 16), hi = y0 + (y1 - y0) * ((i + 1) / 16);
      const b = bandStats(pts, 1, lo, hi);
      if (b) console.log(`${String(i).padStart(2)}  [${lo.toFixed(3)},${hi.toFixed(3)})  ${String(b.n).padStart(5)}  ${b.w0.toFixed(3)}  ${b.w1.toFixed(3)}  z[${b.ext[1][0].toFixed(3)},${b.ext[1][1].toFixed(3)}]`);
    }
    // string: the straight line — verts with small |x| far from centre? find verts closest to the chord line
    const midBand = pts.filter((p) => Math.abs(p[1]) < 0.15);
    let zmn = Infinity, zmx = -Infinity;
    for (const p of midBand) { if (p[2] < zmn) zmn = p[2]; if (p[2] > zmx) zmx = p[2]; }
    console.log(`grip band z extent: [${zmn.toFixed(3)}, ${zmx.toFixed(3)}] — belly (limbs bulge) vs string side`);
    // top/bottom tips z:
    for (const [label, sel] of [['top', pts.filter((p) => p[1] > y1 - 0.12)], ['bottom', pts.filter((p) => p[1] < y0 + 0.12)]] as Array<[string, Array<[number, number, number]>]>) {
      let zs = 0; for (const p of sel) zs += p[2];
      console.log(`${label} tip mean z: ${(zs / Math.max(1, sel.length)).toFixed(3)} (n=${sel.length})`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
