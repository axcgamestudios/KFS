import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TerrainHeight } from '../world/TerrainHeight';

/**
 * Fase 27 — EL BESTIARIO COMÚN ("pulle todas las mecanicas... Enemigos
 * comunes"). The common-enemy roster of the Forgotten Seas, per the design
 * doc — every species a real opponent with its own body, its own behavior
 * and its own loot table:
 *
 *   · MENORES  (Lv 1-5)   Duende Silvestre · Kobold de las Estribaciones ·
 *                          Grimpote de los Manglares · Slime Viscoso Común
 *   · MEDIOS   (Lv 10-25) Hostigador de las Cumbres (arpía) · Artillero
 *                          Corsario · Golem de Piedra Rúnica · Slime
 *                          Elemental (fuego/rayo/veneno, se divide al morir)
 *   · AVANZADOS (Lv 26-40) Guardián de Escamas Dracónicas · Comandante
 *                          Corsario Fantasma · Daimyo Corrupto de la Niebla ·
 *                          Slime Corrosivo Devorador
 *   · MINI-JEFES          Krog "El Acaparador" · Thorne "El Guardián Caído"
 *                          (druida → oso al 40%) · King Slime "La Masa
 *                          Indestructible" (mitosis al 50%)
 *
 * DESIGN NOTES
 *  · Tiered by ZONE, not by level: the meadows around Crowhaven carry the
 *    small fry, the mid island the mediums, the far peaks/isles the elites.
 *    The dragons are level-gated now — the early game belongs to the common
 *    enemies, exactly as asked ("no pongas al jugador a pelear con dragones
 *    desde el inicio").
 *  · STREAMED: each spawn zone wakes when the player is within ~220 m and
 *    its creatures despawn beyond ~280 m — the draw-call budget survives a
 *    35-species bestiary (each creature is 1 merged vertex-colored body +
 *    a few animated limbs).
 *  · All damage flows through Game's hooks (melee/arrow/ember/mythic) —
 *    the system exposes the same query surface as BanditSystem.
 */

// ------------------------------------------------------------------ hooks

export interface BestiaryHooks {
  playerDamage(dmg: number, fromX?: number, fromZ?: number, reason?: string, opts?: { unblockable?: boolean }): void;
  /** Slow (mud), root (druid/krog), shock (storm slime). mul < 1 slows. */
  playerStatus?(kind: 'slow' | 'root' | 'shock', dur: number, mul?: number): void;
  notify(kind: 'info' | 'item' | 'quest', title: string, body?: string): void;
  giveXp(xp: number): void;
  addCoins(n: number): void;
  addItem(id: string, count: number): void;
  /** Kill-counter feed for quests ('creature_<species>'). */
  registerKill?(kind: string): void;
  sound(kind: string): void;
  weaponImpact(pos: THREE.Vector3): void;
  blockSparks(pos: THREE.Vector3): void;
  cameraShake(i: number): void;
  hitStop(dur: number): void;
  bossHud?(state: { name: string; title: string; hp: number; maxHp: number; phase: number } | null): void;
  hasFlag(flag: string): boolean;
  setFlag(flag: string): void;
  /** The player's level (tier sanity + dragon-gate parity). */
  level(): number;
}

// ------------------------------------------------------------------ species

export type BodyPlan =
  | 'goblinoid' | 'reptilian' | 'amphibian' | 'slime' | 'harpy'
  | 'corsair' | 'golem' | 'guardian' | 'ghost' | 'daimyo'
  | 'druid' | 'bear';

export interface LootDrop { id: string; count: number; chance: number }

export interface SpeciesDef {
  id: string;
  name: string;
  title: string;
  tier: 1 | 2 | 3 | 'mini';
  levels: [number, number];
  body: BodyPlan;
  hp: number;
  damage: number;
  aggroRadius: number;
  chaseSpeed: number;
  wanderSpeed: number;
  /** Attack style drives the AI branch. */
  attack: 'melee' | 'spear' | 'spit' | 'bounce' | 'dive' | 'musket' | 'stomp'
        | 'shieldwall' | 'saber' | 'odachi' | 'club' | 'roots' | 'swallow' | 'acid';
  attackRange: number;
  attackCooldown: [number, number];
  xp: number;
  gold: [number, number];
  loot: LootDrop[];
  /** Golem-style: light cutting barely scratches (×0.4); arrows bite (×1.3). */
  lightResist?: number;
  arrowMult?: number;
  /** Guardian: 80% of frontal damage absorbed until heavies crack the wall. */
  frontalBlock?: boolean;
  /** Daimyo: hits from behind tear (×1.6). */
  backstabMult?: number;
  /** Corrosive: arrows sink into the mass (×0.35) and hits corrode armor. */
  corrodes?: boolean;
  /** Splits on death (slimes). */
  splitInto?: { id: string; count: number };
  /** Goblins run at low HP. */
  fleesAt?: number;
  scale?: number;
  /** Extra visual palette knob. */
  tint?: number;
  /** Mini-boss extras. */
  boss?: boolean;
  intro?: [string, string];
}

const S = (d: SpeciesDef): SpeciesDef => d;

export const SPECIES: Record<string, SpeciesDef> = {
  // ------------------------------- MENORES (Lv 1-5) -------------------------------
  duende: S({
    id: 'duende', name: 'Duende Silvestre', title: 'Goblin of the woods',
    tier: 1, levels: [1, 5], body: 'goblinoid',
    hp: 24, damage: 6, aggroRadius: 15, chaseSpeed: 3.6, wanderSpeed: 1.1,
    attack: 'melee', attackRange: 1.7, attackCooldown: [1.0, 1.6],
    xp: 8, gold: [2, 6], fleesAt: 0.28,
    loot: [
      { id: 'garrote_mellado', count: 1, chance: 0.8 },
      { id: 'chatarra_hierro', count: 1, chance: 0.4 },
      { id: 'manzana_silvestre', count: 1, chance: 0.2 },
    ],
  }),
  kobold: S({
    id: 'kobold', name: 'Kobold de las Estribaciones', title: 'Spear of the foothills',
    tier: 1, levels: [1, 5], body: 'reptilian',
    hp: 28, damage: 7, aggroRadius: 15, chaseSpeed: 3.3, wanderSpeed: 1.0,
    attack: 'spear', attackRange: 2.4, attackCooldown: [1.7, 2.4],
    xp: 9, gold: [2, 6],
    loot: [
      { id: 'escama_opaca', count: 1, chance: 0.7 },
      { id: 'diente_reptil', count: 1, chance: 0.35 },
      { id: 'flecha', count: 5, chance: 0.5 },
    ],
  }),
  grimpote: S({
    id: 'grimpote', name: 'Grimpote de los Manglares', title: 'Mud-spitter of the swamps',
    tier: 1, levels: [1, 5], body: 'amphibian',
    hp: 18, damage: 4, aggroRadius: 13, chaseSpeed: 2.6, wanderSpeed: 0.9,
    attack: 'spit', attackRange: 7, attackCooldown: [2.0, 3.0],
    xp: 7, gold: [1, 4],
    loot: [
      { id: 'lodo_viscoso', count: 1, chance: 0.6 },
      { id: 'piel_anfibio', count: 1, chance: 0.45 },
    ],
  }),
  slime_comun: S({
    id: 'slime_comun', name: 'Slime Viscoso Común', title: 'The swamp\'s patient jelly',
    tier: 1, levels: [1, 5], body: 'slime', tint: 0x6fae62,
    hp: 22, damage: 5, aggroRadius: 12, chaseSpeed: 2.2, wanderSpeed: 0.7,
    attack: 'bounce', attackRange: 1.6, attackCooldown: [1.4, 2.2],
    xp: 7, gold: [1, 4],
    loot: [
      { id: 'gelatina_basica', count: 1, chance: 0.8 },
      { id: 'agua_estancada', count: 1, chance: 0.4 },
    ],
  }),

  // ------------------------------- MEDIOS (Lv 10-25) -------------------------------
  arpia: S({
    id: 'arpia', name: 'Hostigador de las Cumbres', title: 'Rock harpy',
    tier: 2, levels: [10, 25], body: 'harpy',
    hp: 56, damage: 13, aggroRadius: 24, chaseSpeed: 7.2, wanderSpeed: 3.2,
    attack: 'dive', attackRange: 2.2, attackCooldown: [2.6, 3.6],
    xp: 22, gold: [8, 15],
    loot: [
      { id: 'pluma_arpia', count: 1, chance: 0.65 },
      { id: 'garra_afilada', count: 1, chance: 0.4 },
      { id: 'elixir_agilidad', count: 1, chance: 0.2 },
    ],
  }),
  artillero: S({
    id: 'artillero', name: 'Artillero Corsario', title: 'Matchlock of the coast forts',
    tier: 2, levels: [10, 25], body: 'corsair',
    hp: 62, damage: 16, aggroRadius: 26, chaseSpeed: 3.4, wanderSpeed: 1.0,
    attack: 'musket', attackRange: 24, attackCooldown: [3.0, 4.0],
    xp: 24, gold: [10, 18],
    loot: [
      { id: 'polvora_fina', count: 1, chance: 0.6 },
      { id: 'lingote_plomo', count: 1, chance: 0.45 },
      { id: 'mec_mosquete', count: 1, chance: 0.15 },
    ],
  }),
  golem: S({
    id: 'golem', name: 'Golem de Piedra Rúnica', title: 'Warden of the old temples',
    tier: 2, levels: [10, 25], body: 'golem',
    hp: 135, damage: 20, aggroRadius: 17, chaseSpeed: 2.2, wanderSpeed: 0.6,
    attack: 'stomp', attackRange: 2.6, attackCooldown: [2.6, 3.4],
    xp: 30, gold: [12, 22], lightResist: 0.4, arrowMult: 1.3,
    loot: [
      { id: 'polvo_piedra_runica', count: 1, chance: 0.7 },
      { id: 'fragmento_nucleo', count: 1, chance: 0.3 },
      { id: 'gema_antartica', count: 1, chance: 0.1 },
    ],
  }),
  slime_elemental: S({
    id: 'slime_elemental', name: 'Slime Elemental', title: 'Jelly imbued with the wilds',
    tier: 2, levels: [10, 15], body: 'slime', tint: 0xe8722a,
    hp: 46, damage: 11, aggroRadius: 15, chaseSpeed: 2.8, wanderSpeed: 0.9,
    attack: 'bounce', attackRange: 1.8, attackCooldown: [1.6, 2.4],
    xp: 18, gold: [6, 12], splitInto: { id: 'slime_comun', count: 2 },
    loot: [
      { id: 'gelatina_elemental', count: 1, chance: 0.6 },
      { id: 'nucleo_viscoso', count: 1, chance: 0.25 },
    ],
  }),

  // ------------------------------- AVANZADOS (Lv 26-40) -------------------------------
  guardian_draconico: S({
    id: 'guardian_draconico', name: 'Guardián de Escamas Dracónicas', title: 'Warden of the Elder\'s gate',
    tier: 3, levels: [26, 40], body: 'guardian', scale: 1.18,
    hp: 230, damage: 26, aggroRadius: 19, chaseSpeed: 2.9, wanderSpeed: 0.7,
    attack: 'shieldwall', attackRange: 2.8, attackCooldown: [2.2, 3.2],
    xp: 55, gold: [22, 34], frontalBlock: true,
    loot: [
      { id: 'escama_draconica', count: 1, chance: 0.65 },
      { id: 'lingote_acero_mistico', count: 1, chance: 0.4 },
      { id: 'gema_fuego', count: 1, chance: 0.1 },
    ],
  }),
  comandante_fantasma: S({
    id: 'comandante_fantasma', name: 'Comandante Corsario Fantasma', title: 'Officer of the drowned fleet',
    tier: 3, levels: [26, 40], body: 'ghost',
    hp: 175, damage: 22, aggroRadius: 22, chaseSpeed: 4.2, wanderSpeed: 1.2,
    attack: 'saber', attackRange: 2.3, attackCooldown: [1.1, 1.7],
    xp: 50, gold: [26, 40],
    loot: [
      { id: 'polvora_maldita', count: 1, chance: 0.6 },
      { id: 'reliquia_marina', count: 1, chance: 0.3 },
      { id: 'pluma_galeon', count: 1, chance: 0.12 },
    ],
  }),
  daimyo: S({
    id: 'daimyo', name: 'Daimyo Corrupto de la Niebla', title: 'Blade of the mist shrines',
    tier: 3, levels: [26, 40], body: 'daimyo',
    hp: 195, damage: 28, aggroRadius: 20, chaseSpeed: 3.8, wanderSpeed: 1.1,
    attack: 'odachi', attackRange: 3.4, attackCooldown: [1.8, 2.6],
    xp: 55, gold: [24, 38], backstabMult: 1.6,
    loot: [
      { id: 'tamahagane', count: 1, chance: 0.55 },
      { id: 'esencia_viento_oscuro', count: 1, chance: 0.35 },
      { id: 'sello_guida', count: 1, chance: 0.08 },
    ],
  }),
  slime_corrosivo: S({
    id: 'slime_corrosivo', name: 'Slime Corrosivo Devorador', title: 'The hungering mass',
    tier: 3, levels: [25, 40], body: 'slime', tint: 0x8a9a3a, scale: 1.35,
    hp: 125, damage: 18, aggroRadius: 16, chaseSpeed: 3.0, wanderSpeed: 0.8,
    attack: 'acid', attackRange: 2.0, attackCooldown: [1.8, 2.6],
    xp: 45, gold: [18, 30], arrowMult: 0.35, corrodes: true,
    loot: [
      { id: 'acido_concentrado', count: 1, chance: 0.65 },
      { id: 'gelatina_maestra', count: 1, chance: 0.35 },
      { id: 'fragmento_armadura', count: 1, chance: 0.15 },
    ],
  }),

  // ------------------------------- MINI-JEFES -------------------------------
  krog: S({
    id: 'krog', name: 'Krog "El Acaparador"', title: 'Mini Jefe — the goblin hoarder',
    tier: 'mini', levels: [15, 20], body: 'goblinoid', scale: 1.85,
    hp: 390, damage: 24, aggroRadius: 22, chaseSpeed: 4.4, wanderSpeed: 1.2,
    attack: 'club', attackRange: 2.6, attackCooldown: [1.9, 2.8],
    xp: 170, gold: [110, 150], boss: true,
    intro: ['KROG "EL ACAPARADOR"', 'The hoarder-king of the goblin camps. His satchel smells of pitch and burning — and the horn at his belt has friends on speed-dial.'],
    loot: [
      { id: 'corona_chatarra', count: 1, chance: 1.0 },
      { id: 'garrote_krog', count: 1, chance: 0.2 },
      { id: 'bolsa_bombas', count: 5, chance: 0.45 },
      { id: 'cuero_bestia', count: 1, chance: 0.6 },
    ],
  }),
  thorne: S({
    id: 'thorne', name: 'Thorne "El Guardián Caído"', title: 'Mini Jefe — the fallen druid',
    tier: 'mini', levels: [20, 25], body: 'druid',
    hp: 430, damage: 22, aggroRadius: 22, chaseSpeed: 3.4, wanderSpeed: 1.0,
    attack: 'roots', attackRange: 9, attackCooldown: [2.8, 4.0],
    xp: 210, gold: [130, 180], boss: true,
    intro: ['THORNE "EL GUARDIÁN CAÍDO"', 'The grove\'s last warden, rooted in grief. The mist says that when the bark cracks, the bear wakes.'],
    loot: [
      { id: 'esencia_roble', count: 1, chance: 1.0 },
      { id: 'baculo_raices', count: 1, chance: 0.15 },
      { id: 'corteza_druida', count: 1, chance: 0.5 },
      { id: 'semilla_bosque', count: 1, chance: 0.1 },
    ],
  }),
  king_slime: S({
    id: 'king_slime', name: 'King Slime', title: 'Mini Jefe — la Masa Indestructible',
    tier: 'mini', levels: [20, 30], body: 'slime', tint: 0x4aa8c8, scale: 2.6,
    hp: 520, damage: 20, aggroRadius: 18, chaseSpeed: 3.2, wanderSpeed: 0.8,
    attack: 'swallow', attackRange: 2.6, attackCooldown: [3.0, 4.2],
    xp: 250, gold: [150, 210], boss: true,
    intro: ['KING SLIME — "LA MASA INDESTRUCTIBLE"', 'The cave\'s crowned hunger. Cut it and it simply becomes more of itself. Bring fire, bring patience — and never let it fall on you.'],
    loot: [
      { id: 'corona_slime', count: 1, chance: 1.0 },
      { id: 'espada_gelatina', count: 1, chance: 0.15 },
      { id: 'nucleo_primordial', count: 1, chance: 0.5 },
    ],
  }),
};

