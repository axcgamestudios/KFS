import * as THREE from 'three';
import { StaticBuilder } from './Materials';

/**
 * Fase 22 — THE FORGE OF LEGENDS: the three stations in the world.
 *
 *  · THE GREAT ANVIL — beside Bram's forge in Crowhaven: a proper two-horn
 *    anvil on an oak stump, tool rack, quench barrel, spark light.
 *  · THE ALTAR OF THE GODS — the Circle of Vigils: a golden sun-disc altar
 *    on a stepped stone dais between the standing stones.
 *  · THE ANVIL OF THE TITANS — the Ancestor's Nest: a colossal anvil of
 *    black mountain iron, half-buried, taller than a man.
 *
 * All geometry goes through StaticBuilder (merged draw calls + colliders).
 * Each builder returns the WORLD anchor for the interactable prompt.
 */

export interface StationLayout {
  /** Interactable anchor (feet of the station, world space). */
  pos: THREE.Vector3;
}

export function buildGreatAnvil(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
  at: { x: number; z: number; yaw?: number },
): StationLayout {
  const { x, z } = at;
  const yaw = at.yaw ?? 0.6;
  const gy = terrain.height(x, z);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const W = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];

  // oak stump (solid — you cannot walk through the anvil)
  const [sx, sz] = W(0, 0);
  b.solidBox('woodDark', 0.72, 0.62, 0.72, sx, gy + 0.31, sz, yaw);

  // the anvil body: waist + face + horn (steel)
  const [ax, az] = W(0, 0);
  b.box('steel', 0.5, 0.3, 1.05, ax, gy + 0.77, az, yaw);          // face
  b.box('steel', 0.34, 0.28, 0.5, ax, gy + 0.5, az, yaw);          // waist
  b.box('steelDark', 0.6, 0.1, 0.9, ax, gy + 0.95, az, yaw);       // table
  // horn (tapered cone forward — tipped horizontal via rotX in the yawed frame)
  const [hx, hz] = W(0, 0.72);
  b.add(new THREE.CylinderGeometry(0.02, 0.14, 0.52, 7), 'steel', hx, gy + 0.84, hz, yaw, 1, 1, 1, 0, Math.PI / 2);
  // heel block
  const [tx, tz] = W(0, -0.62);
  b.box('steelDark', 0.34, 0.18, 0.3, tx, gy + 0.86, tz, yaw);

  // tool rack (crossbar on two posts, behind)
  const [r1x, r1z] = W(-0.8, -0.55);
  const [r2x, r2z] = W(0.8, -0.55);
  b.box('woodDark', 0.09, 1.5, 0.09, r1x, gy + 0.75, r1z, yaw);
  b.box('woodDark', 0.09, 1.5, 0.09, r2x, gy + 0.75, r2z, yaw);
  const [rbx, rbz] = W(0, -0.55);
  b.box('woodDark', 1.75, 0.1, 0.1, rbx, gy + 1.42, rbz, yaw);
  // hanging tongs + hammer (little steel drops)
  const [t1x, t1z] = W(-0.4, -0.55);
  b.box('steel', 0.06, 0.34, 0.06, t1x, gy + 1.22, t1z, yaw);
  const [t2x, t2z] = W(0.42, -0.55);
  b.box('steelDark', 0.1, 0.26, 0.1, t2x, gy + 1.26, t2z, yaw);

  // quench barrel (open cylinder look — solid so it blocks)
  const [qx, qz] = W(1.35, 0.35);
  b.cylinder('woodDark', 0.34, 0.3, 0.72, 9, qx, gy + 0.36, qz, 0);
  b.cylinder('waterDeep', 0.27, 0.27, 0.06, 9, qx, gy + 0.71, qz, 0);

  return { pos: new THREE.Vector3(ax, gy, az) };
}

