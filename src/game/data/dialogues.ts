/** Dialogue trees — fully data-driven, resolved by the DialogueSystem. */

export type DialogueActionSingle =
  | { t: 'flag'; flag: string }
  | { t: 'item'; id: string; count: number }
  | { t: 'takeItem'; id: string; count: number }
  | { t: 'quest'; id: string }
  | { t: 'xp'; amount: number }
  | { t: 'talk'; target: string }
  /** Fase 16 — open a merchant's shop panel and close the dialogue. */
  | { t: 'shop'; vendor: string; tab?: 'wares' | 'sells' }
  | { t: 'close' };

/** Actions can be a single action or a list applied in order. */
export type DialogueAction = DialogueActionSingle | DialogueActionSingle[];

export interface DialogueOption {
  text: string;
  next?: string;
  action?: DialogueAction;
  cond?: string;   // flag must be set to show
  notCond?: string; // flag must NOT be set to show
  /** Fase 15 — inventory requirement: option only shows while the player
   *  carries every listed item (Erica's sea-goods hub, Bram's forge). */
  requires?: Array<{ id: string; count: number }>;
}

export interface DialogueNode {
  text: string;
  options: DialogueOption[];
}

export interface DialogueTree {
  /** First matching tree for an NPC is used. */
  cond?: string;
  notCond?: string;
  /** Marks a required item count (id>=count) for this tree to trigger. */
  requireItem?: { id: string; count: number };
  /** Fase 16 — player level gates (inclusive). Used by the smiths. */
  minLevel?: number;
  maxLevel?: number;
  nodes: Record<string, DialogueNode>;
  start: string;
}

export interface NPCDialogue {
  npcId: string;
  name: string;
  trees: DialogueTree[];
}

