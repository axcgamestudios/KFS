// rig_armour.ts — Fase 25: rig the user's NEW lightweight armour model
// (medieval_knight_armour.glb, A-pose, 9.3k verts, great helm + full plate)
// onto the game's 15-bone skeleton (+ 2 cape bones), smooth-skinned, feet at
// y=0, H=1.95, facing +Z (RIGHT = -X). Exports knight_armour_rigged.glb.
//
// Differences vs the old statue knight (rig_knight.ts):
//   · A-pose bind: arms abducted ~20°, elbows out at x ±0.45, forearms in.
//   · Full-plate body: tassets (front skirt) + back fauld must ride j_root
//     (the old tabard override, re-zoned for this armour's geometry).
//   · NO cape in the source — we BUILD one: a crimson panel skinned to
//     j_cape1/j_cape2 (the F22 spring-damper cloth layer keeps its life).
//   · Two meshes in the GLB: body (transplanted JPEG) + cape (plain color).
//
// Pipeline: parse → merge → normalize → detect landmarks → skeleton →
// skin weights → GLB export → splat verification (bind/regions/poses).
(globalThis as any).self = globalThis; // GLTFLoader Node polyfill
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const SRC = process.argv[2] ?? 'uploads/medieval_knight_armour.glb';
const OUT_GLB = process.argv[3] ?? 'public/game/models/knight_armour_rigged.glb';
const OUT_JSON = OUT_GLB.replace(/\.glb$/, '.json');
const SPLAT_DIR = '/tmp/kfs_armour_check';
const TARGET_H = 1.95;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
function distSeg(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const dx = px - (ax + abx * t), dy = py - (ay + aby * t), dz = pz - (az + abz * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

async function main(): Promise<void> {
  const buf = readFileSync(SRC);
  const gltf = await new Promise<any>((res, rej) => {
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej);
  });

  // ---------- 1. merge all meshes (world space) ----------
  const scene: THREE.Object3D = gltf.scene;
  scene.updateMatrixWorld(true);
  let totalVerts = 0;
  let totalIdx = 0;
  const parts: Array<{ pos: Float32Array; nrm: Float32Array; uv: Float32Array; idx: Uint32Array }> = [];
  scene.traverse((o: any) => {
    if (!o.isMesh) return;
    const g = o.geometry as THREE.BufferGeometry;
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const index = g.index!;
    const v = new THREE.Vector3(); const nm = new THREE.Vector3();
    const nm3 = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    const pos = new Float32Array(p.count * 3);
    const nrm = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      if (n) { nm.fromBufferAttribute(n, i).applyMatrix3(nm3).normalize(); }
      nrm[i * 3] = nm.x; nrm[i * 3 + 1] = nm.y; nrm[i * 3 + 2] = nm.z;
    }
    const idx = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i++) idx[i] = index.getX(i);
    parts.push({ pos, nrm, uv: uv ? new Float32Array(uv.array as ArrayLike<number>) : new Float32Array(p.count * 2), idx });
    totalVerts += p.count;
    totalIdx += index.count;
  });
  const position = new Float32Array(totalVerts * 3);
  const normal = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  const index = new Uint32Array(totalIdx);
  {
    let vo = 0, io = 0;
    for (const part of parts) {
      position.set(part.pos, vo * 3);
      normal.set(part.nrm, vo * 3);
      uv.set(part.uv, vo * 2);
      for (let i = 0; i < part.idx.length; i++) index[io + i] = part.idx[i] + vo;
      vo += part.pos.length / 3;
      io += part.idx.length;
    }
  }
  let N = totalVerts;

  // ---------- 2. normalize: feet at 0, scale to TARGET_H ----------
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < N; i++) {
    const y = position[i * 3 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const s = TARGET_H / (maxY - minY);
  for (let i = 0; i < N; i++) {
    position[i * 3] *= s;
    position[i * 3 + 1] = (position[i * 3 + 1] - minY) * s;
    position[i * 3 + 2] *= s;
  }
  console.log(`body: ${N} verts, ${totalIdx / 3} tris; scale=${s.toFixed(4)}`);

  // ---------- 3. landmark detection (A-pose armour) ----------
  const cloud = {
    filter(fn: (x: number, y: number, z: number) => boolean): number[] {
      const out: number[] = [];
      for (let i = 0; i < N; i++) {
        if (fn(position[i * 3], position[i * 3 + 1], position[i * 3 + 2])) out.push(i);
      }
      return out;
    },
    centroid(idxs: number[]): [number, number, number] {
      let x = 0, y = 0, z = 0;
      for (const i of idxs) { x += position[i * 3]; y += position[i * 3 + 1]; z += position[i * 3 + 2]; }
      const n = Math.max(1, idxs.length);
      return [x / n, y / n, z / n];
    },
    extent(idxs: number[], axis: 0 | 1 | 2): [number, number] {
      let lo = Infinity, hi = -Infinity;
      for (const i of idxs) { const v = position[i * 3 + axis]; if (v < lo) lo = v; if (v > hi) hi = v; }
      return [lo, hi];
    },
  };

  // --- feet (sabatons): lowest 12%, |x| split. Toes point +Z (verified). ---
  const feetIdx = cloud.filter((x, y, z) => y < 0.14 && z > -0.06 && Math.abs(x) < 0.26);
  const footL = feetIdx.filter((i) => position[i * 3] > 0);
  const footR = feetIdx.filter((i) => position[i * 3] < 0);
  const footCL = cloud.centroid(footL); const footCR = cloud.centroid(footR);

  // --- legs: greaves/cuisses, inside the tasset skirt zone ---
  // greaves (y 0.2..0.5) are clean; cuisses (y 0.55..0.95) mixed with tassets
  const legBand = (y0: number, y1: number, side: 1 | -1) =>
    cloud.centroid(cloud.filter((x, y, z) => y >= y0 && y < y1 && x * side > 0.08 && x * side < 0.24 && z > -0.13 && z < 0.13));
  const shinL = legBand(0.28, 0.44, 1);
  const shinR = legBand(0.28, 0.44, -1);
  // ankle: over the shin column (NOT the toe-biased foot centroid)
  const ankleLY = 0.115;
  const ankleL_: [number, number, number] = [shinL[0], ankleLY, shinL[2]];
  const ankleR_: [number, number, number] = [shinR[0], ankleLY, shinR[2]];
  const kneeL: [number, number, number] = [shinL[0], 0.52, shinL[2] * 0.5];
  const kneeR: [number, number, number] = [shinR[0], 0.52, shinR[2] * 0.5];
  const thighL = legBand(0.56, 0.68, 1);
  const thighR = legBand(0.56, 0.68, -1);
  const hipL: [number, number, number] = [thighL[0] * 0.82, 0.96, thighL[2] * 0.4];
  const hipR: [number, number, number] = [thighR[0] * 0.82, 0.96, thighR[2] * 0.4];

  // --- torso half width (waist band, no arms: |x| < 0.24) ---
  const waistIdx = cloud.filter((x, y) => y > 1.05 && y < 1.18 && Math.abs(x) < 0.26);
  const [waistMinX, waistMaxX] = cloud.extent(waistIdx, 0);
  const torsoHalf = Math.max(Math.abs(waistMinX), Math.abs(waistMaxX));

  // --- arms: A-pose. The elbows stick out lateral; the forearms angle back
  //     IN toward the thighs (they hide from a pure lateral filter), so the
  //     wrist is found by a tube fit along elbow→(inboard, down). ---
  const armIdx = cloud.filter((x, y, z) => y > 0.70 && y < 1.66 && Math.abs(x) > 0.34 && z > -0.14 && z < 0.24);
  const armL = armIdx.filter((i) => position[i * 3] > 0);
  const armR = armIdx.filter((i) => position[i * 3] < 0);
  const armBand = (idxs: number[], y0: number, y1: number) =>
    cloud.centroid(idxs.filter((i) => position[i * 3 + 1] >= y0 && position[i * 3 + 1] < y1));
  const [armLoY, armHiY] = cloud.extent(armIdx, 1);
  // shoulder: the arm mass root under the pauldron (top band, pulled inboard)
  const shRawL = armBand(armL, armHiY - 0.14, armHiY + 0.02);
  const shRawR = armBand(armR, armHiY - 0.14, armHiY + 0.02);
  const shoulderL: [number, number, number] = [Math.min(Math.max(shRawL[0], 0.21), 0.27), 1.56, shRawL[2] * 0.6];
  const shoulderR: [number, number, number] = [Math.max(Math.min(shRawR[0], -0.21), -0.27), 1.56, shRawR[2] * 0.6];
  // elbow: the widest arm band (A-pose elbows stick out, |x| > 0.42 is clean)
  const elbowMass = (side: 1 | -1) =>
    cloud.filter((x, y, z) => y > 0.95 && y < 1.30 && x * side > 0.42 && z > -0.10 && z < 0.24);
  const elbowL = cloud.centroid(elbowMass(1));
  const elbowR = cloud.centroid(elbowMass(-1));
  // wrist: tube fit — seed inboard-down from the elbow, then take the centroid
  // of the vertices within a radius of that seed line (the gauntlet column).
  const wristFit = (elb: [number, number, number], side: 1 | -1): [number, number, number] => {
    const seed: [number, number, number] = [elb[0] + side * -0.30, elb[1] - 0.34, elb[2] - 0.05];
    const tube = cloud.filter((x, y, z) =>
      y < elb[1] - 0.12 && y > 0.60
      && distSeg(x, y, z, elb[0], elb[1], elb[2], seed[0], seed[1], seed[2]) < 0.10);
    const c = cloud.centroid(tube);
    return [c[0], c[1], c[2]];
  };
  const wristL = wristFit(elbowL, 1);
  const wristR = wristFit(elbowR, -1);

  // --- head (great helm): top 12%, center band ---
  const headIdx = cloud.filter((x, y, z) => y > TARGET_H * 0.875 && Math.abs(x) < 0.14 && z > -0.14);
  const headC = cloud.centroid(headIdx);
  // the head JOINT sits at the neck top (the helm pivots at its base, not its
  // centre — turns read natural and FP-hiding folds the helm into the collar)
  const head: [number, number, number] = [headC[0], 1.72, headC[2] * 0.5];
  // neck: narrow band below the helm
  const neckIdx = cloud.filter((x, y) => y > TARGET_H * 0.83 && y < TARGET_H * 0.87 && Math.abs(x) < 0.13);
  const neckC = cloud.centroid(neckIdx);

  const root: [number, number, number] = [(hipL[0] + hipR[0]) / 2, 0.97, (hipL[2] + hipR[2]) / 2];
  const torso: [number, number, number] = [
    (shoulderL[0] + shoulderR[0]) / 2,
    1.30,
    (neckC[2] + root[2]) / 2,
  ];

  const LM = {
    root, torso, head, neck: neckC,
    shoulderR, shoulderL, elbowR, elbowL, wristR, wristL,
    hipR, hipL, kneeR, kneeL,
    ankleR: ankleR_, ankleL: ankleL_,
    footL: footCL, footR: footCR,
    torsoHalf, armLoY, armHiY,
  };
  console.log('--- LANDMARKS (feet-at-0, H=' + TARGET_H + ') ---');
  for (const [k, v] of Object.entries(LM)) {
    if (Array.isArray(v)) console.log(`${k}: [${v.map((n) => (typeof n === 'number' ? n.toFixed(3) : n)).join(', ')}]`);
  }

  // sanity gates (fail loudly rather than export a broken rig)
  const fail = (msg: string) => { throw new Error(`LANDMARK SANITY: ${msg}`); };
  if (Math.abs(hipL[0]) < 0.08 || Math.abs(hipL[0]) > 0.22) fail(`hipL x ${hipL[0]}`);
  if (Math.abs(wristR[0]) < 0.12 || Math.abs(wristR[0]) > 0.34) fail(`wristR x ${wristR[0]}`);
  if (Math.abs(elbowR[0]) < 0.30 || Math.abs(elbowR[0]) > 0.62) fail(`elbowR x ${elbowR[0]}`);
  if (elbowR[1] < 0.90 || elbowR[1] > 1.30) fail(`elbowR y ${elbowR[1]}`);
  if (wristR[1] < 0.62 || wristR[1] > 0.92) fail(`wristR y ${wristR[1]}`);
  if (head[1] < 1.70 || head[1] > 1.90) fail(`head y ${head[1]}`);

  // ---------- 4. skeleton ----------
  const armature = new THREE.Group();
  armature.name = 'Armature';
  const j_root = new THREE.Bone(); j_root.name = 'j_root';
  j_root.position.set(root[0], root[1], root[2]);
  const j_torso = new THREE.Bone(); j_torso.name = 'j_torso';
  j_torso.position.set(torso[0] - root[0], torso[1] - root[1], torso[2] - root[2]);
  const j_head = new THREE.Bone(); j_head.name = 'j_head';
  j_head.position.set(head[0] - torso[0], head[1] - torso[1], head[2] - torso[2]);
  j_root.add(j_torso); j_torso.add(j_head);

  const limb = (names: [string, string, string], chain: Array<[number, number, number]>, parent: THREE.Bone, parentPos: [number, number, number]) => {
    const [n0, n1, n2] = names;
    const b0 = new THREE.Bone(); b0.name = n0;
    b0.position.set(chain[0][0] - parentPos[0], chain[0][1] - parentPos[1], chain[0][2] - parentPos[2]);
    const b1 = new THREE.Bone(); b1.name = n1;
    b1.position.set(chain[1][0] - chain[0][0], chain[1][1] - chain[0][1], chain[1][2] - chain[0][2]);
    const b2 = new THREE.Bone(); b2.name = n2;
    b2.position.set(chain[2][0] - chain[1][0], chain[2][1] - chain[1][1], chain[2][2] - chain[1][2]);
    parent.add(b0); b0.add(b1); b1.add(b2);
    return [b0, b1, b2];
  };
  const armChainR = limb(['j_shoulderR', 'j_elbowR', 'j_wristR'], [shoulderR, elbowR, wristR], j_torso, torso);
  const armChainL = limb(['j_shoulderL', 'j_elbowL', 'j_wristL'], [shoulderL, elbowL, wristL], j_torso, torso);
  const legChainR = limb(['j_hipR', 'j_kneeR', 'j_ankleR'], [hipR, kneeR, ankleR_], j_root, root);
  const legChainL = limb(['j_hipL', 'j_kneeL', 'j_ankleL'], [hipL, kneeL, ankleL_], j_root, root);

  // ---- cape chain: the crimson panel hangs from the shoulders ----
  const capeAnchor: [number, number, number] = [0, 1.46, -0.20];
  const capeMid: [number, number, number] = [0, 0.92, -0.30];
  const j_cape1 = new THREE.Bone(); j_cape1.name = 'j_cape1';
  j_cape1.position.set(capeAnchor[0] - torso[0], capeAnchor[1] - torso[1], capeAnchor[2] - torso[2]);
  const j_cape2 = new THREE.Bone(); j_cape2.name = 'j_cape2';
  j_cape2.position.set(capeMid[0] - capeAnchor[0], capeMid[1] - capeAnchor[1], capeMid[2] - capeAnchor[2]);
  j_torso.add(j_cape1); j_cape1.add(j_cape2);

  armature.add(j_root);
  const bones = [j_root, j_torso, j_head, j_cape1, j_cape2, ...armChainR, ...armChainL, ...legChainR, ...legChainL];
  const boneIndex = new Map<string, number>();
  bones.forEach((b, i) => boneIndex.set(b.name, i));

  // ---------- 5. THE CAPE MESH (crimson, skinned to the cape chain) ----------
  // A draped panel wrapping the back: rows from the shoulder yoke (y 1.46)
  // to the hem (y 0.58), columns along an arc behind the body. The top rows
  // pin to j_cape1, the panel below swings on j_cape2.
  const CAPE_ROWS = 9;
  const CAPE_COLS = 13;
  const capePos: number[] = [];
  const capeNrm: number[] = [];
  const capeUv: number[] = [];
  const capeIdx: number[] = [];
  const capeJoints: Array<[number, number, number, number]> = [];
  const capeWeights: Array<[number, number, number, number]> = [];
  const biCape1 = boneIndex.get('j_cape1')!;
  const biCape2 = boneIndex.get('j_cape2')!;
  for (let r = 0; r < CAPE_ROWS; r++) {
    const tRow = r / (CAPE_ROWS - 1);
    const y = 1.46 + (0.58 - 1.46) * tRow;
    // radius grows toward the hem (the cape flares); z sweeps back
    const radius = 0.27 + tRow * 0.09;
    const backZ = -0.20 - tRow * 0.12 - Math.sin(tRow * Math.PI) * 0.015;
    // width arc: from -78° to +78° around Y measured from straight-back
    for (let c = 0; c < CAPE_COLS; c++) {
      const tCol = c / (CAPE_COLS - 1);
      const ang = (-78 + 156 * tCol) * Math.PI / 180;
      const x = Math.sin(ang) * radius * (1 + tRow * 0.16);
      const z = backZ - Math.cos(ang) * radius * 0.42;
      capePos.push(x, y, z);
      // normal: mostly -Z (facing back), tilted outward by the arc
      capeNrm.push(Math.sin(ang) * 0.35, 0.08, -Math.cos(ang) * 0.94);
      capeUv.push(tCol, tRow);
      // weights: rows 0-1 → cape1, rows 2+ → cape2 (blend row 2)
      const w1 = r <= 1 ? 1 : r === 2 ? 0.35 : 0;
      const w2 = 1 - w1;
      capeJoints.push([biCape1, biCape2, 0, 0]);
      capeWeights.push([w1, w2, 0, 0]);
    }
  }
  for (let r = 0; r < CAPE_ROWS - 1; r++) {
    for (let c = 0; c < CAPE_COLS - 1; c++) {
      const a = r * CAPE_COLS + c;
      const b = a + 1;
      const d = a + CAPE_COLS;
      const e = d + 1;
      capeIdx.push(a, d, b, b, d, e);
      capeIdx.push(b, d, a, e, d, b); // double-sided via reversed tris (no cull)
    }
  }
  const capeVertCount = CAPE_ROWS * CAPE_COLS;
  console.log(`cape: ${capeVertCount} verts, ${capeIdx.length / 3} tris (doubled)`);

  // ---------- 6. skin weights (body) ----------
  const chainPtsR = [shoulderR, elbowR, wristR, [wristR[0], wristR[1] - 0.11, wristR[2]] as [number, number, number]];
  const chainPtsL = [shoulderL, elbowL, wristL, [wristL[0], wristL[1] - 0.11, wristL[2]] as [number, number, number]];
  const legPtsR = [hipR, kneeR, ankleR_, [ankleR_[0], ankleR_[1], ankleR_[2] + 0.16] as [number, number, number]];
  const legPtsL = [hipL, kneeL, ankleL_, [ankleL_[0], ankleL_[1], ankleL_[2] + 0.16] as [number, number, number]];

  const chainDist = (chain: Array<[number, number, number]>, x: number, y: number, z: number): number => {
    let best = Infinity;
    for (let i = 0; i < chain.length - 1; i++) {
      const d = distSeg(x, y, z, chain[i][0], chain[i][1], chain[i][2], chain[i + 1][0], chain[i + 1][1], chain[i + 1][2]);
      if (d < best) best = d;
    }
    return best;
  };
  const jointDist = (chain: Array<[number, number, number]>, x: number, y: number, z: number): number[] =>
    chain.slice(0, 3).map((j) => Math.hypot(x - j[0], y - j[1], z - j[2]));

  const ARM_R = 0.20;   // F26: 0.115 sat in the steep sstep — the plate surfaces (0.10-0.16 off the chainline) fell to j_root (the vambrace 85%-root bug); ownership protects the interleaved zones now
  const LEG_R = 0.20;   // F26: same — the shin/sabaton plates need full coverage
  const HEAD_R = 0.145;

  // ---- Fase 26 — chain-PARAM weights: the old spread() assigned per-vertex
  // influence by INVERSE-DISTANCE-TO-JOINT-POINTS, which on this A-pose put
  // the mid upper arm 75% on the ELBOW, the whole forearm 85% on j_root and
  // the fists 73% on the KNEES (measured on the shipped rig). Skin now follows
  // the position ALONG the chain (s=0 root joint, s≈0.5 mid, s=1 end joint,
  // s>1 beyond): each joint gets a clean zone with soft boundaries. ----
  const chainGeom = (chain: Array<[number, number, number]>) => {
    const cum = [0];
    for (let i = 0; i < chain.length - 1; i++) {
      cum.push(cum[i] + Math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1], chain[i + 1][2] - chain[i][2]));
    }
    return { cum, total: cum[cum.length - 1] };
  };
  const armGeomR = chainGeom(chainPtsR); const armGeomL = chainGeom(chainPtsL);
  const legGeomR = chainGeom(legPtsR); const legGeomL = chainGeom(legPtsL);
  /** s in [0, 1.2+]: fractional position along the polyline (closest segment). */
  const chainParam = (chain: Array<[number, number, number]>, geo: { cum: number[]; total: number }, x: number, y: number, z: number): number => {
    let best = Infinity, bestS = 0;
    for (let i = 0; i < chain.length - 1; i++) {
      const abx = chain[i + 1][0] - chain[i][0], aby = chain[i + 1][1] - chain[i][1], abz = chain[i + 1][2] - chain[i][2];
      const len2 = abx * abx + aby * aby + abz * abz;
      let t = len2 > 0 ? ((x - chain[i][0]) * abx + (y - chain[i][1]) * aby + (z - chain[i][2]) * abz) / len2 : 0;
      t = clamp(t, 0, 1);
      const dx = x - (chain[i][0] + abx * t), dy = y - (chain[i][1] + aby * t), dz = z - (chain[i][2] + abz * t);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) { best = d; bestS = (geo.cum[i] + t * (geo.cum[i + 1] - geo.cum[i])) / geo.total; }
    }
    return bestS;
  };
  const bell = (s: number, c: number, w: number) => Math.exp(-((s - c) * (s - c)) / (w * w));
  const ARM_W = (s: number): [number, number, number] => {
    const ws = sstep(0.65, 0.25, s);
    const we = bell(s, 0.50, 0.22);
    const ww = sstep(0.62, 0.95, s) + bell(s, 1.0, 0.18);
    const tot = ws + we + ww;
    if (tot <= 1e-6) return [1, 0, 0];
    return [ws / tot, we / tot, ww / tot];
  };
  const LEG_W = (s: number): [number, number, number] => {
    const wh = sstep(0.60, 0.20, s);
    const wk = bell(s, 0.55, 0.26);
    const wa = sstep(0.50, 0.92, s) + bell(s, 1.0, 0.2);
    const tot = wh + wk + wa;
    if (tot <= 1e-6) return [1, 0, 0];
    return [wh / tot, wk / tot, wa / tot];
  };
  const spreadParam = (amt: number, chain: Array<[number, number, number]>, geo: { cum: number[]; total: number }, wfn: (s: number) => [number, number, number], names: string[], x: number, y: number, z: number) => {
    if (amt <= 0.001) return;
    const [w0, w1, w2] = wfn(chainParam(chain, geo, x, y, z));
    if (w0 > 0) wAcc[boneIndex.get(names[0])!] += amt * w0;
    if (w1 > 0) wAcc[boneIndex.get(names[1])!] += amt * w1;
    if (w2 > 0) wAcc[boneIndex.get(names[2])!] += amt * w2;
  };

  const skinIndex = new Uint16Array(N * 4);
  const skinWeight = new Float32Array(N * 4);
  const wAcc = new Float64Array(bones.length);

  for (let i = 0; i < N; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    wAcc.fill(0);

    // --- TASSET override: the front skirt plates + back fauld + side skirt
    //     plates hang from the belt and must NEVER follow the legs (shear);
    //     the groin culet rides the pelvis too.
    //     Fase 26 FIX: the old gate `y < 1.06` reached all the way to the
    //     ground — it pinned the SABATON TOES (z>0.115), the kneecap fronts
    //     and half the thighs to j_root. Measured on the shipped rig: TOES
    //     81% j_root (the "se estiran sus pies al caminar" tear — the toes
    //     stayed frozen in world while the ankles swung), THIGH 49% j_root.
    //     The skirt plates all live above y 0.62 — gate the override there so
    //     everything below (thighs, knees, feet) follows the leg chain. ---
    if (
      y < 1.06 && y > 0.60 && (z > 0.115 || z < -0.175
        || (Math.abs(x) > 0.225 && y > 0.72)
        || (Math.abs(x) < 0.09 && y > 0.80))
    ) {
      const bi = boneIndex.get('j_root')!;
      skinIndex[i * 4] = bi; skinWeight[i * 4] = 1;
      skinIndex[i * 4 + 1] = 0; skinWeight[i * 4 + 1] = 0;
      skinIndex[i * 4 + 2] = 0; skinWeight[i * 4 + 2] = 0;
      skinIndex[i * 4 + 3] = 0; skinWeight[i * 4 + 3] = 0;
      continue;
    }

    // --- arm influence (lateral of the torso only).
    //     Fase 26: the old y-gate sstep(0.64,0.74,y) cut the arm off below the
    //     A-pose wrist (y 0.75) — the vambrace measured 85% j_root and the
    //     gauntlets 73% KNEE-driven (the fists swung with the legs, opposite
    //     the forearms). The gate now reaches the hang (0.40-0.52), and the
    //     latGate (which exists to keep ARM influence off the chest) is only
    //     applied in the armpit band (y>1.02) — below that the only lateral
    //     geometry is the arm itself (the thigh is protected by armOwn). ---
    const dArmR = chainDist(chainPtsR, x, y, z);
    const dArmL = chainDist(chainPtsL, x, y, z);
    const dLegR = chainDist(legPtsR, x, y, z);
    const dLegL = chainDist(legPtsL, x, y, z);
    const latGateHigh = y > 1.02 ? sstep(torsoHalf * 0.92, torsoHalf * 1.18, Math.abs(x)) : 1;
    // --- leg influence (inside the leg corridor; tassets already excluded).
    //     Fase 26 armOwn: in the A-pose the fists hang BESIDE the thighs and
    //     the two chains run parallel 6-10 cm apart — a vertex between them
    //     must belong to its NEAREST chain, not both (the old sum+renormalize
    //     gave the gauntlet a 50/50 coin flip and let the WRIST landmark leak
    //     into the thigh corridor). Ownership is SYMMETRIC now: the arm
    //     influence yields wherever the leg chain is clearly closer, and the
    //     leg influence yields wherever the arm chain is clearly closer. ---
    const ownArmR = sstep(-0.04, 0.04, dLegR - dArmR);
    const ownArmL = sstep(-0.04, 0.04, dLegL - dArmL);
    let armRk = sstep(ARM_R + 0.05, ARM_R - 0.06, dArmR)
      * sstep(0.40, 0.52, y) * sstep(1.70, 1.58, y) * latGateHigh * ownArmR;
    let armLk = sstep(ARM_R + 0.05, ARM_R - 0.06, dArmL)
      * sstep(0.40, 0.52, y) * sstep(1.70, 1.58, y) * latGateHigh * ownArmL;
    let legRk = sstep(LEG_R + 0.05, LEG_R - 0.06, dLegR)
      * sstep(0.98, 0.88, y) * (1 - ownArmR);
    let legLk = sstep(LEG_R + 0.05, LEG_R - 0.06, dLegL)
      * sstep(0.98, 0.88, y) * (1 - ownArmL);
    // --- head (great helm) influence ---
    const dHead = Math.hypot(x - head[0], y - head[1] - 0.045, z - head[2]);
    let headK = sstep(HEAD_R + 0.07, HEAD_R - 0.04, dHead);

    let tot = armRk + armLk + legRk + legLk + headK;
    if (tot > 1) {
      const k = 1 / tot;
      armRk *= k; armLk *= k; legRk *= k; legLk *= k; headK *= k; tot = 1;
    }
    const rem = 1 - tot;

    // torso vs root share of the remainder (higher → torso)
    const tShare = sstep(1.00, 1.16, y);
    if (rem > 0) {
      wAcc[boneIndex.get('j_torso')!] += rem * tShare;
      wAcc[boneIndex.get('j_root')!] += rem * (1 - tShare);
    }

    const spread = (amt: number, chain: Array<[number, number, number]>, names: string[]) => {
      if (amt <= 0.001) return;
      const d = jointDist(chain, x, y, z);
      let sum = 0;
      const inv = d.map((dd) => { const w = 1 / Math.pow(Math.max(dd, 0.025), 3); sum += w; return w; });
      for (let k = 0; k < 3; k++) wAcc[boneIndex.get(names[k])!] += amt * inv[k] / sum;
    };
    spreadParam(armRk, chainPtsR, armGeomR, ARM_W, ['j_shoulderR', 'j_elbowR', 'j_wristR'], x, y, z);
    spreadParam(armLk, chainPtsL, armGeomL, ARM_W, ['j_shoulderL', 'j_elbowL', 'j_wristL'], x, y, z);
    spreadParam(legRk, legPtsR, legGeomR, LEG_W, ['j_hipR', 'j_kneeR', 'j_ankleR'], x, y, z);
    spreadParam(legLk, legPtsL, legGeomL, LEG_W, ['j_hipL', 'j_kneeL', 'j_ankleL'], x, y, z);
    if (headK > 0) wAcc[boneIndex.get('j_head')!] += headK;

    const cands: Array<{ bi: number; w: number }> = [];
    for (let b = 0; b < bones.length; b++) if (wAcc[b] > 0.0005) cands.push({ bi: b, w: wAcc[b] });
    cands.sort((a, b) => b.w - a.w);
    let sum = 0;
    for (let k = 0; k < Math.min(4, cands.length); k++) sum += cands[k].w;
    for (let k = 0; k < 4; k++) {
      if (k < cands.length && sum > 0) {
        skinIndex[i * 4 + k] = cands[k].bi;
        skinWeight[i * 4 + k] = cands[k].w / sum;
      } else {
        skinIndex[i * 4 + k] = 0;
        skinWeight[i * 4 + k] = 0;
      }
    }
  }

  // ---------- 6.5 Fase 26 — ISLAND SNAP ----------
  // The A-pose crosses the forearms THROUGH the thigh volume — the arm chain
  // passes 1.4 cm from the thigh's outer surface at bind (measured), so no
  // distance field can split the gauntlet from the cuisse there. But the
  // armour is hundreds of separate plate islands: classify each island from
  // its PRE-SNAP bone mass (data-driven, no threshold whack-a-mole) and
  // rewrite its weights — ARM islands get the param split along the arm
  // chain, LEG islands along the leg chain, skirt/culet/head/torso islands
  // go to their single bone. Each plate then rides ONE coherent chain.
  {
    const parent = new Int32Array(N);
    for (let i = 0; i < N; i++) parent[i] = i;
    const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const uni = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    for (let t = 0; t < totalIdx; t += 3) {
      uni(index[t], index[t + 1]); uni(index[t + 1], index[t + 2]); uni(index[t], index[t + 2]);
    }
    const members = new Map<number, number[]>();
    for (let i = 0; i < N; i++) {
      const r = find(i);
      let arr = members.get(r);
      if (!arr) { arr = []; members.set(r, arr); }
      arr.push(i);
    }
    // PASS 1: per-island centroid + pre-snap bone mass + class
    const islandClass = new Map<number, string>();
    const side = (cx2: number): 1 | -1 => (cx2 >= 0 ? 1 : -1);
    const limbSet = new Set<string>(['j_shoulderR','j_elbowR','j_wristR','j_shoulderL','j_elbowL','j_wristL','j_hipR','j_kneeR','j_ankleR','j_hipL','j_kneeL','j_ankleL']);
    const tally: Record<string, number> = { arm: 0, leg: 0, root: 0, torso: 0, head: 0 };
    for (const [rootId, arr] of members) {
      let cx = 0, cy = 0, cz = 0;
      for (const i of arr) { cx += position[i * 3]; cy += position[i * 3 + 1]; cz += position[i * 3 + 2]; }
      cx /= arr.length; cy /= arr.length; cz /= arr.length;
      const side = cx >= 0 ? 1 : -1;
      const mass = new Map<string, number>();
      let tot = 0, rootTorso = 0;
      for (const i of arr) {
        for (let k = 0; k < 4; k++) {
          const w = skinWeight[i * 4 + k];
          if (w <= 0) continue;
          const bn = bones[skinIndex[i * 4 + k]].name;
          mass.set(bn, (mass.get(bn) ?? 0) + w);
          tot += w;
          if (bn === 'j_root' || bn === 'j_torso') rootTorso += w;
        }
      }
      const dA2 = chainDist(side < 0 ? chainPtsR : chainPtsL, cx, cy, cz);
      const dL2 = chainDist(side < 0 ? legPtsR : legPtsL, cx, cy, cz);
      let cls: string;
      if (cy > 1.66) cls = 'head';                                        // great helm + visor
      else if (Math.abs(cx) < 0.10 && cy > 0.55 && cy < 1.05) cls = 'root'; // culet/groin (y-banded: never the knees/sabatons)
      else if (tot > 0 && rootTorso / tot > 0.60 && cy < 1.10 && dA2 > 0.15) cls = 'root'; // tasset skirt (far from the arm chain)
      else if (Math.abs(cx) < 0.16 && cy > 1.12 && cy < 1.66) cls = 'torso'; // chest/backplate/collar
      else if (Math.abs(dA2 - dL2) < 0.03) {
        // interleaved zone (fist vs cuisse): fall back to the pre-snap mass vote
        let bestBn = '', bestM = 0;
        for (const [bn, m] of mass) if (bn !== 'j_root' && m > bestM) { bestBn = bn; bestM = m; }
        if (limbSet.has(bestBn)) cls = /shoulder|elbow|wrist/.test(bestBn) ? 'arm' : 'leg';
        else if (bestBn === 'j_head') cls = 'head';
        else if (bestBn === 'j_torso') cls = 'torso';
        else cls = dA2 < dL2 ? 'arm' : 'leg';
      } else cls = dA2 < dL2 ? 'arm' : 'leg';
      islandClass.set(rootId, cls);
      tally[cls] = (tally[cls] ?? 0) + arr.length;
    }
    console.log(`island classes (verts): ${JSON.stringify(tally)}`);
    // PASS 2: rewrite the weights per class
    for (const [rootId, arr] of members) {
      const cls = islandClass.get(rootId)!;
      if (cls === 'arm' || cls === 'leg') {
        // side from the island centroid sign
        let cx = 0;
        for (const i of arr) cx += position[i * 3];
        const side: 1 | -1 = cx >= 0 ? 1 : -1;
        const armChain = side < 0 ? chainPtsR : chainPtsL;
        const legChain = side < 0 ? legPtsR : legPtsL;
        const armGeo = side < 0 ? armGeomR : armGeomL;
        const legGeo = side < 0 ? legGeomR : legGeomL;
        for (const i of arr) {
          const px = position[i * 3], py = position[i * 3 + 1], pz = position[i * 3 + 2];
          if (cls === 'arm') {
            const [wa, we, ww] = ARM_W(chainParam(armChain, armGeo, px, py, pz));
            skinIndex[i * 4] = boneIndex.get(side < 0 ? 'j_shoulderR' : 'j_shoulderL')!;
            skinIndex[i * 4 + 1] = boneIndex.get(side < 0 ? 'j_elbowR' : 'j_elbowL')!;
            skinIndex[i * 4 + 2] = boneIndex.get(side < 0 ? 'j_wristR' : 'j_wristL')!;
            skinWeight[i * 4] = wa; skinWeight[i * 4 + 1] = we; skinWeight[i * 4 + 2] = ww;
          } else {
            const [wh, wk, wa2] = LEG_W(chainParam(legChain, legGeo, px, py, pz));
            skinIndex[i * 4] = boneIndex.get(side < 0 ? 'j_hipR' : 'j_hipL')!;
            skinIndex[i * 4 + 1] = boneIndex.get(side < 0 ? 'j_kneeR' : 'j_kneeL')!;
            skinIndex[i * 4 + 2] = boneIndex.get(side < 0 ? 'j_ankleR' : 'j_ankleL')!;
            skinWeight[i * 4] = wh; skinWeight[i * 4 + 1] = wk; skinWeight[i * 4 + 2] = wa2;
          }
          skinIndex[i * 4 + 3] = 0; skinWeight[i * 4 + 3] = 0;
        }
      } else {
        const bn = cls === 'head' ? 'j_head' : cls === 'torso' ? 'j_torso' : 'j_root';
        const bi = boneIndex.get(bn)!;
        for (const i of arr) {
          skinIndex[i * 4] = bi; skinWeight[i * 4] = 1;
          skinIndex[i * 4 + 1] = 0; skinWeight[i * 4 + 1] = 0;
          skinIndex[i * 4 + 2] = 0; skinWeight[i * 4 + 2] = 0;
          skinIndex[i * 4 + 3] = 0; skinWeight[i * 4 + 3] = 0;
        }
      }
    }
  }

  // ---------- 7. compact + assemble body+cape attributes ----------
  const totalBodyAndCape = N + capeVertCount;
  const posAll = new Float32Array(totalBodyAndCape * 3);
  posAll.set(position, 0);
  posAll.set(capePos, N * 3);
  const nrmAll = new Float32Array(totalBodyAndCape * 3);
  nrmAll.set(normal, 0);
  nrmAll.set(capeNrm, N * 3);
  const uvAll = new Float32Array(totalBodyAndCape * 2);
  uvAll.set(uv, 0);
  uvAll.set(capeUv, N * 2);

  const bodyJoints = new Uint8Array(N * 4);
  bodyJoints.set(skinIndex.subarray(0, N * 4));
  const bodyWeights = new Uint8Array(N * 4);
  for (let i = 0; i < N * 4; i++) bodyWeights[i] = Math.round(clamp(skinWeight[i], 0, 1) * 255);
  const capeJ = new Uint8Array(capeVertCount * 4);
  const capeW = new Uint8Array(capeVertCount * 4);
  for (let i = 0; i < capeVertCount; i++) {
    for (let k = 0; k < 4; k++) {
      capeJ[i * 4 + k] = capeJoints[i][k];
      capeW[i * 4 + k] = Math.round(clamp(capeWeights[i][k], 0, 1) * 255);
    }
  }
  const jointsAll = new Uint8Array(totalBodyAndCape * 4);
  jointsAll.set(bodyJoints, 0); jointsAll.set(capeJ, N * 4);
  const weightsAll = new Uint8Array(totalBodyAndCape * 4);
  weightsAll.set(bodyWeights, 0); weightsAll.set(capeW, N * 4);

  // body indices use local verts; cape indices offset by N
  const indexAll = new Uint32Array(totalIdx + capeIdx.length);
  indexAll.set(index, 0);
  for (let i = 0; i < capeIdx.length; i++) indexAll[totalIdx + i] = capeIdx[i] + N;

  // bone world transforms → node translations + IBMs
  const boneWorld: Array<[number, number, number]> = [];
  const boneParent: number[] = [];
  {
    const wp = new THREE.Vector3();
    for (const b of bones) { b.getWorldPosition(wp); boneWorld.push([wp.x, wp.y, wp.z]); }
    for (const b of bones) {
      const p = b.parent as THREE.Bone;
      boneParent.push(p && (p as any).isBone ? bones.indexOf(p) : -1);
    }
  }
  const ibm = new Float32Array(bones.length * 16);
  for (let i = 0; i < bones.length; i++) {
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -boneWorld[i][0], -boneWorld[i][1], -boneWorld[i][2], 1], i * 16);
  }

  const nrmI8 = new Int8Array(totalBodyAndCape * 3);
  for (let i = 0; i < totalBodyAndCape * 3; i++) nrmI8[i] = Math.max(-127, Math.min(127, Math.round(nrmAll[i] * 127)));
  const uvU16 = new Uint16Array(totalBodyAndCape * 2);
  for (let i = 0; i < totalBodyAndCape * 2; i++) uvU16[i] = Math.round(clamp(uvAll[i], 0, 1) * 65535);

  const finalGlb = buildSkinnedGlb2({
    position: posAll, nrmI8, uvU16, joints: jointsAll, weights: weightsAll,
    bodyVertCount: N, bodyIndexCount: totalIdx,
    index: indexAll,
    bones: bones.map((b, i) => ({
      name: b.name,
      parent: boneParent[i],
      translation: [
        boneWorld[i][0] - (boneParent[i] >= 0 ? boneWorld[boneParent[i]][0] : 0),
        boneWorld[i][1] - (boneParent[i] >= 0 ? boneWorld[boneParent[i]][1] : 0),
        boneWorld[i][2] - (boneParent[i] >= 0 ? boneWorld[boneParent[i]][2] : 0),
      ] as [number, number, number],
    })),
    ibm,
    srcFile: buf,
  });
  writeFileSync(OUT_GLB, Buffer.from(finalGlb));
  console.log(`wrote ${OUT_GLB} (${(finalGlb.byteLength / 1024 / 1024).toFixed(2)} MB)`);

  const manifest = {
    model: path.basename(OUT_GLB),
    height: TARGET_H,
    bones: bones.map((b) => b.name),
    boneGame: Object.fromEntries(
      bones.map((b) => {
        const wp = new THREE.Vector3();
        b.getWorldPosition(wp);
        return [b.name, [+wp.x.toFixed(4), +wp.y.toFixed(4), +wp.z.toFixed(4)]];
      }),
    ),
  };
  writeFileSync(OUT_JSON, JSON.stringify(manifest, null, 1));
  console.log(`wrote ${OUT_JSON}`);

  // ---------- 8. verification splats ----------
  mkdirSync(SPLAT_DIR, { recursive: true });
  const B = (name: string) => bones[boneIndex.get(name)!];
  const poses: Array<{ name: string; apply: () => void }> = [
    { name: 'bind', apply: () => {} },
    { name: 'regions', apply: () => {} },
    {
      name: 'runFrame', apply: () => {
        B('j_hipR').rotation.x = -0.9; B('j_kneeR').rotation.x = 1.3; B('j_hipL').rotation.x = 0.35; B('j_kneeL').rotation.x = 0.25;
        B('j_shoulderR').rotation.x = -0.7; B('j_elbowR').rotation.x = -1.1;
        B('j_shoulderL').rotation.x = 0.6; B('j_elbowL').rotation.x = -0.6;
        B('j_torso').rotation.x = 0.18; B('j_torso').rotation.y = 0.12; B('j_head').rotation.x = -0.1;
        B('j_cape1').rotation.x = 0.35; B('j_cape2').rotation.x = 0.3;
      },
    },
    {
      name: 'attackFrame', apply: () => {
        B('j_shoulderR').rotation.x = -2.2; B('j_shoulderR').rotation.z = -0.85; B('j_elbowR').rotation.x = -0.4;
        B('j_shoulderL').rotation.x = -0.35; B('j_elbowL').rotation.x = -0.9; B('j_shoulderL').rotation.z = 0.25;
        B('j_torso').rotation.y = -0.42; B('j_torso').rotation.x = 0.3; B('j_head').rotation.y = 0.15;
        B('j_hipR').rotation.x = -0.25; B('j_kneeR').rotation.x = 0.35; B('j_kneeL').rotation.x = 0.4;
        B('j_cape1').rotation.x = -0.25; B('j_cape2').rotation.x = -0.4;
      },
    },
    {
      name: 'headTurn', apply: () => {
        B('j_head').rotation.y = 0.7; B('j_head').rotation.x = 0.2;
        B('j_elbowL').rotation.x = -1.4;
      },
    },
    {
      // Fase 26 — the user's exact complaint: a mid-stride swing. The FEET
      // must pitch with the ankles and stay rigid (no toe tear), the fists
      // must ride the WRIST bones, the thighs must follow the HIPS.
      name: 'walkSwing', apply: () => {
        B('j_hipR').rotation.x = -0.72; B('j_kneeR').rotation.x = 1.15; B('j_ankleR').rotation.x = -0.22;
        B('j_hipL').rotation.x = 0.28; B('j_kneeL').rotation.x = 0.3; B('j_ankleL').rotation.x = 0.12;
        B('j_shoulderR').rotation.x = 0.42; B('j_elbowR').rotation.x = -0.35;
        B('j_shoulderL').rotation.x = -0.38; B('j_elbowL').rotation.x = -0.3;
        B('j_torso').rotation.y = -0.14; B('j_torso').rotation.x = 0.1;
        B('j_cape1').rotation.x = 0.3; B('j_cape2').rotation.x = 0.22;
      },
    },
  ];
  const sharpMod = (require as any)('/home/z/my-project/node_modules/sharp');
  for (const pose of poses) {
    for (const b of bones) b.rotation.set(0, 0, 0);
    pose.apply();
    armature.updateMatrixWorld(true);
    const W = 700, H = 900;
    const img = Buffer.alloc(W * H * 4, 0);
    for (let i = 0; i < W * H; i++) { img[i * 4] = 24; img[i * 4 + 1] = 24; img[i * 4 + 2] = 28; img[i * 4 + 3] = 255; }
    const m4 = new THREE.Matrix4();
    const v2 = new THREE.Vector3();
    const sk = new THREE.Vector3();
    for (let i = 0; i < totalBodyAndCape; i++) {
      v2.set(posAll[i * 3], posAll[i * 3 + 1], posAll[i * 3 + 2]);
      const bi = [jointsAll[i * 4], jointsAll[i * 4 + 1], jointsAll[i * 4 + 2], jointsAll[i * 4 + 3]];
      const bw = [weightsAll[i * 4] / 255, weightsAll[i * 4 + 1] / 255, weightsAll[i * 4 + 2] / 255, weightsAll[i * 4 + 3] / 255];
      let sx = 0, sy = 0, sz = 0;
      for (let k = 0; k < 4; k++) {
        if (bw[k] <= 0) continue;
        const bone = bones[bi[k]];
        m4.multiplyMatrices(bone.matrixWorld, new THREE.Matrix4().set(
          1, 0, 0, -boneWorld[bi[k]][0],
          0, 1, 0, -boneWorld[bi[k]][1],
          0, 0, 1, -boneWorld[bi[k]][2],
          0, 0, 0, 1,
        ));
        sk.copy(v2).applyMatrix4(m4);
        sx += sk.x * bw[k]; sy += sk.y * bw[k]; sz += sk.z * bw[k];
      }
      const px = Math.round(W / 2 + sx * (H * 0.42));
      const py = Math.round(H / 2 - (sy - TARGET_H / 2) * (H * 0.42));
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      const o = (py * W + px) * 4;
      if (pose.name === 'regions') {
        const BONE_COL: Record<string, [number, number, number]> = {
          j_shoulderR: [220, 40, 40], j_elbowR: [180, 20, 20], j_wristR: [140, 10, 10],
          j_shoulderL: [40, 220, 60], j_elbowL: [20, 180, 30], j_wristL: [10, 140, 20],
          j_hipR: [60, 90, 240], j_kneeR: [40, 60, 200], j_ankleR: [20, 40, 160],
          j_hipL: [240, 230, 60], j_kneeL: [210, 190, 30], j_ankleL: [180, 160, 20],
          j_head: [240, 80, 240], j_torso: [255, 150, 40], j_root: [150, 150, 160],
          j_cape1: [200, 120, 255], j_cape2: [160, 80, 220],
        };
        let bestB = 0, bestW = -1;
        for (let k = 0; k < 4; k++) if (bw[k] > bestW) { bestW = bw[k]; bestB = bi[k]; }
        const c = BONE_COL[bones[bestB].name] ?? [255, 255, 255];
        img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
      } else {
        const isCape = i >= N;
        if (isCape) {
          img[o] = 110; img[o + 1] = 22; img[o + 2] = 30;
        } else {
          const li = 0.55 + nrmAll[i * 3 + 2] * 0.35;
          img[o] = Math.min(255, 210 * li); img[o + 1] = Math.min(255, 210 * li); img[o + 2] = Math.min(255, 225 * li);
        }
      }
    }
    await sharpMod(img, { raw: { width: W, height: H, channels: 4 } })
      .png().toFile(path.join(SPLAT_DIR, `${pose.name}.png`));
    console.log(`pose ${pose.name}: ${path.join(SPLAT_DIR, pose.name)}.png`);
  }
  console.log('DONE');
}

