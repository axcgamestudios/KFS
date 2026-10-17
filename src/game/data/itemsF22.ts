import type { ItemDef } from './items';

/**
 * Fase 22 — THE FORGE OF LEGENDS.
 *
 * The tiered gear economy the user specced: three bands of craftable/drop
 * gear (Common 1-10, Rare 11-25, Epic 26-40) feeding two legendary stations —
 * the Altar of the Gods (Ancestral Dragonscale Armor + Apollo's Bow, the
 * latter only under a summoned eclipse) and the Anvil of the Titans
 * (Goliath's Colossal Sword with the Cataclismo Volcánico ultimate).
 *
 * · `level` is the EQUIP gate (GameState.equip enforces it).
 * · Special attributes are implemented in code (CombatSystem weapon passives,
 *   Player armor passives) — the desc lines are the in-game contract.
 * · Materials feed the recipes at the three stations (Great Anvil in the
 *   village, Altar of the Gods at the Circle of Vigils, Anvil of the Titans
 *   at the Ancestor's Nest).
 */
export const ITEMS_F22: Record<string, ItemDef> = {
  // ------------------------------------------------------------------
  // MATERIALS (stackable) — the forge economy
  // ------------------------------------------------------------------
  ingote_hierro_mar: {
    id: 'ingote_hierro_mar', name: 'Sea Iron Ingot', kind: 'material',
    desc: 'Bog iron dredged from the shallows and bloomed in Bram\'s hearth until the salt burns out. The stock of every serious blade. Sold at the smithies; pirates carry it as ballast.',
    icon: 'Boxes', stackable: true, rarity: 'common',
  },
  esencia_agua: {
    id: 'esencia_agua', name: 'Water Essence', kind: 'material',
    desc: 'A drop of living tide pulled from the heart of an aquatic beast. It never spills, only rolls. The Tide-Steel Saber is quenched in it.',
    icon: 'Droplets', stackable: true, rarity: 'rare',
  },
  colmillo_cria: {
    id: 'colmillo_cria', name: 'Drake Fang', kind: 'material',
    desc: 'Pulled from a drakeling\'s jaw while the heat still hums in it. Three of them brace the Thorn Blade\'s core.',
    icon: 'Grab', stackable: true, rarity: 'rare',
  },
  escama_quemada: {
    id: 'escama_quemada', name: 'Scorched Scale', kind: 'material',
    desc: 'A scale that has already survived one fire and kept the memory. Folded into the blade so the steel remembers what the scale endured.',
    icon: 'Flame', stackable: true, rarity: 'rare',
  },
  seda_sombras: {
    id: 'seda_sombras', name: 'Ancestral Shadow Silk', kind: 'material',
    desc: 'Spooled from the Mist Isles by the temple guardians. It drinks light; the Temple Shadow Dō is woven from a single uncut thread.',
    icon: 'Moon', stackable: true, rarity: 'rare',
  },
  cuero_bestia: {
    id: 'cuero_bestia', name: 'Beast Leather', kind: 'material',
    desc: 'Cut from the loin of an abyssal beast and cured in salt-wind. It flexes like a living thing under the needle.',
    icon: 'Drumstick', stackable: true, rarity: 'common',
  },
  lingote_mistico: {
    id: 'lingote_mistico', name: 'Mystic Steel Ingot', kind: 'material',
    desc: 'Borin folds storm-washed ore with a technique he refuses to explain. Ten of them anchor the Stormplate Cuirass.',
    icon: 'Boxes', stackable: true, rarity: 'rare',
  },
  // one-time boss catalysts (not stackable — they are keys)
  nucleo_tormenta: {
    id: 'nucleo_tormenta', name: 'Captive Storm Core', kind: 'key',
    desc: 'The heart of the Storm Ronin, torn out while it still cracked. Inside the glass, a small blue lightning paces like a caged animal. It never discharges. It waits.',
    icon: 'Zap', stackable: false, rarity: 'legendary',
    lore: [
      'Held to the ear, it ticks like a clock made of thunder.',
      'The smiths say a storm core only stays captive while it is watched. Do not blink.',
      'The Stormplate Cuirass requires one — the day it is forged, the core finally grounds.',
    ],
  },
  escama_ancestral: {
    id: 'escama_ancestral', name: 'Ancestral Dragonscale', kind: 'material',
    desc: 'A scale of the Elder Dragon: the metal remembers being alive. Ten of them, frozen blood and the Altar of the Gods make a legend.',
    icon: 'Shell', stackable: true, rarity: 'legendary',
  },
  placa_sangre: {
    id: 'placa_sangre', name: 'Frozen Blood Plate', kind: 'material',
    desc: 'What the ice took from Vaelyx, the ice keeps. It will not melt in the forge — the Ancestral Dragonscale Armor is built AROUND it, cold and all.',
    icon: 'Square', stackable: true, rarity: 'legendary',
  },
  corazon_dragon_anciano: {
    id: 'corazon_dragon_anciano', name: 'Ancient Dragon Heart', kind: 'key',
    desc: 'Torn from the breast of Vaelyx the Ancestor. It beats once a minute, patient as a mountain. Apollo\'s Bow is strung with its last light.',
    icon: 'Heart', stackable: false, rarity: 'legendary',
    lore: [
      'It is warm the way a hearthstone is warm at dawn: the memory of heat, not the thing itself.',
      'The Wardens wrote: "A heart that outlives its dragon becomes a promise. Keep it away from eclipses."',
      'The Altar of the Gods will know what it is the moment you carry it up the hill.',
    ],
  },
  esencia_solar: {
    id: 'esencia_solar', name: 'Primal Sun Essence', kind: 'key',
    desc: 'A bead of the first morning, kept in the First Light cache of the old lighthouse since before the war. Present it at the Altar of the Gods and the sky will answer.',
    icon: 'Sun', stackable: false, rarity: 'legendary',
    lore: [
      'It does not light the room. It lights the ROOM THE ROOM IS IN, if you understand me.',
      'The lighthouse keepers called it "the wick of the world".',
      'Under its touch, an eclipse can be summoned — and only during an eclipse will the Altar string the Bow.',
    ],
  },
  corona_astas: {
    id: 'corona_astas', name: 'Crown of Primal Antlers', kind: 'key',
    desc: 'A crown of antlers that never stopped growing. The rarest of the Elder Dragon\'s treasures — the catalyst the Anvil of the Titans demands.',
    icon: 'Crown', stackable: false, rarity: 'legendary',
    lore: [
      'It is heavier than a crown should be, as if it remembers carrying a forest.',
      'One in a hundred times does the Ancestor yield it. The rest of the time you must come back, and back, and back.',
      'When it finally rests on the Anvil of the Titans, the mountain itself holds its breath.',
    ],
  },
  sombrero_rey: {
    id: 'sombrero_rey', name: 'Pirate King\'s Hat', kind: 'key',
    desc: 'The mythic reward of the Pirate King: a hat that survived a hundred boardings and looks it. The Anvil of the Titans counts it as a catalyst of legends.',
    icon: 'Crown', stackable: false, rarity: 'legendary',
    lore: [
      'The brim is cut with notches — one for every captain who called himself king before him.',
      'Under it, faintly, the smell of tar and gunpowder and someone else\'s rum.',
      'Goliath\'s sword asks for stranger things than steel. This is one of them.',
    ],
  },

  // ------------------------------------------------------------------
  // BASE COMPONENT SWORDS (the Goliath recipe demands four of them)
  // ------------------------------------------------------------------
  espada_rey_pirata: {
    id: 'espada_rey_pirata', name: 'Pirate King\'s Sword', kind: 'weapon',
    desc: 'The blade of the Pirate King of the Crow Fortress. A cutlass of blackened steel with a guard of fouled anchor gold — it has never been parried twice by the same man. (+18% damage)',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary', level: 11,
  },
  gemelas_viento: {
    id: 'gemelas_viento', name: 'Twins of the Voracious Wind', kind: 'weapon',
    desc: 'Paired blades dropped from the wing of Skarnvind, the Wyvern of the Mists. Separately they are fine swords; together they hum a half-tone apart, like wind through a torn sail. (+24% damage, mist-wind edge)',
    icon: 'Swords', stackable: false, equipable: true, rarity: 'legendary', level: 11,
  },
  espada_garra: {
    id: 'espada_garra', name: 'Elder Dragon Claw Sword', kind: 'weapon',
    desc: 'Forged whole from a claw of Vaelyx the Ancestor: no tang, no weld, no join. Steel imitates; this simply IS. The last blade before the mythics. (+40% damage, the claw never dulls)',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary', level: 26,
  },

  // ------------------------------------------------------------------
  // FORGE WEAPONS — Common (Lv 1-10)
  // ------------------------------------------------------------------
  machete_oxidado: {
    id: 'machete_oxidado', name: 'Rusted Boarding Machete', kind: 'weapon',
    desc: 'Frequent drop from the pirate ambush fleets — the working blade of a boarding party. Cheap, quick, and its notched edge leaves Light Cuts that bleed on (10% chance: damage over time, 3 s). A sailor\'s first steel; repaired with scrap iron for pocket change.',
    icon: 'Scissors', stackable: false, equipable: true, rarity: 'common', level: 1,
  },
  bokken: {
    id: 'bokken', name: 'Training Bokken', kind: 'weapon',
    desc: 'A hardwood sword from the sanctuary merchants. It cannot cut — but it breaks GUARD like a hammer: +50% posture damage, and a solid strike can stun or disarm without killing. The right tool for learning parry and deflection.',
    icon: 'CircleDashed', stackable: false, equipable: true, rarity: 'common', level: 1,
  },
  // Rare (Lv 11-25)
  sable_mareas: {
    id: 'sable_mareas', name: 'Tide-Steel Saber', kind: 'weapon',
    desc: 'Five sea-iron ingots quenched in a drop of Water Essence. Flow of the Wind: under rain or wading in the surf it speeds up by 8% — the steel drinks weather. A mariner\'s blade before the mythics.',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'rare', level: 11,
  },
  wakizashi: {
    id: 'wakizashi', name: 'Temple Guardian\'s Wakizashi', kind: 'weapon',
    desc: 'Rare drop (10%) from the elite samurai patrolling the Mist Isles. Quick Draw: the first strike after switching to it is a GUARANTEED critical on any enemy that has not noticed you. The shadow-build\'s opening line.',
    icon: 'Swords', stackable: false, equipable: true, rarity: 'rare', level: 11,
  },
  // Epic (Lv 26-40)
  hoja_draco: {
    id: 'hoja_draco', name: 'Drake-Fang Thorn Blade', kind: 'weapon',
    desc: 'Three drake fangs folded through a scorched scale. Ember Residue: charged heavy attacks leave a small flame on the ground that burns whatever crosses it. The mandatory step before the Elder Dragon and the claw swords.',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'rare', level: 26,
  },

  // ------------------------------------------------------------------
  // FORGE ARMORS — Common (Lv 1-10)
  // ------------------------------------------------------------------
  harapos: {
    id: 'harapos', name: 'High-Seas Sailor\'s Rags', kind: 'armor',
    desc: 'Frequent drop from pirate crews — or stitched from basic cloth. Weightless: no extra stamina cost to swim or dodge. Meant to keep you from drowning or freezing, nothing more. (+10 max health, +10% cold resist)',
    icon: 'Shirt', stackable: false, equipable: true, rarity: 'common', level: 1,
    armor: { hp: 10, reduce: 0.05 },
  },
  kimono: {
    id: 'kimono', name: 'Initiate\'s Cotton Kimono', kind: 'armor',
    desc: 'Sanctuary weave. Flowing Movement: widens the parry/deflection window by 5% — the learner\'s armor. For those who counter instead of tank. (+8 max health, +5% stamina recovery)',
    icon: 'Shirt', stackable: false, equipable: true, rarity: 'common', level: 1,
    armor: { hp: 8, reduce: 0.04 },
  },
  // Rare (Lv 11-25)
  peto_vigia: {
    id: 'peto_vigia', name: 'Sea-Watch Iron Cuirass', kind: 'armor',
    desc: 'Eight sea-iron ingots over reinforced galeon timber. Anchoring: cannon blasts and heavy sweeps knock you back 30% less — you keep the deck under your boots. For boarding actions. (+35 max health, +15% impact resist)',
    icon: 'Shield', stackable: false, equipable: true, rarity: 'rare', level: 11,
    armor: { hp: 35, reduce: 0.16 },
  },
  do_sombras: {
    id: 'do_sombras', name: 'Temple Shadow Dō', kind: 'armor',
    desc: 'One uncut thread of Ancestral Shadow Silk over beast leather. Silent Step: enemies see and hear you 20% later in fog or at night. The light armor for the Wakizashi and short bows. (+28 max health, +15% shock resist)',
    icon: 'Layers', stackable: false, equipable: true, rarity: 'rare', level: 11,
    armor: { hp: 28, reduce: 0.12 },
  },
  // Epic (Lv 26-40)
  coraza_tormenta: {
    id: 'coraza_tormenta', name: 'Stormplate Cuirass', kind: 'armor',
    desc: 'A captive storm core grounded through ten ingots of mystic steel. Conductive: it drinks a tenth of the lightning that hits you and pays you back in stamina. The answer to the Storm Ronin. (+65 max health, +35% shock resist)',
    icon: 'Shield', stackable: false, equipable: true, rarity: 'rare', level: 26,
    armor: { hp: 65, reduce: 0.24 },
  },
  coraza_cria: {
    id: 'coraza_cria', name: 'Drake-Scale Cuirass', kind: 'armor',
    desc: 'Drake fangs riveted through scorched scales. Thermal Insulation: you cannot be frozen, and burns lose half their fury. The transition set before facing the Elder Dragon. (+75 max health, +30% fire resist)',
    icon: 'Shield', stackable: false, equipable: true, rarity: 'rare', level: 26,
    armor: { hp: 75, reduce: 0.28 },
  },
  // Legendary
  armadura_ancestral: {
    id: 'armadura_ancestral', name: 'Ancestral Dragonscale Armor', kind: 'armor',
    desc: 'Ten Ancestral Dragonscales over five plates of frozen blood, assembled at the Altar of the Gods. Skin of the Titan: immune to burning and extreme heat. Draconic Retribution: melee wounds to you answer with a burning shockwave. Imposing Weight: −5% dodge speed — the price of a legend. (+150 max health, −50% damage taken, no bleed, fewer crits against you)',
    icon: 'ShieldCheck', stackable: false, equipable: true, rarity: 'legendary', level: 30,
    armor: { hp: 150, reduce: 0.50 },
    lore: [
      'The scales do not overlap like armor. They argue like a family, and settle like one.',
      'No one has ever taken this armor off. It is not that it cannot be done — it is that no one has wanted to.',
      'Forged where the gods can see it: the Altar of the Gods, from what the Elder Dragon left behind.',
    ],
  },

  // ------------------------------------------------------------------
  // MYTHIC WEAPONS (Divine / Titan)
  // ------------------------------------------------------------------
  espada_goliath: {
    id: 'espada_goliath', name: 'Goliath\'s Colossal Sword', kind: 'weapon',
    desc: 'Four legendary blades folded into one black colossus at the Anvil of the Titans, catalyzed by a Pirate King\'s Hat and a Crown of Primal Antlers. The highest per-hit damage in the Forgotten Seas. 360° sweeps that break any guard; heavy charges carry total super armor (interrupts, stuns and knockdowns fail, damage −50% while charging). Active: V — CATACLISMO VOLCÁNICO. A blade that ends arguments.',
    icon: 'Swords', stackable: false, equipable: true, rarity: 'legendary', level: 30,
    lore: [
      'The Anvil of the Titans accepted the four blades and the two catalysts without a sound. Then it rang once, and the ring is still travelling through the mountain.',
      'It is longer than a man is tall, and it moves like it disagrees with that fact.',
      'When the blade drinks the storm, point it at something you no longer need.',
    ],
  },
  arco_apolo: {
    id: 'arco_apolo', name: 'Apollo\'s Bow', kind: 'weapon',
    desc: 'The only Divine weapon in Eldoria: an Ancient Dragon Heart and a Primal Sun Essence married at the Altar of the Gods during an eclipse. Draw as fast as a short bow, walk at full speed while aiming, never runs out of arrows — each pull of the string LIGHTS one from the sun. Outdoors by day: +30% damage and solar burn around the impact. Weak-point hits purify you and pay back stamina. Active: V — IRA DEL SOL.',
    icon: 'Sun', stackable: false, equipable: true, rarity: 'legendary', level: 30,
    lore: [
      'The string is a line of noon. It never slackens.',
      'The Wardens\' warning proved wrong: the sun CAN be aimed.',
      'On the day of an eclipse, at the Altar of the Gods, the sky itself hands you the string.',
    ],
  },
};
