import * as THREE from 'three';
import { StaticBuilder, MAT } from './Materials';
import { mulberry32 } from '../core/MathUtils';
import { POIS } from '../world/WorldConfig';

/** Ruinas de Vaelthara — broken columns, arch, mossy plinths, lore tablet. */
export function buildRuins(b: StaticBuilder, terrain: { height(x: number, z: number): number }): { tablet: THREE.Vector3 } {
  const poi = POIS.find((p) => p.id === 'ruins')!;
  const rand = mulberry32(404);
  const g = (x: number, z: number) => terrain.height(x, z);

  // Ring of columns (some broken, some fallen)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = 13;
    const px = poi.x + Math.cos(a) * r;
    const pz = poi.z + Math.sin(a) * r;
    const gy = g(px, pz);
    const fate = rand();
    if (fate < 0.3) {
      // Standing column
      const h = 4.5 + rand() * 1.5;
      b.cylinder('stoneMoss', 0.55, 0.65, h, 9, px, gy + h / 2, pz, true);
      b.addCylinderCollider(px, pz, 0.7, gy, gy + h);
      b.box('stone', 1.5, 0.4, 1.5, px, gy + h + 0.2, pz, rand());
    } else if (fate < 0.55) {
      // Broken stump
      const h = 1.2 + rand() * 1.6;
      b.cylinder('stoneMoss', 0.6, 0.7, h, 9, px, gy + h / 2, pz, true);
      b.addCylinderCollider(px, pz, 0.75, gy, gy + h);
    } else {
      // Fallen column (lying down)
      b.add(new THREE.CylinderGeometry(0.55, 0.6, 5 + rand() * 2, 9), 'stoneMoss',
        px + rand() * 2, gy + 0.55, pz + rand() * 2, rand() * Math.PI, 1, 1, 1, 0, Math.PI / 2);
    }
  }
  // Central collapsed dome / plinth
  const cy = g(poi.x, poi.z);
  b.cylinder('stoneMoss', 4.2, 4.6, 1.1, 12, poi.x, cy + 0.55, poi.z);
  b.addCylinderCollider(poi.x, poi.z, 4.6, cy, cy + 1.1);
  // Stone dragon arch (broken top)
  const ax = poi.x + 4, az = poi.z - 6;
  const ay = g(ax, az);
  b.cylinder('stoneMoss', 0.5, 0.55, 5.5, 8, ax - 1.6, ay + 2.75, az, true);
  b.cylinder('stoneMoss', 0.5, 0.55, 5.5, 8, ax + 1.6, ay + 2.75, az, true);
  b.addCylinderCollider(ax - 1.6, az, 0.65, ay, ay + 5.5);
  b.addCylinderCollider(ax + 1.6, az, 0.65, ay, ay + 5.5);
  b.add(new THREE.TorusGeometry(1.7, 0.45, 6, 12, Math.PI), 'stoneMoss', ax, ay + 5.5, az, 0, 1, 1, 1, 0, Math.PI / 2);
  // Lore tablet
  const tx = poi.x - 3, tz = poi.z + 5;
  const ty = g(tx, tz);
  b.box('stone', 0.9, 1.5, 0.3, tx, ty + 0.75, tz, 0.5);
  b.add(new THREE.BoxGeometry(0.6, 1.0, 0.08), 'rune', tx + 0.12, ty + 0.8, tz + 0.06, 0.5);
  return { tablet: new THREE.Vector3(tx, ty, tz) };
}