/**
 * Manual glTF 2.0 GLB writer: skinned body mesh (JPEG material) + cape mesh
 * (plain crimson material, unlit-ish) sharing one skeleton.
 */
function buildSkinnedGlb2(o: {
  position: Float32Array; nrmI8: Int8Array; uvU16: Uint16Array;
  joints: Uint8Array; weights: Uint8Array;
  bodyVertCount: number; bodyIndexCount: number;
  index: Uint32Array;
  bones: Array<{ name: string; parent: number; translation: [number, number, number] }>;
  ibm: Float32Array;
  srcFile: Buffer;
}): ArrayBuffer {
  const src = o.srcFile;
  const srcJsonLen = src.readUInt32LE(12);
  const srcJson = JSON.parse(src.slice(20, 20 + srcJsonLen).toString('utf8'));
  let soff = (20 + srcJsonLen + 3) & ~3;
  const srcBinLen = src.readUInt32LE(soff);
  const srcBin = src.subarray(soff + 8, soff + 8 + srcBinLen);
  const img0 = srcJson.images[0];
  const imgBV = srcJson.bufferViews[img0.bufferView];
  const imgBytes = Buffer.from(srcBin.subarray(imgBV.byteOffset, imgBV.byteOffset + imgBV.byteLength));

  const chunks: Array<{ bytes: Buffer; target?: number }> = [];
  const pad4 = (b: Buffer, fill = 0) => (b.length % 4 === 0
    ? b
    : Buffer.concat([b, fill === 0x20
      ? Buffer.alloc(4 - (b.length % 4), 0x20)
      : Buffer.alloc(4 - (b.length % 4))]));
  const push = (bytes: Buffer, target?: number) => {
    const aligned = pad4(bytes);
    const offset = chunks.reduce((a, c) => a + c.bytes.length, 0);
    chunks.push({ bytes: aligned, target });
    return { byteOffset: offset, byteLength: bytes.length };
  };

  const N = o.position.length / 3;
  const posBV = push(Buffer.from(o.position.buffer, o.position.byteOffset, o.position.byteLength), 34962);
  const nrmBV = push(Buffer.from(o.nrmI8.buffer, o.nrmI8.byteOffset, o.nrmI8.byteLength), 34962);
  const uvBV = push(Buffer.from(o.uvU16.buffer, o.uvU16.byteOffset, o.uvU16.byteLength), 34962);
  const jBV = push(Buffer.from(o.joints.buffer, o.joints.byteOffset, o.joints.byteLength), 34962);
  const wBV = push(Buffer.from(o.weights.buffer, o.weights.byteOffset, o.weights.byteLength), 34962);
  const idxBV = push(Buffer.from(o.index.buffer, o.index.byteOffset, o.index.byteLength), 34963);
  const ibmBV = push(Buffer.from(o.ibm.buffer, o.ibm.byteOffset, o.ibm.byteLength));
  const imgBVout = push(imgBytes);

  let pmin = [Infinity, Infinity, Infinity], pmax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) {
      const v = o.position[i * 3 + k];
      if (v < pmin[k]) pmin[k] = v;
      if (v > pmax[k]) pmax[k] = v;
    }
  }
  let imin = Infinity, imax = -Infinity;
  for (let i = 0; i < o.index.length; i++) {
    const v = o.index[i];
    if (v < imin) imin = v;
    if (v > imax) imax = v;
  }

  const accessors = [
    { bufferView: 0, componentType: 5126, count: N, type: 'VEC3', min: pmin, max: pmax },                     // 0 POSITION
    { bufferView: 1, componentType: 5120, count: N, type: 'VEC3', normalized: true },                        // 1 NORMAL
    { bufferView: 2, componentType: 5123, count: N, type: 'VEC2', normalized: true },                        // 2 TEXCOORD_0
    { bufferView: 3, componentType: 5121, count: N, type: 'VEC4' },                                          // 3 JOINTS_0
    { bufferView: 4, componentType: 5121, count: N, type: 'VEC4', normalized: true },                        // 4 WEIGHTS_0
    { bufferView: 5, componentType: 5125, count: o.bodyIndexCount, type: 'SCALAR', min: [0], max: [o.bodyVertCount - 1] }, // 5 body indices
    { bufferView: 6, componentType: 5126, count: o.bones.length, type: 'MAT4' },                             // 6 IBM
    { bufferView: 5, componentType: 5125, count: o.index.length - o.bodyIndexCount, type: 'SCALAR', min: [o.bodyVertCount], max: [N - 1] }, // 7 cape indices (same bufferView, offset)
  ];
  // give accessor 7 its own byteOffset inside the shared index bufferView
  accessors[7].byteOffset = o.bodyIndexCount * 4;
  const bufferViews = [
    { buffer: 0, ...posBV, target: 34962 }, { buffer: 0, ...nrmBV, target: 34962 },
    { buffer: 0, ...uvBV, target: 34962 }, { buffer: 0, ...jBV, target: 34962 },
    { buffer: 0, ...wBV, target: 34962 },
    { buffer: 0, ...idxBV, target: 34963 },
    { buffer: 0, ...ibmBV }, { buffer: 0, ...imgBVout },
  ];

  const boneNodes = o.bones.map((b, i) => {
    const node: any = { name: b.name, translation: [r4(b.translation[0]), r4(b.translation[1]), r4(b.translation[2])] };
    const children = o.bones.map((x, j) => j).filter((j) => o.bones[j].parent === i);
    if (children.length) node.children = children;
    return node;
  });
  const bodyNodeIdx = o.bones.length;
  const capeNodeIdx = bodyNodeIdx + 1;
  const nodes = [
    ...boneNodes,
    { name: 'knight_body', mesh: 0, skin: 0 },
    { name: 'knight_cape', mesh: 1, skin: 0 },
  ];

  const json: any = {
    asset: { version: '2.0', generator: 'KFS rig_armour (auto-skinned A-pose)' },
    scene: 0,
    scenes: [{ nodes: [0, bodyNodeIdx, capeNodeIdx] }],
    nodes,
    meshes: [
      {
        name: 'knight_body',
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
          indices: 5,
          material: 0,
        }],
      },
      {
        name: 'knight_cape',
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
          indices: 7,
          material: 1,
        }],
      },
    ],
    skins: [{
      joints: o.bones.map((_, i) => i),
      inverseBindMatrices: 6,
    }],
    materials: [
      {
        name: 'armour_skin',
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.3,
          roughnessFactor: 0.66,
        },
      },
      {
        name: 'cape_crimson',
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [0.42, 0.075, 0.09, 1.0],
          metallicFactor: 0.02,
          roughnessFactor: 0.95,
        },
      },
    ],
    textures: [{ source: 0, sampler: 0 }],
    images: [{ mimeType: 'image/jpeg', bufferView: 7 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: chunks.reduce((a, c) => a + c.bytes.length, 0) }],
  };

  const jsonStr = JSON.stringify(json);
  const jsonChunk = pad4(Buffer.from(jsonStr), 0x20);
  const binChunk = Buffer.concat(chunks.map((c) => c.bytes));
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.write('JSON', 16, 'ascii');
  jsonChunk.copy(out, 20);
  let p = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, p);
  out.write('BIN\u0000', p + 4, 'binary');
  out[p + 4] = 0x42; out[p + 5] = 0x49; out[p + 6] = 0x4e; out[p + 7] = 0x00;
  binChunk.copy(out, p + 8);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length) as ArrayBuffer;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

main().catch((e) => { console.error(e); process.exit(1); });
