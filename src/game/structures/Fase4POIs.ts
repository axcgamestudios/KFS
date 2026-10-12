import * as THREE from 'three';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import { StaticBuilder, MAT } from './Materials';
import type { AssetSystem } from '../world/AssetSystem';
import { mulberry32 } from '../core/MathUtils';

/**
 * Fase 4 world structures:
 *  - Santuario de Thalassar (sunken ruins + emergent altar)
 *  - Cala del Silencio (crow cove: knight statue GLB + black altar)
 *  - El Bajío del Almirante (flagship wreck GLB, beached)
 *  - El Gran Arce (landmark maple GLB + glade)
 *  - Establo de Halvard (village stable)
 */

export interface Fase4Refs {
  santuarioPos: THREE.Vector3;
  altarThalassarPos: THREE.Vector3;
  altarCuervoPos: THREE.Vector3;
  altarMareaPos: THREE.Vector3;
  flagshipPos: THREE.Vector3;
  granArcePos: THREE.Vector3;
  stablePos: THREE.Vector3;
  knightPos: THREE.Vector3;
  digPos: THREE.Vector3;
  fishSpots: THREE.Vector3[];
  wildHorses: Array<{ id: string; pos: THREE.Vector3 }>;
  /** Groups for the distance streamer. */
  groups: Array<{ group: THREE.Group; x: number; z: number; r: number }>;
}

/** Normalize a loaded GLB to a target dimension. */
function fitToSize(obj: THREE.Object3D, target: number, axis: 'y' | 'x' | 'z' = 'y'): number {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const len = axis === 'y' ? size.y : axis === 'x' ? size.x : size.z;
  if (len <= 0.0001) return 1;
  const k = target / len;
  obj.scale.multiplyScalar(k);
  return k;
}

