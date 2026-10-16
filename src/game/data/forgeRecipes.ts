/**
 * Fase 22 — THE FORGE OF LEGENDS: the recipe book.
 *
 * Three stations:
 *  · THE GREAT ANVIL (Bram's forge, Crowhaven) — honest steel, leather and
 *    silk work: the Common → Epic bands.
 *  · THE ALTAR OF THE GODS (Circle of Vigils) — divine assembly. Also the
 *    only place the Primal Sun Essence can SUMMON AN ECLIPSE (during which
 *    Apollo's Bow may be strung).
 *  · THE ANVIL OF THE TITANS (Ancestor's Nest) — where four legendary blades
 *    and two catalysts of legend are folded into Goliath's Colossal Sword.
 *
 * `level` lives on the ITEMS (the equip gate); recipes gate on materials +
 * gold only, so a piece can be forged before it can be worn (the forge does
 * not check your birth certificate — the strap does).
 */

export type ForgeStationId = 'anvil' | 'altar' | 'titans' | 'still';

export interface ForgeStationDef {
  id: ForgeStationId;
  name: string;
  title: string;
  /** The station's flavor line shown at the top of the panel. */
  greeting: string;
}

export const FORGE_STATIONS: Record<ForgeStationId, ForgeStationDef> = {
  still: {
    id: 'still',
    name: "Maren's Still",
    title: "The Herbalist's Cottage · Puerto Cuervo",
    greeting:
      'Copper kettle, wild apples, monster leavings. Lay the materials on the bench and try not to ask what the last one was.',
  },
  anvil: {
    id: 'anvil',
    name: 'The Great Anvil',
    title: "Bram's Forge · Crowhaven",
    greeting:
      'Sea iron, drake fang, storm-folded steel — lay it on the anvil and hold your breath. What leaves this fire does not come back.',
  },
  altar: {
    id: 'altar',
    name: 'The Altar of the Gods',
    title: 'Circle of Vigils',
    greeting:
      'The old stones drink the light. Present what the Elder Dragon left behind, and the sky itself will take sides.',
  },
  titans: {
    id: 'titans',
    name: 'The Anvil of the Titans',
    title: "The Ancestor's Nest",
    greeting:
      'A mountain with a waist. The Ancestor built it to break things too big to break. Kneel, and offer the four blades.',
  },
};

export interface ForgeMatReq {
  id: string;
  count: number;
}

export interface ForgeRecipe {
  id: string;
  /** Item produced (ITEMS[out] must exist — itemsF22). */
  out: string;
  station: ForgeStationId;
  mats: ForgeMatReq[];
  gold: number;
  /** Craftable ONLY while a summoned eclipse holds (Apollo's Bow). */
  requiresEclipse?: boolean;
  /** The smith's flavour line about this piece (panel tooltip). */
  note: string;
}

