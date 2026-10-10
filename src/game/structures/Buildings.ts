import * as THREE from 'three';
import { StaticBuilder, MAT } from './Materials';
import { mulberry32 } from '../core/MathUtils';

/**
 * Procedural medieval building kit — timber-framed houses with jettied upper
 * floors, gabled roofs, tavern, smithy, warehouse, docks, ship, market stalls.
 * All parts merge into few draw calls per structure group.
 */

export interface HouseOpts {
  x: number; z: number; groundY: number; rotY: number;
  w?: number; d?: number; stories?: 1 | 2;
  roof?: 'thatch' | 'red' | 'slate';
  plaster?: 'plain' | 'warm';
  chimney?: boolean;
  seed?: number;
}

/** Gable roof (two slopes) with triangular gable ends. */
function addGableRoof(
  b: StaticBuilder, cx: number, cy: number, cz: number, rotY: number,
  w: number, d: number, roofH: number, matKey: 'roofThatch' | 'roofRed' | 'roofSlate',
): void {
  const slopeLen = Math.sqrt((d / 2) * (d / 2) + roofH * roofH) + 0.4;
  const slopeAngle = Math.atan2(roofH, d / 2);
  const dirX = Math.sin(rotY);
  const dirZ = Math.cos(rotY);
  // +Z local half-slope (ridge high at center, low edge toward +Z)
  b.add(new THREE.BoxGeometry(w + 0.7, 0.16, slopeLen), matKey,
    cx + dirX * (d / 4), cy + roofH / 2 - 0.06, cz + dirZ * (d / 4),
    rotY, 1, 1, 1, 0, slopeAngle);
  // -Z local half-slope
  b.add(new THREE.BoxGeometry(w + 0.7, 0.16, slopeLen), matKey,
    cx - dirX * (d / 4), cy + roofH / 2 - 0.06, cz - dirZ * (d / 4),
    rotY, 1, 1, 1, 0, -slopeAngle);
  // Ridge beam along local X
  b.box('woodDark', w + 1.0, 0.16, 0.16, cx, cy + roofH - 0.02, cz, rotY);
  // Gable ends (triangles) on the ±X walls
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, roofH);
  shape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
  gableGeo.translate(0, 0, -0.09);
  const sideX = Math.cos(rotY), sideZ = -Math.sin(rotY);
  b.add(gableGeo, 'plaster', cx + sideX * (w / 2 - 0.05), cy, cz + sideZ * (w / 2 - 0.05), rotY + Math.PI / 2);
  b.add(gableGeo.clone(), 'plaster', cx - sideX * (w / 2 - 0.05), cy, cz - sideZ * (w / 2 - 0.05), rotY + Math.PI / 2);
}

  /** Map from house options to actual material keys. */
  const PLASTER_MAP = { plain: 'plaster', warm: 'plasterWarm' } as const;
  const ROOF_MAP = { thatch: 'roofThatch', red: 'roofRed', slate: 'roofSlate' } as const;

