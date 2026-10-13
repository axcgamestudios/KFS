import * as THREE from 'three';
import { StaticBuilder } from './Materials';

/**
 * Fase 16 — SISTEMA DE COMERCIANTES: the smithies.
 *
 * Two establishments built in WHITE CONCRETE (the new PBR set) with timber:
 *  · Torvald's standard smithy by the castle road.
 *  · Borin's dwarf forge deep in the western woods — shorter, wider, gilded.
 *
 * All geometry goes through the shared StaticBuilder (merged draw calls +
 * registered colliders): walls are solid, the awning is decorative, the
 * forge glows at night. Returns the anchor points Game needs (anvil, forge).
 */

export interface SmithyLayout {
  x: number;
  z: number;
  /** Yaw the whole plot faces (radians; 0 = +Z). */
  yaw: number;
  anvilPos: THREE.Vector3;
  forgePos: THREE.Vector3;
}

export function buildSmithy(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
  opts: { x: number; z: number; yaw?: number; dwarf?: boolean },
): SmithyLayout {
  const { x: cx, z: cz } = opts;
  const yaw = opts.yaw ?? 0;
  const dwarf = opts.dwarf === true;
  const g = (px: number, pz: number) => terrain.height(px, pz);
  const gy = g(cx, cz);

  // local -> world with the plot yaw (so both smithies can face their road)
  const W = (lx: number, lz: number): [number, number] => {
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    return [cx + lx * c + lz * s, cz - lx * s + lz * c];
  };

  // Dwarf proportions: the whole plot is ~0.88 scale and stockier
  const S = dwarf ? 0.88 : 1;
  const wallH = 3.0 * S + (dwarf ? 0 : 0.5);
  const halfW = 3.4 * S;
  const halfD = 4.2 * S;

  // --- White-concrete floor slab (non-collide; the terrain is the ground) ---
  const [fx, fz] = W(0, 0);
  b.box('concreteWhite', halfW * 2 + 0.4, 0.14, halfD * 2 + 0.4, fx, gy + 0.07, fz, yaw);

  // --- Back wall + side walls (solid: the player cannot walk through) ---
  const [bx, bz] = W(0, -halfD);
  b.solidBox('concreteWhite', halfW * 2 + 0.4, wallH, 0.36, bx, gy + wallH / 2 + 0.1, bz, yaw);
  const [lx1, lz1] = W(-halfW, 0);
  b.solidBox('concreteWhite', 0.36, wallH, halfD * 2, lx1, gy + wallH / 2 + 0.1, lz1, yaw);
  const [lx2, lz2] = W(halfW, 0);
  b.solidBox('concreteWhite', 0.36, wallH, halfD * 2, lx2, gy + wallH / 2 + 0.1, lz2, yaw);

  // Dwarf smithies get a stone skirt + gold course at the top
  if (dwarf) {
    b.box('stoneDark', halfW * 2 + 0.6, 0.5, 0.5, bx, gy + 0.3, bz - 0.05, yaw);
    b.box('gold', halfW * 2 + 0.5, 0.1, 0.44, bx, gy + wallH + 0.12, bz, yaw);
  }

  // --- Timber roof: two sloped panels meeting at the ridge ---
  const roofY = gy + wallH + 0.55;
  const pitch = dwarf ? 0.5 : 0.42;
  const [r1x, r1z] = W(0, -halfD * 0.5);
  b.add(
    new THREE.BoxGeometry(halfW * 2 + 1.1, 0.14, halfD + 1.1),
    dwarf ? 'gold' : 'woodDark',
    r1x, roofY - pitch * 0.5 + 0.25, r1z,
    yaw, 1, 1, 1, 0, pitch,
  );
  const [r2x, r2z] = W(0, halfD * 0.5);
  b.add(
    new THREE.BoxGeometry(halfW * 2 + 1.1, 0.14, halfD + 1.1),
    dwarf ? 'gold' : 'woodDark',
    r2x, roofY - pitch * 0.5 - 0.05, r2z,
    yaw, 1, 1, 1, 0, -pitch,
  );

  // Front posts holding the open workshop mouth
  const [p1x, p1z] = W(-halfW, halfD);
  b.cylinder('timber', 0.09, 0.11, wallH + 0.6, 6, p1x, gy + (wallH + 0.6) / 2, p1z);
  const [p2x, p2z] = W(halfW, halfD);
  b.cylinder('timber', 0.09, 0.11, wallH + 0.6, 6, p2x, gy + (wallH + 0.6) / 2, p2z);

  // --- The forge, against the back wall: stone block + glowing heart ---
  const fgx = dwarf ? -1.1 : -1.3;
  const [fgwx, fgwz] = W(fgx, -halfD + 0.75);
  const forgeW = 1.5 * S + 0.3;
  b.solidBox('stoneDark', forgeW, 1.05 * S + 0.35, forgeW, fgwx, gy + (1.05 * S + 0.35) / 2 + 0.12, fgwz, yaw);
  b.add(new THREE.BoxGeometry(forgeW * 0.62, 0.16, forgeW * 0.5), 'glow', fgwx, gy + 1.05 * S + 0.48, fgwz, yaw);
  // chimney
  const [chx, chz] = W(fgx, -halfD + 0.35);
  b.cylinder('stoneDark', 0.22, 0.3, 2.6, 6, chx, gy + wallH + 0.9, chz);
  // forge tools hanging by the heart
  b.box('metal', 0.08, 0.62, 0.08, fgwx + forgeW * 0.7, gy + 1.15 * S + 0.2, fgwz, yaw);

  // --- Anvil on a stump, out front where the smith works ---
  const ax0 = dwarf ? 1.15 : 1.35;
  const [awx, awz] = W(ax0, halfD - 1.35);
  b.addCylinderCollider(awx, awz, 0.5, gy, gy + 0.62);
  b.cylinder('timber', 0.34, 0.38, 0.6, 8, awx, gy + 0.3, awz);
  b.box('metal', 0.96, 0.26, 0.5, awx, gy + 0.72, awz, yaw);        // anvil body
  b.add(new THREE.BoxGeometry(0.3, 0.16, 0.42), 'metal', awx - Math.cos(yaw) * 0.5, gy + 0.78, awz + Math.sin(yaw) * 0.5, yaw); // horn

  // --- Weapon rack by the open front ---
  const [wrx, wrz] = W(halfW - 0.55, halfD - 0.9);
  b.cylinder('woodDark', 0.06, 0.07, 1.5, 5, wrx, gy + 0.75, wrz);
  b.box('woodDark', 0.72, 0.09, 0.12, wrx, gy + 1.42, wrz, yaw);
  for (let i = 0; i < 3; i++) {
    const off = -0.24 + i * 0.24;
    const [sox, soz] = W(halfW - 0.55 + off, halfD - 0.9);
    b.box('metal', 0.07, 1.05, 0.03, sox, gy + 0.9, soz, yaw + (i - 1) * 0.09);
  }

  // --- Odds & ends: crates, a quench barrel, sparks basin ---
  const [crx, crz] = W(-halfW + 0.8, halfD - 1.0);
  b.solidBox('wood', 0.8, 0.8, 0.8, crx, gy + 0.4, crz, yaw + 0.2);
  const [qbx, qbz] = W(halfW - 0.5, -0.6);
  b.addCylinderCollider(qbx, qbz, 0.42, gy, gy + 0.66);
  b.cylinder('wood', 0.42, 0.36, 0.66, 10, qbx, gy + 0.33, qbz);
  b.cylinder('metal', 0.34, 0.34, 0.06, 10, qbx, gy + 0.68, qbz); // water rim

  return {
    x: cx,
    z: cz,
    yaw,
    anvilPos: new THREE.Vector3(awx, gy, awz),
    forgePos: new THREE.Vector3(fgwx, gy, fgwz),
  };
}
