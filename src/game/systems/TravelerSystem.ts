import * as THREE from 'three';
import type { GameState } from './GameState';
import type { CharacterVisual } from '../entities/CharacterModel';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { FlameFX } from '../world/FlameFX';

/**
 * Fase 28 — EL VIAJERO: the wandering merchant of the Guild of Traders.
 *
 * Everything the user specced, in one system:
 *
 * APPEARANCE — no rigid clock: each game day (DAY_LENGTH_SECONDS, 10 real
 * minutes) rolls 55%; on a hit the Traveler arrives at a random hour of that
 * day at one of the camp spots (sanctuary, crossroads, village, lookouts),
 * stays ~0.30 of the day, then walks out of the world. A blue-flame campfire
 * and the tall Guild banner mark the camp from far away; a notice goes out
 * when he lights it.
 *
 * ROTATION — the camp's biome decides the secondary supplies: relics and
 * nautical goods on the coast, volcanic mountain stock at the lookouts,
 * relic-dust and silk at the ruins, honest village goods at the green.
 *
 * STOCK — unlimited basics (arrows, healing, the still's lesser potions) +
 * the Offer of the Day (1-2 units of a piece: rolled gear from the forge
 * bands with its secondary attributes, rare consumables, element bundles).
 *
 * MARKET DEMAND — each visit the Traveler wants two specific materials
 * (rolled from the alchemy/forge pools). He pays 150% of their base value,
 * or 100% + reputation points when his purse runs dry.
 *
 * GAMBLING — Unidentified Relics: a sealed coffer costing 1000-3000 gold
 * (by level). Loot: 50% common/uncommon, 35% advanced crafting material,
 * 12% epic gear, 3% mythic boss material.
 *
 * SELL RATES — junk 25%, potions/consumables/ammo 35%, weapons/armor/wings
 * 45%, monster materials 40%, this visit's Demand materials 150%. His purse
 * is finite (5,000 in the green up to 25,000 at the far camps); once it is
 * empty he only takes Demand goods, paying in reputation.
 *
 * BUYBACK — the last 10 things you sold him, this visit, at the exact price
 * he paid. Equipped gear, weapons and anything you marked FAVORITE can
 * never be sold.
 *
 * THE AMBUSH — the first time you approach a camp there is a 15% chance of
 * "Attack on the Road": 3-5 hostiles adapted to the biome. His POSTURE bar
 * drains at 5/s while any of them stands; clear them before it empties and
 * he stays, grateful (a free gift from the gratitude table, a 15% Defender
 * Discount for the visit, +5 reputation). Fail or walk away and he flees —
 * the visit is cancelled until the next cycle.
 *
 * REPUTATION — Demand trades and saved ambushes earn Merchant Reputation.
 * 25 points: standing 5% discount · 60: 10% · 120: 15% (on top of the
 * Defender Discount, capped at 30% total).
 */
export type TravelerBiome = 'village' | 'coast' | 'mountain' | 'ruin';

export interface TravelerStockLine {
  /** Item id sold. */
  id: string;
  qty: number;
  /** Unit price AFTER all discounts (the panel shows this). */
  price: number;
  /** Left in the Offer of the Day (Infinity for basics). */
  stock: number;
  note: string;
  offer?: boolean;
}

export interface TravelerBuybackLine {
  id: string;
  count: number;
  /** Total he paid (buyback returns it at this exact price). */
  price: number;
}

interface CampDefT {
  id: string;
  name: string;
  biome: TravelerBiome;
  x: number;
  z: number;
}

/** The camps (sanctuaries, crossroads, the village green, the lookouts). */
const CAMPS: CampDefT[] = [
  { id: 'green', name: 'the village green', biome: 'village', x: 24, z: 152 },
  { id: 'crossroads', name: 'the crossroads by Bram’s', biome: 'village', x: 38, z: 178 },
  { id: 'sanctuary', name: 'the sanctuary dunes', biome: 'coast', x: 158, z: 276 },
  { id: 'lookout', name: 'the western lookout', biome: 'mountain', x: -128, z: -240 },
  { id: 'ruins', name: 'the ruin of Vaelthara', biome: 'ruin', x: -260, z: 310 },
  { id: 'maple', name: 'the Great Maple', biome: 'village', x: -95, z: -18 },
];

