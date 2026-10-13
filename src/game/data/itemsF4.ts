import type { ItemDef } from './items';

/**
 * Fase 4 items — Chapter IV & V relics, trade goods, treasure-hunt pieces
 * and mount equipment. Merged into the main registry by items.ts.
 */
export const ITEMS_F4: Record<string, ItemDef> = {
  // ---- Chapter IV relics ----
  corona_thalassar: {
    id: 'corona_thalassar', name: 'Crown of Thalassar', kind: 'key',
    desc: 'The crown of the sunken kings: black coral set in sea-silver. It beats softly, like a pulse beneath the water.',
    icon: 'Crown', stackable: false, rarity: 'legendary',
    lore: [
      'The crown of Thalassar was not forged to rule, but to remember.',
      'Within it, tiny inscriptions repeat a single phrase in the old tongue: "The tide keeps. The tide judges."',
      'Those who bear it sometimes hear the murmur of an assembly of kings beneath the waves.',
    ],
  },
  carta_navegacion: {
    id: 'carta_navegacion', name: 'Crow\'s Navigation Chart', kind: 'readable',
    desc: 'The Three-Headed Crow\'s secret nautical chart. Routes, reefs… and a nameless cove ringed with black feathers.',
    icon: 'ScrollText', stackable: false, rarity: 'legendary', lore: [
      'The chart is flecked with tar and signed with a three-headed seal.',
      'Grave marks stud the southern route: "Here fell the Marauder. Here the sea collects its debts."',
      'To the northwest, a nameless cove: "Where the Crow sleeps. Do not wake him without the three keys."',
    ],
  },
  corazon_cuervo: {
    id: 'corazon_cuervo', name: 'Heart of the Crow', kind: 'key',
    desc: 'An obsidian heart the size of a fist, still warm. Inside it beats a black light that casts no shadow.',
    icon: 'Heart', stackable: false, rarity: 'legendary',
  },
  espada_guardian: {
    id: 'espada_guardian', name: 'Warden\'s Sword', kind: 'weapon',
    desc: 'Forged by Bram from the Ancestor\'s fang and dragon scales. The edge sings with the voice of the tide. The weapon of the Order\'s Wardens.',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  // ---- Trade & side-quest goods ----
  pez: {
    id: 'pez', name: 'Reef Fish', kind: 'material',
    desc: 'Catch stranded by the low tide. Tom knows how to put it to good use in the pot.',
    icon: 'Fish', stackable: true,
  },
  semilla_arce: {
    id: 'semilla_arce', name: 'Seed of the Great Maple', kind: 'material',
    desc: 'A golden samara from the oldest tree in Eldoria. Maren wants to plant it beside the waterfall.',
    icon: 'Leaf', stackable: false, rarity: 'rare',
  },
  moneda_antigua: {
    id: 'moneda_antigua', name: 'Thalassar Coin', kind: 'treasure',
    desc: 'Old gold struck with the sunken crown. Collectors pay well for these.',
    icon: 'Coins', stackable: true, rarity: 'rare',
  },
  mapa_tesoro: {
    id: 'mapa_tesoro', name: 'The Captain\'s Treasure Map', kind: 'readable',
    desc: 'A map drawn in charcoal and octopus blood. An X marks the eastern cove, beneath the shadow of the ruined lighthouse.',
    icon: 'Map', stackable: false, rarity: 'rare', lore: [
      '"The low tide uncovers what the high tide hides."',
      'An X rests on the cove to the east, between two rocks shaped like whales.',
      'At the bottom, the signature: "Captain Eirik, Warden of the Tide. Let my blood be the one to find it."',
    ],
  },
  alforjas: {
    id: 'alforjas', name: 'Leather Saddlebags', kind: 'key',
    desc: 'Riding saddles with reinforced saddlebags. Your horse gallops all the prouder for being properly outfitted.',
    icon: 'Backpack', stackable: false, rarity: 'rare',
  },
  estandarte_orden: {
    id: 'estandarte_orden', name: 'Banner of the Tide', kind: 'treasure',
    desc: 'The banner of the Order of the Tide, rescued from the Crow\'s brigantine. Deep blue, with the wheel of tides embroidered in silver.',
    icon: 'Flag', stackable: false, rarity: 'legendary',
  },
  reliquia_cuervo: {
    id: 'reliquia_cuervo', name: 'Obsidian Feather', kind: 'treasure',
    desc: 'A black feather, hard as iron and cold as the abyss. It falls from the sky when the Crow roars.',
    icon: 'Feather', stackable: true, rarity: 'rare',
  },
  // ---- Secret lore tablets (unlocked endings hint) ----
  tablilla_verdad: {
    id: 'tablilla_verdad', name: 'Tablet of Truth', kind: 'readable',
    desc: 'A stone tablet from the sunken sanctuary. It speaks of the Crow\'s origin and the price of the pact.',
    icon: 'BookOpen', stackable: false, rarity: 'legendary', lore: [
      '"In the beginning there were no dragons and no kings, only the tide and those who listened to it."',
      '"The Crow is not a dragon: he is the shadow of the first broken oath. Every crown that is raised feeds him."',
      '"Only one who renounces every crown will see the free sea dawn. Only one who takes up every crown can save it. And the one who restores the pact will keep it forever."',
    ],
  },
};
