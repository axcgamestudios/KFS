/**
 * Fase 28 — LA MESA DE ALQUIMIA: the brewing recipes + the timed effects.
 *
 * Pattern-mirrors forgeRecipes.ts: every recipe lives on ONE station
 * (Maren's distillation table by the green), consumes loot materials +
 * gold, and grants a stackable potion. Validation happens in
 * AlchemySystem.craft — the UI is never trusted.
 *
 * TIMED potions map their item id to an effect id (POTION_ITEM_EFFECTS);
 * POTION_EFFECTS declares the modifier windows the AlchemySystem composes
 * (damage out/in, stride, breath, regeneration, the inert-mass halving,
 * weapon enchantments, the antidote's brief immunity).
 */

export type AlchemyStationId = 'mesa';

export interface AlchemyStationDef {
  id: AlchemyStationId;
  name: string;
  title: string;
  greeting: string;
}

export const ALCHEMY_STATIONS: Record<AlchemyStationId, AlchemyStationDef> = {
  mesa: {
    id: 'mesa',
    name: 'Mesa de Alquimia',
    title: "Maren's Distillation Table",
    greeting:
      'Jelly, muck and patience — that is half of alchemy. The other half is not drinking the failures. What shall we boil?',
  },
};

export interface AlchemyMatReq {
  id: string;
  count: number;
}

export interface AlchemyRecipe {
  id: string;
  /** Output item id (must exist in ITEMS). */
  out: string;
  station: AlchemyStationId;
  mats: AlchemyMatReq[];
  gold: number;
  /** Maren's flavour line (tooltip in the panel). */
  note: string;
}

export const ALCHEMY_RECIPES: AlchemyRecipe[] = [
  {
    id: 'r_menor', out: 'pocion_curacion_menor', station: 'mesa',
    mats: [{ id: 'gelatina_basica', count: 2 }, { id: 'lodo_viscoso', count: 1 }], gold: 8,
    note: 'The first lesson: melt the jelly into the muck, decant twice, do not taste it. Twenty-five health back in a swallow.',
  },
  {
    id: 'r_mayor', out: 'pocion_curacion_mayor', station: 'mesa',
    mats: [{ id: 'gelatina_basica', count: 2 }, { id: 'nucleo_viscoso', count: 1 }, { id: 'agua_estancada', count: 1 }], gold: 18,
    note: 'The same brew, but the core holds the jelly still so it forgets to spoil. Seventy health — the swallow takes longer too.',
  },
  {
    id: 'r_antidoto', out: 'antidoto', station: 'mesa',
    mats: [{ id: 'agua_estancada', count: 2 }, { id: 'lodo_viscoso', count: 1 }], gold: 10,
    note: 'Corked swamp water over settled muck. It will not win a festival, but no root or mire will hold your legs for eight heartbeats after.',
  },
  {
    id: 'r_viento', out: 'pocion_viento', station: 'mesa',
    mats: [{ id: 'pluma_arpia', count: 2 }, { id: 'gelatina_basica', count: 1 }], gold: 16,
    note: 'A harpy quill steeped until the jelly hums. You will run like the wind rides a gull — and get your wind back almost as fast.',
  },
  {
    id: 'r_piedra', out: 'pocion_piel_piedra', station: 'mesa',
    mats: [{ id: 'polvo_piedra_runica', count: 1 }, { id: 'gelatina_basica', count: 2 }], gold: 26,
    note: 'Golem dust, and the runes never quite sleep. For three-quarters of a minute your skin reads as granite to anything that bites it.',
  },
  {
    id: 'r_regen', out: 'pocion_regeneracion', station: 'mesa',
    mats: [{ id: 'nucleo_viscoso', count: 1 }, { id: 'gelatina_elemental', count: 1 }], gold: 24,
    note: 'A living core holding a charged jelly in balance. The flesh knits itself shut while it lasts — stand still and let it.',
  },
  {
    id: 'r_veneno', out: 'pocion_veneno', station: 'mesa',
    mats: [{ id: 'acido_concentrado', count: 1 }, { id: 'gelatina_elemental', count: 1 }], gold: 22,
    note: 'Acid tamed by jelly until it only bites what the jelly remembers. Rub it on the edge — the rot does the rest, five teeth at a time.',
  },
  {
    id: 'r_fuego', out: 'pocion_fuego', station: 'mesa',
    mats: [{ id: 'gelatina_elemental', count: 2 }, { id: 'polvora_fina', count: 1 }], gold: 22,
    note: 'Fire-jelly thinned with corsair powder until it stops eating the bottle. The embers ride your edge into bestiary flesh and stay there.',
  },
  {
    id: 'r_fuerza', out: 'pocion_fuerza', station: 'mesa',
    mats: [{ id: 'gelatina_maestra', count: 1 }, { id: 'polvo_estelar', count: 1 }], gold: 30,
    note: 'The refined body of a devourer, cut with stardust so the strength lands in your arms instead of your temper. Every blow, a falling tree.',
  },
  {
    id: 'r_masa', out: 'elixir_masa_inerte', station: 'mesa',
    mats: [{ id: 'nucleo_primordial', count: 1 }, { id: 'gelatina_basica', count: 2 }], gold: 60,
    note: 'The first jelly\'s heart, dissolved back into common jelly. Your mass forgets it can be broken: the long falls and the blasts lose half their teeth.',
  },
];

