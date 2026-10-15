// dump_f26_weights.ts — measure the ACTUAL skin weights in the shipped
// knight_armour_rigged.glb for the regions the user reported broken.
// F26 v2: ownership-split regions (arm chain vs leg chain) + weight-MASS
// breakdown (not just dominant-bone tallies).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

(async () => {
  const buf = readFileSync('public/game/models/knight_armour_rigged.glb');
  const gltf = await new Promise<any>((res, rej) => {
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', res, rej);
  });
  let body: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o: any) => { if (o.isSkinnedMesh && /body/i.test(o.name) && !body) body = o; });
  if (!body) { console.log('no body mesh'); return; }
  const geo = body.geometry;
  const pos = geo.attributes.position.array as Float32Array;
  const si = geo.attributes.skinIndex.array;
  const sw = geo.attributes.skinWeight.array;
  const joints: any[] = (body as any).skeleton ? (body as any).skeleton.bones : [];
  const jname = (j: number) => joints[j]?.name ?? `b${j}`;

  // ---- segment distance helpers (bind A-pose landmarks from the manifest) ----
  const segDist = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const len2 = abx * abx + aby * aby + abz * abz;
    let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t), pz - (az + abz * t));
  };
  // right arm: shoulder(-0.27,1.56,-0.043) elbow(-0.49,1.109,0.063) wrist(-0.189,0.752,0.013)
  const dArmSegR = (x: number, y: number, z: number) => Math.min(
    segDist(x, y, z, -0.27, 1.56, -0.043, -0.4898, 1.1093, 0.0629),
    segDist(x, y, z, -0.4898, 1.1093, 0.0629, -0.1889, 0.7517, 0.0125));
  // left arm: shoulder(0.27,1.56,-0.0225) elbow(0.4799,1.1276,0.127) wrist(0.2045,0.7933,0.0816)
  const dArmSegL = (x: number, y: number, z: number) => Math.min(
    segDist(x, y, z, 0.27, 1.56, -0.0225, 0.4799, 1.1276, 0.127),
    segDist(x, y, z, 0.4799, 1.1276, 0.127, 0.2045, 0.7933, 0.0816));
  // right leg: hip(-0.1071,0.96,-0.0041) knee(-0.1326,0.52,-0.0165)
  const dLegSegR = (x: number, y: number, z: number) => Math.min(
    segDist(x, y, z, -0.1071, 0.96, -0.0041, -0.1326, 0.52, -0.0165),
    segDist(x, y, z, -0.1326, 0.52, -0.0165, -0.1326, 0.115, -0.033));
  // left leg: hip(0.118,0.96,0.0043) knee(0.1549,0.52,-0.02)
  const dLegSegL = (x: number, y: number, z: number) => Math.min(
    segDist(x, y, z, 0.118, 0.96, 0.0043, 0.1549, 0.52, -0.02),
    segDist(x, y, z, 0.1549, 0.52, -0.02, 0.1549, 0.115, -0.0399));
  // forearm tube (elbow->wrist)
  const dVamR = (x: number, y: number, z: number) => segDist(x, y, z, -0.4898, 1.1093, 0.0629, -0.1889, 0.7517, 0.0125);
  const dVamL = (x: number, y: number, z: number) => segDist(x, y, z, 0.4799, 1.1276, 0.127, 0.2045, 0.7933, 0.0816);

  const regionMass = (name: string, test: (x: number, y: number, z: number) => boolean) => {
    const mass = new Map<string, number>();
    let n = 0;
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (!test(x, y, z)) continue;
      n++;
      for (let k = 0; k < 4; k++) {
        const w = sw[i * 4 + k];
        if (w <= 0) continue;
        mass.set(jname(si[i * 4 + k]), (mass.get(jname(si[i * 4 + k])) ?? 0) + w);
      }
    }
    let tot = 0; for (const v of mass.values()) tot += v;
    const rows = [...mass.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, v]) => `${k} ${((v / tot) * 100).toFixed(0)}%`).join(' | ');
    console.log(`MASS ${name}: ${n} verts -> ${rows}`);
  };

  // ownership-split: a region vertex is ARM if the arm chain is clearly closer
  regionMass('FIST R (arm-owned)', (x, y, z) => x < -0.10 && x > -0.34 && y > 0.55 && y < 0.85 && z > -0.05 && z < 0.15 && dLegSegR(x, y, z) > 0.09);
  regionMass('FIST L (arm-owned)', (x, y, z) => x > 0.10 && x < 0.34 && y > 0.55 && y < 0.85 && z > -0.05 && z < 0.15 && dLegSegL(x, y, z) > 0.09);
  regionMass('VAMBRACE R (arm-owned tube)', (x, y, z) => y > 0.72 && y < 1.11 && x < 0 && dVamR(x, y, z) < 0.13 && dLegSegR(x, y, z) > 0.09);
  regionMass('VAMBRACE L (arm-owned tube)', (x, y, z) => y > 0.72 && y < 1.11 && x > 0 && dVamL(x, y, z) < 0.13 && dLegSegL(x, y, z) > 0.09);
  regionMass('CUISSE R top (leg-owned, in tube)', (x, y, z) => y > 0.72 && y < 1.11 && x < 0 && dVamR(x, y, z) < 0.13 && dLegSegR(x, y, z) <= 0.09);
  regionMass('THIGH R (leg-owned corridor)', (x, y, z) => y > 0.62 && y < 0.95 && x < -0.06 && x > -0.26 && Math.abs(z) < 0.115 && dLegSegR(x, y, z) < 0.09);
  regionMass('UPPER ARM R (delt band)', (x, y, z) => y > 1.05 && y < 1.50 && x < -0.34);
  regionMass('SABATON R (whole foot)', (x, y, z) => y < 0.20 && x < 0);
  regionMass('TASSET front (skirt)', (x, y, z) => y > 0.60 && y < 1.05 && z > 0.115);
})();
