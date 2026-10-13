import * as THREE from 'three';
import type { Player } from '../entities/Player';
import type { GameState } from './GameState';
import type { Input } from '../core/Input';
import type { Dragon } from '../entities/Dragon';
import type { VfxSystem } from './VfxSystem';
import { ITEMS } from '../data/items';

const ITEMS_NAME_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.values(ITEMS).map((it) => [it.id, it.name]),
);

/** Weapon stats — every weapon behaves differently (Fase 3). */
export interface WeaponDef {
  id: string;
  kind: 'sword' | 'axe' | 'spear' | 'bow';
  lightDmg: number;
  heavyDmg: number;
  reach: number;          // meters from the player's center
  arc: number;            // swing arc in radians
  lightDur: number;       // swing duration (s)
  heavyDur: number;
  recovery: number;       // post-swing gate (s)
  lightStamina: number;
  heavyStamina: number;
  /** Fase 18 — the full archery spec lives here. */
  ranged?: RangedDef;
  /** Fase 12 — elemental legendary swords (late-game boss loot). */
  element?: 'fire' | 'frost' | 'storm';
}

/** Fase 18 — BOW CLASSES (the user's archery spec).
 *
 *  SHORT / LIGHT  — very high cadence, minimal stamina, DODGE SHOT
 *                   (can draw & loose while rolling).
 *  LONG / RECURVE — balanced; cumulative damage bonus for consecutive
 *                   long-range hits.
 *  GREATBOW       — massive damage, breaks posture / knocks down; PLANTED
 *                   stance (cannot move while aiming) and heavy javelin
 *                   projectiles.
 */
export type BowClass = 'short' | 'long' | 'greatbow';

export interface RangedDef {
  /** Seconds from click to 100% draw (Archer's Eye speeds it +30%). */
  drawTime: number;
  /** Damage at FULL draw (100%). A tap deals dmg × tapFrac. */
  dmg: number;
  /** Tap (quick shot) damage fraction — the spec says 30%. */
  tapFrac: number;
  /** Projectile speed at full draw (m/s). Taps fly at 55% of this. */
  speed: number;
  bowClass: BowClass;
  /** Gravity while at full draw (near-linear flight). */
  gravityFull: number;
  /** Gravity on a tap (pronounced parabola). */
  gravityTap: number;
  /** Seconds at full draw before the overdraw drain accelerates. */
  overdrawGrace: number;
  /** Stamina/s burned while in overdraw (accelerates with time). */
  overdrawDrain: number;
  /** Greatbow: the stance plants — no movement while aiming. */
  planted?: boolean;
  /** Short bow: draw & loose even mid-roll (Dodge Shot). */
  dodgeShot?: boolean;
  /** Greatbow javelins are fat, slow, heavy things. */
  projKind?: 'arrow' | 'javelin';
  /** Legacy min-damage fraction (kept for save compatibility reads). */
  minDmgFrac?: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  // Fase 10 — the STARTING sword: honest steel, weaker than Eirik's heirloom
  // but always in hand from the first second. Bram's forge upgrades (sword
  // tiers) apply on top of ANY sword (see swordDamageMult()).
  espada_acero: {
    id: 'espada_acero', kind: 'sword',
    lightDmg: 15, heavyDmg: 26, reach: 2.45, arc: 1.75,
    lightDur: 0.5, heavyDur: 0.8, recovery: 0.35, lightStamina: 8, heavyStamina: 16,
  },
  espada_eirik: {
    id: 'espada_eirik', kind: 'sword',
    lightDmg: 20, heavyDmg: 34, reach: 2.5, arc: 1.75,
    lightDur: 0.5, heavyDur: 0.8, recovery: 0.35, lightStamina: 8, heavyStamina: 16,
  },
  espada_fuego: {
    id: 'espada_fuego', kind: 'sword', element: 'fire',
    lightDmg: 34, heavyDmg: 58, reach: 2.6, arc: 1.8,
    lightDur: 0.5, heavyDur: 0.8, recovery: 0.32, lightStamina: 8, heavyStamina: 16,
  },
  espada_escarcha: {
    id: 'espada_escarcha', kind: 'sword', element: 'frost',
    lightDmg: 30, heavyDmg: 52, reach: 2.55, arc: 1.78,
    lightDur: 0.48, heavyDur: 0.78, recovery: 0.3, lightStamina: 7, heavyStamina: 15,
  },
  espada_tormenta: {
    id: 'espada_tormenta', kind: 'sword', element: 'storm',
    lightDmg: 32, heavyDmg: 55, reach: 2.58, arc: 1.82,
    lightDur: 0.49, heavyDur: 0.8, recovery: 0.31, lightStamina: 8, heavyStamina: 16,
  },
  hacha_orden: {
    id: 'hacha_orden', kind: 'axe',
    lightDmg: 27, heavyDmg: 50, reach: 2.35, arc: 1.4,
    lightDur: 0.68, heavyDur: 1.05, recovery: 0.5, lightStamina: 12, heavyStamina: 22,
  },
  lanza_caza: {
    id: 'lanza_caza', kind: 'spear',
    lightDmg: 15, heavyDmg: 27, reach: 3.8, arc: 0.62,
    lightDur: 0.45, heavyDur: 0.66, recovery: 0.4, lightStamina: 7, heavyStamina: 13,
  },
  arco_corto: {
    id: 'arco_corto', kind: 'bow',
    lightDmg: 0, heavyDmg: 0, reach: 0, arc: 0,
    lightDur: 0.3, heavyDur: 0.3, recovery: 0.18, lightStamina: 0, heavyStamina: 0,
    ranged: {
      drawTime: 0.42, dmg: 22, tapFrac: 0.3, speed: 30, bowClass: 'short',
      gravityFull: 6.5, gravityTap: 15, overdrawGrace: 3.0, overdrawDrain: 5,
      dodgeShot: true, projKind: 'arrow',
    },
  },
  arco_naufragio: {
    id: 'arco_naufragio', kind: 'bow',
    lightDmg: 0, heavyDmg: 0, reach: 0, arc: 0,
    lightDur: 0.35, heavyDur: 0.35, recovery: 0.25, lightStamina: 0, heavyStamina: 0,
    ranged: {
      drawTime: 1.0, dmg: 34, tapFrac: 0.3, speed: 38, bowClass: 'long',
      gravityFull: 4.5, gravityTap: 16, overdrawGrace: 2.4, overdrawDrain: 7,
      projKind: 'arrow',
    },
  },
  gran_arco: {
    id: 'gran_arco', kind: 'bow',
    lightDmg: 0, heavyDmg: 0, reach: 0, arc: 0,
    lightDur: 0.55, heavyDur: 0.55, recovery: 0.5, lightStamina: 0, heavyStamina: 0,
    ranged: {
      drawTime: 1.85, dmg: 72, tapFrac: 0.3, speed: 34, bowClass: 'greatbow',
      gravityFull: 3.4, gravityTap: 13, overdrawGrace: 2.0, overdrawDrain: 11,
      planted: true, projKind: 'javelin',
    },
  },
  // ---- Fase 16 — LA HERRERÍA: espadas de comercio (Torvald + Borin) ----
  espada_plata: {
    id: 'espada_plata', kind: 'sword',
    lightDmg: 24, heavyDmg: 40, reach: 2.5, arc: 1.76,
    lightDur: 0.48, heavyDur: 0.78, recovery: 0.33, lightStamina: 8, heavyStamina: 15,
  },
  espada_almirante: {
    id: 'espada_almirante', kind: 'sword',
    lightDmg: 29, heavyDmg: 50, reach: 2.55, arc: 1.8,
    lightDur: 0.47, heavyDur: 0.76, recovery: 0.31, lightStamina: 8, heavyStamina: 16,
  },
  espada_plata_rota: {
    id: 'espada_plata_rota', kind: 'sword',
    lightDmg: 52, heavyDmg: 85, reach: 2.62, arc: 1.85,
    lightDur: 0.44, heavyDur: 0.72, recovery: 0.28, lightStamina: 7, heavyStamina: 14,
  },
  espada_almirante_rota: {
    id: 'espada_almirante_rota', kind: 'sword',
    lightDmg: 65, heavyDmg: 110, reach: 2.68, arc: 1.9,
    lightDur: 0.43, heavyDur: 0.7, recovery: 0.26, lightStamina: 7, heavyStamina: 14,
  },
};

/** Slot order for keys 1-4. Slot 1 is the sword the player actually owns
 * (Fase 10: the starting Espada de acero upgrades through Bram's forge and
 * heirlooms are found along the way — the HUD always shows the best one). */
export const SWORD_PRIORITY = [
  // Fase 16 — the smith's broken (OP) blades sit above the boss legendaries
  'espada_almirante_rota', 'espada_plata_rota',
  'espada_fuego', 'espada_escarcha', 'espada_tormenta',
  'espada_almirante',
  'espada_guardian', 'espada_eirik', 'espada_plata', 'espada_acero',
];
export const WEAPON_SLOTS = ['espada_acero', 'hacha_orden', 'lanza_caza', 'arco_naufragio'];
/** Fase 18 — the bow family, in cycle order (slot 4 presses walk this list). */
export const BOW_CYCLE = ['arco_corto', 'arco_naufragio', 'gran_arco'];

/** Fase 18 — arrow families. Basic arrows are INFINITE (standard ammo);
 *  the special ones are consumable items. */
export type AmmoKind = 'basic' | 'piercing' | 'fire' | 'shock' | 'poison';
export const AMMO_DEFS: Array<{ kind: AmmoKind; item: string | null; name: string; hint: string }> = [
  { kind: 'basic', item: null, name: 'Arrow', hint: 'Infinite. Balanced piercing damage.' },
  { kind: 'piercing', item: 'flecha_perforante', name: 'Piercing Arrow', hint: 'Ignores armour — ships, plate, drake scales.' },
  { kind: 'fire', item: 'flecha_fuego', name: 'Fire Arrow', hint: 'Burns over time; lights decks and powder.' },
  { kind: 'shock', item: 'flecha_electrica', name: 'Shock Arrow', hint: 'Chains between foes; stuns in water or rain.' },
  { kind: 'poison', item: 'flecha_veneno', name: 'Poison Arrow', hint: 'Blights healing and strength.' },
];

/** Fase 12 — element of an equipped weapon id (null = mundane steel). */
export function swordElementOf(id: string | null | undefined): 'fire' | 'frost' | 'storm' | null {
  if (id === 'espada_fuego') return 'fire';
  if (id === 'espada_escarcha') return 'frost';
  if (id === 'espada_tormenta') return 'storm';
  return null;
}

/** Display names for the forge tiers of any sword. */
export const SWORD_TIER_NAMES = ['', ' · Tempered', ' · Runic', ' · Legendary'];

/** Fase 10 — Bram's forge damage multiplier by tier (0 = base). */
export const SWORD_TIER_MULT = [1, 1.3, 1.7, 2.05];

