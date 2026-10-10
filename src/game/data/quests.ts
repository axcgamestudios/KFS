/**
 * Quest definitions for Chapter I. Objectives resolve via flags &
 * inventory state managed by QuestSystem.
 */

export type ObjectiveType = 'talk' | 'collect' | 'interact' | 'flag';

export interface ObjectiveDef {
  id: string;
  text: string;
  type: ObjectiveType;
  /** npc id / item id / interactable id / flag name depending on type */
  target: string;
  count?: number;
}

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  /** Journal entry added when the quest starts. */
  journal: string;
  objectives: ObjectiveDef[];
  /** Granted when all objectives complete. */
  rewards: {
    xp: number;
    items?: Array<{ id: string; count: number }>;
  };
  /** Quest started automatically when this one completes. */
  nextQuest?: string;
  /** Completion journal entry. */
  completionJournal?: string;
}

export const QUESTS: Record<string, QuestDef> = {
  q1_legacy: {
    id: 'q1_legacy',
    title: 'El Legado de Eirik',
    description: 'El Maestre Aldric del puerto espera para hablar contigo sobre la herencia de tu padre.',
    journal: 'He vuelto a Puerto Cuervo tras años lejos. Dicen que Eirik, mi padre, dejó algo para mí antes de desaparecer en el mar. El Maestre Aldric guarda la respuesta en el muelle.',
    objectives: [
      { id: 'o1', text: 'Habla con el Maestre Aldric en el puerto', type: 'talk', target: 'aldric' },
    ],
    rewards: { xp: 40, items: [{ id: 'coin', count: 15 }] },
    nextQuest: 'q2_herbs',
    completionJournal: 'Aldric me contó la verdad: el cofre de mi padre permanece cerrado en el almacén portuario. Solo se abre con un amuleto de cobre… que quedó en manos de Maren, la herborista.',
  },
  q2_herbs: {
    id: 'q2_herbs',
    title: 'La Guardiana de las Hierbas',
    description: 'Maren la herborista guarda el amuleto de cobre, pero pedirá algo a cambio: tres pétalos de marfil.',
    journal: 'Maren, la herborista del pueblo, custodia el amuleto que abre el cofre de Eirik. Antes de dármelo quiere tres pétalos de marfil. Dijo que crecen junto al sendero de la cascada, al norte del pueblo, y entre las ruinas del bosque occidental.',
    objectives: [
      { id: 'o1', text: 'Busca a Maren la herborista', type: 'talk', target: 'maren' },
      { id: 'o2', text: 'Reúne 3 pétalos de marfil (0/3)', type: 'collect', target: 'petalo', count: 3 },
      { id: 'o3', text: 'Vuelve con Maren', type: 'flag', target: 'maren_herbs_done' },
    ],
    rewards: { xp: 70, items: [{ id: 'pocion', count: 2 }] },
    nextQuest: 'q3_chest',
    completionJournal: 'Maren me entregó el amuleto de cobre. Al hacerlo murmuró algo sobre «la Orden de la Marea» y miró al horizonte como si esperara ver una vela lejana. «Tu padre no era pescador», me dijo. «Era guardián.»',
  },
  q3_chest: {
    id: 'q3_chest',
    title: 'El Cofre del Capitán',
    description: 'Abre el cofre de Eirik junto al almacén del puerto con el amuleto de cobre y descubre qué dejó tu padre para ti.',
    journal: 'El amuleto de cobre abre el cofre de mi padre, guardado junto al almacén del puerto. Maren insinuó que mi familia escondía secretos. Es hora de descubrir cuáles.',
    objectives: [
      { id: 'o1', text: 'Abre el cofre de Eirik junto al almacén del puerto', type: 'interact', target: 'chest_eirik' },
      { id: 'o2', text: 'Lee la carta de tu padre', type: 'flag', target: 'read_letter' },
      { id: 'o3', text: 'Habla con Aldric sobre reparar el Colibrí de Mar', type: 'talk', target: 'aldric_ship' },
    ],
    rewards: { xp: 120, items: [{ id: 'coin', count: 40 }] },
    nextQuest: 'q4_refit',
    completionJournal: 'El cofre contenía la espada de mi padre, un mapa de los mares perdidos y una carta que lo cambia todo: los dragones, las ciudades hundidas, la Orden de la Marea… y el cuervo de tres cabezas que los persigue. El Colibrí de Mar necesita reparaciones antes de zarpar. Así comienza el Capítulo II: Los Mares Olvidados.',
  },
  q_rosa: {
    id: 'q_rosa',
    title: 'El Cargamento Perdido',
    description: 'Rosa, la tabernera, perdió un cargamento de especias en un naufragio de la costa oeste. Lo buscaría ella misma, «pero el océano es traicionero y yo sirvo más cerveza que marinos».',
    journal: 'Rosa perdió un cargamento de especias cuando una tormenta partió un mercante contra la costa oeste. Si lo recupero, promete oro y una de sus pociones de la casa.',
    objectives: [
      { id: 'o1', text: 'Encuentra el cargamento en la costa oeste', type: 'interact', target: 'crate_rosa' },
      { id: 'o2', text: 'Devuélvele el cargamento a Rosa', type: 'talk', target: 'rosa_return' },
    ],
    rewards: { xp: 60, items: [{ id: 'coin', count: 30 }, { id: 'pocion', count: 1 }] },
    completionJournal: 'Rosa recuperó sus especias y me llenó la bolsa además de la jarra. «Cualquier marino con olfato para el tesoro es amigo de esta casa», dijo. La taberna huele a canela otra vez.',
  },
  q4_refit: {
    id: 'q4_refit',
    title: 'Viento en las Velas',
    description: 'El Colibrí de Mar necesita materiales antes de volver al agua: madera de roble para el casco, lona encerada para las velas y cuerda de cáñamo para el aparejo.',
    journal: 'Bram el herrero se ha comprometido a dejar el Colibrí a punto. La lista es clara: cuatro tablones de roble (hay cajas marcadas en el muelle, en la costa del naufragio y en el sendero de la cascada), lona encerada — Rosa sabe prepararla — y cuerda de cáñamo del buenísimo de Tom. Cuando lo tengamos todo, habrá que entregarlo junto al casco del barco.',
    objectives: [
      { id: 'o1', text: 'Habla con Bram el Herrero sobre la reparación', type: 'talk', target: 'bram_refit' },
      { id: 'o2', text: 'Reúne 4 maderas de roble (0/4)', type: 'collect', target: 'madera', count: 4 },
      { id: 'o3', text: 'Consigue 3 lonas de vela (0/3)', type: 'collect', target: 'lona', count: 3 },
      { id: 'o4', text: 'Consigue 2 cuerdas de cáñamo (0/2)', type: 'collect', target: 'cuerda', count: 2 },
      { id: 'o5', text: 'Entrega los materiales junto al Colibrí de Mar', type: 'interact', target: 'colibri_refit' },
    ],
    rewards: { xp: 150, items: [{ id: 'coin', count: 25 }] },
    nextQuest: 'q5_raven',
    completionJournal: 'Bram clavó el último tablón al amanecer y el Colibrí de Mar se deslizó de nuevo a la bahía. Aldric dice que navega «como si recordara el camino». Los mares olvidados — y lo que sea que los vigila — acaban de quedarse sin un secreto más.',
  },
  q5_raven: {
    id: 'q5_raven',
    title: 'El Cuervo de Tres Cabezas',
    description: 'Zarpa hacia la Isla del Cuervo Viejo, al noroeste. La Gaviota Sangrienta de la Capitana Morwen custodia el Sello de la Orden de la Marea.',
    journal: 'Con el Colibrí a flote, el mapa de mi padre por fin tiene sentido: la Isla del Cuervo Viejo aguarda al noroestre, más allá del paso. La Capitana Morwen, corsaria del Cuervo de Tres Cabezas, guarda el Sello de la Orden. Habrá que hundirle el orgullo a bordadas... y abordar su nave cuando quede tocada.',
    objectives: [
      { id: 'o1', text: 'Navega hasta la Isla del Cuervo Viejo', type: 'flag', target: 'reached_crow' },
      { id: 'o2', text: 'Aborda la Gaviota Sangrienta y derrota a Morwen', type: 'flag', target: 'morwen_defeated' },
      { id: 'o3', text: 'Recupera el Sello de la Orden de la Marea', type: 'collect', target: 'sello', count: 1 },
    ],
    rewards: { xp: 250, items: [{ id: 'coin', count: 100 }] },
    completionJournal: 'El Sello de la Orden descansa en mi mano. Morwen se hundió con su nave jurando que el Cuervo «ya había despertado algo peor» en las cumbres. Si mi padre vivió para custodiar esto... yo viviré para averiguar qué duerme bajo las aguas. Capítulo III: el rumor de las alas.',
  },
};

/** Main quest order across chapters. */
export const MAIN_QUEST_ORDER = ['q1_legacy', 'q2_herbs', 'q3_chest', 'q4_refit', 'q5_raven'];
export const SIDE_QUESTS = ['q_rosa'];
