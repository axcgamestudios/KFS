import type { DialogueTree } from './dialogues';

/**
 * Fase 15 dialogues — the naval economy.
 *
 * ELIN (merchant): buys sea-beast trade goods and trades the rare
 * materials for supplies. BRAM (smith): forges the advanced abyssal
 * weapons and the armors (the Coraza del Rey del Mar needs the Corazón
 * de la Bestia). TOM: the hint that starts it all (the horn legend).
 */

// ---------------------------------------------------------------- ELIN

/** Erica's market hub — every service greys out until the goods are there. */
function elinHub(): DialogueTree['nodes'] {
  return {
    elin_mar_1: {
      text: 'By my grandmother\'s mermaid! Is that a serpent tentacle? And those scales… true abyssal ones! Port collectors would snatch them out of my hands, boy. Shall we deal?',
      options: [
        {
          text: 'Sell a serpent tentacle (12 coins)',
          requires: [{ id: 'tentaculo', count: 1 }],
          action: [
            { t: 'takeItem', id: 'tentaculo', count: 1 },
            { t: 'item', id: 'coin', count: 12 },
          ],
          next: 'elin_mar_sell',
        },
        {
          text: 'Sell sea-beast meat (8 coins)',
          requires: [{ id: 'carne_bestia', count: 1 }],
          action: [
            { t: 'takeItem', id: 'carne_bestia', count: 1 },
            { t: 'item', id: 'coin', count: 8 },
          ],
          next: 'elin_mar_sell',
        },
        {
          text: 'Sell an abyssal scale (90 coins)',
          requires: [{ id: 'escama_abismo', count: 1 }],
          action: [
            { t: 'takeItem', id: 'escama_abismo', count: 1 },
            { t: 'item', id: 'coin', count: 90 },
          ],
          next: 'elin_mar_sell',
        },
        {
          text: 'Sell a black pearl (130 coins)',
          requires: [{ id: 'perla_negra', count: 1 }],
          action: [
            { t: 'takeItem', id: 'perla_negra', count: 1 },
            { t: 'item', id: 'coin', count: 130 },
          ],
          next: 'elin_mar_sell',
        },
        {
          text: 'Trade a black pearl for 3 house potions',
          requires: [{ id: 'perla_negra', count: 1 }],
          action: [
            { t: 'takeItem', id: 'perla_negra', count: 1 },
            { t: 'item', id: 'pocion', count: 3 },
          ],
          next: 'elin_mar_trade',
        },
        {
          text: 'Trade 2 scales for a potion and 15 arrows',
          requires: [{ id: 'escama_abismo', count: 2 }],
          action: [
            { t: 'takeItem', id: 'escama_abismo', count: 2 },
            { t: 'item', id: 'pocion', count: 1 },
            { t: 'item', id: 'flecha', count: 15 },
          ],
          next: 'elin_mar_trade',
        },
        { text: 'Not today, Erica. Good market.', action: { t: 'close' } },
      ],
    },
    elin_mar_sell: {
      text: 'Deal done! Count on the gold. And listen… if you cross paths with a crowned serpent, check whether it carries a horn inside: those I no longer buy — that is the altar of the Navel of the Sea\'s business.',
      options: [
        { text: 'Keep dealing.', next: 'elin_mar_1' },
        { text: 'See you around.', action: { t: 'close' } },
      ],
    },
    elin_mar_trade: {
      text: 'A clean swap, no coins in between, as the coast commands. May they serve you better than whoever wore them last!',
      options: [
        { text: 'Keep dealing.', next: 'elin_mar_1' },
        { text: 'See you around.', action: { t: 'close' } },
      ],
    },
  };
}

// ---------------------------------------------------------------- BRAM