export interface CombatHooks {
  sound(kind: Parameters<import('./AudioSystem').AudioSystem['playEvent']>[0]): void;
  notify(kind: 'info' | 'item', title: string, body?: string): void;
  /** Melee query against dragons. */
  dragonMelee(origin: THREE.Vector3, yaw: number, reach: number, arc: number):
    { dragon: Dragon; head: boolean; point: THREE.Vector3 } | null;
  damageDragon(dragon: Dragon, amount: number, heavy: boolean): void;
  /** Boarding crew query — returns true when someone was struck. */
  crewHit(origin: THREE.Vector3, yaw: number, dmg: number, reach: number, arc: number): boolean;
  /** Fase 12 — an elemental sword connected: burst FX at the impact point. */
  elementalHit?(pos: THREE.Vector3, element: 'fire' | 'frost' | 'storm'): void;
  /** Fase 10 — red knight bandits: melee query + damage sink. */
  banditMelee?(origin: THREE.Vector3, yaw: number, reach: number, arc: number):
    { bandit: unknown; point: THREE.Vector3 } | null;
  damageBandit?(bandit: unknown, amount: number, heavy: boolean): void;
  /** Fase 11 — multi-target sweep for spin finishers (up to `max` victims). */
  banditMeleeMulti?(origin: THREE.Vector3, yaw: number, reach: number, arc: number, max: number):
    Array<{ bandit: unknown; point: THREE.Vector3 }>;
  /** Fase 11 — radial AoE for the plunge landing (everything in the ring). */
  banditMeleeRadius?(center: THREE.Vector3, radius: number, max: number):
    Array<{ bandit: unknown; point: THREE.Vector3 }>;
  /** Fase 17 — nearest bandit for HOOK DASH targeting (alive, any state). */
  hookTarget?(origin: THREE.Vector3, yaw: number, maxDist: number):
    { bandit: unknown; point: THREE.Vector3 } | null;
  /** Fase 17 — AIR LAUNCH: fling a bandit skyward (the juggle begins). */
  launchBandit?(bandit: unknown, vy: number): void;
  /** Fase 17 — nearest AIRBORNE bandit near a point (air grab + bounce). */
  airborneBanditNear?(pos: THREE.Vector3, radius: number): unknown | null;
  /** Fase 17 — grab-spin-throw: hold the victim in the whirl (per frame). */
  holdBanditAt?(bandit: unknown, x: number, y: number, z: number, spinK: number): void;
  /** Fase 17 — hurl the grabbed bandit (AoE where he crashes). */
  throwBandit?(bandit: unknown, dirX: number, dirZ: number, power: number): void;
  /** Fase 17 — knock a bandit flat (ground slam / thrown impacts). */
  knockdownBandit?(bandit: unknown, dur: number): void;
  /** Fase 17 — vault: leave a bandit back-turned and exposed. */
  turnBanditBack?(bandit: unknown, dur: number): void;
  /** Fase 17 — rope-dart pull (the E grapple shot). */
  pullBandit?(bandit: unknown, dx: number, dz: number): void;
  /** Fase 17 — pop an airborne bandit back up (juggle hit / bounce feed). */
  juggleBandit?(bandit: unknown): void;
  /** Fase 17 — weakened bandit in finisher range (Valor execution). */
  finisherTarget?(playerPos: THREE.Vector3): unknown | null;
  /** Training dummy — returns XP granted when struck. */
  dummyHit(origin: THREE.Vector3, yaw: number): boolean;
  /** Camera aim ray for the bow. */
  aimRay(): { origin: THREE.Vector3; dir: THREE.Vector3 };
  /** Fase 11 — the swing cut only air: bandits snap to guard (near misses
   *  telegraph the next exchange — the fight reads both ways). */
  onWhiff?(pos: THREE.Vector3): void;
}

interface Arrow {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  life: number;
  dmg: number;
  stuck: boolean;
  /** Fase 18 — archery spec fields. */
  ammo: AmmoKind;
  /** Gravity acceleration (m/s²) — taps arc, full draws fly flat. */
  gravity: number;
  /** Launch point (for longbow streak range checks). */
  origin?: THREE.Vector3;
  /** Piercing shots pass through everything they kill. */
  pierce?: boolean;
  /** Already-hit targets (piercing shot — no double ticks). */
  hitSet?: Set<unknown>;
  /** Boss-part crit already applied. */
  headshot?: boolean;
}

interface ArrowPickup {
  mesh: THREE.Group;
  pos: THREE.Vector3;
}

/**
 * Player combat (Fase 3): light/heavy melee with per-weapon stats, blocking,
 * dodge rolls, the bow with real projectiles and recoverable arrows.
 * Works alongside the existing boarding-crew and training-dummy fights.
 *
 * Fase 9 — CINEMATIC COMBAT (PDF §4): 3-hit combo chains (light -> light ->
 * heavy finisher) with buffered inputs and chain windows, PARRY (perfect
 * block within 0.19 s) that staggers attackers and opens a x1.6 counter
 * window, hit knockback, and camera punches on decisive blows.
 *
 * Fase 11 — CHOREOGRAPHED COMBAT (the Spider-Man-grade spec):
 *  - chains up to 4 moves with route-aware finishers (heavy / uppercut / spin)
 *  - input buffering during the WHOLE swing (spam-safe), late-fires cleanly
 *  - DIRECTIONAL variety: strafing -> 360 spin (multi-target), backpedal ->
 *    uppercut launcher; forward keeps the classic diagonal
 *  - AIR COMBAT: floating air slashes (aircut) + a plunging AoE dive whose
 *    damage resolves on landing (Player.onPlungeImpact -> plungeLand)
 *  - dodge styles: forward somersault vs side/back quickstep; a hit absorbed
 *    by roll i-frames = PERFECT DODGE -> counter window (like the parry)
 *  - spin finishers hit up to 3 targets; the plunge hits everything in a ring
 *  - hit-stop (global slow-mo beat) on finishers, parries and counters
 */
export class CombatSystem {
  private player: Player;
  private state: GameState;
  private hooks: CombatHooks;
  private vfx: VfxSystem;
  /** Charge window: click & hold > threshold = heavy attack. */
  private chargeT = -1;
  private chargeConsumed = false;
  private swingHitDone = false;
  private arrows: Arrow[] = [];
  private pickups: ArrowPickup[] = [];
  private scene: THREE.Scene;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();

  // ---- Fase 18: the archery spec state ----
  /** Selected arrow family (X cycles; only owned specials are offered). */
  ammoKind: AmmoKind = 'basic';
  /** Seconds the string has been held at 100% (overdraw clock). */
  private overdrawT = 0;
  /** Fatigue stagger after a fumbled overdraw. */
  private fumbleT = 0;
  /** Recurve streak: consecutive long-range hits, +8% each (max +40%). */
  private streak = 0;
  /** Arrow Rain (G): scheduled barrage. */
  private arrowRain: { center: THREE.Vector3; t: number; spawned: number; ammo: AmmoKind; dmg: number } | null = null;
  private arrowRainCd = 0;
  /** Concentrated Piercing Shot (T). */
  private pierceShotCd = 0;
  /** True while the player draws a bow mid-air / mounted — Game slows time. */
  airAiming = false;
  /** Set by Game every frame: riding a horse (air-aim counts mounted). */
  mountedNow = false;
  /** HUD callback for ammo/ability state. */
  onBowHud?: (s: {
    ammo: AmmoKind; ammoName: string; counts: Record<AmmoKind, number>;
    overdraw: number; streak: number;
    rainCd: number; pierceCd: number;
  }) => void;

  // ---- Fase 9/11: combo chain state ----
  /** Position in the chain (0 = fresh ... 3 = route finisher). */
  private comboStep = 0;
  /** Seconds left to continue the chain before it resets. */
  private comboWindowT = 0;
  /** Attack clicked during the swing -> fires the moment it can (Fase 11:
   *  buffered during the WHOLE swing, not just the tail). */
  private bufferedNext = false;
  /** The buffered input is a HEAVY (changes the route). */
  private bufferedHeavy = false;
  /** Counter window after a parry: next melee x1.6 + camera punch. */
  private parryCounterT = 0;
  /** Fase 11 — counter window after a PERFECT DODGE (next melee x1.5). */
  private dodgeCounterT = 0;
  /** Damage multiplier queued by the current swing (combo/counter). */
  private pendingDmgMult = 1;
  /** True while the current swing is a chain FINISHER (bigger feedback). */
  private swingIsFinisher = false;
  /** True while the current swing is a MULTI-HIT sweep (spin/plunge). */
  private swingIsMulti = false;
  /** Route tag of the current chain (HUD + variation bookkeeping). */
  private comboRoute: 'std' | 'dodge' | 'air' = 'std';
  private comboLabel = '';

  // ---- Fase 17 — the Spider-Man-grade layer ----
  /** SEA FURY (Valor): 0..300 — segments of 100 (tonic + finishers). */
  private valor = 0;
  /** Fired whenever the bar moves (the Game mirrors it to the HUD store). */
  onValorChange?: (v: number) => void;
  /** Air lights spent in the current stint (3 max; air bounce refreshes). */
  private airJuggleUsed = 0;
  /** HOOK DASH: rope-pull toward the target + flying kick on arrival. */
  private hookDashT = 0;
  private hookDashTarget: unknown | null = null;
  private hookCd = 0;
  /** C within this window after a dash impact = VAULT over the shoulders. */
  private vaultWindowT = 0;
  private dashKickLinger = 0;
  /** GRAB-SPIN-THROW: the whirlwind with a grabbed bandit (F in the air). */
  private grabSpinT = 0;
  private grabVictim: unknown | null = null;
  /** E rope-dart: the flying hook + its retracting line. */
  private grappleCd = 0;
  /** Finisher lock: the cinematic owns the controls for its beat. */
  private finisherLockT = 0;

  /** Fase 9 — camera punch hook (Game wires this to the CameraRig FOV kick). */
  onCameraPunch?: (intensity: number) => void;
  /** Fase 11 — hit-stop hook: the Game slows the world for a beat. */
  onHitStop?: (duration: number) => void;
  /** Fase 11 — HUD flash channel (perfect dodge / counters). */
  onCombatEvent?: (label: string) => void;

  /** Fase 11 — transient fight label for the HUD (decays on its own). */
  get eventLabel(): string | null {
    return this.eventT > 0 ? this.eventText : null;
  }
  private eventText: string | null = null;
  private eventT = 0;

  /** Show a fight moment on the HUD for ~1.3 s (perfect dodge, riposte...). */
  flashEvent(label: string): void {
    this.eventText = label;
    this.eventT = 1.3;
  }

  /** Combo state for the HUD (null when no chain running). */
  get comboHud(): { step: number; window: number; counter: boolean; label?: string } | null {
    if (this.comboWindowT <= 0 || this.comboStep <= 0) return null;
    return {
      step: this.comboStep,
      window: this.comboWindowT,
      counter: this.parryCounterT > 0 || this.dodgeCounterT > 0,
      label: this.comboLabel,
    };
  }

  constructor(
    scene: THREE.Scene,
    player: Player,
    state: GameState,
    vfx: VfxSystem,
    hooks: CombatHooks,
  ) {
    this.scene = scene;
    this.player = player;
    this.state = state;
    this.vfx = vfx;
    this.hooks = hooks;
    // Fase 9 — parry feedback: clang + sparks + counter window. Chain any
    // callback the Game may have installed (crew stagger, HUD...).
    const prevOnParry = player.onParry;
    player.onParry = (fx: number, fz: number) => {
      prevOnParry?.(fx, fz);
      this.parryCounterT = 1.35;
      this.gainValor(25);
      this.hooks.sound('block');
      this.onCameraPunch?.(0.55);
      this.onHitStop?.(0.09);
      this.onCombatEvent?.('PERFECT PARRY!');
      this.flashEvent('PERFECT PARRY!');
      this.vfx.weaponImpact(new THREE.Vector3(fx, player.position.y + 1.25, fz));
    };
    // Fase 11/17 — perfect dodge: the blow slid past inside the roll i-frames
    //    → slow-motion beat + the AUTO-COUNTER (a knife flicked into the
    //    attacker's eyes: damage + a long blind stagger).
    const prevOnDodge = player.onPerfectDodge;
    player.onPerfectDodge = (fromX?: number, fromZ?: number) => {
      prevOnDodge?.(fromX, fromZ);
      this.dodgeCounterT = 1.1;
      this.gainValor(18);
      this.hooks.sound('swing');
      this.onCameraPunch?.(0.4);
      this.onHitStop?.(0.22); // a real slow-mo beat — the world crawls
      this.onCombatEvent?.('PERFECT DODGE!');
      this.flashEvent('PERFECT DODGE!');
      // the counter throw: find whoever threw the blow and blind him
      if (fromX !== undefined && fromZ !== undefined) {
        const near = this.hooks.hookTarget?.(
          new THREE.Vector3(fromX, 0, fromZ), 0, 4.5,
        ) ?? null;
        if (near && this.weapon) {
          this.hooks.damageBandit?.(near.bandit, this.weapon.lightDmg * 0.7, false);
          this.hooks.knockdownBandit?.(near.bandit, 0.75);
          this.vfx.weaponImpact(near.point);
          this.flashEvent('BLINDED! — strike now');
        }
      }
    };
    // Fase 11 — plunge landing: the AoE resolves here
    player.onPlungeImpact = () => this.plungeLand();
  }

