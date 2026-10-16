// probe_f28_arm.ts — Fase 28 offline probe: WHY does the swordless arm
// (the LEFT arm) stretch during walk/attack/swim? Same discipline as
// probe_f26_feet.ts: offline skinning math on the CURRENT knight_rigged.glb
// (post F27 hand surgery + F28 shield-removal surgeries), real in-game pose
// values, no guessing.
//
//  1. census of the LEFT/RIGHT arm slabs (statue x>=17 / x<=-17, y 0..78)
//     — which bones carry the load, and is chest/lat geometry living inside
//     the arm slab (dragged by arm swings)?
//  2. sub-region classification along the arm chain (S→E→W):
//     upperArm / elbowBand / forearm / wristBand / hand — weight audit each
//  3. LIVE POSE TESTS with the REAL game values, measuring
//     (a) triangle edge-stretch ratios in the arm region
//     (b) per-vertex deviation from the anatomically-correct rigid bone
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

const SRC = process.argv[2] ?? 'public/game/models/knight_rigged.glb';

async function main(): Promise<void> {
  const buf = readFileSync(SRC);
  const gltf = await new Promise<any>((res, rej) => {
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej);
  });
  const scene: THREE.Object3D = gltf.scene;
  scene.updateMatrixWorld(true);

  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) meshes.push(m); });

  for (const sk of meshes) {
    if (sk.name !== 'knight_upper') continue; // arms live in the upper mesh
    const geo = sk.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const sIdx = geo.attributes.skinIndex as THREE.BufferAttribute;
    const sW = geo.attributes.skinWeight as THREE.BufferAttribute;
    const bones: THREE.Bone[] = sk.skeleton.bones;
    const inv: THREE.Matrix4[] = sk.skeleton.boneInverses;
    const boneIndex = new Map<string, number>();
    bones.forEach((b, i) => boneIndex.set(b.name, i));

    const dominant = (i: number): string => {
      let best = -1, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sW.getComponent(i, k); if (w > bw) { bw = w; best = sIdx.getComponent(i, k); } }
      return bones[best]?.name ?? '#';
    };

    // ---------- 1. ARM SLAB CENSUS ----------
    // statue scale: 210.48 units -> 1.95 m, so statue 17 -> game 0.157, y 78 -> 0.723
    for (const side of ['L', 'R'] as const) {
      const sgn = side === 'L' ? 1 : -1;
      const slab = new Uint8Array(pos.count);
      let n = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (sgn * x >= 0.157 && y >= 0.0 && y <= 0.723 && z >= -0.278 && z <= 0.25) { slab[i] = 1; n++; }
      }
      console.log(`\n[census ${side}] arm slab (|x|>=0.157, y 0..0.723) verts=${n}`);
      const load = new Map<string, number>();
      const yBuckets = new Map<string, number[]>(); // domBone -> [count]
      for (let i = 0; i < pos.count; i++) {
        if (!slab[i]) continue;
        const dom = dominant(i);
        load.set(dom, (load.get(dom) ?? 0) + 1);
        yBuckets.set(dom, [...(yBuckets.get(dom) ?? []), pos.getY(i)]);
      }
      const sorted = Array.from(load.entries()).sort((a, b) => b[1] - a[1]);
      for (const [bn, c] of sorted.slice(0, 8)) {
        const ys = yBuckets.get(bn)!;
        ys.sort((a, b) => a - b);
        console.log(`[census ${side}]   ${bn.padEnd(12)} ${(c / n * 100).toFixed(1)}%  y p5=${ys[Math.floor(ys.length*0.05)]?.toFixed(3)} med=${ys[Math.floor(ys.length/2)]?.toFixed(3)} p95=${ys[Math.floor(ys.length*0.95)]?.toFixed(3)}`);
      }
    }

    // ---------- 2. SUB-REGION CLASSIFICATION along the chain ----------
    const chainOf = (side: 'L' | 'R') => {
      const Sn = `j_shoulder${side}`, En = `j_elbow${side}`, Wn = `j_wrist${side}`;
      const S = new THREE.Vector3(), E = new THREE.Vector3(), W = new THREE.Vector3();
      bones[boneIndex.get(Sn)!].getWorldPosition(S);
      bones[boneIndex.get(En)!].getWorldPosition(E);
      bones[boneIndex.get(Wn)!].getWorldPosition(W);
      return { S, E, W };
    };
    // along-chain param t: 0 at S, 1 at E, 2 at W (projection onto polyline)
    const chainT = (v: THREE.Vector3, S: THREE.Vector3, E: THREE.Vector3, W: THREE.Vector3): number => {
      const tSE = new THREE.Vector3().subVectors(E, S);
      const tEW = new THREE.Vector3().subVectors(W, E);
      const p1 = new THREE.Vector3().subVectors(v, S);
      let t1 = p1.dot(tSE) / tSE.lengthSq(); t1 = Math.max(0, Math.min(1, t1));
      const d1 = new THREE.Vector3().copy(S).addScaledVector(tSE, t1).distanceTo(v);
      const p2 = new THREE.Vector3().subVectors(v, E);
      let t2 = p2.dot(tEW) / tEW.lengthSq(); t2 = Math.max(0, Math.min(1, t2));
      const d2 = new THREE.Vector3().copy(E).addScaledVector(tEW, t2).distanceTo(v);
      return d1 <= d2 ? t1 : 1 + t2;
    };

    const regionOf = (t: number): string => {
      if (t < 0.88) return 'upperArm';
      if (t < 1.12) return 'elbowBand';
      if (t < 1.80) return 'forearm';
      if (t < 1.96) return 'wristBand';
      return 'hand';
    };

    for (const side of ['L', 'R'] as const) {
      const { S, E, W } = chainOf(side);
      console.log(`\n[chain ${side}] S=${S.toArray().map(v=>v.toFixed(3))} E=${E.toArray().map(v=>v.toFixed(3))} W=${W.toArray().map(v=>v.toFixed(3))}`);
      const groups = new Map<string, { count: number; mix: Map<string, number> }>();
      for (let i = 0; i < pos.count; i++) {
        const dom = dominant(i);
        if (dom !== `j_shoulder${side}` && dom !== `j_elbow${side}` && dom !== `j_wrist${side}`) continue;
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        const t = chainT(v, S, E, W);
        const reg = regionOf(t);
        let g = groups.get(reg); if (!g) { g = { count: 0, mix: new Map() }; groups.set(reg, g); }
        g.count++;
        for (let k = 0; k < 4; k++) {
          const w = sW.getComponent(i, k); if (w <= 0.001) continue;
          const bn = bones[sIdx.getComponent(i, k)]?.name ?? '?';
          g.mix.set(bn, (g.mix.get(bn) ?? 0) + w);
        }
      }
      for (const [reg, g] of groups) {
        const tot = Array.from(g.mix.values()).reduce((a, b) => a + b, 0);
        const mix = Array.from(g.mix.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
          .map(([bn, w]) => `${bn.replace('j_', '')}:${(w / tot * 100).toFixed(0)}%`).join(' ');
        console.log(`[chain ${side}]   ${reg.padEnd(10)} n=${String(g.count).padStart(5)}  ${mix}`);
      }
    }

    // ---------- 3. POSE STRETCH TESTS ----------
    const bind: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) bind.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    const domArr: string[] = [];
    for (let i = 0; i < pos.count; i++) domArr.push(dominant(i));

    const skinned = (): THREE.Vector3[] => {
      const out: THREE.Vector3[] = [];
      const tmp = new THREE.Matrix4();
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3();
        let wsum = 0;
        for (let k = 0; k < 4; k++) {
          const w = sW.getComponent(i, k); if (w <= 0) continue;
          const b = sIdx.getComponent(i, k);
          tmp.multiplyMatrices(bones[b].matrixWorld, inv[b]);
          const pv = bind[i].clone().applyMatrix4(tmp);
          v.addScaledVector(pv, w); wsum += w;
        }
        if (wsum > 0) v.multiplyScalar(1 / wsum);
        out.push(v);
      }
      return out;
    };

    const reset = (): void => {
      for (const b of bones) { b.rotation.set(0, 0, 0); b.updateMatrixWorld(true); }
      scene.updateMatrixWorld(true);
    };
    const setRot = (name: string, x: number, y: number, z: number): void => {
      const b = bones[boneIndex.get(name)!];
      if (!b) return;
      b.rotation.set(x, y, z); b.updateMatrixWorld(true);
    };

    // real game poses — LEFT arm (the swordless arm)
    const POSES: Array<{ label: string; side: 'L' | 'R'; sh: [number, number, number]; el: [number, number, number]; wr: [number, number, number] }> = [
      { label: 'L sprint back-swing (shoulder -0.67, elbow -1.11)', side: 'L', sh: [-0.67, 0, 0.06], el: [-1.11, 0, 0], wr: [-0.18, 0, 0.05] },
      { label: 'L sprint fwd-swing (shoulder +0.67, elbow -0.55)', side: 'L', sh: [0.67, 0, 0.06], el: [-0.55, 0, 0], wr: [0.18, 0, 0.05] },
      { label: 'L shield charge (shoulder -1.12 y0.28 z0.30, elbow -1.02)', side: 'L', sh: [-1.12, 0.28, 0.30], el: [-1.02, 0, 0.16], wr: [-0.05, 0, 0] },
      { label: 'L heavy windup (sh -0.18 z0.62, el -0.55)', side: 'L', sh: [-0.18, 0, 0.62], el: [-0.55, 0, 0], wr: [0, 0, 0] },
      { label: 'L heavy strike (sh -0.5 z-0.15, el -1.0)', side: 'L', sh: [-0.5, 0, -0.15], el: [-1.0, 0, 0], wr: [0, 0, 0] },
      { label: 'L swim (sh -1.42, el -0.08)', side: 'L', sh: [-1.42, 0, 0.10], el: [-0.08, 0, 0], wr: [0, 0, 0] },
      { label: 'L block hit (sh -0.55 z0.34, el -1.05)', side: 'L', sh: [-0.55, 0, 0.34], el: [-1.05, 0, 0], wr: [0, 0, 0] },
      // right arm extremes (armed) — for the same treatment
      { label: 'R heavy windup (sh -2.35 z-0.55, el -0.6)', side: 'R', sh: [-2.35, 0, -0.55], el: [-0.6, 0, 0], wr: [0.55, 0, 0.05] },
      { label: 'R heavy strike follow (sh +1.08 z-0.45, el -0.1)', side: 'R', sh: [1.08, 0, -0.45], el: [-0.1, 0, 0], wr: [0.3, 0, 0] },
      { label: 'R thrust full (sh -1.75, el -0.05, wr 1.7)', side: 'R', sh: [-1.75, 0, -0.05], el: [-0.05, 0, 0], wr: [1.7, 0, 0] },
      { label: 'R walk armed ready (sh -0.32 gait, el -0.72..)', side: 'R', sh: [-0.66, -0.05, -0.18], el: [-1.04, 0, 0], wr: [0, 0, 0.1] },
    ];

    const idxArr = (geo.index as THREE.BufferAttribute | null);
    const triCount = idxArr ? idxArr.count / 3 : pos.count / 3;
    const triAt = (t: number): [number, number, number] => {
      if (idxArr) return [idxArr.getX(t * 3), idxArr.getX(t * 3 + 1), idxArr.getX(t * 3 + 2)];
      return [t * 3, t * 3 + 1, t * 3 + 2];
    };

    for (const P of POSES) {
      reset();
      setRot(`j_shoulder${P.side}`, P.sh[0], P.sh[1], P.sh[2]);
      setRot(`j_elbow${P.side}`, P.el[0], P.el[1], P.el[2]);
      setRot(`j_wrist${P.side}`, P.wr[0], P.wr[1], P.wr[2]);
      scene.updateMatrixWorld(true);
      const posed = skinned();

      // (a) triangle edge stretch within the arm region
      const armTri = (a: number, b: number, c: number): boolean => {
        const names = [domArr[a], domArr[b], domArr[c]];
        const sfx = P.side;
        return names.every(n => n === `j_shoulder${sfx}` || n === `j_elbow${sfx}` || n === `j_wrist${sfx}`);
      };
      let worst = 0, worstAt = -1; let over105 = 0, over108 = 0, under092 = 0, total = 0;
      for (let t = 0; t < triCount; t++) {
        const [a, b, c] = triAt(t);
        if (!armTri(a, b, c)) continue;
        total++;
        const edges: Array<[number, number]> = [[a, b], [b, c], [a, c]];
        for (const [u, v] of edges) {
          const b0 = bind[u].distanceTo(bind[v]);
          const b1 = posed[u].distanceTo(posed[v]);
          if (b0 < 1e-6) continue;
          const ratio = b1 / b0;
          if (ratio > worst) { worst = ratio; worstAt = u; }
          if (ratio > 1.05) over105++;
          if (ratio > 1.08) over108++;
          if (ratio < 0.92) under092++;
        }
      }
      // (b) per-vert rigid deviation vs the anatomically-correct bone
      const devs: Array<{ i: number; reg: string; mm: number }> = [];
      const { S, E, W } = chainOf(P.side);
      for (let i = 0; i < pos.count; i++) {
        const sfx = P.side;
        if (domArr[i] !== `j_shoulder${sfx}` && domArr[i] !== `j_elbow${sfx}` && domArr[i] !== `j_wrist${sfx}`) continue;
        const t = chainT(bind[i], S, E, W);
        const reg = regionOf(t);
        let refBone: THREE.Bone;
        if (reg === 'upperArm' || reg === 'elbowBand') refBone = bones[boneIndex.get(`j_shoulder${sfx}`)!];
        else if (reg === 'forearm' || reg === 'wristBand') refBone = bones[boneIndex.get(`j_elbow${sfx}`)!];
        else refBone = bones[boneIndex.get(`j_wrist${sfx}`)!];
        const tmp = new THREE.Matrix4().multiplyMatrices(refBone.matrixWorld, inv[boneIndex.get(refBone.name)!]);
        const rigid = bind[i].clone().applyMatrix4(tmp);
        devs.push({ i, reg, mm: posed[i].distanceTo(rigid) * 1000 });
      }
      devs.sort((a, b) => b.mm - a.mm);
      const byReg = new Map<string, number>();
      for (const d of devs) byReg.set(d.reg, Math.max(byReg.get(d.reg) ?? 0, d.mm));
      const regStr = Array.from(byReg.entries()).map(([r, m]) => `${r}:${m.toFixed(0)}mm`).join(' ');
      const worstInfo = worstAt >= 0 ? `${domArr[worstAt]} t=${chainT(bind[worstAt], S, E, W).toFixed(2)} at ${bind[worstAt].toArray().map(v=>v.toFixed(2))}` : '-';
      console.log(`\n[pose] ${P.label}`);
      console.log(`  tris=${total} edgeStretch worst=${worst.toFixed(3)} >1.05: ${over105}  >1.08: ${over108}  <0.92: ${under092}  worstEdge@ ${worstInfo}`);
      console.log(`  rigid-dev max by region: ${regStr}  top5: ${devs.slice(0, 5).map(d => `${d.reg}@${domArr[d.i]}:${d.mm.toFixed(0)}mm(${bind[d.i].toArray().map(v=>v.toFixed(2)).join(',')})`).join(' ')}`);
    }
  }
  console.log('\n[done]');
}

main().catch((e) => { console.error(e); process.exit(1); });
