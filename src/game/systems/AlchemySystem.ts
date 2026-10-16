import * as THREE from 'three';
import type { GameState } from './GameState';
import type { Player } from '../entities/Player';

/**
 * Fase 28 — THE ALCHEMIST'S ENGINE.
 *
 * One system owns every live potion effect:
 *  · use(potionId) — validated HERE (the UI is untrusted); instant parts
 *    applied immediately, timed parts registered with the band durations
 *  · update(dt) — ticks expirations, Oak-Skin regen, acid DoTs, and the
 *    per-combat limit window
 *  · mods — read each frame by Player / CombatSystem / the damage router
 *  · the acid flask's throw (aim point + 5 m cloud + shred + DoT)
 *  · the Tear of the Ancestral Forest's per-combat limit: one use against
 *    mini-bosses and monsters, two against bosses; the counter resets after
 *    10 s out of combat
 */
export interface AlchemyMods {
  /** All incoming damage × (Light Scales 0.9 / Fury 1.15). */
  defenseMult: number;
  /** Fire-elemental damage × (Thermal Isolation 0.75). */
  fireMult: number;
  /** Knockback impulse × (Oak-Skin 0.6). */
  stability: number;
  /** HP per second (Oak-Skin +2). */
  regenHpPS: number;
  /** Walk/run speed × (Celerity 1.2). */
  speedMult: number;
  /** Dodge stamina cost × (Celerity 0.85). */
  dodgeCostMult: number;
  /** Added to the critical damage multiplier (Fury +0.35). */
  critDamageAdd: number;
  /** Attack cadence × (Fury 1.15). */
  attackSpeedMult: number;
  /** Fraction of impact/fall/explosion damage absorbed (Inert Mass 0.5). */
  absorbImpact: number;
  /** Fraction of the absorbed amount returned as a shockwave (0.1). */
  reflectFraction: number;
  /** True while the Tear's 10 s alteration immunity holds. */
  statusImmune: boolean;
}

/** A combat target the alchemy engine can reach (wired in Game.ts). */
export interface AlchemyTarget {
  kind: 'bandit' | 'dragon';
  ref: unknown;
  isBoss: boolean;
  pos: THREE.Vector3;
  isAlive(): boolean;
  damage(amount: number): boolean; // returns died
}

export interface AlchemyHooks {
  notify(kind: 'info' | 'quest' | 'item', title: string, body?: string): void;
  sound(id: 'pickup' | 'forge'): void;
  /** Shockwave ring at a world position (Inert Mass reflect). */
  shockwave(pos: THREE.Vector3, scale?: number): void;
  /** Acid cloud VFX at a world position. */
  acidCloud(pos: THREE.Vector3): void;
  /** Enumerate combat targets near a point (throw + reflect + DoT wiring). */
  nearbyTargets(pos: THREE.Vector3, radius: number): AlchemyTarget[];
  /** The player's current attack damage snapshot (the acid DoT basis). */
  playerAttackDamage(): number;
  /** The player (heals, aim). */
  player(): Player | null;
}

const TEAR_COMBAT_RESET = 10;

interface TimedDef { d: number; name: string; icon: string; line: string }
const TIMED: Record<string, TimedDef> = {
  pocion_escamas: { d: 60, name: 'Light Scales', icon: 'ShieldCheck', line: 'Your skin dulls. Blunt things will have to try harder for a minute.' },
  elixir_termico: { d: 45, name: 'Thermal Isolation', icon: 'Thermometer', line: 'A film of calm heat settles over you. Dragonfire has to argue with it now.' },
  pocion_roble: { d: 30, name: 'Oak-Skin', icon: 'TreeDeciduous', line: 'Blows land like weather for the next half minute.' },
  tonico_celeridad: { d: 40, name: 'Wind-Celerity', icon: 'Footprints', line: 'The ground feels slightly further away than usual.' },
  elixir_furia: { d: 30, name: 'Abyss-Fury', icon: 'Swords', line: 'The trade is exactly what it tasted like: fury now, bruising later.' },
  elixir_masa: { d: 20, name: 'Inert Mass', icon: 'Weight', line: 'It does not slosh. Impacts are about to become other people\'s problem.' },
  lagrima_bosque: { d: 10, name: 'The Ancestral Tear', icon: 'Droplets', line: 'It is, somehow, raining inside you. Nothing can alter you for ten seconds.' },
};

