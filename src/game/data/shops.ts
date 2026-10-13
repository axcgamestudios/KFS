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
    x: -120, z: -60,
    greeting:
      'A human who makes it all the way out here? Ha. My SHATTERED versions cost what they cost: I break them on purpose. Steel knows nothing of pity.',
    tooLow:
      'Out of my woods! Come back at level 10, whelp. Down here, steel breaks only in hands that deserve it.',
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
    ],
  },
};

/** Ordered ids for iteration (stable menus). */
export const VENDOR_IDS = ['herrero', 'enano'] as const;
