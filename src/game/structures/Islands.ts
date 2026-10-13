import * as THREE from 'three';
import { StaticBuilder } from './Materials';
import { buildDock } from './Buildings';
import { mulberry32 } from '../core/MathUtils';

/**
 * Structures of the outer isles (Fase 2): the pirate fortress of the Crow,
 * the ruined lighthouse of the Farallón and the misty camp of the Bruma isles.
 */

/** Palisade pirate fortress on the Crow Isle terrace. */
export function buildPirateFort(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
): { chestPos: THREE.Vector3 } {
  const cx = -490;
  const cz = -445;
  const rand = mulberry32(66613);
  const g = (x: number, z: number) => terrain.height(x, z);

  // --- Palisade ring (log wall, gate gap facing the eastern cove/dock) ---
  const R = 17;
  const logs = 30;
  for (let i = 0; i < logs; i++) {
    const a = (i / logs) * Math.PI * 2;
    // Gate gap toward the east (+X)
    if (Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.28) continue;
    const px = cx + Math.cos(a) * R;
    const pz = cz + Math.sin(a) * R;
    const gy = g(px, pz);
    b.cylinder('woodDark', 0.26, 0.32, 4.4, 6, px, gy + 2.0, pz);
    b.addCylinderCollider(px, pz, 0.42, gy, gy + 4.4);
    // Sharpened tip
    b.add(new THREE.ConeGeometry(0.3, 0.55, 6), 'woodDark', px, gy + 4.55, pz);
    // Cross brace ring
    if (i % 2 === 0) {
      const a2 = ((i + 1) / logs) * Math.PI * 2;
      const px2 = cx + Math.cos(a2) * R;
      const pz2 = cz + Math.sin(a2) * R;
      const midX = (px + px2) / 2, midZ = (pz + pz2) / 2;
      b.box('wood', 3.9, 0.22, 0.22, midX, g(midX, midZ) + 3.1, midZ, -a + Math.PI / 2);
    }
  }

  // --- Gate: skull-topped posts ---
  const gateAngle = 0.30;
  for (const s of [-1, 1]) {
    const a = Math.PI + s * gateAngle;
    const px = cx + Math.cos(a) * R;
    const pz = cz + Math.sin(a) * R;
    const gy = g(px, pz);
    b.cylinder('wood', 0.34, 0.4, 5.6, 7, px, gy + 2.7, pz);
    b.addCylinderCollider(px, pz, 0.5, gy, gy + 5.6);
    // Trophy skull
    b.add(new THREE.SphereGeometry(0.26, 8, 6), 'sail', px, gy + 5.9, pz);
    b.box('woodDark', 0.06, 0.5, 0.06, px + 0.12, gy + 5.85, pz + 0.1);
    b.box('woodDark', 0.06, 0.5, 0.06, px - 0.12, gy + 5.85, pz - 0.1);
  }

  // --- Watch towers (two, NW and S) on pole legs with platforms ---
  const tower = (tx: number, tz: number) => {
    const gy = g(tx, tz);
    for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
      b.cylinder('wood', 0.16, 0.2, 7.2, 6, tx + ox, gy + 3.4, tz + oz);
      b.addCylinderCollider(tx + ox, tz + oz, 0.28, gy, gy + 7.2);
    }
    b.box('wood', 3.6, 0.22, 3.6, tx, gy + 7.1, tz);
    b.box('wood', 3.6, 0.7, 0.14, tx, gy + 7.6, tz + 1.75);
    b.box('wood', 3.6, 0.7, 0.14, tx, gy + 7.6, tz - 1.75);
    b.box('wood', 0.14, 0.7, 3.6, tx + 1.75, gy + 7.6, tz);
    b.box('wood', 0.14, 0.7, 3.6, tx - 1.75, gy + 7.6, tz);
    // Canopy
    b.add(new THREE.BoxGeometry(4.0, 0.12, 4.0), 'clothRaven', tx, gy + 9.0, tz, 0, 1, 1, 1, 0, 0.16);
    b.cylinder('wood', 0.05, 0.05, 1.6, 5, tx, gy + 8.2, tz);
    // Raven banner
    b.add(new THREE.BoxGeometry(1.0, 0.6, 0.05), 'clothRaven', tx + 0.55, gy + 8.7, tz);
  };
  tower(cx - 10, cz - 9);
  tower(cx + 9, cz + 11);

  // --- Captain's hut ---
  const hx = cx + 4, hz = cz - 6;
  const hg = g(hx, hz);
  b.solidBox('woodDark', 5.2, 2.6, 4.4, hx, hg + 1.3, hz, 0.5);
  b.add(new THREE.BoxGeometry(5.6, 0.14, 4.8), 'clothRaven', hx, hg + 3.0, hz, 0.5, 1, 1, 1, 0, 0.2);
  b.box('wood', 1.1, 1.8, 0.14, hx - Math.sin(0.5) * 2.25, hg + 0.95, hz - Math.cos(0.5) * 2.25, 0.5);
  // Trophy poles with skulls around the hut
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4;
    const px = hx + Math.cos(a) * 3.4;
    const pz = hz + Math.sin(a) * 3.4;
    const py = g(px, pz);
    b.cylinder('woodDark', 0.07, 0.09, 2.2, 5, px, py + 1.1, pz);
    b.add(new THREE.SphereGeometry(0.2, 7, 5), 'sail', px, py + 2.35, pz);
  }

  // --- Crew tents & campfire ---
  for (let i = 0; i < 3; i++) {
    const tx = cx - 8 + i * 3.4;
    const tz = cz + 7 + (i % 2) * 2.2;
    const ty = g(tx, tz);
    b.add(new THREE.BoxGeometry(2.6, 0.1, 2.4), 'sailDark', tx, ty + 1.15, tz, 0.2 + i * 0.3, 1, 1, 1, 0, 0.85);
    b.cylinder('woodDark', 0.05, 0.05, 1.3, 4, tx - 1.1, ty + 0.6, tz - 1.0);
    b.cylinder('woodDark', 0.05, 0.05, 1.3, 4, tx + 1.1, ty + 0.6, tz + 1.0);
  }
  // Campfire (stone ring + embers + spit)
  const fx = cx, fz = cz + 3;
  const fy = g(fx, fz);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.add(new THREE.IcosahedronGeometry(0.22, 0), 'stoneDark', fx + Math.cos(a) * 0.75, fy + 0.1, fz + Math.sin(a) * 0.75, rand() * 3);
  }
  b.add(new THREE.BoxGeometry(0.8, 0.24, 0.8), 'glow', fx, fy + 0.16, fz);
  // Crossed roasting spits over the fire
  b.add(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 4), 'woodDark', fx, fy + 0.7, fz, 0, 1, 1, 1, 0, Math.PI / 2);
  b.add(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 4), 'woodDark', fx + 0.85, fy + 0.7, fz, 0, 1, 1, 1, Math.PI / 2, Math.PI / 2);

  // --- Supplies: crates, barrels, plunder piles ---
  for (let i = 0; i < 7; i++) {
    const px = cx + (rand() - 0.5) * 22;
    const pz = cz + (rand() - 0.5) * 22;
    const py = g(px, pz);
    if (rand() < 0.55) {
      b.solidBox('woodDark', 0.9, 0.9, 0.9, px, py + 0.45, pz, rand() * 3);
    } else {
      b.cylinder('wood', 0.4, 0.46, 1.0, 9, px, py + 0.5, pz, true);
      b.addCylinderCollider(px, pz, 0.48, py, py + 1.0);
    }
  }
  // Plunder chest (interactive via Game wiring)
  const chx = cx + 2.5, chz = cz + 9.5;
  b.box('gold', 0.9, 0.12, 0.55, chx, g(chx, chz) + 0.55, chz, 0.8);

  // --- Dock down to the cove (east, toward the anchorage) ---
  const dockX = cx + 44;
  const dockZ = cz + 6;
  buildDock(b, dockX - 13, dockZ, Math.PI / 2, 24, 3, 2.6, true);

  return { chestPos: new THREE.Vector3(chx, g(chx, chz), chz) };
}

