import * as THREE from 'three';
import type { StaticBuilder } from './Materials';

/**
 * Fase 23 — STONEPATHS: the village's hand-laid flagstone roads and the
 * fountain plaza, replacing the old flat cobble boxes (which floated on
 * slopes, tiled the same 6-stone texture patch every 2 metres and read as
 * "cheap asset pack").
 *
 * Every stone is an individual bevelled box:
 *   · sunk 2 cm into the ground and TILTED to the local terrain normal —
 *     no floating slabs, no buried edges, the road hugs the hill;
 *   · mapped to a RANDOM WINDOW of the cobblestone photo (≈ one worn stone
 *     per flag) — the pattern can never repeat;
 *   · carrying a per-stone weather tint in vertex colours (quarry greys,
 *     warm sandstone, the odd mossy slab) — the hand-laid look;
 *   · framed by proud kerb stones along the edges.
 *
 * A conformed dirt ribbon runs beneath each road so the gaps between
 * slabs show trodden earth, not lawn.
 */

const _v = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

/** Local terrain slope at (x,z): finite-difference normal.
 *  Clamped hard (~22°): paving conforms to hills, never stands on end. */
function terrainNormal(
  x: number, z: number,
  H: (x: number, z: number) => number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const e = 0.45;
  out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e));
  // clamp the tilt so a cliff edge doesn't stand a slab on end
  const horiz = Math.hypot(out.x, out.z);
  const maxT = 0.4 * 2 * e; // ~22°
  if (horiz > maxT) {
    const k = maxT / horiz;
    out.x *= k;
    out.z *= k;
  }
  return out.normalize();
}

/** Per-stone weather tint (grey quarry base, warm + mossy drifts). */
function stoneTint(rand: () => number, out: THREE.Color): THREE.Color {
  const r = rand();
  if (r < 0.14) {
    // mossy — north-face damp
    out.setRGB(0.72 + rand() * 0.1, 0.85 + rand() * 0.1, 0.66 + rand() * 0.08);
  } else if (r < 0.34) {
    // warm sandstone drift
    out.setRGB(1.02 + rand() * 0.1, 0.94 + rand() * 0.06, 0.8 + rand() * 0.08);
  } else {
    // quarry grey with value variety
    const v = 0.74 + rand() * 0.34;
    out.setRGB(v * (0.98 + rand() * 0.05), v, v * (0.92 + rand() * 0.07));
  }
  return out;
}

/** One bevelled-ish flagstone box with a random UV window + vertex tint.
 *  The UV window maps ≈ one stone of the cobblestone photo onto the top
 *  face (span = size / 4.0 m per full tile) — each slab reads as a single
 *  worn stone with mortar edges, and no two slabs show the same patch. */
function makeStone(
  w: number, h: number, d: number,
  rand: () => number,
  tint: THREE.Color,
  uvSpan: number,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const su = THREE.MathUtils.clamp((w >= d ? w : d) * uvSpan, 0.05, 0.34);
  const sv = THREE.MathUtils.clamp((w >= d ? d : w) * uvSpan, 0.05, 0.34);
  const u0 = rand() * (1 - su);
  const v0 = rand() * (1 - sv);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * su, v0 + uv.getY(i) * sv);
  }
  const n = uv.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tint.r;
    col[i * 3 + 1] = tint.g;
    col[i * 3 + 2] = tint.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Bake a full position+yaw+tilt transform into the geometry and hand it
 *  to the builder (identity at add-time). The builder's non-indexed copy
 *  goes into the merge bucket; the local original is freed.
 *
 *  Fase 23b — the orientation is a proper BASIS build (up = terrain normal,
 *  forward = the yaw tangent projected onto that slope plane), so every
 *  corner of the slab stays on the ground. The old yaw∘tilt composition
 *  rotated the tilt direction with the yaw — slabs banked sideways and
 *  their corners lifted clean off the terrain. */
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
function addStone(
  b: StaticBuilder,
  geo: THREE.BufferGeometry,
  x: number, y: number, z: number,
  yaw: number,
  H: (x: number, z: number) => number,
  key: 'flagstone' | 'kerb',
): void {
  const up = terrainNormal(x, z, H, _v);
  _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));          // world tangent
  _fwd.addScaledVector(up, -_fwd.dot(up)).normalize(); // project onto slope
  _right.crossVectors(up, _fwd);
  _m.makeBasis(_right, up, _fwd);
  _q1.setFromRotationMatrix(_m);
  _pos.set(x, y, z);
  _m.compose(_pos, _q1, _one);
  geo.applyMatrix4(_m);
  b.add(geo, key, 0, 0, 0);
  geo.dispose();
}

