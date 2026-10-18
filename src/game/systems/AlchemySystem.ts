import * as THREE from 'three';
import {
  ALCHEMY_RECIPES, ALCHEMY_STATIONS, POTION_EFFECTS,
  type AlchemyRecipe, type AlchemyStationId, type PotionEffectDef,
} from '../data/alchemyRecipes';
import { ITEMS } from '../data/items';
import type { GameState } from './GameState';

/**
 * Fase 28 — LA MESA DE ALQUIMIA: the brewing engine + the timed effects.
 *
 * · Recipes consume materials + gold (checked HERE, never trusted from the
 *   UI) and grant a stackable potion, exactly like the forge.
 * · TIMED potions (POTION_ITEM_EFFECTS) open a modifier window here; the
 *   Game composes them into the live systems every frame:
 *   damage out (with the roar), damage taken, stride, breath, regeneration,
 *   fall/blast halving, the weapon enchantments (bestiary DoT) and the
 *   antidote's brief refusal of new external statuses.
 * · Windows survive the reload: serializeEffects()/deserializeEffects().
 */

export type BrewResult = 'ok' | 'materials' | 'gold';

export interface AlchemyHooks {
  notify(kind: string, title: string, body: string): void;
  /** Audio event ids ('brew' registered by Game). */
  sound(id: string): void;
  /** Spark/bubble burst at the table position (craft VFX). */
  sparks(pos: THREE.Vector3, scale?: number): void;
  setFlag(flag: string): void;
}

/** HUD chip view of one running window. */
export interface ActiveEffectView {
  id: string;
  name: string;
  icon: string;
  left: number;
  total: number;
}

export class AlchemySystem {
  /** Running windows: effect id → seconds left. */
  private effects = new Map<string, number>();
  private hooks: AlchemyHooks;
  private state: GameState;
  private tablePos = new THREE.Vector3();

  constructor(state: GameState, hooks: AlchemyHooks) {
    this.state = state;
    this.hooks = hooks;
  }

  /** The world anchor of the table (craft VFX + nothing else). */
  setTablePos(pos: THREE.Vector3): void {
    this.tablePos.copy(pos);
  }

  // ------------------------------------------------------------ queries

  stationDef(id: AlchemyStationId) {
    return ALCHEMY_STATIONS[id];
  }

  /** Recipes of the station, annotated with live availability for the UI. */
  catalog(station: AlchemyStationId): Array<{
    id: string;
    out: string;
    gold: number;
    note: string;
    canCraft: boolean;
    status: BrewResult;
    mats: Array<{ id: string; name: string; icon: string; have: number; need: number }>;
    outName: string;
    outIcon: string;
    outRarity: string;
    outDesc: string;
  }> {
    return ALCHEMY_RECIPES.filter((r) => r.station === station).map((r) => {
      const item = ITEMS[r.out];
      const mats = r.mats.map((m) => ({
        id: m.id,
        name: ITEMS[m.id]?.name ?? m.id,
        icon: ITEMS[m.id]?.icon ?? 'Package',
        have: this.state.countItem(m.id),
        need: m.count,
      }));
      let status: BrewResult = 'ok';
      if (mats.some((m) => m.have < m.need)) status = 'materials';
      else if (this.state.countItem('coin') < r.gold) status = 'gold';
      return {
        id: r.id,
        out: r.out,
        gold: r.gold,
        note: r.note,
        canCraft: status === 'ok',
        status,
        mats,
        outName: item?.name ?? r.out,
        outIcon: item?.icon ?? 'Package',
        outRarity: item?.rarity ?? 'common',
        outDesc: item?.desc ?? '',
      };
    });
  }

  // ------------------------------------------------------------ actions

  /** Run a recipe. ALL validation happens here (UI is untrusted). */
  craft(recipeId: string, station: AlchemyStationId): BrewResult {
    const r: AlchemyRecipe | undefined = ALCHEMY_RECIPES.find((x) => x.id === recipeId);
    if (!r || r.station !== station) return 'materials';
    for (const m of r.mats) {
      if (this.state.countItem(m.id) < m.count) return 'materials';
    }
    if (this.state.countItem('coin') < r.gold) return 'gold';
    // consume
    for (const m of r.mats) this.state.removeItem(m.id, m.count);
    this.state.removeItem('coin', r.gold);
    // grant
    const item = ITEMS[r.out];
    this.state.addItem(r.out, 1);
    this.state.giveXp(20);
    // the quest watchman: the first successful boil ever
    if (!this.state.hasFlag('primera_pocion')) this.hooks.setFlag('primera_pocion');
    this.hooks.sound('brew');
    this.hooks.sparks(this.tablePos, 0.55);
    this.hooks.notify('quest', `BREWED — ${item?.name ?? r.out}`,
      'Steam, salt and something faintly alive. Drink it from the satchel (TAB) when the moment is right.');
    return 'ok';
  }

