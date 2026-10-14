// analyze_f23.ts — inspect medieval_knight_rigged.glb:
//  1) which bones exist (cape bones?), 2) the STATUE ARM POSE (how bent are
//  the elbows / how abducted the shoulders at bind = identity rotations),
//  3) where the fists are relative to the wrist joints (for sword grip).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as fs from 'fs';

const SRC = process.argv[2] || 'public/game/models/medieval_knight_rigged.glb';

const load = (path: string): Promise<THREE.Group> =>
  new Promise((res, rej) => {
    const data = fs.readFileSync(path);
    const loader = new GLTFLoader();
    loader.parse(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      '',
      (g) => res(g.scene as unknown as THREE.Group),
      (e) => rej(e),
    );
  });

(async () => {
  const scene = await load(SRC);
  const bones: Record<string, THREE.Bone> = {};
  scene.traverse((o) => { if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone; });
  console.log('bones:', Object.keys(bones).join(', '));

  scene.updateMatrixWorld(true);
  const wp = (n: string) => {
    const b = bones[n];
    if (!b) return null;
    const v = new THREE.Vector3();
    b.getWorldPosition(v);
    return v;
  };
  const P = (v: THREE.Vector3 | null) => (v ? `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}` : '—');

  for (const side of ['R', 'L'] as const) {
    const sh = wp(`j_shoulder${side}`)!;
    const el = wp(`j_elbow${side}`)!;
    const wr = wp(`j_wrist${side}`)!;
    const upper = el.clone().sub(sh).normalize();   // shoulder→elbow
    const fore = wr.clone().sub(el).normalize();    // elbow→wrist
    const bend = THREE.MathUtils.radToDeg(upper.angleTo(fore));
    const abd = THREE.MathUtils.radToDeg(Math.abs(upper.x) > 0.02 ? Math.atan2(Math.hypot(upper.x, upper.z), -upper.y) : 0);
    // fist cloud: vertices within 12cm of wrist that belong to the arm region
    const near: THREE.Vector3[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.distanceTo(wr) < 0.13) near.push(v.clone());
      }
    });
    const fist = new THREE.Vector3();
    if (near.length) near.forEach((v) => fist.add(v));
    if (near.length) fist.divideScalar(near.length);
    console.log(`\n[${side}] shoulder ${P(sh)}  elbow ${P(el)}  wrist ${P(wr)}`);
    console.log(`[${side}] elbow BEND=${bend.toFixed(1)}°  shoulder ABDUCTION=${abd.toFixed(1)}°  forearm dir=(${fore.x.toFixed(2)},${fore.y.toFixed(2)},${fore.z.toFixed(2)})`);
    console.log(`[${side}] fist centroid (${near.length} verts): ${P(fist)}  fist-wrist offset: ${P(fist.clone().sub(wr))}`);
  }
  // mesh bbox at bind
  const box = new THREE.Box3().setFromObject(scene);
  console.log('\nbind bbox:', JSON.stringify(box.min.toArray().map((n) => +n.toFixed(2))), JSON.stringify(box.max.toArray().map((n) => +n.toFixed(2))));
})().catch((e) => { console.error(e); process.exit(1); });