interface ActiveEffect { potionId: string; until: number }

export class AlchemySystem {
  private state: GameState;
  private hooks: AlchemyHooks;
  /** Monotonic clock (seconds) — driven by update(). */
  private now = 0;
  private effects: ActiveEffect[] = [];
  /** Acid DoTs: the target entry travels with the dot. */
  private dots: Array<{ target: AlchemyTarget; dps: number; until: number; nextTick: number }> = [];
  /** Enemies currently shredded by an acid cloud (damage taken ×1.3). */
  private shredded = new Map<unknown, number>();
  /** Tear per-combat bookkeeping. */
  private tearUses = 0;
  private lastCombatAt = -Infinity;
  private inCombat = false;
  private lastBossNearby = false;
  private regenAccum = 0;

  constructor(state: GameState, hooks: AlchemyHooks) {
    this.state = state;
    this.hooks = hooks;
  }

  // ---------------------------------------------------------------- queries

  /** Live modifiers (fresh object every call — always consistent). */
  get mods(): AlchemyMods {
    const has = (id: string) => this.effects.some((e) => e.potionId === id);
    return {
      defenseMult: has('pocion_escamas') ? 0.9 : has('elixir_furia') ? 1.15 : 1,
      fireMult: has('elixir_termico') ? 0.75 : 1,
      stability: has('pocion_roble') ? 0.6 : 1,
      regenHpPS: has('pocion_roble') ? 2 : 0,
      speedMult: has('tonico_celeridad') ? 1.2 : 1,
      dodgeCostMult: has('tonico_celeridad') ? 0.85 : 1,
      critDamageAdd: has('elixir_furia') ? 0.35 : 0,
      attackSpeedMult: has('elixir_furia') ? 1.15 : 1,
      absorbImpact: has('elixir_masa') ? 0.5 : 0,
      reflectFraction: has('elixir_masa') ? 0.1 : 0,
      statusImmune: has('lagrima_bosque'),
    };
  }

  /** UI/HUD/verification: live effects with remaining seconds. */
  activeEffects(): Array<{ id: string; left: number; icon: string; name: string }> {
    return this.effects
      .map((e) => {
        const def = TIMED[e.potionId];
        return def ? { id: e.potionId, left: Math.max(0, e.until - this.now), icon: def.icon, name: def.name } : null;
      })
      .filter((x): x is { id: string; left: number; icon: string; name: string } => x !== null && x.left > 0)
      .sort((a, b) => b.left - a.left);
  }

  /** Is `ref` armor-shredded by an acid cloud right now? (damage ×1.3) */
  shredMult(ref: unknown): number {
    const until = this.shredded.get(ref);
    return until !== undefined && until > this.now ? 1.3 : 1;
  }

  // ---------------------------------------------------------------- actions

  /** Drink a potion. ALL validation lives here. */
  use(potionId: string): 'ok' | 'unknown' | 'empty' | 'combat-limit' {
    const p = this.hooks.player();
    if (!p) return 'unknown';
    const consume = (): boolean => this.state.removeItem(potionId, 1);
    switch (potionId) {
      case 'pocion_curacion_menor': {
        if (!consume()) return 'empty';
        p.health = Math.min(p.stats.maxHealth, p.health + Math.ceil(p.stats.maxHealth * 0.1));
        this.hooks.sound('pickup');
        this.hooks.notify('item', 'Lesser Healing Potion', 'A warm flush — a tenth of your health comes back.');
        return 'ok';
      }
      case 'pocion_escamas':
      case 'elixir_termico':
      case 'pocion_roble':
      case 'tonico_celeridad':
      case 'elixir_furia':
      case 'elixir_masa': {
        if (!consume()) return 'empty';
        this.registerTimed(potionId);
        return 'ok';
      }
      case 'lagrima_bosque': {
        if (this.inCombat && this.tearUses >= (this.lastBossNearby ? 2 : 1)) return 'combat-limit';
        if (!consume()) return 'empty';
        this.tearUses += 1;
        this.lastCombatAt = this.now;
        this.inCombat = true;
        p.health = p.stats.maxHealth;
        p.stamina = p.stats.maxStamina;
        this.registerTimed(potionId);
        return 'ok';
      }
      case 'brebaje_acido': {
        if (!consume()) return 'empty';
        this.throwAcid();
        return 'ok';
      }
      default:
        return 'unknown';
    }
  }

