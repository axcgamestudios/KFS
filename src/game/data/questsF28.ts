/**
 * Fase 28 — POCIONES & EL VIAJERO: the two side quests.
 *
 *  · SQ_ALQUIMIA (Maren) — prove the new distillation table: marsh muck,
 *    common jelly, and the first honest boil. The 'flag' objective
 *    (primera_pocion) is set by AlchemySystem on the first successful craft.
 *  · SQ_VIAJERO (Tom) — put a face to the sack: find the wandering merchant
 *    at one of his three camps (the tracker marker rides the NPC, wherever
 *    the day put him).
 */
import type { QuestDef } from './quests';

export const QUESTS_F28: Record<string, QuestDef> = {
  sq_alquimia: {
    id: 'sq_alquimia',
    title: "The Herbalist's Table",
    description:
      "Maren has raised a distillation table by her garden, west of the green. She wants the first brew proven: marsh muck from the grimpotes, common jelly from the slimes, and one honest boil.",
    journal:
      "Maren's new table hums between the herb rows. She asks for three clots of Lodo Viscoso from the grimpotes of the manglares and two measures of Gelatina Básica from the common slimes — then any potion boiled clean at the table. The brew itself is hers; the drinking is mine.",
    objectives: [
      { id: 'o1', text: 'Collect Lodo Viscoso (0/3)', type: 'collect', target: 'lodo_viscoso', count: 3 },
      { id: 'o2', text: 'Collect Gelatina Básica (0/2)', type: 'collect', target: 'gelatina_basica', count: 2 },
      { id: 'o3', text: 'Brew any potion at the Mesa de Alquimia', type: 'flag', target: 'primera_pocion' },
    ],
    rewards: {
      xp: 120,
      items: [
        { id: 'coin', count: 60 },
        { id: 'pocion_curacion_menor', count: 2 },
        { id: 'polvo_estelar', count: 1 },
      ],
    },
    completionJournal:
      'The table is proven. Maren pays in coin, two of her own brews and a pinch of stardust "for the strong ones, when you find them". The manglares will never be just a swamp again.',
  },
  sq_viajero: {
    id: 'sq_viajero',
    title: 'The Third-Day Man',
    description:
      "Tom says a wandering merchant walks the island anti-clockwise — one day at each of three camps, then the next. Someone should put a face to the sack.",
    journal:
      "Tom saw his smoke at dawn from the pier: a traveller with a merchant's sack who walks the old trade circuit — the castle crossing, the wreck coast, the sanctuary stones. One day at each, three days the round. The fisherman wants his regards carried; the road wants walking.",
    objectives: [
      { id: 'o1', text: 'Find El Viajero at one of his camps', type: 'talk', target: 'viajero' },
    ],
    rewards: {
      xp: 100,
      items: [
        { id: 'coin', count: 60 },
        { id: 'te_errante', count: 2 },
      ],
    },
    completionJournal:
      'Found at the fire, sack at his feet. The regards were carried; the tea was his payment and his thanks. He will be somewhere else tomorrow — that is the whole point of him.',
  },
};