export function buildHouse(b: StaticBuilder, o: HouseOpts): void {
  const rand = mulberry32(o.seed ?? 1);
  const w = o.w ?? 5 + rand() * 2;
  const d = o.d ?? 6 + rand() * 2;
  const stories = o.stories ?? (rand() < 0.65 ? 2 : 1);
  const roofOpt = o.roof ?? (rand() < 0.5 ? 'thatch' : rand() < 0.6 ? 'red' : 'slate');
  const roofKey = ROOF_MAP[roofOpt];
  const plasterOpt = o.plaster ?? (rand() < 0.5 ? 'plain' : 'warm');
  const plasterKey = PLASTER_MAP[plasterOpt];
  const floorH = 2.7;
  const { x, z, groundY, rotY } = o;

  // Foundation stones
  b.solidBox('stoneDark', w + 0.3, 0.55, d + 0.3, x, groundY + 0.2, z, rotY, true);

  // Ground floor
  const y0 = groundY + 0.5;
  b.solidBox(plasterKey, w, floorH, d, x, y0 + floorH / 2, z, rotY);

  // Timber frame: corner posts + horizontal beams
  const hw = w / 2, hd = d / 2;
  const postPts: Array<[number, number]> = [
    [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd],
    [-hw, 0], [hw, 0], [0, -hd], [0, hd],
  ];
  for (const [px, pz] of postPts) {
    const wx = x + px * Math.cos(rotY) + pz * Math.sin(rotY);
    const wz = z - px * Math.sin(rotY) + pz * Math.cos(rotY);
    b.box('timber', 0.24, floorH, 0.24, wx, y0 + floorH / 2, wz, rotY);
  }
  // Horizontal beam at mid and top of ground floor
  b.box('timber', w + 0.12, 0.18, 0.16, x, y0 + floorH * 0.52, z + hd * Math.cos(rotY), rotY);
  b.box('timber', w + 0.12, 0.2, 0.16, x, y0 + floorH - 0.1, z + hd * Math.cos(rotY), rotY);
  b.box('timber', w + 0.12, 0.2, 0.16, x, y0 + floorH - 0.1, z - hd * Math.cos(rotY), rotY);

  let topY = y0 + floorH;
  if (stories === 2) {
    // Jettied second floor (overhang)
    const w2 = w + 0.55, d2 = d + 0.55;
    b.solidBox(plasterKey, w2, floorH * 0.85, d2, x, topY + (floorH * 0.85) / 2, z, rotY);
    const hw2 = w2 / 2, hd2 = d2 / 2;
    for (const [px, pz] of [[-hw2, -hd2], [hw2, -hd2], [-hw2, hd2], [hw2, hd2]] as Array<[number, number]>) {
      const wx = x + px * Math.cos(rotY) + pz * Math.sin(rotY);
      const wz = z - px * Math.sin(rotY) + pz * Math.cos(rotY);
      b.box('timber', 0.22, floorH * 0.85, 0.22, wx, topY + (floorH * 0.85) / 2, wz, rotY);
    }
    // Diagonal braces
    b.box('timber', 0.14, 0.14, w2 * 0.75, x, topY + floorH * 0.45, z + hd2 * Math.cos(rotY) * 0.8, rotY + 0.06);
    topY += floorH * 0.85;
  }

  // Roof
  const roofMatKey: 'roofThatch' | 'roofRed' | 'roofSlate' = roofKey;
  addGableRoof(b, x, topY, z, rotY, stories === 2 ? w + 0.6 : w, d, 1.9 + rand() * 0.5, roofMatKey);

  // Door on the local -Z face, slightly proud of the wall
  const doorX = x + (-hd - 0.03) * Math.sin(rotY);
  const doorZ = z + (-hd - 0.03) * Math.cos(rotY);
  b.box('woodDark', 1.05, 2.0, 0.14, doorX, y0 + 1.0, doorZ, rotY);
  b.box('metal', 0.09, 0.09, 0.05, doorX + 0.35 * Math.cos(rotY), y0 + 1.05, doorZ - 0.35 * Math.sin(rotY), rotY);
  // Little step
  b.box('stoneDark', 1.3, 0.18, 0.5, doorX - Math.sin(rotY) * 0.25, y0 + 0.09, doorZ - Math.cos(rotY) * 0.25, rotY);

  // Windows (dark glass + shutters) on front & back
  const winRows = stories === 2 ? [y0 + 1.6, topY - floorH * 0.45 + 0.8] : [y0 + 1.6];
  for (const wy of winRows) {
    for (const side of [-1, 1]) {
      for (const off of [-w * 0.28, w * 0.28]) {
        const lx = off;
        const lz = (stories === 2 && wy > y0 + floorH ? hd + 0.35 : hd) * side + side * 0.03;
        const wx = x + lx * Math.cos(rotY) + lz * Math.sin(rotY);
        const wz = z - lx * Math.sin(rotY) + lz * Math.cos(rotY);
        if (Math.abs(lx) > w * 0.36 && wy < y0 + 2 && side < 0) continue; // avoid door zone
        b.box('woodDark', 0.7, 0.9, 0.1, wx, wy, wz, rotY);
        b.box('wood', 0.32, 0.9, 0.06, wx + 0.42 * Math.cos(rotY), wy, wz - 0.42 * Math.sin(rotY), rotY);
      }
    }
  }

  if (o.chimney ?? rand() < 0.7) {
    const cxp = x + (hw - 0.5) * Math.cos(rotY) + (hd - 0.6) * Math.sin(rotY);
    const czp = z - (hw - 0.5) * Math.sin(rotY) + (hd - 0.6) * Math.cos(rotY);
    b.solidBox('stoneDark', 0.75, topY - groundY + 2.6, 0.75, cxp, groundY + (topY - groundY + 2.6) / 2, czp, rotY);
    b.box('stoneDark', 0.95, 0.28, 0.95, cxp, groundY + topY - groundY + 2.5, czp, rotY);
  }
}

