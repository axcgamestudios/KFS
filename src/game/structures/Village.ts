import * as THREE from 'three';
import { StaticBuilder } from './Materials';
import {
  buildHouse, buildTavern, buildSmithy, buildWarehouse, buildHerbalistHut,
  buildWell, buildStall, buildDock, buildShip,
} from './Buildings';
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
  warehouseDoor: THREE.Vector3;
  tavernDoor: THREE.Vector3;
  smithyForge: THREE.Vector3;
  marenHut: THREE.Vector3;
  squareCenter: THREE.Vector3;
  wellPos: THREE.Vector3;
  torches: TorchSystem;
}

/**
 * Puerto Cuervo — the southern harbor village: square with well and market,
 * main street with timber houses, tavern, smithy, herbalist, warehouse and
 * the docks where the “Colibrí de Mar” waits under repair.
 */
export function buildVillage(
  scene: THREE.Scene,
  terrain: { height(x: number, z: number): number },
  colliders: ColliderRegistry,
): VillageLayout {
  const b = new StaticBuilder(colliders, 'village');
  const rand = mulberry32(2024);
  const g = (x: number, z: number) => terrain.height(x, z);

  // --- Village square ---
  buildWell(b, 20, 148, g(20, 148));
  buildStall(b, 12, 141, g(12, 141), Math.PI * 0.25, 1);
  buildStall(b, 28, 141, g(28, 141), -Math.PI * 0.25, 2);
  buildStall(b, 12, 157, g(12, 157), -Math.PI * 0.25, 3);
  buildStall(b, 28, 157, g(28, 157), Math.PI * 0.25, 4);

  // --- Main street buildings (street runs along x=20, from square to docks) ---
  // West side (doors facing east → rotY = -π/2)
  buildTavern(b, 4, 170, g(4, 170), -Math.PI / 2);
  buildHouse(b, { x: 7, z: 188, groundY: g(7, 188), rotY: -Math.PI / 2, seed: 11 });
  buildHerbalistHut(b, 4, 203, g(4, 203), -Math.PI / 2);
  buildHouse(b, { x: 7, z: 219, groundY: g(7, 219), rotY: -Math.PI / 2, seed: 12 });
  buildHouse(b, { x: 5, z: 141, groundY: g(5, 141), rotY: -Math.PI / 2, seed: 13 }); // NW of square

  // East side (doors facing west)
  buildHouse(b, { x: 33, z: 166, groundY: g(33, 166), rotY: Math.PI / 2, seed: 14 });
  let forgePos = new THREE.Vector3(29, g(29, 190), 190);
  buildSmithy(b, 35, 190, g(35, 190), Math.PI / 2, (fx, fy, fz) => {
    forgePos = new THREE.Vector3(fx, fy, fz);
  });
  buildWarehouse(b, 37, 215, g(37, 215), -Math.PI / 2);
  buildHouse(b, { x: 33, z: 230, groundY: g(33, 230), rotY: Math.PI / 2, seed: 15 });

  // --- Docks ---
  buildDock(b, 20, 227, 0, 30, 4, 1.45, true);
  // Moored rowboat on the beach
  b.add(new THREE.BoxGeometry(1.2, 0.5, 2.6), 'woodDark', 12, g(12, 236) + 0.2, 236, 0.3);
  b.add(new THREE.BoxGeometry(0.9, 0.08, 2.0), 'woodLight', 12, g(12, 236) + 0.38, 236, 0.3);

  // --- The “Colibrí de Mar” (damaged caravel) beside the pier ---
  // Built into its own group & collider prefix so it can be swapped for the
  // fully simulated ship the day the repairs are done.
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
  // --- Dynamic props ---
  const torches = new TorchSystem(scene, 4);
  const torchSpots: Array<[number, number]> = [
    [13, 141], [27, 141], [13, 158], [27, 158],
    [20, 180], [20, 205], [17, 228], [23, 228],
    [18, 252], [22, 252], [9, 173], [33, 216],
  ];
  for (const [tx, tz] of torchSpots) {
    torches.addTorchPost(tx, g(tx, tz), tz, colliders);
  }
  createSignpost(15, g(15, 163), 163, 0.4, [], scene);

  // Eirik's sea chest beside the warehouse west wall (under the eave)
  const chestX = 28.5, chestZ = 217.5;
  const eirikChest = createChest(chestX, g(chestX, chestZ), chestZ, Math.PI / 2, scene, colliders);

  return {
    spawnPoint: new THREE.Vector3(21, 0, 244),
    eirikChest,
    eirikChestPos: new THREE.Vector3(chestX, g(chestX, chestZ), chestZ),
    shipPos: new THREE.Vector3(shipX, 0, shipZ),
    shipDeck: new THREE.Vector3(shipX, 1.0, shipZ + 5),
    staticShip,
    setStaticShip,
    mainGroup: group,
    warehouseDoor: new THREE.Vector3(31, g(31, 212), 212),
    tavernDoor: new THREE.Vector3(9.5, g(9.5, 170), 170),
    smithyForge: forgePos,
    marenHut: new THREE.Vector3(9, g(9, 203), 203),
    squareCenter: new THREE.Vector3(20, g(20, 150), 150),
    wellPos: new THREE.Vector3(20, g(20, 148), 148),
    torches,
  };
}
