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
};

/** Slot order for keys 1-4. Slot 1 is the sword the player actually owns
 * (Fase 10: the starting Espada de acero upgrades through Bram's forge and
 * heirlooms are found along the way — the HUD always shows the best one). */
export const SWORD_PRIORITY = ['espada_guardian', 'espada_eirik', 'espada_acero'];
export const WEAPON_SLOTS = ['espada_acero', 'hacha_orden', 'lanza_caza', 'arco_naufragio'];

/** Display names for the forge tiers of any sword. */
export const SWORD_TIER_NAMES = ['', ' · Templada', ' · Rúnica', ' · Legendaria'];

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
      this.hooks.sound('block');
      this.onCameraPunch?.(0.55);
      this.onHitStop?.(0.09);
      this.onCombatEvent?.('¡PARADA PERFECTA!');
      this.vfx.weaponImpact(new THREE.Vector3(fx, player.position.y + 1.25, fz));
    };
    // Fase 11 — perfect dodge: the blow slid past inside the roll i-frames
    const prevOnDodge = player.onPerfectDodge;
    player.onPerfectDodge = () => {
      prevOnDodge?.();
      this.dodgeCounterT = 1.1;
      this.hooks.sound('swing');
      this.onCameraPunch?.(0.4);
      this.onCombatEvent?.('¡ESQUIVA PERFECTA!');
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

  /** Runs in foot mode BEFORE Player.update so animations stay in sync. */
  update(dt: number, input: Input, dialogueActive: boolean, dead: boolean): void {
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
      return;
    }

    // --- Blocking (RMB, melee only) ---
    const canBlock = !!weapon && weapon.kind !== 'bow' && p.grounded && p.stamina > 1 && p.attackT === 0 && !p.rolling;
    p.blocking = canBlock && input.rightDown;

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
    if (p.attackRecovery > 0 && input.leftPressed && this.comboWindowT > 0 && this.comboStep < 3) {
      this.bufferedNext = true; // recovery clicks keep the chain alive
      this.bufferedHeavy = false;
    }
    const chainReady = this.bufferedNext && this.comboWindowT > 0 && this.comboStep < 3;

    // --- Ground charge & release ---
    if (input.leftPressed && canActGround && !chainReady) {
      this.chargeT = 0;
      this.chargeConsumed = false;
    }
    if (this.chargeT >= 0 && input.leftDown && !this.chargeConsumed && p.grounded) {
      this.chargeT += dt;
      if (this.chargeT >= 0.28) {
        // Held long enough -> heavy attack fires immediately
        this.chargeConsumed = true;
        this.chargeT = -1;
        this.commitHeavy(weapon);
      }
    }
    if (this.chargeT >= 0 && !input.leftDown && !this.chargeConsumed) {
      // Quick click -> light attack (chain step if the window is open)
      this.chargeT = -1;
      if (canActGround) this.fireLight(weapon);
    }
    if (!input.leftDown) this.chargeT = -1;

    // --- Air inputs (Fase 11) ---
    if (canActAir && input.leftPressed) {
      this.fireAircut(weapon);
    }
    if (!p.grounded && !p.plunging && p.attackT === 0 && !p.swimming && p.airTime < 1.3) {
      // a HOLD in the air commits the plunge (the aerial heavy)
      if (input.leftDown) this.airChargeT += dt;
      else this.airChargeT = 0;
      if (this.airChargeT >= 0.2) {
        this.airChargeT = 0;
        this.firePlunge(weapon);
      }
      // air-dodge quickstep (C) — spends stamina, no height gain
      if (input.anyPressed('KeyC') && p.stamina >= 10 && !p.rolling) {
        p.beginRoll(0, 0, 'step');
        p.stamina -= 10;
        this.hooks.sound('swing');
      }
    } else {
      this.airChargeT = 0;
    }

    // --- Chain execution: the buffered click fires the next step the moment
    // the previous swing clears (late recovery counts — chains feel fluid)
    if (chainReady && canAct && (p.grounded ? p.attackRecovery <= 0.3 : p.airTime < 0.42)) {
      this.bufferedNext = false;
      const step = this.comboStep + 1;
      const heavy = this.bufferedHeavy;
      this.bufferedHeavy = false;
      this.startSwing(weapon, step >= 3 || heavy, step);
    }

    // --- Swing progression ---
    if (p.attackT > 0) {
      const wasAir = !p.grounded;
      p.attackT += dt / p.attackDur;
      const impactAt = p.attackKind === 'heavy' ? 0.55
        : p.attackKind === 'spin' ? 0.5
        : p.attackKind === 'uppercut' ? 0.62
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

  /** A quick click on the ground: light attack or chain step. */
  private fireLight(weapon: WeaponDef): void {
    const step = this.comboWindowT > 0 ? this.comboStep + 1 : 1;
    this.startSwing(weapon, false, Math.min(step, 3));
  }

  /** A committed heavy (held click or chain finisher slot). */
  private commitHeavy(weapon: WeaponDef): void {
    // route by movement intent: strafing -> spin, backpedal -> uppercut
    const { fwd, side } = this.moveIntentInput();
    const step = this.comboWindowT > 0 ? Math.min(this.comboStep + 1, 3) : 0;
    this.startSwing(weapon, true, step, Math.abs(side) > 0.55 && Math.abs(fwd) < 0.55
      ? 'spin'
      : fwd < -0.45 ? 'uppercut' : 'heavy');
  }

  private moveIntentInput(): { fwd: number; side: number } {
    // cached input at click time via the last moveIntent — kept separate so
    // charge-release reads exactly what the player was doing on release
    return this.lastIntent;
  }
  private lastIntent: { fwd: number; side: number } = { fwd: 0, side: 0 };
  /** Air heavy charge clock (hold-to-plunge). */
  private airChargeT = 0;

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
    this.comboLabel = 'AÉREO';
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
    this.comboLabel = '¡COLAPSO!';
    this.onCombatEvent?.('¡COLAPSO!');
    p.onAttackSwing?.();
  }

  /** Plunge landing: the AoE lands (called by Player.onPlungeImpact). */
  private plungeLand(): void {
    const p = this.player;
    const weapon = this.weapon;
    if (!weapon) return;
    const c = this.tmp.set(p.position.x, p.position.y + 0.1, p.position.z);
    this.vfx.landingDust(c.clone(), 16, 1.4);
    this.onCameraPunch?.(0.6);
    this.onHitStop?.(0.12);
    this.hooks.sound('hit_scale');
    // bandits: radial ring
    if (this.hooks.banditMeleeRadius) {
      const hits = this.hooks.banditMeleeRadius(p.position, weapon.reach * 1.15, 4);
      for (const h of hits) this.hooks.damageBandit?.(h.bandit, weapon.heavyDmg * this.pendingDmgMult, true);
      if (hits.length > 0) this.vfx.weaponImpact(hits[0].point);
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
    const { fwd, side } = this.moveIntentInput();
    let kindOverride = forceKind;
    if (!kindOverride && heavy) {
      kindOverride = Math.abs(side) > 0.55 && Math.abs(fwd) < 0.55 ? 'spin' : (fwd < -0.45 ? 'uppercut' : 'heavy');
    }
    const isFinisher = heavy && comboStep >= 2;
    const counter = (this.parryCounterT > 0 || this.dodgeCounterT > 0) && !heavy;
    this.comboStep = comboStep;
    this.comboWindowT = 1.15;
    this.swingIsFinisher = isFinisher || counter;
    this.pendingDmgMult = 1;
    if (comboStep === 1) this.pendingDmgMult = 1.1;        // second hit bites deeper
    if (comboStep === 2) this.pendingDmgMult = 1.18;
    if (isFinisher) this.pendingDmgMult = 1.3;             // chain finisher
    if (counter) this.pendingDmgMult = this.parryCounterT > 0 ? 1.6 : 1.5; // riposte!
    // weapon identity per the spec: each weapon moves differently
    let akind: string;
    if (kindOverride === 'spin') akind = 'spin';
    else if (kindOverride === 'uppercut') akind = 'uppercut';
    else if (weapon.kind === 'axe') akind = heavy ? 'heavy' : this.altLight();
    else if (weapon.kind === 'spear') akind = 'thrust';
    else akind = heavy ? 'heavy' : this.altLight();
    if (counter) akind = this.parryCounterT > 0 ? 'heavy' : 'spin'; // ripostes read BIG
    p.attackKind = akind as typeof p.attackKind;
    p.attackDur = heavy ? weapon.heavyDur : weapon.lightDur;
    if (akind === 'spin') {
      p.attackDur = weapon.heavyDur * 0.92;         // the whip-around is brisk
      this.swingIsMulti = true;
    } else if (akind === 'uppercut') {
      p.attackDur = weapon.heavyDur * 1.05;
      this.swingIsMulti = false;
    } else {
      this.swingIsMulti = false;
    }
    if (isFinisher) p.attackDur *= 1.12;                   // weighty finisher
    p.attackT = 0.001;
    this.swingHitDone = false;
    // label for the HUD
    this.comboLabel = counter
      ? (this.parryCounterT > 0 ? '¡CONTRAATAQUE!' : '¡RESPUESTA!')
      : akind === 'spin' ? 'GIRO 360°'
      : akind === 'uppercut' ? '¡LANZAMIENTO!'
      : isFinisher ? '¡REmate!' : '';
    if (counter) {
      this.comboLabel = this.parryCounterT > 0 ? '¡CONTRAATAQUE!' : '¡RESPUESTA ÁGIL!';
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
    const big = this.swingIsFinisher;
    const kind = p.attackKind;
    const multiArc = kind === 'spin' ? 2.75 : weapon.arc;

    // 1) Dragons — the big game (single query, untouched lane)
    const hit = this.hooks.dragonMelee(p.position, p.yaw, weapon.reach, multiArc);
    if (hit) {
      const final = hit.head ? dmg * 1.5 : dmg;
      this.hooks.damageDragon(hit.dragon, final, heavy);
      this.vfx.weaponImpact(hit.point);
      this.hooks.sound('hit_scale');
      if (big) this.onCameraPunch?.(0.4);
      return;
    }
    // 1.5) Fase 10/11 — bandits: multi sweeps for spins, nearest for the rest
    if (this.hooks.banditMelee) {
      if (this.swingIsMulti && this.hooks.banditMeleeMulti) {
        const hits = this.hooks.banditMeleeMulti(p.position, p.yaw, weapon.reach, multiArc, 3);
        if (hits.length > 0) {
          for (const h of hits) this.hooks.damageBandit?.(h.bandit, dmg, heavy);
          this.vfx.weaponImpact(hits[0].point);
          this.hooks.sound(big ? 'hit_scale' : 'damage');
          if (big) {
            this.onCameraPunch?.(0.5);
            this.onHitStop?.(0.08);
          }
          return;
        }
      } else {
        const bHit = this.hooks.banditMelee(p.position, p.yaw, weapon.reach, multiArc);
        if (bHit) {
          this.hooks.damageBandit?.(bHit.bandit, dmg, heavy);
          this.vfx.weaponImpact(bHit.point);
          this.hooks.sound(big ? 'hit_scale' : 'damage');
          if (big) {
            this.onCameraPunch?.(0.5);
            this.onHitStop?.(0.08);
          }
          return;
        }
      }
    }
    // 2) Boarding pirates
    if (this.hooks.crewHit(p.position, p.yaw, dmg, weapon.reach, multiArc)) {
      this.hooks.sound(big ? 'hit_scale' : 'damage');
      if (big) this.onCameraPunch?.(0.5);
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
          this.hooks.notify('info', 'Sin flechas', 'No te quedan flechas. Se recuperan de fallidos y los drakelings las llevan.');
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
      this.hooks.notify('info', 'Arma no adquirida', 'Aún no llevas esa arma. Explora Eldoria y completa misiones.');
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
  }
}
