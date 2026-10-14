// rig_knight.ts — auto-rig the static medieval_knight.glb into the game's
// 15-bone skeleton (j_root…j_ankleL), smooth-skinned, feet at y=0, H=1.95,
// facing +Z (RIGHT = -X), and export medieval_knight_rigged.glb.
//
// Pipeline:
//   1. parse source GLB, merge the 4 meshes into one indexed geometry
//   2. normalize (feet→0, scale 1.95, keep +Z facing)
//   3. detect anatomical landmarks by clustering (feet/legs/arms/head)
//   4. build THREE.Bone hierarchy, compute region-masked smooth weights
//   5. export via GLTFExporter (no texture) → transplant the source JPEG
//   6. verification: splat renders of the RIGGED model in posed stances
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const SRC = process.argv[2] ?? 'public/game/models/medieval_knight.glb';
const OUT_GLB = process.argv[3] ?? 'public/game/models/medieval_knight_rigged.glb';
const OUT_JSON = OUT_GLB.replace(/\.glb$/, '.json');
const SPLAT_DIR = '/tmp/kfs_rigcheck';
const TARGET_H = 1.95;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** point → segment distance */
function distSeg(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const dx = px - (ax + abx * t), dy = py - (ay + aby * t), dz = pz - (az + abz * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

interface MergedGeo {
  position: Float32Array;   // normalized space
  normal: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
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
  const N = totalVerts;

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
  console.log(`merged ${N} verts, ${totalIdx / 3} tris; scale=${s.toFixed(4)} (H ${(maxY - minY).toFixed(3)} → ${TARGET_H})`);

  // ---------- 3. landmark detection ----------
  // helpers over the merged cloud
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

  // --- feet (soles): lowest 6% and forward of the back cape plane ---
  const feetIdx = cloud.filter((x, y, z) => y < 0.12 && z > -0.02 && Math.abs(x) < 0.22 * s);
  const footL = feetIdx.filter((i) => position[i * 3] > 0);
  const footR = feetIdx.filter((i) => position[i * 3] < 0);
  const ankleL = cloud.centroid(footL); const ankleR = cloud.centroid(footR);
  const toeL = cloud.extent(footL, 2)[1]; const toeR = cloud.extent(footR, 2)[1];

  // --- legs: below hip crease, exclude cape (z < -0.12) and front tabard (z > 0.12) ---
  const legSlice = (y0: number, y1: number) =>
    cloud.filter((x, y, z) => y >= y0 && y < y1 && z > -0.12 && z < 0.12 && Math.abs(x) > 0.045);
  const kneeYL = cloud.centroid(legSlice(0.48, 0.55));
  const kneeYR = cloud.centroid(legSlice(0.48, 0.55).filter((i) => position[i * 3] < 0));
  const kneeYL2 = cloud.centroid(legSlice(0.48, 0.55).filter((i) => position[i * 3] > 0));
  const hipSliceL = cloud.centroid(legSlice(0.90, 0.98).filter((i) => position[i * 3] > 0));
  const hipSliceR = cloud.centroid(legSlice(0.90, 0.98).filter((i) => position[i * 3] < 0));

  // --- torso half width (to gate arms) ---
  const torsoIdx = cloud.filter((x, y) => y > 0.95 && y < 1.45 && Math.abs(x) < 0.20 * s);
  const [torsoMinX, torsoMaxX] = cloud.extent(torsoIdx, 0);
  const torsoHalf = Math.max(Math.abs(torsoMinX), Math.abs(torsoMaxX));

  // --- arms: lateral of the torso, upper body, NOT the cape behind (z<-0.08) ---
  const armIdx = cloud.filter((x, y, z) => y > 0.80 && y < 1.58 && Math.abs(x) > torsoHalf * 0.92 && Math.abs(x) < 0.60 * s && z > -0.08);
  const armL = armIdx.filter((i) => position[i * 3] > 0);
  const armR = armIdx.filter((i) => position[i * 3] < 0);
  // per-height arm centroids: shoulder (top 10%), elbow (mid), wrist (low 15%)
  const armBand = (idxs: number[], y0: number, y1: number) =>
    cloud.centroid(idxs.filter((i) => position[i * 3 + 1] >= y0 && position[i * 3 + 1] < y1));
  const [armLoY, armHiY] = cloud.extent(armIdx, 1);
  const shL = armBand(armL, armHiY - 0.10, armHiY + 0.01);
  const shR = armBand(armR, armHiY - 0.10, armHiY + 0.01);
  const elL = armBand(armL, armLoY + (armHiY - armLoY) * 0.42, armLoY + (armHiY - armLoY) * 0.58);
  const elR = armBand(armR, armLoY + (armHiY - armLoY) * 0.42, armLoY + (armHiY - armLoY) * 0.58);
  const wrL = armBand(armL, armLoY - 0.01, armLoY + (armHiY - armLoY) * 0.16);
  const wrR = armBand(armR, armLoY - 0.01, armLoY + (armHiY - armLoY) * 0.16);

  // --- head: top 12% ---
  const headIdx = cloud.filter((x, y, z) => y > TARGET_H * 0.885 && Math.abs(x) < 0.16 * s && z > -0.14 * s);
  const headC = cloud.centroid(headIdx);
  // neck base: narrow band below head
  const neckIdx = cloud.filter((x, y) => y > TARGET_H * 0.845 && y < TARGET_H * 0.875 && Math.abs(x) < 0.12 * s);
  const neckC = cloud.centroid(neckIdx);

  // --- chest center + pelvis center (spine band: no cape behind, no tabard front) ---
  const chestIdx = cloud.filter((x, y, z) => y > 1.15 && y < 1.38 && Math.abs(x) < torsoHalf * 0.62 && z > -0.12 && z < 0.14);
  const chestC = cloud.centroid(chestIdx);
  const pelvisIdx = cloud.filter((x, y, z) => y > 0.92 && y < 1.02 && Math.abs(x) < 0.16 * s && z > -0.12 && z < 0.10);
  const pelvisC = cloud.centroid(pelvisIdx);

  const LM_hipR0 = hipSliceR as [number, number, number];
  const LM_hipL0 = hipSliceL as [number, number, number];
  const LM_shR0 = [Math.min(shR[0], -torsoHalf * 0.72), armHiY - 0.06, shR[2]] as [number, number, number];
  const LM_shL0 = [Math.max(shL[0], torsoHalf * 0.72), armHiY - 0.06, shL[2]] as [number, number, number];

  // Cloak-proof spine: the raw chest/pelvis centroids are dragged backward by
  // the cloak panels that wrap the shoulders. The true spine line runs through
  // the hip joints and the neck: derive root/torso from those instead.
  const spineX = (LM_hipR0[0] + LM_hipL0[0]) / 2;
  const spineZ = (LM_hipR0[2] + LM_hipL0[2]) / 2;
  const neckZ = neckC[2];
  const rootOut: [number, number, number] = [spineX, Math.max(0.93, (LM_hipR0[1] + LM_hipL0[1]) / 2), spineZ * 0.85];
  const torsoOut: [number, number, number] = [
    (LM_shR0[0] + LM_shL0[0]) / 2,
    (1.52 + rootOut[1] + 0.06) / 2 + 0.05,
    (neckZ + spineZ) / 2 + 0.01,
  ];
  const LM = {
    root: rootOut,
    torso: torsoOut,
    head: [headC[0], Math.max(headC[1], TARGET_H * 0.885 + 0.02), headC[2]] as [number, number, number],
    neck: neckC,
    shoulderR: LM_shR0,
    shoulderL: LM_shL0,
    elbowR: elR, elbowL: elL,
    wristR: wrR, wristL: wrL,
    hipR: [hipSliceR[0] * 0.7, 0.965, hipSliceR[2]] as [number, number, number],
    hipL: [hipSliceL[0] * 0.7, 0.965, hipSliceL[2]] as [number, number, number],
    kneeR: kneeYR, kneeL: kneeYL2,
    ankleR: [ankleR[0], Math.max(0.05, ankleR[1]), ankleR[2]] as [number, number, number],
    ankleL: [ankleL[0], Math.max(0.05, ankleL[1]), ankleL[2]] as [number, number, number],
    toeR, toeL, torsoHalf,
  };
  console.log('--- LANDMARKS (feet-at-0, H=' + TARGET_H + ') ---');
  for (const [k, v] of Object.entries(LM)) {
    if (Array.isArray(v)) console.log(`${k}: [${v.map((n) => (typeof n === 'number' ? n.toFixed(3) : n)).join(', ')}]`);
  }

  // ---------- 4. skeleton ----------
  const mkBone = (name: string, pos: [number, number, number], parent: THREE.Bone | THREE.Group): THREE.Bone => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(pos[0] - (parent instanceof THREE.Bone ? parent.position.x : 0), 0, 0); // placeholder, fixed below via world calc
    return b;
  };
  // Build with explicit local positions (parent-relative):
  const armature = new THREE.Group();
  armature.name = 'Armature';
  const j_root = new THREE.Bone(); j_root.name = 'j_root';
  j_root.position.set(LM.root[0], LM.root[1], LM.root[2]);
  const j_torso = new THREE.Bone(); j_torso.name = 'j_torso';
  j_torso.position.set(LM.torso[0] - LM.root[0], LM.torso[1] - LM.root[1], LM.torso[2] - LM.root[2]);
  const j_head = new THREE.Bone(); j_head.name = 'j_head';
  j_head.position.set(LM.head[0] - LM.torso[0], LM.head[1] - LM.torso[1], LM.head[2] - LM.torso[2]);
  j_root.add(j_torso); j_torso.add(j_head);

  const limb = (side: 'R' | 'L', names: [string, string, string], chain: Array<[number, number, number]>, parent: THREE.Bone) => {
    const [n0, n1, n2] = names;
    const b0 = new THREE.Bone(); b0.name = n0;
    b0.position.set(chain[0][0] - (parent === j_root ? LM.root[0] : LM.torso[0]), chain[0][1] - (parent === j_root ? LM.root[1] : LM.torso[1]), chain[0][2] - (parent === j_root ? LM.root[2] : LM.torso[2]));
    const b1 = new THREE.Bone(); b1.name = n1;
    b1.position.set(chain[1][0] - chain[0][0], chain[1][1] - chain[0][1], chain[1][2] - chain[0][2]);
    const b2 = new THREE.Bone(); b2.name = n2;
    b2.position.set(chain[2][0] - chain[1][0], chain[2][1] - chain[1][1], chain[2][2] - chain[1][2]);
    parent.add(b0); b0.add(b1); b1.add(b2);
    return [b0, b1, b2];
  };
  const armChainR = limb('R', ['j_shoulderR', 'j_elbowR', 'j_wristR'], [LM.shoulderR, LM.elbowR, LM.wristR], j_torso);
  const armChainL = limb('L', ['j_shoulderL', 'j_elbowL', 'j_wristL'], [LM.shoulderL, LM.elbowL, LM.wristL], j_torso);
  const legChainR = limb('R', ['j_hipR', 'j_kneeR', 'j_ankleR'], [LM.hipR, LM.kneeR, LM.ankleR], j_root);
  const legChainL = limb('L', ['j_hipL', 'j_kneeL', 'j_ankleL'], [LM.hipL, LM.kneeL, LM.ankleL], j_root);
  armature.add(j_root);

  const bones = [j_root, j_torso, j_head, ...armChainR, ...armChainL, ...legChainR, ...legChainL];
  const boneIndex = new Map<string, number>();
  bones.forEach((b, i) => boneIndex.set(b.name, i));

  // ---------- 5. skin weights ----------
  // chain endpoints (world/normalized space) for distance tests
  const chainPtsR = [LM.shoulderR, LM.elbowR, LM.wristR, [LM.wristR[0], LM.wristR[1] - 0.10, LM.wristR[2]] as [number, number, number]];
  const chainPtsL = [LM.shoulderL, LM.elbowL, LM.wristL, [LM.wristL[0], LM.wristL[1] - 0.10, LM.wristL[2]] as [number, number, number]];
  const legPtsR = [LM.hipR, LM.kneeR, LM.ankleR, [LM.ankleR[0], LM.ankleR[1], LM.ankleR[2] + 0.13] as [number, number, number]];
  const legPtsL = [LM.hipL, LM.kneeL, LM.ankleL, [LM.ankleL[0], LM.ankleL[1], LM.ankleL[2] + 0.13] as [number, number, number]];
  const spineChain = [LM.root, LM.torso, [LM.neck[0], LM.neck[1] + 0.02, LM.neck[2]] as [number, number, number]];

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

  // Capture radii tuned to the ACTUAL limb armor sizes (big radii grabbed the
  // chest plate and the tabard and tore them apart when the limb rotated):
  // pauldron-armed upper limb ~0.105, thigh in cuisse ~0.125, helm ~0.14.
  const ARM_R = 0.105 * (TARGET_H / 1.95);
  const LEG_R = 0.125 * (TARGET_H / 1.95);
  const HEAD_R = 0.135 * (TARGET_H / 1.95);

  const skinIndex = new Uint16Array(N * 4);
  const skinWeight = new Float32Array(N * 4);
  const wAcc = new Float64Array(bones.length);

  for (let i = 0; i < N; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    wAcc.fill(0);

    // --- TABARD override: the front fabric flap hangs from the belt and must
    //     NEVER follow the legs (it sheared/collapsed the hip in testing) ---
    if (y < 1.04 && z > 0.14) {
      wAcc[boneIndex.get('j_root')!] = 1;
      const cands0 = [{ bi: boneIndex.get('j_root')!, w: 1 }];
      skinIndex[i * 4] = cands0[0].bi; skinWeight[i * 4] = 1;
      skinIndex[i * 4 + 1] = 0; skinWeight[i * 4 + 1] = 0;
      skinIndex[i * 4 + 2] = 0; skinWeight[i * 4 + 2] = 0;
      skinIndex[i * 4 + 3] = 0; skinWeight[i * 4 + 3] = 0;
      continue;
    }

    // --- arm influence (firm: lateral of the torso only — the chest plate
    //     must NEVER carry arm weight or the shoulder explodes when raised) ---
    const latGate = sstep(LM.torsoHalf * 0.80, LM.torsoHalf * 1.04, Math.abs(x));
    let armRk = sstep(ARM_R + 0.04, ARM_R - 0.05, chainDist(chainPtsR, x, y, z))
      * sstep(0.72, 0.80, y) * sstep(1.66, 1.56, y) * latGate;
    let armLk = sstep(ARM_R + 0.04, ARM_R - 0.05, chainDist(chainPtsL, x, y, z))
      * sstep(0.72, 0.80, y) * sstep(1.66, 1.56, y) * latGate;
    // --- leg influence (firm: never the front tabard z-band) ---
    const frontGate = sstep(0.145, 0.10, z);
    let legRk = sstep(LEG_R + 0.04, LEG_R - 0.05, chainDist(legPtsR, x, y, z))
      * sstep(0.92, 0.84, y) * frontGate;
    let legLk = sstep(LEG_R + 0.04, LEG_R - 0.05, chainDist(legPtsL, x, y, z))
      * sstep(0.92, 0.84, y) * frontGate;
    // --- head influence ---
    const dHead = Math.hypot(x - LM.head[0], y - LM.head[1] - 0.03, z - LM.head[2]);
    let headK = sstep(HEAD_R + 0.06, HEAD_R - 0.03, dHead);

    // normalize influences to ≤ 1 total
    let tot = armRk + armLk + legRk + legLk + headK;
    if (tot > 1) {
      const k = 1 / tot;
      armRk *= k; armLk *= k; legRk *= k; legLk *= k; headK *= k; tot = 1;
    }
    const rem = 1 - tot;

    // torso vs root share of the remainder (cape fades to root low)
    const capeK = sstep(-0.04, -0.14, z) * sstep(1.50, 1.15, y) * sstep(0.98, 0.86, y);
    const tShare = capeK > 0.02
      ? clamp(capeK * sstep(0.80, 1.30, y), 0, 1)
      : sstep(0.98, 1.12, y);
    if (rem > 0) {
      wAcc[boneIndex.get('j_torso')!] += rem * tShare;
      wAcc[boneIndex.get('j_root')!] += rem * (1 - tShare);
    }

    // distribute arm influence over shoulder/elbow/wrist by joint proximity
    const spread = (amt: number, chain: Array<[number, number, number]>, names: string[]) => {
      if (amt <= 0.001) return;
      const d = jointDist(chain, x, y, z);
      let sum = 0;
      const inv = d.map((dd) => { const w = 1 / Math.pow(Math.max(dd, 0.025), 3); sum += w; return w; });
      for (let k = 0; k < 3; k++) wAcc[boneIndex.get(names[k])!] += amt * inv[k] / sum;
    };
    spread(armRk, chainPtsR, ['j_shoulderR', 'j_elbowR', 'j_wristR']);
    spread(armLk, chainPtsL, ['j_shoulderL', 'j_elbowL', 'j_wristL']);
    spread(legRk, legPtsR, ['j_hipR', 'j_kneeR', 'j_ankleR']);
    spread(legLk, legPtsL, ['j_hipL', 'j_kneeL', 'j_ankleL']);
    if (headK > 0) wAcc[boneIndex.get('j_head')!] += headK;

    // keep top-4
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

  // ---------- 6. manual GLB export (skin + bones + transplanted JPEG) ----------
  // bone world transforms (identity rotations) -> node translations + IBMs
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
  // inverse bind matrices (column-major MAT4; identity rotations -> pure -T)
  const ibm = new Float32Array(bones.length * 16);
  for (let i = 0; i < bones.length; i++) {
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -boneWorld[i][0], -boneWorld[i][1], -boneWorld[i][2], 1], i * 16);
  }

  // ---- compact attribute formats (15 MB -> ~10 MB) ----
  const nrmI8 = new Int8Array(N * 3);
  for (let i = 0; i < N * 3; i++) nrmI8[i] = Math.max(-127, Math.min(127, Math.round(normal[i] * 127)));
  const uvU16 = new Uint16Array(N * 2);
  for (let i = 0; i < N * 2; i++) uvU16[i] = Math.round(clamp(uv[i], 0, 1) * 65535);
  const jointsU8 = new Uint8Array(N * 4);
  jointsU8.set(skinIndex.subarray(0, N * 4));
  const weightsU8 = new Uint8Array(N * 4);
  for (let i = 0; i < N * 4; i++) weightsU8[i] = Math.round(clamp(skinWeight[i], 0, 1) * 255);

  const finalGlb = buildSkinnedGlb({
    position, normal: new Float32Array(0), uv: new Float32Array(0), index,
    nrmI8, uvU16, jointsU8, weightsU8, skinWeight, skinIndex,
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

  // manifest json (boneGame positions, like knight_rigged.json)
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

  // ---------- 8. verification splats: posed stances ----------
  mkdirSync(SPLAT_DIR, { recursive: true });
  const B = (name: string) => bones[boneIndex.get(name)!];
  const poses: Array<{ name: string; apply: () => void }> = [
    { name: 'bind', apply: () => {} },
    { name: 'regions', apply: () => {} },
    {
      name: 'runFrame',
      apply: () => {
        B('j_hipR').rotation.x = -0.9; B('j_kneeR').rotation.x = 1.3; B('j_hipL').rotation.x = 0.35; B('j_kneeL').rotation.x = 0.25;
        B('j_shoulderR').rotation.x = -0.7; B('j_elbowR').rotation.x = -1.1;
        B('j_shoulderL').rotation.x = 0.6; B('j_elbowL').rotation.x = -0.6;
        B('j_torso').rotation.x = 0.18; B('j_torso').rotation.y = 0.12; B('j_head').rotation.x = -0.1;
      },
    },
    {
      name: 'attackFrame',
      apply: () => {
        B('j_shoulderR').rotation.x = -2.2; B('j_shoulderR').rotation.z = -0.85; B('j_elbowR').rotation.x = -0.4;
        B('j_shoulderL').rotation.x = -0.35; B('j_elbowL').rotation.x = -0.9; B('j_shoulderL').rotation.z = 0.25;
        B('j_torso').rotation.y = -0.42; B('j_torso').rotation.x = 0.3; B('j_head').rotation.y = 0.15;
        B('j_hipR').rotation.x = -0.25; B('j_kneeR').rotation.x = 0.35; B('j_kneeL').rotation.x = 0.4;
      },
    },
    {
      name: 'headTurn',
      apply: () => {
        B('j_head').rotation.y = 0.7; B('j_head').rotation.x = 0.2;
        B('j_elbowL').rotation.x = -1.4;
      },
    },
  ];
  const sharpMod = (require as any)('/home/z/my-project/node_modules/sharp');
  for (const pose of poses) {
    // reset
    for (const b of bones) b.rotation.set(0, 0, 0);
    pose.apply();
    armature.updateMatrixWorld(true);
    // splat
    const W = 700, H = 900;
    const img = Buffer.alloc(W * H * 4, 0);
    for (let i = 0; i < W * H; i++) { img[i * 4] = 24; img[i * 4 + 1] = 24; img[i * 4 + 2] = 28; img[i * 4 + 3] = 255; }
    const m4 = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const sk = new THREE.Vector3();
    // camera: front view (+Z)
    {
      for (let i = 0; i < N; i++) {
        v.set(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
        // skinning: pose matrix * inverse bind (computed from boneWorld + rotation)
        const bi = [skinIndex[i * 4], skinIndex[i * 4 + 1], skinIndex[i * 4 + 2], skinIndex[i * 4 + 3]];
        const bw = [skinWeight[i * 4], skinWeight[i * 4 + 1], skinWeight[i * 4 + 2], skinWeight[i * 4 + 3]];
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
          sk.copy(v).applyMatrix4(m4);
          sx += sk.x * bw[k]; sy += sk.y * bw[k]; sz += sk.z * bw[k];
        }
        const px = Math.round(W / 2 + sx * (H * 0.42));
        const py = Math.round(H / 2 - (sy - TARGET_H / 2) * (H * 0.42));
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const o = (py * W + px) * 4;
        if (pose.name === 'regions') {
          // dominant-bone color map: R-arm crimson, L-arm green, R-leg blue,
          // L-leg yellow, head magenta, torso orange, root gray
          const BONE_COL: Record<string, [number, number, number]> = {
            j_shoulderR: [220, 40, 40], j_elbowR: [180, 20, 20], j_wristR: [140, 10, 10],
            j_shoulderL: [40, 220, 60], j_elbowL: [20, 180, 30], j_wristL: [10, 140, 20],
            j_hipR: [60, 90, 240], j_kneeR: [40, 60, 200], j_ankleR: [20, 40, 160],
            j_hipL: [240, 230, 60], j_kneeL: [210, 190, 30], j_ankleL: [180, 160, 20],
            j_head: [240, 80, 240], j_torso: [255, 150, 40], j_root: [150, 150, 160],
          };
          let bestB = 0, bestW = -1;
          for (let k = 0; k < 4; k++) if (bw[k] > bestW) { bestW = bw[k]; bestB = bi[k]; }
          const c = BONE_COL[bones[bestB].name] ?? [255, 255, 255];
          img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
        } else {
          const li = 0.55 + normal[i * 3 + 2] * 0.35;
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
 * Manual glTF 2.0 GLB writer for a single skinned mesh + bone hierarchy +
 * the source GLB's embedded JPEG texture. No browser APIs needed.
 */
function buildSkinnedGlb(o: {
  position: Float32Array; index: Uint32Array;
  nrmI8: Int8Array; uvU16: Uint16Array; jointsU8: Uint8Array; weightsU8: Uint8Array;
  skinIndex: Uint16Array; skinWeight: Float32Array;
  bones: Array<{ name: string; parent: number; translation: [number, number, number] }>;
  ibm: Float32Array;                       // bones.length * 16, column-major
  srcFile: Buffer;                         // source GLB (image donor)
}): ArrayBuffer {
  // ---- extract the source JPEG ----
  const src = o.srcFile;
  const srcJsonLen = src.readUInt32LE(12);
  const srcJson = JSON.parse(src.slice(20, 20 + srcJsonLen).toString('utf8'));
  let soff = (20 + srcJsonLen + 3) & ~3;
  const srcBinLen = src.readUInt32LE(soff);
  const srcBin = src.subarray(soff + 8, soff + 8 + srcBinLen);
  const img0 = srcJson.images[0];
  const imgBV = srcJson.bufferViews[img0.bufferView];
  const imgBytes = Buffer.from(srcBin.subarray(imgBV.byteOffset, imgBV.byteOffset + imgBV.byteLength));

  // ---- binary chunk assembly (all views 4-byte aligned) ----
  const chunks: Array<{ bytes: Buffer; acc?: number; target?: number }> = [];
  const pad4 = (b: Buffer) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]));
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
  const jBV = push(Buffer.from(o.jointsU8.buffer, o.jointsU8.byteOffset, o.jointsU8.byteLength), 34962);
  const wBV = push(Buffer.from(o.weightsU8.buffer, o.weightsU8.byteOffset, o.weightsU8.byteLength), 34962);
  const idxBV = push(Buffer.from(o.index.buffer, o.index.byteOffset, o.index.byteLength), 34963);
  const ibmBV = push(Buffer.from(o.ibm.buffer, o.ibm.byteOffset, o.ibm.byteLength));
  const imgBVout = push(imgBytes);

  // POSITION min/max (required by spec)
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

  const acc = (a: any) => o.bones ? a : a; // helper noop
  const accessors = [
    { bufferView: 0, componentType: 5126, count: N, type: 'VEC3', min: pmin, max: pmax },                     // 0 POSITION
    { bufferView: 1, componentType: 5120, count: N, type: 'VEC3', normalized: true },                        // 1 NORMAL (int8)
    { bufferView: 2, componentType: 5123, count: N, type: 'VEC2', normalized: true },                        // 2 TEXCOORD_0 (uint16)
    { bufferView: 3, componentType: 5121, count: N, type: 'VEC4' },                                          // 3 JOINTS_0 (uint8, 15 bones)
    { bufferView: 4, componentType: 5121, count: N, type: 'VEC4', normalized: true },                        // 4 WEIGHTS_0 (uint8)
    { bufferView: 5, componentType: 5125, count: o.index.length, type: 'SCALAR', min: [imin], max: [imax] }, // 5 indices
    { bufferView: 6, componentType: 5126, count: o.bones.length, type: 'MAT4' },                             // 6 IBM
  ];
  const bufferViews = [
    { buffer: 0, ...posBV, target: 34962 }, { buffer: 0, ...nrmBV, target: 34962 },
    { buffer: 0, ...uvBV, target: 34962 }, { buffer: 0, ...jBV, target: 34962 },
    { buffer: 0, ...wBV, target: 34962 },
    { buffer: 0, ...idxBV, target: 34963 },
    { buffer: 0, ...ibmBV }, { buffer: 0, ...imgBVout },
  ];

  // ---- nodes: bones (0..n-1) + mesh node (n) ----
  const boneNodes = o.bones.map((b, i) => {
    const node: any = { name: b.name, translation: [r4(b.translation[0]), r4(b.translation[1]), r4(b.translation[2])] };
    const children = o.bones.map((x, j) => j).filter((j) => o.bones[j].parent === i);
    if (children.length) node.children = children;
    return node;
  });
  const meshNodeIdx = o.bones.length;
  const nodes = [...boneNodes, { name: 'knight_body', mesh: 0, skin: 0 }];

  const json: any = {
    asset: { version: '2.0', generator: 'KFS rig_knight (auto-skinned)' },
    scene: 0,
    scenes: [{ nodes: [0, meshNodeIdx] }],   // node 0 = j_root (armature root bone)
    nodes,
    meshes: [{
      name: 'knight_body',
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
        indices: 5,
        material: 0,
      }],
    }],
    skins: [{
      joints: o.bones.map((_, i) => i),
      inverseBindMatrices: 6,
    }],
    materials: [{
      name: 'knight_skin',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0.25,
        roughnessFactor: 0.72,
      },
    }],
    textures: [{ source: 0, sampler: 0 }],
    images: [{ mimeType: 'image/jpeg', bufferView: 7 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: chunks.reduce((a, c) => a + c.bytes.length, 0) }],
  };

  // ---- GLB container ----
  const jsonStr = JSON.stringify(json);
  const jsonChunk = pad4(Buffer.from(jsonStr));
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
  // write BIN marker correctly (avoid escape issues)
  out[p + 4] = 0x42; out[p + 5] = 0x49; out[p + 6] = 0x4e; out[p + 7] = 0x00;
  binChunk.copy(out, p + 8);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length) as ArrayBuffer;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

main().catch((e) => { console.error(e); process.exit(1); });