const _tint = new THREE.Color();

/** Conformed dirt strip under a road (so slab gaps show trodden earth).
 *  A GRID, not an edge-to-edge quad: every vertex samples the terrain at
 *  its own (x,z) so the sheet can never bridge over a concave hollow and
 *  occlude the stones (the flat-ribbon version did exactly that — a dirt
 *  plane hovering above the road every dip). */
function dirtRibbon(
  b: StaticBuilder,
  stations: Array<{ x: number; z: number; nx: number; nz: number }>,
  width: number,
  H: (x: number, z: number) => number,
): void {
  const across = 5; // samples across the width
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const hw = width / 2;
  const vertex = (px: number, pz: number, u: number, v: number): void => {
    pos.push(px, H(px, pz) + 0.011, pz);
    nor.push(0, 1, 0);
    uvs.push(u * 0.5, v);
  };
  let arc = 0;
  for (let s = 0; s < stations.length - 1; s++) {
    const A = stations[s];
    const B = stations[s + 1];
    const seg = Math.hypot(B.x - A.x, B.z - A.z);
    for (let j = 0; j < across - 1; j++) {
      const l0 = -hw + (2 * hw * j) / (across - 1);
      const l1 = -hw + (2 * hw * (j + 1)) / (across - 1);
      // quad (A,l0)-(A,l1)-(B,l0)-(B,l1) as two triangles, every corner at
      // its own terrain height
      vertex(A.x + A.nx * l0, A.z + A.nz * l0, l0, arc / 2.4);
      vertex(A.x + A.nx * l1, A.z + A.nz * l1, l1, arc / 2.4);
      vertex(B.x + B.nx * l0, B.z + B.nz * l0, l0, (arc + seg) / 2.4);
      vertex(A.x + A.nx * l1, A.z + A.nz * l1, l1, arc / 2.4);
      vertex(B.x + B.nx * l1, B.z + B.nz * l1, l1, (arc + seg) / 2.4);
      vertex(B.x + B.nx * l0, B.z + B.nz * l0, l0, (arc + seg) / 2.4);
    }
    arc += seg;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  b.add(geo, 'dirt', 0, 0, 0);
}

/**
 * A hand-laid flagstone road from (ax,az) to (bx,bz).
 * The centerline wanders organically (a real curve, not box jitter), slabs
 * are laid in courses across it, and both edges are framed with kerbs.
 */
export function buildFlagstonePath(
  b: StaticBuilder,
  rand: () => number,
  ax: number, az: number, bx: number, bz: number,
  width: number,
  H: (x: number, z: number) => number,
): void {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1) return;
  const dirX = (bx - ax) / len;
  const dirZ = (bz - az) / len;
  const nrmX = -dirZ;
  const nrmZ = dirX;
  const wanderSeed = rand() * Math.PI * 2;
  const wanderAmp = Math.min(0.55, 0.22 + len * 0.006);

  // ---- stations along the wandering centerline (0.55 m courses) ----
  const stations: Array<{ x: number; z: number; nx: number; nz: number; yaw: number }> = [];
  const nCourses = Math.max(2, Math.round(len / 0.55));
  for (let i = 0; i <= nCourses; i++) {
    const t = i / nCourses;
    // organic sweep: one long S-curve + a whisper of a second harmonic,
    // eased to zero at both ends so the road still STARTS where it should
    const ease = Math.sin(t * Math.PI);
    const off = Math.sin(t * 2.2 + wanderSeed) * wanderAmp * ease
      + Math.sin(t * 5.1 + wanderSeed * 2.3) * 0.1 * ease;
    stations.push({
      x: ax + (bx - ax) * t + nrmX * off,
      z: az + (bz - az) * t + nrmZ * off,
      nx: nrmX, nz: nrmZ,
      yaw: Math.atan2(dirX, dirZ),
    });
  }

  // ---- dirt base ----
  dirtRibbon(b, stations, width + 0.42, H);

  // ---- the slabs ----
  // Fase 23b — WORN IN, not laid on top: slab tops ride 2–3.5 cm above
  // grade and the remaining 2/3 of each stone stays buried (the first
  // pass exposed the FULL 13 cm box height — the "scattered debris"
  // read). Thinner slabs, tighter courses.
  const nAcross = Math.max(3, Math.round(width / 0.56));
  const cell = width / nAcross;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    // stagger alternate courses like a brick bond
    const shift = (i % 2) * 0.5;
    for (let j = 0; j < nAcross; j++) {
      const lat = (j + 0.5 - nAcross / 2 + (shift && j === nAcross - 1 ? 0.5 : 0)) * cell
        + (rand() - 0.5) * 0.05;
      const px = st.x + st.nx * lat;
      const pz = st.z + st.nz * lat;
      const w = cell * (0.88 + rand() * 0.1);
      const d = 0.5 + rand() * 0.14;
      const h = 0.09 + rand() * 0.03;
      const top = H(px, pz) + 0.02 + rand() * 0.015;
      const geo = makeStone(w, h, d, rand, stoneTint(rand, _tint), 1 / 4.0);
      addStone(b, geo, px, top - h / 2, pz, st.yaw + (rand() - 0.5) * 0.36, H, 'flagstone');
    }
  }

  // ---- kerbs (both edges, proud of the road) ----
  // Fase 23b — aged, not machined: heights stagger, the odd kerb is
  // MISSING (pulled out for a hearthstone decades ago), a few lean out.
  const kerbStep = 0.92;
  const nKerb = Math.max(1, Math.floor(len / kerbStep));
  for (let i = 0; i <= nKerb; i++) {
    const t = i / nKerb;
    const ease = Math.sin(t * Math.PI);
    const off = Math.sin(t * 2.2 + wanderSeed) * wanderAmp * ease
      + Math.sin(t * 5.1 + wanderSeed * 2.3) * 0.1 * ease;
    const cxp = ax + (bx - ax) * t + nrmX * off;
    const czp = az + (bz - az) * t + nrmZ * off;
    for (const side of [-1, 1]) {
      if (rand() < 0.09) continue; // the missing kerb — time took it
      const px = cxp + nrmX * side * (width / 2 + 0.16);
      const pz = czp + nrmZ * side * (width / 2 + 0.16);
      const w = 0.3 + rand() * 0.08;
      const d = 0.66 + rand() * 0.4;
      const h = 0.13 + rand() * 0.05;
      const top = H(px, pz) + 0.038 + rand() * 0.03;
      const kt = stoneTint(rand, _tint).multiplyScalar(0.82);
      const geo = makeStone(w, h, d, rand, kt, 1 / 3.4);
      addStone(b, geo, px, top - h / 2, pz, Math.atan2(dirX, dirZ) + (rand() - 0.5) * 0.1, H, 'kerb');
    }
  }

  // ---- sprawl: a few strays outside the kerb blend road into grass ----
  const nSprawl = Math.floor(len / 6);
  for (let i = 0; i < nSprawl; i++) {
    const t = rand();
    const ease = Math.sin(t * Math.PI);
    const off = Math.sin(t * 2.2 + wanderSeed) * wanderAmp * ease
      + Math.sin(t * 5.1 + wanderSeed * 2.3) * 0.1 * ease;
    const side = rand() < 0.5 ? -1 : 1;
    const px = ax + (bx - ax) * t + nrmX * (off + side * (width / 2 + 0.42 + rand() * 0.55));
    const pz = az + (bz - az) * t + nrmZ * (off + side * (width / 2 + 0.42 + rand() * 0.55));
    const w = 0.3 + rand() * 0.25;
    const h = 0.09 + rand() * 0.05;
    const top = H(px, pz) + 0.012 + rand() * 0.012;
    const st = stoneTint(rand, _tint).multiplyScalar(0.88);
    const geo = makeStone(w, h, w * (0.8 + rand() * 0.5), rand, st, 1 / 4.0);
    addStone(b, geo, px, top - h / 2, pz, rand() * Math.PI, H, 'flagstone');
  }
}