  // ------------------------------------------------------------ effects

  /** Open (or re-open) a timed window. Instant potions never come here. */
  applyEffect(effectId: string): void {
    const def = POTION_EFFECTS[effectId];
    if (!def) return;
    this.effects.set(effectId, Math.max(this.effects.get(effectId) ?? 0, def.dur));
  }

  /** Clear running windows (antidote's consume-time half). */
  cureExternals(): void {
    this.effects.delete('antidoto');
    // nothing else is clearable — the rest are potions, not ailments
  }

  update(dt: number): void {
    if (this.effects.size === 0) return;
    for (const [id, left] of [...this.effects]) {
      const next = left - dt;
      if (next > 0) {
        this.effects.set(id, next);
        continue;
      }
      this.effects.delete(id);
      const def = POTION_EFFECTS[id];
      if (def) {
        this.hooks.notify('info', `${def.name} se desvanece`, fadeLine(id));
      }
    }
  }

  // ---- composed getters (Game wires these into the live systems) ----

  damageOutMul(): number {
    return this.compose('damageOutMul', 1, (a, b) => a * b);
  }

  damageTakenMul(): number {
    return this.compose('damageTakenMul', 1, (a, b) => a * b);
  }

  speedMul(): number {
    return this.compose('speedMul', 1, (a, b) => a * b);
  }

  staminaRegenMul(): number {
    return this.compose('staminaRegenMul', 1, (a, b) => a * b);
  }

  hpPerSec(): number {
    return this.compose('hpPerSec', 0, (a, b) => a + b);
  }

  /** Fall + blast damage multiplier (1 = untouched). */
  fallAndBlastMul(): number {
    return this.compose('fallAndBlastMul', 1, (a, b) => a * b);
  }

  /** The weapon edge's DoT while an oil lasts (burn checked first). */
  weaponEnchant(): 'poison' | 'burn' | null {
    if (this.effects.has('arma_fuego')) return 'burn';
    if (this.effects.has('arma_veneno')) return 'poison';
    return null;
  }

  /** Seconds of status refusal left (antidote). */
  statusImmuneLeft(): number {
    return this.effects.get('antidoto') ?? 0;
  }

  /** HUD strip view (ordered by time left). */
  activeEffectsView(): ActiveEffectView[] {
    const out: ActiveEffectView[] = [];
    for (const [id, left] of this.effects) {
      const def = POTION_EFFECTS[id];
      if (!def || def.dur <= 0) continue;
      out.push({ id, name: def.name, icon: def.icon, left: Math.max(0, left), total: def.dur });
    }
    out.sort((a, b) => a.left - b.left);
    return out;
  }

  /** Save hook — running windows survive the reload. */
  serializeEffects(): Array<{ id: string; left: number }> {
    return [...this.effects].map(([id, left]) => ({ id, left: Math.round(left * 10) / 10 }));
  }

  /** Load hook — old/unknown ids are dropped, windows clamp to their def. */
  deserializeEffects(list?: Array<{ id: string; left: number }> | null): void {
    this.effects.clear();
    if (!list) return;
    for (const e of list) {
      const def = POTION_EFFECTS[e.id];
      if (!def) continue;
      this.effects.set(e.id, Math.min(Math.max(0, e.left), def.dur));
    }
  }

  /** Compose a numeric field across every running window. */
  private compose<K extends keyof PotionEffectDef>(
    field: K, identity: number, combine: (a: number, b: number) => number,
  ): number {
    let acc = identity;
    for (const id of this.effects.keys()) {
      const def = POTION_EFFECTS[id] as PotionEffectDef | undefined;
      if (!def) continue;
      const v = def[field] as number | undefined;
      if (typeof v === 'number') acc = combine(acc, v);
    }
    return acc;
  }
}

/** One flavour line per effect, for the expiry toast. */
function fadeLine(id: string): string {
  switch (id) {
    case 'fuerza': return 'The arms remember being trees. Barely.';
    case 'piel_piedra': return 'Your skin softens back to skin.';
    case 'viento': return 'The wind that carried you goes on without you.';
    case 'regeneracion': return 'The flesh stops knitting. Whatever is closed, stays closed.';
    case 'arma_veneno': return 'The rot on your edge dries to a stain.';
    case 'arma_fuego': return 'The embers on your edge cool to soot.';
    case 'masa_inerte': return 'Your mass remembers it can be broken. Mind the long drops.';
    case 'antidoto': return 'The swamp water finishes its work.';
    default: return 'It passes.';
  }
}