  get equippedId(): string | null {
    return this.state.equippedWeapon;
  }

  get weapon(): WeaponDef | null {
    const id = this.state.equippedWeapon;
    return id ? WEAPONS[id] ?? null : null;
  }

  /** Weapon slot info for the HUD. */
  slots(): Array<{ slot: number; id: string; name: string; owned: boolean; equipped: boolean; kind: string }> {
    const slots = [...WEAPON_SLOTS];
    // Slot 1 = the best sword currently owned
    for (const id of SWORD_PRIORITY) {
      if (this.state.hasItem(id)) {
        slots[0] = id;
        break;
      }
    }
    return slots.map((id, i) => ({
      slot: i + 1,
      id,
      name: this.itemName(id),
      owned: this.state.hasItem(id),
      equipped: this.state.equippedWeapon === id,
      kind: WEAPONS[id].kind,
    }));
  }

  private itemName(id: string): string {
    // items.ts registry name (import avoided to prevent a cycle; lookup via ITEMS)
    const base = ITEMS_NAME_LOOKUP[id] ?? id;
    // forge tiers only show on swords
    if (WEAPONS[id]?.kind === 'sword' && this.state.swordTier > 0) {
      return base + (SWORD_TIER_NAMES[this.state.swordTier] ?? '');
    }
    return base;
  }

  /** Visual + state refresh after equip changes (called by the Game too). */
  refreshVisuals(): void {
    const id = this.state.equippedWeapon;
    const w = id ? WEAPONS[id] : null;
    this.player.setWeaponVisual(w ? w.kind : 'none');
    this.player.setShieldVisual(this.state.hasItem('escudo_marea'));
    this.player.hasShieldEquipped = this.state.hasItem('escudo_marea');
  }

  // ---------------------------------------------------------------- update

  /** Runs in foot mode BEFORE Player.update so animations stay in sync.
   *  Fase 17 `eReserved`: an interaction prompt owns E this frame — the
   *  rope-dart stands down so one key never does two things. */
  update(dt: number, input: Input, dialogueActive: boolean, dead: boolean, eReserved = false): void {
    const p = this.player;
    const weapon = this.weapon;

    // --- Weapon switching (1-3 melee; 4 CYCLES the bow family, Fase 18) ---
    for (let i = 0; i < WEAPON_SLOTS.length; i++) {
      if (input.anyPressed(`Digit${i + 1}`)) {
        if (i === 3) {
          // slot 4: walk BOW_CYCLE through every bow the player owns
          const owned = BOW_CYCLE.filter((id) => this.state.hasItem(id));
          if (owned.length > 0) {
            const cur = owned.indexOf(this.state.equippedWeapon ?? owned[0]);
            const next = owned[(cur + 1) % owned.length];
            this.switchTo(next);
          } else {
            this.hooks.notify('info', 'No bow carried', 'The smiths of Crowhaven sell short bows; the Mist Isles hide a good recurve.');
          }
        } else {
          const slotId = i === 0 ? this.currentSwordId() : WEAPON_SLOTS[i];
          if (slotId) this.switchTo(slotId);
        }
      }
    }

    if (dead || dialogueActive) {
      p.blocking = false;
      if (p.bowDraw >= 0) p.bowDraw = -1;
      this.chargeT = -1;
      this.cancelDash(false);
      this.cancelGrab();
      this.finisherLockT = 0;
      return;
    }

    // --- Fase 17 per-frame housekeeping (runs for EVERY weapon) ---
    if (this.hookCd > 0) this.hookCd -= dt;
    if (this.grappleCd > 0) this.grappleCd -= dt;
    if (this.vaultWindowT > 0) this.vaultWindowT -= dt;
    if (this.dashKickLinger > 0) {
      this.dashKickLinger -= dt;
      if (this.dashKickLinger <= 0) p.dashKick = false;
    }
    if (this.finisherLockT > 0) this.finisherLockT -= dt;

    // --- SEA TONIC (R): burn a Valor segment, drink deep, rise mended.
    //     (Works with any weapon — even mid-draw.)
    if (input.pressed('tonic') && this.valor >= 100
        && p.health < p.stats.maxHealth * 0.98 && this.finisherLockT <= 0) {
      this.valor -= 100;
      this.onValorChange?.(this.valor);
      const heal = Math.round(p.stats.maxHealth * 0.45);
      p.health = Math.min(p.stats.maxHealth, p.health + heal);
      this.vfx.elementalBurst(
        new THREE.Vector3(p.position.x, p.position.y + 1.2, p.position.z), 'frost',
      );
      this.hooks.sound('pickup');
      this.flashEvent('SEA TONIC');
      this.hooks.notify('item', 'Sea Tonic', `The fury of the sea knits your wounds (+${heal} health).`);
    }

    // --- Blocking (Q parry stance; RMB still works) ---
    const canBlock = !!weapon && weapon.kind !== 'bow' && p.stamina > 1 && p.attackT === 0 && !p.rolling;
    p.blocking = canBlock && (input.isDown('parry') || input.rightDown) && !p.dashing;

    // --- Dodge (C): direction chooses the style —
    //     forward = somersault roll, side/back = quickstep dash.
    //     A dodge right after a dodge-feint or mid-chain keeps the chain.
    if (input.anyPressed('KeyC') && p.grounded && !p.rolling && p.stamina >= 20 && !p.swimming && p.attackT === 0) {
      let ix = 0;
      let iz = 0;
      if (input.isDown('forward')) iz += 1;
      if (input.isDown('back')) iz -= 1;
      if (input.isDown('left')) ix -= 1;
      if (input.isDown('right')) ix += 1;
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      let dx = 0;
      let dz = 0;
      if (ix !== 0 || iz !== 0) {
        const len = Math.hypot(ix, iz);
        ix /= len; iz /= len;
        dx = fx * iz - fz * ix;
        dz = fz * iz + fx * ix;
      } else {
        dx = -Math.sin(p.yaw); dz = -Math.cos(p.yaw); // backward by default
      }
      // forward roll vs quickstep: is the dash within 50° of the facing?
      const fwdDot = Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz;
      const style: 'roll' | 'step' = fwdDot > 0.45 ? 'roll' : 'step';
      p.beginRoll(dx, dz, style);
      p.stamina -= 20;
      this.hooks.sound('swing');
      this.vfx.landingDust(new THREE.Vector3(p.position.x, p.position.y + 0.05, p.position.z), 5, 0.5);
      // a dodge inside an open chain reroutes it — the next hit whips around
      if (this.comboWindowT > 0 && this.comboStep > 0) {
        this.comboRoute = 'dodge';
        this.comboWindowT = Math.max(this.comboWindowT, 0.9);
      }
    }

    if (!weapon) {
      p.bowDraw = -1;
      this.updateArrows(dt);
      return;
    }

    // --- Bow ---
    if (weapon.kind === 'bow') {
      // Fase 18 — PRECISION AIM (RMB): the view tightens, the stride slows
      // 40% (Player reads these every frame). RMB is free while a bow is
      // out because blocking requires a melee weapon.
      p.bowAiming = input.rightDown && !p.rolling && !p.swimming;
      p.bowDrawMult = weapon.ranged!.bowClass === 'short' ? 0.8
        : weapon.ranged!.bowClass === 'greatbow' ? 0.5 : 0.6;
      // Fase 18 — ammo cycling (X): only families the player carries.
      if (input.pressed('ammo')) this.cycleAmmo();
      // Ability cooldowns + the Arrow Rain barrage scheduler run every frame.
      if (this.arrowRainCd > 0) this.arrowRainCd -= dt;
      if (this.pierceShotCd > 0) this.pierceShotCd -= dt;
      if (this.fumbleT > 0) this.fumbleT -= dt;
      this.tickArrowRain(dt);
      // AIR AIM (slow-mo while drawing mid-air or from the saddle).
      this.airAiming = p.bowDraw >= 0
        && (!p.grounded || this.mountedNow)
        && p.stamina > 1
        && !p.swimming;
      if (this.airAiming) {
        // the held breath burns: time slows, stamina pours
        p.stamina = Math.max(0, p.stamina - dt * 11);
      }
      this.updateBow(dt, input, weapon);
      // Abilities (bow only): G = Arrow Rain, T = Piercing Shot
      if (input.pressed('special1')) this.tryArrowRain(weapon);
      if (input.pressed('special2')) this.tryPierceShot(weapon);
      this.updateArrows(dt);
      this.pushBowHud(weapon);
      return;
    }

    // =================== MELEE — the choreography core ===================
    // Route intent is sampled every frame so a heavy's variant reads exactly
    // what the player was doing at the moment of release (not a stale value).
    this.lastIntent = this.moveIntent(input);

    // Chain timers
    if (this.comboWindowT > 0) {
      this.comboWindowT -= dt;
      if (this.comboWindowT <= 0) {
        this.comboStep = 0;
        this.bufferedNext = false;
        this.comboRoute = 'std';
      }
    }
    if (this.parryCounterT > 0) this.parryCounterT -= dt;
    if (this.dodgeCounterT > 0) this.dodgeCounterT -= dt;
    if (this.eventT > 0) {
      this.eventT -= dt;
      if (this.eventT <= 0) this.eventText = null;
    }

    const canAct = p.attackT === 0 && !p.rolling && !p.swimming;
    const canActGround = canAct && p.grounded && p.attackRecovery <= 0;
    // Fase 11 — air act: only during the useful part of an arc (short hops)
    const canActAir = canAct && !p.grounded && p.airTime < 0.42 && !p.plunging;

    // --- Plunge hold: the dive pose holds until the ground (no time gate)
    if (p.attackT > 0 && p.attackKind === 'plunge') {
      if (p.plunging) {
        p.attackT = Math.min(p.attackT, 0.34); // hold the read
        this.swingHitDone = true;             // impact fires on landing
        return;
      }
      // landed (plungeLand cleared it or safety): fall through to normal
    }

    // --- Input buffering (Fase 11: the whole swing counts) ---
    if (input.leftPressed && p.attackT > 0.10) {
      this.bufferedNext = true;
      this.bufferedHeavy = false;
    }
    if (p.attackRecovery > 0 && input.leftPressed && this.comboWindowT > 0 && this.comboStep < 4) {
      this.bufferedNext = true; // recovery clicks keep the chain alive
      this.bufferedHeavy = false;
    }
    const chainReady = this.bufferedNext && this.comboWindowT > 0 && this.comboStep < 4;

    // =================== Fase 17 — the Spider-Man layer ===================
    // HOOK DASH (F): rope-pull to the nearest bandit + flying kick. In the
    // air, F over an AIRBORNE bandit grabs him for the spin-throw instead.
    if (input.pressed('hookdash') && this.hookCd <= 0 && !p.dashing && this.grabSpinT <= 0
        && p.stamina >= 12 && !p.swimming && !p.plunging && this.finisherLockT <= 0) {
      const victim = !p.grounded
        ? (this.hooks.airborneBanditNear?.(p.position, 2.7) ?? null)
        : null;
      if (victim) {
        this.beginGrabSpin(victim);
      } else {
        const target = this.hooks.hookTarget?.(p.position, p.yaw, 19) ?? null;
        if (target) this.beginHookDash(target);
      }
    }
    if (p.dashing) this.updateHookDash(dt);
    if (this.grabSpinT > 0) this.updateGrabSpin(dt);

    // VAULT: C right after a dash impact leaps over the shoulders and
    // leaves the bandit back-turned.
    if (this.vaultWindowT > 0 && input.anyPressed('KeyC') && this.hookDashTarget) {
      this.doVault(this.hookDashTarget);
    }

    // E ROPE-DART (grapple shot): pulls light bandits off their feet. E
    // still interacts first whenever a prompt is up (eReserved).
    if (input.pressed('interact') && !eReserved && this.grappleCd <= 0
        && weapon && !p.dashing && this.grabSpinT <= 0
        && p.attackT === 0 && !p.rolling && p.stamina >= 8 && this.finisherLockT <= 0) {
      this.fireGrappleShot(weapon);
    }
    this.updateGrapple(dt);

    // FINISHER (V, or Shift+Space on a valid target): a cinematic execution
    // paid for with a full Valor segment.
    if ((input.pressed('finisher')
        || (input.pressed('jump') && input.isDown('sprint')))
        && this.valor >= 100 && this.finisherLockT <= 0 && !p.dashing && this.grabSpinT <= 0) {
      const fin = this.hooks.finisherTarget?.(p.position) ?? null;
      if (fin) {
        if (input.pressed('jump')) p.suppressJump = true; // Shift+Space is OURS
        this.doFinisher(fin);
      }
    }
    // =========================================================================

    // --- Ground charge & release: HOLD LMB = AIR LAUNCH (the rising slash
    //     that carries the player AND the bandit into the sky) ---
    if (input.leftPressed && canActGround && !chainReady) {
      this.chargeT = 0;
      this.chargeConsumed = false;
    }
    if (this.chargeT >= 0 && input.leftDown && !this.chargeConsumed && p.grounded) {
      this.chargeT += dt;
      if (this.chargeT >= 0.26) {
        this.chargeConsumed = true;
        this.chargeT = -1;
        this.fireAirLaunch(weapon);
      }
    }
    if (this.chargeT >= 0 && !input.leftDown && !this.chargeConsumed) {
      // Quick click -> light attack (chain step if the window is open)
      this.chargeT = -1;
      if (canActGround) this.fireLight(weapon);
    }
    if (!input.leftDown) this.chargeT = -1;

    // --- Air inputs (Fase 11/17) ---
    if (canActAir && input.leftPressed && this.airJuggleUsed < 3) {
      this.fireAircut(weapon);
    }
    if (!p.grounded && !p.plunging && p.attackT === 0 && !p.swimming && p.airTime < 1.3 && !p.dashing) {
      // GROUND SLAM: Space + LMB in the air (or simply hold LMB) commits
      // the plunge — the shockwave resolves on landing.
      if ((input.leftPressed && input.isDown('jump')) || input.leftDown) this.airChargeT += dt;
      else this.airChargeT = 0;
      if (this.airChargeT >= 0.2) {
        this.airChargeT = 0;
        this.firePlunge(weapon);
      }
      // C in the air: bounce off an airborne bandit's head (refreshes the
      // air juggle) — otherwise a quickstep dash.
      if (input.anyPressed('KeyC') && p.stamina >= 10 && !p.rolling) {
        const victim = this.hooks.airborneBanditNear?.(p.position, 2.6) ?? null;
        if (victim && this.hooks.juggleBandit) {
          // AIR BOUNCE: launch off him like a trampoline
          this.hooks.juggleBandit(victim);
          this.hooks.launchBandit?.(victim, -1.5); // shove him down a touch
          p.verticalVel = 8.8;
          p.jumpsUsed = Math.min(p.jumpsUsed, 1);
          p.stamina = Math.max(0, p.stamina - 6);
          this.airJuggleUsed = 0; // the dance continues
          this.hooks.sound('swing');
          this.onCameraPunch?.(0.35);
          this.flashEvent('AIR BOUNCE!');
          this.gainValor(8);
        } else {
          p.beginRoll(0, 0, 'step');
          p.stamina -= 10;
          this.hooks.sound('swing');
        }
      }
    } else {
      this.airChargeT = 0;
    }
    // back on the ground: the juggle counter resets with the stance
    if (p.grounded && p.attackT === 0) this.airJuggleUsed = 0;

    // --- Chain execution: the buffered click fires the next step the moment
    // the previous swing clears (late recovery counts — chains feel fluid)
    if (chainReady && canAct && (p.grounded ? p.attackRecovery <= 0.3 : p.airTime < 0.42)) {
      this.bufferedNext = false;
      const step = this.comboStep + 1;
      this.bufferedHeavy = false;
      this.startSwing(weapon, step >= 4, step);
    }

    // --- Swing progression ---
    if (p.attackT > 0) {
      const wasAir = !p.grounded;
      p.attackT += dt / p.attackDur;
      const impactAt = p.attackKind === 'heavy' ? 0.55
        : p.attackKind === 'spin' ? 0.5
        : p.attackKind === 'uppercut' ? 0.62
        : p.attackKind === 'sweep' ? 0.48
        : p.attackKind === 'hookkick' ? 0.5
        : 0.45;
      if (!this.swingHitDone && p.attackT >= impactAt) {
        this.swingHitDone = true;
        this.resolveMeleeHit(weapon, p.attackKind === 'heavy' || p.attackKind === 'spin' || p.attackKind === 'uppercut');
      }
      if (p.attackT >= 1) {
        p.attackT = 0;
        if (wasAir && !p.grounded) {
          // the swing ended mid-air: recovery waits for the landing
          p.attackRecovery = weapon.recovery * 0.5;
        } else {
          // Chained swings recover faster — the rhythm keeps rolling
          p.attackRecovery = weapon.recovery * (this.comboStep > 0 && this.comboWindowT > 0 ? 0.5 : 1);
        }
      }
    }
  }