/** El Círculo de las Vigilias — nine standing stones, runes glow at night. */
export function buildStoneCircle(b: StaticBuilder, terrain: { height(x: number, z: number): number }): { center: THREE.Vector3 } {
  const poi = POIS.find((p) => p.id === 'stones')!;
  const rand = mulberry32(909);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 11;
    const px = poi.x + Math.cos(a) * r;
    const pz = poi.z + Math.sin(a) * r;
    const gy = terrain.height(px, pz);
    const h = 3.4 + rand() * 1.6;
    const lean = (rand() - 0.5) * 0.16;
    b.add(new THREE.BoxGeometry(1.1, h, 0.7), 'stoneDark', px, gy + h / 2 - 0.3, pz, a + Math.PI / 2, 1, 1, 1, lean);
    b.addBoxCollider(px, gy + h / 2, pz, 1.2, h, 0.9, a);
    // Rune band
    b.add(new THREE.BoxGeometry(0.5, h * 0.55, 0.1), 'rune', px + Math.cos(a) * 0.4, gy + h / 2 - 0.3, pz + Math.sin(a) * 0.4, a + Math.PI / 2);
  }
  const cy = terrain.height(poi.x, poi.z);
  // Low altar stone at the center
  b.cylinder('stone', 1.1, 1.3, 0.8, 8, poi.x, cy + 0.4, poi.z);
  return { center: new THREE.Vector3(poi.x, cy, poi.z) };
}

/** Torre del Vigía — coastal watchtower with rusty bell. */
export function buildWatchtower(b: StaticBuilder, terrain: { height(x: number, z: number): number }): { door: THREE.Vector3 } {
  const poi = POIS.find((p) => p.id === 'tower')!;
  const gy = terrain.height(poi.x, poi.z);
  const h = 12;
  b.cylinder('stone', 3.2, 3.8, h, 12, poi.x, gy + h / 2, poi.z, true);
  b.addCylinderCollider(poi.x, poi.z, 3.6, gy, gy + h);
  b.cylinder('stoneDark', 3.6, 3.6, 0.6, 12, poi.x, gy + h, poi.z);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    if (i % 2 === 0) {
      b.box('stoneDark', 0.6, 0.7, 0.5, poi.x + Math.cos(a) * 3.35, gy + h + 0.5, poi.z + Math.sin(a) * 3.35, -a);
    }
  }
  b.add(new THREE.ConeGeometry(3.9, 3.0, 12), 'roofSlate', poi.x, gy + h + 2.2, poi.z);
  // Rusty bell frame (open side facing the sea)
  b.box('woodDark', 1.6, 0.16, 0.16, poi.x, gy + h - 1.6, poi.z + 2.6);
  b.add(new THREE.CylinderGeometry(0.35, 0.5, 0.55, 10), 'metal', poi.x, gy + h - 1.95, poi.z + 2.6);
  // Arrow slits
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4;
    b.box('woodDark', 0.4, 1.2, 0.3, poi.x + Math.cos(a) * 3.5, gy + h - 4.5, poi.z + Math.sin(a) * 3.5, -a);
  }
  // Entrance (dark inset — boarded)
  b.box('woodDark', 1.4, 2.3, 0.3, poi.x, gy + 1.15, poi.z + 3.5);
  b.box('wood', 1.5, 0.25, 0.1, poi.x, gy + 0.9, poi.z + 3.66);
  return { door: new THREE.Vector3(poi.x, gy, poi.z + 4.2) };
}