export function buildFase4World(
  scene: THREE.Scene,
  terrain: TerrainHeight,
  colliders: ColliderRegistry,
  assets: AssetSystem,
): Fase4Refs {
  const groups: Fase4Refs['groups'] = [];

  // ================= 1. SANTUARIO DE THALASSAR (160, 270) =================
  // Sunken colonnade (seabed ≈ -4.6 m) with one white altar breaking the surface.
  const sx = 160;
  const sz = 270;
  const santuarioPos = new THREE.Vector3(sx, terrain.height(sx, sz), sz);
  const altarThalassarPos = new THREE.Vector3(sx, 0.65, sz);
  {
    const b = new StaticBuilder(colliders, 'santuario');
    const rand = mulberry32(2024);
    // Colonnade ring: 10 columns, some broken
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const cx = sx + Math.cos(a) * 13;
      const cz = sz + Math.sin(a) * 13;
      const base = terrain.height(cx, cz);
      const broken = rand() < 0.45;
      const h = broken ? 1.4 + rand() * 2.2 : 6.4;
      b.cylinder('stoneMoss', 0.62, 0.72, h, 9, cx, base + h / 2 + 0.3, cz);
      if (!broken) {
        b.box('stoneMoss', 1.7, 0.42, 1.7, cx, base + h + 0.55, cz, a);
      }
      // Capital glow: a rune ring on the seabed
      if (i % 3 === 0) {
        b.cylinder('rune', 0.9, 0.9, 0.08, 9, cx, base + 0.34, cz);
      }
    }
    // Arch fragments on the seabed
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2;
      const r = 5 + rand() * 8;
      const cx = sx + Math.cos(a) * r;
      const cz = sz + Math.sin(a) * r;
      const base = terrain.height(cx, cz);
      b.box('stoneMoss', 1.6 + rand() * 1.6, 0.5, 0.9, cx, base + 0.35, cz, rand() * 3);
    }
    // The emergent altar: a stepped platform that breaks the surface
    const alt = terrain.height(sx, sz); // ≈ -4.6
    b.cylinder('stone', 3.4, 3.8, 1.2, 12, sx, alt + 1.0, sz);
    b.cylinder('stone', 2.4, 2.6, 0.9, 12, sx, alt + 2.0, sz);
    b.cylinder('cobble', 1.5, 1.6, 0.75, 12, sx, alt + 2.8, sz);
    // The crown basin (glowing rune inlay)
    b.cylinder('rune', 0.62, 0.62, 0.14, 10, sx, alt + 3.22, sz);
    // Three relic niches carved on the altar
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      b.box('gold', 0.34, 0.2, 0.34,
        sx + Math.cos(a) * 1.1, alt + 3.2, sz + Math.sin(a) * 1.1, a);
    }
    const g = new THREE.Group();
    b.build(g, { shadows: true });
    scene.add(g);
    groups.push({ group: g, x: sx, z: sz, r: 60 });
  }

  // ================= 2. CALA DEL SILENCIO (-398, -450) =================
  // Black-basalt cove: braziers, raven bones, the knight statue & the black altar.
  const kx = -398;
  const kz = -450;
  const knightPos = new THREE.Vector3(kx + 9, terrain.height(kx + 9, kz - 2), kz - 2);
  const altarCuervoPos = new THREE.Vector3(kx, terrain.height(kx, kz) + 1.05, kz);
  {
    const b = new StaticBuilder(colliders, 'cala');
    const rand = mulberry32(4321);
    // Ring of broken basalt teeth
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const cx = kx + Math.cos(a) * 17;
      const cz = kz + Math.sin(a) * 17;
      const base = terrain.height(cx, cz);
      const h = 1.2 + rand() * 3.4;
      b.cylinder('stoneDark', 0.5 + rand() * 0.5, 0.9 + rand() * 0.6, h, 6, cx, base + h / 2, cz);
    }
    // The black altar: obsidian monolith with three basins
    const base = terrain.height(kx, kz);
    b.cylinder('stoneDark', 2.6, 3.0, 0.9, 8, kx, base + 0.45, kz);
    b.cylinder('stoneDark', 1.7, 1.9, 1.1, 8, kx, base + 1.4, kz);
    b.box('stoneDark', 2.2, 0.16, 2.2, kx, base + 1.98, kz, Math.PI / 8);
    // Three basins (sello / corona / corazón)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      b.cylinder('rune', 0.3, 0.3, 0.1, 8,
        kx + Math.cos(a) * 0.95, base + 2.08, kz + Math.sin(a) * 0.95);
    }
    // Scattered bones & rusted helms of those who came before
    for (let i = 0; i < 8; i++) {
      const a = rand() * Math.PI * 2;
      const r = 6 + rand() * 9;
      const cx = kx + Math.cos(a) * r;
      const cz = kz + Math.sin(a) * r;
      const gy = terrain.height(cx, cz);
      if (rand() < 0.5) {
        b.cylinder('bone', 0.06, 0.06, 0.8 + rand() * 0.7, 5, cx, gy + 0.06, cz, false);
      } else {
        b.box('metal', 0.34, 0.24, 0.3, cx, gy + 0.12, cz, rand() * 3);
      }
    }
    // Pedestal for the knight statue
    b.box('stoneDark', 2.6, 0.5, 2.6, knightPos.x, knightPos.y + 0.25, knightPos.z, 0.5);
    b.addBoxCollider(knightPos.x, knightPos.y + 0.25, knightPos.z, 2.6, 0.5, 2.6, 0.5);
    const g = new THREE.Group();
    b.build(g, { shadows: true });
    scene.add(g);
    groups.push({ group: g, x: kx, z: kz, r: 55 });

    // Knight statue (from the asset repository) — async load
    assets.loadModel('knight_statue.glb').then((knight) => {
      fitToSize(knight, 2.9, 'y');
      // Materials tweak: pale weathered stone look
      knight.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial;
            if (std.color) std.color.lerp(new THREE.Color(0x8f9a94), 0.55);
            std.roughness = 0.92;
            std.metalness = 0.05;
            std.needsUpdate = true;
          }
        }
      });
      knight.position.set(knightPos.x, knightPos.y + 0.5, knightPos.z);
      knight.rotation.y = Math.PI * 1.25; // facing the sea
      scene.add(knight);
    }).catch(() => {
      // Fallback: a procedural stone knight silhouette
      const fb = new StaticBuilder(colliders, 'knightfb');
      fb.cylinder('stoneMoss', 0.34, 0.42, 1.15, 8, knightPos.x, knightPos.y + 1.07, knightPos.z);
      fb.box('stoneMoss', 0.5, 0.55, 0.4, knightPos.x, knightPos.y + 1.85, knightPos.z, 0.4);
      fb.box('stoneMoss', 0.12, 1.1, 0.12, knightPos.x + 0.3, knightPos.y + 1.5, knightPos.z + 0.1, 0.5);
      const fg = new THREE.Group();
      fb.build(fg, { shadows: true });
      scene.add(fg);
    });
  }

  // ================= 3. EL BAJÍO DEL ALMIRANTE (-360, -490) =================
  // The Crow's flagship, beached forever on the reef.
  const fx = -360;
  const fz = -490;
  const flagshipPos = new THREE.Vector3(fx, terrain.height(fx, fz), fz);
  {
    assets.loadModel('pirate_ship.glb').then((ship) => {
      fitToSize(ship, 46, 'z'); // ~46 m long flagship
      ship.position.set(fx, flagshipPos.y + 0.4, fz);
      ship.rotation.y = 2.35;   // bow towards the cove
      ship.rotation.z = 0.16;   // beached list
      ship.rotation.x = 0.05;
      scene.add(ship);
    }).catch(() => {
      // Fallback: broken hull silhouette
      const fb = new StaticBuilder(colliders, 'flagfb');
      fb.cylinder('woodPirate', 2.6, 3.6, 20, 10, fx, flagshipPos.y + 1.2, fz, true);
      const fg = new THREE.Group();
      fb.build(fg, { shadows: true });
      scene.add(fg);
    });
    // A rusted anchor chain & salvage crates around the wreck
    const b = new StaticBuilder(colliders, 'flagship');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.7;
      const cx = fx + Math.cos(a) * 12;
      const cz = fz + Math.sin(a) * 12;
      const gy = terrain.height(cx, cz);
      b.solidBox('woodPirate', 1.0, 1.0, 1.0, cx, gy + 0.5, cz, a);
    }
    const g = new THREE.Group();
    b.build(g, { shadows: true });
    scene.add(g);
    groups.push({ group: g, x: fx, z: fz, r: 50 });
  }

  // ================= 4. EL GRAN ARCE (-120, -270) =================
  const mx = -120;
  const mz = -270;
  const granArcePos = new THREE.Vector3(mx, terrain.height(mx, mz), mz);
  {
    // Glade ring of small stones + fireflies-like glow buds
    const b = new StaticBuilder(colliders, 'arce');
    const rand = mulberry32(777);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const cx = mx + Math.cos(a) * 8.5;
      const cz = mz + Math.sin(a) * 8.5;
      const gy = terrain.height(cx, cz);
      b.cylinder('stoneMoss', 0.3 + rand() * 0.2, 0.42, 0.5 + rand() * 0.4, 6, cx, gy + 0.28, cz);
    }
    const g = new THREE.Group();
    b.build(g, { shadows: true });
    scene.add(g);
    groups.push({ group: g, x: mx, z: mz, r: 45 });

    assets.loadModel('maple_tree.glb').then((tree) => {
      fitToSize(tree, 17, 'y');
      tree.position.set(mx, granArcePos.y - 0.3, mz);
      tree.rotation.y = 1.2;
      scene.add(tree);
    }).catch(() => {
      // Fallback: a big procedural golden canopy
      const fb = new StaticBuilder(colliders, 'arcefb');
      fb.cylinder('wood', 0.7, 1.3, 9, 9, mx, granArcePos.y + 4.5, mz);
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(6.4, 1),
        new THREE.MeshStandardMaterial({ color: 0xc99a34, roughness: 0.9, flatShading: true }),
      );
      crown.position.set(mx, granArcePos.y + 12.5, mz);
      crown.castShadow = true;
      (crown.material as THREE.MeshStandardMaterial).vertexColors = false;
      scene.add(crown);
    });
  }

  // ================= 5. ESTABLO DE HALVARD (34, 150) =================
  const stablePos = new THREE.Vector3(34, terrain.height(34, 150), 150);
  {
    const b = new StaticBuilder(colliders, 'establo');
    const [bx, bz] = [34, 150];
    const gy = stablePos.y;
    // Open stable: 6 posts + sloped roof + back wall
    for (const [px, pz] of [[-4.5, -3], [4.5, -3], [-4.5, 3], [4.5, 3], [-4.5, 0], [4.5, 0]] as Array<[number, number]>) {
      b.solidBox('timber', 0.3, 3.1, 0.3, bx + px, gy + 1.55, bz + pz, 0);
    }
    b.box('woodDark', 9.6, 0.22, 7.0, bx, gy + 3.2, bz, 0);
    b.box('roofThatch', 10.2, 0.16, 7.6, bx, gy + 3.42, bz, 0);
    b.box('wood', 9.4, 2.6, 0.24, bx, gy + 1.3, bz - 3.4, 0); // back wall
    // Feeding trough & hay
    b.solidBox('wood', 2.6, 0.5, 0.7, bx - 1.6, gy + 0.25, bz - 2.6, 0);
    b.box('roofThatch', 1.6, 0.5, 1.2, bx + 0.4, gy + 0.3, bz - 2.2, 0.4); // hay pile
    // Fence yard
    for (let i = 0; i < 9; i++) {
      const fz = bz + 5 + (i % 3);
      b.box('timber', 0.16, 1.2, 0.16, bx - 8 + i * 2, gy + 0.6, fz, 0);
    }
    b.box('timber', 16, 0.12, 0.12, bx, gy + 0.95, bz + 6.5, 0);
    b.box('timber', 16, 0.12, 0.12, bx, gy + 0.5, bz + 6.5, 0);
    // Sign
    b.box('wood', 1.4, 0.7, 0.08, bx + 5.6, gy + 1.6, bz + 4.6, 0.4);
    const g = new THREE.Group();
    b.build(g, { shadows: true });
    scene.add(g);
    groups.push({ group: g, x: bx, z: bz, r: 40 });
  }

  // ================= 6. TREASURE DIG SPOT (Faro plateau) =================
  const digPos = new THREE.Vector3(644, terrain.height(644, 142), 142);
  {
    const b = new StaticBuilder(colliders, 'dig');
    // Two crossed planks marking the X + a half-buried pulley
    b.box('woodDark', 1.7, 0.14, 0.3, digPos.x, digPos.y + 0.1, digPos.z, 0.7);
    b.box('woodDark', 1.7, 0.14, 0.3, digPos.x, digPos.y + 0.1, digPos.z, 0.7 + Math.PI / 2);
    b.cylinder('metal', 0.3, 0.3, 0.18, 8, digPos.x + 1.1, digPos.y + 0.1, digPos.z + 0.9, false);
    const g = new THREE.Group();
    b.build(g, { shadows: true });
    scene.add(g);
    groups.push({ group: g, x: digPos.x, z: digPos.z, r: 30 });
  }

  // ================= 7. FISH SPOTS (stranded catch) =================
  const fishSpots: THREE.Vector3[] = [];
  {
    const spots: Array<[number, number]> = [
      [26, 262],   // by the home pier
      [-320, 188], // west wreck coast
      [150, 236],  // NE bay shore
      [-60, 244],  // SW shore
    ];
    const b = new StaticBuilder(colliders, 'pesca');
    for (const [i, [fxp, fzp]] of spots.entries()) {
      const gy = terrain.height(fxp, fzp);
      if (gy < 0.3) continue; // must be on the sand
      fishSpots.push(new THREE.Vector3(fxp, gy, fzp));
      // Two small silver fish on the sand
      for (let k = 0; k < 2; k++) {
        b.cylinder('metal', 0.05, 0.09, 0.5, 5, fxp + k * 0.4 - 0.2, gy + 0.07, fzp + k * 0.15, false);
      }
      void i;
    }
    const g = new THREE.Group();
    b.build(g, { shadows: true });
    scene.add(g);
  }

  // Wild horse spawn meadows (probed: flat, grassy)
  const wildHorses = [
    { id: 'potro_norte', pos: new THREE.Vector3(-50, terrain.height(-50, -100), -100) },
    { id: 'potro_oeste', pos: new THREE.Vector3(-250, terrain.height(-250, -190), -190) },
  ];

  // Altar de la Marea — placed at the Ancestro's nest (Nido FLAT 20,-300)
  const altarMareaPos = new THREE.Vector3(20, terrain.height(20, -300) + 1.15, -300);
  {
    const b = new StaticBuilder(colliders, 'altarmarea');
    const [ax, az] = [20, -300];
    const ay = terrain.height(ax, az);
    b.cylinder('stone', 2.2, 2.6, 1.0, 10, ax, ay + 0.5, az);
    b.cylinder('cobble', 1.4, 1.5, 0.5, 10, ax, ay + 1.2, az);
    b.cylinder('rune', 0.8, 0.8, 0.12, 10, ax, ay + 1.48, az);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.box('gold', 0.3, 0.18, 0.3, ax + Math.cos(a) * 0.85, ay + 1.44, az + Math.sin(a) * 0.85, a);
    }
    const g = new THREE.Group();
    b.build(g, { shadows: true });
    scene.add(g);
    groups.push({ group: g, x: ax, z: az, r: 45 });
  }

  return {
    santuarioPos,
    altarThalassarPos,
    altarCuervoPos,
    altarMareaPos,
    flagshipPos,
    granArcePos,
    stablePos,
    knightPos,
    digPos,
    fishSpots,
    wildHorses,
    groups,
  };
}