/** Ruined lighthouse on the Farallón plateau. */
export function buildFaroRuins(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
): { chestPos: THREE.Vector3 } {
  const cx = 567;
  const cz = 116;
  const rand = mulberry32(777);
  const g = (x: number, z: number) => terrain.height(x, z);
  const gy = g(cx, cz);

  // --- Broken tower: tapered stone shaft with a jagged shattered top ---
  b.cylinder('stone', 2.9, 3.4, 12.5, 12, cx, gy + 6.25, cz, true);
  b.addCylinderCollider(cx, cz, 3.2, gy, gy + 12.5);
  // Jagged rim blocks
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    if (i % 3 === 0) continue; // gaps make the break look real
    b.box('stoneDark', 1.2 + rand() * 0.7, 0.8 + rand() * 0.8, 0.8,
      cx + Math.cos(a) * 2.9, gy + 12.9 + rand() * 0.3, cz + Math.sin(a) * 2.9, -a + rand() * 0.4);
  }
  // Door gap (south) — dark inset
  b.box('woodDark', 1.5, 2.6, 0.4, cx, gy + 1.3, cz + 3.25, 0);
  // Arrow-slit windows
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.8;
    b.box('woodDark', 0.4, 1.2, 0.3, cx + Math.cos(a) * 3.15, gy + 3.4 + i * 3.4, cz + Math.sin(a) * 3.15, -a);
  }
  // Fallen blocks spiralling down the hillside
  for (let i = 0; i < 10; i++) {
    const a = i * 0.9;
    const d = 5 + (i % 4) * 2.4;
    const px = cx + Math.cos(a) * d;
    const pz = cz + Math.sin(a) * d;
    b.box('stone', 0.9 + rand() * 1.1, 0.7 + rand() * 0.8, 0.9 + rand(), px, g(px, pz) + 0.3, pz, rand() * 3);
  }
  // The dead brazier on top
  b.cylinder('metal', 1.5, 1.1, 0.8, 10, cx, gy + 13.4, cz);
  b.cylinder('stoneDark', 0.5, 0.6, 1.1, 8, cx, gy + 12.4, cz);

  // --- Keeper's store at the base ---
  const sx = cx - 6.5, sz = cz + 3.5;
  const sy = g(sx, sz);
  b.solidBox('stoneDark', 3.4, 2.5, 3.0, sx, sy + 1.25, sz, 0.7);
  b.add(new THREE.BoxGeometry(3.8, 0.12, 3.4), 'roofSlate', sx, sy + 2.75, sz, 0.7, 1, 1, 1, 0, 0.3);
  b.box('wood', 1.0, 1.7, 0.14, sx + Math.sin(0.7) * 1.6, sy + 0.9, sz + Math.cos(0.7) * 1.6, 0.7);

  // Supply crates + the lighthouse chest
  b.solidBox('woodDark', 0.9, 0.9, 0.9, cx + 5, gy + 0.45, cz + 2, 0.4);
  const chx = cx + 5.6, chz = cz - 3.4;
  b.box('gold', 0.85, 0.12, 0.55, chx, g(chx, chz) + 0.5, chz, 1.2);

  return { chestPos: new THREE.Vector3(chx, g(chx, chz), chz) };
}

