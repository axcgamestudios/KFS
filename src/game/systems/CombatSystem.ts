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
  ranged?: { drawTime: number; dmg: number; minDmgFrac: number; speed: number };
  /** Fase 12 — elemental legendary swords (late-game boss loot). */
  element?: 'fire' | 'frost' | 'storm';
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
  arco_naufragio: {
    id: 'arco_naufragio', kind: 'bow',
    lightDmg: 0, heavyDmg: 0, reach: 0, arc: 0,
    lightDur: 0.35, heavyDur: 0.35, recovery: 0.25, lightStamina: 0, heavyStamina: 0,
    ranged: { drawTime: 1.05, dmg: 30, minDmgFrac: 0.4, speed: 36 },
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

    // --- Weapon switching (1-4) ---
    for (let i = 0; i < WEAPON_SLOTS.length; i++) {
      if (input.anyPressed(`Digit${i + 1}`)) {
        const slotId = i === 0 ? this.currentSwordId() : WEAPON_SLOTS[i];
        if (slotId) this.switchTo(slotId);
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
      this.updateBow(dt, input, weapon);
      this.updateArrows(dt);
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

  private updateBow(dt: number, input: Input, weapon: WeaponDef): void {
    const p = this.player;
    const ranged = weapon.ranged!;
    const drawSpeed = this.state.learnedSkills.has('comb_punteria') ? 1.3 : 1;

    if (
      input.leftDown && p.attackT === 0 && p.attackRecovery <= 0 && !p.rolling
      && p.grounded && p.stamina > 1
    ) {
      // Drawing
      if (p.bowDraw < 0) {
        if (this.state.countItem('flecha') > 0) {
          p.bowDraw = 0.001;
          this.hooks.sound('bow_draw');
        } else if (input.leftPressed) {
          this.hooks.notify('info', 'Out of arrows', 'Your quiver is empty. Missed shots can be recovered, and drakelings carry a few.');
        }
      } else {
        p.bowDraw = Math.min(1, p.bowDraw + (dt / ranged.drawTime) * drawSpeed);
      }
    } else if (p.bowDraw >= 0) {
      // Released (or interrupted) -> fire if meaningfully drawn
      const draw = p.bowDraw;
      p.bowDraw = -1;
      if (draw > 0.25 && this.state.countItem('flecha') > 0 && p.attackT === 0) {
        this.fireArrow(weapon, draw);
      }
    }

    // Draw drains a little stamina at full draw
    if (p.bowDraw >= 0.999) {
      p.stamina = Math.max(0, p.stamina - dt * 2);
    }
  }

  private fireArrow(weapon: WeaponDef, draw: number): void {
    const p = this.player;
    if (!this.state.removeItem('flecha', 1)) return;
    const ranged = weapon.ranged!;
    const { origin, dir } = this.hooks.aimRay();
    // Aim point 48m along the camera ray, fired from the player's chest —
    // classic third-person converging projectile.
    const aimPoint = this.tmp.copy(origin).addScaledVector(dir, 48);
    const chest = this.tmp2.set(p.position.x, p.position.y + 1.35, p.position.z);
    const flightDir = new THREE.Vector3().copy(aimPoint).sub(chest).normalize();
    const mesh = this.buildArrowMesh();
    mesh.position.copy(chest).addScaledVector(flightDir, 0.6);
    mesh.lookAt(mesh.position.clone().add(flightDir));
    this.scene.add(mesh);
    let dmg = ranged.dmg * (ranged.minDmgFrac + (1 - ranged.minDmgFrac) * draw);
    if (this.state.learnedSkills.has('comb_punteria')) dmg *= 1.3;
    this.arrows.push({
      mesh,
      vel: flightDir.clone().multiplyScalar(ranged.speed),
      life: 6,
      dmg,
      stuck: false,
    });
    // Release animation
    p.attackKind = 'bowRelease';
    p.attackDur = 0.35;
    p.attackT = 0.001;
    this.swingHitDone = true;
    this.hooks.sound('bow_release');
  }

  private buildArrowMesh(): THREE.Group {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5),
      new THREE.MeshStandardMaterial({ color: 0x6a5232, roughness: 0.8 }),
    );
    shaft.rotation.x = Math.PI / 2;
    g.add(shaft);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.02, 0.09, 5),
      new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.4, metalness: 0.7 }),
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.35;
    g.add(tip);
    const fletch = new THREE.Mesh(
      new THREE.ConeGeometry(0.028, 0.12, 4),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9 }),
    );
    fletch.rotation.x = -Math.PI / 2;
    fletch.position.z = -0.28;
    g.add(fletch);
    return g;
  }

  private updateArrows(dt: number): void {
    const p = this.player;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (a.stuck) continue;
      a.life -= dt;
      // Ballistic arc — remember the previous position for swept collision
      a.vel.y -= 16 * dt;
      const prevX = a.mesh.position.x;
      const prevY = a.mesh.position.y;
      const prevZ = a.mesh.position.z;
      const step = this.tmpDir.copy(a.vel).multiplyScalar(dt);
      a.mesh.position.add(step);
      a.mesh.lookAt(this.tmp.copy(a.mesh.position).add(a.vel));

      // Dragon hit (swept segment so fast arrows can't tunnel at low fps)
      const prev = this.tmp2.set(prevX, prevY, prevZ);
      const dragon = this.hooksAimDragon(a.mesh.position, 0.4, prev);
      if (dragon) {
        this.hooks.damageDragon(dragon, a.dmg, false);
        this.vfx.weaponImpact(a.mesh.position);
        this.hooks.sound('arrow_hit');
        this.removeArrow(i);
        continue;
      }
      // Fase 10 — bandit hit (swept, same protocol)
      const bandit = this.banditHitRef?.(a.mesh.position, 0.4, prev) ?? null;
      if (bandit) {
        this.damageBanditRef?.(bandit, a.dmg);
        this.vfx.weaponImpact(a.mesh.position);
        this.hooks.sound('arrow_hit');
        this.removeArrow(i);
        continue;
      }
      // Terrain hit -> stick (some can be recovered); over open water the
      // arrow is simply lost to the sea.
      const ground = this.terrainHeight(a.mesh.position.x, a.mesh.position.z);
      if (a.mesh.position.y <= Math.max(ground, -0.4) + 0.02) {
        if (ground < -0.4) {
          this.vfx.arrowDust(a.mesh.position);
          this.removeArrow(i);
          continue;
        }
        a.mesh.position.y = ground + 0.02;
        a.stuck = true;
        this.vfx.arrowDust(a.mesh.position);
        if (Math.random() < 0.55) {
          this.pickups.push({ mesh: a.mesh, pos: a.mesh.position.clone() });
          this.arrows.splice(i, 1); // keep mesh alive as pickup
        } else {
          a.life = 4; // fade non-recoverable stuck arrows
          this.arrows[i].stuck = true;
        }
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
    // Pickups: walk close to recover the arrow
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pu = this.pickups[i];
      if (pu.pos.distanceTo(p.position) < 1.8) {
        this.state.addItem('flecha', 1);
        this.hooks.sound('pickup');
        this.scene.remove(pu.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  private hooksAimDragon(pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3): Dragon | null {
    return this.dragonHitRef ? this.dragonHitRef(pos, radius, prevPos) : null;
  }

  /** Injected by the Game (avoids a circular hook dependency). */
  dragonHitRef: ((pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3) => Dragon | null) | null = null;
  /** Fase 10 — arrow collision against bandits (same swept protocol). */
  banditHitRef: ((pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3) => unknown | null) | null = null;
  damageBanditRef: ((bandit: unknown, amount: number) => void) | null = null;
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
