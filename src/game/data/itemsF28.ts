import type { ItemDef } from './items';

/**
 * Fase 28 — THE ALCHEMIST'S STILL.
 *
 * The full potion economy the user specced: four bands (Basic 1-10,
 * Intermediate 11-25, Advanced 26-40, Mythic) brewed at MAREN'S STILL from
 * monster materials. Effect descriptors live on the items (`potion`); the
 * AlchemySystem reads them and drives the live buffs.
 *
 * Ingredient sources are the game's equivalents of the spec's monsters
 * (the game has no slimes/kobolds/harpies/golems — the drops are mapped to
 * the enemy families that exist, matched by tier and theme):
 *   · Slime Común → common red bandits (the commonest foe)
 *   · Grimpote / sea jellies → sea beasts (the King of the Sea is the
 *     "King Slime" of this world: Primal Core + Crystallized Crown)
 *   · Duende Silvestre (wild apples) → orchard forage by the village
 *   · Kobold → drakelings (dull scales, reptile fangs)
 *   · Draco de Fuego / Slime Elemental → fire drakes (glands, fire jelly)
 *   · Golem de Piedra Rúnica → the temple guardians of the Mist Isles
 *   · Hobgoblin Capitán → temple guardians (cured leather)
 *   · Arpía → the winged drakes of the Vigils (feathers, talons)
 *   · Slime Elemental de Rayo → storm-drake jelly from the guardians
 *   · Slime Corrosivo / abyssal → deep-sea beasts (acid, master jelly)
 *   · Artillero Corsario → pirate boarding crews (fine powder)
 *   · Navegante Maldito → the King of the Sea (essence of the deep)
 *   · Comandante Corsario Fantasma → the Pirate King's galleon (cursed powder)
 *   · Daimyo Corrupto → the Storm Ronin (dark wind essence)
 *   · King Slime → the King of the Sea (primal core + crystallized crown)
 *   · Guardián de Escamas → Kraivenn the fire dragon (intense fire gems)
 *   · Thorne "El Guardián Caído" → Vaelthara, Warden of the Ruins
 *     (sacred forest seed + ancestral oak essence — guaranteed)
 *   · Hierbas Raras (Aethel Gard) → rare herb forage at the temple ruins
 */
export interface PotionEffect {
  /** Display band for the recipe book. */
  band: 'basic' | 'intermediate' | 'advanced' | 'mythic';
  /** Seconds the timed part lasts (0 = instant effect). */
  duration: number;
  /** One-line player-facing effect summary (the contract). */
  summary: string;
}

/** Potions carry their effect descriptor; ingredients are plain materials. */
export interface PotionItemDef extends ItemDef {
  potion?: PotionEffect;
}