  /** Best owned sword — slot 1 target (Fase 10). */
  currentSwordId(): string | null {
    for (const id of SWORD_PRIORITY) {
      if (this.state.hasItem(id)) return id;
    }
    return null;
  }

  private camYaw = 0;
  setCameraYaw(yaw: number): void {
    this.camYaw = yaw;
  }

  // ---------------------------------------------------------------- helpers

  /** Player's current movement intent, camera-relative (for routes). */
  private moveIntent(input: Input): { fwd: number; side: number } {
    let iz = 0;
    let ix = 0;
    if (input.isDown('forward')) iz += 1;
    if (input.isDown('back')) iz -= 1;
    if (input.isDown('left')) ix -= 1;
    if (input.isDown('right')) ix += 1;
    const len = Math.hypot(ix, iz);
    if (len === 0) return { fwd: 0, side: 0 };
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const rx = -Math.cos(this.camYaw);
    const rz = Math.sin(this.camYaw);
    // world dir
    const wx = fx * iz + rx * ix;
    const wz = fz * iz + rz * ix;
    const p = this.player;
    // relative to the player's facing: fwd = along yaw, side = perpendicular
    const fwd = Math.sin(p.yaw) * wx + Math.cos(p.yaw) * wz;
    const side = Math.sin(p.yaw) * wz - Math.cos(p.yaw) * wx;
    return { fwd: fwd / len, side: side / len };
  }

  /** A quick click on the ground: light attack or chain step.
   *  Fase 17 — the chain is FOUR lights: 1 thrust · 2 diagonal · 3 sweep
   *  kick · 4 whirlwind slam (the repelling finisher). */
  private fireLight(weapon: WeaponDef): void {
    const step = this.comboWindowT > 0 ? this.comboStep + 1 : 1;
    this.startSwing(weapon, false, Math.min(step, 4));
  }

  private moveIntentInput(): { fwd: number; side: number } {
    // cached input at click time via the last moveIntent — kept separate so
    // charge-release reads exactly what the player was doing on release
    return this.lastIntent;
  }
  private lastIntent: { fwd: number; side: number } = { fwd: 0, side: 0 };
  /** Air heavy charge clock (hold-to-plunge). */
  private airChargeT = 0;

  /** Fase 17 — SEA FURY plumbing. */
  get valorValue(): number {
    return this.valor;
  }
  private gainValor(n: number): void {
    const before = this.valor;
    this.valor = Math.min(300, this.valor + n);
    if (this.valor !== before) this.onValorChange?.(this.valor);
  }

  /** Fase 17 — AIR LAUNCH (hold LMB on the ground): a rising slash that
   *  carries the player AND the struck bandit into the sky. */
  private fireAirLaunch(weapon: WeaponDef | null): void {
    const p = this.player;
    if (!weapon) return;
    const cost = Math.min(weapon.lightStamina + 4, 18);
    if (p.stamina < cost || p.attackT > 0 || p.rolling) return;
    p.stamina -= cost;
    p.attackKind = 'uppercut';
    p.attackDur = weapon.heavyDur * 0.82;
    p.attackT = 0.001;
    this.swingHitDone = false;
    this.comboStep = 0;
    this.comboWindowT = 1.15;
    this.comboRoute = 'air';
    this.pendingDmgMult = 1.0;
    this.swingIsFinisher = false;
    this.swingIsMulti = false;
    this.launchPending = true; // resolveMeleeHit flings the bandit skyward
    this.comboLabel = 'LAUNCH!';
    this.onCameraPunch?.(0.4);
    this.hooks.sound('swing');
    p.onAttackSwing?.();
  }
  /** True while the current swing should LAUNCH struck bandits (air launch). */
  private launchPending = false;

  // ------------------------------------------------- Fase 17 hook dash

  private beginHookDash(target: { bandit: unknown; point: THREE.Vector3 }): void {
    const p = this.player;
    p.stamina -= 12;
    p.dashing = true;
    p.dashKick = true;
    p.attackT = 0;
    p.bowDraw = -1;
    p.blocking = false;
    this.hookDashT = 0.55;
    this.hookDashTarget = target.bandit;
    this.hooks.sound('swing');
    this.vfx.landingDust(new THREE.Vector3(p.position.x, p.position.y + 0.05, p.position.z), 4, 0.4);
  }

  private updateHookDash(dt: number): void {
    const p = this.player;
    this.hookDashT -= dt;
    const tp = this.banditPos(this.hookDashTarget);
    if (!tp || this.hookDashT <= 0) {
      // Fase 17 FIX — grace on timeout: with the clamped closing speed the
      // final approach lands inside impact range at the END of the last
      // frame; the kick must still connect (checked BEFORE the return).
      let close = false;
      if (tp) {
        const ddx = tp.x - p.position.x;
        const ddy = tp.y + 1.0 - (p.position.y + 0.9);
        const ddz = tp.z - p.position.z;
        close = Math.hypot(ddx, ddy, ddz) < 2.2;
      }
      this.endHookDash(close);
      return;
    }
    // steer toward the (live) target — the rope never misses twice
    const dx = tp.x - p.position.x;
    const dy = tp.y + 1.0 - (p.position.y + 0.9);
    const dz = tp.z - p.position.z;
    const dist = Math.hypot(dx, dy, dz);
    // Fase 17 FIX — clamp the closing speed to the remaining gap: at low
    // frame rates (dt 0.3-0.5s) an unclamped 23 m/s overshoots the victim
    // between two frames and the dash times out without ever connecting.
    const spd = Math.min(23, Math.max(0, dist - 1.55) / Math.max(dt, 1e-4));
    p.velocity.x = (dx / dist) * spd;
    p.velocity.z = (dz / dist) * spd;
    p.yaw = Math.atan2(dx, dz);
    this.updateRope(tp.x, tp.y + 1.15, tp.z);
    if (dist < 1.8) this.endHookDash(true);
  }

  private endHookDash(impacted: boolean): void {
    const p = this.player;
    p.dashing = false;
    this.hookDashT = 0;
    this.hideRope();
    this.dashKickLinger = 0.3;
    this.hookCd = 1.15;
    if (!impacted) return;
    const weapon = this.weapon;
    const tp = this.banditPos(this.hookDashTarget);
    if (weapon && tp) {
      // the flying kick connects
      const dmg = weapon.lightDmg * 1.35;
      this.hooks.damageBandit?.(this.hookDashTarget, dmg, true);
      this.vfx.weaponImpact(new THREE.Vector3(tp.x, tp.y + 1.15, tp.z));
      this.hooks.sound('hit_scale');
      this.onCameraPunch?.(0.5);
      this.onHitStop?.(0.06);
      this.gainValor(10);
      this.flashEvent('HOOK KICK!');
      this.vaultWindowT = 0.34; // C now vaults over the shoulders
    }
  }

  private cancelDash(impacted: boolean): void {
    if (!this.player.dashing) return;
    this.endHookDash(impacted);
  }