/** Naufragio de la costa oeste — split hull half-buried in the dunes. */
export function buildShipwreck(
  b: StaticBuilder, terrain: { height(x: number, z: number): number },
): { chest: THREE.Vector3; crate: THREE.Vector3 } {
  const poi = POIS.find((p) => p.id === 'wreck')!;
  const rand = mulberry32(1717);
  const gy = terrain.height(poi.x, poi.z);
  const rot = 0.55;

  // Bow half (tilted, buried)
  const bx = poi.x, bz = poi.z;
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    const w = 3.4 * (1 - t * 0.55);
    b.add(new THREE.BoxGeometry(w, 2.2, 2.4), 'woodDark',
      bx - Math.sin(rot) * (t * 6), gy + 0.7 - t * 0.55 + Math.sin(t * 2) * 0.35, bz - Math.cos(rot) * (t * 6),
      rot, 1, 1, 1, 0, t * 0.18);
  }
  // Stern half (further along, rolled on its side)
  const sx = poi.x + Math.sin(rot) * 9, sz = poi.z + Math.cos(rot) * 9;
  const sy = terrain.height(sx, sz);
  b.add(new THREE.BoxGeometry(3.0, 2.4, 5.2), 'woodDark', sx, sy + 0.8, sz, rot + 1.1, 1, 1, 1, 0.5);
  b.add(new THREE.BoxGeometry(2.4, 0.16, 3.6), 'wood', sx, sy + 2.1, sz, rot + 1.1, 1, 1, 1, 0.5);
  // Fallen mast with torn sail
  b.add(new THREE.CylinderGeometry(0.16, 0.2, 11, 8), 'wood', sx - 3.5, sy + 0.35, sz + 2.2, rot + 0.4, 1, 1, 1, 0, Math.PI / 2 - 0.06);
  b.add(new THREE.BoxGeometry(4.2, 0.05, 3.0), 'sail', sx - 1.2, sy + 0.6, sz + 2.8, rot + 0.8, 1, 1, 1, 0.06);
  // Broken bowsprit & ribs poking from the sand
  for (let i = 0; i < 7; i++) {
    const rx = bx + rand() * 14 - 4;
    const rz = bz + rand() * 10 - 5;
    const ry = terrain.height(rx, rz);
    b.add(new THREE.BoxGeometry(0.16, 1.1 + rand() * 0.8, 0.24), 'woodDark', rx, ry + 0.4, rz, rand() * 3, 1, 1, 1, (rand() - 0.5) * 0.5);
  }
  // Scattered cargo
  const crateX = poi.x + 4.5, crateZ = poi.z + 3.5;
  const crateY = terrain.height(crateX, crateZ);
  b.solidBox('wood', 1.1, 0.9, 1.1, crateX, crateY + 0.45, crateZ, 0.3);
  b.cylinder('wood', 0.4, 0.45, 0.9, 9, crateX + 1.8, terrain.height(crateX + 1.8, crateZ - 1) + 0.45, crateZ - 1, true);
  // A chest tucked against the bow (interactive)
  const chestX = bx - Math.sin(rot) * 2.5, chestZ = bz - Math.cos(rot) * 2.5 + 1.8;
  return {
    chest: new THREE.Vector3(chestX, terrain.height(chestX, chestZ), chestZ),
    crate: new THREE.Vector3(crateX, crateY, crateZ),
  };
}

/** La Gruta del Eco — rock chamber against the mountain with crystals. */
export function buildGrotto(
  b: StaticBuilder, terrain: { height(x: number, z: number): number },
): { chest: THREE.Vector3; crystals: THREE.Vector3[] } {
  const poi = POIS.find((p) => p.id === 'grotto')!;
  const rand = mulberry32(2323);
  const gy = terrain.height(poi.x, poi.z);

  // Rock shell: big flattened boulders forming a hollow opening south
  const shellStones: Array<[number, number, number, number]> = [
    [-7.5, 0, 5.2, 0.5], [7.5, 0.5, 5.4, -0.4], [-4.5, 1.2, 6.2, 0.9], [4.6, 1.5, 6.0, -0.9],
    [0, 0.3, 7.2, 3.1], [-9.5, 2.5, 4.2, 1.3], [9.4, 3.0, 4.0, -1.2], [-6.5, 4.5, 4.4, 2.0], [6.4, 4.8, 4.6, -2.1],
  ];
  for (const [ox, oz, r, rot] of shellStones) {
    const px = poi.x + ox, pz = poi.z - Math.abs(oz);
    const py = terrain.height(px, pz);
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      pos.setXYZ(v, pos.getX(v) * (0.85 + rand() * 0.3), pos.getY(v) * (0.75 + rand() * 0.3), pos.getZ(v) * (0.85 + rand() * 0.3));
    }
    geo.computeVertexNormals();
    b.add(geo, 'stoneMoss', px, py + r * 0.28, pz, rot);
    b.addCylinderCollider(px, pz, r * 0.8, py - 2, py + r);
  }
  // Ceiling slab
  b.add(new THREE.IcosahedronGeometry(8.5, 1), 'stoneDark', poi.x, gy + 7.5, poi.z - 3, 0.6);
  // Crystals (emissive)
  const crystals: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const px = poi.x + rand() * 8 - 4;
    const pz = poi.z - 1 - rand() * 6;
    const py = terrain.height(px, pz);
    const h = 0.7 + rand() * 1.1;
    b.add(new THREE.ConeGeometry(0.28, h, 5), 'rune', px, py + h / 2, pz, rand() * 3, 1, 1, 1, (rand() - 0.5) * 0.5);
    crystals.push(new THREE.Vector3(px, py, pz));
  }
  // Old campfire remains + chest deep inside
  b.cylinder('stoneDark', 0.7, 0.8, 0.25, 8, poi.x + 1.5, gy + 0.12, poi.z - 4);
  b.box('woodDark', 0.9, 0.22, 0.24, poi.x + 1.1, gy + 0.2, poi.z - 3.4, 0.7);
  const chestX = poi.x - 1.8, chestZ = poi.z - 5.5;
  return {
    chest: new THREE.Vector3(chestX, terrain.height(chestX, chestZ), chestZ),
    crystals,
  };
}

