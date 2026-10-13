import * as THREE from 'three';
import { StaticBuilder } from './Materials';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import { mulberry32 } from '../core/MathUtils';

/**
 * Fase 15 — EL OMBLIGO DEL MAR (476, 476).
 *
 * The special island at the exact center of the open ocean where the world
 * boss "El Rey del Mar" can be summoned. A basalt needle ringed by abyss,
 * crowned by a circle of spiral-carved monoliths, the ribs of a leviathan
 * and the Horn Altar itself.
 */

export interface NavelRefs {
  /** Summit plateau group (streamed like every other far structure). */
  group: THREE.Group;
  x: number;
  z: number;
  r: number;
  /** Where the summon interactable lives (altar top). */
  altarPos: THREE.Vector3;
  /** Summon ring where the King breaches the surface. */
  spawnRing: { x: number; z: number; r: number };
}

export function buildNavelIsland(
  scene: THREE.Scene,
  terrain: TerrainHeight,
  colliders: ColliderRegistry,
): NavelRefs {
  const cx = 476;
  const cz = 476;
  const rand = mulberry32(151515);
  const g = (x: number, z: number) => terrain.height(x, z);
  const b = new StaticBuilder(colliders, 'ombligo');

  // --- Spiral causeway stones from the beach up to the plateau ---
  for (let i = 0; i < 14; i++) {
    const a = i * 0.72;
    const r = 52 - i * 1.8;
    const sx = cx + Math.cos(a) * r;
    const sz = cz + Math.sin(a) * r;
    const sy = g(sx, sz);
    if (sy < 0.4) continue;
    b.cylinder('cobble', 0.55 + rand() * 0.25, 0.62 + rand() * 0.2, 0.3, 7, sx, sy + 0.12, sz);
  }

  // --- Ring of 7 basalt monoliths (spiral-carved watchers) ---
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.35;
    const mx = cx + Math.cos(a) * 15.5;
    const mz = cz + Math.sin(a) * 15.5;
    const my = g(mx, mz);
    const h = 4.6 + rand() * 2.4;
    const tilt = (rand() - 0.5) * 0.16;
    b.cylinder('stoneDark', 0.55, 0.72, h, 6, mx, my + h / 2, mz, true);
    b.addCylinderCollider(mx, mz, 0.72, my, my + h);
    // Carved spiral inlay (rune glow) on the sea-facing face
    b.add(new THREE.TorusGeometry(0.34, 0.055, 5, 12, Math.PI * 1.5), 'rune',
      mx - Math.cos(a) * 0.62, my + h * 0.62, mz - Math.sin(a) * 0.62,
      -a + Math.PI / 2, 1, 1, 1, tilt);
    // Crown stone
    b.add(new THREE.BoxGeometry(1.35, 0.4, 1.0), 'stoneDark', mx, my + h + 0.2, mz, -a);
  }

  // --- Leviathan ribs arcing out of the rock (two half-cages) ---
  const rib = (bx: number, bz: number, baseA: number, scale: number) => {
    const by = g(bx, bz);
    for (let i = 0; i < 5; i++) {
      const a = baseA + (i - 2) * 0.28;
      const len = (5.2 - Math.abs(i - 2) * 1.15) * scale;
      const rx = bx + Math.cos(a) * 1.1;
      const rz = bz + Math.sin(a) * 1.1;
      b.add(new THREE.CylinderGeometry(0.09 * scale, 0.13 * scale, len, 6), 'bone',
        rx, by + len * 0.34, rz,
        a + Math.PI / 2, 1, 1, 1, Math.cos(a) * 0.5, 0);
      // (rotZ/rotX tilt the rib outward from its base arc)
    }
  };
  rib(cx - 9, cz + 7, 0.6, 1.15);
  rib(cx + 8.5, cz - 8, 2.9, 1.0);

  // --- Half-buried leviathan skull (dome + eye sockets + jaw) ---
  {
    const kx = cx + 10.5, kz = cz + 6.5;
    const ky = g(kx, kz);
    b.add(new THREE.SphereGeometry(1.9, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), 'bone', kx, ky + 0.5, kz, 0.2);
    // Eye sockets
    for (const s of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.42, 7, 6), 'stoneDark',
        kx + s * 0.85, ky + 1.05, kz - 1.15, 0.3);
    }
    // Broken tusk
    b.add(new THREE.CylinderGeometry(0.1, 0.2, 1.5, 6), 'bone', kx + 1.6, ky + 0.6, kz - 1.0, 0.5, 0, 0.4);
  }

  // --- The Horn Altar: stepped dark platform with a horn-shaped basin ---
  const ay = g(cx, cz); // plateau ≈ 12.3
  b.cylinder('stoneDark', 4.6, 5.2, 0.9, 12, cx, ay + 0.45, cz);
  b.cylinder('stone', 3.2, 3.5, 0.85, 12, cx, ay + 1.3, cz);
  b.cylinder('cobble', 2.0, 2.2, 0.7, 12, cx, ay + 2.05, cz);
  // Horn basin: a curved conch carved into the top (a torus arc + core)
  b.add(new THREE.TorusGeometry(0.85, 0.3, 8, 16, Math.PI * 1.35), 'bone',
    cx, ay + 2.5, cz, 0.5, 1, 1, 1, -Math.PI / 2, 0);
  b.cylinder('rune', 0.5, 0.62, 0.5, 9, cx, ay + 2.42, cz);
  // Spiral glyph ring around the altar top
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(0.3, 0.07, 0.12), 'rune',
      cx + Math.cos(a) * 2.6, ay + 2.44, cz + Math.sin(a) * 2.6, -a);
  }
  // Four offering bowls at the cardinal points (rune-lit water)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.cylinder('stone', 0.42, 0.5, 0.34, 8, cx + Math.cos(a) * 6.2, ay + 0.35, cz + Math.sin(a) * 6.2);
    b.cylinder('rune', 0.26, 0.3, 0.1, 8, cx + Math.cos(a) * 6.2, ay + 0.56, cz + Math.sin(a) * 6.2);
  }

  // --- Driftwood torch posts around the plateau edge (lit at dusk by braziers) ---
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 1.1;
    const tx = cx + Math.cos(a) * 10.5;
    const tz = cz + Math.sin(a) * 10.5;
    const ty = g(tx, tz);
    b.cylinder('woodDark', 0.09, 0.12, 1.7, 5, tx, ty + 0.85, tz);
    b.add(new THREE.BoxGeometry(0.34, 0.3, 0.34), 'glow', tx, ty + 1.8, tz);
    b.addCylinderCollider(tx, tz, 0.16, ty, ty + 1.7);
  }

  const group = new THREE.Group();
  b.build(group, { shadows: true });
  scene.add(group);

  return {
    group,
    x: cx,
    z: cz,
    r: 68,
    altarPos: new THREE.Vector3(cx, ay + 2.7, cz),
    spawnRing: { x: cx, z: cz, r: 96 },
  };
}
