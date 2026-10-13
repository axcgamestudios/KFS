import * as THREE from 'three';
import { StaticBuilder } from './Materials';
import { mulberry32 } from '../core/MathUtils';
import { WORLD } from '../world/WorldConfig';

/**
 * Fase 18 — CASTILLO DE ALDMOR, REBUILT.
 *
 * The old castle was small, hollow-eyed and buggy (walls floating on the
 * plateau skirt, a keep you could not enter). The new one:
 *
 *  - A TRUE flat bailey (WorldConfig FLATS pad, r 58 @ h 38) — nothing floats.
 *  - 72 x 54 curtain walls, 9 m tall, built in 6 m segments that each sample
 *    the ground, with a WALKABLE WALL-WALK (inner ledge + outer parapet) and
 *    two straight stairs from the courtyard.
 *  - Six towers + a real gatehouse passage.
 *  - A HOLLOW KEEP you can enter: great hall with throne, hearth and banners,
 *    plus a stair to a crenellated roof terrace.
 *  - A separate GREAT HALL building with long tables and a dais.
 *  - Courtyard: training dummy (Game wiring keeps using dummyPos), well,
 *    stabling lean-to, racks, crates, banner poles.
 */
export function buildCastle(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
): { gatePos: THREE.Vector3; dummyPos: THREE.Vector3 } {
  const cx = WORLD.castlePos.x - 5;
  const cz = WORLD.castlePos.z - 5;
  const rand = mulberry32(1312);

  const groundAt = (x: number, z: number) => terrain.height(x, z);

  // --- Curtain wall rectangle: x ∈ [x0,x1], z ∈ [z0,z1] ---
  const x0 = cx - 36, x1 = cx + 36, z0 = cz - 27, z1 = cz + 27;
  const wallH = 9;
  const wallT = 2.4;

  // ---- helpers ----------------------------------------------------------

  /** Crenellated parapet along a wall run. */
  const crenellate = (mx: number, mz: number, rot: number, len: number, topY: number) => {
    const dirX = Math.sin(rot), dirZ = Math.cos(rot);
    const n = Math.floor(len / 1.7);
    for (let i = 0; i <= n; i++) {
      if (i % 2 === 0) continue;
      const px = mx + dirX * (i / n - 0.5) * len;
      const pz = mz + dirZ * (i / n - 0.5) * len;
      b.box('stoneDark', 0.85, 0.75, 0.6, px, topY + 0.37, pz, rot);
    }
  };

  /**
   * One wall run from (ax,az) to (bx,bz), optionally skipping a gate gap
   * [t0,t1] (fraction along). Built in ~6 m segments that each sit on the
   * ground (no floating), WITH a walkable inner ledge (the wall-walk) and an
   * outer parapet.
   */
  const buildWall = (ax: number, az: number, bx: number, bz: number, skipGap?: [number, number]) => {
    const len = Math.hypot(bx - ax, bz - az);
    const dirX = (bx - ax) / len, dirZ = (bz - az) / len;
    const rot = Math.atan2(bx - ax, bz - az);
    const perpX = dirZ, perpZ = -dirX; // to the LEFT of the run

    const seg = (from: number, to: number) => {
      if (to - from < 0.4) return;
      const segLen = len * (to - from);
      const nSeg = Math.max(1, Math.ceil(segLen / 6));
      for (let s = 0; s < nSeg; s++) {
        const t0 = from + (to - from) * (s / nSeg);
        const t1 = from + (to - from) * ((s + 1) / nSeg);
        const sx = ax + dirX * len * (t0 + t1) / 2;
        const sz = az + dirZ * len * (t0 + t1) / 2;
        const gy = groundAt(sx, sz);
        const sLen = len * (t1 - t0);
        // main wall body (sinks 0.8 m into the ground: no gaps on slopes)
        b.solidBox('stone', wallT, wallH + 0.8, sLen, sx, gy + (wallH + 0.8) / 2 - 0.8, sz, rot);
        crenellate(sx, sz, rot, sLen, gy + wallH - 0.1);
        // --- WALL-WALK: inner ledge at 4.6 m (walkable) ---
        const walkY = gy + 4.6;
        const wx = sx + perpX * (wallT / 2 + 0.75);
        const wz = sz + perpZ * (wallT / 2 + 0.75);
        b.addBoxCollider(wx, walkY, wz, 1.5, 0.24, sLen, rot);
        b.box('cobble', 1.5, 0.12, sLen, wx, walkY, wz, rot);
        // inner edge rail so you don't just walk off (knee height, visual)
        b.box('stoneDark', 0.22, 0.5, sLen, sx + perpX * (wallT / 2 + 1.45), walkY + 0.31, sz + perpZ * (wallT / 2 + 1.45), rot);
        // outer parapet lip above the walk
        b.box('stoneDark', 0.35, 0.55, sLen, sx - perpX * (wallT / 2 - 0.15), walkY + 0.42, sz - perpZ * (wallT / 2 - 0.15), rot);
      }
    };

    if (skipGap) {
      seg(0, skipGap[0]);
      seg(skipGap[1], 1);
    } else {
      seg(0, 1);
    }
  };

  /** Straight outdoor staircase up the inner face of a wall (step-up friendly). */
  const wallStairs = (baseX: number, baseZ: number, dirX: number, dirZ: number, width = 2.4) => {
    const steps = 12;              // 12 x 0.40 = 4.8 m ≈ wall-walk height
    for (let i = 0; i < steps; i++) {
      const px = baseX + dirX * (i * 0.95);
      const pz = baseZ + dirZ * (i * 0.95);
      const gy = groundAt(px, pz);
      const h = 0.4 * (i + 1);
      b.solidBox('stoneDark', width, h, 1.0, px, gy + h / 2, pz, Math.atan2(dirX, dirZ));
    }
    // landing joining the wall-walk
    const lx = baseX + dirX * (steps * 0.95 + 0.6);
    const lz = baseZ + dirZ * (steps * 0.95 + 0.6);
    const lg = groundAt(lx, lz);
    b.solidBox('stoneDark', width, 4.8, 1.4, lx, lg + 2.4, lz, Math.atan2(dirX, dirZ));
  };

  // ---- Curtain walls (gate gap on the south wall, fractions 0.40..0.60) ----
  buildWall(x0, z1, x1, z1, [0.40, 0.60]); // south (gate)
  buildWall(x0, z0, x1, z0);               // north
  buildWall(x0, z0, x0, z1);               // west
  buildWall(x1, z0, x1, z1);               // east

  // ---- Wall-walk stairs: courtyard side, against north & south walls ----
  wallStairs(cx - 24, z0 + 3.2, 0, -1);      // hugs the north wall inner face
  wallStairs(cx + 24, z1 - 3.2, 0, 1);       // hugs the south wall inner face

  // ---- Corner towers ----
  const towerAt = (tx: number, tz: number, r: number, h: number) => {
    const gy = groundAt(tx, tz);
    b.cylinder('stone', r, r + 0.5, h + 0.8, 12, tx, gy + (h + 0.8) / 2 - 0.8, tz, true);
    b.addCylinderCollider(tx, tz, r + 0.25, gy - 1, gy + h);
    // machicolation ring + crenellated top
    b.cylinder('stoneDark', r + 0.4, r + 0.4, 0.6, 12, tx, gy + h - 0.55, tz);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (i % 2 === 0) {
        b.box('stoneDark', 0.6, 0.7, 0.45, tx + Math.cos(a) * (r + 0.18), gy + h + 0.35, tz + Math.sin(a) * (r + 0.18), -a);
      }
    }
    // arrow slits
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.5;
      b.box('woodDark', 0.5, 1.5, 0.3, tx + Math.cos(a) * (r + 0.08), gy + 3.4 + i * 2.6, tz + Math.sin(a) * (r + 0.08), -a);
    }
    // conical roof + flag
    b.add(new THREE.ConeGeometry(r + 0.6, 3.8, 12), 'roofSlate', tx, gy + h + 2.7, tz);
    b.cylinder('woodDark', 0.06, 0.06, 2.4, 5, tx, gy + h + 4.0, tz);
    b.add(new THREE.BoxGeometry(1.4, 0.8, 0.06), 'clothRed', tx + 0.7, gy + h + 4.5, tz, 0);
  };
  towerAt(x0, z0, 4.0, 14);
  towerAt(x1, z0, 4.0, 14);
  towerAt(x0, z1, 3.7, 14);
  towerAt(x1, z1, 3.7, 14);

  // ---- Gatehouse (south, real passage) ----
  const gateX = cx, gateZ = z1;
  const gWidth = 9.6;
  towerAt(gateX - gWidth / 2 - 1.2, gateZ, 3.1, 11.5);
  towerAt(gateX + gWidth / 2 + 1.2, gateZ, 3.1, 11.5);
  const gGround = groundAt(gateX, gateZ);
  // passage side walls
  b.solidBox('stone', 1.7, 6.0, 5.0, gateX - gWidth / 2 + 0.65, gGround + 3.0, gateZ);
  b.solidBox('stone', 1.7, 6.0, 5.0, gateX + gWidth / 2 - 0.65, gGround + 3.0, gateZ);
  // lintel over the passage (walk-in height ≈ 4.6)
  b.solidBox('stone', gWidth, 2.6, 5.0, gateX, gGround + 5.9, gateZ, 0, false);
  b.addBoxCollider(gateX, gGround + 7.2, gateZ, gWidth, 1.0, 5.0, 0);
  b.box('stoneDark', gWidth + 0.8, 0.55, 5.4, gateX, gGround + 7.45, gateZ);
  crenellate(gateX, gateZ, Math.PI / 2, gWidth + 0.8, gGround + 7.72);
  // raised portcullis (clearly open)
  for (const off of [-1.5, 0, 1.5]) {
    b.cylinder('metal', 0.07, 0.07, 1.8, 5, gateX + off, gGround + 5.1, gateZ + 1.7, false);
  }
  // gate lanterns
  b.box('glow', 0.32, 0.44, 0.32, gateX - 3.6, gGround + 3.6, gateZ + 2.5);
  b.box('glow', 0.32, 0.44, 0.32, gateX + 3.6, gGround + 3.6, gateZ + 2.5);
  // flanking banners on the passage walls
  b.add(new THREE.BoxGeometry(1.2, 3.6, 0.08), 'clothRed', gateX - 4.15, gGround + 3.2, gateZ + 1.4);
  b.add(new THREE.BoxGeometry(1.2, 3.6, 0.08), 'clothGold', gateX + 4.15, gGround + 3.2, gateZ + 1.4);

  // ---- THE KEEP — hollow, enterable, with roof terrace ----
  const keepX = cx - 20, keepZ = cz - 6;
  const kw = 14, kd = 13;               // footprint
  const kh = 13;                        // wall height
  const kGround = groundAt(keepX, keepZ);
  const kY = kGround + 0.25;
  const keepDoorW = 1.6;

  // plinth + interior floor
  b.solidBox('stoneDark', kw + 0.5, 0.5, kd + 0.5, keepX, kGround + 0.25, keepZ);
  b.addBoxCollider(keepX, kY + 0.42, keepZ, kw - 0.6, 0.14, kd - 0.6, 0);
  b.box('cobble', kw - 0.6, 0.12, kd - 0.6, keepX, kY + 0.44, keepZ);

  // hollow walls (4 sides, door gap south)
  const keepWall = (px: number, pz: number, bw: number, bd: number) => {
    b.solidBox('stone', bw, kh, bd, keepX + px, kY + kh / 2, keepZ + pz);
  };
  keepWall(0, -kd / 2, kw, 0.9);                       // north
  keepWall(-kw / 2, 0, 0.9, kd);                       // west
  keepWall(kw / 2, 0, 0.9, kd);                        // east
  // south: two segments + lintel (door faces the courtyard gate)
  const kSegW = (kw - keepDoorW) / 2;
  keepWall(-(keepDoorW / 2 + kSegW / 2), kd / 2, kSegW, 0.9);
  keepWall(+(keepDoorW / 2 + kSegW / 2), kd / 2, kSegW, 0.9);
  b.solidBox('stone', keepDoorW + 0.4, kh - 3.0, 0.9, keepX, kY + 3.0 + (kh - 3.0) / 2, keepZ + kd / 2, 0, false);
  b.addBoxCollider(keepX, kY + 3.0 + (kh - 3.0) / 2, keepZ + kd / 2, keepDoorW + 0.4, kh - 3.0, 0.9, 0);
  // door frame + steps
  b.box('woodDark', 0.22, 3.1, 1.1, keepX - keepDoorW / 2 - 0.1, kY + 1.55, keepZ + kd / 2);
  b.box('woodDark', 0.22, 3.1, 1.1, keepX + keepDoorW / 2 + 0.1, kY + 1.55, keepZ + kd / 2);
  b.box('woodDark', keepDoorW + 0.5, 0.24, 1.15, keepX, kY + 3.16, keepZ + kd / 2);
  b.solidBox('stoneDark', 2.2, 0.18, 0.8, keepX, kGround + 0.09, keepZ + kd / 2 + 0.65);

  // corner pilasters + arrow slits on the keep
  for (const [px, pz] of [[-kw / 2, -kd / 2], [kw / 2, -kd / 2], [-kw / 2, kd / 2], [kw / 2, kd / 2]] as Array<[number, number]>) {
    b.box('stoneDark', 1.1, kh, 1.1, keepX + px, kY + kh / 2, keepZ + pz);
  }
  for (let i = 0; i < 4; i++) {
    const wy = kY + 3.2 + i * 2.6;
    b.box('woodDark', 0.5, 1.6, 0.3, keepX - kw / 2 - 0.02, wy, keepZ - 2.4 + i * 1.6);
    b.box('woodDark', 0.5, 1.6, 0.3, keepX + kw / 2 + 0.02, wy, keepZ - 2.4 + i * 1.6);
  }

  // --- Keep interior: the great hall of the Order ---
  // throne dais + throne (north end)
  b.solidBox('stoneDark', 5.2, 0.5, 2.6, keepX, kY + 0.72, keepZ - kd / 2 + 1.9);
  b.box('woodDark', 1.3, 1.6, 0.5, keepX, kY + 1.9, keepZ - kd / 2 + 1.1);
  b.box('gold', 1.4, 0.18, 0.6, keepX, kY + 2.75, keepZ - kd / 2 + 1.05);
  b.box('woodDark', 0.7, 0.55, 0.7, keepX, kY + 1.5, keepZ - kd / 2 + 1.9);
  // long table + benches
  b.box('wood', 4.6, 0.14, 1.5, keepX + 0.5, kY + 1.02, keepZ + 0.6);
  b.box('woodDark', 0.14, 0.92, 0.14, keepX - 1.5, kY + 0.55, keepZ + 0.0);
  b.box('woodDark', 0.14, 0.92, 0.14, keepX + 2.5, kY + 0.55, keepZ + 1.2);
  b.box('wood', 4.2, 0.1, 0.4, keepX + 0.5, kY + 0.62, keepZ + 1.75);
  b.box('wood', 4.2, 0.1, 0.4, keepX + 0.5, kY + 0.62, keepZ - 0.55);
  // hearth against the west wall
  b.solidBox('stoneDark', 1.9, 1.5, 0.7, keepX - kw / 2 + 0.85, kY + 0.75, keepZ - 1.0);
  b.box('glow', 1.2, 0.5, 0.35, keepX - kw / 2 + 0.95, kY + 0.6, keepZ - 1.0);
  b.box('wood', 2.0, 0.16, 0.7, keepX - kw / 2 + 0.9, kY + 1.62, keepZ - 1.0);
  // banners + weapon racks + pillars
  b.add(new THREE.BoxGeometry(1.3, 4.2, 0.08), 'clothRed', keepX - 2.6, kY + 4.4, keepZ + kd / 2 - 0.55);
  b.add(new THREE.BoxGeometry(1.3, 4.2, 0.08), 'clothGold', keepX + 2.6, kY + 4.4, keepZ + kd / 2 - 0.55);
  b.cylinder('stone', 0.45, 0.5, kh, 8, keepX - 3.4, kY + kh / 2, keepZ + 2.2, true);
  b.addCylinderCollider(keepX - 3.4, keepZ + 2.2, 0.55, kY, kY + kh);
  b.cylinder('stone', 0.45, 0.5, kh, 8, keepX + 3.4, kY + kh / 2, keepZ + 2.2, true);
  b.addCylinderCollider(keepX + 3.4, keepZ + 2.2, 0.55, kY, kY + kh);
  // stairs to the roof terrace (along the east wall)
  const stairSteps = 26;
  for (let i = 0; i < stairSteps; i++) {
    const sy = kY + 0.5 + (i / stairSteps) * (kh - 1.2);
    const sz = keepZ - kd / 2 + 1.6 + i * ((kd - 3.4) / stairSteps);
    b.solidBox('stoneDark', 1.7, 0.42, 0.85, keepX + kw / 2 - 1.3, sy, sz);
  }

  // roof terrace: crenellated parapet + flag + view
  const roofY = kY + kh;
  b.box('stoneDark', kw + 0.6, 0.5, kd + 0.6, keepX, roofY + 0.25, keepZ);
  crenellate(keepX, keepZ - kd / 2, 0, kw, roofY + 0.5);
  crenellate(keepX, keepZ + kd / 2, 0, kw, roofY + 0.5);
  crenellate(keepX - kw / 2, keepZ, Math.PI / 2, kd, roofY + 0.5);
  crenellate(keepX + kw / 2, keepZ, Math.PI / 2, kd, roofY + 0.5);
  b.cylinder('woodDark', 0.08, 0.08, 3.2, 5, keepX, roofY + 1.9, keepZ);
  b.add(new THREE.BoxGeometry(2.0, 1.0, 0.07), 'clothGold', keepX + 1.0, roofY + 2.6, keepZ, 0);

  // ---- GREAT HALL (separate, east of the keep — enterable) ----
  const hallX = cx + 12, hallZ = cz - 8;
  const hw2 = 17, hd2 = 9, hh = 6.4;
  const hGround = groundAt(hallX, hallZ);
  const hY = hGround + 0.25;
  const hallDoorW = 1.8;
  b.solidBox('stoneDark', hw2 + 0.5, 0.5, hd2 + 0.5, hallX, hGround + 0.25, hallZ);
  b.addBoxCollider(hallX, hY + 0.42, hallZ, hw2 - 0.6, 0.14, hd2 - 0.6, 0);
  b.box('cobble', hw2 - 0.6, 0.12, hd2 - 0.6, hallX, hY + 0.44, hallZ);
  // hollow walls: long sides + short north; door south
  b.solidBox('stone', hw2, hh, 0.9, hallX, hY + hh / 2, hallZ - hd2 / 2);
  b.solidBox('stone', 0.9, hh, hd2, hallX - hw2 / 2, hY + hh / 2, hallZ);
  b.solidBox('stone', 0.9, hh, hd2, hallX + hw2 / 2, hY + hh / 2, hallZ);
  const hSegW = (hw2 - hallDoorW) / 2;
  b.solidBox('stone', hSegW, hh, 0.9, hallX - (hallDoorW / 2 + hSegW / 2), hY + hh / 2, hallZ + hd2 / 2);
  b.solidBox('stone', hSegW, hh, 0.9, hallX + (hallDoorW / 2 + hSegW / 2), hY + hh / 2, hallZ + hd2 / 2);
  b.solidBox('stone', hallDoorW + 0.4, hh - 3.2, 0.9, hallX, hY + 3.2 + (hh - 3.2) / 2, hallZ + hd2 / 2, 0, false);
  b.addBoxCollider(hallX, hY + 3.2 + (hh - 3.2) / 2, hallZ + hd2 / 2, hallDoorW + 0.4, hh - 3.2, 0.9, 0);
  b.solidBox('stoneDark', 2.4, 0.18, 0.9, hallX, hGround + 0.09, hallZ + hd2 / 2 + 0.7);
  // tall gothic windows (dark glass) on the long walls
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const px = hallX - 5.5 + i * 5.5;
      b.box('woodDark', 1.15, 3.0, 0.12, px, hY + 3.4, hallZ + side * (hd2 / 2 + 0.02));
      b.box('wood', 0.12, 3.0, 0.14, px, hY + 3.4, hallZ + side * (hd2 / 2 + 0.05));
    }
  }
  // timber roof trusses + slate
  for (let i = 0; i < 5; i++) {
    b.box('woodDark', 0.24, 0.24, hd2 + 0.6, hallX - 7 + i * 3.5, hY + hh - 0.12, hallZ);
  }
  {
    const slopeLen = Math.sqrt((hd2 / 2) ** 2 + 2.4 ** 2) + 0.4;
    const slopeAngle = Math.atan2(2.4, hd2 / 2);
    b.add(new THREE.BoxGeometry(hw2 + 1.0, 0.2, slopeLen), 'roofSlate', hallX, hY + hh + 1.2 - 0.05, hallZ + hd2 / 4, 0, 1, 1, 1, 0, slopeAngle);
    b.add(new THREE.BoxGeometry(hw2 + 1.0, 0.2, slopeLen), 'roofSlate', hallX, hY + hh + 1.2 - 0.05, hallZ - hd2 / 4, 0, 1, 1, 1, 0, -slopeAngle);
    b.box('woodDark', hw2 + 1.2, 0.22, 0.22, hallX, hY + hh + 2.35, hallZ);
  }
  // hall interior: two long tables + hearth + dais with chairs + tapestries
  for (const dzOff of [-1.6, 1.6]) {
    b.box('wood', 8.5, 0.16, 1.35, hallX - 1.5, hY + 0.95, hallZ + dzOff);
    b.box('woodDark', 0.16, 0.9, 0.16, hallX - 5, hY + 0.5, hallZ + dzOff);
    b.box('woodDark', 0.16, 0.9, 0.16, hallX + 2, hY + 0.5, hallZ + dzOff);
    b.box('wood', 8.0, 0.11, 0.4, hallX - 1.5, hY + 0.58, hallZ + dzOff + (dzOff < 0 ? -1.05 : 1.05));
  }
  // dais + two throne chairs at the north end
  b.solidBox('stoneDark', 6.0, 0.4, 2.4, hallX + 3.5, hY + 0.62, hallZ - hd2 / 2 + 1.8);
  for (const dx of [-0.9, 0.9]) {
    b.box('woodDark', 0.8, 0.6, 0.8, hallX + 3.5 + dx, hY + 1.2, hallZ - hd2 / 2 + 1.8);
    b.box('woodDark', 0.8, 1.3, 0.16, hallX + 3.5 + dx, hY + 1.9, hallZ - hd2 / 2 + 1.15);
  }
  // hearth west + tapestries
  b.solidBox('stoneDark', 1.8, 1.4, 0.7, hallX - hw2 / 2 + 0.9, hY + 0.72, hallZ + 1.5);
  b.box('glow', 1.1, 0.5, 0.35, hallX - hw2 / 2 + 1.0, hY + 0.58, hallZ + 1.5);
  b.add(new THREE.BoxGeometry(1.6, 3.4, 0.06), 'clothRed', hallX - 2.5, hY + 3.7, hallZ - hd2 / 2 + 0.5);
  b.add(new THREE.BoxGeometry(1.6, 3.4, 0.06), 'clothGold', hallX + 2.0, hY + 3.7, hallZ - hd2 / 2 + 0.5);

  // ---- Courtyard dressing ----
  // training dummy (interactive in Game wiring — dummyPos must stay)
  const dummyX = cx - 6, dummyZ = cz + 10;
  const dGround = groundAt(dummyX, dummyZ);
  b.cylinder('woodDark', 0.12, 0.12, 2.0, 6, dummyX, dGround + 1.0, dummyZ, true);
  b.add(new THREE.CylinderGeometry(0.55, 0.42, 0.12, 8), 'wood', dummyX, dGround + 1.25, dummyZ);
  b.add(new THREE.SphereGeometry(0.22, 8, 6), 'wood', dummyX, dGround + 2.1, dummyZ);
  b.add(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 8), 'wood', dummyX, dGround + 1.62, dummyZ);
  b.add(new THREE.BoxGeometry(1.6, 0.14, 0.14), 'wood', dummyX, dGround + 1.62, dummyZ);
  b.addCylinderCollider(dummyX, dummyZ, 0.5, dGround, dGround + 2.2);
  // weapon rack near dummy
  b.box('wood', 1.6, 0.12, 0.4, dummyX + 2.2, dGround + 1.0, dummyZ - 0.5, 0.4);
  b.box('woodDark', 0.12, 1.0, 0.12, dummyX + 1.6, dGround + 0.5, dummyZ - 0.75, 0.4);
  b.box('woodDark', 0.12, 1.0, 0.12, dummyX + 2.8, dGround + 0.5, dummyZ - 0.25, 0.4);
  // the courtyard well
  const wellX = cx + 2, wellZ = cz + 12;
  b.cylinder('stoneDark', 1.15, 1.25, 1.05, 10, wellX, groundAt(wellX, wellZ) + 0.52, wellZ, true);
  b.addCylinderCollider(wellX, wellZ, 1.3, groundAt(wellX, wellZ), groundAt(wellX, wellZ) + 1.15);
  b.cylinder('stoneMoss', 1.28, 1.28, 0.14, 10, wellX, groundAt(wellX, wellZ) + 1.06, wellZ);
  b.cylinder('woodDark', 0.98, 0.98, 0.06, 10, wellX, groundAt(wellX, wellZ) + 0.64, wellZ);
  // stabling lean-to along the east wall (horses of the garrison)
  const leanX = x1 - 3.4, leanZ = cz + 6;
  b.box('wood', 0.24, 3.0, 0.24, leanX, groundAt(leanX, leanZ) + 1.5, leanZ - 5);
  b.box('wood', 0.24, 3.0, 0.24, leanX, groundAt(leanX, leanZ) + 1.5, leanZ + 5);
  b.add(new THREE.BoxGeometry(3.6, 0.16, 11.5), 'roofThatch', leanX - 1.5, groundAt(leanX, leanZ) + 3.1, leanZ, 0, 1, 1, 1, 0, 0.22);
  b.box('wood', 2.6, 0.45, 0.6, leanX - 0.8, groundAt(leanX, leanZ) + 0.25, leanZ - 3);
  b.box('wood', 2.6, 0.45, 0.6, leanX - 0.8, groundAt(leanX, leanZ) + 0.25, leanZ + 3);
  // crates & barrels by the keep
  for (let i = 0; i < 6; i++) {
    const bx = keepX + 6 + rand() * 4;
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
  // banner poles along the courtyard
  for (let i = 0; i < 4; i++) {
    const px = x0 + 6 + i * 4.5;
    const pz = cz + 18;
    const py = groundAt(px, pz);
    b.cylinder('woodDark', 0.08, 0.1, 5.4, 6, px, py + 2.7, pz, true);
    b.add(new THREE.BoxGeometry(1.1, 0.7, 0.05), i % 2 ? 'clothRed' : 'clothGold', px + 0.55, py + 5.0, pz);
  }
  // cobble hints on the courtyard floor
  for (let i = 0; i < 90; i++) {
    const px = x0 + 3 + rand() * (x1 - x0 - 6);
    const pz = z0 + 3 + rand() * (z1 - z0 - 6);
    b.box('stoneDark', 0.9 + rand() * 0.5, 0.06, 0.9 + rand() * 0.5, px, groundAt(px, pz) + 0.04, pz, rand() * 3);
  }

  return {
    gatePos: new THREE.Vector3(gateX, gGround, gateZ + 3),
    dummyPos: new THREE.Vector3(dummyX, dGround, dummyZ),
  };
}
