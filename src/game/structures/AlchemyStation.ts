import * as THREE from 'three';
import { StaticBuilder } from './Materials';

/**
 * Fase 28 — LA MESA DE ALQUIMIA: Maren's distillation table.
 *
 * A heavy plank table on dark legs — lower shelf crowded with sealed
 * jars, an alembic-style brass boiler over an ember burner, a mortar, a
 * steel funnel, a bundle of drying herbs hanging from an end-post, and a
 * canvas sack of marsh-muck in the dirt beside it. Placed at the edge of
 * Maren's garden nook, facing the green.
 *
 * All geometry goes through StaticBuilder (merged draw calls + colliders).
 * Returns the WORLD anchor for the interactable prompt.
 */

export interface AlchemyLayout {
  /** Interactable anchor (feet of the table, world space). */
  pos: THREE.Vector3;
}

export function buildAlchemyTable(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
  at: { x: number; z: number; yaw?: number },
): AlchemyLayout {
  const { x, z } = at;
  const yaw = at.yaw ?? 0.8;
  const gy = terrain.height(x, z);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const W = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];

  // ---- the body: a low solid base (the under-shelf) + the plank ----
  // one collider for the whole table (you cannot walk through it)
  const [bx, bz] = W(0, 0);
  b.solidBox('woodDark', 2.1, 0.55, 0.92, bx, gy + 0.28, bz, yaw);
  // the working plank, a hand-span above the base's top
  const [px, pz] = W(0, 0);
  b.box('woodLight', 2.35, 0.09, 1.08, px, gy + 0.94, pz, yaw);
  // four legs from the plank down to the dirt
  for (const [lx, lz] of [[-1.0, -0.4], [1.0, -0.4], [-1.0, 0.4], [1.0, 0.4]] as const) {
    const [lx2, lz2] = W(lx, lz);
    b.box('woodDark', 0.12, 0.4, 0.12, lx2, gy + 0.72, lz2, yaw);
  }

  // ---- the boiler: brass pot over an ember burner (right side) ----
  const [wx, wz] = W(0.55, 0.05);
  b.box('steel', 0.34, 0.05, 0.34, wx, gy + 0.99, wz, yaw);            // burner plate
  b.cylinder('ember', 0.1, 0.1, 0.045, 6, wx, gy + 1.02, wz, 0);       // ember bed
  b.cylinder('gold', 0.17, 0.13, 0.24, 10, wx, gy + 1.15, wz, 0);      // brass pot
  b.cylinder('waterDeep', 0.13, 0.13, 0.03, 10, wx, gy + 1.27, wz, 0); // the brew, gently glowing
  // a little spout lip
  const [sx2, sz2] = W(0.72, 0.05);
  b.box('gold', 0.1, 0.05, 0.08, sx2, gy + 1.24, sz2, yaw);

  // ---- the mortar + funnel (left side) ----
  const [mx, mz] = W(-0.55, 0.12);
  b.cylinder('stoneLight', 0.09, 0.06, 0.12, 8, mx, gy + 1.05, mz, 0); // mortar
  b.cylinder('woodDark', 0.03, 0.035, 0.1, 6, mx, gy + 1.14, mz, 0);   // pestle standing in it
  const [fx, fz] = W(-0.55, -0.18);
  b.add(new THREE.CylinderGeometry(0.085, 0.015, 0.17, 9), 'steel', fx, gy + 1.06, fz, yaw); // funnel

  // ---- the under-shelf: sealed jars in a row ----
  const jarAt = (lx: number, lz: number, r: number, h: number) => {
    const [jx, jz] = W(lx, lz);
    b.cylinder('waterDeep', r, r, h, 8, jx, gy + 0.58 + h / 2, jz, 0);
    b.box('woodDark', r * 2 + 0.02, 0.035, r * 2 + 0.02, jx, gy + 0.58 + h + 0.02, jz, 0);
  };
  jarAt(-0.75, 0.26, 0.055, 0.16);
  jarAt(-0.55, 0.26, 0.07, 0.2);
  jarAt(-0.32, 0.26, 0.05, 0.13);
  jarAt(0.12, 0.26, 0.06, 0.17);
  jarAt(0.34, 0.26, 0.045, 0.12);

  // ---- the end-post with drying herbs ----
  const [hx, hz] = W(-1.28, 0);
  b.box('woodDark', 0.09, 1.35, 0.09, hx, gy + 0.68, hz, yaw);
  const [rx, rz] = W(-1.28, 0.34);
  b.box('woodDark', 0.08, 0.08, 0.5, rx, gy + 1.3, rz, yaw);
  b.box('leaf', 0.34, 0.4, 0.06, rx, gy + 1.05, rz, yaw); // the bundle
  // a coil of twine
  b.cylinder('plasterWarm', 0.05, 0.05, 0.03, 7, rx, gy + 0.84, rz, 0);

  // ---- the muck-sack in the dirt by the table ----
  const [kx, kz] = W(0.9, 0.85);
  b.box('clothGold', 0.42, 0.34, 0.42, kx, gy + 0.17, kz, yaw + 0.4);

  return { pos: new THREE.Vector3(bx, gy, bz) };
}
