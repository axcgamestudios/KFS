import * as THREE from 'three';
import type { KitSystem } from './KitSystem';
import type { TerrainHeight } from './TerrainHeight';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import { getFlameFX } from './FlameFX';

/**
 * Fase 5 — world dressing with the repository kits.
 * The lowpoly medieval set and the furniture minipack are placed where they
 * belong: tavern tables and chairs, market barrels and crates, street lamps
 * along the main road, banners at the castle gate, a training target by the
 * smithy, a signal bonfire on the beach camp and the docks dressed as a
 * working harbour. Thin posts get colliders; small props stay walkable.
 */
export interface DressRefs {
  tavernDoor: THREE.Vector3;
  squareCenter: THREE.Vector3;
  castleGate?: THREE.Vector3;
}

export function dressWithKits(
  scene: THREE.Scene,
  terrain: TerrainHeight,
  colliders: ColliderRegistry,
  kits: KitSystem,
  refs: DressRefs,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'kfs_kit_dressing';
  const g = (x: number, z: number) => terrain.height(x, z);
  const placed: Array<{ x: number; z: number; r: number }> = [];

  const tooClose = (x: number, z: number, r: number) =>
    placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r);

  const put = (
    name: string,
    x: number, z: number,
    opts: { rotY?: number; solid?: number; off?: number; scale?: number } = {},
  ): boolean => {
    const obj = kits.create(name);
    if (!obj) return false;
    const r = opts.solid ?? 0;
    if (r > 0 && tooClose(x, z, r)) { return false; }
    const y = g(x, z) + (opts.off ?? 0);
    obj.position.set(x, y, z);
    obj.rotation.y = opts.rotY ?? Math.random() * Math.PI * 2;
    if (opts.scale) obj.scale.setScalar(opts.scale);
    group.add(obj);
    if (r > 0) {
      placed.push({ x, z, r });
      colliders.add(`kit_${name}_${placed.length}`, {
        kind: 'cylinder', x, z, r, minY: y - 0.4, maxY: y + 2.2,
      });
    }
    return true;
  };

  const t = refs.tavernDoor;
  const sq = refs.squareCenter;

  // --- Tavern: tables, chairs, mugs and bottles on the porch ---
  for (const [dx, dz] of [[3.4, 2.2], [-2.8, 3.4], [1.2, -3.2]] as Array<[number, number]>) {
    put('furniture_table_round_01', t.x + dx, t.z + dz, { rotY: Math.random() * 6.28, solid: 0.55 });
    put('furniture_chair_01', t.x + dx + 0.95, t.z + dz + 0.3, { rotY: Math.PI * (Math.random() - 0.5) });
    put('furniture_chair_02', t.x + dx - 0.9, t.z + dz - 0.35, { rotY: Math.PI * (Math.random() - 0.5) });
    put('mug', t.x + dx + 0.18, t.z + dz - 0.1, { off: 0.95 });
    if (Math.random() < 0.6) put('bottle', t.x + dx - 0.22, t.z + dz + 0.14, { off: 0.95 });
  }
  put('furniture_bench_01', t.x - 0.6, t.z + 5.2, { rotY: 0.2 });

  // --- Market square: barrels, crates and the notice sign ---
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const rad = 6.4 + (i % 3) * 1.7;
    put(i % 2 === 0 ? 'barrel' : 'crate', sq.x + Math.cos(a) * rad, sq.z + Math.sin(a) * rad, {
      solid: 0.5,
      off: i % 3 === 0 ? 0.35 : 0, // some stacked on crates
    });
  }
  put('sign', sq.x - 8.5, sq.z + 2.5, { rotY: 0.7, solid: 0.3 });
  put('jar', sq.x + 4.2, sq.z - 5.6);
  put('candle', sq.x + 5.1, sq.z - 5.2, { off: 0.9 });

  // --- Street lamps along the main road (square → docks) ---
  for (let i = 0; i < 5; i++) {
    put('lamp_post', 15.5 - (i % 2) * 1.4, 168 + i * 11, { solid: 0.28 });
  }
  put('lamp_wall', 24.5, 178, { rotY: -Math.PI / 2, off: 2.1 });

  // --- Smithy corner: anvil-side target for practice + helmet on a post ---
  put('target', 33.5, 171.5, { rotY: -0.6, solid: 0.4 });
  put('helmet', 34.6, 170.4, { off: 1.05, rotY: 0.4 });
  put('ax', 31.8, 173.2, { rotY: 1.2, off: 0.02 });

  // --- Docks: crates, barrels, rope coils (jar) and a ladder ---
  for (const [dx, dz] of [[16, 236], [22.5, 240], [19, 247]] as Array<[number, number]>) {
    put(Math.random() < 0.5 ? 'crate' : 'barrel', dx, dz, { solid: 0.5 });
  }
  put('jar', 21, 243);
  put('ladder', 25.5, 252, { rotY: -Math.PI / 2, solid: 0.3 });
  put('wood-bridge', 20, 258, { rotY: 0.08 });

  // --- Beach camp: signal bonfire + chopped wood ---
  put('bonfire', 40, 262, { solid: 0.8 });
  put('tree_chopped', 42.5, 264.5);
  put('tree_chopped', 38.6, 265.2);
  // Fase 7 — the signal fire BURNS: procedural shader flame + rising embers
  getFlameFX(scene).addFlame(
    new THREE.Vector3(40, g(40, 262) + 0.85, 262),
    { scale: 0.85, height: 1.85, heat: 0.5, embers: 26 },
  );

  // --- Castle gate: banners, stone blocks, a weapons rack (sword + shield) ---
  const cg = refs.castleGate ?? { x: 110, z: 12 };
  put('banner', cg.x - 4.2, cg.z - 1.5, { solid: 0.3 });
  put('banner', cg.x + 4.2, cg.z - 1.5, { solid: 0.3 });
  put('stone_block', cg.x - 2.2, cg.z + 2.5);
  put('stone_block', cg.x + 2.4, cg.z + 3.1);
  put('sword_01', cg.x - 1.1, cg.z + 4.4, { rotY: 0.5, off: 1.0 });
  put('shield_01', cg.x + 1.3, cg.z + 4.4, { rotY: -0.4, off: 1.25 });
  put('helmet', cg.x + 0.2, cg.z + 5.5, { off: 0.02 });

  // --- Watch target + cage near the fortress path ---
  put('cage', 96, -75, { solid: 0.6 });
  put('fence', 92.5, -71, { rotY: 0.4 });
  put('plant_01', 90.8, -73.5);

  scene.add(group);
  return group;
}