/** Castaway camp on the white sands of the Mist Isles. */
export function buildBrumaCamp(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
): { chestPos: THREE.Vector3 } {
  const cx = -60;
  const cz = 578;
  const rand = mulberry32(31337);
  const g = (x: number, z: number) => terrain.height(x, z);
  const gy = g(cx, cz);

  // --- Tent (driftwood frame + sailcloth) ---
  const tx = cx - 3, tz = cz - 2;
  const ty = g(tx, tz);
  b.add(new THREE.BoxGeometry(3.2, 0.1, 3.0), 'sail', tx, ty + 1.5, tz, 0.3, 1, 1, 1, 0, 0.9);
  b.cylinder('wood', 0.05, 0.07, 1.9, 5, tx - 1.4, ty + 0.85, tz - 1.2);
  b.cylinder('wood', 0.05, 0.07, 1.9, 5, tx + 1.4, ty + 0.85, tz + 1.2);
  b.cylinder('wood', 0.05, 0.07, 1.9, 5, tx + 1.2, ty + 0.85, tz - 1.4);

  // --- Fire pit with fish rack ---
  const fx = cx + 2, fz = cz + 1;
  const fy = g(fx, fz);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(new THREE.IcosahedronGeometry(0.18, 0), 'stoneDark', fx + Math.cos(a) * 0.6, fy + 0.08, fz + Math.sin(a) * 0.6, rand() * 3);
  }
  b.add(new THREE.BoxGeometry(0.7, 0.2, 0.7), 'glow', fx, fy + 0.12, fz);
  // Fish drying rack
  const rx = fx + 1.6, rz = fz - 1.2;
  const ry = g(rx, rz);
  b.cylinder('wood', 0.05, 0.06, 1.6, 4, rx - 0.8, ry + 0.8, rz);
  b.cylinder('wood', 0.05, 0.06, 1.6, 4, rx + 0.8, ry + 0.8, rz);
  b.box('wood', 1.8, 0.08, 0.08, rx, ry + 1.55, rz);
  for (let i = 0; i < 3; i++) {
    b.add(new THREE.BoxGeometry(0.1, 0.34, 0.05), 'sail', rx - 0.5 + i * 0.5, ry + 1.35, rz);
  }

  // --- Beached rowboat & paddle ---
  const bx = cx + 6, bz = cz - 4;
  const by = g(bx, bz);
  b.add(new THREE.BoxGeometry(1.1, 0.42, 2.6), 'woodDark', bx, by + 0.2, bz, 0.7);
  b.add(new THREE.BoxGeometry(0.85, 0.07, 2.1), 'woodLight', bx, by + 0.36, bz, 0.7);
  b.box('wood', 0.08, 1.5, 0.08, bx + 0.9, by + 0.75, bz + 0.4, 0.3);

  // --- Crates and the buried chest ---
  b.solidBox('woodDark', 0.85, 0.85, 0.85, cx - 1, gy + 0.42, cz + 3.5, 0.9);
  const chx = cx + 0.5, chz = cz + 5.5;
  b.box('gold', 0.85, 0.12, 0.55, chx, g(chx, chz) + 0.5, chz, -0.5);

  // --- Spiral etched in the sand (dragon hint) ---
  for (let i = 0; i < 16; i++) {
    const a = i * 0.65;
    const d = 1.2 + i * 0.35;
    b.box('stoneDark', 0.22, 0.06, 0.22, cx - 7 + Math.cos(a) * d, g(cx - 7 + Math.cos(a) * d, cz + 6 + Math.sin(a) * d) + 0.05, cz + 6 + Math.sin(a) * d, a);
  }

  return { chestPos: new THREE.Vector3(chx, g(chx, chz), chz) };
}