/** The tavern “El Ancla Rota” — bigger, two story, with hanging sign. */
export function buildTavern(b: StaticBuilder, x: number, z: number, groundY: number, rotY: number): void {
  buildHouse(b, { x, z, groundY, rotY, w: 9, d: 10, stories: 2, roof: 'red', plaster: 'warm', chimney: true, seed: 42 });
  // Hanging sign
  const sx = x + Math.sin(rotY) * 5.4;
  const sz = z + Math.cos(rotY) * 5.4;
  b.cylinder('woodDark', 0.06, 0.06, 2.4, 5, sx, groundY + 3.4, sz);
  b.add(new THREE.BoxGeometry(0.9, 0.6, 0.08), 'wood', sx, groundY + 2.6, sz, rotY);
  b.add(new THREE.BoxGeometry(0.5, 0.2, 0.1), 'gold', sx, groundY + 2.6, sz, rotY);
  // Outside benches + barrels
  b.box('wood', 1.8, 0.12, 0.45, sx + 1.4, groundY + 0.42, sz, rotY);
  b.box('wood', 0.14, 0.4, 0.4, sx + 0.7, groundY + 0.2, sz, rotY);
  b.box('wood', 0.14, 0.4, 0.4, sx + 2.1, groundY + 0.2, sz, rotY);
}

/** Smithy with forge glow and anvil. */
export function buildSmithy(b: StaticBuilder, x: number, z: number, groundY: number, rotY: number, forgeLight?: (x: number, y: number, z: number) => void): void {
  buildHouse(b, { x, z, groundY, rotY, w: 6.5, d: 7, stories: 1, roof: 'slate', plaster: 'plain', chimney: true, seed: 7 });
  // Open forge annex
  const fx = x - Math.sin(rotY) * 6.2;
  const fz = z - Math.cos(rotY) * 6.2;
  b.box('stoneDark', 2.6, 1.0, 1.6, fx, groundY + 0.5, fz, rotY);
  b.add(new THREE.BoxGeometry(1.4, 0.5, 1.0), 'glow', fx, groundY + 1.1, fz, rotY);
  // Chimney hood
  b.box('stoneDark', 1.6, 1.8, 0.3, fx - Math.sin(rotY) * 0.6, groundY + 2.4, fz - Math.cos(rotY) * 0.6, rotY);
  // Anvil (stone base + metal top)
  const ax = fx + Math.cos(rotY) * 1.8;
  const az = fz - Math.sin(rotY) * 1.8;
  b.box('woodDark', 0.5, 0.55, 0.5, ax, groundY + 0.28, az, rotY);
  b.box('metal', 0.7, 0.3, 0.32, ax, groundY + 0.7, az, rotY);
  // Weapon rack
  b.box('wood', 1.4, 0.1, 0.3, fx + Math.cos(rotY) * 2.6, groundY + 1.1, fz - Math.sin(rotY) * 2.6, rotY);
  forgeLight?.(fx, groundY + 1.4, fz);
}

