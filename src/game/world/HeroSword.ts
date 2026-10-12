import * as THREE from 'three';

/**
 * Fase 11 — HeroSword: a master-forged arming sword built procedurally with
 * REAL materials & textures (no flat grey boxes).
 *
 *  · Blade — lofted diamond cross-section with a deep fuller, polished-steel
 *    albedo from a canvas (damascus banding + edge shine), matching
 *    roughness/metalness maps so the edges catch the sun and the fuller
 *    reads engraved.
 *  · Crossguard — gilded brass with flared quillons, sphere finials and a
 *    hammered-gold texture.
 *  · Grip — oxblood leather with five gilded wire rings.
 *  · Pommel — gold disc + a faceted gem that glints.
 *  · Runes — a canvas emissive strip down the fuller; invisible at tier 0,
 *    ember at tier 1, golden at tier 2, arcane blue at tier 3 (matching the
 *    forge tiers of Bram's upgrades).
 *
 * Anchor: origin = grip centre, blade points +Y (same convention the kit
 * weapons use, so it drops straight into the knight's hand slot).
 */

export type SwordElement = 'fire' | 'frost' | 'storm';

export interface HeroSwordOpts {
  /** Forge tier 0..3 — drives the rune glow (see applyHeroSwordTier). */
  tier?: number;
  /** Bandit variant: red-black steel, no gem, rusted guard. */
  rusted?: boolean;
  /** Captain bandit: garnet-red gem instead of sapphire. */
  captain?: boolean;
  /** Fase 12 — elemental legendary: the blade itself burns/freezes/cracks. */
  element?: SwordElement;
}

// ---------------------------------------------------------------- textures

let bladeTexCache: THREE.CanvasTexture | null = null;
let bladeRoughCache: THREE.CanvasTexture | null = null;
let goldTexCache: THREE.CanvasTexture | null = null;
let leatherTexCache: THREE.CanvasTexture | null = null;
let runeTexCache: THREE.CanvasTexture | null = null;

/** Polished-steel albedo: damascus banding + a bright cutting edge on both
 *  sides + a darker fuller groove down the middle (u = across the blade). */
