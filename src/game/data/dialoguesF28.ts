/**
 * Fase 28 — POCIONES & EL VIAJERO: the dialogue graft.
 *
 *  · EL VIAJERO — new NPC (intro + repeat trees, his wares and his
 *    buyers' list, the route explained, Tom's regards carried).
 *  · MAREN — the distillation table intro + the sq_alquimia offer.
 *  · TOM — the sq_viajero offer (put a face to the sack).
 *
 * Grafted with the F4/F15 pattern: unshift puts these FIRST so they win
 * over the base trees while their cond holds; every exit sets the seen
 * flag so the base trees come back.
 */
import type { NPCDialogue } from './dialogues';

// ---------------------------------------------------------------- EL VIAJERO

const VIAJERO_INTRO: NPCDialogue['trees'][number] = {
  notCond: 'viajero_met', start: 'v1',
  nodes: {
    v1: {
      text:
        'You walk like someone the road has not broken yet — good. Sit if you like; the fire is small but it is honest, like my prices. They call me the Traveller. The name walked here before I did.',
      options: [
        { text: 'What do you carry in the sack?', next: 'v4' },
        { text: 'What do you buy out here?', next: 'v5' },
        { text: 'Where will you be tomorrow?', next: 'v2' },
        { text: 'Tom the fisherman sends his regards.', next: 'v3' },
        { text: 'Another day, traveller.', action: { t: 'flag', flag: 'viajero_met' } },
      ],
    },
    v2: {
      text:
        'The old trade circuit, anti-clockwise as the gulls fly it: the castle crossing one day, the wreck coast the next, the sanctuary stones the third. Then the round again. My camps stay where I leave them — you will learn the route by finding the fires cold.',
      options: [
        { text: 'Show me the wares.', action: { t: 'shop', vendor: 'viajero' } },
        { text: 'What do you buy, then?', action: { t: 'shop', vendor: 'viajero', tab: 'sells' } },
        { text: 'Enough for now.', action: { t: 'flag', flag: 'viajero_met' } },
      ],
    },
    v3: {
      text:
        'The fisherman! Last time he traded me a knife for a story, and I still owe him the story. Tell him the kelp is coming — he will know what it means. And take this: the first cup of the day is free. The second costs what the road costs.',
      options: [
        {
          text: 'I will carry it.',
          action: [{ t: 'talk', target: 'viajero' }, { t: 'flag', flag: 'viajero_met' }, { t: 'close' }],
        },
        { text: '(Say nothing and leave.)', action: { t: 'flag', flag: 'viajero_met' } },
      ],
    },
    v4: {
      text:
        'Stardust for the alembics that deserve it, tea for the road, and the two things everyone needs eventually: something to stop the bleeding, and something to make the bleeding someone else\'s.',
      options: [
        { text: 'Let me see it all.', action: { t: 'shop', vendor: 'viajero' } },
        { text: 'And what do you buy?', action: { t: 'shop', vendor: 'viajero', tab: 'sells' } },
        { text: 'Where tomorrow, you said?', next: 'v2' },
        { text: 'Another day, traveller.', action: { t: 'flag', flag: 'viajero_met' } },
      ],
    },
    v5: {
      text:
        'Everything the island coughs up and cannot use: gilded scrap, drowned saints\' idols, crystallized jelly cut like a crown. The coastal folk call it treasure. I call it stock. I pay honest coin and I never ask where the cough came from.',
      options: [
        { text: 'Show me your list.', action: { t: 'shop', vendor: 'viajero', tab: 'sells' } },
        { text: 'Your wares, rather.', action: { t: 'shop', vendor: 'viajero' } },
        { text: 'Another day, traveller.', action: { t: 'flag', flag: 'viajero_met' } },
      ],
    },
  },
};

const VIAJERO_REPEAT: NPCDialogue['trees'][number] = {
  cond: 'viajero_met', start: 'w1',
  nodes: {
    w1: {
      text:
        'Back to my fire. The road teaches exactly one lesson worth keeping: everything weighs something. So — what can I take off your back, or put on it?',
      options: [
        { text: 'The wares.', action: { t: 'shop', vendor: 'viajero' } },
        { text: 'The buyers\' list.', action: { t: 'shop', vendor: 'viajero', tab: 'sells' } },
        { text: 'The route again?', next: 'w2' },
        { text: 'Tom still waits on that story.', next: 'w3' },
        { text: 'Safe roads, traveller.', action: { t: 'close' } },
      ],
    },
    w2: {
      text: 'Castle crossing, wreck coast, sanctuary stones. Three days, three fires, one round — the island is smaller than the people on it.',
      options: [
        { text: 'The wares.', action: { t: 'shop', vendor: 'viajero' } },
        { text: 'Understood. Safe roads.', action: { t: 'close' } },
      ],
    },
    w3: {
      text:
        'Tell him the kelp is coming, and that the tea travels better than the stories. He will laugh. That is the whole trick of him.',
      options: [
        { text: 'I will. Safe roads.', action: { t: 'close' } },
      ],
    },
  },
};