  private registerTimed(potionId: string): void {
    const def = TIMED[potionId];
    if (!def) return;
    // the same potion re-drunk restarts its clock (no stacking)
    this.effects = this.effects.filter((e) => e.potionId !== potionId);
    this.effects.push({ potionId, until: this.now + def.d });
    const p = this.hooks.player();
    if (p) p.model.flash?.();
    this.hooks.sound('pickup');
    this.hooks.notify('item', def.name, def.line);
  }

  /**
   * THROW the Corrosive Acid Brew: the cloud blooms 9 m ahead along the
   * player's facing; everything inside 5 m is shredded (damage taken ×1.3)
   * and takes 20% of the player's attack as damage per second for 6 s.
   */
  private throwAcid(): void {
    const p = this.hooks.player();
    if (!p) return;
    const pos = new THREE.Vector3(p.position.x + Math.sin(p.yaw) * 9, p.position.y + 0.5, p.position.z + Math.cos(p.yaw) * 9);
    this.hooks.acidCloud(pos);
    this.hooks.sound('forge');
    const dps = Math.max(2, Math.round(this.hooks.playerAttackDamage() * 0.2));
    for (const t of this.hooks.nearbyTargets(pos, 5)) {
      if (!t.isAlive()) continue;
      this.shredded.set(t.ref, this.now + 6);
      this.dots.push({ target: t, dps, until: this.now + 6, nextTick: this.now + 0.5 });
    }
    this.hooks.notify(
      'item',
      'Corrosive Acid Brew',
      'The flask does not survive the throw. Everything inside the cloud just lost a third of its armor.',
    );
  }

  /** Player absorbed impact/fall/explosion damage under Inert Mass: reflect 10%. */
  onImpactAbsorbed(absorbed: number, at: THREE.Vector3): void {
    if (this.mods.reflectFraction <= 0) return;
    const out = Math.max(1, Math.round(absorbed * this.mods.reflectFraction));
    this.hooks.shockwave(at, Math.min(2.2, 0.8 + out * 0.02));
    let hits = 0;
    for (const t of this.hooks.nearbyTargets(at, 6)) {
      if (!t.isAlive()) continue;
      if (t.damage(out)) hits++;
    }
    if (hits > 0) {
      this.hooks.notify('info', 'Inert Mass', 'The impact comes back out of you as a shockwave.');
    }
  }

  /** Combat contact (player dealt or took damage). Bosses allow 2 Tears. */
  noteCombat(isBossNearby: boolean): void {
    this.inCombat = true;
    this.lastCombatAt = this.now;
    this.lastBossNearby = this.lastBossNearby || isBossNearby;
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.now += dt;
    // expirations (same-potion refresh handled at registration)
    this.effects = this.effects.filter((e) => e.until > this.now);
    // Oak-Skin regen (integer HP accrual)
    this.regenAccum += dt * this.mods.regenHpPS;
    if (this.regenAccum >= 1) {
      const heal = Math.floor(this.regenAccum);
      const p = this.hooks.player();
      if (p && heal > 0) p.health = Math.min(p.stats.maxHealth, p.health + heal);
      this.regenAccum -= heal;
    }
    // acid DoT ticks (0.5 s cadence)
    for (const d of this.dots) {
      if (this.now >= d.nextTick && d.until > this.now) {
        d.nextTick = this.now + 0.5;
        if (d.target.isAlive()) d.target.damage(d.dps);
      }
    }
    this.dots = this.dots.filter((d) => d.until > this.now && d.target.isAlive());
    for (const [ref, until] of this.shredded) if (until <= this.now) this.shredded.delete(ref);
    // out-of-combat reset for the Tear
    if (this.inCombat && this.now - this.lastCombatAt > TEAR_COMBAT_RESET) {
      this.inCombat = false;
      this.tearUses = 0;
      this.lastBossNearby = false;
    }
  }

  /** Verification helper. */
  debugState(): { effects: number; dots: number; shredded: number; tearUses: number; inCombat: boolean } {
    return {
      effects: this.effects.length,
      dots: this.dots.length,
      shredded: this.shredded.size,
      tearUses: this.tearUses,
      inCombat: this.inCombat,
    };
  }
}
