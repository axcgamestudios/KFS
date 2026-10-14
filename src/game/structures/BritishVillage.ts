import * as THREE from 'three';
import { StaticBuilder, MAT } from './Materials';
import { buildCobblePlaza } from './StonePaths';
import { mulberry32 } from '../core/MathUtils';

/**
 * Fase 18 — CROWHAVEN, REBUILT AS A BRITISH VILLAGE.
 *
 * Tudor-style cottages with REAL interiors (walk in through the door gap),
 * a stone fountain on the village green, a proper stable with stalls, and
 * exterior dressing (hedges, flower boxes, cobble paths).
 *
 * The cabin is hollow: 4 plaster walls on a stone plinth, timber framing,
 * a steep gabled roof, an open doorway (1.15 m gap, no collider) and
 * role-furnished interiors (fisher / maester / shop / inn / smith / dwarf).
 */

export type CabinRole = 'fisher' | 'maester' | 'shop' | 'inn' | 'smith' | 'dwarf';

export interface CabinOpts {
  x: number;
  z: number;
  groundY: number;
  rotY: number;
  /** Footprint (m). */
  w?: number;
  d?: number;
  role: CabinRole;
  roof?: 'thatch' | 'slate';
  seed?: number;
  /** Returns useful interior/exterior anchor points (world space). */
  anchors?: (a: CabinAnchors) => void;
}

export interface CabinAnchors {
  /** Center of the interior floor (world). */
  inside: THREE.Vector3;
  /** Just outside the door (world). */
  doorOut: THREE.Vector3;
  /** Hearth / forge glow point (world) — for light wiring. */
  hearth: THREE.Vector3;
  /** Corner spot for a chest (world). */
  chestSpot: THREE.Vector3;
}

/** A water-looking material for the fountain (shared, via MAT so the
 *  StaticBuilder can merge it — key 'fountainWater' in Materials.ts). */
void MAT;

