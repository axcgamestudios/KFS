import type { QuestDef } from './quests';

/**
 * Fase 4 quest content — Chapters IV & V (the Crow storyline) plus the
 * nineteen secondary quests that complete the 20-mission campaign.
 * Merged into QUESTS by quests.ts.
 *
 * Objective contracts (all resolve through real systems):
 *  - talk    → dialogue options fire { t:'talk', target }
 *  - collect → inventory counts / `collected_` flags
 *  - interact→ world interactable ids (Game.buildInteractables)
 *  - flag    → story flags set by combat/naval/mount/ending systems
 */
export const QUESTS_F4: Record<string, QuestDef> = {
  // ============ FASE 12 — CAZA DE RECOMPENSAS (acción pura) ============
  sq_cazarrecompensas: {
    id: 'sq_cazarrecompensas',
    title: 'The Hunt for the Crow',
    description: 'Crowhaven\'s bounty board pays cold, hard gold for every red knight put down. Six heads, and the purse is yours.',
    journal: 'I tore the bounty notice off the square. The Crow\'s red knights raid the roads of Aldmor: their camps mark the King\'s Road, the ruins of Vaelthara, the Circle of Vigils, and the west coast. Six brigands. That is the hunt.',
    objectives: [
      { id: 'o1', text: 'Put down 6 of the Crow\'s red knights', type: 'kill', target: 'bandit', count: 6 },
      { id: 'o2', text: 'Collect the bounty at the board in the square', type: 'interact', target: 'bounty_board' },
    ],
    rewards: { xp: 220, items: [{ id: 'coin', count: 150 }, { id: 'pocion', count: 2 }] },
    nextQuest: 'sq_tormenta_caminos',
    completionJournal: 'Six red banners burned, and a purse of gold with honest weight to it. The King\'s Road is passable again... though the Crow is still up there, weaving his three-headed nest.',
  },
  sq_tormenta_caminos: {
    id: 'sq_tormenta_caminos',
    title: 'The Wrath of the King\'s Road',
    description: 'Brigands have set a toll on the road to the castle. Master Aldric pays to clear it: ten raiders in all, and trade reopens.',
    journal: 'Aldric has charged me with clearing the King\'s Road from Crowhaven to the castle. "Not even provisions get through anymore," he says. The Order pays well for every raider who falls. Let the road tremble.',
    objectives: [
      { id: 'o1', text: 'Put down 10 red knights in total (the hunt continues)', type: 'kill', target: 'bandit', count: 10 },
    ],
    rewards: { xp: 160, items: [{ id: 'coin', count: 90 }] },
    completionJournal: 'The King\'s Road breathes again. Carts climb to the castle once more with grain and iron, and Aldric sealed my reward with the seal of the Order.',
  },
  // ================= CHAPTER IV — LA CORONA HUNDIDA =================
  q10_orden: {
    id: 'q10_orden',
    title: 'The Order Reunited',
    description: 'With the Ancestor\'s Fang in your keeping, Aldric must reveal to you the Order of the Tide\'s last secret: the sunken sanctuary of Thalassar.',
    journal: 'The Ancestor\'s Fang has opened Aldric\'s sealed archives. The Order of the Tide once kept three relics: the Seal (recovered from Morwen), the Heart of the Tide (torn from Vaelthara)… and the Crown of Thalassar, which rested with the sunken kings in their sanctuary beneath the waves. If the Crown returns to the light, the Order can be gathered anew.',
    objectives: [
      { id: 'o1', text: 'Talk to Aldric about the Order of the Tide', type: 'talk', target: 'aldric_f4' },
      { id: 'o2', text: 'Swim down to the sunken sanctuary of Thalassar', type: 'interact', target: 'santuario_thalassar' },
      { id: 'o3', text: 'Recover the Crown of Thalassar', type: 'collect', target: 'corona_thalassar', count: 1 },
      { id: 'o4', text: 'Talk to Halvard, the stable farrier', type: 'talk', target: 'halvard_horse' },
    ],
    rewards: { xp: 280, items: [{ id: 'pocion', count: 2 }] },
    nextQuest: 'q11_estandarte',
    completionJournal: 'The Crown of Thalassar weighs on my pack like a promise. Halvard the farrier was waiting for me: "The Order has a Warden again, and a Warden does not go on foot." Tormenta, my father\'s warhorse, still lives in his stable. At last I ride. Chapter IV: The Sunken Crown.',
  },
  q11_estandarte: {
    id: 'q11_estandarte',
    title: 'The Banner of the Crow',
    description: 'The Crow\'s corsairs are regrouping under a black banner. An elite hunter stalks the waters of the bay, and the Crow\'s nautical chart lies in a wreck off Old Crow Isle.',
    journal: 'The Crown has woken more than hopes: the crows feel it too. An elite brigantine hunts every sail that leaves Crowhaven. Aldric believes the Crow\'s nautical chart — the route to his secret cove — went down with the Admiral\'s flagship at Old Crow Isle. First the hunter. Then the wreck.',
    objectives: [
      { id: 'o1', text: 'Sink the Crow\'s hunter on the high seas', type: 'flag', target: 'elite_hunter_sunk' },
      { id: 'o2', text: 'Explore the flagship\'s wreck (Old Crow Isle)', type: 'interact', target: 'wreck_flagship' },
      { id: 'o3', text: 'Recover the Crow\'s Navigation Chart', type: 'collect', target: 'carta_navegacion', count: 1 },
    ],
    rewards: { xp: 300, items: [{ id: 'coin', count: 150 }] },
    nextQuest: 'q12_acero',
    completionJournal: 'The Crow\'s hunter rests on the seabed, his arrogance with him. Among the ribs of the flagship I found the chart: a nameless cove to the northwest, "where the Crow sleeps," and the Order\'s banner, stolen by the Crow a hundred years ago. The final route is drawn. Only the steel is missing.',
  },
  q12_acero: {
    id: 'q12_acero',
    title: 'Steel and Oath',
    description: 'Bram can forge the weapon of the Wardens from the Ancestor\'s Fang and dragon scales. Maren brews her potions, and Halvard fits Tormenta with barding for the battle.',
    journal: 'The chart marks the Crow\'s cove, but no one in their right mind wakes "the three-headed shadow" with a market-stall sword. Bram says the Ancestor\'s fang still remembers the pact: with it and three dragon scales he can forge the Warden\'s Sword. Maren readies her salves. Halvard fits Tormenta with barding.',
    objectives: [
      { id: 'o1', text: 'Talk to Bram about the Warden\'s forge', type: 'talk', target: 'bram_forge' },
      { id: 'o2', text: 'Gather 3 dragon scales (0/3)', type: 'collect', target: 'escama', count: 3 },
      { id: 'o3', text: 'Forge the Warden\'s Sword at the smithy', type: 'interact', target: 'forge_guardian' },
      { id: 'o4', text: 'Accept Maren\'s provisions', type: 'talk', target: 'maren_potions' },
      { id: 'o5', text: 'Talk to Halvard about barding Tormenta', type: 'talk', target: 'halvard_barding' },
    ],
    rewards: { xp: 320, items: [{ id: 'pocion', count: 3 }] },
    nextQuest: 'q13_despertar',
    completionJournal: 'The forge sang all night. The Ancestor\'s fang folded in on itself three times before it accepted its new shape: a sword that hisses like the tide when it cuts the air. Maren loaded me down with potions "for you, and for those you do not reach in time to save." Halvard fitted the new saddlebags on Tormenta. We are ready. Let the Crow wake.',
  },
  // ================= CHAPTER V — EL CUERVO DE TRES CABEZAS =================
  q13_despertar: {
    id: 'q13_despertar',
    title: 'The Crow\'s Awakening',
    description: 'The Crow\'s chart reveals the Cove of Silence, beneath the Old Crow Fortress. There sleeps Kraivenn, the Three-Headed Crow: the shadow of the first broken oath.',
    journal: 'The cove appears on no modern chart: an amphitheater of basalt beneath the pirate fortress, watched over by a statue of a knight of the Order. Aldric gave me his final warning: "Kraivenn is not just another dragon. He is the shadow of the first broken oath. He will not bargain with you: dragons are not what the songs say — and he is the reason why." The altar at the center bears three sockets: seal, heart… and one left empty, begging for a crown.',
    objectives: [
      { id: 'o1', text: 'Reach the Cove of Silence beneath the Crow Fortress', type: 'flag', target: 'kraivenn_seen' },
      { id: 'o2', text: 'Wake the Crow at the black altar', type: 'interact', target: 'altar_cuervo' },
      { id: 'o3', text: 'Defeat Kraivenn, the Three-Headed Crow', type: 'flag', target: 'kraivenn_dead' },
      { id: 'o4', text: 'Take the Heart of the Crow', type: 'collect', target: 'corazon_cuervo', count: 1 },
    ],
    rewards: { xp: 800, items: [{ id: 'coin', count: 400 }] },
    nextQuest: 'q14_consejo',
    completionJournal: 'Kraivenn has fallen. The shadow that drank the broken oath came undone into feathers of obsidian, and at the center of his chest burned a black heart that casts no shadow. The fortress is silent; the sea, in expectant calm. The legend of the Crow ends here… or mine begins. Chapter V: The Fate of the Tides.',
  },
  q14_consejo: {
    id: 'q14_consejo',
    title: 'The Council of the Tides',
    description: 'With the three relics gathered — Seal, Crown, and Heart — Aldric summons the first Council of the Tides in a hundred years. The sanctuary of Thalassar answers.',
    journal: 'Three relics: the Seal Morwen stole, the Crown the sea kept safe, the Heart Kraivenn fed on broken oaths. Aldric says that together they "sing" — and that the sunken sanctuary hears them. The Council of the Tides must gather at the Ancestor\'s Nest, where the pact was signed. There I will decide what to do with the fate of Eldoria.',
    objectives: [
      { id: 'o1', text: 'Return to Aldric with the Heart of the Crow', type: 'talk', target: 'aldric_consejo' },
      { id: 'o2', text: 'Climb to the Ancestor\'s Nest in the Iceclaw Peaks', type: 'interact', target: 'altar_marea' },
    ],
    rewards: { xp: 350 },
    nextQuest: 'q15_destino',
    completionJournal: 'The altar of the Nest knew the relics: the bed of coins opened, and a light like the tide ran through the whale ribs like a heartbeat. Aldric laid his hand on my shoulder: "Three roads, Warden. None of them easy. None of them can be walked back." The whole sea holds its breath.',
  },
  q15_destino: {
    id: 'q15_destino',
    title: 'The Fate of the Tides',
    description: 'Before the altar of the pact, the three relics await your decision: restore the pact, raise the crown, or free the sea. The fate of Eldoria is in your hands.',
    journal: 'The Ancestor\'s altar accepts the three relics. I feel the weight of a hundred years of dead Wardens and drowned kingdoms. Restore the pact: the Order will keep watch over the tides forever, as it once did. Raise the Crown: unite the isles under a new throne — mine — and loyal dragons. Or give it all back to the sea: no pacts, no crowns, an Eldoria set free. No one can choose for me.',
    objectives: [
      { id: 'o1', text: 'Make your choice at the Altar of the Tide', type: 'interact', target: 'altar_decision' },
      { id: 'o2', text: 'Seal your fate in Eldoria', type: 'flag', target: 'ending_done' },
    ],
    rewards: { xp: 500 },
    completionJournal: 'I have decided. The course of the forgotten seas has a master now — or has lost one forever. The songs will say whatever they like; I was there.',
  },

  // ================= SECONDARY QUESTS (sq = side) =================
  sq_raciones: {
    id: 'sq_raciones',
    title: 'Rations for the Village',
    description: 'Tom the fisherman needs to restock the larders: the low tide has stranded fish all along the coast.',
    journal: 'Tom swears "the tide leaves the catch on the sand for whoever stoops to pick it up." Gather four fish stranded along the coast and bring them to him before the gulls do.',
    objectives: [
      { id: 'o1', text: 'Collect 4 fish from the coast (0/4)', type: 'collect', target: 'pez', count: 4 },
      { id: 'o2', text: 'Deliver them to Tom', type: 'talk', target: 'tom_raciones' },
    ],
    rewards: { xp: 70, items: [{ id: 'coin', count: 35 }] },
    completionJournal: 'Tom cooked up a stew that "tastes of a Sunday." The village larders will hold out another month. "The sea looks after those who bend their backs," he said, spitting into the water with elegance.',
  },
  sq_yunque: {
    id: 'sq_yunque',
    title: 'The Kindled Anvil',
    description: 'Bram seeks dragon scales to temper a new steel. Three scales will do.',
    journal: 'Bram collects scales "the way other men collect grudges." Three dragon scales would let him temper the finest steel in the north — and he owes me.',
    objectives: [
      { id: 'o1', text: 'Gather 3 dragon scales (0/3)', type: 'collect', target: 'escama', count: 3 },
      { id: 'o2', text: 'Bring them to Bram', type: 'talk', target: 'bram_yunque' },
    ],
    rewards: { xp: 90, items: [{ id: 'coin', count: 60 }, { id: 'pocion', count: 1 }] },
    completionJournal: 'Bram weighed the scales one by one, smiled like a man who has not smiled in years, and promised me "an edge that will cut the mist." And a debt repaid.',
  },
  sq_espejo: {
    id: 'sq_espejo',
    title: 'The Mirror Route',
    description: 'Elin the shopkeeper collects rarities from the seas. The brass mirror of the Lighthouse Sea Stack would be the jewel of her counter.',
    journal: 'Elin pays well for "anything that reflects stories." The lighthouse mirror, if it still lies in the chest on the Sea Stack, reflects a century of storms.',
    objectives: [
      { id: 'o1', text: 'Get the lighthouse mirror (chest on the Sea Stack)', type: 'collect', target: 'espejo', count: 1 },
      { id: 'o2', text: 'Sell it to Elin', type: 'talk', target: 'elin_espejo' },
    ],
    rewards: { xp: 80, items: [{ id: 'coin', count: 70 }] },
    completionJournal: 'Elin set the mirror beside the till "to see who comes in twice." She paid me in gold and in laughter, which in Crowhaven are worth nearly the same.',
  },
  sq_fuegos: {
    id: 'sq_fuegos',
    title: 'Fires on the Coast',
    description: 'Jorund wants to confirm that the old lantern of the Lighthouse Sea Stack still stands and can be seen from the sea.',
    journal: 'Jorund patrols the east road and swears "a kingdom without a lighthouse is a kingdom gone blind." Check that the Sea Stack\'s ruins still stand, and tell him.',
    objectives: [
      { id: 'o1', text: 'Discover the Lighthouse Sea Stack', type: 'flag', target: 'poi_faro' },
      { id: 'o2', text: 'Report to Jorund', type: 'talk', target: 'jorund_fuegos' },
    ],
    rewards: { xp: 70, items: [{ id: 'coin', count: 30 }] },
    completionJournal: 'The lighthouse ruins still stand, stubborn as an oath. Jorund wrote it down in his guard book: "The coast sees. The coast knows."',
  },
  sq_petalo_tumba: {
    id: 'sq_petalo_tumba',
    title: 'Petals for the Tomb',
    description: 'Maren wishes to honor the fallen Wardens with five ivory petals upon the stone circle.',
    journal: 'The fallen Wardens rest in the western stone circle. Maren says ivory petals "bloom where the water sings," and that five are enough to keep the dead from feeling forgotten.',
    objectives: [
      { id: 'o1', text: 'Gather 5 ivory petals (0/5)', type: 'collect', target: 'petalo', count: 5 },
      { id: 'o2', text: 'Leave them with Maren', type: 'talk', target: 'maren_petalo' },
    ],
    rewards: { xp: 90, items: [{ id: 'pocion', count: 2 }] },
    completionJournal: 'Maren laid the petals on the altar with the tenderness of someone combing a sleeper\'s hair. "Now the Order sleeps with music," she said. I thought of Eirik.',
  },
  sq_caravana: {
    id: 'sq_caravana',
    title: 'Elin\'s Caravan',
    description: 'Elin needs a cart of timber brought to her shop. You will need a horse and Halvard\'s cart.',
    journal: 'Elin\'s warehouse is running out of timber, and "roads do not walk themselves." Halvard lends his cart: hitch it to a horse, load two planks, and bring them to her. Trade in Crowhaven is moving again.',
    objectives: [
      { id: 'o1', text: 'Hitch the cart to a horse', type: 'flag', target: 'cart_hitched' },
      { id: 'o2', text: 'Gather 2 oak planks (0/2)', type: 'collect', target: 'madera', count: 2 },
      { id: 'o3', text: 'Deliver the timber to Elin with the cart', type: 'talk', target: 'elin_caravana' },
    ],
    rewards: { xp: 110, items: [{ id: 'coin', count: 90 }] },
    completionJournal: 'The cart creaked up to Elin\'s shop like an old woman carrying remedies. The timber was stacked, and Elin counted out twice the coins: "real freight pays better than promises."',
  },
  sq_caballos: {
    id: 'sq_caballos',
    title: 'The Lost Horses',
    description: 'Two of Halvard\'s wild horses graze lost across the meadows of Aldmor. Find them and mark their positions.',
    journal: 'Halvard\'s colts escaped "because the meadows are wide and the fences are short." One was grazing toward the waterfall; the other, toward the ruins. Mark them so Halvard can bring them home.',
    objectives: [
      { id: 'o1', text: 'Find the colt in the north meadow', type: 'interact', target: 'wildhorse_1' },
      { id: 'o2', text: 'Find the colt in the west meadow', type: 'interact', target: 'wildhorse_2' },
      { id: 'o3', text: 'Let Halvard know', type: 'talk', target: 'halvard_caballos' },
    ],
    rewards: { xp: 100, items: [{ id: 'coin', count: 50 }] },
    completionJournal: 'Halvard whistled, and the colts came back on their own, "like good stock." He taught me to whistle just the same "in case you ever buy yourself a horse with proper judgment."',
  },
  sq_cascada: {
    id: 'sq_cascada',
    title: 'The Song of the Waterfall',
    description: 'Sigrid swears the waterfall "sings differently" when night falls. Listen to it yourself, and tell her what you heard.',
    journal: 'Sigrid does the washing by day, but at night she listens to the waterfall: "if you sit at the edge as the last of the sun falls, the water sings with the voices of people." Sit beside the waterfall at dusk and listen.',
    objectives: [
      { id: 'o1', text: 'Listen to the waterfall at nightfall (by the pond)', type: 'interact', target: 'cascada_noche' },
      { id: 'o2', text: 'Tell Sigrid about it', type: 'talk', target: 'sigrid_cascada' },
    ],
    rewards: { xp: 80, items: [{ id: 'coin', count: 40 }] },
    completionJournal: 'The waterfall sang. I could not say with what voice, but it sang. Sigrid smiled like someone confirming a secret: "those who sleep below know new songs."',
  },
  sq_cartas: {
    id: 'sq_cartas',
    title: 'Castaways\' Letters',
    description: 'Rosa collects shipwreck stories for her tavern nights. Read her the three ancient tablets of the island.',
    journal: '"A tavern without stories is a tavern without drink," says Rosa. Three ancient tablets lie scattered across the island: one in the ruins, one in the stone circle, and one in the watchman\'s tower. Read them all.',
    objectives: [
      { id: 'o1', text: 'Read the tablet in the ruins', type: 'flag', target: 'lore_tablet_ruins' },
      { id: 'o2', text: 'Touch the altar in the stone circle', type: 'flag', target: 'lore_stones_center' },
      { id: 'o3', text: 'Examine the walled-up door of the tower', type: 'flag', target: 'lore_tower_door' },
      { id: 'o4', text: 'Tell Rosa everything', type: 'talk', target: 'rosa_cartas' },
    ],
    rewards: { xp: 90, items: [{ id: 'pocion', count: 1 }, { id: 'coin', count: 25 }] },
    completionJournal: 'Rosa heard the three tales with her elbows on the bar and her eyes like candles. "Tonight the tavern sings on its own," she announced. The cinnamon smelled of glory again.',
  },
  sq_bounty: {
    id: 'sq_bounty',
    title: 'Drakeling Hunter',
    description: 'The drakelings nesting in the Circle of Vigils and the grotto frighten the shepherds. Jorund pays for each one.',
    journal: 'Small dragons, big problems: the drakelings of the stone circle and the crystal grotto have put the flocks to grazing in fear. Jorund pays well for every nest cleaned out.',
    objectives: [
      { id: 'o1', text: 'Clear out the nest in the Circle of Vigils', type: 'flag', target: 'drake_stones_dead' },
      { id: 'o2', text: 'Clear out the nest in the grotto', type: 'flag', target: 'drake_grotto_dead' },
      { id: 'o3', text: 'Collect the bounty from Jorund', type: 'talk', target: 'jorund_bounty' },
    ],
    rewards: { xp: 140, items: [{ id: 'coin', count: 110 }] },
    completionJournal: 'The shepherds are taking their afternoon naps again. Jorund counted the coins twice — once for each nest — and called me "sky-sweeper," which I cannot tell is a rank or an insult.',
  },
  sq_moneda: {
    id: 'sq_moneda',
    title: 'Coins of Yesterday',
    description: 'Elin collects the coins of Thalassar that the tide drags into the caves. Three are enough to make her happy.',
    journal: 'The tide drags coins of the sunken kingdom into the island\'s most hidden corners. Elin pays generously for each one: "old gold tells stories better than new."',
    objectives: [
      { id: 'o1', text: 'Find 3 Thalassar coins (0/3)', type: 'collect', target: 'moneda_antigua', count: 3 },
      { id: 'o2', text: 'Bring them to Elin', type: 'talk', target: 'elin_moneda' },
    ],
    rewards: { xp: 120, items: [{ id: 'coin', count: 150 }] },
    completionJournal: 'Elin lined the coins up on a blue cloth and looked at them the way one looks at a memory. She paid without haggling. "An honest collector pays twice: in gold and in stories."',
  },
  sq_tesoro: {
    id: 'sq_tesoro',
    title: 'The Captain\'s Map',
    description: 'A treasure map drawn by your own father has turned up in the crystal grotto. Captain Eirik\'s blood knows where to dig.',
    journal: 'The map Eirik drew marks an X in the eastern cove, "beneath the shadow of the ruined lighthouse," where the low tide uncovers what the high tide hides. Let his blood be the one to find it, he wrote.',
    objectives: [
      { id: 'o1', text: 'Recover the treasure map (crystal grotto)', type: 'collect', target: 'mapa_tesoro', count: 1 },
      { id: 'o2', text: 'Dig at the X in the eastern cove', type: 'interact', target: 'dig_treasure' },
    ],
    rewards: { xp: 150, items: [{ id: 'coin', count: 200 }] },
    completionJournal: 'Two handspans beneath the sand rested Eirik\'s campaign chest: Order gold, arrows of fine willow, and a note — "I knew you would come back. Wardens always come back."',
  },
  sq_vela: {
    id: 'sq_vela',
    title: 'The Broken Sail',
    description: 'Tom wants to repair his sailboat before winter sets in: three canvas sheets and two ropes would be enough.',
    journal: 'Tom\'s sailboat "has more patches than sail." With three waxed canvas sheets and two hemp ropes she could put out to sea again. Rosa prepares the canvas; Tom himself sells the rope.',
    objectives: [
      { id: 'o1', text: 'Gather 3 canvas sheets (0/3)', type: 'collect', target: 'lona', count: 3 },
      { id: 'o2', text: 'Gather 2 ropes (0/2)', type: 'collect', target: 'cuerda', count: 2 },
      { id: 'o3', text: 'Deliver them to Tom', type: 'talk', target: 'tom_vela' },
    ],
    rewards: { xp: 80, items: [{ id: 'coin', count: 45 }] },
    completionJournal: 'Tom hoisted the new sail on the beach, and the sailboat looked ten years younger. "Now the sea and I are partners again," he said, winking at the horizon.',
  },
  sq_guardianes: {
    id: 'sq_guardianes',
    title: 'Wardens of Stone',
    description: 'A statue of a knight of the Order keeps watch over the north coast. Aldric wants to know if it still "remembers."',
    journal: 'Aldric spoke of a stone knight: "the Order carved their dead gazing out to sea, so that they would keep watch forever." Find the statue and the crystal grotto, and tell him what is left of them.',
    objectives: [
      { id: 'o1', text: 'Find the statue of the knight of the Order', type: 'flag', target: 'knight_seen' },
      { id: 'o2', text: 'Explore the crystal grotto', type: 'flag', target: 'poi_grotto' },
      { id: 'o3', text: 'Tell Aldric about it', type: 'talk', target: 'aldric_estatua' },
    ],
    rewards: { xp: 110, items: [{ id: 'pocion', count: 1 }] },
    completionJournal: 'The stone knight still stands, sword lowered and gaze on the sea: a Warden who never quite learned how to die. Aldric listened in silence and wrote something in his book of the Order.',
  },
  sq_arce: {
    id: 'sq_arce',
    title: 'The Great Maple',
    description: 'Maren speaks of a golden maple high up the valley: the oldest tree in Eldoria. Its seed is worth more than a promise.',
    journal: '"Before the war, the Wardens planted a maple for every oath kept," says Maren. Only one remains: golden, enormous, in a clearing in the north valley. Bring her a seed: she wants to plant the second.',
    objectives: [
      { id: 'o1', text: 'Find the Great Maple of the valley', type: 'flag', target: 'gran_arce_seen' },
      { id: 'o2', text: 'Gather a seed from the Great Maple', type: 'collect', target: 'semilla_arce', count: 1 },
      { id: 'o3', text: 'Bring it to Maren', type: 'talk', target: 'maren_arce' },
    ],
    rewards: { xp: 100, items: [{ id: 'pocion', count: 2 }] },
    completionJournal: 'Maren wrapped the seed in a damp cloth, the way one swaddles a newborn. "The second oath will grow beside the waterfall," she promised. May it fare better than the first.',
  },
  sq_cazatormentas: {
    id: 'sq_cazatormentas',
    title: 'Stormchaser',
    description: 'Tom bets there is no sailor alive who can take a true storm on the open sea. Prove him wrong.',
    journal: '"A storm in harbor is no storm," Tom growls. Put out to sea when the sky turns black and hold up your end of the wager: do not sink, and do not come back until thunder and waves have seen it all.',
    objectives: [
      { id: 'o1', text: 'Survive a storm while sailing the high seas', type: 'flag', target: 'storm_at_sea' },
      { id: 'o2', text: 'Tell Tom about it', type: 'talk', target: 'tom_tormenta' },
    ],
    rewards: { xp: 130, items: [{ id: 'coin', count: 80 }] },
    completionJournal: 'The storm saw me, thundered, and moved on; I stayed afloat. Tom poured the wager\'s tankard in silence, with the dignity of a man learning. "Sailor," he said at last. "Every letter of the word."',
  },
  sq_estandarte: {
    id: 'sq_estandarte',
    title: 'Obsidian Feathers',
    description: 'A black feather falls wherever the Crow roars. Gather three, and learn what they truly are.',
    journal: 'The fishermen gather up black feathers "harder than iron" after every shadow-flight. Collect three and bring them to Aldric: he knows how to read them.',
    objectives: [
      { id: 'o1', text: 'Gather 3 obsidian feathers (0/3)', type: 'collect', target: 'reliquia_cuervo', count: 3 },
      { id: 'o2', text: 'Show them to Aldric', type: 'talk', target: 'aldric_plumas' },
    ],
    rewards: { xp: 150, items: [{ id: 'coin', count: 100 }] },
    completionJournal: 'Aldric held the feathers up against the light of dusk. "They are not feathers," he said. "They are scales of shadow. The Crow is coming apart into oaths… and oaths seek a master."',
  },
  sq_lamento: {
    id: 'sq_lamento',
    title: 'The Lament of Vaelthara',
    description: 'Return to the ruins of Vaelthara after the warden\'s death and listen to what the silence has to say.',
    journal: 'The warden fell beneath my steel, but the ruins are still hers — no one\'s. Go back, sit among the columns, and listen: Aldric says places remember their dragons.',
    objectives: [
      { id: 'o1', text: 'Return to the ruins of Vaelthara and listen to the silence', type: 'interact', target: 'ruins_silence' },
      { id: 'o2', text: 'Talk to Aldric about what you heard', type: 'talk', target: 'aldric_lamento' },
    ],
    rewards: { xp: 120, items: [{ id: 'pocion', count: 1 }] },
    completionJournal: 'Among the columns there was no menace: there was mourning. A warden without a dragon and a dragon without a warden, both of them homeless. Aldric nodded slowly: "Now you understand why we exist."',
  },
  sq_vigia: {
    id: 'sq_vigia',
    title: 'The Last Watchman',
    description: 'Jorund remembers a stash of the tower\'s old watchman: it opens only at night, by lantern light.',
    journal: 'The tower\'s old watchman hid his treasure "where only night and fire find it." Climb the tower at night with the lantern lit (F) and search the walled-up door.',
    objectives: [
      { id: 'o1', text: 'Search the walled-up door at night, with the lantern lit', type: 'interact', target: 'tower_stash' },
    ],
    rewards: { xp: 100, items: [{ id: 'coin', count: 90 }, { id: 'flecha', count: 8 }] },
    completionJournal: 'Behind the shifted stone I found the watchman\'s stash: counted gold, dry arrows, and a diary with a single legible line — "The light I keep is not mine." That is how this work goes.',
  },
  sq_comercio: {
    id: 'sq_comercio',
    title: 'Trade Routes',
    description: 'Elin says a true merchant carries 200 coins on him at some point. Prove it, and she will get you saddlebags for your mount.',
    journal: '"Gold that is never counted makes no noise," says Elin. Gather 200 coins at once and return to her shop: she has set aside leather saddlebags for your mount.',
    objectives: [
      { id: 'o1', text: 'Hold 200 gold coins at once', type: 'flag', target: 'rich_200' },
      { id: 'o2', text: 'Show off to Elin', type: 'talk', target: 'elin_comercio' },
    ],
    rewards: { xp: 130, items: [{ id: 'alforjas', count: 1 }] },
    completionJournal: 'Elin counted my gold with a single glance and handed over the saddlebags: "good leather, double stitching." Tormenta carries them better than I carry the sword.',
  },
};

/** Chapter labels for the journal UI. */
export const CHAPTER_LABELS: Record<string, string> = {
  q10_orden: 'Chapter IV — The Sunken Crown',
  q11_estandarte: 'Chapter IV — The Sunken Crown',
  q12_acero: 'Chapter IV — The Sunken Crown',
  q13_despertar: 'Chapter V — The Three-Headed Crow',
  q14_consejo: 'Chapter V — The Three-Headed Crow',
  q15_destino: 'Chapter V — The Three-Headed Crow',
};
