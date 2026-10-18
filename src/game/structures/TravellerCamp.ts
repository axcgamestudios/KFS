import * as THREE from 'three';
import { StaticBuilder } from './Materials';

/**
 * Fase 28 — EL VIAJERO: the three camps of the old trade circuit.
 *
 * The Traveller walks the island anti-clockwise: one day at each stop,
 * then the next. The camps stay where they are — you will find them
 * empty on his off-days, which is how you learn the route.
 *
 * Each camp: a stone-ringed fire with a log heart, a bedroll, a lashed
 * trade crate under a canvas tarp, a banner-post flying his mark, and a
 * couple of clay jugs. Everything through StaticBuilder; the crate and
 * the fire ring collide, the thin post does not.
 */

export interface TravellerStop {
  name: string;
  x: number;
  z: number;
}

/** The circuit (dayCount % 3 picks the stop he is at TODAY). */
export const TRAVELLER_STOPS: TravellerStop[] = [
  { name: 'El Cruce del Castillo', x: 58, z: 100 },   // the castle-road crossing, by Torvald's hill
  { name: 'La Costa del Naufragio', x: -318, z: 190 }, // the west wreck coast
  { name: 'Las Piedras del Santuario', x: 150, z: 272 }, // the sanctuary stones, by Sister Ysolt
];

export interface CampLayout {
  pos: THREE.Vector3;
}

/** Build ONE camp (call three times — each needs its own streamer group). */
export function buildTravellerCamp(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
  at: { x: number; z: number; yaw?: number },
): CampLayout {
  const { x, z } = at;
  const yaw = at.yaw ?? 0.55;
  const gy = terrain.height(x, z);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const W = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];

  // ---- the fire: stone ring + log heart (the heart collides) ----
  const [fx, fz] = W(0, 0);
  b.solidBox('woodDark', 0.55, 0.26, 0.55, fx, gy + 0.13, fz, yaw + 0.7); // crossed logs, one solid heart
  b.box('wood', 0.66, 0.1, 0.13, fx, gy + 0.2, fz, yaw + 0.7);
  b.box('wood', 0.66, 0.1, 0.13, fx, gy + 0.2, fz, yaw - 0.7);
  b.cylinder('ember', 0.17, 0.17, 0.05, 8, fx, gy + 0.27, fz, 0);       // the banked ember
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const sx = fx + Math.cos(a) * 0.52;
    const sz = fz + Math.sin(a) * 0.52;
    b.cylinder('stone', 0.13, 0.16, 0.17, 7, sx, gy + 0.09, sz, a);     // ring stones (no collider)
  }

  // ---- the bedroll, west of the fire ----
  const [bx, bz] = W(-1.35, 0.15);
  b.box('clothRed', 1.95, 0.05, 1.05, bx, gy + 0.03, bz, yaw + 1.35);
  b.box('sail', 0.45, 0.12, 0.9, bx + Math.cos(yaw + 1.35) * 0.72, gy + 0.08, bz + Math.sin(yaw + 1.35) * 0.72, yaw + 1.35); // the pillow end

  // ---- the lashed trade crate under a canvas tarp, east of the fire ----
  const [cx, cz] = W(1.15, -0.35);
  b.solidBox('woodShip', 1.15, 0.62, 0.8, cx, gy + 0.31, cz, yaw - 0.25);
  b.box('clothGold', 1.26, 0.1, 0.92, cx, gy + 0.66, cz, yaw - 0.2);    // the tarp
  // lashing ropes
  b.box('steelDark', 1.3, 0.045, 0.05, cx, gy + 0.42, cz, yaw - 0.24);
  b.box('steelDark', 0.05, 0.045, 0.86, cx, gy + 0.5, cz, yaw - 0.24);
  // a spare jug on the crate
  const [jx, jz] = W(1.4, -0.62);
  b.cylinder('plaster', 0.07, 0.05, 0.16, 7, jx, gy + 0.78, jz, 0);

  // ---- the banner-post, behind the crate (thin: no collider) ----
  const [px, pz] = W(1.05, 0.75);
  b.box('woodDark', 0.09, 2.5, 0.09, px, gy + 1.25, pz, 0.08);
  const [tx, tz] = W(1.05, 1.05);
  b.box('woodDark', 0.07, 0.07, 0.62, tx, gy + 2.44, tz, yaw);
  // the banner: his mark — a quartered field, saltire, three dots (the road)
  b.box('clothRed', 0.78, 1.25, 0.045, tx + Math.sin(yaw) * 0.32, gy + 1.86, tz + Math.cos(yaw) * 0.32, yaw);
  b.box('sail', 0.5, 0.05, 0.05, tx + Math.sin(yaw) * 0.32, gy + 2.22, tz + Math.cos(yaw) * 0.32, yaw); // the pale
  for (const dyy of [2.0, 1.78, 1.56]) {
    b.box('sail', 0.07, 0.07, 0.05, tx + Math.sin(yaw) * 0.34, gy + dyy, tz + Math.cos(yaw) * 0.34, yaw); // the three dots
  }

  // ---- the clay jugs by the bedroll ----
  b.cylinder('plaster', 0.08, 0.06, 0.2, 7, bx - Math.cos(yaw + 1.35) * 0.95, gy + 0.1, bz + Math.sin(yaw + 1.35) * 0.95, 0);
  b.cylinder('plasterWarm', 0.06, 0.05, 0.15, 7, bx - Math.cos(yaw + 1.35) * 1.18, gy + 0.08, bz + Math.sin(yaw + 1.35) * 1.18, 0);

  return { pos: new THREE.Vector3(x, gy, z) };
}