export function buildAltarOfGods(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
  at: { x: number; z: number },
): StationLayout {
  const { x, z } = at;
  const gy = terrain.height(x, z);

  // stepped dais (three discs)
  b.cylinder('stone', 2.6, 2.6, 0.22, 12, x, gy + 0.11, z, 0);
  b.cylinder('stoneLight', 1.9, 1.9, 0.22, 12, x, gy + 0.33, z, 0.26);
  b.cylinder('stone', 1.25, 1.25, 0.2, 12, x, gy + 0.54, z, -0.18);

  // the altar table: two gold-trimmed stone blocks + the SUN DISC
  b.solidBox('stoneLight', 0.95, 0.16, 0.95, x, gy + 0.72, z, 0.35);
  b.box('gold', 1.0, 0.05, 1.0, x, gy + 0.81, z, 0.35);

  // sun disc: a gold cylinder on a short pillar, ringed by eight rays
  b.cylinder('stoneLight', 0.16, 0.2, 0.34, 8, x, gy + 1.0, z, 0);
  b.cylinder('gold', 0.62, 0.62, 0.09, 16, x, gy + 1.22, z, 0);
  b.cylinder('goldBright', 0.4, 0.4, 0.11, 16, x, gy + 1.23, z, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const rx = x + Math.cos(a) * 0.78;
    const rz = z + Math.sin(a) * 0.78;
    b.box('gold', 0.34, 0.07, 0.1, rx, gy + 1.22, rz, -a + Math.PI / 2);
  }
  // two flanking offering candles
  for (const dx of [-1.05, 1.05]) {
    b.cylinder('stoneLight', 0.14, 0.17, 0.5, 7, x + dx, gy + 0.86, z + 0.5, 0);
    b.cylinder('ember', 0.08, 0.08, 0.16, 6, x + dx, gy + 1.18, z + 0.5, 0);
  }

  return { pos: new THREE.Vector3(x, gy, z) };
}

export function buildAnvilOfTitans(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
  at: { x: number; z: number; yaw?: number },
): StationLayout {
  const { x, z } = at;
  const yaw = at.yaw ?? -0.4;
  const gy = terrain.height(x, z);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const W = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];

  // the base: a slab of black mountain iron, half-sunk and tilted
  b.solidBox('stoneDark', 4.4, 0.7, 3.2, x, gy + 0.3, z, yaw);

  // the colossal body: waist, face and horn — twice man-height
  const [wx, wz] = W(0, 0);
  b.box('stoneDark', 1.9, 1.15, 3.4, wx, gy + 1.25, wz, yaw);       // waist block
  b.box('steelDark', 2.3, 0.42, 4.1, wx, gy + 2.05, wz, yaw);       // the FACE
  // the horn: a great tapered wedge off the far end (horizontal in yaw frame)
  const [hx, hz] = W(0, 2.35);
  b.add(new THREE.CylinderGeometry(0.1, 0.62, 1.7, 7), 'steelDark', hx, gy + 2.02, hz, yaw, 1, 1, 1, 0, Math.PI / 2);
  // rivets along the face (deep steel studs — horizontal little cylinders)
  for (let i = -2; i <= 2; i++) {
    const [rx, rz] = W(i * 0.48, -1.85);
    b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 6), 'steel', rx, gy + 2.3, rz, yaw, 1, 1, 1, 0, Math.PI / 2);
  }
  // frost-claimed gold band around the waist (the Ancestor's hoard froze)
  const [gx, gz] = W(0, 0.9);
  b.box('gold', 2.0, 0.16, 0.5, gx, gy + 1.55, gz, yaw);

  // two whale-rib uprights framing the approach (the nest's motif)
  for (const side of [-1, 1]) {
    const [bx, bz] = W(side * 2.9, -1.2);
    b.cylinder('bone', 0.12, 0.2, 3.4, 7, bx, gy + 1.7, bz, side * 0.24);
  }

  return { pos: new THREE.Vector3(wx, gy, wz) };
}

/**
 * THE FIRST LIGHT CACHE — a small gilded reliquary hidden in the ruins of
 * the old lighthouse: the Primal Sun Essence rests here until taken.
 * (Visual only — the loot runs through the chest-style interactable.)
 */
export function buildFirstLightCache(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
  at: { x: number; z: number },
): StationLayout {
  const { x, z } = at;
  const gy = terrain.height(x, z);
  // a low stone pedestal + the gilded reliquary coffer
  b.solidBox('stoneLight', 0.66, 0.5, 0.66, x, gy + 0.25, z, 0.2);
  b.box('gold', 0.52, 0.34, 0.52, x, gy + 0.67, z, 0.2);
  b.box('goldBright', 0.56, 0.07, 0.56, x, gy + 0.87, z, 0.2);
  // the wick glow: a slim sun-spire above the lid
  b.cylinder('goldBright', 0.03, 0.07, 0.6, 6, x, gy + 1.2, z, 0);
  return { pos: new THREE.Vector3(x, gy, z) };
}