export function buildBritishCabin(b: StaticBuilder, o: CabinOpts): void {
  const rand = mulberry32(o.seed ?? 7);
  const w = o.w ?? 6.4;
  const d = o.d ?? 7.6;
  const role = o.role;
  const roofKey = o.roof ?? (role === 'smith' || role === 'dwarf' ? 'slate' : 'thatch');
  const { x, z, groundY, rotY } = o;

  // local (px, pz) -> world, same convention as buildHouse
  const LW = (px: number, pz: number): [number, number] => [
    x + px * Math.cos(rotY) + pz * Math.sin(rotY),
    z - px * Math.sin(rotY) + pz * Math.cos(rotY),
  ];
  /** Local point + height -> world Vector3 (x, y, z in the right order). */
  const V = (px: number, pz: number, py: number): THREE.Vector3 => {
    const [wx, wz] = LW(px, pz);
    return new THREE.Vector3(wx, py, wz);
  };
  /** Same, as a spreadable [x, y, z] tuple (for b.add / b.cylinder calls). */
  const P = (px: number, pz: number, py: number): [number, number, number] => {
    const [wx, wz] = LW(px, pz);
    return [wx, py, wz];
  };
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  // A box whose local +Z faces the cabin door direction (+Z local)
  const put = (key: Parameters<StaticBuilder['box']>[0], bw: number, bh: number, bd: number,
    px: number, py: number, pz: number, rot = rotY, solid = false) => {
    const [wx, wz] = LW(px, pz);
    if (solid) b.solidBox(key, bw, bh, bd, wx, py, wz, rot);
    else b.box(key, bw, bh, bd, wx, py, wz, rot);
  };

  const hw = w / 2;
  const hd = d / 2;
  const y0 = groundY + 0.32;          // top of the plinth
  const wallH = 2.55;
  const wallT = 0.18;
  const doorW = 1.15;

  // ---- Stone plinth (perimeter curb) ----
  put('stoneDark', w + 0.36, 0.32, 0.42, 0, groundY + 0.16, +hd, rotY, true);
  put('stoneDark', w + 0.36, 0.32, 0.42, 0, groundY + 0.16, -hd, rotY, true);
  put('stoneDark', 0.42, 0.32, d - 0.2, +hw, groundY + 0.16, 0, rotY, true);
  put('stoneDark', 0.42, 0.32, d - 0.2, -hw, groundY + 0.16, 0, rotY, true);

  // ---- Interior floor (thin walkable planks) ----
  put('woodLight', w - 0.28, 0.1, d - 0.28, 0, y0 + 0.05, 0, rotY, true);

  // ---- Walls: back (-Z), sides (±X), front (+Z with door gap) ----
  // back wall
  put('plaster', w, wallH, wallT, 0, y0 + wallH / 2, -hd + 0.09, rotY, true);
  // side walls
  put('plaster', wallT, wallH, d, +hw - 0.09, y0 + wallH / 2, 0, rotY, true);
  put('plaster', wallT, wallH, d, -hw + 0.09, y0 + wallH / 2, 0, rotY, true);
  // front wall: two segments + lintel over the door
  const segW = (w - doorW) / 2;
  put('plaster', segW, wallH, wallT, -(doorW / 2 + segW / 2), y0 + wallH / 2, +hd - 0.09, rotY, true);
  put('plaster', segW, wallH, wallT, +(doorW / 2 + segW / 2), y0 + wallH / 2, +hd - 0.09, rotY, true);
  put('plaster', doorW + 0.2, wallH - 2.05, wallT, 0, y0 + 2.05 + (wallH - 2.05) / 2, +hd - 0.09, rotY, true);

  // ---- Timber framing (visual, outside the plaster) ----
  const posts: Array<[number, number]> = [
    [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd],
    [-hw, 0], [hw, 0],
  ];
  for (const [px, pz] of posts) {
    put('timber', 0.2, wallH, 0.2, px, y0 + wallH / 2, pz + (pz > 0 ? 0.02 : -0.02));
  }
  // horizontal beams (front & back) + mid-rail
  for (const pz of [-hd - 0.02, hd + 0.02]) {
    put('timber', w + 0.14, 0.17, 0.15, 0, y0 + wallH - 0.09, pz);
    put('timber', w + 0.1, 0.13, 0.12, 0, y0 + 1.32, pz);
  }
  // diagonal braces on the front (classic Tudor X)
  for (const side of [-1, 1]) {
    const bx = side * (doorW / 2 + segW / 2);
    put('timber', 0.12, 0.12, segW * 0.92, bx, y0 + 1.05, hd + 0.03, rotY + side * 0.42);
    put('timber', 0.12, 0.12, segW * 0.92, bx, y0 + 2.0, hd + 0.03, rotY - side * 0.42);
  }
  // door frame + open door leaf
  put('woodDark', 0.16, 2.1, 0.22, -doorW / 2 - 0.06, y0 + 1.05, hd + 0.04, rotY, true);
  put('woodDark', 0.16, 2.1, 0.22, +doorW / 2 + 0.06, y0 + 1.05, hd + 0.04, rotY, true);
  put('woodDark', doorW + 0.3, 0.18, 0.24, 0, y0 + 2.16, hd + 0.04, rotY);
  // the leaf, swung open ~105°
  {
    const [hx, hz] = LW(-doorW / 2, hd + 0.05);
    b.box('wood', 0.08, 2.0, doorW - 0.08, hx + (doorW / 2) * c * 0.42, y0 + 1.02,
      hz - (doorW / 2) * s * 0.42, rotY + 1.85);
  }
  // stone step
  put('stoneDark', 1.5, 0.16, 0.55, 0, groundY + 0.24, hd + 0.42, rotY, true);

  // ---- Windows: dark glass + shutters + FLOWER BOX (the British touch) ----
  const winY = y0 + 1.55;
  for (const side of [-1, 1]) {
    const px = side * (hw - 0.02);
    put('woodDark', 0.1, 0.85, 0.72, px, winY, -d * 0.22);
    put('woodDark', 0.1, 0.85, 0.72, px, winY, +d * 0.2);
    // shutters + flower boxes on the two side windows
    for (const wz of [-d * 0.22, d * 0.2]) {
      put('wood', 0.07, 0.8, 0.32, px + side * 0.09, winY, wz - 0.52);
      put('wood', 0.07, 0.8, 0.32, px + side * 0.09, winY, wz + 0.52);
      // flower box (planks + leafy top)
      put('wood', 0.26, 0.2, 0.7, px + side * 0.18, winY - 0.55, wz);
      put('leaf', 0.22, 0.16, 0.64, px + side * 0.18, winY - 0.42, wz);
      for (let fl = 0; fl < 3; fl++) {
        const fx = px + side * 0.2;
        const [fwx, fwz] = LW(fx, wz + (fl - 1) * 0.24);
        b.add(new THREE.SphereGeometry(0.055, 5, 4),
          fl % 2 ? 'clothRed' : 'clothGold', fwx, winY - 0.34, fwz);
      }
    }
  }
  // front window beside the door
  put('woodDark', 0.72, 0.85, 0.1, -(doorW / 2 + segW / 2), winY, hd + 0.02);
  put('wood', 0.3, 0.78, 0.06, -(doorW / 2 + segW / 2) - 0.42, winY, hd + 0.07);
  put('wood', 0.26, 0.2, 0.7, -(doorW / 2 + segW / 2), winY - 0.55, hd + 0.16);
  put('leaf', 0.22, 0.16, 0.6, -(doorW / 2 + segW / 2), winY - 0.42, hd + 0.16);

  // ---- Ceiling beams (visible from inside) ----
  for (let i = 0; i < 4; i++) {
    put('woodDark', w - 0.3, 0.16, 0.16, 0, y0 + wallH - 0.1, -hd + 1.0 + i * (d - 2) / 3);
  }
  put('woodDark', 0.16, 0.16, d - 0.3, -hw + 0.6, y0 + wallH - 0.14, 0);
  put('woodDark', 0.16, 0.16, d - 0.3, hw - 0.6, y0 + wallH - 0.14, 0);

  // ---- Steep gabled roof (explicit add() to control pitch in the yawed frame) ----
  const roofH = 2.5 + rand() * 0.3;
  const topY = y0 + wallH;
  {
    const matKey = (roofKey === 'thatch' ? 'roofThatch' : 'roofSlate') as Parameters<StaticBuilder['add']>[1];
    const slopeLen = Math.sqrt(hd * hd + roofH * roofH) + 0.55;
    const slopeAngle = Math.atan2(roofH, hd);
    const [cx1, cz1] = LW(0, hd / 2);
    const [cx2, cz2] = LW(0, -hd / 2);
    b.add(new THREE.BoxGeometry(w + 0.9, 0.16, slopeLen), matKey, cx1, topY + roofH / 2 - 0.06, cz1, rotY, 1, 1, 1, 0, slopeAngle);
    b.add(new THREE.BoxGeometry(w + 0.9, 0.16, slopeLen), matKey, cx2, topY + roofH / 2 - 0.06, cz2, rotY, 1, 1, 1, 0, -slopeAngle);
    // ridge beam + end finials
    const [rx, rz] = LW(0, 0);
    b.box('woodDark', w + 1.1, 0.18, 0.18, rx, topY + roofH - 0.04, rz, rotY);
    for (const side of [-1, 1]) {
      const [fx2, fz2] = LW(side * (w / 2 + 0.45), 0);
      b.add(new THREE.SphereGeometry(0.12, 6, 5), 'wood', fx2, topY + roofH + 0.06, fz2);
    }
    // gable ends (plaster triangles + timber)
    const shape = new THREE.Shape();
    shape.moveTo(-hd, 0);
    shape.lineTo(hd, 0);
    shape.lineTo(0, roofH);
    shape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
    gableGeo.translate(0, 0, -0.08);
    const [g1x, g1z] = LW(hw - 0.12, 0);
    const [g2x, g2z] = LW(-hw + 0.12, 0);
    b.add(gableGeo.clone(), 'plaster', g1x, topY, g1z, rotY + Math.PI / 2);
    b.add(gableGeo, 'plaster', g2x, topY, g2z, rotY + Math.PI / 2);
  }

  // ---- Stone chimney + hearth (every cottage has a fireplace) ----
  const chX = w * 0.26;
  const chimneyH = wallH + roofH + 1.1;
  put('stoneDark', 0.78, chimneyH, 0.78, chX, y0 + chimneyH / 2, -hd + 0.5, rotY, true);
  put('stoneDark', 1.0, 0.26, 1.0, chX, y0 + chimneyH - 0.1, -hd + 0.5, rotY);
  // the hearth INSIDE: firebox + mantel + glow
  put('stoneDark', 1.5, 1.1, 0.5, chX, y0 + 0.55, -hd + 0.55, rotY, true);
  put('wood', 1.6, 0.14, 0.55, chX, y0 + 1.18, -hd + 0.55, rotY);
  put('glow', 0.9, 0.34, 0.3, chX, y0 + 0.5, -hd + 0.42, rotY);
  // firewood stack beside
  for (let i = 0; i < 5; i++) {
    put('wood', 0.14, 0.14, 0.7, chX - 0.75 + (i % 2) * 0.15, y0 + 0.08 + Math.floor(i / 2) * 0.15, -hd + 0.9 + Math.floor(i / 2) * 0.16, rotY + 0.2);
  }

  // ---- Interior furniture by role ----
  const anchors: CabinAnchors = {
    inside: V(0, 0, y0 + 0.1),
    doorOut: V(0, hd + 1.1, groundY),
    hearth: V(chX, -hd + 0.6, y0 + 0.8),
    chestSpot: V(-hw + 0.85, -hd + 1.15, y0 + 0.1),
  };

  const bed = (px: number, pz: number, rot: number) => {
    put('woodDark', 2.0, 0.3, 1.05, px, y0 + 0.2, pz, rot + rotY, true);
    put('sail', 1.9, 0.18, 0.95, px, y0 + 0.42, pz, rot + rotY);
    put('wood', 2.0, 0.7, 0.12, px, y0 + 0.6, pz - 0.5, rot + rotY);
    b.add(new THREE.SphereGeometry(0.16, 6, 5), 'sail', ...P(px, pz + 0.65, y0 + 0.52));
  };
  const table = (px: number, pz: number, tw = 1.3, td = 0.85) => {
    put('wood', tw, 0.1, td, px, y0 + 0.78, pz, rotY, true);
    put('woodDark', 0.1, 0.74, 0.1, px - tw / 2 + 0.1, y0 + 0.4, pz - td / 2 + 0.1, rotY);
    put('woodDark', 0.1, 0.74, 0.1, px + tw / 2 - 0.1, y0 + 0.4, pz + td / 2 - 0.1, rotY);
  };
  const stool = (px: number, pz: number) => {
    put('woodDark', 0.34, 0.08, 0.34, px, y0 + 0.46, pz, rotY);
    put('woodDark', 0.09, 0.44, 0.09, px, y0 + 0.23, pz, rotY);
  };
  const barrel = (px: number, pz: number, r = 0.38) => {
    const [wx, wz] = LW(px, pz);
    b.cylinder('wood', r, r + 0.05, 0.95, 9, wx, y0 + 0.48, wz, true);
    b.addCylinderCollider(wx, wz, r + 0.05, y0, y0 + 0.95);
    b.add(new THREE.TorusGeometry(r + 0.04, 0.03, 5, 12), 'metal', wx, y0 + 0.68, wz, 0, 1, 1, 1, Math.PI / 2);
  };

  if (role === 'fisher') {
    // Tom: bunk + nets + fish racks + map table
    bed(-hw + 0.95, hd - 1.15, Math.PI);
    // net loom frame on the wall
    put('wood', 1.7, 1.1, 0.08, hw - 0.35, y0 + 1.5, -hd + 1.6, rotY);
    put('sail', 1.5, 0.9, 0.05, hw - 0.28, y0 + 1.5, -hd + 1.6, rotY);
    for (let i = 0; i < 4; i++) put('woodDark', 0.04, 0.9, 0.04, hw - 0.3, y0 + 1.5, -hd + 1.1 + i * 0.34, rotY);
    table(0.3, -0.6, 1.5, 0.9);
    stool(0.3, 0.35);
    // rolled charts + a brass compass on the table
    put('sail', 0.5, 0.06, 0.36, 0.2, y0 + 0.86, -0.65, rotY + 0.3);
    b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8), 'gold', ...P(0.6, -0.55, y0 + 0.83));
    // fishhooks line + oars in the corner
    for (let i = 0; i < 3; i++) {
      put('wood', 0.07, 2.1, 0.07, -hw + 0.35, y0 + 1.05, -hd + 0.5 + i * 0.22, rotY + 0.5 - i * 0.12);
    }
    barrel(hw - 0.7, hd - 0.9);
    barrel(hw - 0.7, hd - 1.8, 0.32);
    anchors.chestSpot.copy(V(-hw + 0.85, -hd + 1.15, y0 + 0.1));
  } else if (role === 'maester') {
    // Aldric: bookshelves + desk + candles + rug
    for (const [px, pz] of [[-hw + 0.45, -hd + 1.0], [-hw + 0.45, -hd + 2.4]] as Array<[number, number]>) {
      put('woodDark', 0.5, 2.1, 1.25, px, y0 + 1.05, pz, rotY, true);
      for (let sh = 0; sh < 3; sh++) {
        put('wood', 0.4, 0.05, 1.15, px + 0.06, y0 + 0.45 + sh * 0.62, pz, rotY);
        for (let bk = 0; bk < 4; bk++) {
          put(bk % 2 ? 'clothRed' : 'clothGold', 0.26, 0.34, 0.2,
            px + 0.08, y0 + 0.65 + sh * 0.62, pz - 0.42 + bk * 0.27, rotY + (bk % 3) * 0.1);
        }
      }
    }
    // writing desk + chair + candle
    table(0.5, -hd + 1.3, 1.55, 0.75);
    stool(0.5, -hd + 0.5);
    put('sail', 0.55, 0.04, 0.42, 0.4, y0 + 0.84, -hd + 1.25, rotY + 0.15);
    b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6), 'woodLight', ...P(0.85, -hd + 1.35, y0 + 0.95));
    b.add(new THREE.SphereGeometry(0.05, 6, 5), 'glow', ...P(0.85, -hd + 1.35, y0 + 1.1));
    // rug + reading chair by the hearth
    put('clothRed', 2.0, 0.035, 1.4, 0.2, y0 + 0.12, 0.9, rotY + 0.2);
    put('woodDark', 0.66, 0.1, 0.66, -0.9, y0 + 0.5, 0.6, rotY);
    put('woodDark', 0.66, 0.8, 0.12, -0.9, y0 + 0.9, 0.32, rotY);
    // a globe of the forgotten seas
    b.add(new THREE.SphereGeometry(0.26, 10, 8), 'sail', ...P(1.2, hd - 0.9, y0 + 1.06));
    b.cylinder('woodDark', 0.05, 0.09, 0.8, 6, ...P(1.2, hd - 0.9, y0 + 0.45));
    // Eirik's sea chest waits by the wall (the real chest spawns on chestSpot)
    anchors.chestSpot.copy(V(0.9, -hd + 0.95, y0 + 0.1));
  } else if (role === 'shop') {
    // Erica: counter + shelves with goods + scale + sacks
    put('wood', 2.6, 0.12, 0.8, 0, y0 + 0.95, hd - 1.7, rotY, true);
    put('woodDark', 0.14, 0.9, 0.14, -1.15, y0 + 0.45, hd - 1.7, rotY);
    put('woodDark', 0.14, 0.9, 0.14, 1.15, y0 + 0.45, hd - 1.7, rotY);
    // goods on the counter
    b.add(new THREE.SphereGeometry(0.14, 7, 6), 'roofThatch', ...P(-0.7, hd - 1.7, y0 + 1.14));
    b.add(new THREE.SphereGeometry(0.12, 7, 6), 'roofThatch', ...P(-0.45, hd - 1.6, y0 + 1.12));
    b.cylinder('woodLight', 0.12, 0.16, 0.26, 8, ...P(0.35, hd - 1.55, y0 + 1.14));
    b.add(new THREE.BoxGeometry(0.24, 0.16, 0.18), 'clothGold', ...P(0.85, hd - 1.75, y0 + 1.08),  rotY + 0.4);
    // wall shelves with pots & cloth bolts
    for (let sh = 0; sh < 2; sh++) {
      put('wood', 2.4, 0.07, 0.5, 0, y0 + 1.45 + sh * 0.62, -hd + 0.4, rotY);
      for (let k = 0; k < 4; k++) {
        b.cylinder('woodLight', 0.1, 0.13, 0.2 + (k % 2) * 0.08, 8, ...P(-0.9 + k * 0.6, -hd + 0.42, y0 + 1.6 + sh * 0.62));
      }
    }
    // coin box under the counter + hanging scale
    put('woodDark', 0.5, 0.3, 0.36, 0.75, y0 + 0.18, hd - 1.4, rotY);
    b.add(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4), 'metal', ...P(-0.2, hd - 1.7, y0 + 1.55));
    b.add(new THREE.ConeGeometry(0.14, 0.12, 6, 1, true), 'metal', ...P(-0.2, hd - 1.7, y0 + 1.44),  rotY, 1, 1, 1, Math.PI);
    // sacks in the corner
    for (let i = 0; i < 3; i++) {
      b.add(new THREE.SphereGeometry(0.26, 7, 6), 'roofThatch', ...P(-hw + 0.6 + i * 0.3, hd - 0.7, y0 + 0.3 + i * 0.02),  rotY, 1, 0.85, 1);
    }
    anchors.chestSpot.copy(V(-hw + 0.85, -hd + 1.15, y0 + 0.1));
  } else if (role === 'inn') {
    // Rosa: hearth cauldron + two tables + ale barrels + mug shelf
    table(-0.7, 0.4, 1.5, 0.95);
    stool(-1.5, 0.4); stool(0.1, 0.4); stool(-0.7, 1.1); stool(-0.7, -0.3);
    table(1.35, -1.5, 1.1, 0.8);
    stool(1.35, -0.7);
    // cauldron over the hearth
    b.add(new THREE.CylinderGeometry(0.34, 0.26, 0.4, 9), 'metal', ...P(chX, -hd + 0.72, y0 + 0.52));
    b.add(new THREE.TorusGeometry(0.3, 0.03, 5, 12), 'metal', ...P(chX, -hd + 0.72, y0 + 0.62),  0, 1, 1, 1, Math.PI / 2);
    // mug shelf + tankards
    put('wood', 1.9, 0.08, 0.4, -0.2, y0 + 1.5, -hd + 0.42, rotY);
    for (let m = 0; m < 4; m++) {
      b.cylinder('woodLight', 0.07, 0.09, 0.16, 7, ...P(-0.8 + m * 0.42, -hd + 0.44, y0 + 1.62));
    }
    // ale barrels + a cozy corner bed (the innkeeper sleeps by the fire)
    barrel(-hw + 0.75, hd - 0.95);
    barrel(-hw + 0.75, hd - 1.85, 0.33);
    bed(hw - 1.1, -hd + 1.0, Math.PI / 2);
    // hanging dried herbs (Rosa dyes the sailcloth with petals)
    for (let i = 0; i < 4; i++) {
      b.cylinder('leaf', 0.03, 0.03, 0.45, 4, ...P(-1.4 + i * 0.35, -hd + 0.5, y0 + 2.1));
    }
    anchors.chestSpot.copy(V(hw - 0.85, hd - 1.2, y0 + 0.1));
  } else if (role === 'smith') {
    // Bram: forge + anvil + quench barrel + weapon rack + tool wall
    // (the chimney/hearth above already is the forge)
    put('stoneDark', 1.7, 0.95, 0.9, chX, y0 + 0.48, -hd + 0.85, rotY, true);
    put('glow', 1.1, 0.3, 0.5, chX, y0 + 0.55, -hd + 0.7, rotY);
    put('stoneDark', 1.9, 0.24, 1.0, chX, y0 + 1.05, -hd + 0.85, rotY);
    // anvil on a stump
    const [ax2, az2] = LW(chX - 1.7, -hd + 1.5);
    b.cylinder('woodDark', 0.34, 0.4, 0.62, 8, ax2, y0 + 0.31, az2, true);
    b.addCylinderCollider(ax2, az2, 0.42, y0, y0 + 0.62);
    b.box('metal', 0.85, 0.26, 0.36, ax2, y0 + 0.75, az2, rotY);
    b.box('metal', 0.3, 0.2, 0.3, ax2, y0 + 0.92, az2, rotY);
    // quench barrel
    barrel(-hw + 0.8, -hd + 1.0, 0.42);
    b.cylinder('metal', 0.36, 0.36, 0.06, 9, ...P(-hw + 0.8, -hd + 1.0, y0 + 0.85));
    // weapon rack + hammers on the wall
    put('wood', 1.6, 0.1, 0.4, hw - 0.4, y0 + 1.15, -hd + 1.3, rotY);
    put('woodDark', 0.1, 1.1, 0.1, hw - 0.4, y0 + 0.6, -hd + 1.3, rotY);
    for (let k = 0; k < 3; k++) {
      put('metal', 0.06, 0.55, 0.06, hw - 0.42, y0 + 1.35, -hd + 0.95 + k * 0.35, rotY + 0.4);
      put('wood', 0.14, 0.18, 0.18, hw - 0.42, y0 + 1.62, -hd + 0.95 + k * 0.35, rotY + 0.4);
    }
    // coal pile
    for (let i = 0; i < 6; i++) {
      b.add(new THREE.IcosahedronGeometry(0.11 + rand() * 0.05, 0), 'stoneDark',
        ...P(chX + 0.9 + (rand() - 0.5) * 0.6, -hd + 0.85 + (rand() - 0.5) * 0.5, y0 + 0.1 + rand() * 0.08));
    }
    anchors.chestSpot.copy(V(-hw + 0.85, hd - 1.2, y0 + 0.1));
  } else {
    // dwarf (Borin): heavier everything — stone forge, big anvil, ore, runes
    put('stoneDark', 2.0, 1.05, 1.0, chX, y0 + 0.52, -hd + 0.9, rotY, true);
    put('glow', 1.3, 0.34, 0.55, chX, y0 + 0.6, -hd + 0.72, rotY);
    put('stoneDark', 2.2, 0.28, 1.1, chX, y0 + 1.15, -hd + 0.9, rotY);
    // double anvil on a granite block
    const [ax3, az3] = LW(chX - 1.9, -hd + 1.6);
    b.box('stoneDark', 0.9, 0.55, 0.9, ax3, y0 + 0.28, az3, rotY);
    b.addBoxCollider(ax3, y0 + 0.28, az3, 0.9, 0.55, 0.9, rotY);
    b.box('metal', 1.1, 0.3, 0.44, ax3, y0 + 0.7, az3, rotY);
    b.box('metal', 0.36, 0.24, 0.36, ax3, y0 + 0.9, az3, rotY);
    // ore crates + ingot stack
    put('woodDark', 0.8, 0.8, 0.8, -hw + 0.7, y0 + 0.45, -hd + 1.0, rotY + 0.2, true);
    put('woodDark', 0.7, 0.7, 0.7, -hw + 0.7, y0 + 1.25, -hd + 1.05, rotY - 0.3, true);
    for (let i = 0; i < 4; i++) {
      b.add(new THREE.BoxGeometry(0.3, 0.12, 0.16), 'gold', ...P(hw - 0.8 + (i % 2) * 0.34, -hd + 1.2 + Math.floor(i / 2) * 0.2, y0 + 0.1 + Math.floor(i / 2) * 0.13),  rotY + 0.2);
    }
    // runic pillar (dwarf work-sign)
    const [rpx, rpz] = LW(-hw + 0.55, hd - 1.4);
    b.cylinder('stone', 0.22, 0.28, 1.7, 7, rpx, y0 + 0.85, rpz, true);
    b.addCylinderCollider(rpx, rpz, 0.3, y0, y0 + 1.7);
    b.cylinder('rune', 0.2, 0.2, 0.35, 7, rpx, y0 + 1.75, rpz);
    anchors.chestSpot.copy(V(-hw + 0.85, hd - 1.2, y0 + 0.1));
  }

  o.anchors?.(anchors);
}

