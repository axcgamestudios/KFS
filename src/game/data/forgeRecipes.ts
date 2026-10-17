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

export type ForgeStationId = 'anvil' | 'altar' | 'titans';

export interface ForgeStationDef {
  id: ForgeStationId;
  name: string;
  title: string;
  /** The station's flavor line shown at the top of the panel. */
  greeting: string;
}

export const FORGE_STATIONS: Record<ForgeStationId, ForgeStationDef> = {
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
];

export const FORGE_RECIPE_IDS = FORGE_RECIPES.map((r) => r.id);
