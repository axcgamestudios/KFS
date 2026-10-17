/** Item registry — everything the player can carry. */

export type ItemKind = 'material' | 'consumable' | 'weapon' | 'key' | 'readable' | 'treasure' | 'armor' | 'wings';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: ItemKind;
  /** lucide icon name used by the UI */
  icon: string;
  stackable: boolean;
  equipable?: boolean;
  usable?: boolean;
  rarity?: 'common' | 'rare' | 'legendary';
  /** For readables: lore text shown when read. */
  lore?: string[];
  /** Fase 16 — armor items: flat max-health bonus + fraction of damage
   *  REDUCED from every unblocked hit that lands while equipped. */
  armor?: { hp: number; reduce: number };
  /** Fase 16 — wings: glide descent speed (m/s, negative) and the forward
   *  glide speed (m/s) the wings sustain while falling. */
  glide?: { sink: number; speed: number };
  /** Fase 22 — THE FORGE: minimum player level to EQUIP the item.
   *  Enforced by GameState.equip; crafting gates live in ForgeSystem. */
  level?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  coin: {
    id: 'coin', name: 'Gold Coins', kind: 'treasure',
    desc: 'The gold of Eldoria. Good for trading with merchants and fixing ships.',
    icon: 'Coins', stackable: true, rarity: 'common',
  },
  petalo: {
    id: 'petalo', name: 'Ivory Petal', kind: 'material',
    desc: 'A luminous flower that grows in the shade of waterfalls and among ancient ruins. Maren needs it for her remedies.',
    icon: 'Flower2', stackable: true, rarity: 'common',
  },
  pocion: {
    id: 'pocion', name: 'Healing Potion', kind: 'consumable',
    desc: 'One of Maren\'s bitter tonics. Restores 45 health.',
    icon: 'FlaskConical', stackable: true, usable: true,
  },
  espada_acero: {
    id: 'espada_acero', name: 'Steel Sword', kind: 'weapon',
    desc: 'Your first sword: honest steel from a Crowhaven forge. Bram can temper and improve it at his smithy once you have gathered the gold.',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'common',
  },
  espada_eirik: {
    id: 'espada_eirik', name: 'Eirik\'s Sword', kind: 'weapon',
    desc: 'The vanished captain\'s steel. A sea serpent coils, etched into the grip. Light, lethal, laden with memories.',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  // ---- Fase 12 — ESPADAS ELEMENTALES: botín de los grandes jefes tardíos ----
  espada_fuego: {
    id: 'espada_fuego', name: 'Ember Fang', kind: 'weapon',
    desc: 'Forged in the very heart of Kraivenn\'s breath. The blade burns without being consumed: every stroke sets the enemy alight. (+35% damage, ember bursts)',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  espada_escarcha: {
    id: 'espada_escarcha', name: 'Frost Fang', kind: 'weapon',
    desc: 'Torn from the ice bed of Vaelyx the Ancestor. The edge freezes the blood wherever it bites. (+25% damage, freezing breath)',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  espada_tormenta: {
    id: 'espada_tormenta', name: 'Abyssal Lightning', kind: 'weapon',
    desc: 'Tempered with the lightning the Mist-Wyvern once spat across the sea. It leaps from enemy to enemy like chained thunder. (+30% damage, lightning chain)',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  amuleto: {
    id: 'amuleto', name: 'Copper Amulet', kind: 'key',
    desc: 'An amulet bearing the mark of the Order of the Tide. It fits the lock of Eirik\'s chest.',
    icon: 'KeyRound', stackable: false, rarity: 'rare',
  },
  carta: {
    id: 'carta', name: 'Eirik\'s Letter', kind: 'readable',
    desc: 'A handwritten letter, creased by salt and time.',
    icon: 'ScrollText', stackable: false, lore: [
      'If you are reading this, the sea has claimed me — or called me. Perhaps both.',
      'I was no mere fisherman. I was a Warden of the Tide, as my forebears were before me. We kept the pact between kings and dragons: that they should never wake beneath the sunken cities.',
      'The Sea Hummingbird carries the Order\'s seal carved in her keel. Beware the three-headed crow: he seeks it too. He seeks the Order. He seeks the Map.',
      'Finish what I began. Set sail for Old Crow Isle. And remember: dragons are not what the songs say.',
      '— Eirik, your father',
    ],
  },
  mapa: {
    id: 'mapa', name: 'Ancient Map', kind: 'readable',
    desc: 'A map of Eldoria\'s seas, annotated in a tongue almost no one remembers. It marks an island to the northwest: Old Crow Isle.',
    icon: 'Map', stackable: false, rarity: 'legendary', lore: [
      'The parchment shows coastlines that appear on no modern chart.',
      'An island to the northwest is ringed by a circle of red ink with a note: "Where the tide sleeps."',
      'On the back, in Eirik\'s hand: "Do not go without the Order. Do not go without steel."',
    ],
  },
  cargamento: {
    id: 'cargamento', name: 'Rosa\'s Shipment', kind: 'key',
    desc: 'A crate of spices rescued from the wreck off the west coast. It bears the mark of the Broken Anchor tavern.',
    icon: 'Package', stackable: false,
  },
  colmillo: {
    id: 'colmillo', name: 'Carved Fang', kind: 'treasure',
    desc: 'An ancient fang carved with water spirals. Perhaps it is worth something… or perhaps it is something more.',
    icon: 'Gem', stackable: false, rarity: 'rare',
  },
  madera: {
    id: 'madera', name: 'Oak Planks', kind: 'material',
    desc: 'Cured oak from the warehouses of Crowhaven. Bram needs it for the Sea Hummingbird\'s hull.',
    icon: 'TreePine', stackable: true,
  },
  lona: {
    id: 'lona', name: 'Sailcloth', kind: 'material',
    desc: 'Waxed cloth that stands up to salt. Rosa dyes it in a petal bath that strengthens the fibers as well.',
    icon: 'Layers', stackable: true,
  },
  cuerda: {
    id: 'cuerda', name: 'Hemp Rope', kind: 'material',
    desc: 'Hemp braided in the style of Aldmor\'s fishermen. It will hold a mast — or an entire harbor.',
    icon: 'Cable', stackable: true,
  },
  sello: {
    id: 'sello', name: 'Seal of the Order of the Tide', kind: 'key',
    desc: 'A bronze seal bearing the circle of tides and the flame of the Wardens. Morwen tore it from a ship of the Order. Now it returns to the hands of a Warden.',
    icon: 'Award', stackable: false, rarity: 'legendary', lore: [
      'The seal weighs more than its size promises, as if the metal remembered the weight of oaths.',
      'On the reverse, an inscription nearly worn away: "Where the tide sleeps, the watch wakes."',
      'Your father\'s letter spoke of Old Crow Isle... but the seal draws something else: an archipelago of sleeping dragons that no living chart points to.',
    ],
  },
  botin: {
    id: 'botin', name: 'Crow\'s Loot', kind: 'treasure',
    desc: 'A small chest with the plunder of the Crow Fortress: coins of half a dozen kingdoms and uncut gems.',
    icon: 'Coins', stackable: false, rarity: 'rare',
  },
  espejo: {
    id: 'espejo', name: 'Brass Mirror of the Lighthouse', kind: 'treasure',
    desc: 'The mirror that once multiplied the flame of the Order\'s lighthouse. Clouds of salt have turned it milky, but the brass shines like the first day.',
    icon: 'Disc', stackable: false, rarity: 'rare',
  },
  escama: {
    id: 'escama', name: 'Dragon Scale', kind: 'treasure',
    desc: 'Neither cold nor hot. Held in the hand, it beats very slowly... as if it were sleeping. Dragons sleep — something is waking them.',
    icon: 'Shell', stackable: true, rarity: 'legendary', lore: [
      'The scale is as large as your palm and changes color with the light: abyss blue, tide green, storm gray.',
      'Held to your ear, you swear you hear breathing. Very deep. Very slow.',
      'Someone left it in this chest on purpose: water spirals ring the hollow where it rested, identical to those in the ruins of Vaelthara.',
    ],
  },
  hacha_orden: {
    id: 'hacha_orden', name: 'Axe of the Order', kind: 'weapon',
    desc: 'A war axe from the armory of the Order of the Tide. Heavy as a broken oath: its heavy blows stagger even beasts.',
    icon: 'Axe', stackable: false, equipable: true, rarity: 'rare',
  },
  lanza_caza: {
    id: 'lanza_caza', name: 'Hunting Spear', kind: 'weapon',
    desc: 'An ash-shafted spear with a whaling head, left behind by the tower\'s watchmen. Its reach keeps jaws at bay.',
    icon: 'Navigation', stackable: false, equipable: true, rarity: 'rare',
  },
  arco_naufragio: {
    id: 'arco_naufragio', name: 'Wreck Bow', kind: 'weapon',
    desc: 'A salt-cured yew longbow, stranded by the tide in the Mist Isles. Hold click to draw; release to loose.',
    icon: 'BowArrow', stackable: false, equipable: true, rarity: 'rare',
  },
  escudo_marea: {
    id: 'escudo_marea', name: 'Tide Shield', kind: 'weapon',
    desc: 'Bram forged it from Vaelthara\'s scales over an oak heart. It straps to the left arm: the right-hand block becomes nearly impenetrable.',
    icon: 'Shield', stackable: false, equipable: false, rarity: 'legendary',
  },
  flecha: {
    id: 'flecha', name: 'Arrows', kind: 'material',
    desc: 'Pine-heart shafts fletched with gull feathers. The ones that miss stay stuck in the ground: pass close by to pick them up.',
    icon: 'MoveUpRight', stackable: true,
  },
  corazon_marea: {
    id: 'corazon_marea', name: 'Heart of the Tide', kind: 'key',
    desc: 'A pulsing ruby torn from Vaelthara\'s breast. It beats to the rhythm of the waves. The Order called it "the warden\'s anchor."',
    icon: 'Droplets', stackable: false, rarity: 'legendary', lore: [
      'The gem is warm as a fevered brow, and it beats once for every three waves that break on the coast.',
      'Aldric will say the Wardens used hearts like this to seal their pacts with the dragons.',
      'At its base, an inscription: "Where the warden\'s heart beats, the ancestor sleeps."',
    ],
  },
  garra_skarnvind: {
    id: 'garra_skarnvind', name: 'Skarnvind\'s Claw', kind: 'key',
    desc: 'The claw of the wyvern of the mists, black as basalt and sharp as a cutting sail. With it, the Ancestor\'s Nest knows a hunter.',
    icon: 'Grab', stackable: false, rarity: 'legendary', lore: [
      'It measures a handspan. Skarnvind had six like it, and not one served him against your broadsides.',
      'Fishermen carve amulets from claws like this "so the sea knows who you are."',
      'Aldric swore this claw fits the lock of the Iceclaw Nest.',
    ],
  },
  colmillo_ancestro: {
    id: 'colmillo_ancestro', name: 'Ancestor\'s Fang', kind: 'treasure',
    desc: 'A fang longer than your forearm, so old the light gets lost inside it. The dragons\' pact was signed in blood upon this fang.',
    icon: 'Swords', stackable: false, rarity: 'legendary', lore: [
      'The fang weighs like remorse. Turn it, and the light traces spirals of water and wings inside it.',
      'The sunken kingdoms once paid whole kingdoms for a fang like this. The Wardens swore never to sell them.',
      'With this, the Order of the Tide has a Warden again… and the forgotten seas, a story to tell.',
    ],
  },

  // ---- Fase 16 — LA HERRERÍA: armaduras, espadas y ALAS del Herrero ----
  armadura_cuero: {
    id: 'armadura_cuero', name: 'Leather Cuirass', kind: 'armor',
    desc: 'Triple-layer cured leather, sewn with sinew. Light and quiet. (+20 max health, −10% damage taken)',
    icon: 'Shirt', stackable: false, equipable: true, rarity: 'common',
    armor: { hp: 20, reduce: 0.10 },
  },
  armadura_malla: {
    id: 'armadura_malla', name: 'Chain Hauberk', kind: 'armor',
    desc: 'Steel rings woven by hand: the edge stays caught in the rings. (+35 max health, −18% damage taken)',
    icon: 'Layers', stackable: false, equipable: true, rarity: 'rare',
    armor: { hp: 35, reduce: 0.18 },
  },
  armadura_placas: {
    id: 'armadura_placas', name: 'Plate Armor', kind: 'armor',
    desc: 'Blued steel plates over a leather harness. You feel the weight, never the edge. (+55 max health, −28% damage taken)',
    icon: 'Shield', stackable: false, equipable: true, rarity: 'legendary',
    armor: { hp: 55, reduce: 0.28 },
  },
  espada_plata: {
    id: 'espada_plata', name: 'Silver Sword', kind: 'weapon',
    desc: 'A silver blade tempered with a vein of steel. Cuts clean and never stains with salt. (+12% damage)',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'rare',
  },
  espada_almirante: {
    id: 'espada_almirante', name: 'Admiral\'s Blade', kind: 'weapon',
    desc: 'The greatsword of an admiral of the Order: perfect balance, an edge of three tempers. (+22% damage)',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  alas: {
    id: 'alas', name: 'Glider Wings', kind: 'wings',
    desc: 'Wings of waxed canvas over whale ribs. Equip them and leap from on high to glide down: hold SPACE in the air to open the glide.',
    icon: 'Feather', stackable: false, equipable: true, rarity: 'legendary',
    glide: { sink: -2.6, speed: 10.5 },
  },

  // ---- Fase 16 — EL HERRERO ENANO: versiones "ROTAS" (rotas = OP) ----
  armadura_cuero_rota: {
    id: 'armadura_cuero_rota', name: 'Shattered Leather Cuirass', kind: 'armor',
    desc: 'The version Borin "broke on purpose": drake leather, sewn with forge wire. Absurd. (+45 max health, −35% damage taken)',
    icon: 'Shirt', stackable: false, equipable: true, rarity: 'rare',
    armor: { hp: 45, reduce: 0.35 },
  },
  armadura_malla_rota: {
    id: 'armadura_malla_rota', name: 'Shattered Chain Hauberk', kind: 'armor',
    desc: 'A mail of Vaelthara scales: every ring is a living scale that closes on its own. (+80 max health, −50% damage taken)',
    icon: 'Layers', stackable: false, equipable: true, rarity: 'legendary',
    armor: { hp: 80, reduce: 0.50 },
  },
  armadura_placas_rota: {
    id: 'armadura_placas_rota', name: 'Shattered Plate Armor', kind: 'armor',
    desc: 'Plates of the very steel the pact was forged from. Borin laughs as he hangs it up: "no one will believe this exists." (+120 max health, −65% damage taken)',
    icon: 'Shield', stackable: false, equipable: true, rarity: 'legendary',
    armor: { hp: 120, reduce: 0.65 },
  },
  espada_plata_rota: {
    id: 'espada_plata_rota', name: 'Shattered Silver Sword', kind: 'weapon',
    desc: 'Silver tempered three nights running until it "broke right". The edge whistles. (+40% damage)',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  espada_almirante_rota: {
    id: 'espada_almirante_rota', name: 'Shattered Admiral\'s Blade', kind: 'weapon',
    desc: 'Borin folded it the wrong way and re-tempered it in drake-coal breath. It should not work. It works. (+75% damage)',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  alas_rotas: {
    id: 'alas_rotas', name: 'Shattered Glider Wings', kind: 'wings',
    desc: 'Sailcloth of the Sea Hummingbird over ribs cut from a whole claw. Broken gliding: they fall so slowly it seems the air is listening to them.',
    icon: 'Feather', stackable: false, equipable: true, rarity: 'legendary',
    glide: { sink: -1.8, speed: 13.5 },
  },

  // ---- Fase 18 — THE ARCHER'S ARSENAL (three bow classes + arrow families) ----
  arco_corto: {
    id: 'arco_corto', name: 'Short Bow', kind: 'weapon',
    desc: 'A hunter\'s armful of yew: draws in a blink, costs nothing to loose, and keeps shooting straight through a dodge roll. Tap for quick harassing shots; hold for the full pull.',
    icon: 'BowArrow', stackable: false, equipable: true, rarity: 'common',
  },
  gran_arco: {
    id: 'gran_arco', name: 'Greatbow of the Deep Forge', kind: 'weapon',
    desc: 'Borin strung a mast over a whalebone stave. Drawing it plants your boots in the earth — the javelin it throws breaks shields, postures and pride.',
    icon: 'BowArrow', stackable: false, equipable: true, rarity: 'legendary',
  },
  flecha_perforante: {
    id: 'flecha_perforante', name: 'Piercing Arrows', kind: 'material',
    desc: 'Bodkin heads of folded steel: they ignore armour — plate, hull timber, drake scale. Cycle with X while a bow is drawn.',
    icon: 'MoveUpRight', stackable: true, rarity: 'rare',
  },
  flecha_fuego: {
    id: 'flecha_fuego', name: 'Fire Arrows', kind: 'material',
    desc: 'Pitch-soaked wraps behind a barbed head. What they touch keeps burning — and powder kegs answer them loudly. Cycle with X.',
    icon: 'Flame', stackable: true, rarity: 'rare',
  },
  flecha_electrica: {
    id: 'flecha_electrica', name: 'Shock Arrows', kind: 'material',
    desc: 'Storm-glass tips that crackle on release. The arc leaps between foes — and anything standing in water or rain is stunned dead. Cycle with X.',
    icon: 'Zap', stackable: true, rarity: 'rare',
  },
  flecha_veneno: {
    id: 'flecha_veneno', name: 'Poison Arrows', kind: 'material',
    desc: 'Maren\'s recipe, distilled: the wound blights healing and saps the strength out of what carries it. Cycle with X.',
    icon: 'FlaskConical', stackable: true, rarity: 'rare',
  },
};

// ---- Fase 4 items (Chapter IV-V relics, trade goods, treasure hunt) ----
import { ITEMS_F4 } from './itemsF4';
Object.assign(ITEMS, ITEMS_F4);

// ---- Fase 15 items (sea beasts, the Sea King and the naval economy) ----
import { ITEMS_F15 } from './itemsF15';
Object.assign(ITEMS, ITEMS_F15);

// ---- Fase 22 items (THE FORGE OF LEGENDS) ----
import { ITEMS_F22 } from './itemsF22';
Object.assign(ITEMS, ITEMS_F22);

// ---- Fase 27 items (EL BESTIARIO COMÚN — the common enemies' loot) ----
import { ITEMS_F27 } from './itemsF27';
Object.assign(ITEMS, ITEMS_F27);