// ------------------------------------------------------------------ zones

interface ZoneDef {
  id: string;
  species: string;
  x: number;
  z: number;
  radius: number;
  count: number;
  /** Optional per-zone variant tint (elemental slimes). */
  variant?: 'fire' | 'shock' | 'poison';
}

/** Hand-placed spawn zones — tier rings around Crowhaven (20, 150). */
const ZONES: ZoneDef[] = [
  // ---- tier 1: the meadows, woods and shores near the village ----
  { id: 'gob_a', species: 'duende', x: 95, z: 95, radius: 12, count: 3 },
  { id: 'gob_b', species: 'duende', x: -75, z: 120, radius: 12, count: 3 },
  { id: 'gob_c', species: 'duende', x: 60, z: 225, radius: 13, count: 3 },
  { id: 'kob_a', species: 'kobold', x: 150, z: -60, radius: 12, count: 3 },
  { id: 'kob_b', species: 'kobold', x: -30, z: -110, radius: 12, count: 3 },
  { id: 'gri_a', species: 'grimpote', x: -40, z: 240, radius: 13, count: 3 },
  { id: 'gri_b', species: 'grimpote', x: 135, z: 245, radius: 12, count: 2 },
  { id: 'gri_c', species: 'grimpote', x: -145, z: 185, radius: 13, count: 3 },
  { id: 'sli_a', species: 'slime_comun', x: 175, z: 120, radius: 12, count: 2 },
  { id: 'sli_b', species: 'slime_comun', x: -60, z: 60, radius: 11, count: 2 },
  { id: 'sli_c', species: 'slime_comun', x: 240, z: -60, radius: 12, count: 2 },
  // ---- tier 2: cliffs, coasts, ruins ----
  { id: 'arp_a', species: 'arpia', x: -262, z: 55, radius: 15, count: 2 },
  { id: 'arp_b', species: 'arpia', x: 255, z: 55, radius: 15, count: 2 },
  { id: 'arp_c', species: 'arpia', x: -180, z: -180, radius: 15, count: 2 },
  { id: 'art_a', species: 'artillero', x: -302, z: 168, radius: 12, count: 2 },
  { id: 'art_b', species: 'artillero', x: 322, z: 38, radius: 12, count: 2 },
  { id: 'gol_a', species: 'golem', x: 216, z: -168, radius: 10, count: 1 },
  { id: 'gol_b', species: 'golem', x: -132, z: -238, radius: 10, count: 1 },
  { id: 'gol_c', species: 'golem', x: -225, z: -118, radius: 10, count: 1 },
  { id: 'elm_a', species: 'slime_elemental', x: 212, z: -196, radius: 10, count: 2, variant: 'fire' },
  { id: 'elm_b', species: 'slime_elemental', x: 295, z: 68, radius: 10, count: 2, variant: 'shock' },
  { id: 'elm_c', species: 'slime_elemental', x: -65, z: 228, radius: 10, count: 2, variant: 'poison' },
  // ---- tier 3: the far peaks and the outer seas ----
  { id: 'gua_a', species: 'guardian_draconico', x: 32, z: -272, radius: 10, count: 1 },
  { id: 'gua_b', species: 'guardian_draconico', x: -522, z: -438, radius: 10, count: 1 },
  { id: 'cfa_a', species: 'comandante_fantasma', x: -332, z: 202, radius: 10, count: 1 },
  { id: 'cfa_b', species: 'comandante_fantasma', x: -548, z: -452, radius: 10, count: 1 },
  { id: 'dai_a', species: 'daimyo', x: -32, z: 598, radius: 10, count: 1 },
  { id: 'dai_b', species: 'daimyo', x: 12, z: -332, radius: 10, count: 1 },
  { id: 'cor_a', species: 'slime_corrosivo', x: 205, z: -205, radius: 9, count: 1 },
  { id: 'cor_b', species: 'slime_corrosivo', x: -530, z: -428, radius: 9, count: 1 },
  // ---- mini-jefes ----
  { id: 'krog_camp', species: 'krog', x: -48, z: 38, radius: 10, count: 1 },
  { id: 'thorne_grove', species: 'thorne', x: -118, z: -238, radius: 9, count: 1 },
  { id: 'king_den', species: 'king_slime', x: 208, z: -195, radius: 9, count: 1 },
];

// ------------------------------------------------------------------ models

/** One shared vertex-colored material for every creature body part. */
const MAT_BODY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.06 });
/** Shared translucent material (slimes, the ghost). */
const MAT_SOFT = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.35, metalness: 0.0,
  transparent: true, opacity: 0.82,
});
/** Shared emissive material (eyes, runes, cores). */
const MAT_GLOW = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.4, metalness: 0.0,
  emissive: 0xffffff, emissiveIntensity: 0.55,
});

interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

/** Bake a part list into one vertex-colored geometry (1 draw call). */
function bakeParts(parts: Part[]): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()) as THREE.BufferGeometry;
    const m = new THREE.Matrix4();
    const e = new THREE.Euler(p.rot?.[0] ?? 0, p.rot?.[1] ?? 0, p.rot?.[2] ?? 0);
    m.compose(
      new THREE.Vector3(p.pos?.[0] ?? 0, p.pos?.[1] ?? 0, p.pos?.[2] ?? 0),
      new THREE.Quaternion().setFromEuler(e),
      new THREE.Vector3(p.scale?.[0] ?? 1, p.scale?.[1] ?? 1, p.scale?.[2] ?? 1),
    );
    g.applyMatrix4(m);
    g.deleteAttribute('uv');
    c.setHex(p.color);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged ?? new THREE.BoxGeometry(0.5, 0.5, 0.5);
}

// Shared primitive geometries (unit sized; parts scale them)
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const G_SPHERE = new THREE.SphereGeometry(0.5, 10, 8);
const G_CONE = new THREE.ConeGeometry(0.5, 1, 8);
const G_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);

