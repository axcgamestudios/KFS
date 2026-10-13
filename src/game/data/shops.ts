/**
 * Fase 16 — SISTEMA DE COMERCIANTES (Herrería).
 *
 * Two blacksmiths:
 *  · EL HERRERO ESTÁNDAR (Torvald) — by the castle road, level 6+.
 *    Sells armor, swords and the exclusive "Alas" item (elytra-style glide).
 *  · EL HERRERO ENANO (Borin) — deep in the western woods, level 10+ and
 *    ruinously expensive: sells "rotas" (deliberately over-broken, OP)
 *    versions of the SAME catalog.
 *
 * The ShopUI renders these catalogs; buying goes through gameApi.buyShopItem
 * which re-checks the level gate and the gold.
 */

export interface ShopEntry {
  item: string;
  price: number;
  /** Flavour line the smith says about this piece (tooltip in the shop). */
  note?: string;
  /** Fase 18 — bundle size (arrows are sold in quivers of 5-6). Default 1. */
  qty?: number;
}

export interface VendorDef {
  id: string;
  name: string;
  title: string;
  /** Minimum player level to INTERACT and open the shop. */
  minLevel: number;
  /** Where the vendor stands (also where the dialogue marker points). */
  x: number;
  z: number;
  greeting: string;
  tooLow: string;
  entries: ShopEntry[];
}

export const VENDORS: Record<string, VendorDef> = {
  herrero: {
    id: 'herrero',
    name: 'Torvald',
    title: 'The Standard Blacksmith',
    minLevel: 6,
    x: 52, z: 116,
    greeting: 'Steel, leather, and wings. Everything that leaves my forge bears my mark… and a fair price.',
    tooLow:
      'Come back once you have been seasoned a little, eh? Level 6 is the bare minimum to lay hands on my anvil. You still smell of the village.',
    entries: [
      { item: 'armadura_cuero', price: 80, note: 'Light as a tavern promise.' },
      { item: 'armadura_malla', price: 220, note: 'A thousand rings, and not one of them free.' },
      { item: 'armadura_placas', price: 420, note: 'With this, edges apologize.' },
      { item: 'espada_plata', price: 150, note: 'Silver from the old mine, with a vein of steel.' },
      { item: 'espada_almirante', price: 350, note: 'Tempered three times, as I swore.' },
      // ---- Fase 18 — the archer's wall ----
      {
        item: 'arco_corto',
        price: 120,
        note: 'Yew, waxed string, no nonsense. Draws in a blink — and yes, it shoots straight out of a dodge roll.',
      },
      { item: 'flecha_perforante', price: 60, qty: 6, note: 'Bodkin heads, sold by the half-dozen. Plate, hull timber, drake scale — all just wood to these.' },
      { item: 'flecha_fuego', price: 75, qty: 5, note: 'Pitch-soaked wraps, bundles of five. What they touch keeps burning. Keep them away from my coal sack.' },
      { item: 'flecha_veneno', price: 60, qty: 5, note: 'Maren distills, I temper the heads. Blights healing and strength, five to a bundle.' },
      {
        item: 'alas',
        price: 900,
        note: 'My masterpiece. Exclusive to this forge: waxed canvas over whale ribs. Leap from on high and hold SPACE: the sky is yours.',
      },
    ],
  },
  enano: {
    id: 'enano',
    name: 'Borin',
    title: 'The Dwarf Blacksmith (Advanced Trade)',
    minLevel: 10,
    // Fase 18 — Borin moved into the village: his cottage + forge stands by
    // the dock road, beside the path to the green.
    x: 2, z: 204,
    greeting:
      'A villager with coin and patience? Ha. My SHATTERED versions cost what they cost: I break them on purpose. Steel knows nothing of pity.',
    tooLow:
      'Away from my anvil, whelp. Come back at level 10 — down this road, steel breaks only in hands that deserve it.',
    entries: [
      { item: 'armadura_cuero_rota', price: 500, note: 'Broken on purpose. As it should be.' },
      { item: 'armadura_malla_rota', price: 1200, note: 'Living scales of Vaelthara. Yes, living.' },
      { item: 'armadura_placas_rota', price: 2400, note: 'The steel of the pact. Not a soul will ever know.' },
      { item: 'espada_plata_rota', price: 800, note: 'Tempered three nights. It whistles — can you hear it?' },
      { item: 'espada_almirante_rota', price: 1800, note: 'Folded the wrong way round. It should not work.' },
      {
        item: 'alas_rotas',
        price: 3000,
        note: 'Ribs cut from a whole claw of the Ancestor. They fall so slowly the air listens to them. My finest break.',
      },
      // ---- Fase 18 — the deep forge's bow ----
      {
        item: 'gran_arco',
        price: 1600,
        note: 'A mast strung over a whalebone stave. Drawing it plants your boots in the earth — what it throws breaks shields, postures and pride.',
      },
      { item: 'flecha_electrica', price: 90, qty: 5, note: 'Storm-glass tips, five to a bundle. The arc leaps between foes — and water or rain makes it a stunner.' },
    ],
  },
};

/** Ordered ids for iteration (stable menus). */
export const VENDOR_IDS = ['herrero', 'enano'] as const;
