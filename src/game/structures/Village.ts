import * as THREE from 'three';
import { StaticBuilder } from './Materials';
import { buildDock, buildShip } from './Buildings';
import {
  buildBritishCabin, buildFountain, buildVillageStable, dressVillageGreen,
  type CabinAnchors,
} from './BritishVillage';
import { buildFlagstonePath } from './StonePaths';
import { TorchSystem, createChest, createSignpost, type ChestHandles } from './Props';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import { mulberry32 } from '../core/MathUtils';

export interface VillageLayout {
  spawnPoint: THREE.Vector3;      // dock arrival point
  eirikChest: ChestHandles;
  eirikChestPos: THREE.Vector3;
  shipPos: THREE.Vector3;
  shipDeck: THREE.Vector3;
  /** Static (under repair) Colibrí group — hidden once the real ship launches. */
  staticShip: THREE.Group;
  /** Show/hide the static ship including its colliders (refit / new game). */
  setStaticShip: (visible: boolean) => void;
  /** Whole merged village group (for distance streaming). */
  mainGroup: THREE.Group;
  /** Fase 18 — named-door anchors (was warehouse/tavern/smithy/maren refs). */
  rosaDoor: THREE.Vector3;
  bramForge: THREE.Vector3;
  ericaDoor: THREE.Vector3;
  marenGarden: THREE.Vector3;
  borinForge: THREE.Vector3;
  stablePos: THREE.Vector3;
  squareCenter: THREE.Vector3;
  fountainPos: THREE.Vector3;
  torches: TorchSystem;
}

/**
 * Fase 18 — CROWHAVEN, A BRITISH VILLAGE.
 *
 * The user's spec: the fisherman gets a cabin, so do Aldric, Erica, Rosa,
 * the blacksmith (Bram) and the dwarf blacksmith (Borin). Plus the stable
 * — nothing more. A fountain stands in the centre of the green. Tudor-style
 * cottages with real interiors, hedges, flower boxes and cobble paths; the
 * dock and the Sea Hummingbird keep their old berths.
 */
