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
    journal: 'Maren, la herborista del pueblo, custodia el amuleto que abre el cofre de Eirik. Antes de dármelo quiere tres pétalos de marfil. Brotan por todas partes alrededor del pueblo: junto a la plaza, en el prado norte y a la orilla del camino al muelle.',
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
    nextQuest: 'q6_alas',
    completionJournal: 'El Sello de la Orden descansa en mi mano. Morwen se hundió con su nave jurando que el Cuervo «ya había despertado algo peor» en las cumbres. Si mi padre vivió para custodiar esto... yo viviré para averiguar qué duerme bajo las aguas. Capítulo III: el rumor de las alas.',
  },
  q6_alas: {
    id: 'q6_alas',
    title: 'El Rumor de las Alas',
    description: 'Los pastores ven sombras aladas sobre las Garrahielo y los guardias hablan de ruinas que «respiran». Aldric debe saber qué está despertando.',
    journal: 'Morwen se hundió jurando que el Cuervo despertó «algo peor». Los pastores ven sombras sobre las cumbres y en Puerto Cuervo nadie duerme. Aldric guardó los archivos de la Orden: es hora de que los abra.',
    objectives: [
      { id: 'o1', text: 'Habla con Aldric sobre las sombras aladas', type: 'talk', target: 'aldric_dragons' },
      { id: 'o2', text: 'Investiga las ruinas de Vaelthara', type: 'flag', target: 'vaelthara_seen' },
      { id: 'o3', text: 'Vuelve con Aldric y cuenta lo que viste', type: 'talk', target: 'aldric_report' },
    ],
    rewards: { xp: 180, items: [{ id: 'hacha_orden', count: 1 }, { id: 'pocion', count: 2 }] },
    nextQuest: 'q7_guardiana',
    completionJournal: 'Aldric abrió la vieja armería de la Orden y me puso el Hacha de la Orden en las manos. «Los dragones no son lo que dicen las canciones», repitió. La guardiana de Vaelthara no despertó por casualidad: algo la llamó desde las cumbres.',
  },
  q7_guardiana: {
    id: 'q7_guardiana',
    title: 'La Guardiana de Vaelthara',
    description: 'Un dragón territorial custodia las ruinas de Vaelthara. Derrotarla será el primer acero verdadero contra los cielos de Eldoria.',
    journal: 'La guardiana de Vaelthara me ha visto — y yo a ella. Es territorial, pesada, escupidora de fuego: se yergue sobre las columnas como si aún custodiara a su ciudad muerta. Aldric dice que Bram podrá forjar algo con sus escamas... si sobrevivo.',
    objectives: [
      { id: 'o1', text: 'Derrota a la Guardiana de Vaelthara', type: 'flag', target: 'vaelthara_dead' },
    ],
    rewards: { xp: 300, items: [{ id: 'escudo_marea', count: 1 }, { id: 'escama', count: 2 }] },
    nextQuest: 'q8_skarnvind',
    completionJournal: 'La guardiana cayó sobre las columnas que juró proteger. De su pecho extraje el Corazón de Marea, un rubí que late con las olas. Bram ya está forjando un escudo con sus escamas. «Donde late la guardiana, duerme el ancestro», decía la inscripción. Dormir... por ahora.',
  },
  q8_skarnvind: {
    id: 'q8_skarnvind',
    title: 'Alas sobre el Mar',
    description: 'Un wyvern caza las aguas entre Puerto Cuervo y las Islas de la Bruma. Zarpa hacia el sur y enfréntalo con los cañones del Colibrí.',
    journal: 'Los pescadores ya no salen al sur: «una vela con garras» ronda el paso hacia las Islas de la Bruma. Aldric asegura que es Skarnvind, el wyvern de las brumas. Solo hay una forma de cruzar esas aguas: con los cañones del Colibrí cargados y los nervios templados.',
    objectives: [
      { id: 'o1', text: 'Zarpa hacia las aguas de caza, al sur de la bahía', type: 'flag', target: 'skarnvind_seen' },
      { id: 'o2', text: 'Derrota a Skarnvind con las bordadas del Colibrí', type: 'flag', target: 'skarnvind_dead' },
    ],
    rewards: { xp: 320, items: [{ id: 'coin', count: 120 }, { id: 'flecha', count: 10 }] },
    nextQuest: 'q9_ancestro',
    completionJournal: 'Skarnvind cayó al mar con un estruendo de trueno y sal. De sus garras guardo la mayor: Aldric jura que encaja en el cerradero del Nido de Garrahielo. El paso al sur vuelve a estar libre... y el norte espera.',
  },
  q9_ancestro: {
    id: 'q9_ancestro',
    title: 'El Ancestro de Garrahielo',
    description: 'Con la Garra de Skarnvind y el Corazón de Marea, el Nido del Ancestro se abrirá. Las cumbres de Garrahielo guardan al dragón que firmó el pacto antiguo.',
    journal: 'Todo conduce a las cumbres: la carta de mi padre, el sello, el Corazón de Marea, la garra del wyvern. En lo alto de Garrahielo duerme el Ancestro, el dragón que firmó el pacto con los reyes hundidos. La Orden de la Marea vuelve a tener un Guardián. Voy a necesitarlo.',
    objectives: [
      { id: 'o1', text: 'Sube al Nido del Ancestro en las cumbres de Garrahielo', type: 'flag', target: 'ancestro_seen' },
      { id: 'o2', text: 'Derrota al Ancestro de Garrahielo', type: 'flag', target: 'ancestro_dead' },
    ],
    rewards: { xp: 600, items: [{ id: 'coin', count: 250 }] },
    nextQuest: 'q10_orden',
    completionJournal: 'El Ancestro de Garrahielo ha caído. Del pacto antiguo quedan un colmillo, un sello y un Guardián joven con un barco reparado. «Los dragones no son lo que dicen las canciones», escribía mi padre. Ahora lo sé: son exactamente lo que las canciones no se atreven a contar. FIN DEL CAPÍTULO III — El Rumor de las Alas.',
  },
};

/** Main quest order across chapters. */
export const MAIN_QUEST_ORDER = [
  'q1_legacy', 'q2_herbs', 'q3_chest', 'q4_refit', 'q5_raven',
  'q6_alas', 'q7_guardiana', 'q8_skarnvind', 'q9_ancestro',
  'q10_orden', 'q11_estandarte', 'q12_acero',
  'q13_despertar', 'q14_consejo', 'q15_destino',
];
export const SIDE_QUESTS = [
  'q_rosa', 'sq_raciones', 'sq_yunque', 'sq_espejo', 'sq_fuegos', 'sq_petalo_tumba',
  'sq_caravana', 'sq_caballos', 'sq_cascada', 'sq_cartas', 'sq_bounty', 'sq_moneda',
  'sq_tesoro', 'sq_vela', 'sq_guardianes', 'sq_arce', 'sq_cazatormentas',
  'sq_estandarte', 'sq_lamento', 'sq_vigia', 'sq_comercio',
];

// ---- Fase 4 quests (Chapters IV-V + secondary campaign) ----
import { QUESTS_F4 } from './questsF4';
Object.assign(QUESTS, QUESTS_F4);