/** Bram's forge hub — advanced abyssal weapons and armors. */
function bramForge(): DialogueTree['nodes'] {
  return {
    bram_f15_1: {
      text: 'What have you brought me there?… Abyssal scales, by my father\'s anvil! This is what the steel of the true Wardens was forged from. Hand it over and you\'ll see what comes out of my forge: lances that reach across a harbor, axes that hit like a wave… and bring me a HEART of the beast, boy, and I\'ll forge you a king\'s cuirass.',
      options: [
        {
          text: 'Forge the Abyssal Lance (2 scales, 1 pearl, 60 coins)',
          requires: [
            { id: 'escama_abismo', count: 2 },
            { id: 'perla_negra', count: 1 },
            { id: 'coin', count: 60 },
          ],
          action: [
            { t: 'takeItem', id: 'escama_abismo', count: 2 },
            { t: 'takeItem', id: 'perla_negra', count: 1 },
            { t: 'takeItem', id: 'coin', count: 60 },
            { t: 'item', id: 'lanza_abismo', count: 1 },
          ],
          next: 'bram_f15_lanza',
        },
        {
          text: 'Forge the Axe of the Tides (3 scales, 90 coins)',
          requires: [
            { id: 'escama_abismo', count: 3 },
            { id: 'coin', count: 90 },
          ],
          action: [
            { t: 'takeItem', id: 'escama_abismo', count: 3 },
            { t: 'takeItem', id: 'coin', count: 90 },
            { t: 'item', id: 'hacha_mareas', count: 1 },
          ],
          next: 'bram_f15_hacha',
        },
        {
          text: 'Forge the Abyssal Cuirass (4 scales, 2 pearls, 150 coins)',
          requires: [
            { id: 'escama_abismo', count: 4 },
            { id: 'perla_negra', count: 2 },
            { id: 'coin', count: 150 },
          ],
          action: [
            { t: 'takeItem', id: 'escama_abismo', count: 4 },
            { t: 'takeItem', id: 'perla_negra', count: 2 },
            { t: 'takeItem', id: 'coin', count: 150 },
            { t: 'item', id: 'coraza_abismo', count: 1 },
          ],
          next: 'bram_f15_coraza',
        },
        {
          text: 'Forge the CUIRASS OF THE SEA KING (heart, 4 scales, 400 coins)',
          requires: [
            { id: 'corazon_bestia', count: 1 },
            { id: 'escama_abismo', count: 4 },
            { id: 'coin', count: 400 },
          ],
          action: [
            { t: 'takeItem', id: 'corazon_bestia', count: 1 },
            { t: 'takeItem', id: 'escama_abismo', count: 4 },
            { t: 'takeItem', id: 'coin', count: 400 },
            { t: 'item', id: 'coraza_rey', count: 1 },
          ],
          next: 'bram_f15_rey',
        },
        { text: 'Just admiring the forge.', action: { t: 'close' } },
      ],
    },
    bram_f15_lanza: {
      text: 'There! Abyssal Lance, pearl butt-cap and a point tempered in deep-tide water. No serpent\'s mouth will reach you before you reach it. (Equip it from the inventory, Tab.)',
      options: [
        { text: 'What else can you forge?', next: 'bram_f15_1' },
        { text: 'Thank you, Bram.', action: { t: 'close' } },
      ],
    },
    bram_f15_hacha: {
      text: 'Heavy, eh? That\'s a good thing. Axe of the Tides: three scales folded over themselves. Where it strikes, the sea remembers. (Equip it from the inventory, Tab.)',
      options: [
        { text: 'What else can you forge?', next: 'bram_f15_1' },
        { text: 'Thank you, Bram.', action: { t: 'close' } },
      ],
    },
    bram_f15_coraza: {
      text: 'Try it… there: the scales close on their own over your chest. Abyssal Cuirass: while you carry it you\'ll take a harder beating (+30 health, −15% damage). The whale leather does the rest.',
      options: [
        { text: 'What else can you forge?', next: 'bram_f15_1' },
        { text: 'Thank you, Bram.', action: { t: 'close' } },
      ],
    },
    bram_f15_rey: {
      text: '…My old friend. Three days of fire and the Heart still beats INSIDE the cuirass. Wear it, Warden: while you hold it, the whole sea fights at your side. (+60 health, +20 stamina, −30% damage.)',
      options: [
        { text: 'A king\'s work, Bram.', action: { t: 'close' } },
      ],
    },
  };
}