/** Harbor warehouse with big doors — houses Eirik's sea chest. */
export function buildWarehouse(b: StaticBuilder, x: number, z: number, groundY: number, rotY: number): void {
  const w = 10, d = 13, h = 5.2;
  b.solidBox('stoneDark', w + 0.4, 0.6, d + 0.4, x, groundY + 0.25, z, rotY);
  b.solidBox('wood', w, h, d, x, groundY + 0.55 + h / 2, z, rotY);
  // Timber cross braces
  for (const off of [-w / 2 + 0.3, 0, w / 2 - 0.3]) {
    const wx = x + off * Math.cos(rotY);
    const wz = z - off * Math.sin(rotY);
    b.box('timber', 0.3, h, 0.3, wx, groundY + 0.55 + h / 2, wz, rotY);
  }
  // Big double door on the local +Z face
  const dz = z + (d / 2 + 0.05) * Math.cos(rotY);
  const dX = x + (d / 2 + 0.05) * Math.sin(rotY);
  b.box('woodDark', 2.6, 3.4, 0.18, dX, groundY + 2.3, dz, rotY);
  // Roof (slate, shallow)
  addGableRoof(b, x, groundY + 0.55 + h, z, rotY, w, d, 1.7, 'roofSlate');
  // Crates along the side
  const rand = mulberry32(99);
  for (let i = 0; i < 4; i++) {
    const cx = x + (w / 2 + 0.9) * Math.cos(rotY) + (rand() * 6 - 3) * Math.sin(rotY);
    const cz = z - (w / 2 + 0.9) * Math.sin(rotY) + (rand() * 6 - 3) * Math.cos(rotY);
    b.solidBox('woodDark', 0.9, 0.9, 0.9, cx, groundY + 0.45, cz, rand() * 3);
  }
}

/** Herbalist cottage with a small garden fence. */
export function buildHerbalistHut(b: StaticBuilder, x: number, z: number, groundY: number, rotY: number): void {
  buildHouse(b, { x, z, groundY, rotY, w: 5, d: 5.5, stories: 1, roof: 'thatch', plaster: 'warm', chimney: true, seed: 21 });
  // Drying herbs under the eave
  const hx = x - Math.sin(rotY) * 3.0;
  const hz = z - Math.cos(rotY) * 3.0;
  for (let i = 0; i < 5; i++) {
    b.cylinder('leaf', 0.05, 0.05, 0.7, 4, hx + i * 0.35 - 0.7, groundY + 2.5, hz);
  }
  // Garden planters
  for (let i = 0; i < 3; i++) {
    const gx = hx + Math.cos(rotY) * (2.2 + i * 0.1);
    const gz = hz - Math.sin(rotY) * (2.2 + i * 0.1) + i * 1.1;
    b.box('wood', 1.6, 0.35, 0.7, gx, groundY + 0.18, gz, rotY);
    b.box('leaf', 1.4, 0.3, 0.55, gx, groundY + 0.45, gz, rotY);
  }
}

/** Stone well with wooden roof and bucket. */
export function buildWell(b: StaticBuilder, x: number, z: number, groundY: number): void {
  b.cylinder('stoneDark', 1.05, 1.15, 1.0, 10, x, groundY + 0.5, z, true);
  b.cylinder('stoneMoss', 1.15, 1.15, 0.14, 10, x, groundY + 1.02, z);
  b.addCylinderCollider(x, z, 1.2, groundY, groundY + 1.1);
  // Inner darkness
  b.cylinder('woodDark', 0.9, 0.9, 0.06, 10, x, groundY + 0.62, z);
  // Posts + roof
  b.box('woodDark', 0.18, 2.2, 0.18, x - 0.95, groundY + 1.9, z);
  b.box('woodDark', 0.18, 2.2, 0.18, x + 0.95, groundY + 1.9, z);
  b.add(new THREE.BoxGeometry(2.6, 0.14, 1.6), 'roofRed', x - 0.65, groundY + 3.0, z, 0, 1, 1, 1, 0.5);
  b.add(new THREE.BoxGeometry(2.6, 0.14, 1.6), 'roofRed', x + 0.65, groundY + 3.0, z, 0, 1, 1, 1, -0.5);
  // Crossbar + rope + bucket
  b.cylinder('wood', 0.07, 0.07, 2.0, 6, x, groundY + 3.0, z, false);
  b.box('wood', 0.42, 0.34, 0.42, x, groundY + 1.7, z);
}