/** A colored limb mesh hung on a pivot group (so it can rotate at the joint). */
function limb(color: number, w: number, h: number, d: number, glow = false): { pivot: THREE.Group; mesh: THREE.Mesh } {
  const pivot = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, glow ? MAT_GLOW : MAT_BODY);
  mesh.position.y = -h / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return { pivot, mesh };
}

export interface CreatureModel {
  root: THREE.Group;
  /** Animated limb pivots (arms, legs, wings — species dependent). */
  arms: THREE.Group[];
  legs: THREE.Group[];
  wings: THREE.Group[];
  /** The main blob/body mesh (slimes squash it). */
  blob: THREE.Mesh | null;
  /** Thorne only: the bear form, hidden until phase 2. */
  alt: THREE.Group | null;
  /** Per-frame species visual tick (squash, glow...). */
  tick?(t: number): void;
}

const modelCache = new Map<string, THREE.BufferGeometry>();

function bodyGeo(key: string, parts: Part[]): THREE.BufferGeometry {
  let g = modelCache.get(key);
  if (!g) { g = bakeParts(parts); modelCache.set(key, g); }
  return g;
}

/** Build the procedural model for a species (cheap: 2-6 draw calls). */
export function buildCreatureModel(spec: SpeciesDef, variant?: string): CreatureModel {
  const root = new THREE.Group();
  const arms: THREE.Group[] = [];
  const legs: THREE.Group[] = [];
  const wings: THREE.Group[] = [];
  let blob: THREE.Mesh | null = null;
  let alt: THREE.Group | null = null;
  const tint = spec.tint ?? 0x8a9a5a;

  const bodyMesh = (key: string, parts: Part[], mat = MAT_BODY) => {
    const m = new THREE.Mesh(bodyGeo(key, parts), mat);
    m.castShadow = true;
    root.add(m);
    return m;
  };

  switch (spec.body) {
    case 'goblinoid': {
      const big = spec.scale && spec.scale > 1.5;
      const skin = big ? 0x6d8a4a : 0x7a9a52;
      const cloth = big ? 0x7a4a2a : 0x5a6a3a;
      bodyMesh(`gob_${big ? 'k' : 's'}`, [
        { geo: G_SPHERE, color: skin, pos: [0, 0.62, 0], scale: [0.34, 0.42, 0.3] }, // torso
        { geo: G_SPHERE, color: skin, pos: [0, 0.95, 0.02], scale: [0.3, 0.28, 0.3] }, // head
        { geo: G_CONE, color: skin, pos: [0.14, 1.0, -0.04], rot: [0, 0, -0.9], scale: [0.14, 0.22, 0.06] }, // ear R
        { geo: G_CONE, color: skin, pos: [-0.14, 1.0, -0.04], rot: [0, 0, 0.9], scale: [0.14, 0.22, 0.06] }, // ear L
        { geo: G_SPHERE, color: 0xd8c24a, pos: [0.09, 0.97, 0.15], scale: [0.05, 0.05, 0.03] }, // eye R
        { geo: G_SPHERE, color: 0xd8c24a, pos: [-0.09, 0.97, 0.15], scale: [0.05, 0.05, 0.03] }, // eye L
        { geo: G_CYL, color: cloth, pos: [0, 0.38, 0], scale: [0.3, 0.22, 0.26] }, // skirt
        ...(big ? ([
          { geo: G_CYL, color: 0xc8a23a, pos: [0.07, 1.14, 0], rot: [Math.PI / 2, 0, 0], scale: [0.09, 0.4, 0.09] }, // horn
          { geo: G_CONE, color: 0xd8b03a, pos: [0, 1.13, -0.02], scale: [0.16, 0.14, 0.16] }, // crown
        ] as Part[]) : []),
      ]);
      // limbs
      for (const sx of [1, -1]) {
        const a = limb(skin, 0.09, 0.42, 0.09);
        a.pivot.position.set(sx * 0.2, 0.82, 0);
        root.add(a.pivot); arms.push(a.pivot);
        const l = limb(skin, 0.11, 0.4, 0.11);
        l.pivot.position.set(sx * 0.12, 0.42, 0);
        root.add(l.pivot); legs.push(l.pivot);
      }
      // club in the right hand
      const club = limb(0x6a4e2e, 0.07, 0.55, 0.07);
      club.pivot.position.set(0.24, 0.5, 0.06);
      club.pivot.rotation.x = -0.6;
      root.add(club.pivot);
      break;
    }
    case 'reptilian': {
      const skin = 0x9a8a52;
      bodyMesh('kob', [
        { geo: G_SPHERE, color: skin, pos: [0, 0.5, 0.04], scale: [0.28, 0.32, 0.36] }, // hunched torso
        { geo: G_SPHERE, color: skin, pos: [0, 0.78, 0.16], scale: [0.22, 0.2, 0.26] }, // head
        { geo: G_CONE, color: skin, pos: [0, 0.76, 0.34], rot: [Math.PI / 2, 0, 0], scale: [0.12, 0.18, 0.1] }, // snout
        { geo: G_SPHERE, color: 0xd84a2a, pos: [0.08, 0.82, 0.22], scale: [0.04, 0.04, 0.03] },
        { geo: G_SPHERE, color: 0xd84a2a, pos: [-0.08, 0.82, 0.22], scale: [0.04, 0.04, 0.03] },
        { geo: G_CONE, color: skin, pos: [0, 0.45, -0.28], rot: [-1.1, 0, 0], scale: [0.09, 0.4, 0.09] }, // tail
        { geo: G_CYL, color: 0x6a5a3a, pos: [0, 0.3, 0], scale: [0.24, 0.18, 0.2] },
      ]);
      for (const sx of [1, -1]) {
        const a = limb(skin, 0.08, 0.36, 0.08);
        a.pivot.position.set(sx * 0.18, 0.68, 0.06);
        root.add(a.pivot); arms.push(a.pivot);
        const l = limb(skin, 0.1, 0.32, 0.1);
        l.pivot.position.set(sx * 0.11, 0.34, 0);
        root.add(l.pivot); legs.push(l.pivot);
      }
      const spear = limb(0x7a5a34, 0.05, 1.5, 0.05);
      spear.pivot.position.set(0.22, 0.68, 0.1);
      spear.pivot.rotation.x = -1.35;
      root.add(spear.pivot);
      break;
    }
    case 'amphibian': {
      const skin = 0x5a8a6a;
      bodyMesh('gri', [
        { geo: G_SPHERE, color: skin, pos: [0, 0.3, 0], scale: [0.42, 0.3, 0.46] },
        { geo: G_SPHERE, color: 0x2a3a2a, pos: [0.13, 0.42, 0.28], scale: [0.07, 0.07, 0.05] },
        { geo: G_SPHERE, color: 0x2a3a2a, pos: [-0.13, 0.42, 0.28], scale: [0.07, 0.07, 0.05] },
        { geo: G_CONE, color: 0x4a7a5a, pos: [0, 0.3, 0.42], rot: [Math.PI / 2, 0, 0], scale: [0.1, 0.14, 0.1] },
      ], MAT_SOFT);
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const l = limb(skin, 0.09, 0.2, 0.09);
        l.pivot.position.set(sx * 0.22, 0.2, sz * 0.18);
        root.add(l.pivot); legs.push(l.pivot);
      }
      break;
    }
    case 'slime': {
      const color = spec.id === 'slime_elemental'
        ? (variant === 'shock' ? 0x4a8ad8 : variant === 'poison' ? 0x8a4ad8 : 0xe8722a)
        : tint;
      const core: Part[] = spec.id === 'king_slime'
        ? [
          { geo: G_CONE, color: 0xe8c84a, pos: [0.0, 0.95, 0], scale: [0.16, 0.3, 0.16] },
          { geo: G_CONE, color: 0xe8c84a, pos: [0.13, 0.9, 0], scale: [0.12, 0.22, 0.12] },
          { geo: G_CONE, color: 0xe8c84a, pos: [-0.13, 0.9, 0], scale: [0.12, 0.22, 0.12] },
        ]
        : [{ geo: G_SPHERE, color: 0xffffff, pos: [0, 0.45, 0.1], scale: [0.16, 0.16, 0.12] }];
      blob = bodyMesh(`slime_${color}`, [
        { geo: G_SPHERE, color, pos: [0, 0.45, 0], scale: [0.82, 0.62, 0.82] },
        { geo: G_SPHERE, color, pos: [0, 0.24, 0], scale: [0.62, 0.34, 0.62] },
        ...core,
      ], MAT_SOFT);
      // squash & stretch life
      const m = blob;
      modelTickSet(root, (t) => {
        const s = 1 + Math.sin(t * 6) * 0.06;
        m.scale.set(1 / s, s, 1 / s);
      });
      break;
    }
    case 'harpy': {
      const feather = 0x9a7a52;
      bodyMesh('arp', [
        { geo: G_SPHERE, color: feather, pos: [0, 0.85, 0], scale: [0.3, 0.4, 0.44] },
        { geo: G_SPHERE, color: 0xc8a86a, pos: [0, 1.2, 0.1], scale: [0.2, 0.2, 0.24] },
        { geo: G_CONE, color: 0xd8b03a, pos: [0, 1.2, 0.32], rot: [Math.PI / 2, 0, 0], scale: [0.08, 0.16, 0.08] }, // beak
        { geo: G_SPHERE, color: 0xe84020, pos: [0.09, 1.26, 0.18], scale: [0.045, 0.045, 0.03] },
        { geo: G_SPHERE, color: 0xe84020, pos: [-0.09, 1.26, 0.18], scale: [0.045, 0.045, 0.03] },
        { geo: G_CONE, color: feather, pos: [0, 0.85, -0.4], rot: [Math.PI / 2, 0, 0], scale: [0.22, 0.5, 0.1] }, // tail fan
      ]);
      for (const sx of [1, -1]) {
        const w = limb(feather, 1.15, 0.06, 0.42);
        w.pivot.position.set(sx * 0.22, 1.0, 0);
        w.pivot.rotation.z = sx * 0.25;
        w.mesh.position.x = sx * 0.55;
        w.mesh.position.y = 0;
        root.add(w.pivot); wings.push(w.pivot);
        const t = limb(0xd8b03a, 0.08, 0.3, 0.08); // talons
        t.pivot.position.set(sx * 0.12, 0.5, 0);
        root.add(t.pivot); legs.push(t.pivot);
      }
      break;
    }
    case 'corsair': {
      const coat = 0x3a3a48;
      bodyMesh('art', [
        { geo: G_BOX, color: coat, pos: [0, 0.72, 0], scale: [0.42, 0.62, 0.28] }, // coat
        { geo: G_SPHERE, color: 0xc8a482, pos: [0, 1.18, 0], scale: [0.2, 0.22, 0.2] }, // head
        { geo: G_CYL, color: 0x2a2a34, pos: [0, 1.34, 0], scale: [0.3, 0.06, 0.3] }, // hat brim
        { geo: G_CONE, color: 0x2a2a34, pos: [0, 1.44, 0], scale: [0.28, 0.22, 0.28] }, // tricorn
        { geo: G_BOX, color: 0x4a4a58, pos: [0, 0.38, 0], scale: [0.36, 0.2, 0.26] },
        { geo: G_SPHERE, color: 0x2a2a34, pos: [0.3, 0.86, 0.14], scale: [0.05, 0.05, 0.05] }, // hand
      ]);
      for (const sx of [1, -1]) {
        const l = limb(coat, 0.13, 0.42, 0.13);
        l.pivot.position.set(sx * 0.13, 0.4, 0);
        root.add(l.pivot); legs.push(l.pivot);
      }
      const musket = limb(0x4a3a28, 0.06, 1.1, 0.06);
      musket.pivot.position.set(0.3, 0.86, 0.1);
      musket.pivot.rotation.x = -1.5;
      root.add(musket.pivot);
      break;
    }
    case 'golem': {
      const rock = 0x7a7468;
      bodyMesh('gol', [
        { geo: G_BOX, color: rock, pos: [0, 0.78, 0], scale: [0.66, 0.72, 0.5] }, // chest block
        { geo: G_BOX, color: 0x6a6458, pos: [0, 0.3, 0], scale: [0.5, 0.34, 0.4] }, // hip block
        { geo: G_BOX, color: 0x847e70, pos: [0, 1.28, 0.02], scale: [0.4, 0.36, 0.38] }, // head
        // rune band (emissive-ish bright paint)
        { geo: G_BOX, color: 0x62d8e8, pos: [0, 0.92, 0.26], scale: [0.5, 0.08, 0.04] },
        { geo: G_BOX, color: 0x62d8e8, pos: [0, 0.72, 0.26], scale: [0.5, 0.05, 0.04] },
      ]);
      for (const sx of [1, -1]) {
        const a = limb(rock, 0.22, 0.66, 0.22);
        a.pivot.position.set(sx * 0.46, 1.06, 0);
        root.add(a.pivot); arms.push(a.pivot);
        const l = limb(0x6a6458, 0.24, 0.36, 0.24);
        l.pivot.position.set(sx * 0.18, 0.36, 0);
        root.add(l.pivot); legs.push(l.pivot);
      }
      break;
    }
    case 'guardian': {
      const plate = 0x5a4a5a;
      bodyMesh('gua', [
        { geo: G_BOX, color: plate, pos: [0, 0.82, 0], scale: [0.52, 0.66, 0.34] },
        { geo: G_SPHERE, color: 0x3a2a3a, pos: [0, 1.32, 0], scale: [0.24, 0.26, 0.24] }, // helm
        { geo: G_BOX, color: 0x8a3a2a, pos: [0, 1.44, 0], scale: [0.3, 0.08, 0.3] }, // crest
        { geo: G_SPHERE, color: 0xe8a020, pos: [0.09, 1.34, 0.17], scale: [0.05, 0.05, 0.04] },
        { geo: G_SPHERE, color: 0xe8a020, pos: [-0.09, 1.34, 0.17], scale: [0.05, 0.05, 0.04] },
        { geo: G_BOX, color: 0x4a3a4a, pos: [0, 0.4, 0], scale: [0.44, 0.24, 0.3] },
        { geo: G_BOX, color: 0x6a5a2a, pos: [0.42, 0.9, 0.1], scale: [0.1, 0.9, 0.66] }, // TOWER SHIELD
      ]);
      for (const sx of [1, -1]) {
        const l = limb(plate, 0.16, 0.44, 0.16);
        l.pivot.position.set(sx * 0.14, 0.44, 0);
        root.add(l.pivot); legs.push(l.pivot);
      }
      const a = limb(plate, 0.12, 0.6, 0.12);
      a.pivot.position.set(-0.34, 1.1, 0);
      root.add(a.pivot); arms.push(a.pivot);
      const halberd = limb(0x8a8a92, 0.05, 1.7, 0.05);
      halberd.pivot.position.set(-0.34, 1.0, 0.05);
      halberd.pivot.rotation.x = -1.2;
      root.add(halberd.pivot);
      break;
    }
    case 'ghost': {
      const coat = 0x4a6a8a;
      bodyMesh('gho', [
        { geo: G_BOX, color: coat, pos: [0, 0.8, 0], scale: [0.42, 0.7, 0.3] },
        { geo: G_CONE, color: 0x3a5a7a, pos: [0, 0.42, 0], scale: [0.44, 0.5, 0.32] }, // tattered coat tail
        { geo: G_SPHERE, color: 0xb8d8e8, pos: [0, 1.28, 0], scale: [0.2, 0.24, 0.2] }, // skull-ish face
        { geo: G_SPHERE, color: 0x40e8ff, pos: [0.08, 1.3, 0.15], scale: [0.05, 0.05, 0.04] },
        { geo: G_SPHERE, color: 0x40e8ff, pos: [-0.08, 1.3, 0.15], scale: [0.05, 0.05, 0.04] },
        { geo: G_CYL, color: 0x2a2a34, pos: [0, 1.44, 0], scale: [0.3, 0.05, 0.3] },
        { geo: G_CONE, color: 0x2a2a34, pos: [0, 1.55, 0], scale: [0.28, 0.24, 0.28] },
      ], MAT_SOFT);
      for (const sx of [1, -1]) {
        const l = limb(coat, 0.12, 0.42, 0.12);
        l.pivot.position.set(sx * 0.12, 0.4, 0);
        root.add(l.pivot); legs.push(l.pivot);
      }
      const a = limb(coat, 0.1, 0.56, 0.1);
      a.pivot.position.set(0.28, 1.12, 0);
      root.add(a.pivot); arms.push(a.pivot);
      const saber = limb(0x9ae8e8, 0.04, 0.9, 0.04);
      saber.pivot.position.set(0.3, 0.9, 0.1);
      saber.pivot.rotation.x = -1.4;
      root.add(saber.pivot);
      // spectral float
      modelTickSet(root, (t) => { root.position.y = Math.sin(t * 2.2) * 0.06; });
      break;
    }
    case 'daimyo': {
      const armor = 0x3a4a5a;
      bodyMesh('dai', [
        { geo: G_BOX, color: armor, pos: [0, 0.8, 0], scale: [0.46, 0.64, 0.32] },
        { geo: G_BOX, color: 0x8a2a2a, pos: [0, 0.8, 0.18], scale: [0.3, 0.5, 0.04] }, // do-maru lacings
        { geo: G_SPHERE, color: 0x2a3440, pos: [0, 1.28, 0], scale: [0.22, 0.24, 0.22] },
        { geo: G_CONE, color: 0x8a2a2a, pos: [0, 1.46, 0], scale: [0.26, 0.24, 0.26] }, // kabuto
        { geo: G_SPHERE, color: 0xe8e0d0, pos: [0.08, 1.3, 0.16], scale: [0.045, 0.045, 0.03] },
        { geo: G_SPHERE, color: 0xe8e0d0, pos: [-0.08, 1.3, 0.16], scale: [0.045, 0.045, 0.03] },
        { geo: G_BOX, color: 0x2e3844, pos: [0, 0.4, 0], scale: [0.4, 0.26, 0.3] },
        { geo: G_BOX, color: 0x6a7a8a, pos: [0, 1.06, -0.2], scale: [0.4, 0.5, 0.06] }, // sode (back plates)
      ]);
      for (const sx of [1, -1]) {
        const l = limb(armor, 0.15, 0.44, 0.15);
        l.pivot.position.set(sx * 0.13, 0.42, 0);
        root.add(l.pivot); legs.push(l.pivot);
      }
      const a = limb(armor, 0.11, 0.58, 0.11);
      a.pivot.position.set(0.3, 1.1, 0);
      root.add(a.pivot); arms.push(a.pivot);
      const odachi = limb(0xc8ccd4, 0.045, 1.6, 0.1);
      odachi.pivot.position.set(0.32, 0.95, 0.08);
      odachi.pivot.rotation.x = -1.15;
      root.add(odachi.pivot);
      break;
    }
    case 'druid': {
      const robe = 0x3a5a3a;
      bodyMesh('thr', [
        { geo: G_CONE, color: robe, pos: [0, 0.55, 0], scale: [0.5, 1.1, 0.5] }, // robe
        { geo: G_SPHERE, color: 0xb8d0a0, pos: [0, 1.24, 0], scale: [0.2, 0.24, 0.2] }, // head
        { geo: G_SPHERE, color: 0x62e86a, pos: [0.08, 1.27, 0.15], scale: [0.05, 0.05, 0.04] },
        { geo: G_SPHERE, color: 0x62e86a, pos: [-0.08, 1.27, 0.15], scale: [0.05, 0.05, 0.04] },
        { geo: G_CONE, color: 0x6a8a4a, pos: [0.16, 1.42, 0], rot: [0, 0, -0.5], scale: [0.14, 0.3, 0.14] }, // antler R
        { geo: G_CONE, color: 0x6a8a4a, pos: [-0.16, 1.42, 0], rot: [0, 0, 0.5], scale: [0.14, 0.3, 0.14] }, // antler L
        { geo: G_CYL, color: 0x5a4a2a, pos: [0.3, 0.9, 0.1], scale: [0.06, 1.5, 0.06] }, // staff
        { geo: G_SPHERE, color: 0x62e86a, pos: [0.3, 1.66, 0.1], scale: [0.12, 0.12, 0.12] }, // staff heart
      ]);
      const a = limb(robe, 0.11, 0.5, 0.11);
      a.pivot.position.set(-0.3, 1.0, 0);
      root.add(a.pivot); arms.push(a.pivot);
      // ---- the BEAR (phase 2), hidden ----
      alt = new THREE.Group();
      const bearBody = new THREE.Mesh(bodyGeo('bear', [
        { geo: G_BOX, color: 0x5a4632, pos: [0, 0.72, 0], scale: [0.72, 0.62, 1.15] },
        { geo: G_SPHERE, color: 0x4a3828, pos: [0, 0.78, 0.68], scale: [0.4, 0.36, 0.4] }, // head
        { geo: G_SPHERE, color: 0x2a2018, pos: [0.14, 0.72, 0.92], scale: [0.08, 0.08, 0.08] },
        { geo: G_SPHERE, color: 0x2a2018, pos: [-0.14, 0.72, 0.92], scale: [0.08, 0.08, 0.08] },
        { geo: G_CONE, color: 0xd8c8a8, pos: [0, 0.7, 1.02], rot: [Math.PI / 2, 0, 0], scale: [0.09, 0.14, 0.09] }, // snout
        { geo: G_SPHERE, color: 0x3a2a1a, pos: [0, 1.06, -0.3], scale: [0.24, 0.2, 0.24] }, // hump
        { geo: G_BOX, color: 0x6a8a4a, pos: [0, 1.05, 0.1], scale: [0.74, 0.34, 0.5] }, // bark armor
      ]), MAT_BODY);
      bearBody.castShadow = true;
      alt.add(bearBody);
      root.add(alt);
      alt.visible = false;
      break;
    }
    default: break;
  }

  if (spec.scale) root.scale.setScalar(spec.scale);
  return { root, arms, legs, wings, blob, alt, tick: root.userData.tick ?? null };
}