/**
 * The fountain plaza: concentric courses of radial slabs around (cx,cz),
 * from rInner (the basin kerb) to rOuter, plus a proud kerb ring. Courses
 * are brick-staggered so the joints never line up.
 */
export function buildCobblePlaza(
  b: StaticBuilder,
  rand: () => number,
  cx: number, cz: number,
  rInner: number, rOuter: number,
  H: (x: number, z: number) => number,
): void {
  // ---- dirt disc base (concentric ring strips, every vertex on the
  // terrain — a center-fan of 6 m triangles would bridge over hollows) ----
  {
    const rings = [0, rOuter * 0.34, rOuter * 0.68, rOuter + 0.25];
    const pos: number[] = [];
    const nor: number[] = [];
    const uvs: number[] = [];
    const vertex = (px: number, pz: number, u: number, v: number): void => {
      pos.push(px, H(px, pz) + 0.011, pz);
      nor.push(0, 1, 0);
      uvs.push(u, v);
    };
    for (let ri = 0; ri < rings.length - 1; ri++) {
      const r0 = rings[ri];
      const r1 = rings[ri + 1];
      const seg = Math.max(18, Math.round(r1 * 6));
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const px00 = cx + Math.cos(a0) * r0, pz00 = cz + Math.sin(a0) * r0;
        const px01 = cx + Math.cos(a1) * r0, pz01 = cz + Math.sin(a1) * r0;
        const px10 = cx + Math.cos(a0) * r1, pz10 = cz + Math.sin(a0) * r1;
        const px11 = cx + Math.cos(a1) * r1, pz11 = cz + Math.sin(a1) * r1;
        vertex(px00, pz00, Math.cos(a0) * r0 / 2.4, Math.sin(a0) * r0 / 2.4);
        vertex(px10, pz10, Math.cos(a0) * r1 / 2.4, Math.sin(a0) * r1 / 2.4);
        vertex(px01, pz01, Math.cos(a1) * r0 / 2.4, Math.sin(a1) * r0 / 2.4);
        vertex(px01, pz01, Math.cos(a1) * r0 / 2.4, Math.sin(a1) * r0 / 2.4);
        vertex(px10, pz10, Math.cos(a0) * r1 / 2.4, Math.sin(a0) * r1 / 2.4);
        vertex(px11, pz11, Math.cos(a1) * r1 / 2.4, Math.sin(a1) * r1 / 2.4);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    b.add(geo, 'dirt', 0, 0, 0);
  }

  // ---- concentric courses (tight: mortar-width joints, not rubble) ----
  const pitch = 0.52;
  let ring = 0;
  for (let r = rInner + 0.2; r <= rOuter; r += pitch, ring++) {
    const n = Math.max(8, Math.round((Math.PI * 2 * r) / 0.55));
    const chord = (Math.PI * 2 * r) / n;
    for (let i = 0; i < n; i++) {
      const a = (i + (ring % 2) * 0.5) * (Math.PI * 2 / n) + (rand() - 0.5) * 0.03;
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      const w = chord * (0.9 + rand() * 0.09);    // tangential
      const d = pitch * (0.92 + rand() * 0.1);    // radial
      const h = 0.09 + rand() * 0.03;
      const top = H(px, pz) + 0.02 + rand() * 0.015;
      const geo = makeStone(w, h, d, rand, stoneTint(rand, _tint), 1 / 4.0);
      // slab faces along the ring: yaw = tangent direction
      addStone(b, geo, px, top - h / 2, pz, a + Math.PI / 2 + (rand() - 0.5) * 0.12, H, 'flagstone');
    }
  }

  // ---- proud kerb ring at the rim ----
  const rk = rOuter + 0.14;
  const nK = Math.max(12, Math.round((Math.PI * 2 * rk) / 0.88));
  for (let i = 0; i < nK; i++) {
    const a = (i / nK) * Math.PI * 2 + 0.12;
    const px = cx + Math.cos(a) * rk;
    const pz = cz + Math.sin(a) * rk;
    const chord = (Math.PI * 2 * rk) / nK;
    const w = chord * 0.86;
    const h = 0.14 + rand() * 0.04;
    const top = H(px, pz) + 0.05 + rand() * 0.025;
    const kt = stoneTint(rand, _tint).multiplyScalar(0.8);
    const geo = makeStone(w, h, 0.3, rand, kt, 1 / 3.4);
    addStone(b, geo, px, top - h / 2, pz, a + Math.PI / 2 + (rand() - 0.5) * 0.08, H, 'kerb');
  }
}
