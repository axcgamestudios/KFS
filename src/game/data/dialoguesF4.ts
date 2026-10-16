import { DIALOGUES, type DialogueTree, type NPCDialogue } from './dialogues';

/**
 * Fase 4 dialogue trees.
 *
 * Trees are PREPENDED to each NPC's list so their specific conditions match
 * before the unconditional defaults. Includes Halvard (new NPC, the stable
 * master) and the virtual "altar" dialogue used by the ending choice.
 */
const INSERTS: Record<string, DialogueTree[]> = {
  // ---------------- ALDRIC — Chapters IV & V ----------------
  aldric: [
    {
      // q10: after the Ancestor falls — the Order assembles
      cond: 'ancestro_dead',
      notCond: 'aldric_f4_talked',
      start: 'f4_1',
      nodes: {
        f4_1: {
          text: 'The Ancestor\'s fang… then it is true: the pact can be woven anew. Listen well, boy, for I have not told this in a hundred years. The Order of the Tide kept three relics: the Seal you took back from Morwen, the Heart of the Tide you tore from the guardian… and the Crown of Thalassar, which sank with the sanctuary\'s kings.',
          options: [
            { text: 'A sanctuary… sunken?', next: 'f4_2' },
            { text: 'What would the three relics be for?', next: 'f4_2b' },
          ],
        },
        f4_2: {
          text: 'Northeast of the bay, where the water turns turquoise, the ruins of Thalassar sleep beneath five meters of tide. With a calm breath you can swim their length. The Crown rested on its altar… and with it, the Crow\'s key: the shadow seeks those relics as much as we do.',
          options: [{ text: 'I\'ll go for the Crown.', next: 'f4_3' }],
        },
        f4_2b: {
          text: 'Together, they sing. The Seal summons the Order, the Heart tempers the dragons, the Crown… the Crown decides who keeps the pact. That is why the Crow stole them away one by one over a century. You have wrested two from him. Go for the third: the sanctuary of Thalassar, northeast of the bay.',
          options: [{ text: 'I\'ll go for the Crown.', next: 'f4_3' }],
        },
        f4_3: {
          text: 'One thing more: when you return with the Crown, seek out Halvard, the farrier of the stables, by the north road. He has kept something of your father\'s all these years… something with four legs and a foul temper. The Order has a Warden again — and a Warden does not go on foot.',
          options: [
            {
              text: 'For the Order, Aldric.',
              action: [
                { t: 'talk', target: 'aldric_f4' },
                { t: 'flag', flag: 'aldric_f4_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // q11: report after the flagship
      cond: 'flagship_looted',
      notCond: 'aldric_estandarte_talked',
      start: 'st1',
      nodes: {
        st1: {
          text: 'The Crow\'s sea chart? Let me see… here: the nameless cove at the foot of the Old Crow Fortress. "Where the Crow sleeps. Do not wake him without the three keys." Well then, Warden: you hold two. The third is in your pack.',
          options: [
            { text: 'Is the Crown the third key?', next: 'st2' },
            { text: 'What will we find in that cove?', next: 'st2' },
          ],
        },
        st2: {
          text: 'A basalt amphitheater the pirates never dared defile. They say a knight\'s statue — one of ours — has watched the entrance for three hundred years. Ready your steel, boy: Kraivenn is no common dragon. He is the shadow of the first broken oath, and he drinks from every crown that rises.',
          options: [
            {
              text: 'Then let him wait for me awake.',
              action: [
                { t: 'flag', flag: 'aldric_estandarte_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // q14: the Council
      cond: 'kraivenn_dead',
      notCond: 'aldric_consejo_talked',
      start: 'cn1',
      nodes: {
        cn1: {
          text: 'The Crow\'s Heart… still warm. I can hear it beating through the leather. Warden — the last Council of the Tides was held a hundred years ago, the night before everything sank. Tonight the next one is held. In the Ancestor\'s Nest, where the pact was signed.',
          options: [
            { text: 'What must I do?', next: 'cn2' },
            { text: 'And what will you do, Aldric?', next: 'cn3' },
          ],
        },
        cn2: {
          text: 'Carry the three relics to the Nest\'s altar: Seal, Crown and Heart. The altar will know its Warden… and then you will have to choose. Restore the pact, raise the crown, or give everything back to the sea. No master can choose for you. Not even your father could.',
          options: [{ text: 'I\'ll go to the Nest.', next: 'cn4' }],
        },
        cn3: {
          text: 'What I did the first time: write it all down, so that whoever comes after knows we existed. But this time I shall write it with a happy ending… if you can think of one, choose that.',
          options: [{ text: 'I\'ll go to the Nest, Aldric.', next: 'cn4' }],
        },
        cn4: {
          text: 'An old man\'s advice, if you will allow it: whatever happens up there, down here there will still be a port full of people who believe in you. Crowns and pacts are for the songs. People are for tavern nights. Do not forget it.',
          options: [
            {
              text: 'I will not forget it.',
              action: [
                { t: 'talk', target: 'aldric_consejo' },
                { t: 'flag', flag: 'aldric_consejo_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_guardianes: the knight statue report
      cond: 'knight_seen',
      notCond: 'estatua_reported',
      start: 'es1',
      nodes: {
        es1: {
          text: 'Does the statue still stand? Three hundred years gazing at the sea… The stone Wardens were the Order\'s last tribute: "they will watch over us when we no longer can." And the grotto — does it still sing?',
          options: [
            {
              text: 'The crystals are still there. So are the drakelings.',
              next: 'es2',
            },
          ],
        },
        es2: {
          text: 'So life returns. Like the dragons, like calamities, like the Wardens. I shall enter the statue in the Order\'s book: "The Knight of the North still keeps watch." Something the Crow has not managed to steal.',
          options: [
            {
              text: 'Still keeps watch.',
              action: [
                { t: 'talk', target: 'aldric_estatua' },
                { t: 'flag', flag: 'estatua_reported' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_estandarte: obsidian feathers
      cond: 'plumas_f4_started',
      notCond: 'plumas_f4_done',
      requireItem: { id: 'reliquia_cuervo', count: 3 },
      start: 'pl1',
      nodes: {
        pl1: {
          text: 'Let me see those feathers… Hm. These are no feathers, boy. They are scales of shadow: the Crow is coming apart into oaths, and oaths seek a master. Do you hear them? They whisper. Keep them far from your bed and close to your sword.',
          options: [
            {
              text: 'Whose oaths were these?',
              next: 'pl2',
            },
          ],
        },
        pl2: {
          text: 'Of kings, Wardens and dragons who promised too much. The Crow drank them down one by one. If he ever falls, those scales will become promises again… and pray that someone with a better head than mine is there — to leave them lying.',
          options: [
            {
              text: 'Keep them, Aldric.',
              action: [
                { t: 'takeItem', id: 'reliquia_cuervo', count: 3 },
                { t: 'talk', target: 'aldric_plumas' },
                { t: 'flag', flag: 'plumas_f4_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_lamento: after listening to the ruins
      cond: 'lamento_done',
      notCond: 'lamento_reported',
      start: 'lm1',
      nodes: {
        lm1: {
          text: 'And what did the silence say? … I see. Grief, you say. A guardian without a dragon, and a dragon without a guardian. That is how it feels to lose half an oath. Now you understand why we existed: someone must remain to listen.',
          options: [
            {
              text: 'To listen.',
              action: [
                { t: 'talk', target: 'aldric_lamento' },
                { t: 'flag', flag: 'lamento_reported' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_estandarte: offer the feather hunt
      cond: 'ancestro_dead',
      notCond: 'plumas_f4_started',
      start: 'pl0',
      nodes: {
        pl0: {
          text: 'The fishermen bring black feathers down from the north — "harder than iron, cold as the deep." Should you cross paths with three, bring them to me: I would confirm an old suspicion about the Crow.',
          options: [
            {
              text: 'I\'ll bring them.',
              action: [
                { t: 'flag', flag: 'plumas_f4_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- HALVARD — the stable master (new NPC) ----------------
  // (full definition below, not an insert)

  // ---------------- BRAM — the Guardian forge (q12) ----------------
  bram: [
    {
      cond: 'ancestro_dead',
      notCond: 'bram_forge_talked',
      start: 'fg1',
      nodes: {
        fg1: {
          text: 'The Ancestor\'s fang… This is how Warden steel was forged: old dragon, new oath. Bring me three dragon scales along with the fang, and on my anvil the Warden\'s Sword will be born. The one that whistles, yes. I have heard the tellings.',
          options: [
            { text: 'Scales from any dragon?', next: 'fg2' },
            { text: 'It\'s a deal, Bram.', next: 'fg3' },
          ],
        },
        fg2: {
          text: 'From any dragon you have defeated — not stolen from. The forge can tell the difference. Bring the scales and the fang to the anvil — I will know what to do with them.',
          options: [{ text: 'It\'s a deal, Bram.', next: 'fg3' }],
        },
        fg3: {
          text: 'And tell Maren for provisions, and Halvard for Tormenta. If you mean to wake the Crow, you will go with the whole Order at your back. You were never meant to be lone heroes — that is what the songs are for.',
          options: [
            {
              text: 'With the whole Order.',
              action: [
                { t: 'talk', target: 'bram_forge' },
                { t: 'flag', flag: 'bram_forge_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_yunque: scales delivery
      cond: 'yunque_started',
      notCond: 'yunque_done',
      requireItem: { id: 'escama', count: 3 },
      start: 'yq1',
      nodes: {
        yq1: {
          text: 'My scales! Perfect, perfect… With these I will temper a steel that cuts the mist like your caravel\'s prow. Leave them here — and take this: a smith without debts forges better.',
          options: [
            {
              text: 'A pleasure, master.',
              action: [
                { t: 'takeItem', id: 'escama', count: 3 },
                { t: 'talk', target: 'bram_yunque' },
                { t: 'flag', flag: 'yunque_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_yunque: offer
      cond: 'ship_repaired',
      notCond: 'yunque_started',
      start: 'yq0',
      nodes: {
        yq0: {
          text: 'You again? Good. I seek dragon scales — three, good and thick. With them I will temper the finest steel in the north, and I will owe you for it. "Bram the Smith owes me one" is a phrase that opens doors — you will see.',
          options: [
            {
              text: 'I\'ll see what I find.',
              action: [
                { t: 'flag', flag: 'yunque_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- MAREN — potions & petals ----------------
  maren: [
    {
      // q12: provisions
      cond: 'bram_forge_talked',
      notCond: 'maren_potions_talked',
      start: 'mp1',
      nodes: {
        mp1: {
          text: 'So you are going to wake the Crow? Then you will not go with an empty larder. Here: three potions of the good stuff — the root that only grows at night. And drink slowly: haste is paid for in rashes.',
          options: [
            { text: 'Thank you, Maren.', next: 'mp2' },
          ],
        },
        mp2: {
          text: 'Thank your father: the Order pulled me from a shipwreck when I was a girl. If his son walks toward the Crow, he will walk with the tide at his back. Come back whole, you hear? The herbs do not pick themselves.',
          options: [
            {
              text: 'Whole… I\'ll come back whole.',
              action: [
                { t: 'item', id: 'pocion', count: 3 },
                { t: 'talk', target: 'maren_potions' },
                { t: 'flag', flag: 'maren_potions_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_petalo_tumba: petals delivery
      cond: 'petalo_tumba_started',
      notCond: 'petalo_tumba_done',
      requireItem: { id: 'petalo', count: 5 },
      start: 'pt1',
      nodes: {
        pt1: {
          text: 'Five ivory petals… you have searched well. I will lay them on the circle\'s altar: the fallen Wardens deserve flowers that do not wilt. Good people sleep down there. People who promised too much — as we all do.',
          options: [
            {
              text: 'May they sleep with music.',
              action: [
                { t: 'takeItem', id: 'petalo', count: 5 },
                { t: 'talk', target: 'maren_petalo' },
                { t: 'flag', flag: 'petalo_tumba_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_arce: maple seed delivery
      cond: 'arce_started',
      notCond: 'arce_done',
      requireItem: { id: 'semilla_arce', count: 1 },
      start: 'ar1',
      nodes: {
        ar1: {
          text: 'The Great Maple seed! Still warm… I will plant it by the waterfall pool, where the water sings. "A maple for every oath kept" — so the Wardens said. The second oath will grow here, with us.',
          options: [
            {
              text: 'May it grow strong.',
              action: [
                { t: 'takeItem', id: 'semilla_arce', count: 1 },
                { t: 'talk', target: 'maren_arce' },
                { t: 'flag', flag: 'arce_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_petalo_tumba: offer
      cond: 'maren_herbs_done',
      notCond: 'petalo_tumba_started',
      start: 'pt0',
      nodes: {
        pt0: {
          text: 'I was about to go looking for you. The fallen Wardens sleep in the stone circle without a single flower — and ivory petals are the only ones that never wilt. Five will suffice. Would you fetch them for me?',
          options: [
            {
              text: 'Five petals. On my word.',
              action: [
                { t: 'flag', flag: 'petalo_tumba_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_arce: offer
      cond: 'maren_herbs_done',
      notCond: 'arce_started',
      start: 'ar0',
      nodes: {
        ar0: {
          text: 'Do you know the Great Maple? The golden tree of the northern valley… the last one the Wardens planted. Bring me one of its seeds: I want to plant the second. A new oath for a port that is learning to believe again.',
          options: [
            {
              text: 'A Great Maple seed. On my way.',
              action: [
                { t: 'flag', flag: 'arce_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- TOM — fish, sails & storms ----------------
  tom: [
    {
      // sq_raciones: fish delivery
      cond: 'raciones_started',
      notCond: 'raciones_done',
      requireItem: { id: 'pez', count: 4 },
      start: 'ra1',
      nodes: {
        ra1: {
          text: 'Four fish! And fat ones, as the low tide commands. With these the larders hold out a month, and tonight\'s stew will taste of Sunday. Here, here — I will carry them — you have dragons to bother.',
          options: [
            {
              text: 'Enjoy the stew, Tom.',
              action: [
                { t: 'takeItem', id: 'pez', count: 4 },
                { t: 'talk', target: 'tom_raciones' },
                { t: 'flag', flag: 'raciones_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_vela: sailcloth delivery
      cond: 'vela_started',
      notCond: 'vela_done',
      requireItem: { id: 'lona', count: 3 },
      start: 've1',
      nodes: {
        ve1: {
          text: 'The canvas and the ropes! With these the skiff is a boat again, not a colander. My grandfather used to say a well-patched sail lasts three winters and two weddings. This one will last four — to the priest\'s scandal.',
          options: [
            {
              text: 'To the sails, Tom.',
              action: [
                { t: 'takeItem', id: 'lona', count: 3 },
                { t: 'takeItem', id: 'cuerda', count: 2 },
                { t: 'talk', target: 'tom_vela' },
                { t: 'flag', flag: 'vela_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_cazatormentas: report the storm
      cond: 'storm_at_sea',
      notCond: 'tormenta_done',
      start: 'to1',
      nodes: {
        to1: {
          text: 'So you really rode out the storm? With thunder, waves, and that ugly silence that comes before the blow? … Bah. I rode one out too, back in \'84. But I know a sailor when I see one honor his bet so well. The jug is yours.',
          options: [
            {
              text: 'Paid in full, Tom.',
              action: [
                { t: 'talk', target: 'tom_tormenta' },
                { t: 'flag', flag: 'tormenta_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_raciones: offer
      cond: 'talked_aldric',
      notCond: 'raciones_started',
      start: 'ra0',
      nodes: {
        ra0: {
          text: 'Hey, sailor! The low tide left fish stranded all along the coast — four fish, and the gulls will get them before I do. You go gather them, with those young legs of yours, and the village larders will thank you.',
          options: [
            {
              text: 'For the Sunday stew.',
              action: [
                { t: 'flag', flag: 'raciones_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_vela: offer
      cond: 'ship_repaired',
      notCond: 'vela_started',
      start: 've0',
      nodes: {
        ve0: {
          text: 'My skiff has more patches than sail, and winter will not wait. Three waxed canvases and two hemp ropes will leave her like new. Rosa prepares the canvas — the good grade this time, not the corsairs\'.',
          options: [
            {
              text: 'I\'ll get them for you.',
              action: [
                { t: 'flag', flag: 'vela_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_cazatormentas: offer
      cond: 'ship_repaired',
      notCond: 'storm_at_sea',
      start: 'ca0',
      nodes: {
        ca0: {
          text: 'See that sky? Sooner or later it will thunder. And I will wager the jug that no living body can ride out a real storm out there, on the high sea. Sail when it thunders, and come back to tell me… if you come back.',
          options: [
            {
              text: 'Bet accepted.',
              action: [
                { t: 'flag', flag: 'cazatormentas_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- ROSA — the tavern tales ----------------
  rosa: [
    {
      // sq_cartas: tablets report
      cond: 'lore_tower_door',
      notCond: 'cartas_done',
      start: 'rc1f',
      nodes: {
        rc1f: {
          text: 'All three tales! The sunken kingdom, the breathing altar and the mad watchman… with those I have tavern nights for the whole winter. "The Broken Anchor Tavern presents: THE TABLETS OF THE COAST." Have a drink on the house — and on me.',
          options: [
            {
              text: 'The songs are yours, Rosa.',
              action: [
                { t: 'talk', target: 'rosa_cartas' },
                { t: 'flag', flag: 'cartas_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_cartas: offer
      cond: 'rosa_done',
      notCond: 'cartas_started',
      start: 'rc0',
      nodes: {
        rc0: {
          text: 'Slow trade and long nights — that is the state of the house. I need new tales, do you hear? They say there are three ancient tablets around the island — ruins, stones, tower — with stories of sunken kings. Read them all and bring me the juice: I will turn it into song.',
          options: [
            {
              text: 'I\'m all ears… and eyes.',
              action: [
                { t: 'flag', flag: 'cartas_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- ELIN — the shopkeeper ----------------
  elin: [
    {
      // sq_espejo: mirror delivery
      cond: 'espejo_started',
      notCond: 'espejo_done',
      requireItem: { id: 'espejo', count: 1 },
      start: 'ep1',
      nodes: {
        ep1: {
          text: 'The lighthouse mirror! Do you know how many storms this brass must have reflected? I will set it by the register: I want to see who comes in twice. Fair price, clean deal — as always with you.',
          options: [
            {
              text: 'A clean deal.',
              action: [
                { t: 'takeItem', id: 'espejo', count: 1 },
                { t: 'talk', target: 'elin_espejo' },
                { t: 'flag', flag: 'espejo_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_caravana: wood delivery (needs the cart hitched)
      cond: 'caravana_started',
      notCond: 'caravana_done',
      requireItem: { id: 'madera', count: 2 },
      start: 'cv1',
      nodes: {
        cv1: {
          text: 'The cart and the timber! Listen to that creak — that is the sound of real trade. Let us unload… Done. Double the coins, as I promised: roads that creak pay better than promises.',
          options: [
            {
              text: 'A creak you can hear from far away.',
              action: [
                { t: 'takeItem', id: 'madera', count: 2 },
                { t: 'talk', target: 'elin_caravana' },
                { t: 'flag', flag: 'caravana_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_moneda: ancient coins delivery
      cond: 'moneda_started',
      notCond: 'moneda_done',
      requireItem: { id: 'moneda_antigua', count: 3 },
      start: 'mn1',
      nodes: {
        mn1: {
          text: 'Three Thalassar coins… look at the edge — you can still read the crown. Old gold tells stories better than new — and stories are my most expensive wares. Collector\'s price, no haggling.',
          options: [
            {
              text: 'Gold that tells stories.',
              action: [
                { t: 'takeItem', id: 'moneda_antigua', count: 3 },
                { t: 'talk', target: 'elin_moneda' },
                { t: 'flag', flag: 'moneda_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_comercio: rich report
      cond: 'rich_200',
      notCond: 'comercio_done',
      start: 'cm1',
      nodes: {
        cm1: {
          text: 'Two hundred coins on you… ha. I know a true trader when I see one, even one who goes armed. Take what was promised: saddlebags of good leather, double-stitched, for your mount. May the gold never weigh on you more than the saddle.',
          options: [
            {
              text: 'Good leather, Erica.',
              action: [
                { t: 'item', id: 'alforjas', count: 1 },
                { t: 'talk', target: 'elin_comercio' },
                { t: 'flag', flag: 'comercio_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // Offers: mirror + coins
      cond: 'talked_aldric',
      notCond: 'espejo_started',
      start: 'ep0',
      nodes: {
        ep0: {
          text: 'Do you know what I collect? Anything that reflects a story. They say the Wardens\' brass mirror still lies in the chest on the Lighthouse Sea Stack… Bring it to me, and I will pay you like family.',
          options: [
            {
              text: 'A mirror with a story. I\'ll see.',
              action: [
                { t: 'flag', flag: 'espejo_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      cond: 'talked_aldric',
      notCond: 'moneda_started',
      start: 'mn0',
      nodes: {
        mn0: {
          text: 'One more thing: the tide drags Thalassar coins — gold of the sunken kingdom — into the most hidden caves. Three coins would make my collection of the century. Look for them in the chests no one remembers.',
          options: [
            {
              text: 'The caves no one remembers. On my way.',
              action: [
                { t: 'flag', flag: 'moneda_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      cond: 'ship_repaired',
      notCond: 'caravana_started',
      start: 'cv0',
      nodes: {
        cv0: {
          text: 'The warehouse is running out of timber, and roads do not walk themselves. If you could get a cart — Halvard has one — and two oak planks for my shop, I will pay you double. Triple, if the cart creaks with dignity.',
          options: [
            {
              text: 'It will creak with the utmost dignity.',
              action: [
                { t: 'flag', flag: 'caravana_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      cond: 'ship_repaired',
      notCond: 'comercio_started',
      start: 'cm0',
      nodes: {
        cm0: {
          text: 'A true trader eventually carries two hundred coins — "gold that goes uncounted makes no sound." Gather them and come back to show off: I have some leather set aside that will interest you.',
          options: [
            {
              text: 'Two hundred… and showing off.',
              action: [
                { t: 'flag', flag: 'comercio_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- JORUND — the guard ----------------
  jorund: [
    {
      // sq_fuegos: lighthouse report
      cond: 'poi_faro',
      notCond: 'fuegos_done',
      start: 'fu1',
      nodes: {
        fu1: {
          text: 'Still standing? Three centuries of storms, and there it stands, stubborn as an oath. I will note it in the guard book: "The coast sees. The coast knows." Good work, civilian — for a civilian.',
          options: [
            {
              text: 'The coast sees, guard.',
              action: [
                { t: 'talk', target: 'jorund_fuegos' },
                { t: 'flag', flag: 'fuegos_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_bounty: drakelings reward
      cond: 'drake_grotto_dead',
      notCond: 'bounty_done',
      start: 'bo1',
      nodes: {
        bo1: {
          text: 'The circle AND the grotto? Both nests cleaned out… The shepherds will nap again, and the guild will pay without weeping. Two bounties, one per nest. I will call you "skysweeper" — and I do not know if that is a rank or an insult. Take the gold.',
          options: [
            {
              text: 'Skysweeper sounds fine.',
              action: [
                { t: 'talk', target: 'jorund_bounty' },
                { t: 'flag', flag: 'bounty_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_fuegos: offer
      cond: 'talked_aldric',
      notCond: 'fuegos_started',
      start: 'fu0',
      nodes: {
        fu0: {
          text: 'Work for you, if you like the roads: to the east there is a sea stack with a ruined lighthouse. A kingdom without a lighthouse is a kingdom gone blind, my captain used to say. Check that it still stands and bring me the news.',
          options: [
            {
              text: 'Long road, fresh news.',
              action: [
                { t: 'flag', flag: 'fuegos_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_bounty: offer — Fase 27: Jorund only posts DRAGON bounties once
      // the dragons have entered the story (Aldric's "winged shadows" talk,
      // q6). No dragon missions from the very start of the game.
      cond: 'aldric_dragons_talked',
      notCond: 'bounty_started',
      start: 'bo0',
      nodes: {
        bo0: {
          text: 'Small dragons, big problems: the drakelings of the Circle of Vigils and the crystal grotto have the shepherds herding in fear. I pay for each nest cleaned. No questions — just coins.',
          options: [
            {
              text: 'Clean nests, counted coins.',
              action: [
                { t: 'flag', flag: 'bounty_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- SIGRID — the laundress ----------------
  sigrid: [
    {
      // sq_cascada: nightfall report
      cond: 'cascada_escuchada',
      notCond: 'cascada_done',
      start: 'sc1',
      nodes: {
        sc1: {
          text: 'You heard it too? I knew I was not mad! "If you sit at the edge when the last sun falls, the water sings with human voices" — that is what I said, and that is what happened. Those who sleep below know new songs. Thank you for listening for me.',
          options: [
            {
              text: 'It sings differently, yes.',
              action: [
                { t: 'talk', target: 'sigrid_cascada' },
                { t: 'flag', flag: 'cascada_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_cascada: offer
      cond: 'talked_aldric',
      notCond: 'cascada_started',
      start: 'sc0',
      nodes: {
        sc0: {
          text: 'The port folk call me mad for this, but listen: the waterfall sings differently when night falls. Sit at the pool\'s edge when the last sun sets — and then tell me what you heard. I need to know I did not dream it.',
          options: [
            {
              text: 'I\'ll listen for the both of us.',
              action: [
                { t: 'flag', flag: 'cascada_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],
};

// ---- Halvard: brand-new NPC (the stable master) ----
const HALVARD: NPCDialogue = {
  npcId: 'halvard',
  name: 'Halvard the Farrier',
  trees: [
    {
      // q10: Tormenta, the Order's warhorse
      cond: 'corona_thalassar_counted',
      notCond: 'halvard_horse_talked',
      start: 'h1',
      nodes: {
        h1: {
          text: 'So the Crown has returned… and you are the Warden who brought it. Then it is time. Come — let me introduce you to someone: TORMENTA. Eirik\'s warhorse. Twelve winters I have tended him, waiting for the Order to have a human voice again.',
          options: [
            { text: 'Was he my father\'s?', next: 'h2' },
            { text: 'Twelve winters… why did you never ride him?', next: 'h3' },
          ],
        },
        h2: {
          text: 'Since you were a child. Eirik used to say "a Warden on foot is half a Warden." This animal knows the paths of Aldmor better than Aldric\'s maps. And he will love you — he already does. The Order\'s horses smell the blood of their riders.',
          options: [{ text: 'And is he ready to ride?', next: 'h4' }],
        },
        h3: {
          text: 'And steal the horse of my best customer\'s son? In this house, honor weighs more than the saddle. Besides: Tormenta would accept none but a Warden. Ride him with pride… and with carrots, now and then.',
          options: [{ text: 'And is he ready to ride?', next: 'h4' }],
        },
        h4: {
          text: 'Saddled and eager. I will also leave you the stable cart, for when trade comes calling — hitch it whenever you like. And if you find yourself far from your mount, whistle for him: the Order\'s horses always come. May he carry you far, Warden.',
          options: [
            {
              text: 'May he carry us far, Halvard.',
              action: [
                { t: 'talk', target: 'halvard_horse' },
                { t: 'flag', flag: 'halvard_horse_talked' },
                { t: 'flag', flag: 'tormenta_gifted' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // q12: barding & saddlebags
      cond: 'bram_forge_talked',
      notCond: 'halvard_barding_talked',
      start: 'hb1',
      nodes: {
        hb1: {
          text: 'Going after the Crow? Then Tormenta goes too. I have saddled him with the battle saddlebags — water, grain, bandages. An Order horse goes into battle prepared. Not one loose nail, Warden.',
          options: [
            {
              text: 'I will take care of him.',
              action: [
                { t: 'item', id: 'alforjas', count: 1 },
                { t: 'talk', target: 'halvard_barding' },
                { t: 'flag', flag: 'halvard_barding_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_caballos: wild horses report
      cond: 'wildhorse_2_done',
      notCond: 'caballos_paid',
      start: 'hc1',
      nodes: {
        hc1: {
          text: 'Both marked! North meadow and west meadow… I knew where those rascals were roaming. I will whistle, and they will come back on their own, like good stock. Take your pay — and a free piece of advice: if you ever want a colt of your own, the chestnut grazing with them is of good blood.',
          options: [
            {
              text: 'Good stock and good advice.',
              action: [
                { t: 'talk', target: 'halvard_caballos' },
                { t: 'flag', flag: 'caballos_paid' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_caballos: offer
      cond: 'talked_aldric',
      notCond: 'caballos_started',
      start: 'hc0',
      nodes: {
        hc0: {
          text: 'Hands free? Good. Two colts escaped me — the chestnut toward the north meadow, near the waterfall trail, and the gray toward the west meadow, bound for the ruins. Mark them for me when you see them; I will come with the rope and the patience.',
          options: [
            {
              text: 'Colt north and colt west. Noted.',
              action: [
                { t: 'flag', flag: 'caballos_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // Default tree
      start: 'hd0',
      nodes: {
        hd0: {
          text: 'Halvard\'s stables: real horses, real stories. If you need a mount, let us talk. If you need a hearth, Rosa\'s tavern.',
          options: [
            { text: 'See you later, Halvard.', action: { t: 'close' } },
          ],
        },
      },
    },
  ],
};

// ---- The final choice at the Altar of the Tides ----
const ALTAR_DECISION: NPCDialogue = {
  npcId: 'altar_decision',
  name: 'The Altar of the Tide',
  trees: [
    {
      cond: 'altar_ready',
      start: 'ad1',
      nodes: {
        ad1: {
          text: 'The three relics rest in their hollows. The Seal sings low, the Crown weighs like a promise, the Crow\'s Heart beats without shadow. The altar awaits your hand — and all Eldoria holds its breath. What will you do, Warden?',
          options: [
            {
              text: 'Restore the pact: the Order will keep the tides forever.',
              next: 'ad_guardian',
            },
            {
              text: 'Raise the Crown: unite the islands under a new throne — mine.',
              next: 'ad_crown',
            },
            {
              text: 'Free the sea: no pacts, no crowns. Give everything back to the tide.',
              next: 'ad_free',
            },
          ],
        },
        ad_guardian: {
          text: 'You lay your hand upon the Seal. Tide-light runs through the relics, the Nest and the whole sky: the old pact is woven anew, with your oath for thread. The dragons will sleep again, guarded. The Order of the Tide has returned — to stay.',
          options: [
            {
              text: 'For the Order. For Eldoria.',
              action: [
                { t: 'flag', flag: 'ending_guardian' },
                { t: 'close' },
              ],
            },
          ],
        },
        ad_crown: {
          text: 'You raise the Crown of Thalassar above your brow. The cold metal suddenly tempers, as if it had waited a hundred years for this temple. The three lights converge on you: Seal, Heart and Crown swear loyalty to a single name — yours. Eldoria has a new sovereign.',
          options: [
            {
              text: 'May the sea remember my name.',
              action: [
                { t: 'flag', flag: 'ending_crown' },
                { t: 'close' },
              ],
            },
          ],
        },
        ad_free: {
          text: 'One by one, you give the relics back to the tide: the Seal to the water, the Crown to the depths, the Heart to the current. No pact, no crown, no oath left to break. The sea is left free… and with it, everything that swims, flies and breathes in Eldoria.',
          options: [
            {
              text: 'The sea has no master.',
              action: [
                { t: 'flag', flag: 'ending_free' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],
};

// ---- Apply: prepend trees, add new NPCs ----
for (const [npcId, trees] of Object.entries(INSERTS)) {
  const npc = DIALOGUES[npcId];
  if (npc) {
    npc.trees.unshift(...trees);
  }
}
DIALOGUES[HALVARD.npcId] = HALVARD;
DIALOGUES[ALTAR_DECISION.npcId] = ALTAR_DECISION;
