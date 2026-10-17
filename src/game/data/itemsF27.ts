/**
 * Fase 27 — EL BESTIARIO COMÚN: the loot of the common enemies.
 *
 * Every material the bestiary drops, per the design doc: tier-1 gathering
 * mats (goblin/kobold/grimpote/slime), tier-2 (harpy/corsair/golem/
 * elemental slimes), tier-3 draconic guard / ghost commander / daimyo /
 * corrosive slimes, and the three mini-jefes (Krog, Thorne, King Slime).
 * Two of the mini-boss weapons join the forge tables (CombatSystem.WEAPONS)
 * and the sword priority list.
 */
import type { ItemDef } from './items';

export const ITEMS_F27: Record<string, ItemDef> = {
  // ---------------- TIER 1 — Enemigos Menores (Nivel 1-5) ----------------
  garrote_mellado: {
    id: 'garrote_mellado', name: 'Garrote de Madera Mellado', kind: 'material',
    desc: 'A goblin\'s notched wooden club. Bram can break it down for basic timber — or you can sell it by the crate.',
    icon: 'Hammer', stackable: true, rarity: 'common',
  },
  chatarra_hierro: {
    id: 'chatarra_hierro', name: 'Chatarra de Hierro', kind: 'material',
    desc: 'Rusty scrap iron, gnawed by goblin teeth. Good enough to patch a starting blade at the smithy.',
    icon: 'Wrench', stackable: true, rarity: 'common',
  },
  manzana_silvestre: {
    id: 'manzana_silvestre', name: 'Manzana Silvestre', kind: 'consumable',
    desc: 'A wild apple from the goblin sacks. Restores 12 health — bitter skin, sweet heart.',
    icon: 'Apple', stackable: true, usable: true,
  },
  escama_opaca: {
    id: 'escama_opaca', name: 'Escama Pequeña Opaca', kind: 'material',
    desc: 'A kobold\'s dull scale. The first layer of any reinforced-leather armor.',
    icon: 'Shell', stackable: true, rarity: 'common',
  },
  diente_reptil: {
    id: 'diente_reptil', name: 'Diente de Reptil', kind: 'material',
    desc: 'A kobold fang, curved like a fishhook. Fletched into the first piercing arrows.',
    icon: 'Triangle', stackable: true, rarity: 'common',
  },
  lodo_viscoso: {
    id: 'lodo_viscoso', name: 'Lodo Viscoso', kind: 'material',
    desc: 'Clotted marsh muck from a grimpote. The base of every minor healing potion.',
    icon: 'Droplets', stackable: true, rarity: 'common',
  },
  piel_anfibio: {
    id: 'piel_anfibio', name: 'Piel de Anfibio', kind: 'material',
    desc: 'Slippery grimpote hide. On the workbench it becomes a Sailor\'s Rags lining.',
    icon: 'Layers', stackable: true, rarity: 'common',
  },
  gelatina_basica: {
    id: 'gelatina_basica', name: 'Gelatina Básica', kind: 'material',
    desc: 'Common slime jelly. The alchemist\'s fundament: without it there is no healing brew.',
    icon: 'Blob', stackable: true, rarity: 'common',
  },
  agua_estancada: {
    id: 'agua_estancada', name: 'Agua Estancada', kind: 'material',
    desc: 'Swamp water in a corked vial. An ingredient, not a drink — Maren insists.',
    icon: 'FlaskRound', stackable: true, rarity: 'common',
  },

  // ---------------- TIER 2 — Enemigos Intermedios (Nivel 10-25) ----------------
  pluma_arpia: {
    id: 'pluma_arpia', name: 'Pluma Reforzada de Arpía', kind: 'material',
    desc: 'A rock harpy\'s quill, stiff as a bow spar. Fletched onto arrows it steadies their flight.',
    icon: 'Feather', stackable: true, rarity: 'common',
  },
  garra_afilada: {
    id: 'garra_afilada', name: 'Garra Afilada', kind: 'material',
    desc: 'A harpy talon. The workbench imbibes daggers and arrows with its bleed.',
    icon: 'Slice', stackable: true, rarity: 'common',
  },
  elixir_agilidad: {
    id: 'elixir_agilidad', name: 'Elíxir de Agilidad', kind: 'consumable',
    desc: 'A harpy-hoard vial. For 30 seconds the body feels weightless: quicker feet and generous breath.',
    icon: 'Wind', stackable: true, usable: true, rarity: 'rare',
  },
  polvora_fina: {
    id: 'polvora_fina', name: 'Polvo de Pólvora Fina', kind: 'material',
    desc: 'Corsair matchlock powder, ground fine. Feeds fire arrows and hand bombs.',
    icon: 'Sparkles', stackable: true, rarity: 'common',
  },
  lingote_plomo: {
    id: 'lingote_plomo', name: 'Lingote de Plomo', kind: 'material',
    desc: 'A soft heavy ingot. The smith reinforces shield frames and light plates with it.',
    icon: 'Cuboid', stackable: true, rarity: 'common',
  },
  mec_mosquete: {
    id: 'mec_mosquete', name: 'MEC-Mosquete Incompleto', kind: 'treasure',
    desc: 'A corsair matchlock missing its lock plate. Collectors pay well; Bram pays in favors.',
    icon: 'Crosshair', stackable: true, rarity: 'rare',
  },
  polvo_piedra_runica: {
    id: 'polvo_piedra_runica', name: 'Polvo de Piedra Rúnica', kind: 'material',
    desc: 'Ground runes from a temple golem. A catalyst that wakes dormant armor.',
    icon: 'Gem', stackable: true, rarity: 'rare',
  },
  fragmento_nucleo: {
    id: 'fragmento_nucleo', name: 'Fragmento de Núcleo Místico', kind: 'material',
    desc: 'A shard of the heart that once moved a golem. It hums against magical steel.',
    icon: 'Orbit', stackable: true, rarity: 'rare',
  },
  gema_antartica: {
    id: 'gema_antartica', name: 'Gema Antártica Opaca', kind: 'treasure',
    desc: 'A pale, clouded gem from a golem\'s chest. Jewelers whisper about what it hides.',
    icon: 'Diamond', stackable: true, rarity: 'rare',
  },
  gelatina_elemental: {
    id: 'gelatina_elemental', name: 'Gelatina Elemental', kind: 'material',
    desc: 'Slime jelly charged with fire, lightning or venom — it remembers which.',
    icon: 'Flame', stackable: true, rarity: 'rare',
  },
  nucleo_viscoso: {
    id: 'nucleo_viscoso', name: 'Núcleo Viscoso Estable', kind: 'material',
    desc: 'The still-beating core of an elemental slime. Alchemy tables prize its stability.',
    icon: 'Atom', stackable: true, rarity: 'rare',
  },

  // ---------------- TIER 3 — Enemigos Avanzados (Nivel 26-40) ----------------
  escama_draconica: {
    id: 'escama_draconica', name: 'Escama Dracónica Dura', kind: 'material',
    desc: 'Plate from a draconic guardian\'s harness — the Drake-Fledgling set begins here.',
    icon: 'Shield', stackable: true, rarity: 'rare',
  },
  lingote_acero_mistico: {
    id: 'lingote_acero_mistico', name: 'Lingote de Acero Místico', kind: 'material',
    desc: 'Polished enchanted steel. The Stormplate cuirass drinks it by the ingot.',
    icon: 'Boxes', stackable: true, rarity: 'rare',
  },
  gema_fuego: {
    id: 'gema_fuego', name: 'Gema de Fuego Intenso', kind: 'material',
    desc: 'It refuses to cool. A catalyst for weapons that must never stop burning.',
    icon: 'FlameKindling', stackable: true, rarity: 'legendary',
  },
  polvora_maldita: {
    id: 'polvora_maldita', name: 'Pólvora Maldita', kind: 'material',
    desc: 'Ghost-powder from a phantom commander\'s bandolier. Heavy piercing rounds want it.',
    icon: 'Bomb', stackable: true, rarity: 'rare',
  },
  reliquia_marina: {
    id: 'reliquia_marina', name: 'Reliquia Marina Antigua', kind: 'treasure',
    desc: 'A salt-eaten idol of a drowned saint. Coastal merchants pay a small fortune.',
    icon: 'Anchor', stackable: true, rarity: 'rare',
  },
  pluma_galeon: {
    id: 'pluma_galeon', name: 'Pluma de Galeón Espectral', kind: 'material',
    desc: 'A spectral feather that fell from a ghost ship\'s rigging. Barges turn on a coin with it.',
    icon: 'Feather', stackable: true, rarity: 'rare',
  },
  tamahagane: {
    id: 'tamahagane', name: 'Mineral Tamahagane Superior', kind: 'material',
    desc: 'Black-sand steel from the far east. The Fang-Thorn blade and the epic eastern armors begin here.',
    icon: 'Mountain', stackable: true, rarity: 'rare',
  },
  esencia_viento_oscuro: {
    id: 'esencia_viento_oscuro', name: 'Esencia de Viento Oscuro', kind: 'material',
    desc: 'A smear of the mist daimyo\'s killing wind. The alchemy table imbues it into cutting arrows.',
    icon: 'Tornado', stackable: true, rarity: 'rare',
  },
  sello_guida: {
    id: 'sello_guida', name: 'Sello del Guida Ancestral', kind: 'treasure',
    desc: 'A daimyo\'s seal. They say the bearer\'s blade finds humanoid throats more often. (Sold at a premium — for now.)',
    icon: 'Stamp', stackable: true, rarity: 'legendary',
  },
  acido_concentrado: {
    id: 'acido_concentrado', name: 'Ácido Concentrado', kind: 'material',
    desc: 'Devourer acid, corked in wax. Forges heavy piercing ammunition.',
    icon: 'FlaskConical', stackable: true, rarity: 'rare',
  },
  gelatina_maestra: {
    id: 'gelatina_maestra', name: 'Gelatina Corrosiva Maestra', kind: 'material',
    desc: 'The refined body of a devourer slime. High-tier potions of strength and venom require it.',
    icon: 'TestTubes', stackable: true, rarity: 'rare',
  },
  fragmento_armadura: {
    id: 'fragmento_armadura', name: 'Fragmento de Armadura Ingestada', kind: 'material',
    desc: 'A knight\'s plate, half-digested by a corrosive slime. Ready for the crucible.',
    icon: 'Crown', stackable: true, rarity: 'rare',
  },

  // ---------------- MINI-JEFES ----------------
  corona_chatarra: {
    id: 'corona_chatarra', name: 'Corona de Chatarra Dorada', kind: 'treasure',
    desc: 'Krog the Hoarder\'s crown of gilded scrap. It sells for a considerable purse in town.',
    icon: 'Crown', stackable: true, rarity: 'rare',
  },
  garrote_krog: {
    id: 'garrote_krog', name: 'Garrote de Hierro de Krog', kind: 'weapon',
    desc: 'The hoarder\'s iron-bound club: slow, brutal, +15% crueler against lesser foes. Click to swing; hold for the bone-breaker.',
    icon: 'Hammer', stackable: false, equipable: true, rarity: 'rare', level: 14,
  },
  bolsa_bombas: {
    id: 'bolsa_bombas', name: 'Bolsa de Bombas de Brea', kind: 'material',
    desc: 'Five pitch bombs from Krog\'s satchel (×5). The workbench turns them into alchemical fire.',
    icon: 'Bomb', stackable: true, rarity: 'rare',
  },
  cuero_bestia: {
    id: 'cuero_bestia', name: 'Cuero de Bestia Reforzado', kind: 'material',
    desc: 'Boar-hardened hide. Upgrades satchel capacity at the workbench.',
    icon: 'Package', stackable: true, rarity: 'common',
  },
  esencia_roble: {
    id: 'esencia_roble', name: 'Esencia de Roble Ancestral', kind: 'material',
    desc: 'The fallen guardian\'s sap. Imbues armor with passive regeneration (+2 HP/s).',
    icon: 'TreeDeciduous', stackable: true, rarity: 'legendary',
  },
  baculo_raices: {
    id: 'baculo_raices', name: 'Báculo de Raíces Espinosas', kind: 'treasure',
    desc: 'Thorne\'s hybrid staff: it still writhes, reaching for throats to root. (A trophy of power — sell or keep.)',
    icon: 'Wand2', stackable: true, rarity: 'legendary',
  },
  corteza_druida: {
    id: 'corteza_druida', name: 'Corteza Armada de Druida', kind: 'material',
    desc: 'Bark from the guardian\'s bear form. Forges breastplates that shrug poison and wild magic.',
    icon: 'ShieldHalf', stackable: true, rarity: 'rare',
  },
  semilla_bosque: {
    id: 'semilla_bosque', name: 'Semilla del Bosque Sagrado', kind: 'consumable',
    desc: 'A seed that refuses to die. Use it to receive the forest\'s blessing: the next time you fall in battle, you rise on the spot with half your strength. One life per seed.',
    icon: 'Sprout', stackable: false, usable: true, rarity: 'legendary',
  },
  corona_slime: {
    id: 'corona_slime', name: 'Corona de Slime Cristalizado', kind: 'treasure',
    desc: 'The crown of the Indestructible Mass — pure crystallized jelly, worth a fortune.',
    icon: 'Crown', stackable: true, rarity: 'legendary',
  },
  espada_gelatina: {
    id: 'espada_gelatina', name: 'Espada de Gelatina Elástica', kind: 'weapon',
    desc: 'An epic blade of living jelly: absurd reach, and it slings back a share of every blow it takes. Click to whip it; hold for the rebound smash.',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary', level: 22,
  },
  nucleo_primordial: {
    id: 'nucleo_primordial', name: 'Núcleo Primordial Slime', kind: 'material',
    desc: 'The first jelly\'s heart. The Elixir of Inert Mass is brewed from it — falls and explosions lose half their teeth.',
    icon: 'CircleDot', stackable: true, rarity: 'legendary',
  },
};