/** The village green fountain — two stone tiers, water jet, curb benches.
 *  Fase 23 — the old 18-gon cobble disc (a flat polygonal plate that
 *  floated half a metre over the sloped green) is now a true flagstone
 *  plaza: concentric brick-staggered courses sunk and tilted to the
 *  terrain, a proud kerb ring, trodden earth in the joints. */
export function buildFountain(
  b: StaticBuilder, x: number, z: number, groundY: number,
  terrainH?: (x: number, z: number) => number,
): { waterJet: THREE.Vector3 } {
  // the plaza conforms to the real terrain (the green is NOT a flat pad —
  // a level disc here would float on the downhill rim)
  buildCobblePlaza(b, mulberry32(150 + Math.round(x * 7 + z)), x, z, 2.75, 6.35,
    terrainH ?? (() => groundY));
  // curb ring seats — each bench sits at ITS OWN terrain height (the green
  // slopes; a ring of benches at the centre's height floated downhill)
  const seatH = terrainH ?? (() => groundY);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const bx = x + Math.cos(a) * 5.4;
    const bz = z + Math.sin(a) * 5.4;
    b.box('stone', 1.5, 0.42, 0.5, bx, seatH(bx, bz) + 0.18, bz, -a + Math.PI / 2);
  }
  // lower basin
  b.cylinder('stoneDark', 2.5, 2.65, 0.62, 16, x, groundY + 0.31, z);
  b.addCylinderCollider(x, z, 2.75, groundY, groundY + 0.62);
  // water surface (lower basin)
  b.add(new THREE.CylinderGeometry(2.3, 2.3, 0.06, 16), 'fountainWater', x, groundY + 0.58, z);
  // pedestal + upper bowl
  b.cylinder('stone', 0.42, 0.55, 1.5, 10, x, groundY + 1.35, z, true);
  b.addCylinderCollider(x, z, 0.55, groundY, groundY + 2.0);
  b.cylinder('stone', 1.15, 0.85, 0.5, 12, x, groundY + 2.2, z);
  b.cylinder('stoneDark', 1.2, 1.2, 0.1, 12, x, groundY + 2.48, z);
  // water jet (falling columns) + finial sphere
  for (const [jr, jh] of [[0.07, 1.15], [0.045, 0.8]] as Array<[number, number]>) {
    b.add(new THREE.CylinderGeometry(jr, jr * 1.4, jh, 8), 'fountainWater', x, groundY + 2.55 + jh / 2, z);
  }
  // upper bowl water film
  b.add(new THREE.CylinderGeometry(1.02, 1.02, 0.05, 12), 'fountainWater', x, groundY + 2.52, z);
  b.add(new THREE.SphereGeometry(0.16, 8, 6), 'stoneDark', x, groundY + 3.55, z);
  // carved tide-spiral on the pedestal (the Order's mark)
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    b.add(new THREE.TorusGeometry(0.4, 0.035, 5, 14), 'metal', x + Math.cos(a) * 0.45, groundY + 1.15 + i * 0.22, z + Math.sin(a) * 0.45, 0, 1, 1, 1, Math.PI / 2 + i * 0.3);
  }
  return { waterJet: new THREE.Vector3(x, groundY + 2.6, z) };
}

