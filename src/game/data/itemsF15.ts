import type { ItemDef } from './items';

/**
 * Fase 15 items — sea beasts, the Sea King and the naval economy.
 *
 * Trade goods (sell for coins), rare materials with THREE uses (sell high,
 * trade with Elin, craft with Bram), the Sea King's summon horn and his
 * loot table (Espada Soberana 10% / Corazón de la Bestia 5%), plus the
 * crafted advanced weapons and armors.
 */
export const ITEMS_F15: Record<string, ItemDef> = {
  // ---- Common sea-beast trade goods ----
  tentaculo: {
    id: 'tentaculo', name: 'Serpent Tentacle', kind: 'material',
    desc: 'Fibrous flesh from a tide serpent, cured in salt. Elin pays 12 coins for it… or keep it: the fishermen stew it with garlic.',
    icon: 'Waves', stackable: true, rarity: 'common',
  },
  carne_bestia: {
    id: 'carne_bestia', name: 'Sea-Beast Meat', kind: 'consumable',
    desc: 'A dense, dark cut from the loin of an abyssal beast. Restores 25 health… if your stomach can take it.',
    icon: 'Drumstick', stackable: true, usable: true,
  },
  // ---- Rare materials: sell high · trade with Elin · craft with Bram ----
  escama_abismo: {
    id: 'escama_abismo', name: 'Abyssal Scale', kind: 'material',
    desc: 'Scale from an adult tide serpent: black with turquoise sheen, hard as tempered steel. Worth 90 coins in port, tradeable with Elin… and Bram can forge advanced weapons and cuirasses from it.',
    icon: 'Shell', stackable: true, rarity: 'rare',
    lore: [
      'Turned against the light, the scale shows growth rings: one for every winter the beast spent in the deep.',
      'The armorers of the Order of the Tide paid a fortune for sacks of these. "The abyss tempers differently," they said.',
      'Bram (the forge) and Elin (the market) know what to do with them.',
    ],
  },
  perla_negra: {
    id: 'perla_negra', name: 'Black Pearl', kind: 'treasure',
    desc: 'Born in the jaws of a tide serpent. Collectors pay 130 coins; Elin trades supplies for it, and Bram uses it to temper abyssal steel.',
    icon: 'Gem', stackable: true, rarity: 'rare',
    lore: [
      'The pearl does not reflect light: it drinks it. Looking at it up close is like leaning over a bottomless well.',
      'The sunken kings of Thalassar paid ten ships for a single one. The pirates, it seems, keep the fashion.',
      'Sell it (130), trade it with Elin or take it to Bram\'s forge: three roads, and all of them pay.',
    ],
  },
  // ---- The Sea King summon horn ----
  cuerno_marea: {
    id: 'cuerno_marea', name: 'Tide Horn', kind: 'key',
    desc: 'Horn from a crowned serpent, torn away in combat. It answers in only one place: the altar of the Navel of the Sea, at the ocean\'s exact center. Requires level 6 to make yourself heard.',
    icon: 'Wind', stackable: true, rarity: 'rare',
    lore: [
      'Held to the ear, it sounds of distant breakers… and of something enormous breathing underneath.',
      'The dead cartographers called that island "the navel of the sea": where the ocean listens, and answers.',
      'Sounding it consumes the horn. The King of the Sea does not answer a second call.',
    ],
  },
  // ---- Sea King loot table ----
  espada_soberana: {
    id: 'espada_soberana', name: 'Sovereign Sword', kind: 'weapon',
    desc: 'Steel of the sunken kings, torn from the King of the Sea (1 in every 10 defeats). The blade runs like the tide and cuts like its wrath: the deadliest one-handed weapon of the forgotten seas.',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  corazon_bestia: {
    id: 'corazon_bestia', name: 'Heart of the Beast', kind: 'key',
    desc: 'Torn from the chest of the King of the Sea (rarer than the Sovereign Sword). It beats once for every wave in the world. Bram can forge the Cuirass of the Sea King with it — the legendary armor.',
    icon: 'Heart', stackable: false, rarity: 'legendary',
    lore: [
      'It is warm, and beats slowly: once for every wave that breaks on any shore in the world.',
      'Whoever holds it too long swears they hear, inside, the echo of a throne sinking.',
      'Take it to Bram\'s forge with abyssal scales and gold: the Cuirass of the Sea King awaits.',
    ],
  },
  // ---- Crafted advanced weapons (Bram) ----
  lanza_abismo: {
    id: 'lanza_abismo', name: 'Abyssal Lance', kind: 'weapon',
    desc: 'Forged by Bram from abyssal scales with a black pearl set in the butt-cap. The longest harpoon strike in Eldoria: it keeps the jaws at bay… and returns the favor.',
    icon: 'Navigation', stackable: false, equipable: true, rarity: 'rare',
  },
  hacha_mareas: {
    id: 'hacha_mareas', name: 'Axe of the Tides', kind: 'weapon',
    desc: 'A broadside mace made weapon: Bram forged it from three abyssal scales. Every blow lands like a wave against the hull.',
    icon: 'Axe', stackable: false, equipable: true, rarity: 'rare',
  },
  // ---- Crafted armors (Bram) — passive while carried ----
  coraza_abismo: {
    id: 'coraza_abismo', name: 'Abyssal Cuirass', kind: 'treasure',
    desc: 'A breastplate of abyssal scales riveted in whale leather. Passive effect while you carry it: +30 max health and 15% less damage taken.',
    icon: 'Shield', stackable: false, rarity: 'rare',
  },
  coraza_rey: {
    id: 'coraza_rey', name: 'Cuirass of the Sea King', kind: 'treasure',
    desc: 'The legendary armor: the Heart of the Beast beats in its chest of crowned scales. Passive effect while you carry it: +60 max health, +20 stamina and 30% less damage taken.',
    icon: 'ShieldCheck', stackable: false, rarity: 'legendary',
    lore: [
      'No one puts it on: the sea grants it. The scales close on their own around your chest at the first blow.',
      'With the Heart of the Beast beating inside, the cuirass breathes with you. Sharks mistake you for something that gives orders.',
      'Forged by Bram: 1 Heart of the Beast, 4 abyssal scales and 400 gold coins.',
    ],
  },
};