/**
 * Fase 18 — THE CROW SETTLEMENT: Old Crow Isle used to be "too much
 * mountain, too little pirate". The island's peak was shaved (ISLANDS.crow
 * height 46 → 30) and three new terraces were cut (WorldConfig FLATS).
 * This builder fills them: a lower settlement with an ENTERABLE longhouse,
 * the cove boat-yard with its graveyard of hulls, and a western lookout.
 *
 * Returns chest positions for the Game to wire as interactable loot.
 */
export function buildCrowSettlement(
  b: StaticBuilder,
  terrain: { height(x: number, z: number): number },
): { chests: THREE.Vector3[] } {
  const rand = mulberry32(918273);
  const g = (x: number, z: number) => terrain.height(x, z);
  const chests: THREE.Vector3[] = [];

  // ===================== 1. LOWER SETTLEMENT (-512, -468) =====================
  {
    const cx = -512;
    const cz = -468;

    // --- The corsair longhouse (enterable): 13 x 6.5, plank walls ---
    const lx = cx, lz = cz - 4;
    const ly = g(lx, lz);
    const w = 13, d = 6.5, h = 3.1;
    const doorW = 1.5;
    // floor
    b.addBoxCollider(lx, ly + 0.32, lz, w - 0.4, 0.14, d - 0.4, 0);
    b.box('woodLight', w - 0.4, 0.1, d - 0.4, lx, ly + 0.34, lz);
    // walls: north, west, east + south with a door gap
    b.solidBox('woodPirate', w, h, 0.22, lx, ly + 1.55, lz - d / 2);
    b.solidBox('woodPirate', 0.22, h, d, lx - w / 2, ly + 1.55, lz);
    b.solidBox('woodPirate', 0.22, h, d, lx + w / 2, ly + 1.55, lz);
    const segW = (w - doorW) / 2;
    b.solidBox('woodPirate', segW, h, 0.22, lx - (doorW / 2 + segW / 2), ly + 1.55, lz + d / 2);
    b.solidBox('woodPirate', segW, h, 0.22, lx + (doorW / 2 + segW / 2), ly + 1.55, lz + d / 2);
    b.solidBox('woodPirate', doorW + 0.3, h - 2.2, 0.22, lx, ly + 2.2 + (h - 2.2) / 2, lz + d / 2, 0, false);
    // roof (two slopes, dark sailcloth over spars)
    for (const s of [-1, 1]) {
      b.add(new THREE.BoxGeometry(w + 0.8, 0.14, Math.sqrt((d / 2) ** 2 + 1.7 ** 2) + 0.3), 'woodDark',
        lx, ly + h + 0.75, lz + s * d / 4, 0, 1, 1, 1, 0, s * Math.atan2(1.7, d / 2));
    }
    b.add(new THREE.BoxGeometry(w + 1.0, 0.12, 5.6), 'sailDark', lx, ly + h + 1.5, lz, 0, 1, 1, 1, 0, 0.12);
    b.add(new THREE.BoxGeometry(w + 1.0, 0.12, 5.6), 'sailDark', lx, ly + h + 1.5, lz, 0, 1, 1, 1, 0, -0.12);
    // interior: long table + benches + bunks + grog barrels + trophy skulls
    b.box('wood', 5.5, 0.14, 1.2, lx - 1.5, ly + 0.92, lz);
    b.box('woodDark', 0.14, 0.85, 0.14, lx - 3.8, ly + 0.48, lz);
    b.box('woodDark', 0.14, 0.85, 0.14, lx + 0.8, ly + 0.48, lz);
    b.box('wood', 5.0, 0.1, 0.38, lx - 1.5, ly + 0.56, lz + 1.05);
    b.box('wood', 5.0, 0.1, 0.38, lx - 1.5, ly + 0.56, lz - 1.05);
    for (let i = 0; i < 3; i++) {
      b.box('woodDark', 2.0, 0.32, 0.95, lx + 4.4, ly + 0.5, lz - 1.8 + i * 1.8, 0);
      b.box('sailDark', 1.9, 0.18, 0.85, lx + 4.4, ly + 0.68, lz - 1.8 + i * 1.8, 0);
    }
    const gbX = lx - 5.4, gbZ = lz + 2.0;
    b.cylinder('wood', 0.4, 0.46, 1.0, 9, gbX, ly + 0.82, gbZ, true);
    b.addCylinderCollider(gbX, gbZ, 0.48, ly + 0.3, ly + 1.3);
    b.add(new THREE.SphereGeometry(0.18, 7, 5), 'sail', lx - 5.4, ly + 2.4, lz - 2.2);
    b.cylinder('woodDark', 0.05, 0.07, 1.6, 5, lx - 5.4, ly + 1.1, lz - 2.2, true);

    // --- Two crew huts (solid, sailcloth roofs) ---
    for (const [hx, hz] of [[cx - 11, cz + 6], [cx - 3, cz + 9]] as Array<[number, number]>) {
      const hy = g(hx, hz);
      b.solidBox('woodDark', 4.4, 2.4, 3.8, hx, hy + 1.2, hz, 0.3);
      b.add(new THREE.BoxGeometry(4.9, 0.14, 4.3), 'sailDark', hx, hy + 2.85, hz, 0.3, 1, 1, 1, 0, 0.18);
      b.box('wood', 1.0, 1.7, 0.14, hx - Math.sin(0.3) * 1.95, hy + 0.88, hz - Math.cos(0.3) * 1.95, 0.3);
    }

    // --- Gallows + cage + trophy posts ---
    const galX = cx + 8, galZ = cz + 4;
    const galY = g(galX, galZ);
    for (const [px, pz] of [[-1.4, 0], [1.4, 0]] as Array<[number, number]>) {
      b.cylinder('woodDark', 0.16, 0.2, 4.6, 6, galX + px, galY + 2.3, galZ + pz, true);
      b.addCylinderCollider(galX + px, galZ + pz, 0.26, galY, galY + 4.6);
    }
    b.box('woodDark', 3.6, 0.24, 0.24, galX, galY + 4.5, galZ);
    b.add(new THREE.TorusGeometry(0.14, 0.03, 5, 10), 'metal', galX - 0.7, galY + 4.15, galZ, 0, 1, 1, 1, Math.PI / 2);
    b.cylinder('woodDark', 0.05, 0.05, 0.9, 5, galX - 0.7, galY + 3.7, galZ);
    // the cage (a prisoner's box of spars)
    const cagX = cx + 12, cagZ = cz - 2;
    const cagY = g(cagX, cagZ);
    for (const [px, pz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as Array<[number, number]>) {
      b.cylinder('woodDark', 0.08, 0.1, 2.6, 5, cagX + px, cagY + 1.3, cagZ + pz, true);
    }
    for (let i = 0; i < 3; i++) {
      b.box('woodDark', 2.1, 0.1, 0.1, cagX, cagY + 2.1 + i * 0.24, cagZ - 0.9);
      b.box('woodDark', 2.1, 0.1, 0.1, cagX, cagY + 2.1 + i * 0.24, cagZ + 0.9);
    }
    // trophy skull posts around
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.6;
      const px = cx + Math.cos(a) * 15;
      const pz = cz + Math.sin(a) * 15;
      const py = g(px, pz);
      b.cylinder('woodDark', 0.07, 0.09, 2.4, 5, px, py + 1.2, pz, true);
      b.add(new THREE.SphereGeometry(0.2, 7, 5), 'bone', px, py + 2.55, pz);
    }

    // --- Banner lines + fire pit + plunder stacks ---
    for (const [bx, bz] of [[cx + 5, cz - 12], [cx + 5, cz - 6]] as Array<[number, number]>) {
      b.cylinder('wood', 0.1, 0.12, 5.0, 6, bx, g(bx, bz) + 2.5, bz, true);
    }
    b.add(new THREE.BoxGeometry(0.9, 0.55, 0.06), 'clothRaven', cx + 5, g(cx + 5, cz - 12) + 4.3, cz - 9.4, 0);
    const fx = cx - 7, fz = cz + 1;
    const fy = g(fx, fz);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      b.add(new THREE.IcosahedronGeometry(0.2, 0), 'stoneDark', fx + Math.cos(a) * 0.7, fy + 0.1, fz + Math.sin(a) * 0.7, rand() * 3);
    }
    b.add(new THREE.BoxGeometry(0.85, 0.22, 0.85), 'glow', fx, fy + 0.15, fz);
    for (let i = 0; i < 8; i++) {
      const px = cx + (rand() - 0.5) * 26;
      const pz = cz + (rand() - 0.5) * 26;
      if (rand() < 0.5) b.solidBox('woodDark', 0.9, 0.9, 0.9, px, g(px, pz) + 0.45, pz, rand() * 3);
      else {
        b.cylinder('wood', 0.4, 0.46, 1.0, 9, px, g(px, pz) + 0.5, pz, true);
        b.addCylinderCollider(px, pz, 0.48, g(px, pz), g(px, pz) + 1.0);
      }
    }
    // smuggler's cache
    chests.push(new THREE.Vector3(cx - 8.5, g(cx - 8.5, cz - 12), cz - 12));
  }

  // ===================== 2. COVE BOAT-YARD (-452, -372) =====================
  {
    const cx = -452;
    const cz = -372;

    // --- The graveyard of hulls: three broken longboats ---
    const wreck = (wx: number, wz: number, rot: number, scale: number) => {
      const wy = g(wx, wz);
      b.add(new THREE.BoxGeometry(1.6, 0.55, 4.6 * scale), 'woodDark', wx, wy + 0.24, wz, rot, scale, 1, scale);
      b.add(new THREE.BoxGeometry(1.1, 0.08, 3.6 * scale), 'woodLight', wx, wy + 0.42, wz, rot, scale, 1, scale);
      // broken ribs
      for (let i = 0; i < 4; i++) {
        b.add(new THREE.TorusGeometry(0.5 * scale, 0.05, 4, 8, Math.PI), 'wood',
          wx + Math.sin(rot) * (i - 1.5) * scale, wy + 0.5, wz + Math.cos(rot) * (i - 1.5) * scale,
          rot, 1, 1, 1, 0, Math.PI / 2);
      }
      // snapped mast
      b.cylinder('wood', 0.07, 0.1, 2.6, 6, wx + Math.cos(rot) * 0.8, wy + 1.3, wz - Math.sin(rot) * 0.8, true);
    };
    wreck(cx - 6, cz + 2, 0.7, 1);
    wreck(cx + 3, cz + 5, -0.5, 0.85);
    wreck(cx - 1, cz - 6, 2.4, 0.7);

    // --- The slipway: keel blocks + stacked masts + spares ---
    const sx = cx + 9, sz = cz - 3;
    for (let i = 0; i < 3; i++) {
      b.box('woodDark', 1.1, 0.4 + i * 0.3, 0.5, sx, g(sx, sz) + 0.2 + i * 0.15, sz + i * 1.3, 0.25);
    }
    for (let i = 0; i < 3; i++) {
      b.cylinder('wood', 0.06, 0.09, 7.5, 6, sx - 3 + i * 0.5, g(sx, sz) + 0.35, sz + 5.5 + i * 0.4, true, );
      b.addCylinderCollider(sx - 3 + i * 0.5, sz + 5.5 + i * 0.4, 0.2, g(sx, sz), g(sx, sz) + 7.5);
    }
    // a fresh hull on the slips (half-built)
    b.add(new THREE.BoxGeometry(2.0, 0.7, 6.2), 'woodPirate', sx - 4.5, g(sx - 4.5, sz - 4) + 0.6, sz - 4, 1.35);
    b.box('woodLight', 1.5, 0.1, 5.2, sx - 4.5, g(sx - 4.5, sz - 4) + 0.95, sz - 4, 1.35);

    // --- Two tents + cook fire + net racks ---
    for (const [tx, tz] of [[cx - 10, cz + 7], [cx - 13, cz + 3]] as Array<[number, number]>) {
      const ty = g(tx, tz);
      b.add(new THREE.BoxGeometry(2.8, 0.1, 2.6), 'sailDark', tx, ty + 1.25, tz, 0.2, 1, 1, 1, 0, 0.9);
      b.cylinder('woodDark', 0.05, 0.05, 1.4, 4, tx - 1.2, ty + 0.65, tz - 1.0, true);
      b.cylinder('woodDark', 0.05, 0.05, 1.4, 4, tx + 1.2, ty + 0.65, tz + 1.0, true);
    }
    const fx = cx - 8, fz = cz + 5;
    const fy = g(fx, fz);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(new THREE.IcosahedronGeometry(0.16, 0), 'stoneDark', fx + Math.cos(a) * 0.55, fy + 0.08, fz + Math.sin(a) * 0.55, rand() * 3);
    }
    b.add(new THREE.BoxGeometry(0.7, 0.18, 0.7), 'glow', fx, fy + 0.11, fz);
    // net drying racks
    for (let i = 0; i < 2; i++) {
      const nx = cx - 2 + i * 4, nz = cz + 9;
      b.cylinder('woodDark', 0.05, 0.07, 1.8, 4, nx - 1.1, g(nx, nz) + 0.9, nz, true);
      b.cylinder('woodDark', 0.05, 0.07, 1.8, 4, nx + 1.1, g(nx, nz) + 0.9, nz, true);
      b.box('wood', 2.3, 0.08, 0.08, nx, g(nx, nz) + 1.75, nz);
      b.box('sail', 2.0, 0.9, 0.04, nx, g(nx, nz) + 1.3, nz);
    }
    // beached skiff chest
    chests.push(new THREE.Vector3(cx + 7, g(cx + 7, cz + 8), cz + 8));
  }

  // ===================== 3. WESTERN LOOKOUT (-575, -400) =====================
  {
    const cx = -575;
    const cz = -400;
    const gy = g(cx, cz);
    // tall pole tower with a platform + signal brazier
    for (const [px, pz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]] as Array<[number, number]>) {
      b.cylinder('wood', 0.16, 0.2, 9.0, 6, cx + px, gy + 4.5, cz + pz, true);
      b.addCylinderCollider(cx + px, cz + pz, 0.28, gy, gy + 9.0);
    }
    b.box('wood', 4.0, 0.24, 4.0, cx, gy + 8.9, cz);
    for (const [ex, ez] of [[0, 2], [0, -2], [2, 0], [-2, 0]] as Array<[number, number]>) {
      b.box('wood', ex === 0 ? 4.0 : 0.14, 0.9, ez === 0 ? 4.0 : 0.14, cx + ex, gy + 9.45, cz + ez);
    }
    b.add(new THREE.BoxGeometry(4.4, 0.12, 4.4), 'clothRaven', cx, gy + 11.2, cz, 0, 1, 1, 1, 0, 0.14);
    // signal brazier (unlit — or is it?)
    b.cylinder('metal', 0.55, 0.4, 0.5, 8, cx, gy + 9.7, cz);
    b.add(new THREE.BoxGeometry(0.6, 0.2, 0.6), 'glow', cx, gy + 9.85, cz);
    // ladder rungs up one leg
    for (let i = 0; i < 9; i++) {
      b.box('wood', 0.7, 0.07, 0.07, cx + 1.4, gy + 0.6 + i * 0.95, cz + 1.4);
    }
    // a lonely grave + cache by the lookout
    b.box('stone', 0.7, 1.1, 0.18, cx - 4, g(cx - 4, cz + 4) + 0.55, cz + 4, 0.3);
    b.box('stoneDark', 0.9, 0.14, 0.4, cx - 4, g(cx - 4, cz + 4) + 1.12, cz + 4, 0.3);
    chests.push(new THREE.Vector3(cx + 4, g(cx + 4, cz + 5), cz + 5));
  }

  return { chests };
}
