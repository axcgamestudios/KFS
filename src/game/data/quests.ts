/**
 * Quest definitions for Chapter I. Objectives resolve via flags &
 * inventory state managed by QuestSystem.
 */

export type ObjectiveType = 'talk' | 'collect' | 'interact' | 'flag' | 'kill';

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
    title: 'The Legacy of Eirik',
    description: 'Master Aldric waits at the harbor to speak with you about your father\'s inheritance.',
    journal: 'I have come back to Crowhaven after years away. They say Eirik, my father, left something for me before he vanished into the sea. Master Aldric keeps the answer at the docks.',
    objectives: [
      { id: 'o1', text: 'Speak with Master Aldric at the harbor', type: 'talk', target: 'aldric' },
    ],
    rewards: { xp: 40, items: [{ id: 'coin', count: 15 }] },
    nextQuest: 'q2_herbs',
    completionJournal: 'Aldric told me the truth: my father\'s chest still sits locked in the harbor warehouse. It opens only with a copper amulet… one that ended up in the hands of Maren, the herbalist.',
  },
  q2_herbs: {
    id: 'q2_herbs',
    title: 'The Warden of Herbs',
    description: 'Maren the herbalist keeps the copper amulet, but she will ask something in return: three ivory petals.',
    journal: 'Maren, the village herbalist, keeps the amulet that opens Eirik\'s chest. Before she gives it up, she wants three ivory petals. They bloom all around the village: beside the square, in the north meadow, and along the path to the docks.',
    objectives: [
      { id: 'o1', text: 'Find Maren the herbalist', type: 'talk', target: 'maren' },
      { id: 'o2', text: 'Gather 3 ivory petals (0/3)', type: 'collect', target: 'petalo', count: 3 },
      { id: 'o3', text: 'Return to Maren', type: 'flag', target: 'maren_herbs_done' },
    ],
    rewards: { xp: 70, items: [{ id: 'pocion', count: 2 }] },
    nextQuest: 'q3_chest',
    completionJournal: 'Maren handed me the copper amulet. As she did, she murmured something about "the Order of the Tide" and gazed at the horizon as if expecting a distant sail. "Your father was no fisherman," she told me. "He was a Warden."',
  },
  q3_chest: {
    id: 'q3_chest',
    title: 'The Captain\'s Chest',
    description: 'Open Eirik\'s chest beside the harbor warehouse with the copper amulet and discover what your father left for you.',
    journal: 'The copper amulet opens my father\'s chest, kept beside the harbor warehouse. Maren hinted that my family was hiding secrets. It is time to learn which.',
    objectives: [
      { id: 'o1', text: 'Open Eirik\'s chest beside the harbor warehouse', type: 'interact', target: 'chest_eirik' },
      { id: 'o2', text: 'Read your father\'s letter', type: 'flag', target: 'read_letter' },
      { id: 'o3', text: 'Talk to Aldric about repairing the Sea Hummingbird', type: 'talk', target: 'aldric_ship' },
    ],
    rewards: { xp: 120, items: [{ id: 'coin', count: 40 }] },
    nextQuest: 'q4_refit',
    completionJournal: 'The chest held my father\'s sword, a map of the lost seas, and a letter that changes everything: the dragons, the sunken cities, the Order of the Tide… and the three-headed crow that hunts them all. The Sea Hummingbird needs repairs before she can sail. So begins Chapter II: The Forgotten Seas.',
  },
  q_rosa: {
    id: 'q_rosa',
    title: 'The Lost Shipment',
    description: 'Rosa, the tavern keeper, lost a shipment of spices in a wreck off the west coast. She would search for it herself, "but the ocean is treacherous, and I pour more ale than sailors."',
    journal: 'Rosa lost a cargo of spices when a storm broke a merchantman against the west coast. If I recover it, she promises gold and one of her house-brewed potions.',
    objectives: [
      { id: 'o1', text: 'Find the shipment on the west coast', type: 'interact', target: 'crate_rosa' },
      { id: 'o2', text: 'Return the shipment to Rosa', type: 'talk', target: 'rosa_return' },
    ],
    rewards: { xp: 60, items: [{ id: 'coin', count: 30 }, { id: 'pocion', count: 1 }] },
    completionJournal: 'Rosa got her spices back and filled my purse along with my tankard. "Any sailor with a nose for treasure is a friend of this house," she said. The tavern smells of cinnamon again.',
  },
  q4_refit: {
    id: 'q4_refit',
    title: 'Wind in the Sails',
    description: 'The Sea Hummingbird needs materials before she can return to the water: oak timber for the hull, waxed canvas for the sails, and hemp rope for the rigging.',
    journal: 'Bram the Smith has pledged to make the Sea Hummingbird seaworthy again. The list is clear: four oak planks (marked crates wait at the docks, on the wreck coast, and along the waterfall trail), waxed canvas — Rosa knows how to prepare it — and hemp rope from good old Tom. Once we have it all, it must be delivered beside the ship\'s hull.',
    objectives: [
      { id: 'o1', text: 'Talk to Bram the Smith about the repairs', type: 'talk', target: 'bram_refit' },
      { id: 'o2', text: 'Gather 4 oak planks (0/4)', type: 'collect', target: 'madera', count: 4 },
      { id: 'o3', text: 'Get 3 sailcloth (0/3)', type: 'collect', target: 'lona', count: 3 },
      { id: 'o4', text: 'Get 2 hemp ropes (0/2)', type: 'collect', target: 'cuerda', count: 2 },
      { id: 'o5', text: 'Deliver the materials beside the Sea Hummingbird', type: 'interact', target: 'colibri_refit' },
    ],
    rewards: { xp: 150, items: [{ id: 'coin', count: 25 }] },
    nextQuest: 'q5_raven',
    completionJournal: 'Bram nailed down the last plank at dawn, and the Sea Hummingbird slid back into the bay. Aldric says she sails "as if she remembers the way." The forgotten seas — and whatever it is that watches them — have just lost one more secret.',
  },
  q5_raven: {
    id: 'q5_raven',
    title: 'The Three-Headed Crow',
    description: 'Set sail for Old Crow Isle, to the northwest. Captain Morwen\'s Bloody Gull holds the Seal of the Order of the Tide.',
    journal: 'With the Sea Hummingbird afloat, my father\'s map finally makes sense: Old Crow Isle waits to the northwest, beyond the passage. Captain Morwen, corsair of the Three-Headed Crow, keeps the Seal of the Order. Her pride will have to be sunk by broadsides... then her ship boarded once she is taking on water.',
    objectives: [
      { id: 'o1', text: 'Sail to Old Crow Isle', type: 'flag', target: 'reached_crow' },
      { id: 'o2', text: 'Board the Bloody Gull and defeat Morwen', type: 'flag', target: 'morwen_defeated' },
      { id: 'o3', text: 'Recover the Seal of the Order of the Tide', type: 'collect', target: 'sello', count: 1 },
    ],
    rewards: { xp: 250, items: [{ id: 'coin', count: 100 }] },
    nextQuest: 'q6_alas',
    completionJournal: 'The Seal of the Order rests in my hand. Morwen went down with her ship, swearing that the Crow had "already woken something worse" among the peaks. If my father lived long enough to guard this... I will live long enough to learn what sleeps beneath the waters. Chapter III: The Whisper of Wings.',
  },
  q6_alas: {
    id: 'q6_alas',
    title: 'The Whisper of Wings',
    description: 'Shepherds see winged shadows over the Iceclaw Peaks, and the guards speak of ruins that "breathe." Aldric must know what is waking.',
    journal: 'Morwen went down swearing the Crow woke "something worse." Shepherds see shadows over the peaks, and in Crowhaven no one sleeps. Aldric kept the Order\'s archives: it is time he opened them.',
    objectives: [
      { id: 'o1', text: 'Talk to Aldric about the winged shadows', type: 'talk', target: 'aldric_dragons' },
      { id: 'o2', text: 'Investigate the ruins of Vaelthara', type: 'flag', target: 'vaelthara_seen' },
      { id: 'o3', text: 'Return to Aldric and tell him what you saw', type: 'talk', target: 'aldric_report' },
    ],
    rewards: { xp: 180, items: [{ id: 'hacha_orden', count: 1 }, { id: 'pocion', count: 2 }] },
    nextQuest: 'q7_guardiana',
    completionJournal: 'Aldric opened the Order\'s old armory and placed the Axe of the Order in my hands. "Dragons are not what the songs say," he repeated. The warden of Vaelthara did not wake by chance: something called to her from the peaks.',
  },
  q7_guardiana: {
    id: 'q7_guardiana',
    title: 'The Warden of Vaelthara',
    description: 'A territorial dragon holds the ruins of Vaelthara. Slaying her will be the first true steel raised against the skies of Eldoria.',
    journal: 'The warden of Vaelthara has seen me — and I have seen her. Territorial, massive, fire-spitting: she rears up over the columns as if she still kept watch over her dead city. Aldric says Bram can forge something from her scales... if I survive.',
    objectives: [
      { id: 'o1', text: 'Defeat the Warden of Vaelthara', type: 'flag', target: 'vaelthara_dead' },
    ],
    rewards: { xp: 300, items: [{ id: 'escudo_marea', count: 1 }, { id: 'escama', count: 2 }] },
    nextQuest: 'q8_skarnvind',
    completionJournal: 'The warden fell across the columns she had sworn to protect. From her breast I drew the Heart of the Tide, a ruby that beats with the waves. Bram is already forging a shield from her scales. "Where the warden\'s heart beats, the ancestor sleeps," the inscription read. Sleeping... for now.',
  },
  q8_skarnvind: {
    id: 'q8_skarnvind',
    title: 'Wings over the Sea',
    description: 'A wyvern hunts the waters between Crowhaven and the Mist Isles. Sail south and face it with the Sea Hummingbird\'s cannons.',
    journal: 'The fishermen no longer put out to the south: "a sail with claws" stalks the passage to the Mist Isles. Aldric is certain it is Skarnvind, the wyvern of the mists. There is only one way to cross those waters: with the Sea Hummingbird\'s cannons loaded and my nerves steeled.',
    objectives: [
      { id: 'o1', text: 'Sail to the hunting waters south of the bay', type: 'flag', target: 'skarnvind_seen' },
      { id: 'o2', text: 'Defeat Skarnvind with the Sea Hummingbird\'s broadsides', type: 'flag', target: 'skarnvind_dead' },
    ],
    rewards: { xp: 320, items: [{ id: 'coin', count: 120 }, { id: 'flecha', count: 10 }] },
    nextQuest: 'q9_ancestro',
    completionJournal: 'Skarnvind fell into the sea with a thunderclap of sound and salt. From his claws I keep the greatest: Aldric swears it fits the lock of the Iceclaw Nest. The southern passage is open again... and the north is waiting.',
  },
  q9_ancestro: {
    id: 'q9_ancestro',
    title: 'The Ancestor of the Iceclaw Peaks',
    description: 'With Skarnvind\'s Claw and the Heart of the Tide, the Ancestor\'s Nest will open. The Iceclaw Peaks hold the dragon that signed the ancient pact.',
    journal: 'Everything leads to the summits: my father\'s letter, the Seal, the Heart of the Tide, the wyvern\'s claw. High in the Iceclaw Peaks sleeps the Ancestor, the dragon that signed the pact with the sunken kings. The Order of the Tide has a Warden once more. I will need to be.',
    objectives: [
      { id: 'o1', text: 'Climb to the Ancestor\'s Nest in the Iceclaw Peaks', type: 'flag', target: 'ancestro_seen' },
      { id: 'o2', text: 'Defeat the Ancestor of the Iceclaw Peaks', type: 'flag', target: 'ancestro_dead' },
    ],
    rewards: { xp: 600, items: [{ id: 'coin', count: 250 }] },
    nextQuest: 'q10_orden',
    completionJournal: 'The Ancestor of the Iceclaw Peaks has fallen. Of the ancient pact there remain a fang, a seal, and a young Warden with a mended ship. "Dragons are not what the songs say," my father wrote. Now I know: they are exactly what the songs do not dare to tell. END OF CHAPTER III — The Whisper of Wings.',
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