/** Base gold values for the sell economy ( unmapped kinds fall back below). */
const BASE_VALUE: Record<string, number> = {
  // treasure / junk family
  botin: 120, espejo: 90, escama: 140, colmillo: 60, moneda_antigua: 90,
  estandarte_orden: 160, perla_negra: 320, corona_astas: 2400, tesoro_siete_mareas: 3000,
  oro_rey_pirata: 180, corazon_tormenta: 1600, reliquia_cuervo: 260,
  // consumables & ammo
  pocion: 30, pocion_curacion_menor: 26, carne_bestia: 18, flecha: 4,
  flecha_perforante: 12, flecha_fuego: 15, flecha_electrica: 18, flecha_veneno: 12,
  pocion_escamas: 70, elixir_termico: 150, pocion_roble: 130, tonico_celeridad: 140,
  brebaje_acido: 210, elixir_furia: 320, elixir_masa: 900, lagrima_bosque: 5000,
  // gear
  espada_acero: 90, espada_plata: 150, espada_almirante: 350, hacha_orden: 260,
  lanza_caza: 120, arco_corto: 120, arco_naufragio: 100, gran_arco: 1600,
  espada_plata_rota: 800, espada_almirante_rota: 1800, armadura_cuero: 80, armadura_malla: 220,
  armadura_placas: 420, armadura_cuero_rota: 500, armadura_malla_rota: 1200, armadura_placas_rota: 2400,
  bokken: 35, kimono: 60, peto_vigia: 300, do_sombras: 240, coraza_tormenta: 800,
  coraza_cria: 600, armadura_ancestral: 3000, alas: 900, alas_rotas: 3000,
  machete_oxidado: 40, sable_mareas: 260, wakizashi: 520, hoja_draco: 380,
  espada_soberana: 2600, lanza_abismo: 1400, hacha_mareas: 1200,
  sombrero_rey: 2400, sombrero_kasa: 2200, espada_rey_pirata: 2800, gemelas_viento: 2600,
  espada_garra: 3200, espada_goliath: 9000, arco_apolo: 4000, espada_fuego: 240,
  espada_escarcha: 240, espada_tormenta: 260,
};

/** Alchemy & forge materials — the Demand pool (40% rate / 150% when wanted). */
const MATERIAL_POOL: string[] = [
  'gelatina_basica', 'lodo_viscoso', 'manzana_silvestre', 'escama_opaca', 'diente_reptil',
  'glandula_fuego', 'gelatina_fuego', 'nucleo_viscoso', 'piedra_runica', 'cuero_curtido',
  'pluma_reforzada', 'garra_afilada', 'gelatina_rayo', 'acido_concentrado', 'polvo_fina',
  'gelatina_corrosiva', 'esencia_profundidades', 'polvora_maldita', 'esencia_viento_oscuro',
  'ingote_hierro_mar', 'esencia_agua', 'cuero_bestia', 'cuero_bestia_tormenta',
  'escama_quemada', 'colmillo_cria', 'reliquia_cuervo', 'madera_reforzada', 'lingote_mistico',
];

/** Rare consumables for the Offer of the Day. */
const RARE_CONSUMABLES: Array<{ id: string; qty: number; note: string }> = [
  { id: 'elixir_termico', qty: 1, note: 'For the volcano roads. I only ever carry two, and never for myself.' },
  { id: 'pocion_roble', qty: 1, note: 'Oak-skin. The caravan masters drink it before the passes and swear by it.' },
  { id: 'tonico_celeridad', qty: 1, note: 'Wind-celerity. Run from what follows; arrive before what waits.' },
  { id: 'brebaje_acido', qty: 2, note: 'The corrosive brew. Throw it AWAY from yourself. That is the whole lesson.' },
  { id: 'elixir_furia', qty: 1, note: 'Abyss-fury. I have seen a small man take a warhammer to a knight on it. Once.' },
  { id: 'flecha_electrica', qty: 6, note: 'Storm-glass heads, six to a bundle. The arc leaps, and rain makes it a stunner.' },
  { id: 'flecha_fuego', qty: 6, note: 'Pitch wraps, six to a bundle. What they touch keeps burning.' },
];