function bladeAlbedo(rusted: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const x = c.getContext('2d')!;
  // base steel
  if (rusted) {
    x.fillStyle = '#3a3436'; x.fillRect(0, 0, 128, 512);
  } else {
    x.fillStyle = '#c9ced6'; x.fillRect(0, 0, 128, 512);
  }
  // damascus banding (long horizontal currents, faint)
  for (let i = 0; i < 46; i++) {
    const y0 = Math.random() * 512;
    const amp = 3 + Math.random() * 7;
    const w = 40 + Math.random() * 80;
    const a = 0.05 + Math.random() * 0.09;
    x.strokeStyle = rusted
      ? `rgba(96,60,52,${a + 0.12})`
      : (Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(70,80,92,${a})`);
    x.lineWidth = 1 + Math.random() * 2.2;
    x.beginPath();
    for (let px = 0; px <= 128; px += 8) {
      const py = y0 + Math.sin((px / 128) * Math.PI * (1 + Math.random() * 2)) * amp;
      if (px === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    void w;
    x.stroke();
  }
  // faint vertical wisps
  for (let i = 0; i < 26; i++) {
    const px = Math.random() * 128;
    x.strokeStyle = rusted ? 'rgba(120,52,44,0.10)' : 'rgba(255,255,255,0.10)';
    x.lineWidth = 0.8 + Math.random() * 1.6;
    x.beginPath();
    x.moveTo(px, Math.random() * 512);
    x.lineTo(px + (Math.random() - 0.5) * 14, Math.random() * 512);
    x.stroke();
  }
  // fuller groove: dark satin band in the middle (u ~0.42..0.58)
  const grad = x.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0.00, rusted ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.38)');
  grad.addColorStop(0.30, 'rgba(0,0,0,0)');
  grad.addColorStop(0.42, rusted ? 'rgba(20,12,10,0.34)' : 'rgba(22,28,36,0.26)');
  grad.addColorStop(0.50, rusted ? 'rgba(10,6,6,0.42)' : 'rgba(12,16,22,0.34)');
  grad.addColorStop(0.58, rusted ? 'rgba(20,12,10,0.34)' : 'rgba(22,28,36,0.26)');
  grad.addColorStop(0.70, 'rgba(0,0,0,0)');
  grad.addColorStop(1.00, rusted ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.38)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 128, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Roughness map: bright = rough. Fuller and ricasso slightly satin,
 *  cutting edges polished. */
function bladeRough(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#8c8c8c'; x.fillRect(0, 0, 64, 256);
  const grad = x.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0.0, '#2a2a2a');     // edge mirror
  grad.addColorStop(0.2, '#c8c8c8');
  grad.addColorStop(0.42, '#6f6f6f');    // fuller satin
  grad.addColorStop(0.5, '#5f5f5f');
  grad.addColorStop(0.58, '#6f6f6f');
  grad.addColorStop(0.8, '#c8c8c8');
  grad.addColorStop(1.0, '#2a2a2a');     // edge mirror
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Hammered gold: warm base with dents catching light. */
function goldTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#d3a445'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 240; i++) {
    const px = Math.random() * 128;
    const py = Math.random() * 128;
    const r = 1.5 + Math.random() * 4.5;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const lite = Math.random() < 0.5;
    g.addColorStop(0, lite ? 'rgba(255,238,180,0.5)' : 'rgba(120,72,20,0.42)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, r, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Oxblood leather with subtle grain for the grip. */
function leatherTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#4e2027'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(20,8,10,0.35)' : 'rgba(122,52,60,0.30)';
    x.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 2.2, 1 + Math.random() * 1.4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Rune strip down the fuller (white glyphs on black — used as emissiveMap;
 *  emissive colour is applied per tier). */
function runeTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 512);
  x.fillStyle = '#fff';
  // angular elder-futhark-ish glyphs, 7 down the fuller
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 9; i++) {
    const gy = 46 + i * 50;
    const ch = glyphs[(i * 3 + 1) % glyphs.length] ?? 'ᛉ';
    x.save();
    x.translate(32, gy);
    x.rotate((Math.random() - 0.5) * 0.1);
    x.font = '34px serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(ch, 0, 0);
    x.restore();
    // twin dots framing each glyph
    x.beginPath(); x.arc(14, gy, 2.4, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(50, gy, 2.4, 0, Math.PI * 2); x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------------------------------------------------------------- geometry

/** Cross-section of the blade at a given half-width w: a diamond with a
 *  bevel and a fuller — 12 points, CCW, y = thickness axis. */
function bladeSection(w: number, th: number): THREE.Vector2[] {
  return [
    new THREE.Vector2(0, th),            // ridge +
    new THREE.Vector2(w * 0.32, th * 0.86),
    new THREE.Vector2(w * 0.78, th * 0.5),
    new THREE.Vector2(w, th * 0.08),     // edge +
    new THREE.Vector2(w, -th * 0.08),
    new THREE.Vector2(w * 0.78, -th * 0.5),
    new THREE.Vector2(w * 0.32, -th * 0.86),
    new THREE.Vector2(0, -th),           // ridge -
    new THREE.Vector2(-w * 0.32, -th * 0.86),
    new THREE.Vector2(-w * 0.78, -th * 0.5),
    new THREE.Vector2(-w, -th * 0.08),   // edge -
    new THREE.Vector2(-w, th * 0.08),
    new THREE.Vector2(-w * 0.78, th * 0.5),
    new THREE.Vector2(-w * 0.32, th * 0.86),
  ];
}

/** Loft the blade: sections from y0..y1 with width/thickness eased by a
 *  profile curve. u across each section, v along the blade. */
function loftBlade(
  sections: Array<{ y: number; w: number; th: number }>,
  tip: { y: number },
): THREE.BufferGeometry {
  const rings: THREE.Vector2[][] = sections.map((s) => bladeSection(s.w, s.th));
  const N = rings[0].length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ringUVu = [0.5, 0.62, 0.8, 0.99, 1.0, 0.99, 0.8, 0.62, 0.5, 0.38, 0.2, 0.01, 0.0, 0.01, 0.2, 0.38];
  for (let s = 0; s < sections.length; s++) {
    for (let i = 0; i < N; i++) {
      pos.push(rings[s][i].x, sections[s].y, rings[s][i].y);
      uv.push(ringUVu[i], s / (sections.length - 1));
    }
  }
  const tipIdx = pos.length / 3;
  pos.push(0, tip.y, 0);
  uv.push(0.5, 1.0);
  for (let s = 0; s < sections.length - 1; s++) {
    const a = s * N;
    const b = (s + 1) * N;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      idx.push(a + i, b + i, a + j, a + j, b + i, b + j);
    }
  }
  // fan the tip
  const last = (sections.length - 1) * N;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    idx.push(last + i, tipIdx, last + j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- build

/**
 * Build the sword. `applyHeroSwordTier` adjusts the rune glow afterwards
 * (KnightModelGLB.setWeaponTier routes through it when userData.heroSword).
 */
export function buildHeroSword(opts: HeroSwordOpts = {}): THREE.Group {
  const tier = Math.max(0, Math.min(3, Math.floor(opts.tier ?? 0)));
  const rusted = opts.rusted ?? false;

  if (!bladeTexCache) {
    bladeTexCache = bladeAlbedo(false);
    bladeRoughCache = bladeRough();
    goldTexCache = goldTex();
    leatherTexCache = leatherTex();
    runeTexCache = runeTex();
  }
  // rusted variant needs its own albedo
  const albedo = rusted ? bladeAlbedo(true) : bladeTexCache;

  const g = new THREE.Group();
  g.name = 'hero_sword';
  g.userData.heroSword = true;
  g.userData.baseRotX = 0;

  const gold = new THREE.MeshStandardMaterial({
    map: goldTexCache,
    color: rusted ? 0x8a6a30 : 0xe8c06a,
    metalness: 0.95,
    roughness: 0.3,
  });
  const steel = new THREE.MeshStandardMaterial({
    map: albedo,
    roughnessMap: bladeRoughCache,
    color: rusted ? 0x8a4a42 : 0xffffff,
    metalness: rusted ? 0.55 : 0.92,
    roughness: rusted ? 0.52 : 0.34,
    emissiveMap: runeTexCache,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });
  const leather = new THREE.MeshStandardMaterial({
    map: leatherTexCache,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.04,
  });
  const gemColor = opts.captain ? 0x8e1626 : 0x1d4d8e;
  const gem = new THREE.MeshStandardMaterial({
    color: gemColor,
    metalness: 0.15,
    roughness: 0.06,
    emissive: new THREE.Color(gemColor).multiplyScalar(0.25),
  });

  // ---- blade (0.05 → 0.88, tip 0.9) ----
  const secs: Array<{ y: number; w: number; th: number }> = [
    { y: 0.045, w: 0.052, th: 0.0215 },   // ricasso root
    { y: 0.10, w: 0.050, th: 0.020 },
    { y: 0.22, w: 0.047, th: 0.018 },
    { y: 0.38, w: 0.043, th: 0.016 },
    { y: 0.54, w: 0.038, th: 0.014 },
    { y: 0.68, w: 0.030, th: 0.0115 },
    { y: 0.79, w: 0.021, th: 0.008 },
    { y: 0.865, w: 0.010, th: 0.005 },
  ];
  const blade = new THREE.Mesh(loftBlade(secs, { y: 0.9 }), steel);
  blade.castShadow = true;
  g.add(blade);

  // ---- crossguard: central block + flared quillons + finials ----
  const guard = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.05, 0.03), gold);
  block.geometry.translate(0, 0, 0);
  guard.add(block);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), gold);
  boss.scale.set(1, 0.55, 0.72);
  boss.position.y = 0.012;
  guard.add(boss);
  for (const side of [1, -1] as const) {
    const quillon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.011, 0.115, 8),
      gold,
    );
    quillon.rotation.z = Math.PI / 2;
    quillon.position.set(side * 0.082, 0, 0);
    // drooping dragon-head quillons
    quillon.rotation.y = side * 0.35;
    guard.add(quillon);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), gold);
    finial.position.set(side * 0.138, -0.013, side * 0.026);
    guard.add(finial);
    // tiny claw under each finial
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, 5), gold);
    claw.position.set(side * 0.142, -0.033, side * 0.026);
    claw.rotation.x = Math.PI;
    guard.add(claw);
  }
  guard.position.y = 0.028;
  guard.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  g.add(guard);

  // ---- grip: leather wrap with five gilded rings ----
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0235, 0.027, 0.155, 10),
    leather,
  );
  grip.position.y = -0.062;
  g.add(grip);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0255 - i * 0.0006, 0.0042, 6, 12), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.124 + i * 0.031;
    g.add(ring);
  }

  // ---- pommel: gold disc + gem in prongs ----
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), gold);
  pommel.scale.set(1, 0.66, 0.86);
  pommel.position.y = -0.166;
  g.add(pommel);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.026, 10), gold);
  collar.position.y = -0.14;
  g.add(collar);
  const gemMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.019, 0), gem);
  gemMesh.position.y = -0.152;
  gemMesh.scale.set(1, 0.72, 1);
  gemMesh.rotation.y = Math.PI / 4;
  g.add(gemMesh);
  if (!rusted) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const prong = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.02, 4), gold);
      prong.position.set(Math.cos(a) * 0.017, -0.152, Math.sin(a) * 0.017);
      prong.rotation.x = Math.PI; // claws reach down over the gem
      g.add(prong);
    }
  }

  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  applyHeroSwordTier(g, rusted ? 0 : tier, rusted);
  if (opts.element) applyHeroSwordElement(g, opts.element);
  return g;
}

/** Fase 12 — elemental palettes: the whole blade identity shifts. */
const ELEMENT_COLORS: Record<SwordElement, { rune: number; gem: number; gold: number; steel: number }> = {
  fire:  { rune: 0xff4d12, gem: 0xff6a1e, gold: 0xffb35c, steel: 0xffd9c2 },
  frost: { rune: 0x66d9ff, gem: 0x9fdcff, gold: 0xbfe8ff, steel: 0xd8f2ff },
  storm: { rune: 0xa97fff, gem: 0xb98cff, gold: 0xd9c2ff, steel: 0xe8dfff },
};

/** Turn a hero sword into its elemental legendary form: blazing runes,
 * a burning gem and a warm/cold tint over steel + gold. */
export function applyHeroSwordElement(sword: THREE.Object3D, element: SwordElement): void {
  const pal = ELEMENT_COLORS[element];
  sword.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) continue;
      if (std.emissiveMap === runeTexCache) {
        // the runes BLAZE in the element colour
        std.emissive?.setHex(pal.rune);
        std.emissiveIntensity = 2.4;
      } else if (std.map === goldTexCache) {
        std.color.setHex(pal.gold);
        std.emissive?.setHex(pal.rune);
        std.emissiveIntensity = 0.34;
      } else if (std.map === leatherTexCache) {
        // grip keeps its leather but darkens
        std.color.setHex(0x6a4a3a);
      } else {
        // blade steel: tinted by the element
        std.color.setHex(pal.steel);
        std.emissive?.setHex(pal.rune);
        std.emissiveIntensity = 0.16;
      }
      std.needsUpdate = true;
    }
  });
}

/** Rune glow per forge tier. Rusted blades never glow. */
export function applyHeroSwordTier(sword: THREE.Object3D, tier: number, rusted = false): void {
  const colors = [0x000000, 0xff9a3c, 0xe8c96a, 0x7ec8ff];
  const t = rusted ? 0 : Math.max(0, Math.min(3, Math.floor(tier)));
  const hex = colors[t];
  sword.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) continue;
      if (std.emissiveMap === runeTexCache) {
        if (t > 0) {
          std.emissive?.setHex(hex);
          std.emissiveIntensity = 0.85 + t * 0.35;
        } else {
          std.emissive?.setHex(0x000000);
          std.emissiveIntensity = 0;
        }
        std.needsUpdate = true;
      } else if (t > 1 && !rusted && std.map === goldTexCache) {
        // upper tiers: the gold itself warms up a touch
        std.emissive?.setHex(hex);
        std.emissiveIntensity = 0.12 + (t - 2) * 0.12;
        std.needsUpdate = true;
      }
    }
  });
}