/** La Cascada Susurrante — falling water sheet, mist and basin rocks. */
export function buildWaterfall(
  b: StaticBuilder, terrain: { height(x: number, z: number): number },
): { top: THREE.Vector3; basin: THREE.Vector3; sheet: THREE.Mesh; foam: THREE.Mesh } {
  const poi = POIS.find((p) => p.id === 'waterfall')!;
  const poolX = poi.x, poolZ = poi.z;
  const py = terrain.height(poolX, poolZ);

  // Cliff-side rocks framing the falls (the cliff itself is terrain)
  for (const [ox, oz, r] of [[-6.5, -4, 3.4], [6.5, -4, 3.6], [-8, 2, 2.8], [8, 2, 3.0], [0, -7.5, 4.2]] as Array<[number, number, number]>) {
    const px = poolX + ox, pz = poolZ + oz;
    const ppy = terrain.height(px, pz);
    const geo = new THREE.IcosahedronGeometry(r, 1);
    b.add(geo, 'stoneMoss', px, ppy + r * 0.25, pz, ox * 0.3);
    b.addCylinderCollider(px, pz, r * 0.85, ppy - 2, ppy + r * 0.9);
  }

  // Falling water sheet (semi-transparent, animated by the Game via userData)
  const sheetGeo = new THREE.PlaneGeometry(4.6, 26, 1, 8);
  const sheetMat = new THREE.MeshStandardMaterial({
    color: 0xcfe8ee, transparent: true, opacity: 0.55, roughness: 0.25,
    metalness: 0.05, side: THREE.DoubleSide, depthWrite: false,
  });
  const sheet = new THREE.Mesh(sheetGeo, sheetMat);
  const topY = py + 26;
  sheet.position.set(poolX, topY - 13, poolZ - 7.2);
  sheet.renderOrder = 6;
  sheet.userData.waterfall = true;

  // Basin foam ring
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xe8f4f2, transparent: true, opacity: 0.5, depthWrite: false });
  const foam = new THREE.Mesh(new THREE.CircleGeometry(4.4, 24), foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(poolX, py + 0.18, poolZ - 5.2);
  foam.renderOrder = 7;
  foam.userData.foam = true;

  return {
    top: new THREE.Vector3(poolX, topY, poolZ - 7),
    basin: new THREE.Vector3(poolX, py, poolZ),
    sheet,
    foam,
  };
}

/** Nido del Ancestro — snowy summit plateau: whale-bone arches, a frozen
 *  hoard bed, hatched egg shells and the claw-shaped lock stone. */