/** Market stall with canopy and goods. */
export function buildStall(b: StaticBuilder, x: number, z: number, groundY: number, rotY: number, seed: number): void {
  const rand = mulberry32(seed);
  const canopyColors: Array<keyof typeof MAT> = ['clothRed', 'clothGold', 'sail'];
  const canopy = canopyColors[Math.floor(rand() * 3)];
  b.box('wood', 2.2, 0.1, 1.3, x, groundY + 0.9, z, rotY);
  for (const [px, pz] of [[-1.0, -0.55], [1.0, -0.55], [-1.0, 0.55], [1.0, 0.55]] as Array<[number, number]>) {
    const wx = x + px * Math.cos(rotY) + pz * Math.sin(rotY);
    const wz = z - px * Math.sin(rotY) + pz * Math.cos(rotY);
    b.box('woodDark', 0.1, 2.3, 0.1, wx, groundY + 1.15, wz, rotY);
  }
  // Canopy (slightly sloped cloth)
  const cx = x - Math.sin(rotY) * 0.25;
  const cz = z - Math.cos(rotY) * 0.25;
  b.add(new THREE.BoxGeometry(2.5, 0.06, 1.8), canopy, cx, groundY + 2.35, cz, rotY, 1, 1, 1, 0.18);
  // Goods: sacks, crates, pots
  b.add(new THREE.SphereGeometry(0.28, 8, 6), 'roofThatch', x - 0.6, groundY + 1.15, z + 0.2, rotY, 1, 0.8, 1);
  b.add(new THREE.SphereGeometry(0.24, 8, 6), 'roofThatch', x - 0.15, groundY + 1.15, z - 0.15, rotY, 1, 0.75, 1);
  b.box('woodDark', 0.5, 0.4, 0.5, x + 0.55, groundY + 1.15, z + 0.1, rotY + 0.3);
  b.cylinder('woodLight', 0.16, 0.2, 0.3, 8, x + 0.9, groundY + 1.2, z - 0.25, false);
}

/** Wooden dock pier extending toward the water. */
export function buildDock(
  b: StaticBuilder, x: number, z: number, rotY: number, length: number, width: number,
  deckY: number, colliders = true,
): void {
  const dirX = Math.sin(rotY);
  const dirZ = Math.cos(rotY);
  const segs = Math.ceil(length / 4);
  for (let i = 0; i <= segs; i++) {
    const px = x + dirX * (i * length / segs);
    const pz = z + dirZ * (i * length / segs);
    // Piles
    for (const side of [-1, 1]) {
      const sx = px + side * width / 2 * Math.cos(rotY);
      const sz = pz - side * width / 2 * Math.sin(rotY);
      b.cylinder('woodDark', 0.16, 0.18, 5.5, 6, sx, deckY - 2.4, sz, colliders);
      if (colliders) b.addCylinderCollider(sx, sz, 0.24, deckY - 5, deckY + 0.1);
    }
  }
  // Deck planks
  const planks = Math.ceil(length / 0.62);
  for (let i = 0; i < planks; i++) {
    const px = x + dirX * (i * length / planks + 0.3);
    const pz = z + dirZ * (i * length / planks + 0.3);
    b.box('woodLight', width, 0.1, 0.5, px, deckY, pz, rotY);
  }
  // Mooring bollards + rope coils
  for (const i of [1, Math.max(1, segs - 1)]) {
    const px = x + dirX * (i * length / segs);
    const pz = z + dirZ * (i * length / segs);
    b.cylinder('woodDark', 0.14, 0.18, 0.42, 6, px + width / 2 * 0.8 * Math.cos(rotY), deckY + 0.25, pz - width / 2 * 0.8 * Math.sin(rotY), false);
    b.add(new THREE.TorusGeometry(0.28, 0.055, 6, 12), 'roofThatch',
      px - width / 2 * 0.8 * Math.cos(rotY), deckY + 0.12, pz + width / 2 * 0.8 * Math.sin(rotY), 0, 1, 1, 1, Math.PI / 2);
  }
  if (colliders) {
    // Deck as a walkable thin platform (player ground snapping handles it)
    const ex = x + dirX * length / 2;
    const ez = z + dirZ * length / 2;
    b.addBoxCollider(ex, deckY - 0.05, ez, width, 0.24, length, rotY);
  }
}