// ---------------------------------------------------------------- insert

const INSERTS: Record<string, DialogueTree[]> = {
  // Erica: one tree per sea good (whichever the player carries opens the hub)
  elin: [
    {
      requireItem: { id: 'perla_negra', count: 1 },
      start: 'elin_mar_1',
      nodes: elinHub(),
    },
    {
      requireItem: { id: 'escama_abismo', count: 1 },
      start: 'elin_mar_1',
      nodes: elinHub(),
    },
    {
      requireItem: { id: 'tentaculo', count: 1 },
      start: 'elin_mar_1',
      nodes: elinHub(),
    },
    {
      requireItem: { id: 'carne_bestia', count: 1 },
      start: 'elin_mar_1',
      nodes: elinHub(),
    },
  ],
  // Bram: the abyssal forge (one tree per material, shared hub)
  bram: [
    {
      requireItem: { id: 'corazon_bestia', count: 1 },
      start: 'bram_f15_1',
      nodes: bramForge(),
    },
    {
      requireItem: { id: 'perla_negra', count: 1 },
      start: 'bram_f15_1',
      nodes: bramForge(),
    },
    {
      requireItem: { id: 'escama_abismo', count: 1 },
      start: 'bram_f15_1',
      nodes: bramForge(),
    },
  ],
  // Tom: the legend that starts the hunt (after the ship is repaired)
  tom: [
    {
      cond: 'ship_repaired',
      notCond: 'tom_naval_talked',
      start: 'tom_f15_1',
      nodes: {
        tom_f15_1: {
          text: 'Ah, you\'ll truly set sail! Then listen to an old fisherman: when you sail the open sea, watch out for the tide serpents. They give good loot — meat, tentacle, scales, even black pearls if the tide is generous. But if one carries a HORN inside… keep it. That is not for selling.',
          options: [
            { text: 'Why isn\'t a horn for selling?', next: 'tom_f15_2' },
            { text: 'Serpents… in the open ocean?', next: 'tom_f15_2b' },
          ],
        },
        tom_f15_2: {
          text: 'Because horns are not loot, boy: they are KEYS. The dead cartographers marked an island at the ocean\'s exact center — "the navel of the sea," they called it. A circle of monoliths and an altar shaped like a horn. Sound one there… and the King of the Sea answers. You\'ll need level 6, and plenty of nerve.',
          options: [
            { text: 'The King of the Sea?', next: 'tom_f15_3' },
          ],
        },
        tom_f15_2b: {
          text: 'Only under sail, boy. Ashore not even the fish stir. But in deep waters… the tide brings hunger. And sometimes, every five minutes of steady sailing, bad luck brings PIRATES. With cannons. If they best you, negotiate what you can: your gold or your cargo. Nobody ever died of embarrassment.',
          options: [
            { text: 'And what about the horn?', next: 'tom_f15_2' },
          ],
        },
        tom_f15_3: {
          text: 'The biggest beast ever to swim beneath these skies. Bigger than the dragons, yes sir. Those who saw it and came back told nothing: they just showed the holes in the hull. They say a sword of kings falls from it… once in every ten. Good luck with that.',
          options: [
            {
              text: 'I\'ll be careful. Thanks, Tom.',
              action: [
                { t: 'flag', flag: 'tom_naval_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],
};

/** Applied by dialogues.ts once DIALOGUES is built (no circular import). */
export function applyF15Dialogues(
  DIALOGUES: Record<string, import('./dialogues').NPCDialogue>,
): void {
  for (const [npcId, trees] of Object.entries(INSERTS)) {
    const npc = DIALOGUES[npcId];
    if (npc) {
      npc.trees.unshift(...trees);
    }
  }
}