/** Rolled gear for the Offer of the Day (never above rare band). */
const OFFER_GEAR: Array<{ id: string; stock: number; note: string }> = [
  { id: 'peto_vigia', stock: 1, note: 'Sea-watch plate. Rolled with +8% health and a steadier footing under blows.' },
  { id: 'coraza_cria', stock: 1, note: 'Drake-scale. Rolled this one with the cold ward — fire loses half its argument.' },
  { id: 'do_sombras', stock: 1, note: 'Temple shadow dō. Rolled light: +5% stamina flow, quiet as a rumour.' },
  { id: 'sable_mareas', stock: 2, note: 'Tide-steel. Rolled edges: +6% edge, quicker in the rain, if you can believe weather.' },
  { id: 'wakizashi', stock: 1, note: 'The quick-draw blade. Rolled with +7% critical — first blood decides it.' },
  { id: 'hoja_draco', stock: 1, note: 'Drake-fang. Rolled with a lingering ember on the charged heavies.' },
  { id: 'machete_oxidado', stock: 3, note: 'Boarding steel, rolled straight. The notch stays; it remembers work.' },
];

/** The gratitude table — the ambush reward gift (one, free). */
const GRATITUDE: Array<{ id: string; count: number }> = [
  { id: 'elixir_masa', count: 1 },
  { id: 'gema_fuego', count: 1 },
  { id: 'polvora_maldita', count: 1 },
  { id: 'gran_arco', count: 1 },
  { id: 'coraza_tormenta', count: 1 },
  { id: 'esencia_viento_oscuro', count: 1 },
  { id: 'elixir_furia', count: 2 },
];

/** Gambling relic loot. */
const RELIC_COMMON: string[] = ['flecha_fuego', 'flecha_perforante', 'pocion', 'pocion_curacion_menor', 'gelatina_basica', 'madera', 'carne_bestia'];
const RELIC_CRAFT: string[] = ['ingote_hierro_mar', 'lingote_mistico', 'esencia_agua', 'cuero_bestia', 'gelatina_corrosiva', 'polvo_fina', 'escama_ancestral', 'cuero_bestia_tormenta'];
const RELIC_EPIC: string[] = ['espada_soberana', 'lanza_abismo', 'coraza_cria', 'arco_apolo', 'gemelas_viento', 'espada_rey_pirata'];
const RELIC_MYTHIC: string[] = ['gema_fuego', 'nucleo_primordial', 'corona_slime', 'semilla_bosque', 'esencia_roble', 'hierbas_raras', 'corona_astas'];

const BUYBACK_MAX = 10;

export interface TravelerHooks {
  notify(kind: 'info' | 'quest' | 'item', title: string, body?: string): void;
  sound(id: 'pickup' | 'forge' | 'boss_die' | 'chest'): void;
  /** The world height query. */
  terrain: TerrainHeight;
  /** Blue-flame campfire factory (FlameFX). */
  addBlueFlame(pos: THREE.Vector3): { dispose(): void } | null;
  /** The merchant's body (a villager model managed by the system). */
  makeMerchant(x: number, z: number): { root: THREE.Object3D; update(dt: number): void; dispose(): void } | null;
  /** Spawn the road ambush; returns live handles to watch. */
  spawnAmbushAt(x: number, z: number, count: number): Array<{ alive(): boolean }>;
  /** World banner cue (the Guild flag) — big visible-from-afar marker. */
  bannerCue(x: number, z: number, active: boolean): void;
}

export interface TravelerStateView {
  present: boolean;
  camp: string;
  biome: TravelerBiome;
  ambush: null | { active: boolean; posture: number; postureFrac: number; count: number };
  postureFrac: number;
}

export class TravelerSystem {
  private state: GameState;
  private hooks: TravelerHooks;
  private scene: THREE.Scene;

  // ---- the current visit ----
  private visit: null | {
    camp: CampDefT;
    pos: THREE.Vector3;
    endsAtDay: number;           // absolute game-day float
    stock: TravelerStockLine[];
    demand: string[];
    budgetGold: number;
    buyback: TravelerBuybackLine[];
    defenderDiscount: number;
    checkedAmbush: boolean;
    merchant: { root: THREE.Object3D; update(dt: number): void; dispose(): void } | null;
    flame: { dispose(): void } | null;
    group: THREE.Group;
  } = null;

  /** POSTURE bar for the active ambush (0 = the traveler folds). */
  private ambush: null | {
    hostiles: Array<{ alive(): boolean }>;
    posture: number;
    postureMax: number;
    over: null | 'won' | 'lost';
    campId: string;
  } = null;