/** Ordered recipe list (stable menus, tier-sorted). */
export const FORGE_RECIPES: ForgeRecipe[] = [
  // ---------------------------------------------------------------- Great Anvil
  {
    id: 'forge_machete', out: 'machete_oxidado', station: 'anvil',
    mats: [{ id: 'ingote_hierro_mar', count: 2 }],
    gold: 15,
    note: 'Pirate steel, beat straight and edge-honest. The notch stays — it remembers work.',
  },
  {
    id: 'forge_sable', out: 'sable_mareas', station: 'anvil',
    mats: [
      { id: 'ingote_hierro_mar', count: 5 },
      { id: 'esencia_agua', count: 1 },
    ],
    gold: 120,
    note: 'Quenched in a living drop of tide. Rain and surf quicken it — the steel drinks weather.',
  },
  {
    id: 'forge_hoja_draco', out: 'hoja_draco', station: 'anvil',
    mats: [
      { id: 'colmillo_cria', count: 3 },
      { id: 'escama_quemada', count: 1 },
    ],
    gold: 260,
    note: 'Three fangs folded through a scale that already survived one fire. Charged heavies leave embers behind.',
  },
  {
    id: 'forge_peto_vigia', out: 'peto_vigia', station: 'anvil',
    mats: [
      { id: 'ingote_hierro_mar', count: 8 },
      { id: 'madera', count: 2 },
    ],
    gold: 200,
    note: 'Eight ingots over galeon knees. Blasts and sweeps shove you a third less — keep the deck under your boots.',
  },
  {
    id: 'forge_do_sombras', out: 'do_sombras', station: 'anvil',
    mats: [
      { id: 'seda_sombras', count: 1 },
      { id: 'cuero_bestia', count: 2 },
    ],
    gold: 240,
    note: 'One uncut thread of shadow silk over beast leather. Night and fog lend you their silence.',
  },
  {
    id: 'forge_coraza_cria', out: 'coraza_cria', station: 'anvil',
    mats: [
      { id: 'colmillo_cria', count: 3 },
      { id: 'escama_quemada', count: 3 },
    ],
    gold: 320,
    note: 'Drake fang rivets through scorched scale. The cold cannot bite you and fire loses half its argument.',
  },
  {
    id: 'forge_coraza_tormenta', out: 'coraza_tormenta', station: 'anvil',
    mats: [
      { id: 'nucleo_tormenta', count: 1 },
      { id: 'lingote_mistico', count: 10 },
    ],
    gold: 800,
    note: 'A captive storm grounded through ten ingots of mystic steel. It drinks lightning and pays you in breath.',
  },
  // ------------------------------------------------------------- Altar of the Gods
  {
    id: 'forge_armadura_ancestral', out: 'armadura_ancestral', station: 'altar',
    mats: [
      { id: 'escama_ancestral', count: 10 },
      { id: 'placa_sangre', count: 5 },
    ],
    gold: 2000,
    note: 'Scales that argue like a family, over plates of frozen blood. Wounds to this skin answer with fire.',
  },
  {
    id: 'forge_arco_apolo', out: 'arco_apolo', station: 'altar',
    mats: [
      { id: 'corazon_dragon_anciano', count: 1 },
      { id: 'esencia_solar', count: 1 },
    ],
    gold: 3000,
    requiresEclipse: true,
    note: 'ONLY UNDER AN ECLIPSE. A heart that outlived its dragon, a bead of the first morning, one string of noon.',
  },
  // ---------------------------------------------------------- Anvil of the Titans
  {
    id: 'forge_goliath', out: 'espada_goliath', station: 'titans',
    mats: [
      { id: 'espada_rey_pirata', count: 1 },
      { id: 'gemelas_viento', count: 1 },
      { id: 'espada_garra', count: 1 },
      { id: 'sombrero_rey', count: 1 },
      { id: 'corona_astas', count: 1 },
    ],
    gold: 5000,
    note: 'Four legendary blades — the cutlass, the twins, the claw — folded into one black colossus, catalyzed by hat and antlers.',
  },

  // ------------------------------------------------------------- Maren's Still
  // Fase 28 — the alchemist's recipes. Materials only (no gold: the still
  // is a service, the ingredients ARE the price). Ordered by band.
  {
    id: 'brew_curacion', out: 'pocion_curacion_menor', station: 'still' as ForgeStationId,
    mats: [{ id: 'gelatina_basica', count: 2 }, { id: 'lodo_viscoso', count: 1 }, { id: 'manzana_silvestre', count: 1 }],
    gold: 0,
    note: 'Restores 10% health, instantly. The one you hand to people you like.',
  },
  {
    id: 'brew_escamas', out: 'pocion_escamas', station: 'still' as ForgeStationId,
    mats: [{ id: 'escama_opaca', count: 2 }, { id: 'diente_reptil', count: 1 }, { id: 'gelatina_basica', count: 1 }],
    gold: 0,
    note: 'Light scales: +10% defense for a minute. Ideal against anything that hits with honest muscle.',
  },
  {
    id: 'brew_termico', out: 'elixir_termico', station: 'still' as ForgeStationId,
    mats: [{ id: 'glandula_fuego', count: 1 }, { id: 'gelatina_fuego', count: 1 }, { id: 'nucleo_viscoso', count: 1 }],
    gold: 0,
    note: 'Drink before visiting a volcano or anything that is personally on fire. +25% fire resist, burns nullified.',
  },
  {
    id: 'brew_roble', out: 'pocion_roble', station: 'still' as ForgeStationId,
    mats: [{ id: 'piedra_runica', count: 1 }, { id: 'cuero_curtido', count: 1 }, { id: 'lodo_viscoso', count: 1 }],
    gold: 0,
    note: 'Oak-skin: blows land like weather. +40% push/interrupt resistance and +2 HP/s while it holds.',
  },
  {
    id: 'brew_celeridad', out: 'tonico_celeridad', station: 'still' as ForgeStationId,
    mats: [{ id: 'pluma_reforzada', count: 2 }, { id: 'garra_afilada', count: 1 }, { id: 'gelatina_rayo', count: 1 }],
    gold: 0,
    note: 'Wind-celerity: +20% speed, dodges cost 15% less. For slipping out from under a boss.',
  },
  {
    id: 'brew_acido', out: 'brebaje_acido', station: 'still' as ForgeStationId,
    mats: [{ id: 'acido_concentrado', count: 2 }, { id: 'polvo_fina', count: 1 }, { id: 'gelatina_corrosiva', count: 1 }],
    gold: 0,
    note: 'Corrosive brew, THROWN: a 5 m cloud that strips 30% armor and keeps biting for six seconds.',
  },
  {
    id: 'brew_furia', out: 'elixir_furia', station: 'still' as ForgeStationId,
    mats: [{ id: 'esencia_profundidades', count: 1 }, { id: 'polvora_maldita', count: 1 }, { id: 'esencia_viento_oscuro', count: 1 }],
    gold: 0,
    note: 'Abyss-fury: +35% critical damage and +15% attack speed, at the cost of 15% of your defense. Glass-cannon work.',
  },
  {
    id: 'brew_masa', out: 'elixir_masa', station: 'still' as ForgeStationId,
    mats: [{ id: 'nucleo_primordial', count: 1 }, { id: 'corona_slime', count: 1 }, { id: 'gema_fuego', count: 2 }],
    gold: 0,
    note: 'Inert mass: for twenty seconds, impacts are things that happen to other people — and a tenth of each comes back out as a shockwave.',
  },
  {
    id: 'brew_lagrima', out: 'lagrima_bosque', station: 'still' as ForgeStationId,
    mats: [
      { id: 'semilla_bosque', count: 1 },
      { id: 'esencia_roble', count: 1 },
      { id: 'esencia_profundidades', count: 1 },
      { id: 'hierbas_raras', count: 1 },
    ],
    gold: 0,
    note: 'The Tear of the Ancestral Forest: full restoration and ten seconds nothing can alter you. One per fight; two against bosses.',
  },
];

export const FORGE_RECIPE_IDS = FORGE_RECIPES.map((r) => r.id);