export const ITEMS_F28: Record<string, PotionItemDef> = {
  // ------------------------------------------------------------------
  // INGREDIENTS — monster materials & forage
  // ------------------------------------------------------------------
  gelatina_basica: {
    id: 'gelatina_basica', name: 'Basic Jelly', kind: 'material', stackable: true, rarity: 'common', icon: 'Droplet',
    desc: 'A pinch of translucent slime scraped from a fallen bandit\'s pouch — the sticky base of every folk remedy. Maren swears by it; the smell is negotiable.',
  },
  lodo_viscoso: {
    id: 'lodo_viscoso', name: 'Viscous Silt', kind: 'material', stackable: true, rarity: 'common', icon: 'Waves',
    desc: 'Half-coagulated silt scooped from a sea beast\'s wake. It quivers for days. The still needs it for anything a body has to sit inside.',
  },
  manzana_silvestre: {
    id: 'manzana_silvestre', name: 'Wild Apple', kind: 'material', stackable: true, rarity: 'common', icon: 'Apple',
    desc: 'A small, tart apple from the wild trees by the village. Sweetens the brew and settles the stomach. The wildfolk love them; so do the drakes.',
  },
  escama_opaca: {
    id: 'escama_opaca', name: 'Small Dull Scale', kind: 'material', stackable: true, rarity: 'common', icon: 'Shield',
    desc: 'A drakeling\'s shed scale, dull as old coin. Ground into the brew it lends the skin a little of a lizard\'s stubbornness.',
  },
  diente_reptil: {
    id: 'diente_reptil', name: 'Reptile Fang', kind: 'material', stackable: true, rarity: 'common', icon: 'Triangle',
    desc: 'Pulled from a drakeling\'s jaw. It carries the memory of biting through things that bit back.',
  },
  glandula_fuego: {
    id: 'glandula_fuego', name: 'Pure Fire Gland', kind: 'material', stackable: true, rarity: 'rare', icon: 'Flame',
    desc: 'Cut from a fire drake while it still smoldered. Handle it with tongs and a prayer. The still draws the heat out of it and hands the heat to you.',
  },
  gelatina_fuego: {
    id: 'gelatina_fuego', name: 'Elemental Fire Jelly', kind: 'material', stackable: true, rarity: 'rare', icon: 'Sparkles',
    desc: 'Jelly that never stops glowing warmly. A fire drake\'s parting gift.',
  },
  nucleo_viscoso: {
    id: 'nucleo_viscoso', name: 'Stable Viscous Core', kind: 'material', stackable: true, rarity: 'rare', icon: 'Circle',
    desc: 'The knot of cold jelly at the center of an old sea beast. It does not melt, spoil, or care.',
  },
  piedra_runica: {
    id: 'piedra_runica', name: 'Runic Stone Dust', kind: 'material', stackable: true, rarity: 'rare', icon: 'Mountain',
    desc: 'Ground from the rune-etched plate of a temple guardian. It remembers standing under blows for a thousand years.',
  },
  cuero_curtido: {
    id: 'cuero_curtido', name: 'Cured Leather', kind: 'material', stackable: true, rarity: 'common', icon: 'Layers',
    desc: 'Tough hide cured by the temple hunters. The brew borrows its refusal to tear.',
  },
  pluma_reforzada: {
    id: 'pluma_reforzada', name: 'Reinforced Feather', kind: 'material', stackable: true, rarity: 'rare', icon: 'Feather',
    desc: 'A wing-drake\'s quill, stiff as a slat. Drink its tea and your stride stops asking the ground for permission.',
  },
  garra_afilada: {
    id: 'garra_afilada', name: 'Sharp Talon', kind: 'material', stackable: true, rarity: 'common', icon: 'Zap',
    desc: 'A drake\'s talon, hollow-ground by wind. It teaches the blood to run quick.',
  },
  gelatina_rayo: {
    id: 'gelatina_rayo', name: 'Elemental Storm Jelly', kind: 'material', stackable: true, rarity: 'rare', icon: 'CloudLightning',
    desc: 'Storm-drake jelly that crackles when you look at it. Banned from every kitchen in Crowhaven.',
  },
  acido_concentrado: {
    id: 'acido_concentrado', name: 'Concentrated Acid', kind: 'material', stackable: true, rarity: 'rare', icon: 'FlaskConical',
    desc: 'Drawn from an abyssal beast. Etches glass, regrets nothing. Keep it away from the good barrels.',
  },
  polvo_fina: {
    id: 'polvo_fina', name: 'Fine Black Powder', kind: 'material', stackable: true, rarity: 'rare', icon: 'Bomb',
    desc: 'Corsair artillery grade, milled three times finer than the navy issues. The flask needs the kick.',
  },
  gelatina_corrosiva: {
    id: 'gelatina_corrosiva', name: 'Master Corrosive Jelly', kind: 'material', stackable: true, rarity: 'rare', icon: 'TestTubes',
    desc: 'The binder of the corrosive arts — a master abyssal jelly that keeps its acid awake for years.',
  },
  esencia_profundidades: {
    id: 'esencia_profundidades', name: 'Essence of the Deep', kind: 'material', stackable: true, rarity: 'legendary', icon: 'Anchor',
    desc: 'A drop of the cold dark under the world, taken from a cursed navigator\'s chest. It weighs almost nothing and pulls like an anchor.',
  },
  polvora_maldita: {
    id: 'polvora_maldita', name: 'Cursed Powder', kind: 'material', stackable: true, rarity: 'legendary', icon: 'Skull',
    desc: 'Powder that burned once already, in a battle nobody won. It is still angry about it.',
  },
  esencia_viento_oscuro: {
    id: 'esencia_viento_oscuro', name: 'Dark Wind Essence', kind: 'material', stackable: true, rarity: 'legendary', icon: 'Wind',
    desc: 'The Storm Ronin exhales once a generation and the wind that leaves him never entirely calms.',
  },
  nucleo_primordial: {
    id: 'nucleo_primordial', name: 'Primal Slime Core', kind: 'material', stackable: true, rarity: 'legendary', icon: 'Atom',
    desc: 'The still, beating knot of jelly at the center of the King of the Sea. Everything soft in the world dreams of being this hard.',
  },
  corona_slime: {
    id: 'corona_slime', name: 'Crystallized Slime Crown', kind: 'material', stackable: true, rarity: 'legendary', icon: 'Crown',
    desc: 'What the King of the Sea wore on the day he was old. It rings like porcelain and drinks like stone.',
  },
  gema_fuego: {
    id: 'gema_fuego', name: 'Intense Fire Gem', kind: 'material', stackable: true, rarity: 'legendary', icon: 'Gem',
    desc: 'Kraivenn\'s heartstone, cut by the fire itself. Two of these and the still can make a body briefly impossible to break.',
  },
  semilla_bosque: {
    id: 'semilla_bosque', name: 'Sacred Forest Seed', kind: 'material', stackable: true, rarity: 'legendary', icon: 'Leaf',
    desc: 'Vaelthara kept one of these through all her long watch. Trees that grow from it remember the forest that was.',
  },
  esencia_roble: {
    id: 'esencia_roble', name: 'Ancestral Oak Essence', kind: 'material', stackable: true, rarity: 'legendary', icon: 'TreePine',
    desc: 'Distilled from the Warden\'s own heartwood. It smells like rain arriving.',
  },
  hierbas_raras: {
    id: 'hierbas_raras', name: 'Rare Herbs of the Mystic Garden', kind: 'material', stackable: true, rarity: 'legendary', icon: 'Sprout',
    desc: 'Cut in the blind fortress\'s buried garden, where nothing has touched them since the world forgot how. They are still perfectly fresh.',
  },

  // ------------------------------------------------------------------
  // POTIONS — brewed at Maren's Still
  // ------------------------------------------------------------------
  pocion_curacion_menor: {
    id: 'pocion_curacion_menor', name: 'Lesser Healing Potion', kind: 'consumable', stackable: true, usable: true,
    rarity: 'common', icon: 'HeartPulse',
    desc: 'Cloudy rose, tastes of apple peel. Restores 10% of health, instantly. The bottle you never regret carrying.',
    potion: { band: 'basic', duration: 0, summary: 'Restores 10% HP instantly.' },
  },
  pocion_escamas: {
    id: 'pocion_escamas', name: 'Potion of Light Scales', kind: 'consumable', stackable: true, usable: true,
    rarity: 'common', icon: 'ShieldCheck',
    desc: 'Slightly gray, faintly gritty. The skin takes on a little of a drake\'s dull stubbornness for a minute.',
    potion: { band: 'basic', duration: 60, summary: '+10% physical defense for 60 s.' },
  },
  elixir_termico: {
    id: 'elixir_termico', name: 'Elixir of Thermal Isolation', kind: 'consumable', stackable: true, usable: true,
    rarity: 'rare', icon: 'Thermometer',
    desc: 'Warm without being hot. A film of calm heat settles over the drinker; dragonfire has to argue with it now.',
    potion: { band: 'intermediate', duration: 45, summary: '+25% fire resistance, burning nullified, for 45 s.' },
  },
  pocion_roble: {
    id: 'pocion_roble', name: 'Potion of Oak-Skin', kind: 'consumable', stackable: true, usable: true,
    rarity: 'rare', icon: 'TreeDeciduous',
    desc: 'Brown as bark, flat as a plank. For half a minute blows land on you like weather, not like news.',
    potion: { band: 'intermediate', duration: 30, summary: '+40% push & interrupt resistance, +2 HP/s regen, 30 s.' },
  },
  tonico_celeridad: {
    id: 'tonico_celeridad', name: 'Tonic of Wind-Celerity', kind: 'consumable', stackable: true, usable: true,
    rarity: 'rare', icon: 'Footprints',
    desc: 'Pale green, carbonated by itself. The ground feels slightly further away than usual.',
    potion: { band: 'intermediate', duration: 40, summary: '+20% move speed, dodge costs 15% less stamina, 40 s.' },
  },
  brebaje_acido: {
    id: 'brebaje_acido', name: 'Corrosive Acid Brew', kind: 'consumable', stackable: true, usable: true,
    rarity: 'rare', icon: 'FlaskRound',
    desc: 'THROWABLE. The flask does not survive the throw. A 5-meter acid cloud eats armor and keeps eating.',
    potion: { band: 'advanced', duration: 6, summary: 'Thrown: 5 m cloud, −30% armor, 20% of your attack as damage per second for 6 s.' },
  },
  elixir_furia: {
    id: 'elixir_furia', name: 'Elixir of Abyss-Fury', kind: 'consumable', stackable: true, usable: true,
    rarity: 'rare', icon: 'Swords',
    desc: 'Black, with a red settling in it like a sunset you should not look at. The trade is exactly what it tastes like.',
    potion: { band: 'advanced', duration: 30, summary: '+35% critical damage, +15% attack speed, −15% defense, 30 s.' },
  },
  elixir_masa: {
    id: 'elixir_masa', name: 'Elixir of Inert Mass', kind: 'consumable', stackable: true, usable: true,
    rarity: 'legendary', icon: 'Weight',
    desc: 'It does not slosh. For twenty seconds, falls, blasts and hammers are things that happen to other people — and a tenth of each one comes back out of you as a shockwave.',
    potion: { band: 'mythic', duration: 20, summary: 'Absorbs 50% of impact/fall/explosion damage for 20 s, returning 10% as a shockwave.' },
  },
  lagrima_bosque: {
    id: 'lagrima_bosque', name: 'The Tear of the Ancestral Forest', kind: 'consumable', stackable: true, usable: true,
    rarity: 'legendary', icon: 'Droplets',
    desc: 'Clear, and somehow it is raining inside the bottle. The forest cries once, on your behalf, and for ten seconds nothing in the world can alter you.',
    potion: { band: 'mythic', duration: 10, summary: 'Fully restores health and stamina; 10 s immunity to every alteration (burn, poison, bleed, corrosion). One use per fight — two against bosses.' },
  },
};