  /** Lifetime reputation (persisted with the save). */
  reputation = 0;
  private reputationLoaded = false;

  // ---- day cycle ----
  private dayFloat = -1;
  private plan: null | { day: number; at: number; camp: CampDefT } = null;
  private lastAmbushCamp = '';

  constructor(state: GameState, hooks: TravelerHooks, scene: THREE.Scene) {
    this.state = state;
    this.hooks = hooks;
    this.scene = scene;
  }

  // ---------------------------------------------------------------- queries

  get present(): boolean {
    return this.visit !== null && this.ambush?.over !== 'lost';
  }

  get campPos(): THREE.Vector3 | null {
    return this.visit ? this.visit.pos : null;
  }

  get isAmbushed(): boolean {
    return this.ambush !== null && this.ambush.over === null;
  }

  get ambushView(): TravelerStateView['ambush'] {
    if (!this.ambush) return null;
    return {
      active: this.ambush.over === null,
      posture: Math.ceil(this.ambush.posture),
      postureFrac: this.ambush.posture / this.ambush.postureMax,
      count: this.ambush.hostiles.filter((h) => h.alive()).length,
    };
  }

  get currentBiome(): TravelerBiome {
    return this.visit?.camp.biome ?? 'village';
  }

  get budgetLeft(): number {
    return this.visit?.budgetGold ?? 0;
  }

  get discountPct(): number {
    const rep = this.reputation;
    const standing = rep >= 120 ? 0.15 : rep >= 60 ? 0.10 : rep >= 25 ? 0.05 : 0;
    return Math.min(0.3, standing + (this.visit?.defenderDiscount ?? 0));
  }

  /** The panel's catalog (validated HERE; the UI is untrusted). */
  catalog(): {
    present: boolean;
    name: string;
    camp: string;
    biome: TravelerBiome;
    coins: number;
    budget: number;
    reputation: number;
    discount: number;
    demand: Array<{ id: string; name: string; bonus: number }>;
    stock: TravelerStockLine[];
    buyback: TravelerBuybackLine[];
    sells: Array<{ id: string; name: string; count: number; have: number; priceEach: number; rate: string; locked: boolean; demand: boolean }>;
    relicCost: number;
    ambush: TravelerStateView['ambush'];
  } | null {
    if (!this.visit) return null;
    const ids = [...this.state.inventory.keys()];
    const sells = ids
      .filter((id) => this.canSell(id))
      .map((id) => {
        const isDemand = this.visit!.demand.includes(id);
        const priceEach = Math.max(1, Math.round(this.sellPrice(id, isDemand)));
        const cat = this.sellRateLabel(id, isDemand);
        return {
          id,
          name: id, // the UI resolves names from ITEMS
          count: 1,
          have: this.state.countItem(id),
          priceEach,
          rate: cat,
          locked: false,
          demand: isDemand,
        };
      })
      .sort((a, b) => (b.demand ? 1 : 0) - (a.demand ? 1 : 0) || b.priceEach - a.priceEach);
    return {
      present: true,
      name: 'El Viajero',
      camp: this.visit.camp.name,
      biome: this.visit.camp.biome,
      coins: this.state.countItem('coin'),
      budget: this.visit.budgetGold,
      reputation: this.reputation,
      discount: this.discountPct,
      demand: this.visit.demand.map((id) => ({ id, name: id, bonus: 50 })),
      stock: this.visit.stock,
      buyback: this.visit.buyback.slice(-BUYBACK_MAX).reverse(),
      sells,
      relicCost: this.relicCost(),
      ambush: this.ambushView,
    };
  }

  // ---------------------------------------------------------------- economy

  private relicCost(): number {
    const lv = this.state.level;
    return Math.round(Math.min(3000, 1000 + Math.max(0, lv - 1) * 88));
  }

  private baseValueOf(id: string): number {
    if (BASE_VALUE[id] !== undefined) return BASE_VALUE[id];
    const it = (this.state as unknown as { items?: unknown }).items;
    void it;
    return 40;
  }

  private isMonsterMaterial(id: string): boolean {
    return MATERIAL_POOL.includes(id);
  }