/** Attach a per-frame visual tick to a model root (slime squash, ghost float). */
function modelTickSet(root: THREE.Group, fn: (t: number) => void): void {
  root.userData.tick = fn;
}

/** The telegraph sprite texture (shared): a soft radial glow. */
let glowTex: THREE.Texture | null = null;
function telegraphSprite(color: THREE.Color): THREE.Sprite {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthTest: false });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(0.55);
  s.visible = false;
  return s;
}

// ------------------------------------------------------------------ creature

type CreatureState = 'idle' | 'wander' | 'chase' | 'windup' | 'attack' | 'recover'
  | 'flee' | 'grounded' | 'stagger' | 'dead';

const GLOW_RED_C = new THREE.Color(1.0, 0.2, 0.12);
const GLOW_YEL_C = new THREE.Color(1.0, 0.82, 0.12);
const GLOW_BLU_C = new THREE.Color(0.25, 0.6, 1.0);

class Creature {
  readonly group = new THREE.Group();
  readonly model: CreatureModel;
  readonly spec: SpeciesDef;
  readonly variant: string | undefined;
  state: CreatureState = 'wander';
  hp: number;
  maxHp: number;
  pos = new THREE.Vector3();
  yaw = Math.random() * Math.PI * 2;
  anchor = new THREE.Vector3();
  wanderTarget = new THREE.Vector3();
  phase = Math.random() * 8;
  attackT = 0;
  attackDur = 0.9;
  hitDone = false;
  attackCd = 0;
  staggerT = 0;
  groundedT = 0;
  deathT = 0;
  respawnT = 0;
  aggro = false;
  /** Airborne height (harpies hover, dives, hops). */
  flyY = 0;
  flyPhase = Math.random() * 6;
  /** Mini-boss machinery. */
  phase2Done = false;
  summonDone = false;
  healT = 0;
  rangedHits = 0;
  /** Split/parent bookkeeping (King Slime mitosis). */
  parentId: string | null = null;
  /** DoT */
  statusKind: 'burn' | 'poison' | null = null;
  statusT = 0;
  statusTick = 0;
  /** Telegraph sprite (lazily added). */
  glow: THREE.Sprite | null = null;
  /** Locomotion visual energy 0..1 (drives limb swing amplitude). */
  movingK = 0;
  /** Windup duration of the committed attack (s). */
  windupDur = 0.6;
  /** Guardian's cracked shield wall: open window after 2 heavies. */
  guardOpenT = 0;
  guardCracks = 0;
  /** Orbit direction on the attack ring (+1/-1). */
  ringSide = Math.random() < 0.5 ? 1 : -1;