export function buildVillage(
  scene: THREE.Scene,
  terrain: { height(x: number, z: number): number; meshHeight?(x: number, z: number): number },
  colliders: ColliderRegistry,
): VillageLayout {
  const b = new StaticBuilder(colliders, 'village');
  const rand = mulberry32(2024);
  // Fase 23 — g() samples the RENDERED ground (the chunk tessellation),
  // not the analytic field: the village lies flush with what the player
  // actually sees, at every quality tier.
  const g = (x: number, z: number) => terrain.meshHeight?.(x, z) ?? terrain.height(x, z);

  const anchors: Record<string, CabinAnchors | undefined> = {};
  const cabin = (
    role: Parameters<typeof buildBritishCabin>[1]['role'],
    x: number, z: number, rotY: number, opts: { w?: number; d?: number; roof?: 'thatch' | 'slate'; seed?: number } = {},
  ) => {
    buildBritishCabin(b, {
      x, z, groundY: g(x, z), rotY, role, ...opts,
      anchors: (a) => { anchors[role] = a; },
    });
  };

  // ============ THE GREEN & THE FOUNTAIN (village centre) ============
  buildFountain(b, 20, 150, g(20, 150), g);
  dressVillageGreen(b, 20, 150, g(20, 150), rand, g);
  // Fase 23 — hand-laid flagstone roads radiating from the green to each
  // door & the dock: every slab sunk and tilted to the terrain, kerbed
  // edges, dirt showing through the joints (the old flat cobble boxes
  // floated, tiled and clipped — "se ven muy mal y raros").
  const path = (ax: number, az: number, bx2: number, bz2: number, width = 2.2) => {
    buildFlagstonePath(b, rand, ax, az, bx2, bz2, width, g);
  };
  path(20, 150, 20, 226, 2.7);        // green -> dock (the main road)
  path(20, 150, -8, 160);             // green -> Aldric
  path(20, 150, 36, 143);             // green -> Erica
  path(20, 150, 2, 174);              // green -> Rosa
  path(20, 150, 40, 171);             // green -> Bram
  path(20, 150, -14, 187);            // green -> stable
  path(20, 150, 0, 206, 2.4);         // green -> Borin (dock road)
  path(20, 150, 0, 138);              // green -> Tom

  // ============ THE SIX COTTAGES ============
  // Tom the fisherman — by the northern beach, door facing the green (SE)
  cabin('fisher', 0, 138, 2.45, { w: 6.2, d: 7.2, seed: 11 });
  // Maester Aldric — west side, door facing east
  cabin('maester', -14, 160, Math.PI / 2 - 0.18, { w: 6.8, d: 7.8, seed: 21 });
  // Erica the shopkeeper — east side, door facing west
  cabin('shop', 36, 143, -Math.PI / 2 + 0.22, { w: 6.6, d: 7.0, seed: 31 });
  // Rosa the innkeeper — south of the green, door facing north (hearth-cottage)
  cabin('inn', 2, 176, Math.PI + 0.12, { w: 7.2, d: 8.0, seed: 41 });
  // Bram the blacksmith — east, forge annex facing the green
  cabin('smith', 40, 171, -Math.PI / 2 - 0.1, { w: 6.8, d: 8.0, roof: 'slate', seed: 51 });
  // Borin the dwarf — by the dock road, heavy slate roof
  cabin('dwarf', 0, 206, Math.PI / 2, { w: 6.4, d: 7.4, roof: 'slate', seed: 61 });

  // ---- Exterior dressing per cottage ----
  // Tom: drying nets between posts + oars + fish crates
  {
    const a = anchors.fisher!;
    const nx = a.doorOut.x + 2.4, nz = a.doorOut.z + 1.2;
    b.cylinder('woodDark', 0.07, 0.09, 2.3, 5, nx, g(nx, nz) + 1.15, nz, true);
    b.cylinder('woodDark', 0.07, 0.09, 2.3, 5, nx + 3.4, g(nx + 3.4, nz), nz + 0.6, true);
    b.box('sail', 3.6, 1.15, 0.05, nx + 1.7, g(nx, nz) + 1.9, nz + 0.3, 0.16);
    b.solidBox('woodDark', 0.8, 0.7, 0.8, nx - 1.1, g(nx - 1.1, nz - 1.0) + 0.35, nz - 1.0, 0.4);
  }
  // Aldric: reading bench + planter of ivory petals + lamp post
  {
    const a = anchors.maester!;
    b.box('wood', 1.7, 0.1, 0.5, a.doorOut.x + 1.6, g(a.doorOut.x + 1.6, a.doorOut.z + 1.4) + 0.45, a.doorOut.z + 1.4, 0.4);
    b.box('woodDark', 0.14, 0.42, 0.42, a.doorOut.x + 1.0, g(a.doorOut.x + 1.0, a.doorOut.z + 1.4) + 0.21, a.doorOut.z + 1.4, 0.4);
    b.box('woodDark', 0.14, 0.42, 0.42, a.doorOut.x + 2.2, g(a.doorOut.x + 2.2, a.doorOut.z + 1.4) + 0.21, a.doorOut.z + 1.4, 0.4);
    b.box('wood', 1.2, 0.35, 0.6, a.doorOut.x - 1.4, g(a.doorOut.x - 1.4, a.doorOut.z) + 0.18, a.doorOut.z, 1.2);
    b.box('leaf', 1.05, 0.28, 0.5, a.doorOut.x - 1.4, g(a.doorOut.x - 1.4, a.doorOut.z) + 0.42, a.doorOut.z, 1.2);
  }
  // Erica: striped awning + stacked trade crates by her door
  {
    const a = anchors.shop!;
    const ax = a.doorOut.x - 0.6, az = a.doorOut.z + 0.8;
    b.add(new THREE.BoxGeometry(3.2, 0.08, 1.4), 'clothGold', ax, g(ax, az) + 2.55, az, -Math.PI / 2 + 0.25, 1, 1, 1, 0, 0.22);
    b.cylinder('woodDark', 0.06, 0.07, 2.5, 5, ax + 1.4, g(ax + 1.4, az) + 1.25, az + 0.5, true);
    b.cylinder('woodDark', 0.06, 0.07, 2.5, 5, ax - 1.4, g(ax - 1.4, az) + 1.25, az + 0.5, true);
    b.solidBox('woodDark', 0.85, 0.85, 0.85, ax, g(ax, az - 1.2) + 0.43, az - 1.2, 0.3);
    b.solidBox('woodDark', 0.7, 0.7, 0.7, ax + 1.0, g(ax + 1.0, az - 1.3) + 0.35, az - 1.3, 0.7);
  }
  // Rosa: ale barrels + a hanging tavern sign (her cottage IS the inn now)
  {
    const a = anchors.inn!;
    const sx = a.doorOut.x - 2.0, sz = a.doorOut.z + 0.6;
    b.cylinder('woodDark', 0.06, 0.06, 2.6, 5, sx, g(sx, sz) + 3.55, sz, true);
    b.add(new THREE.BoxGeometry(1.0, 0.65, 0.07), 'wood', sx, g(sx, sz) + 2.75, sz, 0.35);
    b.add(new THREE.BoxGeometry(0.5, 0.22, 0.09), 'gold', sx, g(sx, sz) + 2.75, sz, 0.35);
    for (let i = 0; i < 2; i++) {
      const bx2 = a.doorOut.x + 2.2 + i * 0.9;
      const bz2 = a.doorOut.z - 0.4;
      b.cylinder('wood', 0.4, 0.46, 1.0, 9, bx2, g(bx2, bz2) + 0.5, bz2, true);
      b.addCylinderCollider(bx2, bz2, 0.48, g(bx2, bz2), g(bx2, bz2) + 1.0);
    }
  }
  // Bram: outdoor quench trough + coal sack + a spare anvil stump
  {
    const a = anchors.smith!;
    const qx = a.doorOut.x - 1.6, qz = a.doorOut.z + 1.4;
    b.box('stoneDark', 1.5, 0.55, 0.8, qx, g(qx, qz) + 0.28, qz, 0.2);
    b.add(new THREE.BoxGeometry(1.3, 0.1, 0.62), 'fountainWater', qx, g(qx, qz) + 0.52, qz, 0.2);
  }
  // Borin: ore cart + granite milestones along his path
  {
    const a = anchors.dwarf!;
    const cx2 = a.doorOut.x + 2.6, cz2 = a.doorOut.z + 0.4;
    b.add(new THREE.BoxGeometry(1.4, 0.7, 0.9), 'woodDark', cx2, g(cx2, cz2) + 0.62, cz2, 0.5);
    b.add(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 8), 'metal', cx2 - 0.5, g(cx2, cz2) + 0.32, cz2 - 0.3, 0, 1, 1, 1, Math.PI / 2);
    b.add(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 8), 'metal', cx2 + 0.5, g(cx2, cz2) + 0.32, cz2 - 0.3, 0, 1, 1, 1, Math.PI / 2);
    b.add(new THREE.IcosahedronGeometry(0.2, 0), 'stoneDark', cx2 - 0.3, g(cx2, cz2) + 1.05, cz2, 0.4);
    b.add(new THREE.IcosahedronGeometry(0.16, 0), 'metal', cx2 + 0.25, g(cx2, cz2) + 1.0, cz2 + 0.15, 1.2);
  }

  // ============ THE STABLE (west, with its fenced yard) ============
  buildVillageStable(b, -14, 187, g(-14, 187), 0.35);

  // ============ MAREN'S GARDEN NOOK (herbs, no building) ============
  {
    const mx = -6, mz = 152;
    // drying racks + planters + a little stream-side bench
    for (let i = 0; i < 5; i++) {
      b.cylinder('leaf', 0.04, 0.04, 0.6, 4, mx - 1.2 + i * 0.3, g(mx - 1.2 + i * 0.3, mz - 1.0) + 2.2, mz - 1.0);
    }
    b.cylinder('woodDark', 0.06, 0.08, 2.2, 5, mx - 1.5, g(mx - 1.5, mz - 1.0) + 1.1, mz - 1.0, true);
    b.cylinder('woodDark', 0.06, 0.08, 2.2, 5, mx + 0.3, g(mx + 0.3, mz - 1.0) + 1.1, mz - 1.0, true);
    for (let i = 0; i < 3; i++) {
      const px2 = mx + 1.4 + i * 0.12, pz2 = mz + 0.6 + i * 1.1;
      b.box('wood', 1.7, 0.35, 0.7, px2, g(px2, pz2) + 0.18, pz2, 1.35);
      b.box('leaf', 1.5, 0.3, 0.55, px2, g(px2, pz2) + 0.44, pz2, 1.35);
    }
  }

  // ============ THE DOCKS (unchanged berths) ============
  buildDock(b, 20, 227, 0, 30, 4, 1.45, true);
  // Moored rowboat on the beach
  b.add(new THREE.BoxGeometry(1.2, 0.5, 2.6), 'woodDark', 12, g(12, 236) + 0.2, 236, 0.3);
  b.add(new THREE.BoxGeometry(0.9, 0.08, 2.0), 'woodLight', 12, g(12, 236) + 0.38, 236, 0.3);

  // --- The "Colibrí de Mar" (damaged caravel) beside the pier ---
  const shipX = 31, shipZ = 248;
  const shipB = new StaticBuilder(colliders, 'ship_static');
  buildShip(shipB, shipX, shipZ, 0.12, 0);
  const staticShip = new THREE.Group();
  shipB.build(staticShip, { shadows: true });
  scene.add(staticShip);
  const setStaticShip = (visible: boolean) => {
    staticShip.visible = visible;
    if (visible) shipB.reRegisterColliders();
    else shipB.removeAllColliders();
  };

  // Fisher nets & crates on the pier
  for (let i = 0; i < 3; i++) {
    const cx = 18 + rand() * 4;
    const cz = 232 + rand() * 12;
    b.solidBox('woodDark', 0.8, 0.8, 0.8, cx, 1.85, cz, rand() * 3);
  }

  // Merge all static village geometry into the scene
  const group = new THREE.Group();
  b.build(group, { shadows: true });
  scene.add(group);

  // --- Dynamic props: torches around the green, the paths and the dock ---
  const torches = new TorchSystem(scene, 4);
  const torchSpots: Array<[number, number]> = [
    [12, 143], [28, 143], [12, 158], [28, 158],   // the green corners
    [8, 165], [32, 152],                            // Aldric & Erica paths
    [14, 182], [24, 170],                           // Rosa & Bram paths
    [-8, 190], [4, 200],                            // stable & Borin
    [17, 228], [23, 228],                           // dock head
    [18, 252], [22, 252],                           // pier end
  ];
  for (const [tx, tz] of torchSpots) {
    torches.addTorchPost(tx, g(tx, tz), tz, colliders);
  }
  createSignpost(15, g(15, 163), 163, 0.4, [], scene);

  // Eirik's sea chest — inside Aldric's study (the maester keeps it safe)
  const aldr = anchors.maester!;
  const chestPos = aldr.chestSpot;
  const eirikChest = createChest(
    chestPos.x, chestPos.y - 0.06, chestPos.z, Math.PI / 2 + 0.2, scene, colliders,
  );

  return {
    spawnPoint: new THREE.Vector3(21, 0, 244),
    eirikChest,
    eirikChestPos: chestPos.clone(),
    shipPos: new THREE.Vector3(shipX, 0, shipZ),
    shipDeck: new THREE.Vector3(shipX, 1.0, shipZ + 5),
    staticShip,
    setStaticShip,
    mainGroup: group,
    rosaDoor: anchors.inn!.doorOut,
    bramForge: anchors.smith!.hearth,
    ericaDoor: anchors.shop!.doorOut,
    marenGarden: new THREE.Vector3(-6, g(-6, 152), 152),
    borinForge: anchors.dwarf!.hearth,
    stablePos: new THREE.Vector3(-14, g(-14, 187), 187),
    squareCenter: new THREE.Vector3(20, g(20, 150), 150),
    fountainPos: new THREE.Vector3(20, g(20, 150), 150),
    torches,
  };
}