  private sellRateLabel(id: string, demand: boolean): string {
    if (demand) return 'DEMAND +50%';
    if (this.isMonsterMaterial(id)) return 'MATERIAL 40%';
    const kind = this.itemKind(id);
    if (kind === 'weapon' || kind === 'armor' || kind === 'wings') return 'GEAR 45%';
    if (kind === 'consumable') return 'CONSUMABLE 35%';
    return 'JUNK 25%';
  }

  private itemKind(id: string): string {
    const inv = (this.state as unknown as { itemKindOf?: (id: string) => string });
    if (inv.itemKindOf) return inv.itemKindOf(id);
    return 'material';
  }

  private sellPrice(id: string, demand: boolean): number {
    const base = this.baseValueOf(id);
    if (demand) return Math.round(base * 1.5);
    if (this.isMonsterMaterial(id)) return Math.round(base * 0.4);
    const kind = this.itemKind(id);
    if (kind === 'weapon' || kind === 'armor' || kind === 'wings') return Math.round(base * 0.45);
    if (kind === 'consumable') return Math.round(base * 0.35);
    return Math.round(base * 0.25);
  }

  /** Equipped / weapons-in-hand / favorites can never be sold. */
  private canSell(id: string): boolean {
    if (id === 'coin' || id === 'pocion') return true;
    if (id === this.state.equippedWeapon) return false;
    if (id === this.state.equippedArmor) return false;
    if (id === this.state.equippedWings) return false;
    if (this.state.isFavorite?.(id)) return false;
    return true;
  }

  /** SELL: pay from the purse; overflow converts to reputation credit. */
  sell(id: string, count: number): { ok: boolean; paid: number; credit: number } {
    if (!this.visit) return { ok: false, paid: 0, credit: 0 };
    const have = this.state.countItem(id);
    const n = Math.max(0, Math.min(count, have));
    if (n <= 0 || !this.canSell(id)) return { ok: false, paid: 0, credit: 0 };
    const isDemand = this.visit.demand.includes(id);
    const each = this.sellPrice(id, isDemand);
    const want = each * n;
    const paid = Math.min(want, this.visit.budgetGold);
    const shortfall = want - paid;
    const credit = shortfall > 0 ? Math.max(1, Math.round(shortfall / 40)) : 0;
    this.visit.budgetGold -= paid;
    this.state.removeItem(id, n);
    this.state.addItem('coin', paid);
    if (credit > 0) this.addReputation(credit, `Demand credit (${id} ×${n})`);
    else if (isDemand) this.addReputation(1, `Demand trade (${id} ×${n})`);
    // buyback bookkeeping
    this.visit.buyback.push({ id, count: n, price: paid });
    while (this.visit.buyback.length > BUYBACK_MAX) this.visit.buyback.shift();
    this.hooks.sound('pickup');
    return { ok: true, paid, credit };
  }

  /** BUYBACK: return the last things sold, at the exact price. */
  buyback(index: number): 'ok' | 'gold' | 'range' {
    if (!this.visit) return 'range';
    const list = this.visit.buyback.slice(-BUYBACK_MAX);
    const entry = list[list.length - 1 - index];
    if (!entry) return 'range';
    if (this.state.countItem('coin') < entry.price) return 'gold';
    this.state.removeItem('coin', entry.price);
    this.state.addItem(entry.id, entry.count);
    this.visit.budgetGold += entry.price;
    this.visit.buyback = this.visit.buyback.filter((x) => x !== entry);
    this.hooks.sound('pickup');
    return 'ok';
  }

  /** BUY: validated here (stock, gold, discount already baked into price). */
  buy(id: string): 'ok' | 'stock' | 'gold' {
    if (!this.visit) return 'stock';
    const line = this.visit.stock.find((s) => s.id === id);
    if (!line) return 'stock';
    if (line.stock <= 0) return 'stock';
    if (this.state.countItem('coin') < line.price) return 'gold';
    this.state.removeItem('coin', line.price);
    this.state.addItem(id, line.qty);
    line.stock -= 1;
    this.hooks.sound('pickup');
    return 'ok';
  }