  /** Which session zone this creature belongs to (streaming key). */
  zoneId: string | null = null;

  constructor(spec: SpeciesDef, x: number, z: number, terrain: TerrainHeight, variant?: string, hpScale = 1) {
    this.spec = spec;
    this.variant = variant;
    this.model = buildCreatureModel(spec, variant);
    this.group.add(this.model.root);
    this.maxHp = Math.round(spec.hp * hpScale);
    this.hp = this.maxHp;
    this.anchor.set(x, terrain.height(x, z), z);
    this.pos.copy(this.anchor);
    this.group.position.copy(this.pos);
    this.pickWander();
  }

  get center(): THREE.Vector3 {
    const h = this.spec.body === 'harpy' ? 1.0 + this.flyY : this.spec.body === 'golem' || this.spec.body === 'guardian' ? 1.0 : 0.7;
    return new THREE.Vector3(this.pos.x, this.pos.y + h * (this.spec.scale ?? 1), this.pos.z);
  }

  get radius(): number {
    return 0.55 * (this.spec.scale ?? 1) + (this.spec.body === 'golem' || this.spec.body === 'guardian' ? 0.35 : 0);
  }

  get alive(): boolean { return this.state !== 'dead'; }

  pickWander(): void {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 9;
    this.wanderTarget.set(this.anchor.x + Math.cos(a) * r, 0, this.anchor.z + Math.sin(a) * r);
  }

  setGlow(c: THREE.Color | null): void {
    if (!c) { if (this.glow) this.glow.visible = false; return; }
    if (!this.glow) {
      this.glow = telegraphSprite(c);
      this.glow.position.y = 1.7 * (this.spec.scale ?? 1) + (this.spec.body === 'harpy' ? this.flyY : 0);
      this.group.add(this.glow);
    }
    (this.glow.material as THREE.SpriteMaterial).color.copy(c);
    this.glow.visible = true;
  }
}

// ------------------------------------------------------------------ ground FX

/** Simple pooled ground patches (fire from Krog's bombs, acid rain gels). */
interface GroundPatch {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  r: number;
  life: number;
  tick: number;
  dps: number;
  reason: string;
}

// ------------------------------------------------------------------ system

export class BestiarySystem {
  private creatures: Creature[] = [];
  private zoneState = new Map<string, { active: boolean; respawn: number }>();
  private patches: GroundPatch[] = [];
  private patchPool: THREE.Mesh[] = [];
  private hooks: BestiaryHooks;
  private terrain: TerrainHeight;
  private scene: THREE.Scene;
  private discovered = new Set<string>();
  /** Mini-jefes slain this session (their zones stay empty after). */
  private deadMiniZones = new Set<string>();
  private playerCorrodeT = 0;
  private attackTokens = 0;
  /** King Slime mitosis pool: remaining minions → the boss bar tracks them. */
  private mitosis: { members: Creature[]; pool: number; maxPool: number; name: string; title: string; looted: boolean } | null = null;
  private bossCardShown = new Set<string>();
  private lastBossHud: string | null = null;

  constructor(scene: THREE.Scene, terrain: TerrainHeight, hooks: BestiaryHooks) {
    this.scene = scene;
    this.terrain = terrain;
    this.hooks = hooks;
    for (const z of ZONES) this.zoneState.set(z.id, { active: false, respawn: 0 });
  }

  // ------------------------------------------------------------ queries (CombatSystem surface)

  /** True when the target object belongs to this system (damage dispatch). */
  owns(target: unknown): target is Creature {
    return target instanceof Creature;
  }

  private inFront(origin: THREE.Vector3, yaw: number, c: Creature, reach: number, arc: number): boolean {
    const dx = c.pos.x - origin.x;
    const dz = c.pos.z - origin.z;
    const d = Math.hypot(dx, dz);
    if (d > reach + c.radius) return false;
    if (d < 0.001) return true;
    let a = Math.atan2(dx, dz) - yaw;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return Math.abs(a) <= arc * 0.5 + Math.min(0.6, c.radius / Math.max(0.5, d));
  }

  meleeHitCheck(origin: THREE.Vector3, yaw: number, reach: number, arc: number): { bandit: Creature; point: THREE.Vector3 } | null {
    let best: Creature | null = null;
    let bestD = Infinity;
    for (const c of this.creatures) {
      if (!c.alive || c.state === 'dead') continue;
      if (!this.inFront(origin, yaw, c, reach, arc)) continue;
      const d = c.pos.distanceTo(origin);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (!best) return null;
    return { bandit: best, point: best.center };
  }

  meleeHitCheckMulti(origin: THREE.Vector3, yaw: number, reach: number, arc: number, max: number): Array<{ bandit: Creature; point: THREE.Vector3 }> {
    const out: Array<{ bandit: Creature; point: THREE.Vector3 }> = [];
    for (const c of this.creatures) {
      if (out.length >= max) break;
      if (!c.alive) continue;
      if (this.inFront(origin, yaw, c, reach, arc)) out.push({ bandit: c, point: c.center });
    }
    return out;
  }

  meleeHitCheckRadius(center: THREE.Vector3, radius: number, max: number): Array<{ bandit: Creature; point: THREE.Vector3 }> {
    const out: Array<{ bandit: Creature; point: THREE.Vector3 }> = [];
    for (const c of this.creatures) {
      if (out.length >= max) break;
      if (!c.alive) continue;
      const d = Math.hypot(c.pos.x - center.x, c.pos.z - center.z);
      if (d <= radius + c.radius) out.push({ bandit: c, point: c.center });
    }
    return out;
  }

  /** Arrow hit test. Corrosive slimes ABSORB arrows (the caller multiplies). */
  projectileHitTest(pos: THREE.Vector3, radius: number): { bandit: Creature; point: THREE.Vector3 } | null {
    for (const c of this.creatures) {
      if (!c.alive) continue;
      const cen = c.center;
      const d = cen.distanceTo(pos);
      if (d <= radius + c.radius) return { bandit: c, point: cen };
    }
    return null;
  }

  creaturesInRadius(pos: THREE.Vector3, r: number): Array<{ bandit: Creature; point: THREE.Vector3 }> {
    const out: Array<{ bandit: Creature; point: THREE.Vector3 }> = [];
    for (const c of this.creatures) {
      if (!c.alive) continue;
      if (Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) <= r) out.push({ bandit: c, point: c.center });
    }
    return out;
  }

