// probe_f26_feet.ts — Fase 26 offline probe: does knight_rigged.glb (the
// FIRST knight, from rig_knight.py) stretch its FEET under walk poses?
//
//  1. list every node name (cape bones? sword/shield props?)
//  2. foot-region skin-weight audit (bind y < 0.16): which bones carry load
//  3. LIVE POSE TEST: rotate the leg chain like the real walk gait
//     (hip -0.55, knee +0.9, ankle -0.1 / hip roll) and measure each foot
//     vertex's deviation from its RIGID ankle-bone transform — that
//     deviation IS the stretch the user saw on the armour model.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

const SRC = process.argv[2] ?? 'public/game/models/knight_rigged.glb';
const FOOT_Y = 0.148; // TRUE foot: below the rigid clamp (statue y<-88 = game y<0.149)

async function main(): Promise<void> {
  const buf = readFileSync(SRC);
  const gltf = await new Promise<any>((res, rej) => {
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej);
  });
  const scene: THREE.Object3D = gltf.scene;
  scene.updateMatrixWorld(true);

  // ---- 1. node census ----
  const names: string[] = [];
  scene.traverse((o) => { names.push(o.name || '(anon)'); });
  const interesting = names.filter((n) => n.startsWith('j_'));
  console.log('[nodes] j_* nodes:', interesting.join(', '));
  console.log('[nodes] cape bones:', names.filter((n) => /cape/i.test(n)).join(', ') || 'NONE');
  console.log('[nodes] props:', names.filter((n) => /sword|shield/i.test(n)).join(', ') || 'NONE');

  // ---- find ALL skinned meshes (knight_upper / knight_lower / …) ----
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh) meshes.push(m); });
  if (meshes.length === 0) { console.log('NO SKINNED MESH'); return; }
  for (const sk of meshes) {
    const geo = sk.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const sIdx = geo.attributes.skinIndex as THREE.BufferAttribute;
    const sW = geo.attributes.skinWeight as THREE.BufferAttribute;
    const bones: THREE.Bone[] = sk.skeleton.bones;
    const inv: THREE.Matrix4[] = sk.skeleton.boneInverses;
    const boneName = (i: number) => bones[i]?.name ?? `#${i}`;
    console.log(`\n[skin] mesh=${sk.name} verts=${pos.count} bones=${bones.length}`);

    // ---- 2. foot-region weight audit ----
    // strict foot: below ankle height AND forward (toes point +Z) AND inboard.
    // The loose y<0.16 alone catches the statue's low-hanging cape/skirt.
    const footFlag = new Uint8Array(pos.count);
    let footCount = 0;
    let looseCount = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < FOOT_Y) {
        looseCount++;
        if (pos.getZ(i) > 0.0 && Math.abs(pos.getX(i)) < 0.2) { footFlag[i] = 1; footCount++; }
      }
    }
    console.log(`[feet] ${sk.name}: loose y<${FOOT_Y}=${looseCount}, strict foot (z>0,|x|<0.2)=${footCount}`);
    if (footCount === 0) continue;
    const load = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      if (!footFlag[i]) continue;
      for (let k = 0; k < 4; k++) {
        const w = sW.getComponent(i, k);
        if (w > 0.001) load.set(boneName(sIdx.getComponent(i, k)), (load.get(boneName(sIdx.getComponent(i, k))) ?? 0) + w);
      }
    }
    const totLoad = Array.from(load.values()).reduce((a, b) => a + b, 0);
    const sorted = Array.from(load.entries()).sort((a, b) => b[1] - a[1]);
    for (const [n, w] of sorted) {
      console.log(`[feet]   ${n.padEnd(12)} ${(w / totLoad * 100).toFixed(2)}%`);
    }

    // ---- 3. live pose stretch test ----
    const byName = new Map<string, THREE.Bone>();
    for (const b of bones) byName.set(b.name, b);
    const bind: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) bind.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));

    const skinnedPos = (): THREE.Vector3[] => {
      const out: THREE.Vector3[] = [];
      const tmp = new THREE.Matrix4();
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(); // fresh per vertex (the shared-v bug made every entry the last vert)
        for (let k = 0; k < 4; k++) {
          const w = sW.getComponent(i, k);
          if (w <= 0) continue;
          const b = sIdx.getComponent(i, k);
          tmp.multiplyMatrices(bones[b].matrixWorld, inv[b]);
          const pv = bind[i].clone().applyMatrix4(tmp);
          v.addScaledVector(pv, w);
        }
        out.push(v);
      }
      return out;
    };

    const testPose = (label: string, fn: () => void): void => {
      // reset to bind
      for (const b of bones) { b.rotation.set(0, 0, 0); b.updateMatrix(); }
      scene.updateMatrixWorld(true);
      const bindAnkle = (() => { const a = byName.get('j_ankleL')!; return a.matrixWorld.clone(); })();
      fn();
      scene.updateMatrixWorld(true);
      const p = skinnedPos();
      // sanity: at bind the ankle world must equal its rest position
      if (label === '__bind') {
        const a = byName.get('j_ankleL')!;
        console.log(`  [bind-check] ankle world pos: ${a.matrixWorld.elements[12].toFixed(4)},${a.matrixWorld.elements[13].toFixed(4)},${a.matrixWorld.elements[14].toFixed(4)}`);
        console.log(`  [bind-check] first bone: ${bones[0].name}, inv count: ${inv.length}`);
      }
      // rigid reference: the ankle bone's own transform
      for (const side of ['R', 'L'] as const) {
        const ank = byName.get(`j_ankle${side}`);
        if (!ank) continue;
        const rigid = new THREE.Matrix4().multiplyMatrices(ank.matrixWorld, inv[bones.indexOf(ank)]);
        let maxD = 0; let sumD = 0; let n = 0; let worst = 0;
        for (let i = 0; i < pos.count; i++) {
          if (!footFlag[i]) continue;
          if (side === 'R' ? pos.getX(i) > 0 : pos.getX(i) < 0) continue; // R = -X
          const r = bind[i].clone().applyMatrix4(rigid);
          const d = r.distanceTo(p[i]);
          if (d > maxD) { maxD = d; worst = i; }
          sumD += d; n++;
        }
        if (n > 0) {
          console.log(`[pose:${label}] foot${side}: verts=${n} maxStretch=${(maxD * 1000).toFixed(1)}mm meanStretch=${(sumD / n * 1000).toFixed(1)}mm (worst vert y=${pos.getY(worst).toFixed(3)})`);
          if (label === 'kneeOnly+1.2') {
            const pairs: string[] = [];
            for (let k = 0; k < 4; k++) pairs.push(`${boneName(sIdx.getComponent(worst, k))}=${sW.getComponent(worst, k).toFixed(3)}`);
            console.log(`  [worst] bind=(${pos.getX(worst).toFixed(3)},${pos.getY(worst).toFixed(3)},${pos.getZ(worst).toFixed(3)}) weights: ${pairs.join(' ')}`);
            const rigidV = bind[worst].clone().applyMatrix4(rigid);
            console.log(`  [worst] rigid=(${rigidV.x.toFixed(3)},${rigidV.y.toFixed(3)},${rigidV.z.toFixed(3)}) skinned=(${p[worst].x.toFixed(3)},${p[worst].y.toFixed(3)},${p[worst].z.toFixed(3)})`);
            const ankM = byName.get('j_ankleL')!.matrixWorld;
            console.log(`  [worst] ankleWorld=(${ankM.elements[12].toFixed(3)},${ankM.elements[13].toFixed(3)},${ankM.elements[14].toFixed(3)})`);
          }
        }
      }
    };
    testPose('__bind', () => {});

    // the REAL walk extremes from poseLocomotion (amp≈0.8, runK≈0.4):
    testPose('walkR', () => {
      const hipR = byName.get('j_hipR')!; hipR.rotation.x = -0.8; hipR.rotation.z = -0.06;
      const kneeR = byName.get('j_kneeR')!; kneeR.rotation.x = 0.95;
      const ankR = byName.get('j_ankleR')!; ankR.rotation.x = -0.25; ankR.rotation.z = 0.08;
      const hipL = byName.get('j_hipL')!; hipL.rotation.x = 0.35; hipL.rotation.z = 0.06;
      const kneeL = byName.get('j_kneeL')!; kneeL.rotation.x = 0.3;
      const ankL = byName.get('j_ankleL')!; ankL.rotation.x = 0.1;
    });
    testPose('kneeOnly+1.2', () => {
      byName.get('j_kneeR')!.rotation.x = 1.2;
      byName.get('j_kneeL')!.rotation.x = 1.2;
    });
    testPose('deepLanding', () => {
      const hipR = byName.get('j_hipR')!; hipR.rotation.x = -1.05;
      const kneeR = byName.get('j_kneeR')!; kneeR.rotation.x = 1.4;
      const ankR = byName.get('j_ankleR')!; ankR.rotation.x = -0.2;
      const hipL = byName.get('j_hipL')!; hipL.rotation.x = -1.05;
      const kneeL = byName.get('j_kneeL')!; kneeL.rotation.x = 1.4;
      const ankL = byName.get('j_ankleL')!; ankL.rotation.x = -0.2;
      const torso = byName.get('j_torso')!; torso.rotation.x = 0.3;
    });
  }

  console.log('\n[done]');
}
main().catch((e) => { console.error(e); process.exit(1); });
