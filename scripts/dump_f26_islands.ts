// dump_f26_islands.ts — union-find the merged body mesh's triangles into
// connected islands; print each significant island's size/bbox/centroid and
// its dominant skin bones. Tells us whether the armour plates are separate
// islands (gauntlet vs cuisse separable) or merged soups.
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
  const idx = geo.index!.array as ArrayLike<number>;
  const si = geo.attributes.skinIndex.array;
  const sw = geo.attributes.skinWeight.array;
  const joints: any[] = (body as any).skeleton ? (body as any).skeleton.bones : [];
  const jname = (j: number) => joints[j]?.name ?? `b${j}`;
  const N = geo.attributes.position.count;

  // union-find
  const parent = new Int32Array(N);
  for (let i = 0; i < N; i++) parent[i] = i;
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (let t = 0; t < idx.length; t += 3) {
    union(idx[t], idx[t + 1]); union(idx[t + 1], idx[t + 2]); union(idx[t], idx[t + 2]);
  }
  const islands = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    const r = find(i);
    let arr = islands.get(r);
    if (!arr) { arr = []; islands.set(r, arr); }
    arr.push(i);
  }
  console.log(`islands: ${islands.size}`);
  const sorted = [...islands.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [root, members] of sorted.slice(0, 16)) {
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const boneMass = new Map<string, number>();
    for (const i of members) {
      for (let k = 0; k < 3; k++) {
        const v = pos[i * 3 + k];
        if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v;
      }
      for (let k = 0; k < 4; k++) {
        const w = sw[i * 4 + k];
        if (w > 0) boneMass.set(jname(si[i * 4 + k]), (boneMass.get(jname(si[i * 4 + k])) ?? 0) + w);
      }
    }
    let tot = 0; for (const v of boneMass.values()) tot += v;
    const bones = [...boneMass.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${((v / tot) * 100).toFixed(0)}%`).join(', ');
    const c = members.map((i) => pos[i * 3 + 1]);
    const cy = c.reduce((a, b) => a + b, 0) / c.length;
    console.log(`island root=${root} n=${members.length} y=${cy.toFixed(2)} bbox=[${mn.map((v) => v.toFixed(2)).join(',')}..${mx.map((v) => v.toFixed(2)).join(',')}] bones: ${bones}`);
  }
})();