  /** Weakened creature in execution range (the E remate). */
  finisherTarget(playerPos: THREE.Vector3): Creature | null {
    let best: Creature | null = null;
    let bestD = Infinity;
    for (const c of this.creatures) {
      if (!c.alive || c.state === 'dead') continue;
      if (c.hp / c.maxHp > 0.3) continue;
      const d = Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z);
      if (d < 2.6 && d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  applyStatus(target: unknown, kind: 'burn' | 'poison', dur: number): void {
    if (target instanceof Creature) {
      target.statusKind = kind;
      target.statusT = Math.max(target.statusT, dur);
    }
  }

  // ------------------------------------------------------------ damage in

  /**
   * Route damage into a creature. `heavy` breaks the guardian's shield wall;
   * `fromBehind` is computed from the player position when available.
   * `isArrow` feeds the golem/corrosive arrow multipliers.
   */
  damage(target: unknown, amount: number, opts?: { heavy?: boolean; isArrow?: boolean; fromX?: number; fromZ?: number; silent?: boolean }): boolean {
    const c = target as Creature;
    if (!(c instanceof Creature) || !c.alive) return false;
    let dealt = amount;

    // Golem: light cutting glances off the rock (×0.4); arrows bite (×1.3)
    if (c.spec.lightResist !== undefined && !opts?.heavy && !opts?.isArrow) dealt *= c.spec.lightResist;
    if (c.spec.arrowMult !== undefined && opts?.isArrow) dealt *= c.spec.arrowMult;

    // Guardian: the tower shield eats 80% of FRONTAL damage until heavies
    // crack the wall (2 heavy hits) — then the guard is open for 4 s.
    if (c.spec.frontalBlock && c.guardOpenT <= 0 && opts?.fromX !== undefined) {
      const dx = c.pos.x - opts.fromX;
      const dz = c.pos.z - opts.fromZ!;
      const facing = Math.atan2(dx, dz);
      let diff = facing - c.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const frontal = Math.abs(diff) < 1.15;
      if (frontal && !opts?.heavy && !opts?.isArrow) {
        dealt *= 0.2;
        this.hooks.blockSparks(c.center);
      } else if (frontal && opts?.heavy) {
        c.guardCracks = (c.guardCracks ?? 0) + 1;
        if (c.guardCracks >= 2) {
          c.guardOpenT = 4.0;
          c.guardCracks = 0;
          this.hooks.cameraShake(0.3);
          this.hooks.sound('stagger');
          // GUARD BREAK RESPONSE: AoE stomp + cone of fire (the spec)
          this.guardianRiposte(c);
        }
      }
    }

    // Daimyo: the exposed back (×1.6)
    if (c.spec.backstabMult && opts?.fromX !== undefined) {
      const dx = c.pos.x - opts.fromX;
      const dz = c.pos.z - opts.fromZ!;
      const toPlayer = Math.atan2(-dx, -dz);
      let diff = toPlayer - c.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 1.0) dealt *= c.spec.backstabMult;
    }

    // Krog: low defense — everything bites deeper
    if (c.spec.id === 'krog') dealt *= 1.25;

    // Thorne phase 2: the bear's cracked bark gives to heavy blows
    if (c.spec.id === 'thorne' && c.phase2Done && opts?.heavy) dealt *= 1.3;

    // Regeneration channel interrupted by pain
    if (c.healT > 0 && dealt > 18) {
      c.healT = 0;
      this.hooks.notify('quest', 'INTERRUPTED!', 'The guardian\'s mending channel shatters.');
    }

    c.hp -= dealt;
    c.aggro = true;
    // knockback impulse handled in the move step via stagger flash
    if (opts?.heavy && c.spec.tier !== 'mini') c.staggerT = Math.max(c.staggerT, 0.45);
    if (!opts?.silent) this.hooks.weaponImpact(c.center);
    if (c.rangedHits < 3 && opts?.isArrow) c.rangedHits++;

    if (c.hp <= 0) {
      this.killCreature(c);
      return true;
    }
    // phase transitions
    if (c.spec.id === 'thorne' && !c.phase2Done && c.hp / c.maxHp <= 0.4) this.thorneTransform(c);
    if (c.spec.id === 'krog' && !c.summonDone && c.hp / c.maxHp <= 0.5) { c.summonDone = true; this.krogSummon(c); }
    if (c.spec.id === 'king_slime' && !c.phase2Done && c.hp / c.maxHp <= 0.5) this.kingMitosis(c);
    return false;
  }

  /** Arrow damage entry (multiplies corrosive absorption etc.). */
  arrowDamage(target: unknown, amount: number, fromX?: number, fromZ?: number): boolean {
    return this.damage(target, amount, { isArrow: true, fromX, fromZ });
  }

  // ------------------------------------------------------------ death & loot

  private killCreature(c: Creature): void {
    c.state = 'dead';
    c.deathT = 0;
    c.setGlow(null);
    const tier = c.spec.tier;
    c.respawnT = tier === 1 ? 240 + Math.random() * 120 : tier === 2 ? 420 + Math.random() * 180 : 600 + Math.random() * 240;
    if (tier === 'mini') {
      c.respawnT = Number.POSITIVE_INFINITY;
      if (c.zoneId) this.deadMiniZones.add(c.zoneId);
    }

    // XP + gold + kill counters
    this.hooks.giveXp(c.spec.xp);
    this.hooks.addCoins(Math.round(c.spec.gold[0] + Math.random() * (c.spec.gold[1] - c.spec.gold[0])));
    this.hooks.registerKill?.(`creature_${c.spec.id}`);

    // Slime split (elemental → 2 commons)
    if (c.spec.splitInto && !c.parentId) {
      const sub = SPECIES[c.spec.splitInto.id];
      if (sub) {
        for (let i = 0; i < c.spec.splitInto.count; i++) {
          const a = (i / c.spec.splitInto.count) * Math.PI * 2;
          this.spawnCreature(sub, c.pos.x + Math.cos(a) * 1.2, c.pos.z + Math.sin(a) * 1.2, 0.6, c.variant, c.spec.splitInto.id);
        }
        this.hooks.notify('info', c.spec.name, 'It splits! Finish the spawn before they scatter.');
      }
    }

    // Mini-boss / normal loot
    if (tier === 'mini') {
      this.hooks.cameraShake(0.8);
      this.hooks.hitStop(0.35);
      this.hooks.sound('boss_die');
      if (this.mitosis && this.mitosis.members.includes(c)) {
        // King Slime pool: loot waits for the LAST member
        this.mitosis.members = this.mitosis.members.filter((m) => m !== c);
        if (this.mitosis.members.length === 0 && !this.mitosis.looted) {
          this.mitosis.looted = true;
          this.dropLoot(c);
          this.hooks.bossHud?.(null);
          this.lastBossHud = null;
          this.mitosis = null;
        }
      } else {
        this.dropLoot(c);
        if (this.lastBossHud === c.spec.id) { this.hooks.bossHud?.(null); this.lastBossHud = null; }
      }
    } else {
      this.dropLoot(c);
    }
  }

  private dropLoot(c: Creature): void {
    for (const d of c.spec.loot) {
      if (Math.random() > d.chance) continue;
      this.hooks.addItem(d.id, d.count);
    }
  }

  // ------------------------------------------------------------ mini-boss specials

  private guardianRiposte(c: Creature): void {
    // AoE tremor (stagger) + cone of fire — the spec's guard-break answer
    this.hooks.cameraShake(0.5);
    this.spawnPatch(c.pos.clone(), 3.2, 4.0, 9, 'fire');
    this.fireConeBurst(c);
  }

  private fireConeBurst(c: Creature): void {
    // A short cone of flame: 3 flame patches ahead
    for (let i = 1; i <= 3; i++) {
      const d = 1.8 * i;
      const x = c.pos.x + Math.sin(c.yaw) * d;
      const z = c.pos.z + Math.cos(c.yaw) * d;
      this.spawnPatch(new THREE.Vector3(x, 0, z), 1.6, 2.2, 14, 'fire');
    }
    this.hooks.sound('fire');
  }

  private krogSummon(c: Creature): void {
    const gob = SPECIES.duende;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const g = this.spawnCreature(gob, c.pos.x + Math.cos(a) * 3, c.pos.z + Math.sin(a) * 3, 0.85);
      if (g) g.aggro = true;
    }
    this.hooks.sound('roar_big');
    this.hooks.notify('quest', 'KROG BLOWS THE HORN', 'Three Duendes Silvestres burst from the brush!');
  }

  private thorneTransform(c: Creature): void {
    c.phase2Done = true;
    // robe hides, the bear wakes
    c.model.root.children[0].visible = false;
    if (c.model.alt) c.model.alt.visible = true;
    c.healT = 0;
    this.hooks.cameraShake(0.7);
    this.hooks.sound('roar_big');
    this.hooks.notify('quest', 'THORNE FALLS ON ALL FOURS', 'The bark cracks — the Oak-Claw bear wakes. Heavy blows tear where the druid\'s wards held.');
  }

