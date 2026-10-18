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

/** Fase 28 — EL VIAJERO: what he BUYS off your back. The sell-side of the
 *  economy (treasures finally have a collector; bestiary junk has a crate).
 *  Prices are per unit; stackables sell one at a time from the panel. */
export interface VendorBuyEntry {
  item: string;
  price: number;
  /** His line about it (tooltip in the sell tab). */
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
  /** Fase 28 — optional sell list (El Viajero buys treasures & junk). */
  buys?: VendorBuyEntry[];
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
      // ---- Fase 22 — THE FORGE: sea iron by the ingot (the forge economy) ----
      { item: 'ingote_hierro_mar', price: 45, qty: 2, note: 'Bog iron, bloomed clean of salt. Sold in pairs — a working blade starts at five.' },
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
      // ---- Fase 22 — THE FORGE: mystic steel, Borin's unexplained fold ----
      { item: 'lingote_mistico', price: 140, note: 'Storm-washed ore folded with a technique I refuse to explain. Ten of them anchor the Stormplate Cuirass.' },
    ],
  },
  // ---- Fase 22 — THE FORGE: the sanctuary merchant (Sister Ysolt) ----
  santuario: {
    id: 'santuario',
    name: 'Sister Ysolt',
    title: 'The Sanctuary Merchant',
    minLevel: 1,
    x: 160, z: 280,
    greeting: 'The tide brings everything here eventually, traveller. Silk, incense, and hardwood patience for the wrists.',
    tooLow: 'Even a novice of one winter may browse my cloth. Come — there is no level I turn away.',
    entries: [
      { item: 'bokken', price: 35, note: 'The wooden sword first, always. It cannot cut — but it teaches what a guard is, and how it breaks.' },
      { item: 'kimono', price: 60, note: 'Initiate\'s cotton weave. It flows with the counter instead of fighting it.' },
      { item: 'cuero_bestia', price: 90, note: 'Abyssal beast hide, cured in salt-wind. What the guardians shed, the tide brings here.' },
    ],
  },
  // ---- Fase 28 — EL VIAJERO: the wandering merchant of the trade circuit ----
  viajero: {
    id: 'viajero',
    name: 'El Viajero',
    title: 'The Wandering Merchant',
    minLevel: 1,
    // Flavour coords only — he actually stands wherever the day put him
    // (dayCount % 3 over the three camps; the marker rides the NPC).
    x: 58, z: 100,
    greeting:
      'Everything on my back is for sale, including the back. Stardust for the alembic, tea for the road — and I pay honest coin for what the island coughs up.',
    tooLow: 'I sell to anyone who can walk. Come, look.',
    entries: [
      {
        item: 'te_errante',
        price: 18,
        note: 'Whatever I boil at the fire, in a tin cup. Fifty breath and ten health back — for the road, not for the taste.',
      },
      {
        item: 'pocion_curacion_menor',
        price: 30,
        qty: 2,
        note: 'Two by two, sewn into wax paper. The herborist boils them cheaper — if you can find her table and the jelly.',
      },
      {
        item: 'antidoto',
        price: 22,
        note: 'For the marshes and the things that live there. One swallow and your legs are your own again.',
      },
      {
        item: 'elixir_agilidad',
        price: 140,
        note: 'A harpy-hoard vial that crossed my path at the cliffs. Thirty seconds of weightless — the real thing, not road-moonshine.',
      },
      {
        item: 'polvo_estelar',
        price: 120,
        note: 'Sifted from the sky between two midnights, so they say. Your alembic will drink it; nothing else can. The strong brews begin here.',
      },
    ],
    buys: [
      // ---- the collectors' shelf: treasures at last have a buyer ----
      { item: 'sello_guida', price: 500, note: 'A daimyo\'s seal. The premium is for the story I will tell about it, not the stamp.' },
      { item: 'corona_slime', price: 400, note: 'Crystallized jelly cut like a crown. A king\'s weight in glass — the price of a king, half the smell.' },
      { item: 'baculo_raices', price: 380, note: 'It still writhes when it rains. I will sell it as a curiosity to a collector with high ceilings.' },
      { item: 'gema_fuego', price: 300, note: 'It refuses to cool. I will carry it in a lead box and charge accordingly.' },
      { item: 'reliquia_marina', price: 260, note: 'A drowned saint — the coastal folk pay a small fortune for these. I split it with nobody.' },
      { item: 'corona_chatarra', price: 220, note: 'Gilded scrap, still warm from the hoarder\'s head. Considerable purse, as promised.' },
      { item: 'gema_antartica', price: 180, note: 'Clouded and pale. Jewelers whisper — I say it out loud: it hides nothing, it IS something.' },
      { item: 'mec_mosquete', price: 150, note: 'A matchlock missing its lock plate. Collectors pay well; Bram pays in favors. I pay in coin.' },
      { item: 'pluma_galeon', price: 140, note: 'A spectral feather. Barges turn on a coin with it — so do I.' },
      { item: 'esencia_roble', price: 120, note: 'The fallen guardian\'s sap. I know a smith who will pay to imbue armor with it. Today, that smith is me.' },
      // ---- the old haul: the Fase 1-4 curiosities ----
      { item: 'botin', price: 90, note: 'The Crow\'s loot. I will ask no questions and answer fewer.' },
      { item: 'espejo', price: 60, note: 'Brass and salt-haze. It flatters, which is why people keep mirrors.' },
      { item: 'escama', price: 50, note: 'A sleeping scale. It will wake for the right buyer, or so I will tell them.' },
      { item: 'colmillo', price: 40, note: 'A carved fang from the grotto. Old teeth hold their value better than old promises.' },
      // ---- legendary crafting mats: sell or brew, your call ----
      { item: 'nucleo_primordial', price: 150, note: 'The first jelly\'s heart. The elixir it brews is worth more than my coin — but my coin is today, and the elixir is a gamble.' },
      { item: 'tamahagane', price: 40, note: 'Black-sand steel from the far east. It crossed one ocean to reach you; it can cross another in my pack.' },
      { item: 'lingote_acero_mistico', price: 45, note: 'Enchanted steel, polished. The Stormplate drinks it by the ingot — I drink it by the crate.' },
      { item: 'escama_draconica', price: 35, note: 'Plate from a guardian\'s harness. Someone is always building a Drake-Fledgling set somewhere.' },
      { item: 'polvo_piedra_runica', price: 30, note: 'Ground runes that wake dormant armor — or pay for the night\'s fire, if you are not the armor-waking kind.' },
      { item: 'esencia_viento_oscuro', price: 35, note: 'A smear of the daimyo\'s killing wind. The alchemy table imbues it into arrows; I imbue it into my purse.' },
      // ---- tier-2 materials ----
      { item: 'gelatina_maestra', price: 25, note: 'The refined body of a devourer. Your strength-brews want it — my purse wants it more quietly.' },
      { item: 'acido_concentrado', price: 18, note: 'Corked in wax. Forges heavy piercing rounds, or buys three nights of road.' },
      { item: 'nucleo_viscoso', price: 15, note: 'Still-beating core. The alchemists prize its stability; so does anyone who hates surprises.' },
      { item: 'gelatina_elemental', price: 12, note: 'Jelly that remembers fire, lightning or venom. I never ask which — memory is the buyer\'s problem.' },
      { item: 'polvora_fina', price: 8, note: 'Ground fine enough to sneeze at. Feeds fire arrows and hand bombs — and my little camp stove.' },
      { item: 'lingote_plomo', price: 7, note: 'Soft and heavy. The smith wants it; I want the smith to want it.' },
      { item: 'garra_afilada', price: 8, note: 'A harpy talon. The workbench imbibes daggers with its bleed — the road takes a smaller cut.' },
      { item: 'pluma_arpia', price: 6, note: 'Stiff as a bow spar. Fletchers pay, quill-cutters pay, I pay first.' },
      // ---- tier-1 junk: the crate trade ----
      { item: 'diente_reptil', price: 4, note: 'Curved like a fishhook. By the dozen, they add up to a night\'s fire.' },
      { item: 'escama_opaca', price: 4, note: 'Dull kobold scale. Not much — but the kobolds are not using it anymore.' },
      { item: 'chatarra_hierro', price: 3, note: 'Gnawed scrap iron. Good enough to patch a blade, better to sell by the crate.' },
      { item: 'gelatina_basica', price: 2, note: 'Common jelly. The alchemist\'s fundament — or two coins toward a bigger fundament.' },
      { item: 'lodo_viscoso', price: 2, note: 'Marsh muck, clotted. Every minor healing potion begins here, or ends in my sack.' },
      { item: 'agua_estancada', price: 2, note: 'Swamp water in a corked vial. An ingredient, not a drink — Maren insists, and so do I.' },
      { item: 'garrote_mellado', price: 2, note: 'A goblin\'s notched club. Bram breaks them down for timber; I carry them by the crate.' },
    ],
  },
};

/** Ordered ids for iteration (stable menus). */
export const VENDOR_IDS = ['herrero', 'enano', 'santuario', 'viajero'] as const;