  /** C during the vault window: leap over the shoulders, leave the bandit
   *  back-turned and ripe for punishment. */
  private doVault(bandit: unknown): void {
    const p = this.player;
    const tp = this.banditPos(bandit);
    if (!tp) return;
    this.vaultWindowT = 0;
    // land 1.9 m behind the bandit (from the player's approach direction)
    const bx = tp.x - p.position.x;
    const bz = tp.z - p.position.z;
    const bl = Math.hypot(bx, bz) || 1;
    const nx = tp.x + (bx / bl) * 1.9;
    const nz = tp.z + (bz / bl) * 1.9;
    p.teleport(nx, tp.y + 1.35, nz);
    p.verticalVel = 2.4;
    p.velocity.set(-(bx / bl) * 3.4, 0, -(bz / bl) * 3.4);
    this.hooks.turnBanditBack?.(bandit, 2.2);
    this.hooks.sound('swing');
    this.onCameraPunch?.(0.45);
    this.gainValor(12);
    this.flashEvent('VAULT! — strike his back');
  }

  // ------------------------------------------------- Fase 17 grab-spin-throw

  private beginGrabSpin(victim: unknown): void {
    const p = this.player;
    p.stamina -= 12;
    p.attackT = 0;
    p.dashing = false;
    p.velocity.multiplyScalar(0.2);
    p.verticalVel = 1.4; // float for the whirl
    this.grabSpinT = 0.78;
    this.grabVictim = victim;
    this.hookCd = 1.0;
    this.hooks.sound('swing');
    this.flashEvent('GOTCHA!');
  }

  private updateGrabSpin(dt: number): void {
    const p = this.player;
    this.grabSpinT -= dt;
    // float in place while the rope whirls the bandit around
    p.verticalVel = 1.2;
    p.velocity.x *= 0.82;
    p.velocity.z *= 0.82;
    const k = 1 - this.grabSpinT / 0.78;
    // the hero spins WITH the rope (the whirlwind pose drives the read)
    p.attackKind = 'spin';
    p.attackDur = 0.78;
    p.attackT = Math.min(0.99, k);
    const ang = k * Math.PI * 4; // two full whirls
    const r = 1.7;
    const cx = p.position.x + Math.sin(p.yaw + ang) * r;
    const cz = p.position.z + Math.cos(p.yaw + ang) * r;
    const cy = p.position.y + 1.1 + Math.sin(k * Math.PI) * 0.5;
    this.hooks.holdBanditAt?.(this.grabVictim, cx, cy, cz, k);
    this.updateRope(cx, cy, cz);
    if (this.grabSpinT <= 0) {
      // THROW: toward the nearest OTHER bandit if any, else straight ahead
      const dir = this.hooks.hookTarget?.(p.position, p.yaw, 24);
      let dx: number;
      let dz: number;
      const tp = dir ? this.banditPos(dir.bandit) : null;
      const vp = this.banditPos(this.grabVictim);
      if (tp && vp && tp !== vp) {
        dx = tp.x - p.position.x;
        dz = tp.z - p.position.z;
      } else {
        dx = Math.sin(p.yaw);
        dz = Math.cos(p.yaw);
      }
      const len = Math.hypot(dx, dz) || 1;
      this.hooks.throwBandit?.(this.grabVictim, dx / len, dz / len, 15);
      this.hooks.sound('hit_scale');
      this.onCameraPunch?.(0.85);
      this.onHitStop?.(0.12);
      this.gainValor(15);
      this.flashEvent('WRECKING BALL!');
      this.hideRope();
      this.grabVictim = null;
      p.attackT = 0;
      p.attackRecovery = 0.3;
    }
  }

  private cancelGrab(): void {
    if (this.grabSpinT > 0) {
      // interrupted (hit / dialogue): drop the man gently
      this.grabSpinT = 0;
      this.hideRope();
      this.grabVictim = null;
    }
  }

  // ------------------------------------------------- Fase 17 E rope-dart