  private kingMitosis(c: Creature): void {
    c.phase2Done = true;
    const pool = Math.max(80, Math.round(c.hp));
    c.hp = 0;
    c.state = 'dead';
    c.respawnT = Number.POSITIVE_INFINITY;
    c.deathT = 0;
    const members: Creature[] = [];
    const cor = SPECIES.slime_corrosivo;
    const elm = SPECIES.slime_elemental;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const m = this.spawnCreature(cor, c.pos.x + Math.cos(a) * 2.4, c.pos.z + Math.sin(a) * 2.4, 0.9, undefined, 'mitosis');
      if (m) { m.aggro = true; members.push(m); }
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const m = this.spawnCreature(elm, c.pos.x + Math.cos(a) * 3.4, c.pos.z + Math.sin(a) * 3.4, 0.7, 'poison', 'mitosis');
      if (m) { m.aggro = true; members.push(m); }
    }
    this.mitosis = { members, pool, maxPool: Math.max(pool, 1), name: 'KING SLIME', title: 'La Masa Indestructible — the pool', looted: false };
    this.hooks.cameraShake(0.9);
    this.hooks.notify('quest', 'MITOSIS MÚLTIPLE', 'The Mass bursts into a school of hungers. Empty the pool!');
  }

  // ------------------------------------------------------------ ground patches

  private spawnPatch(pos: THREE.Vector3, r: number, life: number, dps: number, reason: 'fire' | 'acid'): void {
    if (this.patches.length > 24) return; // budget
    let mesh = this.patchPool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 20),
        new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
    }
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(reason === 'fire' ? 0xff6a20 : 0x9ae82a);
    mesh.scale.setScalar(r);
    mesh.position.set(pos.x, this.terrain.height(pos.x, pos.z) + 0.06, pos.z);
    mesh.visible = true;
    this.scene.add(mesh);
    this.patches.push({ mesh, pos: mesh.position.clone(), r, life, tick: 0, dps, reason });
  }

  // ------------------------------------------------------------ spawning

  private spawnCreature(spec: SpeciesDef, x: number, z: number, hpScale = 1, variant?: string, parentId?: string, zoneId?: string): Creature | null {
    const c = new Creature(spec, x, z, this.terrain, variant, hpScale);
    c.parentId = parentId ?? null;
    c.zoneId = zoneId ?? null;
    this.scene.add(c.group);
    this.creatures.push(c);
    return c;
  }

  /** Admin/E2E: conjure a species near a point. */
  adminSpawn(speciesId: string, x: number, z: number): Creature | null {
    const spec = SPECIES[speciesId];
    if (!spec) return null;
    const c = this.spawnCreature(spec, x, z, 1);
    if (c) c.aggro = true;
    return c;
  }

  /** E2E: the live census. */
  list(): readonly Creature[] { return this.creatures; }
  speciesOf(c: Creature): SpeciesDef { return c.spec; }

  // ------------------------------------------------------------ main update

  update(dt: number, playerPos: THREE.Vector3, active: boolean): void {
    // ---- zone streaming ----
    for (const z of ZONES) {
      const st = this.zoneState.get(z.id)!;
      const d = Math.hypot(playerPos.x - z.x, playerPos.z - z.z);
      if (!st.active && d < 220) {
        st.active = true;
        // clean slate: purge anything left from the last visit (corpses too)
        this.purgeZone(z.id);
        const spec = SPECIES[z.species];
        // mini-jefes die once per session: the zone stays empty after
        if (spec.boss && this.deadMiniZones.has(z.id)) continue;
        const count = spec.boss ? 1 : z.count;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * z.radius;
          const c = this.spawnCreature(spec, z.x + Math.cos(a) * r, z.z + Math.sin(a) * r, 1, z.variant, undefined, z.id);
          if (c && spec.body === 'harpy') c.flyY = 6 + Math.random() * 3;
        }
      } else if (st.active && d > 300) {
        st.active = false;
        // the whole zone evaporates (corpses included); re-entry respawns it
        this.purgeZone(z.id);
      }
    }

    // ---- creature states ----
    this.attackTokens = 0;
    for (const c of this.creatures) if (c.alive && (c.state === 'windup' || c.state === 'attack')) this.attackTokens++;

    for (const c of this.creatures) {
      if (c.alive) {
        if (active) this.updateCreature(c, dt, playerPos);
        this.updateVisual(c, dt, active);
      } else {
        c.deathT += dt;
        if (c.deathT < 1.6) {
          const k = 1 - c.deathT / 1.6;
          c.group.scale.setScalar((c.spec.scale ?? 1) * Math.max(0.01, k));
          c.group.rotation.z = (1 - k) * 1.2;
        } else {
          c.group.visible = false;
        }
        // slow in-place revival while the player lingers in the zone
        if (c.respawnT !== Number.POSITIVE_INFINITY && c.respawnT > 0) {
          c.respawnT -= dt;
          if (c.respawnT <= 0 && !c.parentId) this.reviveCreature(c);
        }
      }
    }

    // ---- ground patches ----
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const p = this.patches[i];
      p.life -= dt;
      p.tick -= dt;
      if (p.tick <= 0) {
        p.tick = 0.5;
        const d = Math.hypot(playerPos.x - p.pos.x, playerPos.z - p.pos.z);
        if (d < p.r && !this.playerDead) {
          this.hooks.playerDamage(p.dps * 0.5, p.pos.x, p.pos.z, p.reason === 'fire' ? 'fire' : 'acid');
        }
      }
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.42, p.life * 0.3);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.patchPool.push(p.mesh);
        this.patches.splice(i, 1);
      }
    }

    // ---- corrosion decay ----
    if (this.playerCorrodeT > 0) this.playerCorrodeT = Math.max(0, this.playerCorrodeT - dt);

    // ---- boss bars (mini-bosses + the mitosis pool) ----
    this.updateBossHud(playerPos);
  }

  /** Remove every creature of a zone from the scene + roster. */
  private purgeZone(zoneId: string): void {
    this.creatures = this.creatures.filter((c) => {
      if (c.zoneId === zoneId) {
        this.scene.remove(c.group);
        return false;
      }
      return true;
    });
  }

  /** A zone creature's respawn clock ran out while the player lingered. */
  private reviveCreature(c: Creature): void {
    c.hp = c.maxHp;
    c.state = 'wander';
    c.aggro = false;
    c.deathT = 0;
    c.group.visible = true;
    c.group.rotation.z = 0;
    c.group.scale.setScalar(c.spec.scale ?? 1);
    c.pos.set(c.anchor.x, this.terrain.height(c.anchor.x, c.anchor.z), c.anchor.z);
    c.setGlow(null);
  }

  private playerDead = false;
  /** Game tells the system when the player dies (boss bars drop, poison clears). */
  setPlayerDead(v: boolean): void { this.playerDead = v; }

  private updateBossHud(playerPos: THREE.Vector3): void {
    if (this.mitosis) {
      let hp = 0;
      for (const m of this.mitosis.members) if (m.alive) hp += Math.max(0, m.hp);
      const frac = hp / this.mitosis.maxPool;
      this.hooks.bossHud?.({ name: this.mitosis.name, title: this.mitosis.title, hp: frac * this.mitosis.maxPool, maxHp: this.mitosis.maxPool, phase: 2 });
      this.lastBossHud = 'mitosis';
      return;
    }
    let best: Creature | null = null;
    let bestD = Infinity;
    for (const c of this.creatures) {
      if (!c.alive || !c.spec.boss || !c.aggro) continue;
      const d = Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z);
      if (d < 45 && d < bestD) { best = c; bestD = d; }
    }
    if (best) {
      this.hooks.bossHud?.({
        name: best.spec.name.toUpperCase(), title: best.spec.title,
        hp: Math.max(0, best.hp), maxHp: best.maxHp,
        phase: best.phase2Done ? 2 : 1,
      });
      this.lastBossHud = best.spec.id;
    } else if (this.lastBossHud) {
      this.hooks.bossHud?.(null);
      this.lastBossHud = null;
    }
  }

  /** Corrosion multiplier read by damage-to-player routing (0.2 extra when corroded). */
  get corrosionActive(): boolean { return this.playerCorrodeT > 0; }

  // ------------------------------------------------------------ per-creature AI

  private updateCreature(c: Creature, dt: number, playerPos: THREE.Vector3): void {
    const spec = c.spec;
    const dx = playerPos.x - c.pos.x;
    const dz = playerPos.z - c.pos.z;
    const dist = Math.hypot(dx, dz);

    // discovery card
    if (!this.discovered.has(spec.id)) {
      this.discovered.add(spec.id);
      if (spec.tier !== 1) {
        this.hooks.notify('quest', `BESTIARY — ${spec.name.toUpperCase()}`, `${spec.title} (Nivel ${spec.levels[0]}-${spec.levels[1]})`);
      }
    }
    // mini-boss intro card
    if (spec.boss && !this.bossCardShown.has(spec.id) && dist < 26) {
      this.bossCardShown.add(spec.id);
      if (spec.intro) this.hooks.notify('quest', spec.intro[0], spec.intro[1]);
      this.hooks.sound('roar_big');
      this.hooks.cameraShake(0.5);
    }

    // status DoT
    if (c.statusT > 0) {
      c.statusT -= dt;
      c.statusTick -= dt;
      if (c.statusTick <= 0) {
        c.statusTick = 0.8;
        const dot = c.statusKind === 'burn' ? 7 : 5;
        if (this.damage(c, dot, { silent: true })) return;
      }
    }
    if (c.attackCd > 0) c.attackCd -= dt;
    // Thorne's Regeneración Mística: a 2.5 s channel healing 15% max HP,
    // interrupted by pain (see damage()) — green glow while it runs
    if (c.healT > 0) {
      c.healT -= dt;
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.15 * (dt / 2.5));
      c.setGlow(new THREE.Color(0.3, 0.9, 0.35));
      return;
    }
    if (c.guardOpenT > 0) c.guardOpenT -= dt;
    if (c.staggerT > 0) { c.staggerT -= dt; c.setGlow(GLOW_YEL_C); return; }
    if (c.groundedT > 0) { c.groundedT -= dt; c.setGlow(null); return; }

    // flee (goblins at low HP)
    if (spec.fleesAt && c.hp / c.maxHp < spec.fleesAt && c.state !== 'flee' && c.state !== 'dead') {
      c.state = 'flee';
    }

    // aggro acquisition
    if (!c.aggro && dist < spec.aggroRadius) c.aggro = true;

    const speed = c.state === 'flee' ? spec.chaseSpeed * 1.15
      : c.aggro ? spec.chaseSpeed
      : spec.wanderSpeed;

    switch (c.state) {
      case 'idle':
      case 'wander': {
        if (c.aggro) { c.state = 'chase'; break; }
        // amble around the anchor
        const wx = c.wanderTarget.x - c.pos.x;
        const wz = c.wanderTarget.z - c.pos.z;
        const wd = Math.hypot(wx, wz);
        if (wd < 0.8) { c.pickWander(); c.state = Math.random() < 0.4 ? 'idle' : 'wander'; break; }
        this.moveTowards(c, wx / wd, wz / wd, spec.wanderSpeed, dt);
        break;
      }
      case 'flee': {
        const fd = Math.max(0.001, dist);
        this.moveTowards(c, -dx / fd, -dz / fd, speed, dt);
        if (dist > 42 || c.hp / c.maxHp > 0.45) { c.state = 'wander'; c.aggro = false; }
        break;
      }
      case 'chase': {
        if (!c.aggro || dist > spec.aggroRadius * 3.2) { c.aggro = false; c.state = 'wander'; c.setGlow(null); break; }
        // artillero: keep the range, smoke-step when crowded
        if (spec.attack === 'musket') {
          if (dist < 6) {
            // smoke + backstep
            const fd = Math.max(0.001, dist);
            this.moveTowards(c, -dx / fd, -dz / fd, spec.chaseSpeed * 1.1, dt);
            break;
          }
          if (dist > spec.attackRange * 0.85) { const fd = Math.max(0.001, dist); this.moveTowards(c, dx / fd, dz / fd, speed, dt); break; }
          this.tryAttack(c, dist);
          break;
        }
        // kobold: hop back after committing (keep the distance)
        if (spec.attack === 'spear' && dist < spec.attackRange * 0.55) {
          const fd = Math.max(0.001, dist);
          this.moveTowards(c, -dx / fd, -dz / fd, spec.wanderSpeed, dt);
          this.face(c, dx, dz, dt);
          break;
        }
        if (dist <= spec.attackRange + 0.4) {
          // attack token cap: at most 2 creatures press at once
          if (this.attackTokens >= 2 && !spec.boss) {
            // circle-strafe the player instead (the ring)
            const tang = Math.atan2(dx, dz) + Math.PI / 2 * (c.ringSide ?? 1);
            this.moveTowards(c, Math.sin(tang), Math.cos(tang), spec.wanderSpeed * 1.4, dt);
            this.face(c, dx, dz, dt);
            break;
          }
          this.tryAttack(c, dist);
        } else {
          const fd = Math.max(0.001, dist);
          this.moveTowards(c, dx / fd, dz / fd, speed, dt);
        }
        break;
      }
      case 'windup': {
        c.attackT += dt;
        const tel = spec.attack === 'musket' ? GLOW_BLU_C : (spec.attack === 'stomp' || spec.attack === 'club' || spec.attack === 'odachi' || spec.attack === 'swallow') ? GLOW_YEL_C : GLOW_RED_C;
        c.setGlow(tel);
        this.face(c, dx, dz, dt);
        if (c.attackT >= c.windupDur) {
          c.state = 'attack';
          c.attackT = 0;
          c.hitDone = false;
          c.setGlow(null);
        }
        break;
      }
      case 'attack': {
        c.attackT += dt;
        if (!c.hitDone && c.attackT >= 0.42 * c.attackDur) {
          c.hitDone = true;
          this.resolveAttack(c, dist, playerPos);
        }
        if (c.attackT >= c.attackDur) { c.state = 'recover'; c.attackT = 0; }
        break;
      }
      case 'recover': {
        c.attackT += dt;
        c.attackCd = spec.attackCooldown[0] + Math.random() * (spec.attackCooldown[1] - spec.attackCooldown[0]);
        // kobold back-hop on recovery
        if (spec.attack === 'spear') {
          const fd = Math.max(0.001, dist);
          this.moveTowards(c, -dx / fd, -dz / fd, 4.2, dt);
        }
        if (c.attackT >= 0.5) { c.state = 'chase'; c.attackT = 0; }
        break;
      }
      default: { c.state = 'wander'; break; }
    }
  }

  private tryAttack(c: Creature, dist: number): void {
    if (c.attackCd > 0) return;
    const spec = c.spec;
    c.state = 'windup';
    c.attackT = 0;
    // windups scale with the attack kind (parry/dodge windows per the doc)
    c.windupDur = spec.attack === 'musket' ? 1.25
      : spec.attack === 'spear' ? 1.05
      : spec.attack === 'stomp' ? 1.15
      : spec.attack === 'odachi' ? 1.2
      : spec.attack === 'club' ? 1.35
      : spec.attack === 'roots' ? 1.2
      : spec.attack === 'swallow' ? 1.1
      : 0.6;
    c.attackDur = spec.attack === 'musket' ? 0.5 : spec.attack === 'stomp' ? 0.7 : 0.55;
  }

  private resolveAttack(c: Creature, dist: number, playerPos: THREE.Vector3): void {
    const spec = c.spec;
    const range = spec.attack === 'musket' ? spec.attackRange : spec.attackRange + 0.7;
    if (dist > range + 1.5) { c.state = 'chase'; return; }

    // player damage (corrosion bites +20% while active)
    const corrode = this.playerCorrodeT > 0 ? 1.2 : 1;
    const dmg = spec.damage * corrode;
    const reason = `bestiary_${spec.id}`;
    const unblockable = spec.attack === 'musket' || spec.attack === 'odachi';

    switch (spec.attack) {
      case 'melee': case 'spear': case 'saber': case 'shieldwall': case 'odachi': {
        if (dist <= range + 1.0) {
          this.hooks.playerDamage(dmg, c.pos.x, c.pos.z, reason, { unblockable });
          this.hooks.sound('swing');
          // Daimyo charged wave: unblockable shockwave travels THROUGH blocks
          if (spec.attack === 'odachi' && Math.random() < 0.35) {
            this.hooks.cameraShake(0.35);
            this.hooks.playerDamage(Math.round(dmg * 0.6), c.pos.x, c.pos.z, 'mist_wave', { unblockable: true });
          }
          // Guardian: cone fire breath rides some swings
          if (spec.attack === 'shieldwall' && Math.random() < 0.3) this.fireConeBurst(c);
        }
        break;
      }
      case 'club': { // Krog's Garrotazo Devastador
        if (dist <= range + 1.0) {
          this.hooks.playerDamage(dmg, c.pos.x, c.pos.z, reason, { unblockable: Math.random() < 0.4 });
          this.hooks.cameraShake(0.55);
          this.hooks.hitStop(0.18);
          this.hooks.playerStatus?.('root', 1.5, 0.1); // staggered + floored 1.5 s
          this.hooks.sound('stagger');
        }
        // Bomba Volcánica every ~3rd swing
        if (Math.random() < 0.34) {
          const bx = playerPos.x + (Math.random() - 0.5) * 1.5;
          const bz = playerPos.z + (Math.random() - 0.5) * 1.5;
          this.spawnPatch(new THREE.Vector3(bx, 0, bz), 2.4, 4.0, 12, 'fire');
          this.hooks.sound('fire');
        }
        break;
      }
      case 'spit': { // grimpote mud
        if (this.losTick(c, playerPos)) {
          this.hooks.playerDamage(dmg, c.pos.x, c.pos.z, reason);
          this.hooks.playerStatus?.('slow', 1.0, 0.9); // -10% for 1 s (the spec)
          this.hooks.sound('bow_release');
        }
        break;
      }
      case 'bounce': { // slime bump + mucus + the elemental riders
        if (dist <= range + 0.8) {
          this.hooks.playerDamage(dmg, c.pos.x, c.pos.z, reason);
          this.hooks.playerStatus?.('slow', 1.2, 0.88);
          // Fase 27 — elemental variants per the doc: fire leaves a burning
          // trail, shock sparks stun on contact, poison blights
          if (c.spec.id === 'slime_elemental') {
            if (c.variant === 'fire') {
              this.spawnPatch(new THREE.Vector3(playerPos.x, 0, playerPos.z), 1.8, 3.0, 10, 'fire');
            } else if (c.variant === 'shock') {
              this.hooks.playerStatus?.('shock', 0.7, 0.15);
              this.hooks.cameraShake(0.25);
            } else if (c.variant === 'poison') {
              this.hooks.playerDamage(4, c.pos.x, c.pos.z, 'poison');
            }
          }
        }
        break;
      }
      case 'acid': { // corrosive: corrosion on hit
        if (dist <= range + 0.8) {
          this.hooks.playerDamage(dmg, c.pos.x, c.pos.z, reason);
          this.playerCorrodeT = 6.0;
          this.hooks.notify('info', 'CORROSIÓN', 'Your armor weakens — the devourer\'s acid bites (-20% defense, 6 s).');
        }
        break;
      }
      case 'dive': { // harpy claws
        if (dist <= range + 1.0) {
          this.hooks.playerDamage(dmg, c.pos.x, c.pos.z, reason);
          this.hooks.sound('swing');
        }
        break;
      }
      case 'musket': { // artillero: BLUE unblockable ball
        if (this.losTick(c, playerPos)) {
          this.hooks.playerDamage(dmg, c.pos.x, c.pos.z, reason, { unblockable: true });
          this.hooks.sound('bow_release');
          this.hooks.cameraShake(0.2);
        }
        break;
      }
      case 'stomp': { // golem shockwave
        if (dist <= range + 1.6) {
          this.hooks.playerDamage(dmg, c.pos.x, c.pos.z, reason);
          this.hooks.cameraShake(0.4);
        }
        break;
      }
      case 'roots': { // Thorne P1: root prison / P2 bear maul / roar
        if (c.phase2Done) {
          const roll = Math.random();
          if (roll < 0.5 && dist <= range + 1.2) {
            this.hooks.playerDamage(spec.damage * 1.2, c.pos.x, c.pos.z, reason);
          } else if (roll < 0.75) {
            // roar: the hero's arms ring (-20% outgoing damage 6 s)
            this.hooks.cameraShake(0.45);
            this.hooks.sound('roar_big');
            this.roarDebuffT = 6.0;
            this.hooks.notify('info', 'RUGIDO DEL GUARDIÁN', 'Your strikes lose their edge for a moment (-20% damage, 6 s).');
          } else if (dist <= 14) {
            // charge: line dash then maul
            const fd = Math.max(0.001, dist);
            this.moveTowards(c, (playerPos.x - c.pos.x) / fd, (playerPos.z - c.pos.z) / fd, 9, 1 / 20);
            this.hooks.playerDamage(Math.round(spec.damage * 0.9), c.pos.x, c.pos.z, reason);
          }
        } else {
          if (this.losTick(c, playerPos) && dist <= spec.attackRange + 1.5) {
            // Prisión de Raíces: 2 s rooted unless dodged (range check = dodge)
            this.hooks.playerStatus?.('root', 2.0, 0);
            this.hooks.playerDamage(Math.round(dmg * 0.8), c.pos.x, c.pos.z, reason);
            this.hooks.notify('info', 'PRISIÓN DE RAÍCES', 'Zarzas sprout around your ankles!');
          }
          // Regeneración Mística when hurt
          if (c.hp / c.maxHp < 0.9 && c.healT <= 0 && Math.random() < 0.5) {
            c.healT = 2.5;
            this.hooks.notify('quest', 'REGENERACIÓN MÍSTICA', 'Thorne channels the grove — interrupt him with a heavy blow!');
          }
        }
        break;
      }
      case 'swallow': { // King Slime: Engullir + Lluvia Ácida
        if (dist <= range + 0.8) {
          this.hooks.playerDamage(dmg, c.pos.x, c.pos.z, reason);
          this.hooks.playerStatus?.('root', 3.0, 0); // swallowed: 3 s acid bath
          this.hooks.cameraShake(0.5);
          // acid DoT for the swallow window
          this.hooks.playerDamage(10, c.pos.x, c.pos.z, 'acid');
        } else {
          // Lluvia Ácida: gel rain in a wide radius
          this.hooks.cameraShake(0.6);
          this.hooks.sound('thunder');
          for (let i = 0; i < 7; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 2 + Math.random() * 13;
            this.spawnPatch(new THREE.Vector3(playerPos.x + Math.cos(a) * r, 0, playerPos.z + Math.sin(a) * r), 1.7, 2.6, 12, 'acid');
          }
        }
        break;
      }
    }
  }

  /** Roar debuff: the Game reads this to scale outgoing player damage. */
  roarDebuffT = 0;

  private losTick(c: Creature, playerPos: THREE.Vector3): boolean {
    // cheap "line of sight": within range & roughly facing (ranged attacks)
    const dx = playerPos.x - c.pos.x;
    const dz = playerPos.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    let a = Math.atan2(dx, dz) - c.yaw;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return dist < c.spec.attackRange + 4 && Math.abs(a) < 1.2;
  }

  private moveTowards(c: Creature, nx: number, nz: number, speed: number, dt: number): void {
    const p = this.terrain.height(c.pos.x + nx * speed * dt, c.pos.z + nz * speed * dt);
    // don't walk into the sea
    if (p < 0.3) { c.pickWander(); return; }
    c.pos.x += nx * speed * dt;
    c.pos.z += nz * speed * dt;
    c.pos.y = this.terrain.height(c.pos.x, c.pos.z);
    c.yaw = dampAngleTo(c.yaw, Math.atan2(nx, nz), 8, dt);
    c.movingK = 1;
  }

  private face(c: Creature, dx: number, dz: number, dt: number): void {
    c.yaw = dampAngleTo(c.yaw, Math.atan2(dx, dz), 8, dt);
  }

  // ------------------------------------------------------------ visuals

  private updateVisual(c: Creature, dt: number, active: boolean): void {
    const t = performance.now() / 1000 + c.phase;
    c.movingK = Math.max(0, (c.movingK ?? 0) - dt * 4);
    const moving = c.movingK ?? 0;
    c.group.position.set(c.pos.x, c.pos.y + (c.spec.body === 'harpy' ? c.flyY : 0), c.pos.z);
    c.group.rotation.y = c.yaw;

    // harpy flight bob + wing flap; grounded harpies flap weakly
    if (c.spec.body === 'harpy') {
      if (c.groundedT <= 0) {
        c.flyPhase += dt * 2.4;
        c.flyY = 6.5 + Math.sin(c.flyPhase) * 1.6;
        // dive target height when attacking
        if (c.state === 'chase' || c.state === 'windup') c.flyY = Math.max(1.2, c.flyY - dt * 6);
      } else {
        c.flyY = Math.max(0, c.flyY - dt * 5);
      }
      const flap = c.groundedT > 0 ? 0.12 : 0.65;
      for (let i = 0; i < c.model.wings.length; i++) {
        const sx = i === 0 ? 1 : -1;
        c.model.wings[i].rotation.z = sx * (0.25 + Math.sin(t * 9) * flap);
      }
    }

    // limb swings for walkers
    const swing = Math.sin(t * (4 + moving * 6)) * (0.15 + moving * 0.55);
    for (let i = 0; i < c.model.arms.length; i++) {
      c.model.arms[i].rotation.x = swing * (i === 0 ? 1 : -1) * 0.8;
      if (c.state === 'windup') c.model.arms[0].rotation.x = -1.9; // cocked back
      if (c.state === 'attack') c.model.arms[0].rotation.x = 1.1;  // swung through
    }
    for (let i = 0; i < c.model.legs.length; i++) {
      c.model.legs[i].rotation.x = swing * (i % 2 === 0 ? 1 : -1);
    }

    // species tick (slime squash, ghost float)
    if (active && c.model.tick) c.model.tick(t);
    if (c.glow) c.glow.position.y = 1.7 * (c.spec.scale ?? 1) + (c.spec.body === 'harpy' ? c.flyY : 0);

    // ghost teleport: shadow-step behind the player after eating 3 arrows
    if (c.spec.id === 'comandante_fantasma' && c.rangedHits >= 3) {
      c.rangedHits = 0;
      const a = Math.atan2(0, 1) + Math.PI + (Math.random() - 0.5); // behind-ish
      const bx = this.teleportAnchor!.x - Math.sin(a) * 2.2;
      const bz = this.teleportAnchor!.z - Math.cos(a) * 2.2;
      c.pos.set(bx, this.terrain.height(bx, bz), bz);
      c.aggro = true;
      this.hooks.notify('info', 'PASO DE SOMBRAS', 'The phantom commander blinks behind you!');
      this.hooks.sound('thunder');
    }
  }

  private teleportAnchor: THREE.Vector3 | null = null;

  /** Game feeds the player pos each frame for the ghost's shadow-step. */
  setPlayerAnchor(p: THREE.Vector3): void { this.teleportAnchor = p; }

  /** Harpies get knocked out of the sky by heavy hits / parries (Game calls). */
  groundCreature(target: unknown, dur = 3.5): void {
    if (target instanceof Creature) {
      target.groundedT = dur;
      target.state = 'chase';
    }
  }

  dispose(): void {
    for (const c of this.creatures) this.scene.remove(c.group);
    this.creatures = [];
    for (const p of this.patches) { this.scene.remove(p.mesh); this.patchPool.push(p.mesh); }
    this.patches = [];
  }
}

// ------------------------------------------------------------------ helpers

function dampAngleTo(cur: number, target: number, lambda: number, dt: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * (1 - Math.exp(-lambda * dt));
}