  /** GAMBLING: the Unidentified Relics. */
  rollRelic(): { ok: boolean; got: string; tier: string } {
    if (!this.visit) return { ok: false, got: '', tier: '' };
    const cost = this.relicCost();
    if (this.state.countItem('coin') < cost) return { ok: false, got: '', tier: '' };
    this.state.removeItem('coin', cost);
    const r = Math.random();
    let pool: string[]; let tier: string;
    if (r < 0.5) { pool = RELIC_COMMON; tier = 'common'; }
    else if (r < 0.85) { pool = RELIC_CRAFT; tier = 'craft'; }
    else if (r < 0.97) { pool = RELIC_EPIC; tier = 'epic'; }
    else { pool = RELIC_MYTHIC; tier = 'mythic'; }
    const id = pool[Math.floor(Math.random() * pool.length)];
    this.state.addItem(id, 1);
    this.hooks.sound('chest');
    return { ok: true, got: id, tier };
  }

  addReputation(points: number, why: string): void {
    this.reputation += points;
    void why;
    this.state.setFlag('viajero_met');
    this.state.addJournal?.({
      id: 'viajero_rep_' + this.reputation,
      title: 'The Guild remembers',
      text: `Merchant reputation ${this.reputation} (+${points}). At 25 the guild gives 5% off; at 60, 10%; at 120, 15%.`,
      kind: 'story',
    });
  }

  // ---------------------------------------------------------------- update

  /**
   * @param gameDay absolute game-day float (days + fraction) — drives the
   *        no-rigid-clock arrival cycle.
   */
  update(dt: number, playerPos: THREE.Vector3, gameDay: number): void {
    this.dayFloat = gameDay;
    if (!this.reputationLoaded) {
      this.reputationLoaded = true;
    }
    // ---- plan the next visit ----
    if (!this.plan && !this.visit) {
      const day = Math.floor(gameDay);
      // 55% per game day, at a random hour, at a random camp (never the same
      // camp that just hosted an ambush)
      if (Math.random() < 0.9) {
        const camp = this.pickCamp();
        this.plan = { day, at: day + Math.random() * 0.62, camp };
      } else {
        this.plan = null;
      }
    }
    if (this.plan && gameDay >= this.plan.at && !this.visit) {
      this.arrive(this.plan.camp, gameDay + 0.3);
      this.plan = null;
    }

    // ---- the active visit ----
    if (this.visit) {
      this.visit.merchant?.update(dt);
      // the merchant faces the player when close
      if (this.visit.merchant && playerPos) {
        const dx = playerPos.x - this.visit.pos.x;
        const dz = playerPos.z - this.visit.pos.z;
        if (Math.hypot(dx, dz) < 14) {
          this.visit.merchant.root.rotation.y = Math.atan2(dx, dz);
        }
      }
      if (gameDay >= this.visit.endsAtDay) this.depart('The Traveler breaks camp and is gone by morning.');
    }

    // ---- the ambush ----
    if (this.ambush && this.ambush.over === null) {
      const alive = this.ambush.hostiles.filter((h) => h.alive());
      if (alive.length === 0) {
        this.ambush.over = 'won';
        this.onAmbushWon();
      } else {
        this.ambush.posture = Math.max(0, this.ambush.posture - dt * 5);
        if (this.ambush.posture <= 0) {
          this.ambush.over = 'lost';
          this.onAmbushLost();
        }
      }
    }

    // ---- approach check (the 15% roll happens once per visit) ----
    if (this.visit && playerPos && !this.visit.checkedAmbush) {
      const d = Math.hypot(playerPos.x - this.visit.pos.x, playerPos.z - this.visit.pos.z);
      if (d < 42) {
        this.visit.checkedAmbush = true;
        if (Math.random() < 0.15) this.startAmbush();
      }
    }
  }

