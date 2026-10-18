/**
 * Fase 28 — POCIONES & EL VIAJERO: the alchemist's shelf.
 *
 * Every brew the MESA DE ALQUIMIA (Maren's distillation table) can cook,
 * plus the two curiosities only EL VIAJERO sells: Stardust Powder (the
 * catalyst the strongest recipes demand) and the Errant's Tea.
 *
 * Instant potions heal/clean on use; timed ones ride the AlchemySystem's
 * active-effect windows (damage out/in, stride, breath, regeneration,
 * the inert-mass halving of falls and blasts) and show on the HUD strip.
 */
import type { ItemDef } from './items';

export const ITEMS_F28: Record<string, ItemDef> = {
  // ---------------- LA MESA DE ALQUIMIA — the brews ----------------
  pocion_curacion_menor: {
    id: 'pocion_curacion_menor', name: 'Poción de Curación Menor', kind: 'consumable',
    desc: 'Slime jelly melted into marsh muck, decanted twice. Restores 25 health — the first thing every alchemist learns.',
    icon: 'Heart', stackable: true, usable: true, rarity: 'common',
  },
  pocion_curacion_mayor: {
    id: 'pocion_curacion_mayor', name: 'Poción de Curación Mayor', kind: 'consumable',
    desc: 'The same brew, stabilized with a viscous core: the jelly forgets to spoil. Restores 70 health in one long swallow.',
    icon: 'FlaskRound', stackable: true, usable: true, rarity: 'common',
  },
  pocion_fuerza: {
    id: 'pocion_fuerza', name: 'Poción de Fuerza del Coloso', kind: 'consumable',
    desc: 'Refined devourer jelly cut with stardust. For 60 seconds every blow lands like a falling tree: +25% damage.',
    icon: 'Dumbbell', stackable: true, usable: true, rarity: 'rare',
  },
  pocion_piel_piedra: {
    id: 'pocion_piel_piedra', name: 'Poción de Piel de Piedra', kind: 'consumable',
    desc: 'Runic dust suspended in jelly. For 45 seconds the skin reads as granite: a quarter of every blow taken is refused.',
    icon: 'Shield', stackable: true, usable: true, rarity: 'rare',
  },
  pocion_viento: {
    id: 'pocion_viento', name: 'Poción del Viento Errante', kind: 'consumable',
    desc: 'A harpy quill steeped in jelly. For 45 seconds the legs answer faster (+15% stride) and the breath comes back +40% sooner.',
    icon: 'Wind', stackable: true, usable: true, rarity: 'common',
  },
  pocion_regeneracion: {
    id: 'pocion_regeneracion', name: 'Poción de Regeneración', kind: 'consumable',
    desc: 'An elemental jelly held stable by a living core. For 30 seconds the flesh knits itself shut: +3 health every second.',
    icon: 'Activity', stackable: true, usable: true, rarity: 'rare',
  },
  pocion_veneno: {
    id: 'pocion_veneno', name: 'Aceite Ponzoñoso', kind: 'consumable',
    desc: 'Devourer acid tamed by elemental jelly. Rub it on a blade: for 90 seconds every cut that reaches bestiary flesh leaves a biting rot (5 damage each tick).',
    icon: 'FlaskConical', stackable: true, usable: true, rarity: 'rare',
  },
  pocion_fuego: {
    id: 'pocion_fuego', name: 'Aceite Ígneo', kind: 'consumable',
    desc: 'Elemental fire-jelly thinned with corsair powder. For 90 seconds your edge carries embers: bestiary flesh struck by it keeps burning (7 damage each tick).',
    icon: 'Flame', stackable: true, usable: true, rarity: 'rare',
  },
  antidoto: {
    id: 'antidoto', name: 'Antídoto de Maren', kind: 'consumable',
    desc: 'Corked swamp water over settled muck — the herborist\'s oldest trick. Clears roots and mire from the legs at once, and for 8 seconds refuses any new one.',
    icon: 'Leaf', stackable: true, usable: true, rarity: 'common',
  },
  elixir_masa_inerte: {
    id: 'elixir_masa_inerte', name: 'Elíxir de Masa Inerte', kind: 'consumable',
    desc: 'The first jelly\'s heart, dissolved back into common jelly. For 120 seconds your mass forgets it can be broken: falls and blasts lose half their teeth.',
    icon: 'Mountain', stackable: true, usable: true, rarity: 'legendary',
  },

  // ---------------- EL VIAJERO — curiosities of the road ----------------
  te_errante: {
    id: 'te_errante', name: 'Té del Errante', kind: 'consumable',
    desc: 'Whatever the Traveller boils at his fire, in a tin cup. Restores 50 breath and 10 health — "for the road, not for the taste."',
    icon: 'Coffee', stackable: true, usable: true, rarity: 'common',
  },
  polvo_estelar: {
    id: 'polvo_estelar', name: 'Polvo Estelar', kind: 'material',
    desc: 'Stardust sifted from the sky between two midnights. The alembic drinks it; nothing else can. The strongest brews begin here.',
    icon: 'Sparkles', stackable: true, rarity: 'rare',
  },
};