// ---------------------------------------------------------------- MAREN — the table

const MAREN_MESA: NPCDialogue['trees'][number] = {
  notCond: 'alquimia_met', start: 'm1',
  nodes: {
    m1: {
      text:
        'You\'ll have seen the table steaming past the herb rows — I finally saved enough brass for a proper alembic. Jelly and muck, boiled clean: that is half of all healing. The other half is not drinking the failures.',
      options: [
        { text: 'What cooks up there?', next: 'm2' },
        { text: 'Do you need anything for it?', next: 'm3' },
        { text: 'I only came for the smell.', action: { t: 'flag', flag: 'alquimia_met' } },
      ],
    },
    m2: {
      text:
        'The minor mends first: jelly from the common slimes, muck from the grimpotes\' marsh — two of one and one of the other, and the table does the rest. A living core steadies the strong ones, and elemental jelly remembers fire or venom for the edge oils. For the strongest, they say the sky sifts stardust between two midnights. The Traveller sells it. He would.',
      options: [
        { text: 'And did you need anything?', next: 'm3' },
        { text: 'Understood, herborist.', action: { t: 'flag', flag: 'alquimia_met' } },
      ],
    },
    m3: {
      text:
        'As it happens — yes. Bring me three clots of Lodo Viscoso from the manglares and two measures of Gelatina Básica from the slimes, and put the table to the test: any brew you like, boiled clean. If the brass was worth it, you will know before I do.',
      options: [
        {
          text: 'Trato hecho.',
          action: [{ t: 'quest', id: 'sq_alquimia' }, { t: 'flag', flag: 'alquimia_met' }, { t: 'close' }],
        },
        { text: 'Another day, herborist.', action: { t: 'flag', flag: 'alquimia_met' } },
      ],
    },
  },
};

// ---------------------------------------------------------------- TOM — the offer

const TOM_VIAJERO: NPCDialogue['trees'][number] = {
  notCond: 'tom_viajero_gave', start: 't1',
  nodes: {
    t1: {
      text:
        'You\'ve an ear? Good. There is a man on this island I have seen thirty times and never once up close — the traveller. His smoke at dawn, moving anti-clockwise round the coast like a slow clock. Castle crossing, wreck coast, the sanctuary stones.',
      options: [
        { text: 'A merchant?', next: 't2' },
        { text: 'I have met him already.', next: 't3' },
        { text: 'The nets need me.', action: { t: 'close' } },
      ],
    },
    t2: {
      text:
        'Half merchant, half road. They say everything on his back is for sale, including the back. If you cross his fire, carry my regards — and ask him about the kelp. He will know what it means, or he will pretend to, which is the same thing with him.',
      options: [
        {
          text: 'I will find him.',
          action: [{ t: 'quest', id: 'sq_viajero' }, { t: 'flag', flag: 'tom_viajero_gave' }, { t: 'close' }],
        },
        { text: 'Another day, maybe.', action: { t: 'close' } },
      ],
    },
    t3: {
      text:
        'Then you know the tea. Next time, carry my regards and ask about the kelp. He will laugh. That is the whole trick of him.',
      options: [
        {
          text: 'I will find him again.',
          action: [{ t: 'quest', id: 'sq_viajero' }, { t: 'flag', flag: 'tom_viajero_gave' }, { t: 'close' }],
        },
        { text: 'Another day, maybe.', action: { t: 'close' } },
      ],
    },
  },
};

// ---------------------------------------------------------------- the graft

export function applyF28Dialogues(D: Record<string, NPCDialogue>): void {
  // EL VIAJERO — the wanderer himself
  D['viajero'] = {
    npcId: 'viajero',
    name: 'El Viajero',
    trees: [VIAJERO_INTRO, VIAJERO_REPEAT],
  };
  // MAREN — the alchemy table intro (first: wins while unseen)
  if (D['maren']) D['maren'].trees.unshift(MAREN_MESA);
  // TOM — the traveller's regards (first: wins until taken)
  if (D['tom']) D['tom'].trees.unshift(TOM_VIAJERO);
}
