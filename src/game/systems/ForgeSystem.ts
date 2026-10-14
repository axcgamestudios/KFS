import * as THREE from 'three';
import { FORGE_RECIPES, FORGE_STATIONS, type ForgeRecipe, type ForgeStationId } from '../data/forgeRecipes';
import { ITEMS } from '../data/items';
import type { GameState } from './GameState';

/**
 * Fase 22 — THE FORGE OF LEGENDS: the crafting engine.
 *
 * · Recipes consume materials + gold (checked HERE, never trusted from the
 *   UI) and grant the forged item.
 * · THE ECLIPSE: presenting the Primal Sun Essence at the Altar of the Gods
 *   summons a total eclipse for ECLIPSE_DURATION seconds — the sky darkens,
 *   the sun becomes a ring of fire, and the Altar will string Apollo's Bow
 *   for as long as it holds. The essence is only spent by the craft itself,
 *   so a missed window can be re-summoned.
 * · Crafted-once gates are NOT stored: the materials are the cost. (Catalysts
 *   are keys — folding Goliath eats the four blades and can never repeat.)
 */

export const ECLIPSE_DURATION = 240;

export type CraftResult = 'ok' | 'materials' | 'gold' | 'level' | 'gate';

export interface ForgeHooks {
  notify(kind: string, title: string, body: string): void;
  /** Ring the station: hammer + quench + choir (audio event ids). */
  sound(id: string): void;
  /** Spark burst at the station position (craft VFX). */
  sparks(pos: THREE.Vector3, scale?: number): void;
  cameraShake(i: number): void;
}

export class ForgeSystem {
  /** Seconds of eclipse left (0 = clear sky). */
  private eclipseT = 0;
  private hooks: ForgeHooks;
  private state: GameState;

  constructor(state: GameState, hooks: ForgeHooks) {
    this.state = state;
    this.hooks = hooks;
  }

  // ------------------------------------------------------------ queries

  stationDef(id: ForgeStationId) {
    return FORGE_STATIONS[id];
  }

  /** Recipes of one station, annotated with live availability for the UI. */
  catalog(station: ForgeStationId): Array<{
    id: string;
    out: string;
    station: ForgeStationId;
    gold: number;
    requiresEclipse?: boolean;
    note: string;
    canCraft: boolean;
    status: CraftResult;
    mats: Array<{ id: string; name: string; icon: string; have: number; need: number }>;
    outName: string;
    outIcon: string;
    outRarity: string;
    outDesc: string;
    level: number;
    levelOk: boolean;
  }> {
    return FORGE_RECIPES.filter((r) => r.station === station).map((r) => {
      const item = ITEMS[r.out];
      const mats = r.mats.map((m) => ({
        id: m.id,
        name: ITEMS[m.id]?.name ?? m.id,
        icon: ITEMS[m.id]?.icon ?? 'Package',
        have: this.state.countItem(m.id),
        need: m.count,
      }));
      let status: CraftResult = 'ok';
      if (r.requiresEclipse && this.eclipseT <= 0) status = 'gate';
      else if (mats.some((m) => m.have < m.need)) status = 'materials';
      else if (this.state.countItem('coin') < r.gold) status = 'gold';
      const level = item?.level ?? 0;
      return {
        id: r.id,
        out: r.out,
        station: r.station,
        gold: r.gold,
        requiresEclipse: r.requiresEclipse,
        note: r.note,
        canCraft: status === 'ok',
        status,
        mats,
        outName: item?.name ?? r.out,
        outIcon: item?.icon ?? 'Package',
        outRarity: item?.rarity ?? 'common',
        outDesc: item?.desc ?? '',
        level,
        levelOk: level === 0 || this.state.level >= level,
      };
    });
  }

  // ------------------------------------------------------------ actions

  /** Run a recipe. ALL validation happens here (UI is untrusted). */
  craft(recipeId: string, station: ForgeStationId): CraftResult {
    const r = FORGE_RECIPES.find((x) => x.id === recipeId);
    if (!r || r.station !== station) return 'gate';
    // re-validate atomically
    if (r.requiresEclipse && this.eclipseT <= 0) return 'gate';
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
    this.state.giveXp(30);
    this.hooks.sound('forge');
    this.hooks.notify('quest', `FORGED — ${item?.name ?? r.out}`,
      station === 'altar'
        ? 'The stones flare once, and the gift of the gods is yours. Equip it from the satchel (TAB).'
        : station === 'titans'
          ? 'The mountain rings like a bell. What you asked for now exists. Equip it from the satchel (TAB).'
          : 'Steam, salt and a clean edge. Equip it from the satchel (TAB).');
    return 'ok';
  }

  /** Present the Primal Sun Essence at the Altar → summon the eclipse. */
  summonEclipse(): boolean {
    if (!this.state.hasItem('esencia_solar')) return false;
    if (this.eclipseT > 0) return true; // already holding — refresh the notice
    this.eclipseT = ECLIPSE_DURATION;
    this.state.giveXp(40);
    this.hooks.sound('eclipse');
    this.hooks.cameraShake(0.5);
    this.hooks.notify(
      'quest',
      'THE ECLIPSE',
      'The sun closes like an eye. For four minutes, noon is a ring of fire — and the Altar of the Gods will string a bow.',
    );
    return true;
  }

  get eclipseActive(): boolean {
    return this.eclipseT > 0;
  }

  /** 0..1 fade for the eclipse sky (in/out ramps of 6 s). */
  get eclipseFactor(): number {
    if (this.eclipseT <= 0) return 0;
    const inRamp = Math.min(1, (ECLIPSE_DURATION - this.eclipseT) / 6);
    const outRamp = Math.min(1, this.eclipseT / 6);
    return Math.min(inRamp, outRamp);
  }

  get eclipseLeft(): number {
    return this.eclipseT;
  }

  update(dt: number): void {
    if (this.eclipseT <= 0) return;
    const wasIn = this.eclipseT > 8;
    this.eclipseT = Math.max(0, this.eclipseT - dt);
    if (wasIn && this.eclipseT <= 8 && this.eclipseT > 0) {
      this.hooks.notify('info', 'The eclipse wanes', 'The sun stretches back open. Minutes remain at the Altar.');
    }
    if (this.eclipseT === 0) {
      this.hooks.notify('info', 'The eclipse has passed', 'Noon again. The Altar of the Gods sleeps until the essence returns.');
    }
  }

  /** Debug/test + save-load hook: force the state. */
  setEclipse(seconds: number): void {
    this.eclipseT = Math.max(0, seconds);
  }
}
