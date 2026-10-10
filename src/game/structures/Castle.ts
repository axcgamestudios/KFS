import * as THREE from 'three';
import { StaticBuilder, MAT } from './Materials';
import { mulberry32 } from '../core/MathUtils';
import { WORLD } from '../world/WorldConfig';

/**
 * Castillo de Aldmor — curtain walls with crenellations, four towers,
 * a walkable gate arch, keep with great hall, courtyard props.
 */
export function buildCastle(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
): { gatePos: THREE.Vector3; dummyPos: THREE.Vector3 } {
  const cx = WORLD.castlePos.x - 5;
  const cz = WORLD.castlePos.z - 5;
  const rand = mulberry32(1312);

  const groundAt = (x: number, z: number) => terrain.height(x, z);
  const baseY = groundAt(cx, cz);

  // --- Curtain wall rectangle: x ∈ [x0,x1], z ∈ [z0,z1] ---
  const x0 = cx - 28, x1 = cx + 28, z0 = cz - 20, z1 = cz + 20;
  const wallH = 7.5, wallT = 2.0;

  const buildWall = (ax: number, az: number, bx: number, bz: number, skipGap?: [number, number]) => {
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
    const gy = groundAt(midX, midZ);
    if (skipGap) {
      // Two segments around a gap [t0,t1] measured as fraction along the wall
      const dirX = (bx - ax) / len, dirZ = (bz - az) / len;
      const seg = (from: number, to: number) => {
        if (to - from < 0.5) return;
        const sx = ax + dirX * len * from, sz = az + dirZ * len * from;
        const ex = ax + dirX * len * to, ez = az + dirZ * len * to;
        const mX = (sx + ex) / 2, mZ = (sz + ez) / 2;
        const sLen = len * (to - from);
        b.solidBox('stone', sLen, wallH, wallT, mX, groundAt(mX, mZ) + wallH / 2 - 0.4, mZ, Math.atan2(ex - sx, ez - sz));
        crenellate(mX, mZ, Math.atan2(ex - sx, ez - sz), sLen, groundAt(mX, mZ) + wallH - 0.4);
      };
      seg(0, skipGap[0]);
      seg(skipGap[1], 1);
    } else {
      b.solidBox('stone', len, wallH, wallT, midX, gy + wallH / 2 - 0.4, midZ, rot);
      crenellate(midX, midZ, rot, len, gy + wallH - 0.4);
    }
  };

  const crenellate = (midX: number, midZ: number, rot: number, len: number, topY: number) => {
    const dirX = Math.sin(rot), dirZ = Math.cos(rot);
    const n = Math.floor(len / 1.6);
    for (let i = 0; i <= n; i++) {
      if (i % 2 === 0) continue; // gaps between merlons
      const px = midX + dirX * (i / n - 0.5) * len;
      const pz = midZ + dirZ * (i / n - 0.5) * len;
      b.box('stoneDark', 0.8, 0.7, 0.55, px, topY + 0.35, pz, rot);
    }
  };

  // South wall with gate gap (gate spans local fraction 0.36..0.64)
  buildWall(x0, z1, x1, z1, [0.38, 0.62]);
  buildWall(x0, z0, x1, z0); // north
  buildWall(x0, z0, x0, z1); // west
  buildWall(x1, z0, x1, z1); // east

  // --- Corner towers ---
  const towerAt = (tx: number, tz: number, r: number, h: number) => {
    const gy = groundAt(tx, tz);
    b.cylinder('stone', r, r + 0.4, h, 10, tx, gy + h / 2 - 0.4, tz, true);
    b.addCylinderCollider(tx, tz, r + 0.2, gy - 1, gy + h);
    // Machicolation ring + crenellated top
    b.cylinder('stoneDark', r + 0.35, r + 0.35, 0.5, 10, tx, gy + h - 0.5, tz);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (i % 2 === 0) {
        b.box('stoneDark', 0.55, 0.6, 0.4, tx + Math.cos(a) * (r + 0.15), gy + h + 0.3, tz + Math.sin(a) * (r + 0.15), -a);
      }
    }
    // Conical roof + flag
    b.add(new THREE.ConeGeometry(r + 0.55, 3.4, 10), 'roofSlate', tx, gy + h + 2.4, tz);
    b.cylinder('woodDark', 0.06, 0.06, 2.2, 5, tx, gy + h + 3.6, tz);
    b.add(new THREE.BoxGeometry(1.3, 0.7, 0.06), 'clothRed', tx + 0.65, gy + h + 4.0, tz, 0);
  };
  towerAt(x0, z0, 3.6, 12);
  towerAt(x1, z0, 3.6, 12);
  towerAt(x0, z1, 3.4, 12);
  towerAt(x1, z1, 3.4, 12);

  // --- Gatehouse: flanking towers + arch + raised portcullis ---
  const gateX = cx, gateZ = z1;
  const gWidth = 10;
  towerAt(gateX - gWidth / 2 - 1, gateZ, 3.0, 10.5);
  towerAt(gateX + gWidth / 2 + 1, gateZ, 3.0, 10.5);
  const gGround = groundAt(gateX, gateZ);
  // Passage side walls
  b.solidBox('stone', 1.6, 5.2, 4.2, gateX - gWidth / 2 + 0.6, gGround + 2.2, gateZ);
  b.solidBox('stone', 1.6, 5.2, 4.2, gateX + gWidth / 2 - 0.6, gGround + 2.2, gateZ);
  // Lintel above the passage (minY ≈ 4.6 → players pass below)
  b.solidBox('stone', gWidth, 2.8, 4.2, gateX, gGround + 6.0, gateZ, 0, false);
  b.addBoxCollider(gateX, gGround + 7.4, gateZ, gWidth, 1.0, 4.2, 0);
  b.box('stoneDark', gWidth + 0.6, 0.5, 4.6, gateX, gGround + 7.6, gateZ);
  crenellate(gateX, gateZ, 0, gWidth + 0.6, gGround + 7.85);
  // Raised portcullis (decorative, clearly open)
  for (const off of [-1.4, 0, 1.4]) {
    b.cylinder('metal', 0.06, 0.06, 1.6, 5, gateX + off, gGround + 5.6, gateZ + 1.6, false);
  }
  // Gate lanterns
  b.box('glow', 0.3, 0.4, 0.3, gateX - 3.4, gGround + 3.4, gateZ + 2.3);
  b.box('glow', 0.3, 0.4, 0.3, gateX + 3.4, gGround + 3.4, gateZ + 2.3);

  // --- The Keep: great tower + hall ---
  const keepX = cx - 4, keepZ = cz - 6;
  const kGround = groundAt(keepX, keepZ);
  b.cylinder('stone', 5.4, 6.0, 17, 12, keepX, kGround + 8.5, keepZ, true);
  b.addCylinderCollider(keepX, keepZ, 5.8, kGround - 1, kGround + 17);
  b.cylinder('stoneDark', 5.8, 5.8, 0.6, 12, keepX, kGround + 17, keepZ);
  b.add(new THREE.ConeGeometry(6.2, 4.6, 12), 'roofSlate', keepX, kGround + 19.6, keepZ);
  b.cylinder('woodDark', 0.08, 0.08, 3.0, 5, keepX, kGround + 22.6, keepZ);
  b.add(new THREE.BoxGeometry(1.8, 0.9, 0.06), 'clothGold', keepX + 0.9, kGround + 23.2, keepZ, 0);
  // Keep windows (arrow slits)
  for (let i = 0; i < 3; i++) {
    const a = i * 2.2 + 0.6;
    b.box('woodDark', 0.5, 1.4, 0.3, keepX + Math.cos(a) * 5.6, kGround + 5 + i * 3.5, keepZ + Math.sin(a) * 5.6, -a);
  }
  // Great hall attached east of the keep
  const hallX = keepX + 10.5, hallZ = keepZ + 1;
  const hallG = groundAt(hallX, hallZ);
  b.solidBox('stone', 12, 8, 8, hallX, hallG + 4, hallZ);
  b.box('stoneDark', 12.6, 0.4, 8.6, hallX, hallG + 8.2, hallZ);
  b.add(new THREE.BoxGeometry(13.4, 0.18, 5.4), 'roofSlate', hallX, hallG + 9.9, hallZ + 1.95, 0, 1, 1, 1, 0, Math.atan2(2.6, 4.2));
  b.add(new THREE.BoxGeometry(13.4, 0.18, 5.4), 'roofSlate', hallX, hallG + 9.9, hallZ - 1.95, 0, 1, 1, 1, 0, -Math.atan2(2.6, 4.2));
  b.box('woodDark', 1.4, 2.4, 0.2, hallX, hallG + 1.3, hallZ + 4.1);
  // Hall banners on the south wall
  b.add(new THREE.BoxGeometry(1.1, 3.2, 0.08), 'clothRed', hallX - 3, hallG + 4.4, hallZ + 4.15);
  b.add(new THREE.BoxGeometry(1.1, 3.2, 0.08), 'clothGold', hallX + 3, hallG + 4.4, hallZ + 4.15);

  // --- Courtyard props ---
  // Training dummy (interactive in Game wiring)
  const dummyX = cx - 12, dummyZ = cz + 8;
  const dGround = groundAt(dummyX, dummyZ);
  b.cylinder('woodDark', 0.12, 0.12, 2.0, 6, dummyX, dGround + 1.0, dummyZ, true);
  b.add(new THREE.CylinderGeometry(0.55, 0.42, 0.12, 8), 'wood', dummyX, dGround + 1.25, dummyZ);
  b.add(new THREE.SphereGeometry(0.22, 8, 6), 'wood', dummyX, dGround + 2.1, dummyZ);
  b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 8), 'wood', dummyX, dGround + 1.62, dummyZ);
  b.add(new THREE.BoxGeometry(1.6, 0.14, 0.14), 'wood', dummyX, dGround + 1.62, dummyZ);
  b.addCylinderCollider(dummyX, dummyZ, 0.5, dGround, dGround + 2.2);
  // Weapon rack near dummy
  b.box('wood', 1.6, 0.12, 0.4, dummyX + 2.2, dGround + 1.0, dummyZ - 0.5, 0.4);
  b.box('woodDark', 0.12, 1.0, 0.12, dummyX + 1.6, dGround + 0.5, dummyZ - 0.75, 0.4);
  b.box('woodDark', 0.12, 1.0, 0.12, dummyX + 2.8, dGround + 0.5, dummyZ - 0.25, 0.4);
  // Crates & barrels by the keep
  for (let i = 0; i < 5; i++) {
    const bx = keepX + 4 + rand() * 4;
    const bz = keepZ + 8 + rand() * 3;
    if (rand() < 0.5) {
      b.solidBox('woodDark', 0.95, 0.95, 0.95, bx, groundAt(bx, bz) + 0.5, bz, rand() * 2);
    } else {
      b.cylinder('wood', 0.42, 0.48, 1.0, 10, bx, groundAt(bx, bz) + 0.5, bz, true);
      b.addCylinderCollider(bx, bz, 0.5, groundAt(bx, bz), groundAt(bx, bz) + 1);
      b.add(new THREE.TorusGeometry(0.45, 0.035, 5, 12), 'metal', bx, groundAt(bx, bz) + 0.75, bz, 0, 1, 1, 1, Math.PI / 2);
      b.add(new THREE.TorusGeometry(0.45, 0.035, 5, 12), 'metal', bx, groundAt(bx, bz) + 0.25, bz, 0, 1, 1, 1, Math.PI / 2);
    }
  }
  // Cobble hints on the courtyard floor (flat dark stones)
  for (let i = 0; i < 60; i++) {
    const px = x0 + 3 + rand() * (x1 - x0 - 6);
    const pz = z0 + 3 + rand() * (z1 - z0 - 6);
    b.box('stoneDark', 0.9 + rand() * 0.5, 0.06, 0.9 + rand() * 0.5, px, groundAt(px, pz) + 0.04, pz, rand() * 3);
  }

  void baseY;
  return {
    gatePos: new THREE.Vector3(gateX, gGround, gateZ + 3),
    dummyPos: new THREE.Vector3(dummyX, dGround, dummyZ),
  };
}