export const DIALOGUES: Record<string, NPCDialogue> = {
  aldric: {
    npcId: 'aldric',
    name: 'Master Aldric',
    trees: [
      {
        notCond: 'talked_aldric',
        start: 'a1',
        nodes: {
          a1: {
            text: 'By the tides! Is that you, boy? You\'re the spitting image of Eirik at your age… Greetings. I\'m Aldric, master of this port. Your father was my best friend… and my worst tavern customer.',
            options: [
              { text: 'I\'ve come back for his legacy. What did he leave me?', next: 'a2' },
              { text: 'You were friends? Tell me what he was like.', next: 'a3' },
            ],
          },
          a3: {
            text: 'Stubborn as an anchor in the mud, and twice as loyal. He would mend other men\'s ships before his own. In his last months he spoke of old charts, of courses no mapmaker ever drew… and of a three-headed crow that, he swore, was following him.',
            options: [{ text: 'A three-headed crow…', next: 'a2' }],
          },
          a2: {
            text: 'He left a sea chest. It sits in my warehouse by the quay, shut with a lock only a copper amulet will open. Eirik entrusted the amulet to Maren, the herbalist. If you want what\'s inside… go speak with her.',
            options: [
              { text: 'I\'ll go see her. Thank you, Aldric.', next: 'a4', action: { t: 'flag', flag: 'talked_aldric' } },
              { text: 'And why didn\'t you open it yourself?', next: 'a5' },
            ],
          },
          a5: {
            text: 'And desecrate a dead friend\'s legacy? Never. Besides… that lock is no smith\'s work. There are engravings in the metal I never saw even in the castle archives. Work of the Order of the Tide, Eirik said. Go see Maren: she knows more than she tells.',
            options: [
              { text: 'I\'ll go see her.', next: 'a4', action: { t: 'flag', flag: 'talked_aldric' } },
            ],
          },
          a4: {
            text: 'A word of advice, lad: Maren gives nothing away. She\'ll ask something in return — petals, mushrooms, patience. Anything but gold. Ah… and welcome home. Crowhaven needs you more than you know.',
            options: [
              {
                text: 'See you soon, Aldric.',
                action: [
                  { t: 'talk', target: 'aldric' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'chest_opened',
        notCond: 'aldric_ship_talked',
        start: 's1',
        nodes: {
          s1: {
            text: 'So you\'ve opened it. Well now… Eirik\'s sword. The last time I saw it, he was putting out to sea under that old sail, bound northwest, swearing he\'d be back within a week. I have waited twelve winters for him.',
            options: [
              { text: 'The letter speaks of Old Crow Isle. And of dragons.', next: 's2' },
              { text: 'The Sea Hummingbird… can she sail again?', next: 's2' },
            ],
          },
          s2: {
            text: 'With good timber, new canvas and three weeks of work, the Hummingbird will fly over the waves again. The keel is sound — your father kept her resting on the bottom of the bay so the tide would not dry her out. I will oversee the refit myself… if you let me come along when she weighs anchor.',
            options: [
              { text: 'It\'s a deal, Master.', next: 's3' },
              { text: 'Why would you help a stranger?', next: 's4' },
            ],
          },
          s4: {
            text: 'Because Eirik was a Warden of the Tide, and Wardens do not choose their successors: the salt chooses them. You came back to port carrying his sword. In Aldmor that means only one thing… The sea is calling you, boy.',
            options: [{ text: 'Then let it call. Let\'s mend the Hummingbird.', next: 's3' }],
          },
          s3: {
            text: 'HA! That\'s the spark you needed! While I work the hull, take to the sea another way: explore Aldmor, gather provisions, learn its paths. When the Hummingbird is ready, Chapter II of your story begins: The Forgotten Seas are waiting for you.',
            options: [
              {
                text: 'See you at the quay, Aldric.',
                action: [
                  { t: 'flag', flag: 'aldric_ship_talked' },
                  { t: 'talk', target: 'aldric_ship' },
                  { t: 'xp', amount: 30 },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'morwen_defeated',
        notCond: 'aldric_dragons_talked',
        start: 'w1',
        nodes: {
          w1: {
            text: 'You\'re back! The whole port talks of the burning of the Crow... and of something else. Shepherds come down from the Iceclaw Peaks with thinned flocks: they swear a winged shadow crosses the sky at dusk. And the castle guards say the ruins of Vaelthara "breathe".',
            options: [
              { text: 'Dragons? Here, in Aldmor?', next: 'w2' },
              { text: 'My father\'s letter mentioned them.', next: 'w2' },
            ],
          },
          w2: {
            text: 'The Order\'s archives in my keeping speak of three awakenings: the guardian of the ruins, the hunter of the sea, and the one asleep in the summit. If but one wakes, the others hear it. Eirik died trying to learn why they wake.',
            options: [
              { text: 'Then I\'ll go to the ruins of Vaelthara.', next: 'w3' },
              { text: 'What do you know of the guardian?', next: 'w4' },
            ],
          },
          w4: {
            text: 'Territorial, old, slower on the ground than in the air — but with a breath that melts steel. She watches over Vaelthara as a dog watches its master\'s grave. Go with your father\'s steel... and when her head draws back, run: the fire is already charging.',
            options: [{ text: 'I\'ll be careful.', next: 'w3' }],
          },
          w3: {
            text: 'The ruins lie southwest, beyond the forest: broken columns carved with water spirals. See them with your own eyes and come back to tell me. And boy... if there truly is a dragon there, do not be the one who wakes it.',
            options: [
              {
                text: 'I\'ll return with news, Aldric.',
                action: [
                  { t: 'flag', flag: 'aldric_dragons_talked' },
                  { t: 'talk', target: 'aldric_dragons' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'vaelthara_seen',
        notCond: 'aldric_report_talked',
        start: 'r1',
        nodes: {
          r1: {
            text: 'Your face says it all. You have seen her. Tell me she did not follow you to the quay, and I\'ll believe you.',
            options: [
              { text: 'She\'s enormous, Aldric. And she saw us.', next: 'r2' },
              { text: 'She guards the ruins like something sacred.', next: 'r2' },
            ],
          },
          r2: {
            text: 'Then it is her. The guardian of Vaelthara. The archives say the Wardens spoke to her... and that when the Order dissolved, she was left alone with an oath no one else remembers. She is not evil, boy. But she is loyal to a dead world.',
            options: [
              { text: 'What do I do if she stands in my way?', next: 'r3' },
              { text: 'I need to reach the peaks.', next: 'r3' },
            ],
          },
          r3: {
            text: 'Take this from the Order\'s old armory: the axe the Wardens used to subdue beasts. It is heavy, but a heavy blow will stagger even a dragon. And find Bram once you have bested her: with her scales he will forge something that will save your life.',
            options: [
              {
                text: 'Thank you, Aldric. For everything.',
                action: [
                  { t: 'flag', flag: 'aldric_report_talked' },
                  { t: 'talk', target: 'aldric_report' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'vaelthara_dead',
        notCond: 'skarnvind_hint',
        start: 'k1',
        nodes: {
          k1: {
            text: 'The Heart of the Tide... She lived to see another Warden with hands full of scales. Listen: to the south, between the bay and the Mist Isles, fishermen speak of "a sail with claws". That is Skarnvind, the hunter of the sea. While he flies, there is no passage south.',
            options: [
              {
                text: 'I\'ll set sail for the south.',
                action: [
                  { t: 'flag', flag: 'skarnvind_hint' },
                  { t: 'close' },
                ],
              },
              { text: 'A wyvern on the open sea?', next: 'k2' },
            ],
          },
          k2: {
            text: 'He hunts from the sky what cannot swim. Your broadsides are your sword out there: strike when he hovers before the prow — that is when he charges his fire. And pray the Hummingbird remembers how to dodge thunder.',
            options: [
              {
                text: 'With the wind at my back, Aldric.',
                action: [
                  { t: 'flag', flag: 'skarnvind_hint' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'ancestro_dead',
        notCond: 'aldric_final_talked',
        start: 'f1',
        nodes: {
          f1: {
            text: 'The fang... So the archives told the truth. You did not kill him for gold or glory: you did it because someone had to hold the watch. Your father would be proud. The Order of the Tide has a Warden again.',
            options: [
              { text: 'And now what, Aldric?', next: 'f2' },
              { text: 'The dragons were not what the songs claimed.', next: 'f2' },
            ],
          },
          f2: {
            text: 'Now — the sea. There are more islands south of the horizon, more broken seals to mend, and more songs that do not yet dare tell the truth. Drink, rest... and when the wind turns, set sail. All Eldoria owes you one more chapter.',
            options: [
              {
                text: 'For the Forgotten Seas, Aldric.',
                action: [
                  { t: 'flag', flag: 'aldric_final_talked' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        start: 'd1',
        nodes: {
          d1: {
            text: 'The port is restless. The merchants say a black sail is patrolling the northwest passage. Pirates… or something worse. If you mean to explore the coast, be back before nightfall.',
            options: [
              { text: 'Pirates so close to the bay?', next: 'd2' },
              { text: 'May the seas be gentle with you, Aldric.', action: { t: 'close' } },
            ],
          },
          d2: {
            text: 'The seas change, boy. Once the dragons kept the peace of the sea lanes; then the kingdoms; now… no one. Only gold rules the waves. That is why this port needs people like you.',
            options: [{ text: 'I\'ll keep that in mind.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  maren: {
    npcId: 'maren',
    name: 'Maren the Herbalist',
    trees: [
      {
        notCond: 'maren_met',
        start: 'm1',
        nodes: {
          m1: {
            text: 'There you are. I have been expecting you since the gull announced your sail. You have your father\'s eyes… and his stubbornness, I\'d wager. I am Maren. I cure warts and fears, and… I keep other people\'s memories — like the amulet you seek.',
            options: [
              { text: 'Aldric says you have Eirik\'s amulet.', next: 'm2' },
              { text: 'How did you know I was coming for it?', next: 'm3' },
            ],
          },
          m3: {
            text: 'Because the tides bring more than seaweed, boy. They bring news, omens… and sometimes they bring the right people to the right place. The copper amulet has waited years for you in my chest. But nothing given freely is ever valued: you will have to earn it.',
            options: [{ text: 'What do you want in return?', next: 'm2' }],
          },
          m2: {
            text: 'Three ivory petals. They bloom where the water sings: beside the trail of the northern waterfall, and among the ruins of the western woods, where the shade lies deep. With them I brew the winter remedy for the village.',
            options: [
              {
                text: 'I\'ll bring them. Wait for me.',
                next: 'm4',
                action: [
                  { t: 'flag', flag: 'maren_met' },
                  { t: 'talk', target: 'maren' },
                ],
              },
              { text: 'Isn\'t there another way to earn it?', next: 'm5' },
            ],
          },
          m5: {
            text: 'There is: steal it. But then the tide would turn its back on you, and believe me: you will need the sea to look on you kindly. The petals, boy. North and west.',
            options: [
              {
                text: 'Very well. Ivory petals.',
                next: 'm4',
                action: [
                  { t: 'flag', flag: 'maren_met' },
                  { t: 'talk', target: 'maren' },
                ],
              },
            ],
          },
          m4: {
            text: 'Follow the stream toward the peaks and you will find the whispering waterfall. And in the western woods, the ruins of the ancients… go with respect: that place remembers those who came before. May the shade be merciful to you.',
            options: [{ text: 'I\'ll return with the petals.', action: { t: 'close' } }],
          },
        },
      },
      {
        cond: 'maren_met',
        notCond: 'maren_herbs_done',
        requireItem: { id: 'petalo', count: 3 },
        start: 't1',
        nodes: {
          t1: {
            text: 'You smell of waterfall mist and old stone… Let me see them. Well now! Three petals, not one wilted. Eirik gathered them just the same: with a fisherman\'s hands and a saint\'s patience.',
            options: [
              {
                text: 'Hand over the three petals',
                next: 't2',
                action: { t: 'takeItem', id: 'petalo', count: 3 },
              },
            ],
          },
          t2: {
            text: 'They are perfect. Here — as promised: your father\'s copper amulet. And one thing more, for your eyes give you away: your family were no fishermen, boy. They were Wardens of the Tide. Keepers of the pact with those who sleep beneath the sea.',
            options: [
              { text: 'The pact… with the dragons?', next: 't3' },
              { text: 'Why did they never tell me?', next: 't4' },
            ],
          },
          t3: {
            text: 'With the dragons, yes. The ones the tavern songs sing of, and the ones that truly fly above the Iceclaw Peaks. The Order kept the balance: that kings would not covet what lies sunken, and that the sunken would not covet the surface. Your father was the last Warden… that I know of.',
            options: [{ text: 'And now — what am I?', next: 't5' }],
          },
          t4: {
            text: 'Because Wardens swear silence, and silence protects. A Warden who shouts his name in the tavern puts a target on his family. Eirik kept the truth from you so you could sleep as a child. Now you may wake.',
            options: [{ text: 'Then I will wake.', next: 't5' }],
          },
          t5: {
            text: 'You are whatever the salt chooses. Now go: your father\'s chest waits in the port warehouse. And when the letter I keep in my memory reaches your hands… remember that old orders never die while someone remembers their vows. Take these potions too: you will need them.',
            options: [
              {
                text: 'Thank you, Maren.',
                action: [
                  { t: 'item', id: 'amuleto', count: 1 },
                  { t: 'flag', flag: 'maren_herbs_done' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'maren_met',
        notCond: 'maren_herbs_done',
        start: 'w1',
        nodes: {
          w1: {
            text: 'The petals, boy? Remember: they bloom in the shade. The northern waterfall, beside the trail… and the western woods, among the ruins the moss is reclaiming. Nature opens its treasures only to those who walk slowly.',
            options: [
              { text: 'Still searching.', action: { t: 'close' } },
              { text: 'How do I reach the waterfall?', next: 'w2' },
            ],
          },
          w2: {
            text: 'From the well in the square, walk north along the stream into the foothills. You will hear the water sing before you see it: that is why they call her the Whisperer. And on the way back… beware the wolves at dusk. The forest is hungry this year.',
            options: [{ text: 'I\'ll be careful.', action: { t: 'close' } }],
          },
        },
      },
      {
        start: 'f1',
        nodes: {
          f1: {
            text: 'The herbs told me you climbed the Iceclaw Peaks. Few come back from there with their heads still turned toward the sky… The shepherds say a winged shadow crosses the summits at dusk. I say: pray it stays asleep.',
            options: [
              { text: 'Do you believe in dragons, Maren?', next: 'f2' },
              { text: 'I must go.', action: { t: 'close' } },
            ],
          },
          f2: {
            text: 'I believe in what my herbs heal and in what the seas sink. Dragons… are both, boy. They were the world\'s remedy once. And they were its poison. The Order knew it. That is why Wardens existed.',
            options: [{ text: 'Like my father.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  rosa: {
    npcId: 'rosa',
    name: 'Rosa, barkeeper of the Broken Anchor',
    trees: [
      {
        notCond: 'rosa_started',
        start: 'r1',
        nodes: {
          r1: {
            text: 'A new face that doesn\'t owe me money! Welcome to the Broken Anchor, the only place in Aldmor where the beer is more honest than the prices. A pint? Rumors? Work?',
            options: [
              { text: 'Did you say work?', next: 'r2' },
              { text: 'Just admiring the tavern. On with the night.', action: { t: 'close' } },
            ],
          },
          r2: {
            text: 'Last month\'s storm broke the Mirage on the west coast. It took half a cargo of spices — the very spices that paid my tavern\'s note. Bring it back from the wreck… hard coin and a house potion. I\'m not going: the sea spits me out, and I spit right back.',
            options: [
              {
                text: 'I\'ll search for your cargo on the west coast.',
                next: 'r3',
                action: { t: 'flag', flag: 'rosa_started' },
              },
              { text: 'Sounds like a low-tide job… I\'ll think about it.', action: { t: 'close' } },
            ],
          },
          r3: {
            text: 'That\'s the spirit! Follow the western beach until you see the broken hull. My chest bears the broken-anchor seal, branded by fire. And mind what the sea gives back… not everything the tide brings in is dead.',
            options: [
              {
                text: 'I\'ll be back with the chest.',
                action: [
                  { t: 'quest', id: 'q_rosa' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'rosa_started',
        notCond: 'rosa_done',
        requireItem: { id: 'cargamento', count: 1 },
        start: 'r4',
        nodes: {
          r4: {
            text: 'By my great-grandmother\'s anchor! The spice chest! It smells… of cinnamon and profit. Here\'s your reward, sailor: the gold I promised and a house potion — the fishermen drink it when the sea spits them back half-drowned.',
            options: [
              {
                text: 'A deal is a deal, Rosa.',
                action: [
                  { t: 'takeItem', id: 'cargamento', count: 1 },
                  { t: 'talk', target: 'rosa_return' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'aldric_ship_talked',
        notCond: 'canvas_given',
        requireItem: { id: 'petalo', count: 3 },
        start: 'rc1',
        nodes: {
          rc1: {
            text: 'Three more ivory petals? The moon smiles on me. With a petal bath the canvas comes out waxed, dyed and three times as strong — the secret behind sails that never tear. Give me a minute… there: three first-rate pieces, ready for the Hummingbird.',
            options: [
              {
                text: 'A true art, Rosa. Here you are.',
                action: [
                  { t: 'takeItem', id: 'petalo', count: 3 },
                  { t: 'item', id: 'lona', count: 3 },
                  { t: 'flag', flag: 'canvas_given' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'aldric_ship_talked',
        notCond: 'canvas_given',
        requireItem: { id: 'coin', count: 20 },
        start: 'rc2',
        nodes: {
          rc2: {
            text: 'It can be done without petals, though the canvas comes out white and less noble: northern linen, twenty coins for the three pieces. Your choice: the tide won\'t wait, and neither will Bram.',
            options: [
              {
                text: 'I\'ll take the linen. Here you are.',
                action: [
                  { t: 'takeItem', id: 'coin', count: 20 },
                  { t: 'item', id: 'lona', count: 3 },
                  { t: 'flag', flag: 'canvas_given' },
                  { t: 'close' },
                ],
              },
              { text: 'I\'ll be back with ivory petals.', action: { t: 'close' } },
            ],
          },
        },
      },
      {
        cond: 'aldric_ship_talked',
        notCond: 'canvas_given',
        start: 'rc3',
        nodes: {
          rc3: {
            text: 'Canvas for the Hummingbird? Of course I know how to make it — I washed your father\'s sails for years on end. Bring me three ivory petals for the waxing bath… or twenty coins if nature isn\'t smiling on you this week.',
            options: [
              { text: 'I\'ll bring you one or the other.', action: { t: 'close' } },
            ],
          },
        },
      },
      {
        start: 'r5',
        nodes: {
          r5: {
            text: 'Did you know your father paid his debts singing? Badly — but singing. If you inherited the voice, the house is buying. If you inherited the thirst… the house charges double.',
            options: [
              { text: 'I\'ll have a drink and listen to the rumors.', next: 'r6' },
              { text: 'Another night, then.', action: { t: 'close' } },
            ],
          },
          r6: {
            text: 'Then mark this: a merchant swears he saw lights beneath the water to the northwest, where they say the old capital sank. And old Jorund vows the circle stones sing on moonless nights. All I know is the tide is bringing in strange things this year…',
            options: [{ text: 'Strange things… mine are the worst of all. Cheers.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  bram: {
    npcId: 'bram',
    name: 'Bram the Smith',
    trees: [
      {
        // Fase 27 — THE SMITH'S BESTIARY: bounty payout (kill counters met)
        cond: 'bestiario_kills_done',
        notCond: 'bestiario_done',
        start: 'bs3',
        nodes: {
          bs3: {
            text: 'Four goblin clubs, three kobold spears, three of those swamp-things — AND the hoarder\'s crown? You emptied the meadows, Warden. The board is yours to close: coins, tonics, and the good iron from my scrap pile.',
            options: [
              {
                text: 'The board is closed. Good forging, Bram.',
                action: [
                  { t: 'talk', target: 'bram_bestiario' },
                  { t: 'flag', flag: 'bestiario_done' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        // Fase 27 — THE SMITH'S BESTIARY: the offer (after the first kill)
        cond: 'bestiario_board',
        notCond: 'bestiario_started',
        start: 'bs1',
        nodes: {
          bs1: {
            text: 'You have blood on your boots — good, honest, goblin blood. Look at the board: the meadows are crawling again. Clubs, scales and mud-things, and something BIG hoarding in the camp by the old road. I pay per head. Better for the big one.',
            options: [
              {
                text: 'Consider the board open.',
                action: [
                  { t: 'quest', id: 'sq_bestiario' },
                  { t: 'flag', flag: 'bestiario_started' },
                  { t: 'close' },
                ],
              },
              { text: 'Not today, smith.', next: 'bs2' },
            ],
          },
          bs2: {
            text: 'The board does not rot, and neither do bounties. Come back when your blade itches.',
            options: [{ text: 'Farewell.', action: [{ t: 'close' }] }],
          },
        },
      },
      {
        cond: 'aldric_ship_talked',
        notCond: 'ship_repaired',
        start: 'rf1',
        nodes: {
          rf1: {
            text: 'So the Hummingbird goes back in the water and you are the new owner. Good. Aldric already advanced me half the payment — the other half you owe me in timber, canvas and rope. I bring the nails, the sweat and the swearing.',
            options: [
              { text: 'What exactly does the hull need?', next: 'rf2' },
              { text: 'And you don\'t take to the sea?', next: 'rf3' },
            ],
          },
          rf2: {
            text: 'Four planks of cured oak — there are crates marked with my seal at the quay, on the wreck coast and along the waterfall trail. Three pieces of waxed canvas, which Rosa prepares better than anyone. And two hemp ropes from good old Tom. When you have it all, leave the materials by the hull and I will handle the rest.',
            options: [
              {
                text: 'With that list, to work. Good forging, Bram.',
                action: [
                  { t: 'talk', target: 'bram_refit' },
                  { t: 'close' },
                ],
              },
              { text: 'And if something is missing?', next: 'rf3' },
            ],
          },
          rf3: {
            text: 'The Hummingbird does not sail half-ready, boy. Neither ships nor men. Bring me the full list and we will talk tides. And one thing more: when you sail, listen to the hull. Wood warns before it breaks… if you know how to listen.',
            options: [
              {
                text: 'I will learn to listen. Farewell, Bram.',
                action: [
                  { t: 'talk', target: 'bram_refit' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'ship_repaired',
        start: 'rf4',
        nodes: {
          rf4: {
            text: 'There\'s the new captain! The hull sings true, doesn\'t it? I put double reinforcements on the keel — right where your father liked to graze the reefs. If you hear an odd creak to port… that is Eirik\'s memory protesting, not the wood.',
            options: [{ text: 'May he protest for many years. Good forging.', action: { t: 'close' } }],
          },
        },
      },
      {
        start: 'b1',
        nodes: {
          b1: {
            text: 'Sparks! Come closer to the fire — the north wind cuts this season. Iron to mend? Ship nails? Or have you come to hear about the time I saw a scale the size of a shield fall from the sky?',
            options: [
              { text: 'A scale… from the sky?', next: 'b2' },
              { text: 'Do you have work for me?', next: 'b3' },
              { text: 'Just passing through. Good forging.', action: { t: 'close' } },
            ],
          },
          b2: {
            text: 'I was crossing the high pass with my grandfather, thirty winters ago. It came down spinning like a silver leaf and drove itself into the ice a foot from my boot. My grandfather looked at it, left it lying there and said: "Where a scale falls, its master soon follows. Run." We ran. We never went back through that pass.',
            options: [
              { text: 'And you still keep the scale?', next: 'b4' },
              { text: 'A fine tale for the tavern.', action: { t: 'close' } },
            ],
          },
          b4: {
            text: 'I melted it down, boy. Ten scythes and two swords came out of it… and I swear by the forge, the steel came out singing. Some nights I still wake and hear the echo of that song beneath the earth. Metal remembers, like the sea.',
            options: [{ text: 'Then the metal and I will understand each other. Farewell.', action: { t: 'close' } }],
          },
          b3: {
            text: 'For a lad with legs: bring me charcoal from the mountain and I\'ll sharpen whatever you carry. But between us, the better work is what Aldric gives you: the port pays… and the sea teaches.',
            options: [{ text: 'I\'ll go see him. Good forging, Bram.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  tom: {
    npcId: 'tom',
    name: 'Tom the Fisherman',
    trees: [
      {
        cond: 'aldric_ship_talked',
        notCond: 'rope_given',
        requireItem: { id: 'coin', count: 10 },
        start: 'tr1',
        nodes: {
          tr1: {
            text: 'That jingling in your pouch? Exactly: coins. Ten, counted out. And these are my two best hemp ropes, braided by my own hands — they would hold a mast in a full gale. A deal, eh? No returns: the hemp already knows your smell.',
            options: [
              {
                text: 'It\'s a deal, Tom.',
                action: [
                  { t: 'takeItem', id: 'coin', count: 10 },
                  { t: 'item', id: 'cuerda', count: 2 },
                  { t: 'flag', flag: 'rope_given' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'aldric_ship_talked',
        notCond: 'rope_given',
        start: 'tr2',
        nodes: {
          tr2: {
            text: 'Hemp rope for the Hummingbird, eh? I\'ve the best in the port… but I give nothing away anymore, not since a wolf owed me a net. Ten coins for the two ropes. Hemp doesn\'t grow on stones, boy.',
            options: [
              { text: 'I\'ll be back with the coins.', action: { t: 'close' } },
              { text: 'Won\'t you lower the price for Eirik\'s son?', next: 'tr3' },
            ],
          },
          tr3: {
            text: 'For Eirik\'s son I lower the talk and raise the warmth: still ten coins, but with a luck knot thrown in for free. Fisherman\'s prices are like the tides, boy: firm.',
            options: [{ text: 'The tide must be right. See you later.', action: { t: 'close' } }],
          },
        },
      },
      {
        start: 't1',
        nodes: {
          t1: {
            text: 'Hey! You there, with Eirik\'s beard. Welcome to the quay: where the fish are clever and the men rather less. Have you come to fish, or to get lost like your father?',
            options: [
              { text: 'Get lost? Tell me.', next: 't2' },
              { text: 'What\'s the catch around here?', next: 't3' },
            ],
          },
          t2: {
            text: 'Eirik got lost on purpose, boy. He would take the Hummingbird and vanish for weeks, bound northwest, where the charts go blank. He\'d come back with the hold full of… strange things. Parchments. Stones that shine. And once — I swear by the tide — a tooth longer than my arm.',
            options: [
              { text: 'A tooth? From what beast?', next: 't4' },
              { text: 'He seemed a different man.', action: { t: 'close' } },
            ],
          },
          t4: {
            text: 'Not the kind you catch with a rod, that\'s for sure. He traded it at the southern market for a sack of silver. The buyer wore a cloak with… bah, I can\'t remember anymore. The sea erases the details and keeps the stories.',
            options: [{ text: 'Thanks, Tom.', action: { t: 'close' } }],
          },
          t3: {
            text: 'Dragon\'s Kiss at dawn, sea bass among the eastern rocks, and swordfish when the water boils in August. And fishermen\'s lies all year round — the tastiest catch of all. If the Hummingbird sails again, count me in: I\'ll bring the hook and a song.',
            options: [{ text: 'I\'ll keep you in mind.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  elin: {
    npcId: 'elin',
    name: 'Erica, shopkeeper',
    trees: [
      {
        start: 'e1',
        nodes: {
          e1: {
            text: 'Fruit, cheese and colored ribbons! Forgive the mess — it\'s market day. Did you know you\'re the talk of the week? The Warden\'s son… I mean, Captain Eirik\'s son, back in port. People talk.',
            options: [
              { text: 'And what do people say?', next: 'e2' },
              { text: 'What\'s for sale today?', next: 'e3' },
            ],
          },
          e2: {
            text: 'That the seas are restless. That fish run scarce since that black sail began prowling the passage. And that the northern goats refuse to graze on the slopes of the Iceclaw Peaks. Animals know, boy. They always know before we do.',
            options: [{ text: 'I\'ll remember that. Good trading.', action: { t: 'close' } }],
          },
          e3: {
            text: 'Goat cheese from the hills, orchard apples and salt from the east. All at friend-of-the-port prices. Ah, and if you climb to the northern waterfall, bring me hawk feathers: I pay well for them — they say they bring luck… to those who sail.',
            options: [{ text: 'Perhaps I\'ll go up for some.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  jorund: {
    npcId: 'jorund',
    name: 'Guard Jorund',
    trees: [
      {
        start: 'j1',
        nodes: {
          j1: {
            text: 'Halt there… ah, easy, boy. The whole village knows who you are. Jorund, gate guard. Keep the peace inside the walls and we\'ll have no words… except the friendly kind.',
            options: [
              { text: 'Peace? Is something wrong in the village?', next: 'j2' },
              { text: 'Any advice from a veteran guard?', next: 'j3' },
            ],
          },
          j2: {
            text: 'Bandits on the southern roads, hungry wolves in the forest, and something that howls near the stone circle on moonless nights. The old lord of the castle has doubled the watch. All I\'m saying is: Crowhaven sleeps with one eye open.',
            options: [
              { text: 'The stone circle, you say?', next: 'j4' },
              { text: 'You will sleep well guarded.', action: { t: 'close' } },
            ],
          },
          j4: {
            text: 'Don\'t go there, boy. I mean it. My grandfather buried two mates who went to "see the runes glow". The tide found them: staring at the sky, smiling, without a mark on them. Some beauties are not meant to be looked at twice. That is one of them.',
            options: [{ text: '…I\'ll remember that. Thank you, Jorund.', action: { t: 'close' } }],
          },
          j3: {
            text: 'One: in the ruins, tread loud — snakes flee from noise. Two: if the forest falls suddenly silent, don\'t run: count to ten and walk slowly. And three… Rosa\'s beer charges interest. Beware all three and you\'ll outlive me.',
            options: [{ text: 'Guard\'s wisdom. I\'ll take it.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  sigrid: {
    npcId: 'sigrid',
    name: 'Sigrid the Laundress',
    trees: [
      {
        start: 'sg1',
        nodes: {
          sg1: {
            text: 'Mind the flagstones — soap forgives nothing. Ah yes, you\'re Eirik\'s son… I washed his sails for years, you know. In one of them I found a letter sewn into the hem. I returned it unread… though the temptation was great, I\'ll admit.',
            options: [
              { text: 'A sewn-up letter? What did it say?', next: 'sg2' },
              { text: 'My father was a good man.', action: { t: 'close' } },
            ],
          },
          sg2: {
            text: 'I don\'t know, boy, and may the gods forgive me: I never read it. But I remember the wax seal: a circle of tides around a flame. Days later, your father put to sea with that same seal hung round his neck… and he never came back.',
            options: [{ text: 'A circle of tides… like the amulet.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  // ---- Fase 16 — LA HERRERÍA: Torvald, el Herrero Estándar (nivel 6+) ----
  herrero: {
    npcId: 'herrero',
    name: 'Torvald',
    trees: [
      {
        // Too green: no shop, no small talk
        maxLevel: 5,
        start: 't_low',
        nodes: {
          t_low: {
            text: 'Come back when you\'ve toughened up a bit, eh? Level 6 is the bare minimum to touch my anvil. You still smell of the village.',
            options: [{ text: 'I\'ll be back with more beard.', action: { t: 'close' } }],
          },
        },
      },
      {
        start: 't1',
        nodes: {
          t1: {
            text: 'Torvald, at your service. Steel, leather, and a pair of wings the gulls envy. Everything that leaves my forge carries my seal… and a fair price. What can I do for you?',
            options: [
              { text: 'Let\'s see the wares.', action: { t: 'shop', vendor: 'herrero' } },
              { text: 'Wings? What are you talking about?', next: 't2' },
              { text: 'Another time, then.', action: { t: 'close' } },
            ],
          },
          t2: {
            text: 'Waxed canvas over whalebone ribs, boy. You strap them on, leap from a tower… and hold SPACE in the air. The wind does the rest: you glide down like an albatross in debt.',
            options: [
              { text: 'I want them. Show me the wares.', action: { t: 'shop', vendor: 'herrero' } },
              { text: 'One of these days.', action: { t: 'close' } },
            ],
          },
        },
      },
    ],
  },

  // ---- Fase 16 — EL HERRERO ENANO: Borin, Comercio Avanzado (nivel 10+) ----
  enano: {
    npcId: 'enano',
    name: 'Borin',
    trees: [
      {
        maxLevel: 9,
        start: 'b_low',
        nodes: {
          b_low: {
            text: 'Out of my woods! Come back at level 10, whelp. Down here, steel breaks only in hands that deserve it.',
            options: [{ text: '(back away slowly)', action: { t: 'close' } }],
          },
        },
      },
      {
        start: 'b1',
        nodes: {
          b1: {
            text: 'A human who made it this far? Ha. I am Borin, and that breathing you hear is the forge. I sell BROKEN versions of what Torvald makes: I break them on purpose. Steel knows no pity.',
            options: [
              { text: 'Show me the broken.', action: { t: 'shop', vendor: 'enano' } },
              { text: '"Broken on purpose"?', next: 'b2' },
              { text: 'Too much gold for me.', action: { t: 'close' } },
            ],
          },
          b2: {
            text: 'I tempered it backwards three times, until the metal gave up. It came out harder than an Ancestor\'s head. We dwarves break things until they work. Bring coins: many.',
            options: [
              { text: 'See the broken steel.', action: { t: 'shop', vendor: 'enano' } },
              { text: 'I\'ll be back… with more coins.', action: { t: 'close' } },
            ],
          },
        },
      },
    ],
  },

  // ---- Fase 22 — THE FORGE: Sister Ysolt, the sanctuary merchant ----
  santuario: {
    npcId: 'santuario',
    name: 'Sister Ysolt',
    trees: [
      {
        start: 'y1',
        nodes: {
          y1: {
            text: 'Welcome to the Sanctuary of Thalassar, traveller. The tide brings everything here eventually — silk, incense, and novices who cannot yet tell a blade from a bread knife. Perhaps something on my cloth speaks to you?',
            options: [
              { text: 'Let me see the sanctuary\'s wares.', action: { t: 'shop', vendor: 'santuario' } },
              { text: 'Novices? You train fighters here?', next: 'y2' },
              { text: 'The tide keep its peace, sister.', action: { t: 'close' } },
            ],
          },
          y2: {
            text: 'We train GUARDIANS — the ones who watch while others sleep. The wooden sword first, always: it cannot cut, but it teaches the wrists what a guard is and how it breaks. The cotton weave lets a learner counter instead of tank. When a novice survives three winters, the temple gives them steel.',
            options: [
              { text: 'The wooden sword and the weave, then.', action: { t: 'shop', vendor: 'santuario' } },
              { text: 'Three winters is a long apprenticeship.', next: 'y3' },
              { text: 'Peace to your guardians.', action: { t: 'close' } },
            ],
          },
          y3: {
            text: 'The sea is patient, and so are we. Speak to no one of the silk — the shadow-weave is a covenant, not a merchandise. But the guardians of the Mist Isles carry it, and what falls… the tide brings here.',
            options: [
              { text: 'I understand, sister. The wares, please.', action: { t: 'shop', vendor: 'santuario' } },
              { text: 'Until the tide turns.', action: { t: 'close' } },
            ],
          },
        },
      },
    ],
  },
};

/** Narrator-style lore interactions (tablets, stones, doors). */
export interface LoreInteraction {
  id: string;
  title: string;
  text: string[];
}

export const LORE: Record<string, LoreInteraction> = {
  tablet_ruins: {
    id: 'tablet_ruins',
    title: 'The Vaelthara Tablet',
    text: [
      'The stone is cold despite the sun. The characters, half-erased by moss, seem to ripple like stagnant water.',
      '"…and the Seven swore to keep vigil over the Sleep of the Lords of Fire, and sealed the city beneath the tide…"',
      '"…when the three-headed crow takes flight, those who sleep shall wake. Keep the Tide. Keep the pact…"',
      'Below, in a different and more recent hand, someone carved: "E. was here. The Order lives."',
    ],
  },
  stones_center: {
    id: 'stones_center',
    title: 'The Altar of the Circle',
    text: [
      'You lay your hand on the altar stone. It is warm, like a sleeping animal.',
      'A low hum runs through the circle. The runes on the monoliths pulse with a greenish light, synchronized… with your heartbeat.',
      'As soon as you withdraw your hand, everything goes dark. The meadow\'s silence returns, but it is slow to feel natural again — as if the air itself hesitated.',
    ],
  },
  tower_door: {
    id: 'tower_door',
    title: 'The Watchman\'s Tower',
    text: [
      'The door is barricaded with rotting planks. Through the gaps peer cobwebs the size of handkerchiefs.',
      'A rusted plaque recalls better days: "Here kept watch Halvor the Vigilant, forty years gazing at the sea. No enemy sail ever crossed his horizon."',
      'Someone tore the bell from its mount. On the ground, drag marks fade down the mountainside, toward the west.',
    ],
  },
  ship_colibri: {
    id: 'ship_colibri',
    title: 'The Sea Hummingbird',
    text: [
      'The old caravel rests by the quay, ringed with scaffolding. The hull shows recent patches and fresh timber.',
      'On the stern, half-erased by salt, a hummingbird figure chases a star. Below the waterline, on the keel, a seal raises the hair on your skin: a circle of tides around a flame.',
      'The same seal Sigrid described. Your father\'s ship was more than a ship.',
    ],
  },
};

// ---- Fase 15 sea-trade dialogues (Erica's market, Bram's abyssal forge,
//      Tom's horn legend) — grafted onto the existing NPC trees. ----
import { applyF15Dialogues } from './dialoguesF15';
applyF15Dialogues(DIALOGUES);

// ---- Fase 28 dialogues (POCIONES & EL VIAJERO — the wanderer, Maren's
//      table, Tom's regards) — grafted onto the existing NPC trees. ----
import { applyF28Dialogues } from './dialoguesF28';
applyF28Dialogues(DIALOGUES);