// ---------------------------------------------------------------- effects

/** A timed modifier window the AlchemySystem composes across active effects. */
export interface PotionEffectDef {
  id: string;
  /** HUD chip label. */
  name: string;
  /** lucide icon name for the HUD strip. */
  icon: string;
  /** Seconds (0 = instant-only, never listed). */
  dur: number;
  /** Outgoing damage multiplier (1 = untouched). */
  damageOutMul?: number;
  /** Incoming damage multiplier taken on health (1 = untouched). */
  damageTakenMul?: number;
  /** Stride multiplier (player externSlow channel — >1 is a buff). */
  speedMul?: number;
  /** Stamina regeneration multiplier. */
  staminaRegenMul?: number;
  /** Health per second. */
  hpPerSec?: number;
  /** Fall + blast damage multiplier. */
  fallAndBlastMul?: number;
  /** Bestiary DoT carried by the weapon edge while active. */
  weaponEnchant?: 'poison' | 'burn';
  /** Consume-time: clear slow/root at once. */
  cureOnUse?: boolean;
  /** Consume-time + window: refuse new external statuses. */
  statusImmune?: boolean;
}

export const POTION_EFFECTS: Record<string, PotionEffectDef> = {
  fuerza: {
    id: 'fuerza', name: 'Fuerza del Coloso', icon: 'Dumbbell', dur: 60,
    damageOutMul: 1.25,
  },
  piel_piedra: {
    id: 'piel_piedra', name: 'Piel de Piedra', icon: 'Shield', dur: 45,
    damageTakenMul: 0.75,
  },
  viento: {
    id: 'viento', name: 'Viento Errante', icon: 'Wind', dur: 45,
    speedMul: 1.15, staminaRegenMul: 1.4,
  },
  regeneracion: {
    id: 'regeneracion', name: 'Regeneración', icon: 'Activity', dur: 30,
    hpPerSec: 3,
  },
  arma_veneno: {
    id: 'arma_veneno', name: 'Filo Ponzoñoso', icon: 'FlaskConical', dur: 90,
    weaponEnchant: 'poison',
  },
  arma_fuego: {
    id: 'arma_fuego', name: 'Filo Ígneo', icon: 'Flame', dur: 90,
    weaponEnchant: 'burn',
  },
  masa_inerte: {
    id: 'masa_inerte', name: 'Masa Inerte', icon: 'Mountain', dur: 120,
    fallAndBlastMul: 0.5,
  },
  antidoto: {
    id: 'antidoto', name: 'Antídoto', icon: 'Leaf', dur: 8,
    cureOnUse: true, statusImmune: true,
  },
};

/** Item id → effect id for every TIMED potion (instant ones are coded in
 *  Game.useItem and never appear on the HUD strip). */
export const POTION_ITEM_EFFECTS: Record<string, string> = {
  pocion_fuerza: 'fuerza',
  pocion_piel_piedra: 'piel_piedra',
  pocion_viento: 'viento',
  pocion_regeneracion: 'regeneracion',
  pocion_veneno: 'arma_veneno',
  pocion_fuego: 'arma_fuego',
  elixir_masa_inerte: 'masa_inerte',
  antidoto: 'antidoto',
};