/** Halvard's stable — stalls, hay loft smell, tack wall, fenced yard. */
export function buildVillageStable(
  b: StaticBuilder, x: number, z: number, groundY: number, rotY: number,
): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const LW = (px: number, pz: number): [number, number] => [
    x + px * Math.cos(rotY) + pz * Math.sin(rotY),
    z - px * Math.sin(rotY) + pz * Math.cos(rotY),
  ];
  const put = (key: Parameters<StaticBuilder['box']>[0], bw: number, bh: number, bd: number,
    px: number, py: number, pz: number, rot = rotY, solid = false) => {
    const [wx, wz] = LW(px, pz);
    if (solid) b.solidBox(key, bw, bh, bd, wx, py, wz, rot);
    else b.box(key, bw, bh, bd, wx, py, wz, rot);
  };
  /** Local + height -> spreadable [x, y, z]. */
  const P = (px: number, pz: number, py: number): [number, number, number] => {
    const [wx, wz] = LW(px, pz);
    return [wx, py, wz];
  };
  void c; void s;
  const w = 9.5;
  const d = 7.5;
  const hw = w / 2;
  const hd = d / 2;
  const y0 = groundY + 0.2;
  const wallH = 2.9;

  // plinth + floor
  put('stoneDark', w + 0.3, 0.2, 0.4, 0, groundY + 0.1, +hd, rotY, true);
  put('stoneDark', w + 0.3, 0.2, 0.4, 0, groundY + 0.1, -hd, rotY, true);
  put('stoneDark', 0.4, 0.2, d, +hw, groundY + 0.1, 0, rotY, true);
  put('stoneDark', 0.4, 0.2, d, -hw, groundY + 0.1, 0, rotY, true);
  put('dirt', w - 0.3, 0.08, d - 0.3, 0, y0 + 0.04, 0, rotY, true);

  // back + side walls (solid), front open like a real stable (posts + half wall)
  put('wood', w, wallH, 0.2, 0, y0 + wallH / 2, -hd + 0.1, rotY, true);
  put('wood', 0.2, wallH, d, +hw - 0.1, y0 + wallH / 2, 0, rotY, true);
  put('wood', 0.2, wallH, d, -hw + 0.1, y0 + wallH / 2, 0, rotY, true);
  // front: posts + half-wall with 2 wide openings (horses walk in)
  for (const px of [-hw + 0.2, -w / 6, w / 6, hw - 0.2]) {
    put('timber', 0.3, wallH, 0.3, px, y0 + wallH / 2, hd - 0.1, rotY, true);
  }
  put('wood', w / 3 - 0.3, 1.15, 0.18, -(hw + w / 6) / 2 + 0.05, y0 + 0.58, hd - 0.1, rotY, true);
  put('wood', w / 3 - 0.3, 1.15, 0.18, (hw + w / 6) / 2 - 0.05, y0 + 0.58, hd - 0.1, rotY, true);

  // roof (slate, moderate pitch)
  const roofH = 2.2;
  const slopeLen = Math.sqrt(hd * hd + roofH * roofH) + 0.6;
  const slopeAngle = Math.atan2(roofH, hd);
  const [c1x, c1z] = LW(0, hd / 2);
  const [c2x, c2z] = LW(0, -hd / 2);
  b.add(new THREE.BoxGeometry(w + 1.0, 0.18, slopeLen), 'roofSlate', c1x, y0 + wallH + roofH / 2 - 0.05, c1z, rotY, 1, 1, 1, 0, slopeAngle);
  b.add(new THREE.BoxGeometry(w + 1.0, 0.18, slopeLen), 'roofSlate', c2x, y0 + wallH + roofH / 2 - 0.05, c2z, rotY, 1, 1, 1, 0, -slopeAngle);
  const [rx, rz] = LW(0, 0);
  b.box('woodDark', w + 1.2, 0.2, 0.2, rx, y0 + wallH + roofH, rz, rotY);

  // --- interior: 3 stalls with partitions, troughs, tack wall ---
  for (const px of [-2.45, 2.45]) {
    put('woodDark', 0.14, 1.5, d - 1.6, px, y0 + 0.75, 0.2, rotY, true);
    // stall gate
    put('wood', 0.1, 1.1, 2.1, px + (px < 0 ? 1.1 : -1.1), y0 + 0.55, hd - 1.5, rotY);
  }
  // troughs along the back wall
  for (const px of [-3.2, 0, 3.2]) {
    put('wood', 1.7, 0.4, 0.6, px, y0 + 0.25, -hd + 0.65, rotY, true);
    put('roofThatch', 1.55, 0.22, 0.5, px, y0 + 0.5, -hd + 0.65, rotY);
  }
  // hay pile + hay hooks
  for (let i = 0; i < 5; i++) {
    b.add(new THREE.SphereGeometry(0.34 + (i % 3) * 0.08, 7, 6), 'roofThatch',
      ...P(1.6 + (i % 2) * 0.5, -hd + 1.7 + i * 0.42, y0 + 0.3),  rotY, 1, 0.7, 1);
  }
  // tack wall: bridles + saddles + horseshoes
  put('wood', 2.2, 1.0, 0.1, -hw + 0.35, y0 + 1.6, -0.6, rotY + Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    b.add(new THREE.TorusGeometry(0.16, 0.03, 5, 12), 'metal', ...P(-hw + 0.42, -1.1 + i * 0.55, y0 + 1.7));
    b.add(new THREE.BoxGeometry(0.5, 0.1, 0.4), 'roofThatch', ...P(-hw + 0.42, -1.1 + i * 0.55, y0 + 1.32),  rotY);
  }
  // fenced yard in front
  for (let i = 0; i < 10; i++) {
    const px = -hw + 0.6 + i * (w - 1.2) / 9;
    put('timber', 0.14, 1.25, 0.14, px, y0 + 0.62, hd + 4.2 + (i % 2) * 0.3, rotY);
  }
  const [f1x, f1z] = LW(0, hd + 4.35);
  b.box('timber', w + 0.4, 0.12, 0.12, f1x, y0 + 1.1, f1z, rotY);
  b.box('timber', w + 0.4, 0.12, 0.12, f1x, y0 + 0.55, f1z, rotY);
  // stable sign (a horseshoe)
  const [sgx, sgz] = LW(hw - 0.1, hd + 0.4);
  b.box('wood', 0.9, 0.5, 0.07, sgx + 0.55 * Math.cos(rotY), y0 + 2.3, sgz - 0.55 * Math.sin(rotY), rotY);
  b.add(new THREE.TorusGeometry(0.16, 0.045, 6, 12), 'metal', sgx + 0.55 * Math.cos(rotY), y0 + 2.3, sgz - 0.55 * Math.sin(rotY), 0, 1, 1, 1, 0.15);
}