export function buildDragonLair(
  b: StaticBuilder, terrain: { height(x: number, z: number): number },
): { lockStone: THREE.Vector3 } {
  const poi = POIS.find((p) => p.id === 'nido')!;
  const rand = mulberry32(1337);
  const g = (x: number, z: number) => terrain.height(x, z);
  const cx = poi.x, cz = poi.z;
  const cy = g(cx, cz);

  // Whale-rib arches around the nest bowl
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const r = 12 + rand() * 3;
    const px = cx + Math.cos(a) * r;
    const pz = cz + Math.sin(a) * r;
    const gy = g(px, pz);
    const h = 4.5 + rand() * 3;
    // Curved rib: two segments leaning inward
    b.add(new THREE.CylinderGeometry(0.16, 0.26, h, 6), 'plaster',
      px - Math.cos(a) * 0.9, gy + h / 2, pz - Math.sin(a) * 0.9, a, 1, 1, 1, 0.22);
    b.add(new THREE.CylinderGeometry(0.12, 0.16, h * 0.7, 6), 'plaster',
      px - Math.cos(a) * 2.2, gy + h + h * 0.28, pz - Math.sin(a) * 2.2, a, 1, 1, 1, 0.6);
    b.addCylinderCollider(px, pz, 0.5, gy, gy + h);
  }

  // The hoard bed: a low mound of frozen coins and grave goods
  b.cylinder('stoneDark', 6.4, 7.4, 0.7, 14, cx, cy + 0.35, cz);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 5.6;
    const px = cx + Math.cos(a) * r;
    const pz = cz + Math.sin(a) * r;
    const s = 0.16 + rand() * 0.3;
    b.add(new THREE.IcosahedronGeometry(s, 0), rand() < 0.55 ? 'gold' : 'metal',
      px, cy + 0.75 + rand() * 0.15, pz, rand() * Math.PI);
  }
  // Scattered ancient coins (flat discs)
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2 + rand() * 6;
    b.add(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 8), 'gold',
      cx + Math.cos(a) * r, cy + 0.74, cz + Math.sin(a) * r, 0, 1 + rand() * 0.4, 1, 1, Math.PI / 2 * rand());
  }

  // Hatched egg shells (big broken ellipsoids)
  for (const [ox, oz] of [[-8.5, 3], [7, -7.5], [3.5, 8]] as Array<[number, number]>) {
    const px = cx + ox, pz = cz + oz;
    const gy = g(px, pz);
    b.add(new THREE.SphereGeometry(1.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), 'plaster',
      px, gy + 0.35, pz, rand() * Math.PI, 1, 0.8, 1);
    b.addCylinderCollider(px, pz, 1.0, gy, gy + 1.0);
  }

  // The claw-lock stone: a dark monolith with a glowing claw-shaped socket
  const lx = cx + 9, lz = cz + 6;
  const ly = g(lx, lz);
  b.box('stoneDark', 1.6, 3.4, 0.9, lx, ly + 1.7, lz, -0.6);
  b.addBoxCollider(lx, ly + 1.7, lz, 1.7, 3.4, 1.0, -0.6);
  // Claw socket: three glowing slits shaped like a wyvern's talon
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 0.38;
    b.add(new THREE.BoxGeometry(0.1, 1.1 - Math.abs(i - 1) * 0.3, 0.06), 'rune',
      lx + Math.sin(-0.6) * 0.5 + off * 0.4, ly + 2.2 - Math.abs(i - 1) * 0.35, lz + Math.cos(-0.6) * 0.5 + off * 0.28, -0.6);
  }

  // Broken banners of the old Order frozen into the ice
  for (const [ox, oz, a] of [[-4, -10, 0.4], [11, 1, -1.2]] as Array<[number, number, number]>) {
    const px = cx + ox, pz = cz + oz;
    const gy = g(px, pz);
    b.box('woodDark', 0.14, 4.2, 0.14, px, gy + 2.1, pz, a);
    b.add(new THREE.PlaneGeometry(1.5, 2.2), 'clothGold', px + Math.sin(a + Math.PI / 2) * 0.75, gy + 3.2, pz + Math.cos(a + Math.PI / 2) * 0.75, a + Math.PI / 2);
    b.addCylinderCollider(px, pz, 0.25, gy, gy + 4.2);
  }

  return { lockStone: new THREE.Vector3(lx, ly, lz) };
}