/** The “Colibrí de Mar” — the player's inherited caravel, docked & under repair. */
export function buildShip(
  b: StaticBuilder, x: number, z: number, rotY: number, waterY: number,
  extras?: { lanternLight?: (x: number, y: number, z: number) => void },
): void {
  const hullMat: keyof typeof MAT = 'woodDark';
  const Y = waterY + 0.85; // deck height reference
  // --- Hull: keel + bottoms + sides with slight curves ---
  const L = 15, W = 3.6;
  const sections = 9;
  for (let i = 0; i < sections; i++) {
    const t = i / (sections - 1); // 0 bow … 1 stern
    const along = (t - 0.5) * L;
    // Hull width profile (narrow at bow/stern, full midship)
    const widthProf = Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.68)) * 0.72 + 0.28;
    const w = W * widthProf;
    // Bottom curve: hull rises at bow & stern
    const rocker = Math.pow(Math.abs(t - 0.45) * 2, 2.2) * 1.15;
    const hullH = 1.9;
    const px = x + Math.sin(rotY) * along;
    const pz = z + Math.cos(rotY) * along;
    const py = Y - 0.95 + rocker * 0.5;
    // Central bottom block
    b.add(new THREE.BoxGeometry(w * 0.96, hullH * 0.5, L / sections + 0.06), hullMat, px, py - hullH * 0.25, pz, rotY);
    // Side planks (two per side, slight tumblehome)
    for (const side of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.16, hullH, L / sections + 0.06), 'wood', px + side * (w / 2) * Math.cos(rotY), py, pz - side * (w / 2) * Math.sin(rotY), rotY);
      b.add(new THREE.BoxGeometry(0.14, hullH * 0.5, L / sections + 0.04), 'wood', px + side * (w / 2 + 0.1) * Math.cos(rotY), py + hullH * 0.62, pz - side * (w / 2 + 0.1) * Math.sin(rotY), rotY, 1, 1, 1, side * 0.1 * Math.cos(rotY), 0);
    }
  }
  // Stern castle (raised quarterdeck)
  const sternA = (0.5 - 0.12) * L;
  b.add(new THREE.BoxGeometry(W * 0.85, 1.15, 3.4), 'wood', x + Math.sin(rotY) * sternA, Y + 0.62, z + Math.cos(rotY) * sternA, rotY);
  b.add(new THREE.BoxGeometry(W * 0.95, 0.14, 3.7), 'woodLight', x + Math.sin(rotY) * sternA, Y + 1.28, z + Math.cos(rotY) * sternA, rotY);
  // Bow deck
  const bowA = -(0.5 - 0.08) * L;
  b.add(new THREE.BoxGeometry(W * 0.6, 0.14, 2.6), 'woodLight', x + Math.sin(rotY) * bowA, Y + 0.12, z + Math.cos(rotY) * bowA, rotY);
  // Main deck
  b.add(new THREE.BoxGeometry(W * 0.9, 0.14, L * 0.62), 'woodLight', x - Math.sin(rotY) * 0.8, Y + 0.12, z - Math.cos(rotY) * 0.8, rotY);
  // Hatch
  b.add(new THREE.BoxGeometry(1.1, 0.3, 1.4), 'woodDark', x - Math.sin(rotY) * 0.8, Y + 0.32, z - Math.cos(rotY) * 0.8, rotY);
  // Railings
  for (let i = 0; i < 10; i++) {
    const t = (i / 9 - 0.5) * L * 0.92;
    const widthProf = Math.sin(Math.PI * Math.min(1, 0.18 + (t / L + 0.5) * 0.68)) * 0.72 + 0.28;
    const w = W * widthProf;
    for (const side of [-1, 1]) {
      b.cylinder('woodDark', 0.05, 0.05, 0.75, 5, x + Math.sin(rotY) * t + side * (w / 2) * Math.cos(rotY), Y + 0.55, z + Math.cos(rotY) * t - side * (w / 2) * Math.sin(rotY), false);
    }
  }
  b.add(new THREE.BoxGeometry(0.08, 0.08, L * 0.9), 'wood', x + (W / 2) * 0.95 * Math.cos(rotY), Y + 0.92, z - (W / 2) * 0.95 * Math.sin(rotY), rotY);
  b.add(new THREE.BoxGeometry(0.08, 0.08, L * 0.9), 'wood', x - (W / 2) * 0.95 * Math.cos(rotY), Y + 0.92, z + (W / 2) * 0.95 * Math.sin(rotY), rotY);

  // --- Masts & rigging ---
  const mainMast = { x: x - Math.sin(rotY) * 1.2, z: z - Math.cos(rotY) * 1.2 };
  const foreMast = { x: x + Math.sin(rotY) * 4.4, z: z + Math.cos(rotY) * 4.4 };
  b.cylinder('wood', 0.16, 0.22, 13.5, 8, mainMast.x, Y + 6.5, mainMast.z, true);
  b.addCylinderCollider(mainMast.x, mainMast.z, 0.3, Y, Y + 13);
  b.cylinder('wood', 0.12, 0.16, 10.5, 8, foreMast.x, Y + 5.1, foreMast.z, true);
  b.addCylinderCollider(foreMast.x, foreMast.z, 0.25, Y, Y + 10);
  // Walkable deck platforms
  b.addBoxCollider(x - Math.sin(rotY) * 0.8, Y + 0.06, z - Math.cos(rotY) * 0.8, W * 0.9, 0.24, L * 0.62, rotY);
  b.addBoxCollider(x + Math.sin(rotY) * sternA, Y + 1.22, z + Math.cos(rotY) * sternA, W * 0.85, 0.24, 3.4, rotY);
  b.addBoxCollider(x + Math.sin(rotY) * bowA, Y + 0.06, z + Math.cos(rotY) * bowA, W * 0.6, 0.24, 2.6, rotY);
  // Yards (fore-and-aft slightly angled) — main yard broken (under repair)
  b.add(new THREE.BoxGeometry(7.4, 0.12, 0.12), 'woodDark', mainMast.x, Y + 9.6, mainMast.z, rotY);
  b.add(new THREE.BoxGeometry(5.2, 0.1, 0.1), 'woodDark', foreMast.x + Math.cos(rotY) * 0.5, Y + 8.2, foreMast.z - Math.sin(rotY) * 0.5, rotY + 0.22); // broken/askew
  // Furled sails (rolled cloth around the yards)
  b.box('sail', 6.8, 0.46, 0.42, mainMast.x, Y + 9.42, mainMast.z, rotY);
  b.box('sail', 4.6, 0.4, 0.38, foreMast.x + Math.cos(rotY) * 0.5, Y + 8.12, foreMast.z - Math.sin(rotY) * 0.5, rotY + 0.22);
  // Bowsprit (tilted forward, rotX orients the Y-cylinder along the hull)
  const bowX = x + Math.sin(rotY) * (L / 2 + 1.6);
  const bowZ = z + Math.cos(rotY) * (L / 2 + 1.6);
  b.add(new THREE.CylinderGeometry(0.09, 0.13, 4.6, 7), 'wood',
    (x + Math.sin(rotY) * (L / 2 - 0.6) + bowX) / 2, Y + 1.55, (z + Math.cos(rotY) * (L / 2 - 0.6) + bowZ) / 2,
    rotY, 1, 1, 1, 0, Math.PI / 2 + 0.1);
  // Rudder + tiller
  const rudX = x - Math.sin(rotY) * (L / 2 + 0.1);
  const rudZ = z - Math.cos(rotY) * (L / 2 + 0.1);
  b.add(new THREE.BoxGeometry(0.12, 2.0, 0.9), 'woodDark', rudX, Y - 0.7, rudZ, rotY);
  // Rigging lines
  const rig = (fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number) => {
    const dx = toX - fromX, dy = toY - fromY, dz = toZ - fromZ;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const cx = (fromX + toX) / 2, cy = (fromY + toY) / 2, cz = (fromZ + toZ) / 2;
    // Thin line as scaled box oriented via lookAt — approximate with cylinder between points
    const geo = new THREE.CylinderGeometry(0.02, 0.02, len, 4);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx / len, dy / len, dz / len),
    );
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), q, new THREE.Vector3(1, 1, 1));
    b.add(geo.applyMatrix4(m), 'woodDark', 0, 0, 0);
  };
  rig(mainMast.x, Y + 12.8, mainMast.z, bowX, Y + 1.8, bowZ);
  rig(mainMast.x, Y + 12.8, mainMast.z, x - Math.sin(rotY) * 6.6, Y + 1.4, z - Math.cos(rotY) * 6.6);
  rig(mainMast.x, Y + 12.8, mainMast.z, x + Math.sin(rotY) * 1.5, Y + 1.4, z + Math.cos(rotY) * 1.5);
  rig(foreMast.x, Y + 9.9, foreMast.z, bowX, Y + 1.6, bowZ);
  // Stern lantern
  const lanX = x - Math.sin(rotY) * (L / 2 - 0.4);
  const lanZ = z - Math.cos(rotY) * (L / 2 - 0.4);
  b.cylinder('metal', 0.16, 0.2, 0.42, 6, lanX, Y + 1.75, lanZ);
  b.add(new THREE.BoxGeometry(0.22, 0.3, 0.22), 'glow', lanX, Y + 1.75, lanZ);
  extras?.lanternLight?.(lanX, Y + 1.8, lanZ);
  // Repair scaffolding on the starboard side
  const scafX = x + Math.cos(rotY) * (W / 2 + 1.4);
  const scafZ = z - Math.sin(rotY) * (W / 2 + 1.4);
  for (const off of [-2, 0.5, 3]) {
    b.cylinder('wood', 0.09, 0.09, 4.4, 5, scafX + Math.sin(rotY) * off, Y + 1.4, scafZ + Math.cos(rotY) * off, false);
    b.cylinder('wood', 0.09, 0.09, 4.4, 5, scafX + Math.cos(rotY) * 1.6 + Math.sin(rotY) * off, Y + 1.4, scafZ - Math.sin(rotY) * 1.6 + Math.cos(rotY) * off, false);
  }
  b.box('woodLight', 0.7, 0.1, 5.4, scafX + Math.cos(rotY) * 0.8, Y + 2.6, scafZ - Math.sin(rotY) * 0.8, rotY);
  // Patched hull planks (fresh wood) — visible repair state
  b.box('woodLight', 0.1, 0.8, 2.2, x + Math.cos(rotY) * (W / 2 + 0.08), Y - 0.2, z - Math.sin(rotY) * (W / 2 + 0.08) + 0.5, rotY);
}