/** Hedge + flower dressing around the green. Fase 23 — every bush and
 *  flower sits at ITS OWN terrain height (the green slopes; a ring placed
 *  at the centre's height floated downhill). */
export function dressVillageGreen(
  b: StaticBuilder, cx: number, cz: number, groundY: number, rand: () => number,
  terrainH?: (x: number, z: number) => number,
): void {
  const g = terrainH ?? (() => groundY);
  // low hedge ring segments (broken by the paths)
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    if (Math.abs(Math.sin(a * 2)) < 0.35) continue; // gaps for paths
    const px = cx + Math.cos(a) * 8.6;
    const pz = cz + Math.sin(a) * 8.6;
    b.add(new THREE.SphereGeometry(0.75, 7, 6), 'leaf', px, g(px, pz) + 0.32, pz, rand() * 3, 1, 0.72, 1);
  }
  // flower patches (kept OUTSIDE the plaza kerb so nothing grows through
  // the flagstones)
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = 6.9 + rand() * 1.5;
    const px = cx + Math.cos(a) * r;
    const pz = cz + Math.sin(a) * r;
    b.add(new THREE.SphereGeometry(0.06, 5, 4), rand() < 0.5 ? 'clothRed' : 'clothGold', px, g(px, pz) + 0.14, pz);
    b.cylinder('leaf', 0.02, 0.02, 0.16, 4, px, g(px, pz) + 0.07, pz);
  }
}