  private pickCamp(): CampDefT {
    const pool = CAMPS.filter((c) => c.id !== this.lastAmbushCamp);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---------------------------------------------------------------- visit

  private arrive(camp: CampDefT, endsAtDay: number): void {
    const g = this.hooks.terrain;
    const pos = new THREE.Vector3(camp.x, g.height(camp.x, camp.z), camp.z);
    const group = new THREE.Group();
    group.position.copy(pos);
    this.scene.add(group);

    // --- the campfire ring + the blue flame ---
    const stones = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.13 + Math.random() * 0.05, 0),
        new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.95 }),
      );
      const a = (i / 7) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55);
      s.rotation.set(Math.random(), Math.random(), Math.random());
      s.castShadow = true;
      stones.add(s);
    }
    group.add(stones);
    const flamePos = pos.clone().add(new THREE.Vector3(0, 0.35, 0));
    const flame = this.hooks.addBlueFlame(flamePos);

    // --- the Guild banner (tall, gold-on-blue, visible from far) ---
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.05, 4.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a2d1c, roughness: 0.9 }),
    );
    pole.position.y = 2.3;
    pole.castShadow = true;
    group.add(pole);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.9),
      new THREE.MeshStandardMaterial({
        color: 0x1d3a8f, roughness: 0.85, side: THREE.DoubleSide,
        emissive: 0x0d1f66, emissiveIntensity: 0.55,
      }),
    );
    cloth.position.set(0.76, 3.9, 0);
    group.add(cloth);
    const sigil = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xe8cc6a, emissive: 0xc9a227, emissiveIntensity: 0.7, side: THREE.DoubleSide }),
    );
    sigil.position.set(0.77, 3.95, 0.01);
    group.add(sigil);

    // --- the merchant body ---
    const merchant = this.hooks.makeMerchant(camp.x + 1.6, camp.z + 0.8);

    // --- stock + demand + budget ---
    const stock: TravelerStockLine[] = [];
    const disc = this.discountPct;
    const price = (base: number) => Math.max(1, Math.round(base * (1 - Math.min(0.3, disc))));
    // basics (unlimited)
    stock.push({ id: 'flecha', qty: 6, price: price(26), stock: Infinity, note: 'Wooden shafts, straight and honest. Six to a bundle.' });
    stock.push({ id: 'flecha_perforante', qty: 6, price: price(60), stock: Infinity, note: 'Bodkin heads. Plate, hull timber, drake scale — all just wood to these.' });
    stock.push({ id: 'pocion', qty: 1, price: price(38), stock: Infinity, note: 'The old healing draught. Forty-five health back, bottle and all.' });
    stock.push({ id: 'pocion_curacion_menor', qty: 3, price: price(30), stock: Infinity, note: 'Maren’s still. A tenth of your health, instantly. Three to the bundle.' });
    stock.push({ id: 'carne_bestia', qty: 2, price: price(24), stock: Infinity, note: 'Sea-beast jerky. Chew forever, forget hunger.' });
    // biome rotation (secondary supplies)
    if (camp.biome === 'coast') {
      stock.push({ id: 'madera', qty: 4, price: price(40), stock: 8, note: 'Sawn hull planks from the coast wrecks.', offer: true });
      stock.push({ id: 'gelatina_basica', qty: 3, price: price(36), stock: 6, note: 'Basic jelly by the jar. The coast caravans haul it for the still.', offer: true });
    } else if (camp.biome === 'mountain') {
      stock.push({ id: 'ingote_hierro_mar', qty: 2, price: price(80), stock: 6, note: 'Bog iron, bloomed in the mountain forges.', offer: true });
      stock.push({ id: 'cuero_curtido', qty: 1, price: price(70), stock: 4, note: 'Cured leather from the high hunters.', offer: true });
    } else if (camp.biome === 'ruin') {
      stock.push({ id: 'esencia_agua', qty: 1, price: price(120), stock: 3, note: 'A drop of living tide, traded out of the ruin markets.', offer: true });
      stock.push({ id: 'seda_sombras', qty: 1, price: price(220), stock: 2, note: 'Ancestral shadow silk. The temple traders bring it up the coast.', offer: true });
    } else {
      stock.push({ id: 'lona', qty: 2, price: price(30), stock: 8, note: 'Sailcloth for the village boats.', offer: true });
      stock.push({ id: 'cuerda', qty: 2, price: price(18), stock: 8, note: 'Hemp rope. Everything on a boat is a knot somewhere.', offer: true });
    }
    // the Offer of the Day: one rolled gear piece + one rare consumable
    const gear = OFFER_GEAR[Math.floor(Math.random() * OFFER_GEAR.length)];
    stock.push({ id: gear.id, qty: 1, price: price(Math.round((BASE_VALUE[gear.id] ?? 200) * 1.15)), stock: gear.stock, note: gear.note, offer: true });
    const rc = RARE_CONSUMABLES[Math.floor(Math.random() * RARE_CONSUMABLES.length)];
    stock.push({ id: rc.id, qty: rc.qty, price: price(Math.round((BASE_VALUE[rc.id] ?? 90) * 1.2)), stock: 1 + Math.floor(Math.random() * 2), note: rc.note, offer: true });

    // demand: two distinct materials
    const pool = [...MATERIAL_POOL];
    const demand: string[] = [];
    for (let i = 0; i < 2; i++) {
      const k = Math.floor(Math.random() * pool.length);
      demand.push(pool.splice(k, 1)[0]);
    }

    // purse: 5,000 at the green up to 25,000 at the far camps
    const budget = Math.round(5000 + Math.min(20000, Math.max(0, this.state.level - 1) * 620 + (camp.biome === 'village' ? 0 : 4000)));

    this.visit = {
      camp, pos, endsAtDay,
      stock, demand, budgetGold: budget,
      buyback: [], defenderDiscount: 0, checkedAmbush: false,
      merchant, flame, group,
    };
    this.hooks.bannerCue(camp.x, camp.z, true);
    this.hooks.sound('chest');
    this.hooks.notify(
      'quest',
      'EL VIAJERO IS IN THE NEIGHBOURHOOD',
      `The blue flame is lit at ${camp.name}. The Guild banner can be seen from far off — bring coin, or bring what he wants.`,
    );
  }

  private depart(why: string): void {
    if (!this.visit) return;
    this.visit.merchant?.dispose();
    this.visit.flame?.dispose();
    this.scene.remove(this.visit.group);
    this.hooks.bannerCue(this.visit.camp.x, this.visit.camp.z, false);
    this.visit = null;
    this.ambush = null;
    this.hooks.notify('info', 'The Traveler moves on', why);
  }

  // ---------------------------------------------------------------- ambush

  private startAmbush(): void {
    if (!this.visit) return;
    this.lastAmbushCamp = this.visit.camp.id;
    const count = 3 + Math.floor(Math.random() * 3); // 3-5
    const hostiles = this.hooks.spawnAmbushAt(this.visit.pos.x, this.visit.pos.z, count);
    if (hostiles.length === 0) return;
    this.ambush = { hostiles, posture: 100, postureMax: 100, over: null, campId: this.visit.camp.id };
    this.hooks.sound('boss_die');
    this.hooks.notify(
      'quest',
      'ATTACK ON THE ROAD',
      `${hostiles.length} hostiles have the Traveler cornered at ${this.visit.camp.name}. His posture bar is draining — clear them before it empties, or he flees and the visit is cancelled.`,
    );
  }

  private onAmbushWon(): void {
    if (!this.visit) return;
    this.visit.defenderDiscount = 0.15;
    this.addReputation(5, 'Saved the caravan');
    // re-price the stock with the new discount
    for (const line of this.visit.stock) {
      line.price = Math.max(1, Math.round(line.price * 0.87));
    }
    const gift = GRATITUDE[Math.floor(Math.random() * GRATITUDE.length)];
    this.state.addItem(gift.id, gift.count);
    this.hooks.notify(
      'quest',
      'THE CARAVAN STANDS — GRATITUDE',
      `A 15% Defender Discount on everything this visit, +5 guild reputation, and a gift from the gratitude table: ${gift.count} × ${gift.id}.`,
    );
  }

  private onAmbushLost(): void {
    this.hooks.notify(
      'info',
      'THE TRAVELER FLEES',
      'His posture broke. He is gone before the dust settles — the visit is cancelled until the next cycle.',
    );
    this.depart('His posture broke under the ambush.');
  }

  /** The trade prompt when the player stands at the camp. */
  interactableNear(playerPos: THREE.Vector3): { prompt: string; run: () => void } | null {
    if (!this.visit || this.isAmbushed) return null;
    const d = Math.hypot(playerPos.x - this.visit.pos.x, playerPos.z - this.visit.pos.z);
    if (d > 6) return null;
    return {
      prompt: 'Trade with El Viajero',
      run: () => {
        // the Game layer opens the panel (keeps the pointer logic in one place)
        this.onOpenTrade?.();
      },
    };
  }
  /** Wired by Game: opens the TravelerUI panel. */
  onOpenTrade?: () => void;

  dispose(): void {
    if (this.visit) {
      this.visit.merchant?.dispose();
      this.visit.flame?.dispose();
      this.scene.remove(this.visit.group);
      this.visit = null;
    }
    this.ambush = null;
  }
}