  private fireGrappleShot(weapon: WeaponDef): void {
    const p = this.player;
    p.stamina -= 8;
    this.grappleCd = 0.9;
    const { origin, dir } = this.hooks.aimRay();
    const aimPoint = this.tmp.copy(origin).addScaledVector(dir, 26);
    const hand = this.tmp2.set(p.position.x, p.position.y + 1.3, p.position.z);
    const flightDir = new THREE.Vector3().copy(aimPoint).sub(hand).normalize();
    // the dart: a small steel head
    const dart = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.22, 6),
      new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.35, metalness: 0.85 }),
    );
    dart.position.copy(hand).addScaledVector(flightDir, 0.5);
    dart.lookAt(dart.position.clone().add(flightDir));
    dart.rotateX(Math.PI / 2);
    this.scene.add(dart);
    this.grapple = {
      mesh: dart,
      vel: flightDir.clone().multiplyScalar(42),
      life: 0.72,
      dmg: weapon.lightDmg * 0.85,
      state: 'fly',
    };
    // quick backhand flick as the throw
    p.attackKind = 'light2';
    p.attackDur = 0.3;
    p.attackT = 0.001;
    this.swingHitDone = true;
    this.hooks.sound('bow_release');
  }

  private grapple: {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    life: number;
    dmg: number;
    state: 'fly' | 'stuck';
  } | null = null;

  private updateGrapple(dt: number): void {
    const g = this.grapple;
    if (!g) return;
    const p = this.player;
    g.life -= dt;
    if (g.state === 'fly') {
      // substep the flight so low frame rates can't tunnel the dart past a
      // bandit (42 m/s at 5 fps = 8 m per frame — way past a torso)
      const steps = Math.max(1, Math.ceil(dt / 0.03));
      const sdt = dt / steps;
      for (let s = 0; s < steps && g.state === 'fly'; s++) {
        g.vel.y -= 6 * sdt;
        g.mesh.position.addScaledVector(g.vel, sdt);
        // bandit hit: yank him off his feet toward the player
        const bandit = this.banditHitRef?.(g.mesh.position, 0.45) ?? null;
        if (bandit) {
          this.damageBanditRef?.(bandit, g.dmg);
          this.vfx.weaponImpact(g.mesh.position.clone());
          this.hooks.sound('arrow_hit');
          this.hooks.pullBandit?.(
            bandit,
            p.position.x - g.mesh.position.x,
            p.position.z - g.mesh.position.z,
          );
          this.gainValor(6);
          this.flashEvent('HOOKED!');
          this.retireGrapple();
          return;
        }
        const ground = this.terrainHeight(g.mesh.position.x, g.mesh.position.z);
        if (g.mesh.position.y <= ground + 0.05 || g.life <= 0) {
          this.vfx.arrowDust(g.mesh.position.clone());
          this.retireGrapple();
          return;
        }
      }
      g.mesh.lookAt(g.mesh.position.clone().add(g.vel));
      g.mesh.rotateX(Math.PI / 2);
      this.updateRope(g.mesh.position.x, g.mesh.position.y, g.mesh.position.z);
    } else if (g.life <= 0) {
      this.retireGrapple();
    }
  }

  private retireGrapple(): void {
    if (!this.grapple) return;
    this.scene.remove(this.grapple.mesh);
    this.grapple.mesh.geometry.dispose();
    (this.grapple.mesh.material as THREE.Material).dispose();
    this.grapple = null;
    this.hideRope();
  }

  // ------------------------------------------------- Fase 17 finisher

  /** The cinematic execution: stab · rope-whirl · slam. */
  private doFinisher(bandit: unknown): void {
    const p = this.player;
    const tp = this.banditPos(bandit);
    if (!tp) return;
    this.valor -= 100;
    this.onValorChange?.(this.valor);
    // face the doomed man
    p.yaw = Math.atan2(tp.x - p.position.x, tp.z - p.position.z);
    p.attackKind = 'heavy';
    p.attackDur = 0.85;
    p.attackT = 0.001;
    p.blocking = false;
    this.finisherLockT = 0.7;
    this.onCameraPunch?.(0.9);
    this.onHitStop?.(0.16);
    this.hooks.sound('hit_scale');
    // the blow itself: a massive hit — common bandits simply die
    this.hooks.damageBandit?.(bandit, 250, true);
    this.hooks.knockdownBandit?.(bandit, 1.4);
    this.vfx.weaponImpact(new THREE.Vector3(tp.x, tp.y + 1.2, tp.z));
    this.vfx.landingDust(new THREE.Vector3(tp.x, tp.y + 0.05, tp.z), 12, 1.1);
    this.flashEvent('FINISHER!');
    this.hooks.notify('item', 'FINISHER!', 'Sabre planted, rope whirled, and the tide took him.');
  }

  /** Live position of a bandit hook target (duck-typed, no import cycle). */
  private banditPos(bandit: unknown): THREE.Vector3 | null {
    if (!bandit) return null;
    const b = bandit as { pos?: THREE.Vector3; group?: THREE.Group };
    if (b.pos) return b.pos;
    if (b.group) return b.group.position;
    return null;
  }

  // ------------------------------------------------- Fase 17 rope visual

  private rope: THREE.Line | null = null;
  private ropeGeo: THREE.BufferGeometry | null = null;

  private ensureRope(): void {
    if (this.rope) return;
    this.ropeGeo = new THREE.BufferGeometry();
    this.ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    this.rope = new THREE.Line(
      this.ropeGeo,
      new THREE.LineBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.9 }),
    );
    this.rope.frustumCulled = false;
    this.scene.add(this.rope);
  }

  private updateRope(x: number, y: number, z: number): void {
    this.ensureRope();
    const p = this.player;
    const attr = this.ropeGeo!.getAttribute('position') as THREE.BufferAttribute;
    attr.setXYZ(0, p.position.x, p.position.y + 1.25, p.position.z);
    attr.setXYZ(1, x, y, z);
    attr.needsUpdate = true;
    if (this.rope) this.rope.visible = true;
  }

  private hideRope(): void {
    if (this.rope) this.rope.visible = false;
  }

  /** Floating air slash. */
  private fireAircut(weapon: WeaponDef): void {
    const p = this.player;
    if (p.stamina < weapon.lightStamina) return;
    p.stamina -= weapon.lightStamina;
    p.attackKind = 'aircut';
    p.attackDur = weapon.lightDur * 0.8;
    p.attackT = 0.001;
    this.swingHitDone = false;
    this.comboStep = this.comboWindowT > 0 ? this.comboStep : 0;
    this.comboRoute = 'air';
    this.pendingDmgMult = 1.05;
    this.swingIsFinisher = false;
    this.swingIsMulti = false;
    this.airJuggleUsed++; // one of the three aerial lights is spent
    this.launchPending = false;
    this.comboLabel = 'AERIAL';
    p.onAttackSwing?.();
  }

  /** Plunging dive — damage resolves when the ground arrives. */
  private firePlunge(weapon: WeaponDef): void {
    const p = this.player;
    if (p.stamina < weapon.heavyStamina) return;
    p.stamina -= weapon.heavyStamina;
    p.attackKind = 'plunge';
    p.attackDur = 0.6; // the pose holds; plungeLand finishes it
    p.attackT = 0.05;
    p.plunging = true;
    p.rollDir.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)); // dive along the facing
    this.swingHitDone = true; // resolved by plungeLand, not by time
    this.pendingDmgMult = 1.15;
    this.swingIsFinisher = true;
    this.swingIsMulti = true;
    this.comboLabel = 'GROUND SLAM!';
    this.onCombatEvent?.('GROUND SLAM!');
    p.onAttackSwing?.();
  }

  /** Plunge landing: the AoE lands (called by Player.onPlungeImpact). */
  private plungeLand(): void {
    const p = this.player;
    const weapon = this.weapon;
    if (!weapon) return;
    const c = this.tmp.set(p.position.x, p.position.y + 0.1, p.position.z);
    this.vfx.landingDust(c.clone(), 16, 1.4);
    // Fase 17 — the shockwave ring: a burst of nautical energy that reads
    // from any angle (the dust alone didn't sell the wave).
    this.vfx.elementalBurst(c.clone(), 'storm');
    this.onCameraPunch?.(0.6);
    this.onHitStop?.(0.12);
    this.hooks.sound('hit_scale');
    // bandits: radial ring — everyone hit is knocked FLAT
    if (this.hooks.banditMeleeRadius) {
      const hits = this.hooks.banditMeleeRadius(p.position, weapon.reach * 1.3, 5);
      for (const h of hits) {
        this.hooks.damageBandit?.(h.bandit, weapon.heavyDmg * this.pendingDmgMult, true);
        this.hooks.knockdownBandit?.(h.bandit, 0.95);
      }
      if (hits.length > 0) {
        this.vfx.weaponImpact(hits[0].point);
        this.gainValor(6 * hits.length);
      }
    }
    // dragons keep their own lane (single query, unchanged behaviour)
    const hit = this.hooks.dragonMelee(p.position, p.yaw, weapon.reach, 2.4);
    if (hit) this.hooks.damageDragon(hit.dragon, weapon.heavyDmg * this.pendingDmgMult, true);
    // crew
    this.hooks.crewHit(p.position, p.yaw, weapon.heavyDmg, weapon.reach * 1.2, 2.4);
    // wrap the dive
    p.attackT = 0;
    p.attackKind = 'heavy';
    p.attackRecovery = weapon.recovery;
    this.comboStep = 0;
    this.comboWindowT = 0;
    this.comboRoute = 'std';
  }

  // ---------------------------------------------------------------- melee

  private startSwing(weapon: WeaponDef, heavy: boolean, comboStep = 0, forceKind?: 'heavy' | 'spin' | 'uppercut'): void {
    const p = this.player;
    const cost = heavy ? weapon.heavyStamina : weapon.lightStamina;
    if (p.stamina < cost) {
      // Out of gas: the chain drops
      this.comboStep = 0;
      this.comboWindowT = 0;
      this.bufferedNext = false;
      return; // too exhausted — no swing
    }
    p.stamina -= cost;

    // Route tag + label (HUD reads like a fight, not a spreadsheet)
    let kindOverride = forceKind;
    const isFinisher = comboStep >= 4;
    const counter = (this.parryCounterT > 0 || this.dodgeCounterT > 0) && !heavy;
    this.comboStep = comboStep;
    this.comboWindowT = 1.15;
    this.swingIsFinisher = isFinisher || counter;
    this.pendingDmgMult = 1;
    if (comboStep === 1) this.pendingDmgMult = 1.08;        // second hit bites deeper
    if (comboStep === 2) this.pendingDmgMult = 1.16;
    if (comboStep === 3) this.pendingDmgMult = 1.2;         // the sweep rattles them
    if (isFinisher) this.pendingDmgMult = 1.5;              // whirlwind slam
    if (counter) this.pendingDmgMult = this.parryCounterT > 0 ? 1.6 : 1.5; // riposte!
    // Fase 17 — the four-step choreography per the spec:
    //   1 quick thrust · 2 diagonal slash · 3 spinning sweep KICK ·
    //   4 whirlwind slam that repels into masts and rails
    let akind: string;
    if (kindOverride === 'spin') akind = 'spin';
    else if (kindOverride === 'uppercut') akind = 'uppercut';
    else if (comboStep === 1) akind = weapon.kind === 'axe' ? this.altLight() : 'thrust';
    else if (comboStep === 2) akind = this.altLight();
    else if (comboStep === 3) akind = 'sweep';
    else if (isFinisher) akind = 'spin';
    else if (weapon.kind === 'axe') akind = heavy ? 'heavy' : this.altLight();
    else if (weapon.kind === 'spear') akind = 'thrust';
    else akind = heavy ? 'heavy' : this.altLight();
    if (counter) akind = this.parryCounterT > 0 ? 'heavy' : 'spin'; // ripostes read BIG
    p.attackKind = akind as typeof p.attackKind;
    p.attackDur = heavy ? weapon.heavyDur : weapon.lightDur;
    if (akind === 'spin') {
      p.attackDur = weapon.heavyDur * 0.92;         // the whip-around is brisk
      this.swingIsMulti = true;
    } else if (akind === 'sweep') {
      p.attackDur = weapon.lightDur * 0.85;         // a kick is quicker than a cut
      this.swingIsMulti = true;                    // it clips everyone at the ankles
    } else if (akind === 'uppercut') {
      p.attackDur = weapon.heavyDur * 1.05;
      this.swingIsMulti = false;
    } else {
      this.swingIsMulti = false;
    }
    if (isFinisher) p.attackDur *= 1.12;                   // weighty finisher
    p.attackT = 0.001;
    this.swingHitDone = false;
    this.launchPending = false;
    // label for the HUD
    this.comboLabel = counter
      ? (this.parryCounterT > 0 ? 'COUNTER!' : 'RIPOSTE!')
      : akind === 'spin' ? 'WHIRLWIND!'
      : akind === 'sweep' ? 'SWEEP!'
      : akind === 'uppercut' ? 'LAUNCH!'
      : '';
    if (counter) {
      this.comboLabel = this.parryCounterT > 0 ? 'COUNTER!' : 'QUICK RIPOSTE!';
      if (this.parryCounterT > 0) this.parryCounterT = 0; else this.dodgeCounterT = 0;
      this.onCameraPunch?.(0.7);
      this.onHitStop?.(0.1);
    } else if (isFinisher) {
      this.onCameraPunch?.(0.45);
      this.onHitStop?.(0.07);
    }
    // spear heavies lunge the fencer forward along the thrust
    if (weapon.kind === 'spear' && heavy) {
      p.velocity.x += Math.sin(p.yaw) * 3.2;
      p.velocity.z += Math.cos(p.yaw) * 3.2;
    }
    p.onAttackSwing?.();
  }

  private lightAlt = false;
  private altLight(): 'light1' | 'light2' {
    this.lightAlt = !this.lightAlt;
    return this.lightAlt ? 'light1' : 'light2';
  }

  private resolveMeleeHit(weapon: WeaponDef, heavy: boolean): void {
    const p = this.player;
    let dmg = heavy ? weapon.heavyDmg : weapon.lightDmg;
    if (this.state.learnedSkills.has('comb_maestria')) dmg *= 1.15;
    dmg *= this.pendingDmgMult;      // combo/counter weight
    // Fase 10 — Bram's forge upgrades sharpen ANY sword
    if (weapon.kind === 'sword') dmg *= SWORD_TIER_MULT[this.state.swordTier] ?? 1;
    // Fase 12 — elemental legendaries: flat bonus + distinct feel per element
    let element: 'fire' | 'frost' | 'storm' | undefined;
    if (weapon.element) {
      element = weapon.element;
      dmg *= element === 'fire' ? 1.35 : element === 'storm' ? 1.30 : 1.25;
    }
    const big = this.swingIsFinisher;
    const kind = p.attackKind;
    const multiArc = kind === 'spin' ? 2.75 : kind === 'sweep' ? 2.3 : weapon.arc;
    const reach = kind === 'sweep' ? weapon.reach + 0.35 : weapon.reach;
    // Fase 17 — LAUNCH (hold LMB): the rising cut that carries men skyward
    if (this.launchPending) {
      this.launchPending = false;
      p.verticalVel = 6.6; // the hero rides his own blade up
      p.grounded = false;
      p.jumpsUsed = 1;     // the double jump is still banked for the juggle
      p.airTime = 0.01;
    }

    // 1) Dragons — the big game (single query, untouched lane)
    const hit = this.hooks.dragonMelee(p.position, p.yaw, weapon.reach, multiArc);
    if (hit) {
      const final = hit.head ? dmg * 1.5 : dmg;
      this.hooks.damageDragon(hit.dragon, final, heavy);
      this.vfx.weaponImpact(hit.point);
      if (element) this.hooks.elementalHit?.(hit.point, element);
      this.hooks.sound('hit_scale');
      if (big) this.onCameraPunch?.(0.4);
      this.gainValor(6);
      return;
    }
    // 1.5) Fase 10/11/17 — bandits: multi sweeps for spins & sweeps, nearest
    //      for the rest; LAUNCHES fling the struck man into the air
    if (this.hooks.banditMelee) {
      const launchNow = kind === 'uppercut';
      if (this.swingIsMulti && this.hooks.banditMeleeMulti) {
        const hits = this.hooks.banditMeleeMulti(p.position, p.yaw, reach, multiArc, kind === 'sweep' ? 3 : 4);
        if (hits.length > 0) {
          for (const h of hits) {
            this.hooks.damageBandit?.(h.bandit, dmg, heavy);
            // the whirlwind finisher repels its victims into rails & masts
            if (kind === 'spin') this.hooks.knockdownBandit?.(h.bandit, 0.8);
          }
          this.vfx.weaponImpact(hits[0].point);
          if (element) {
            this.hooks.elementalHit?.(hits[0].point, element);
            // STORM chains: the nearest extra bandit eats half the damage
            if (element === 'storm' && hits.length > 1) {
              this.hooks.damageBandit?.(hits[hits.length - 1].bandit, dmg * 0.5, false);
              this.hooks.elementalHit?.(hits[hits.length - 1].point, 'storm');
            }
          }
          this.hooks.sound(big ? 'hit_scale' : 'damage');
          if (big) {
            this.onCameraPunch?.(0.5);
            this.onHitStop?.(0.08);
          }
          this.gainValor(5 * hits.length);
          return;
        }
      } else {
        const bHit = this.hooks.banditMelee(p.position, p.yaw, reach, multiArc);
        if (bHit) {
          this.hooks.damageBandit?.(bHit.bandit, dmg, heavy);
          if (launchNow) this.hooks.launchBandit?.(bHit.bandit, 6.2);
          this.vfx.weaponImpact(bHit.point);
          if (element) this.hooks.elementalHit?.(bHit.point, element);
          this.hooks.sound(big ? 'hit_scale' : 'damage');
          if (big) {
            this.onCameraPunch?.(0.5);
            this.onHitStop?.(0.08);
          }
          this.gainValor(6);
          return;
        }
      }
    }
    // 2) Boarding pirates
    if (this.hooks.crewHit(p.position, p.yaw, dmg, weapon.reach, multiArc)) {
      this.hooks.sound(big ? 'hit_scale' : 'damage');
      if (big) this.onCameraPunch?.(0.5);
      this.gainValor(5);
      return;
    }
    // 3) Training dummy (needs to face it & be close)
    if (this.hooks.dummyHit(p.position, p.yaw)) {
      this.hooks.sound('damage');
      return;
    }
    // 4) Nothing connected — a WHIFF: nearby bandits raise their guard
    this.hooks.onWhiff?.(p.position);
  }

  // ---------------------------------------------------------------- bow

  // ---------------------------------------------------------------- bow
  // Fase 18 — THE FULL ARCHERY SPEC:
  //  * TAP = quick shot: 30% damage, steep arc, short range (status applier)
  //  * HOLD = full draw: 100% damage, near-linear flight
  //  * OVERDRAW past 100% drains stamina at an accelerating rate; hitting
  //    empty FUMBLES the shot and staggers the archer
  //  * AIM (RMB) slows movement 40%; the GREATBOW plants (no movement)
  //  * Headshots on bosses crit x2.25 and interrupt; three bow classes;
  //  * Infinite basic arrows + piercing / fire / shock / poison families
  //  * ARROW RAIN (G) and PIERCING SHOT (T); AIR AIM slows time mid-air

  private updateBow(dt: number, input: Input, weapon: WeaponDef): void {
    const p = this.player;
    const ranged = weapon.ranged!;
    const drawSpeed = this.state.learnedSkills.has('comb_punteria') ? 1.3 : 1;

    // Greatbow: PLANTED — the stance commits (movement zeroed by Player).
    p.bowPlanted = ranged.planted === true && p.bowDraw >= 0;

    // Fatigue stagger from a fumbled overdraw: no drawing while it lasts.
    if (this.fumbleT > 0) {
      if (p.bowDraw >= 0) p.bowDraw = -1;
      this.overdrawT = 0;
      return;
    }

    const canHold = input.leftDown
      && p.attackT === 0 && p.attackRecovery <= 0
      // DODGE SHOT: short bows keep drawing straight through a roll
      && (ranged.dodgeShot ? !p.swimming : (!p.rolling && p.grounded && !p.swimming))
      && p.stamina > 1;

    if (canHold) {
      if (p.bowDraw < 0) {
        // basic arrows are infinite; specials need stock
        if (this.ammoReady()) {
          p.bowDraw = 0.001;
          this.overdrawT = 0;
          this.hooks.sound('bow_draw');
        } else if (input.leftPressed) {
          const def = AMMO_DEFS.find((d) => d.kind === this.ammoKind)!;
          this.hooks.notify('info', `Out of ${def.name.toLowerCase()}s`,
            'X switches to plain arrows — those never run out.');
        }
      } else {
        p.bowDraw = Math.min(1, p.bowDraw + (dt / ranged.drawTime) * drawSpeed);
        if (p.bowDraw >= 0.999) {
          // OVERDRAW: hold past 100%. Grace first, then the accelerating
          // burn — empty the bar and the shot FAILS with a fatigue stagger.
          this.overdrawT += dt;
          const drain = this.overdrawT <= ranged.overdrawGrace
            ? 2.0
            : ranged.overdrawDrain * (1 + Math.max(0, this.overdrawT - ranged.overdrawGrace) * 0.8);
          p.stamina = Math.max(0, p.stamina - drain * dt);
          if (p.stamina <= 0.01) {
            // FUMBLE — the string slips, the arms shake, the shot is lost
            p.bowDraw = -1;
            this.overdrawT = 0;
            this.fumbleT = 1.15;
            p.attackRecovery = Math.max(p.attackRecovery, 1.05);
            this.onCameraPunch?.(0.35);
            this.hooks.sound('thud');
            this.flashEvent('OVERDRAWN!');
            this.hooks.notify('info', 'The shot fails',
              'Your arms give out — the string slips. Keep an eye on the bar when you hold past full draw.');
            if (this.ammoKind !== 'basic') this.spendAmmo();
            return;
          }
        } else {
          // drawing costs a trickle (short bows barely feel it)
          p.stamina = Math.max(0, p.stamina - dt * (ranged.bowClass === 'short' ? 0.6 : 1.4));
        }
      }
    } else if (p.bowDraw >= 0) {
      // Released (or interrupted) -> loose if meaningfully drawn
      const draw = p.bowDraw;
      p.bowDraw = -1;
      const held = this.overdrawT;
      this.overdrawT = 0;
      if (draw > 0.16 && p.attackT === 0 && this.ammoReady()) {
        this.fireArrow(weapon, draw, held);
      }
    }
  }

  /** Basic arrows are infinite; specials need one in the quiver. */
  private ammoReady(): boolean {
    if (this.ammoKind === 'basic') return true;
    const def = AMMO_DEFS.find((d) => d.kind === this.ammoKind)!;
    return def.item !== null && this.state.countItem(def.item) > 0;
  }

  private spendAmmo(): void {
    if (this.ammoKind === 'basic') return;
    const def = AMMO_DEFS.find((d) => d.kind === this.ammoKind)!;
    if (def.item) this.state.removeItem(def.item, 1);
  }

  /** X — cycle arrow families (skips specials you don't carry). */
  private cycleAmmo(): void {
    const order: AmmoKind[] = ['basic', 'piercing', 'fire', 'shock', 'poison'];
    for (let step = 1; step <= order.length; step++) {
      const next = order[(order.indexOf(this.ammoKind) + step) % order.length];
      if (next === 'basic') { this.ammoKind = next; break; }
      const def = AMMO_DEFS.find((d) => d.kind === next)!;
      if (def.item && this.state.countItem(def.item) > 0) { this.ammoKind = next; break; }
    }
    const def = AMMO_DEFS.find((d) => d.kind === this.ammoKind)!;
    this.hooks.sound('swap');
    this.flashEvent(def.name.toUpperCase() + 'S');
  }

  private fireArrow(weapon: WeaponDef, draw: number, overdrawHeld = 0, ammo: AmmoKind = this.ammoKind): void {
    const p = this.player;
    this.spendAmmoFor(ammo);
    const ranged = weapon.ranged!;
    const { origin, dir } = this.hooks.aimRay();
    // Aim point along the camera ray (taps aim closer — short range feel),
    // fired from the player's chest: classic third-person convergence.
    const isTap = draw < 0.25;
    const aimDist = isTap ? 26 : 52;
    const aimPoint = this.tmp.copy(origin).addScaledVector(dir, aimDist);
    const chest = this.tmp2.set(p.position.x, p.position.y + 1.35, p.position.z);
    const flightDir = new THREE.Vector3().copy(aimPoint).sub(chest).normalize();
    const javelin = ranged.projKind === 'javelin';
    const mesh = this.buildArrowMesh(ammo, javelin);
    mesh.position.copy(chest).addScaledVector(flightDir, 0.6);
    mesh.lookAt(mesh.position.clone().add(flightDir));
    this.scene.add(mesh);

    // --- damage model: tap 30% ... full 100%, overdraw steadies a touch ---
    let dmg = ranged.dmg * (ranged.tapFrac + (1 - ranged.tapFrac) * Math.min(1, draw / 0.98));
    if (overdrawHeld > 0) dmg *= 1 + Math.min(0.25, overdrawHeld * 0.08);
    if (this.state.learnedSkills.has('comb_punteria')) dmg *= 1.3;
    // Recurve streak: consecutive long-range connects pay +8% each (max 40%)
    if (ranged.bowClass === 'long' && this.streak > 0) dmg *= 1 + Math.min(0.4, this.streak * 0.08);
    // Ammo families tweak the payload
    if (ammo === 'piercing') dmg *= 1.15;

    this.arrows.push({
      mesh,
      vel: flightDir.clone().multiplyScalar(ranged.speed * (isTap ? 0.55 : 1)),
      life: isTap ? 2.4 : 6,
      dmg,
      stuck: false,
      ammo,
      gravity: isTap ? ranged.gravityTap : ranged.gravityFull,
      origin: chest.clone(),
    });
    // Release animation (short bows snap, greatbows heave)
    p.attackKind = 'bowRelease';
    p.attackDur = ranged.bowClass === 'short' ? 0.24 : ranged.bowClass === 'greatbow' ? 0.5 : 0.35;
    p.attackT = 0.001;
    this.swingHitDone = true;
    this.hooks.sound('bow_release');
  }

  /** Special arrows burn stock; basic ones are free. */
  private spendAmmoFor(ammo: AmmoKind): boolean {
    if (ammo === 'basic') return true;
    const def = AMMO_DEFS.find((d) => d.kind === ammo)!;
    if (!def.item || this.state.countItem(def.item) <= 0) return false;
    return this.state.removeItem(def.item, 1);
  }

  private buildArrowMesh(ammo: AmmoKind = 'basic', javelin = false): THREE.Group {
    const g = new THREE.Group();
    const shaftMat = new THREE.MeshStandardMaterial({
      color: javelin ? 0x5c452a : 0x6a5232, roughness: 0.8,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0x9aa2a8, roughness: 0.4, metalness: 0.7,
    });
    // element tints
    if (ammo === 'fire') tipMat.color.set(0xd05a1e);
    else if (ammo === 'shock') tipMat.color.set(0x62d8e8);
    else if (ammo === 'poison') tipMat.color.set(0x74a832);
    else if (ammo === 'piercing') tipMat.color.set(0x40464e);
    const L = javelin ? 1.55 : 0.62;
    const R = javelin ? 0.026 : 0.012;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 5), shaftMat);
    shaft.rotation.x = Math.PI / 2;
    g.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(javelin ? 0.05 : 0.02, javelin ? 0.22 : 0.09, 5), tipMat,
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = L / 2 + 0.04;
    g.add(tip);
    if (!javelin) {
      const fletchMat = new THREE.MeshStandardMaterial({
        color: ammo === 'fire' ? 0xc04020 : ammo === 'shock' ? 0x3a8898 : ammo === 'poison' ? 0x5a7a20 : 0xd8d2c0,
        roughness: 0.9,
      });
      const fletch = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.12, 4), fletchMat);
      fletch.rotation.x = -Math.PI / 2;
      fletch.position.z = -0.28;
      g.add(fletch);
    } else {
      // javelin grip wrap
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(R * 1.35, R * 1.35, 0.22, 5),
        new THREE.MeshStandardMaterial({ color: 0x2c2018, roughness: 0.95 }),
      );
      grip.rotation.x = Math.PI / 2;
      grip.position.z = -L / 2 + 0.28;
      g.add(grip);
    }
    // elemental glow aura on the tip
    if (ammo === 'fire' || ammo === 'shock' || ammo === 'poison') {
      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(javelin ? 0.09 : 0.045, 6, 5),
        new THREE.MeshStandardMaterial({
          color: 0x101010,
          emissive: ammo === 'fire' ? 0xff7a2a : ammo === 'shock' ? 0x48c8e8 : 0x7ab02a,
          emissiveIntensity: 2.2, roughness: 0.5,
        }),
      );
      aura.position.z = L / 2 + 0.06;
      g.add(aura);
    }
    return g;
  }

  private updateArrows(dt: number): void {
    const p = this.player;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (a.stuck) continue;
      a.life -= dt;
      // Ballistic arc — taps arc hard, full draws fly flat (per-arrow gravity)
      a.vel.y -= a.gravity * dt;
      const prevX = a.mesh.position.x;
      const prevY = a.mesh.position.y;
      const prevZ = a.mesh.position.z;
      const step = this.tmpDir.copy(a.vel).multiplyScalar(dt);
      a.mesh.position.add(step);
      a.mesh.lookAt(this.tmp.copy(a.mesh.position).add(a.vel));

      const prev = this.tmp2.set(prevX, prevY, prevZ);

      // --- Dragon hit: headshots crit and interrupt (swept segment) ---
      const dragonPart = this.dragonHitPartRef?.(a.mesh.position, 0.4, prev) ?? null;
      if (dragonPart) {
        let dmg = a.dmg;
        if (dragonPart.head) {
          dmg *= a.pierce ? 2.0 : 2.25; // weak points: 200-250%
          this.flashEvent('WEAK POINT!');
          this.onCameraPunch?.(0.4);
          this.hooks.sound('hit_scale');
        }
        this.hooks.damageDragon(dragonPart.dragon, dmg, dragonPart.head || a.pierce === true);
        this.applyArrowEffects(a, a.mesh.position, null, dragonPart.dragon);
        this.vfx.weaponImpact(a.mesh.position);
        this.hooks.sound('arrow_hit');
        this.noteStreak(a);
        if (!a.pierce) { this.removeArrow(i); continue; }
        a.hitSet?.add(dragonPart.dragon);
      }
      // --- Bandit hit: headshot crits x2.2 + knockdown ---
      const bandit = this.banditHitRef?.(a.mesh.position, 0.4, prev) ?? null;
      if (bandit && !a.hitSet?.has(bandit)) {
        let dmg = a.dmg;
        const headY = (this.banditHeadYRef?.(bandit)) ?? Infinity;
        if (a.mesh.position.y >= headY) {
          dmg *= a.pierce ? 1.9 : 2.2;
          this.flashEvent('HEADSHOT');
          this.onCameraPunch?.(0.35);
          this.hooks.sound('hit_scale');
          this.banditKnockdownRef?.(bandit, 0.7);
        } else if (a.pierce) {
          // greatbow + piercing javelins break posture outright
          this.banditKnockdownRef?.(bandit, 0.9);
        }
        // piercing ammo ignores the guard entirely
        this.damageBanditRef?.(bandit, dmg, a.ammo === 'piercing' || a.pierce === true);
        this.applyArrowEffects(a, a.mesh.position, bandit, null);
        this.vfx.weaponImpact(a.mesh.position);
        this.hooks.sound('arrow_hit');
        this.noteStreak(a);
        if (!a.pierce) { this.removeArrow(i); continue; }
        a.hitSet?.add(bandit);
      }
      // --- Sea serpents (Fase 15 beasts can be arrowed too) ---
      if (this.seaBeastHitRef) {
        const beast = this.seaBeastHitRef(a.mesh.position, 0.4, prev);
        if (beast && !a.hitSet?.has(beast)) {
          this.seaBeastDamageRef?.(beast, a.dmg * (a.ammo === 'piercing' ? 1.2 : 1));
          this.applyArrowEffects(a, a.mesh.position, null, null);
          this.vfx.weaponImpact(a.mesh.position);
          this.hooks.sound('arrow_hit');
          this.noteStreak(a);
          if (!a.pierce) { this.removeArrow(i); continue; }
          a.hitSet?.add(beast);
        }
      }
      // Terrain hit -> stick; some can be recovered; over water: lost
      const ground = this.terrainHeight(a.mesh.position.x, a.mesh.position.z);
      if (a.mesh.position.y <= Math.max(ground, -0.4) + 0.02) {
        if (a.pierce) { this.removeArrow(i); continue; }
        if (ground < -0.4) {
          this.vfx.arrowDust(a.mesh.position);
          this.removeArrow(i);
          continue;
        }
        a.mesh.position.y = ground + 0.02;
        a.stuck = true;
        this.vfx.arrowDust(a.mesh.position);
        if (a.ammo === 'basic' && Math.random() < 0.55) {
          this.pickups.push({ mesh: a.mesh, pos: a.mesh.position.clone() });
          this.arrows.splice(i, 1); // keep mesh alive as pickup
        } else {
          a.life = 4; // fade stuck arrows
        }
        this.streak = 0; // the ground is not a target
        continue;
      }
      if (a.life <= 0) this.removeArrow(i);
    }
    // Stuck arrow fade
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (a.stuck) {
        a.life -= dt;
        if (a.life <= 0) this.removeArrow(i);
      }
    }
    // Pickups: walk close to recover (basic arrows only — specials are spent)
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pu = this.pickups[i];
      if (pu.pos.distanceTo(p.position) < 1.8) {
        this.hooks.sound('pickup');
        this.scene.remove(pu.mesh);
        this.pickups.splice(i, 1);
      }
    }
    // --- elemental damage-over-time ticks (fire arrows on dragons) ---
    this.tickDots(dt);
  }

  /** Active damage-over-time effects (fire arrows). */
  private dots: Array<{ dragon: Dragon; dps: number; t: number }> = [];

  private tickDots(dt: number): void {
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.t -= dt;
      this.hooks.damageDragon(d.dragon, d.dps * dt, false);
      if (d.t <= 0) this.dots.splice(i, 1);
    }
  }

  /** Recurve streak bookkeeping (longbow: consecutive 28 m+ connects). */
  private noteStreak(a: Arrow): void {
    if (!a.origin) return;
    const dist = Math.hypot(
      a.mesh.position.x - a.origin.x,
      a.mesh.position.z - a.origin.z,
    );
    if (dist >= 28) {
      this.streak = Math.min(5, this.streak + 1);
      if (this.streak >= 2) this.flashEvent(`DEAD EYE x${this.streak}`);
    } else {
      this.streak = 0;
    }
  }

  /** Ammo on-hit effects: burn / chain-shock / poison. */
  private applyArrowEffects(a: Arrow, at: THREE.Vector3, bandit: unknown | null, dragon: Dragon | null): void {
    if (a.ammo === 'fire') {
      this.vfx.elementalBurst(at, 'fire');
      if (dragon) {
        this.dots.push({ dragon, dps: a.dmg * 0.14, t: 4 });
        this.flashEvent('BURNING');
      }
      if (bandit) this.banditStatusRef?.(bandit, 'burn', 3.5);
    } else if (a.ammo === 'shock') {
      this.vfx.elementalBurst(at, 'storm');
      // chain arcing to nearby foes (60% damage, up to 3)
      const near = this.banditsNearRef?.(at, 9) ?? [];
      let chained = 0;
      for (const other of near) {
        if (other === bandit || chained >= 3) continue;
        chained++;
        this.damageBanditRef?.(other, a.dmg * 0.6, false);
        this.vfx.elementalBurst(
          new THREE.Vector3((other as { pos?: THREE.Vector3 }).pos?.x ?? at.x, at.y, (other as { pos?: THREE.Vector3 }).pos?.z ?? at.z),
          'storm',
        );
      }
      if (chained > 0) this.flashEvent(`CHAIN x${chained}`);
      // stun if the target stands in water or it's raining
      const bpos = bandit ? this.banditPosRef?.(bandit) : undefined;
      const wet = this.isRainingRef?.() === true
        || (bpos !== undefined && this.terrainHeightOf(bpos) < 0.25);
      if (bandit && wet) {
        this.banditKnockdownRef?.(bandit, 2.2);
        this.flashEvent('STUNNED');
      }
    } else if (a.ammo === 'poison') {
      this.vfx.elementalBurst(at, 'frost');
      if (bandit) this.banditStatusRef?.(bandit, 'poison', 8);
      if (dragon) this.dots.push({ dragon, dps: a.dmg * 0.06, t: 8 });
    }
  }

  private terrainHeightOf(pos: { x: number; z: number }): number {
    return this.terrainHeight(pos.x, pos.z);
  }

  // ------------------------------------------------------ archery abilities

  /** G — ARROW RAIN: a parabolic volley that bombs an area for 3 seconds. */
  private tryArrowRain(weapon: WeaponDef): void {
    const p = this.player;
    if (this.arrowRainCd > 0 || p.stamina < 35 || this.arrowRain) return;
    const { origin, dir } = this.hooks.aimRay();
    const center = origin.clone().addScaledVector(dir, 42);
    center.y = Math.max(this.terrainHeight(center.x, center.z), 0.2);
    p.stamina -= 35;
    this.arrowRain = { center, t: 0, spawned: 0, ammo: this.ammoKind, dmg: weapon.ranged!.dmg * 0.5 };
    this.arrowRainCd = 20;
    this.hooks.sound('bow_release');
    this.flashEvent('ARROW RAIN');
    this.hooks.notify('info', 'Arrow Rain!', 'A volley darkens the sky — get out of the circle.');
  }

  /** Spawns the falling volley over 3 s. */
  private tickArrowRain(dt: number): void {
    if (!this.arrowRain) return;
    const r = this.arrowRain;
    r.t += dt;
    const want = Math.min(20, Math.floor(r.t / 0.15));
    while (r.spawned < want) {
      r.spawned++;
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * 7;
      const x = r.center.x + Math.cos(ang) * rad;
      const z = r.center.z + Math.sin(ang) * rad;
      const mesh = this.buildArrowMesh(r.ammo, false);
      mesh.position.set(x, r.center.y + 30 + Math.random() * 6, z);
      mesh.lookAt(x, r.center.y - 5, z);
      this.scene.add(mesh);
      this.arrows.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.6, -26, (Math.random() - 0.5) * 1.6),
        life: 4.5,
        dmg: r.dmg,
        stuck: false,
        ammo: r.ammo,
        gravity: 12,
      });
    }
    if (r.t >= 3.2) this.arrowRain = null;
  }

  /** T — CONCENTRATED PIERCING SHOT: a javelin that passes through
   *  everything in a straight line (long cooldown). */
  private tryPierceShot(weapon: WeaponDef): void {
    const p = this.player;
    if (this.pierceShotCd > 0 || p.stamina < 25) return;
    const ranged = weapon.ranged!;
    p.stamina -= 25;
    this.pierceShotCd = 28;
    const { origin, dir } = this.hooks.aimRay();
    const chest = new THREE.Vector3(p.position.x, p.position.y + 1.35, p.position.z);
    const flightDir = origin.clone().addScaledVector(dir, 60).sub(chest).normalize();
    const mesh = this.buildArrowMesh('piercing', true);
    // a blazing heavy bolt
    mesh.scale.setScalar(1.5);
    mesh.position.copy(chest).addScaledVector(flightDir, 0.8);
    mesh.lookAt(mesh.position.clone().add(flightDir));
    this.scene.add(mesh);
    let dmg = ranged.dmg * 1.6;
    if (this.state.learnedSkills.has('comb_punteria')) dmg *= 1.3;
    this.arrows.push({
      mesh,
      vel: flightDir.clone().multiplyScalar(95),
      life: 1.4,
      dmg,
      stuck: false,
      ammo: 'piercing',
      gravity: 0,
      pierce: true,
      hitSet: new Set<unknown>(),
    });
    p.attackKind = 'bowRelease';
    p.attackDur = 0.5;
    p.attackT = 0.001;
    this.swingHitDone = true;
    this.hooks.sound('bow_release');
    this.onCameraPunch?.(0.3);
    this.flashEvent('PIERCING SHOT');
  }

  /** HUD state push (Game wires this to the store). */
  private pushBowHud(weapon: WeaponDef): void {
    if (!this.onBowHud) return;
    const counts = {
      basic: Infinity,
      piercing: this.state.countItem('flecha_perforante'),
      fire: this.state.countItem('flecha_fuego'),
      shock: this.state.countItem('flecha_electrica'),
      poison: this.state.countItem('flecha_veneno'),
    } as Record<AmmoKind, number>;
    const def = AMMO_DEFS.find((d) => d.kind === this.ammoKind)!;
    this.onBowHud({
      ammo: this.ammoKind,
      ammoName: weapon.ranged?.projKind === 'javelin' ? `${def.name} (bolt)` : def.name,
      counts,
      overdraw: this.overdrawT,
      streak: this.streak,
      rainCd: Math.max(0, this.arrowRainCd),
      pierceCd: Math.max(0, this.pierceShotCd),
    });
  }

  private hooksAimDragon(pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3): Dragon | null {
    return this.dragonHitRef ? this.dragonHitRef(pos, radius, prevPos) : null;
  }

  /** Injected by the Game (avoids a circular hook dependency). */
  dragonHitRef: ((pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3) => Dragon | null) | null = null;
  /** Fase 18 — part-aware dragon hit (head vs body) for arrow crits. */
  dragonHitPartRef: ((pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3)
    => { dragon: Dragon; head: boolean } | null) | null = null;
  /** Fase 10 — arrow collision against bandits (same swept protocol). */
  banditHitRef: ((pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3) => unknown | null) | null = null;
  damageBanditRef: ((bandit: unknown, amount: number, heavy?: boolean) => void) | null = null;
  /** Fase 18 — bandit helpers: head height, knockdown, statuses, area query. */
  banditHeadYRef: ((bandit: unknown) => number) | null = null;
  banditKnockdownRef: ((bandit: unknown, dur: number) => void) | null = null;
  banditStatusRef: ((bandit: unknown, kind: 'burn' | 'poison', dur: number) => void) | null = null;
  banditsNearRef: ((pos: THREE.Vector3, radius: number) => unknown[]) | null = null;
  banditPosRef: ((bandit: unknown) => { x: number; z: number } | undefined) | null = null;
  isRainingRef: (() => boolean) | null = null;
  /** Fase 18 — sea serpents can be arrowed (projectile swept test + damage). */
  seaBeastHitRef: ((pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3) => unknown | null) | null = null;
  seaBeastDamageRef: ((beast: unknown, amount: number) => void) | null = null;
  terrainHeightRef: ((x: number, z: number) => number) | null = null;

  private terrainHeight(x: number, z: number): number {
    return this.terrainHeightRef ? this.terrainHeightRef(x, z) : 0;
  }

  private removeArrow(i: number): void {
    const a = this.arrows[i];
    this.scene.remove(a.mesh);
    a.mesh.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).geometry.dispose();
        ((o as THREE.Mesh).material as THREE.Material).dispose();
      }
    });
    this.arrows.splice(i, 1);
  }

  // ---------------------------------------------------------------- misc

  private switchTo(id: string): void {
    if (!this.state.hasItem(id)) {
      this.hooks.notify('info', 'Weapon not acquired', 'You do not carry that weapon yet. Explore Eldoria and finish quests.');
      return;
    }
    if (this.state.equippedWeapon === id) return;
    this.state.equip(id);
    this.player.attackT = 0;
    this.player.bowDraw = -1;
    this.player.bowPlanted = false;
    this.overdrawT = 0;
    this.fumbleT = 0;
    this.streak = 0;
    this.airAiming = false;
    this.refreshVisuals();
    this.hooks.sound('swap');
  }

  /** Called by the Game when the UI equips an item directly. */
  onUiEquip(): void {
    this.refreshVisuals();
  }

  dispose(): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) this.removeArrow(i);
    for (const pu of this.pickups) {
      this.scene.remove(pu.mesh);
    }
    this.pickups = [];
    this.retireGrapple();
    if (this.rope) {
      this.scene.remove(this.rope);
      this.ropeGeo?.dispose();
      (this.rope.material as THREE.Material).dispose();
      this.rope = null;
      this.ropeGeo = null;
    }
  }
}
