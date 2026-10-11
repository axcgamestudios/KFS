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

/** Slot order for keys 1-4. */
export const WEAPON_SLOTS = ['espada_eirik', 'hacha_orden', 'lanza_caza', 'arco_naufragio'];

export interface CombatHooks {
  sound(kind: Parameters<import('./AudioSystem').AudioSystem['playEvent']>[0]): void;
  notify(kind: 'info' | 'item', title: string, body?: string): void;
  /** Melee query against dragons. */
  dragonMelee(origin: THREE.Vector3, yaw: number, reach: number, arc: number):
    { dragon: Dragon; head: boolean; point: THREE.Vector3 } | null;
  damageDragon(dragon: Dragon, amount: number, heavy: boolean): void;
  /** Boarding crew query — returns true when someone was struck. */
  crewHit(origin: THREE.Vector3, yaw: number, dmg: number, reach: number, arc: number): boolean;
  /** Training dummy — returns XP granted when struck. */
  dummyHit(origin: THREE.Vector3, yaw: number): boolean;
  /** Camera aim ray for the bow. */
  aimRay(): { origin: THREE.Vector3; dir: THREE.Vector3 };
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
 * Fase 9 — CINEMATIC COMBAT (PDF §4): 3-hit combo chains (light → light →
 * heavy finisher) with buffered inputs and chain windows, PARRY (perfect
 * block within 0.19 s) that staggers attackers and opens a ×1.6 counter
 * window, hit knockback, and camera punches on decisive blows.
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

  // ---- Fase 9: combo chain state ----
  /** Position in the chain (0 = fresh, 1 = second hit, 2 = finisher). */
  private comboStep = 0;
  /** Seconds left to continue the chain before it resets. */
  private comboWindowT = 0;
  /** Attack clicked during the swing tail/recovery → fires when possible. */
  private bufferedNext = false;
  /** Counter window after a parry: next melee ×1.6 + camera punch. */
  private parryCounterT = 0;
  /** Damage multiplier queued by the current swing (combo/counter). */
  private pendingDmgMult = 1;
  /** True while the current swing is a chain FINISHER (bigger feedback). */
  private swingIsFinisher = false;

  /** Fase 9 — camera punch hook (Game wires this to the CameraRig FOV kick). */
  onCameraPunch?: (intensity: number) => void;

  /** Combo state for the HUD (null when no chain running). */
  get comboHud(): { step: number; window: number; counter: boolean } | null {
    if (this.comboWindowT <= 0 || this.comboStep <= 0) return null;
    return { step: this.comboStep, window: this.comboWindowT, counter: this.parryCounterT > 0 };
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
    // callback the Game may have installed (crew stagger, HUD…).
    const prevOnParry = player.onParry;
    player.onParry = (fx: number, fz: number) => {
      prevOnParry?.(fx, fz);
      this.parryCounterT = 1.35;
      this.hooks.sound('block');
      this.onCameraPunch?.(0.55);
      this.vfx.weaponImpact(new THREE.Vector3(fx, player.position.y + 1.25, fz));
    };
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
    return WEAPON_SLOTS.map((id, i) => ({
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
    return ITEMS_NAME_LOOKUP[id] ?? id;
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
        this.switchTo(WEAPON_SLOTS[i]);
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

    // --- Dodge roll (C) ---
    if (input.anyPressed('KeyC') && p.grounded && !p.rolling && p.stamina >= 20 && !p.swimming) {
      // Roll along the current movement direction (camera relative)
      let ix = 0;
      let iz = 0;
      if (input.isDown('forward')) iz += 1;
      if (input.isDown('back')) iz -= 1;
      if (input.isDown('left')) ix -= 1;
      if (input.isDown('right')) ix += 1;
      if (ix !== 0 || iz !== 0) {
        const len = Math.hypot(ix, iz);
        ix /= len; iz /= len;
        const fx = Math.sin(this.camYaw);
        const fz = Math.cos(this.camYaw);
        p.beginRoll(fx * iz - fz * ix, fz * iz + fx * ix);
      } else {
        p.beginRoll(0, 0); // rolls backward
      }
      p.stamina -= 20;
      this.hooks.sound('swing');
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

    // --- Melee charge & release (Fase 9: combo chains) ---
    // Chain timers
    if (this.comboWindowT > 0) {
      this.comboWindowT -= dt;
      if (this.comboWindowT <= 0) {
        this.comboStep = 0;
        this.bufferedNext = false;
      }
    }
    if (this.parryCounterT > 0) this.parryCounterT -= dt;

    const canAct = p.attackT === 0 && !p.rolling && p.grounded;
    // A click during the swing tail or the recovery queues the chain step
    if (
      input.leftPressed && this.comboWindowT > 0 && this.comboStep < 2
      && (p.attackT > 0.45 || p.attackRecovery > 0)
    ) {
      this.bufferedNext = true;
    }
    const chainReady = this.bufferedNext && this.comboWindowT > 0 && this.comboStep < 2;

    if (input.leftPressed && canAct && p.attackRecovery <= 0 && !chainReady) {
      this.chargeT = 0;
      this.chargeConsumed = false;
    }
    if (this.chargeT >= 0 && input.leftDown && !this.chargeConsumed) {
      this.chargeT += dt;
      if (this.chargeT >= 0.28) {
        // Held long enough → heavy attack fires immediately
        this.chargeConsumed = true;
        this.comboStep = 0;         // a committed heavy resets the chain
        this.comboWindowT = 0;
        this.bufferedNext = false;
        this.startSwing(weapon, true, 0);
        this.chargeT = -1;
      }
    }
    if (this.chargeT >= 0 && !input.leftDown && !this.chargeConsumed) {
      // Quick click → light attack (chain step if the window is open)
      this.chargeT = -1;
      this.startSwing(weapon, false, this.comboWindowT > 0 ? this.comboStep : 0);
    }
    if (!input.leftDown) this.chargeT = -1;

    // Chain execution: the buffered click fires the next step the moment the
    // previous swing clears (late recovery counts — chains feel fluid)
    if (chainReady && canAct && p.attackRecovery <= 0.3) {
      this.bufferedNext = false;
      const step = this.comboStep + 1;
      // Step 2 = the cinematic finisher: a heavy blow with extra weight
      this.startSwing(weapon, step >= 2, step);
    }

    // --- Swing progression ---
    if (p.attackT > 0) {
      p.attackT += dt / p.attackDur;
      const impactAt = p.attackKind === 'heavy' ? 0.55 : 0.45;
      if (!this.swingHitDone && p.attackT >= impactAt) {
        this.swingHitDone = true;
        this.resolveMeleeHit(weapon, p.attackKind === 'heavy');
      }
      if (p.attackT >= 1) {
        p.attackT = 0;
        // Chained swings recover faster — the rhythm keeps rolling
        p.attackRecovery = weapon.recovery * (this.comboStep > 0 && this.comboWindowT > 0 ? 0.5 : 1);
      }
    }
  }

  private camYaw = 0;
  setCameraYaw(yaw: number): void {
    this.camYaw = yaw;
  }

  // ---------------------------------------------------------------- melee

  private startSwing(weapon: WeaponDef, heavy: boolean, comboStep = 0): void {
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
    // Fase 9 — combo bookkeeping: damage weight + the chain window
    const isFinisher = heavy && comboStep >= 2;
    const counter = this.parryCounterT > 0 && !heavy;
    this.comboStep = comboStep;
    this.comboWindowT = 1.05;
    this.swingIsFinisher = isFinisher || counter;
    this.pendingDmgMult = 1;
    if (comboStep === 1) this.pendingDmgMult = 1.1;        // second hit bites deeper
    if (isFinisher) this.pendingDmgMult = 1.3;             // chain finisher
    if (counter) {
      this.pendingDmgMult = 1.6;                           // parry counter!
      this.parryCounterT = 0;
      this.onCameraPunch?.(0.7);
    } else if (isFinisher) {
      this.onCameraPunch?.(0.45);
    }
    p.attackDur = heavy ? weapon.heavyDur : weapon.lightDur;
    if (isFinisher) p.attackDur *= 1.12;                   // weighty finisher
    p.attackT = 0.001;
    this.swingHitDone = false;
    // Animation variant per weapon & swing
    if (weapon.kind === 'axe') p.attackKind = heavy ? 'heavy' : this.altLight();
    else if (weapon.kind === 'spear') p.attackKind = heavy ? 'thrust' : 'thrust';
    else p.attackKind = heavy ? 'heavy' : this.altLight();
    if (counter) p.attackKind = 'heavy';                   // the riposte reads big
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
    dmg *= this.pendingDmgMult;      // Fase 9 — combo/counter weight
    const big = this.swingIsFinisher;

    // 1) Dragons — the big game
    const hit = this.hooks.dragonMelee(p.position, p.yaw, weapon.reach, weapon.arc);
    if (hit) {
      const final = hit.head ? dmg * 1.5 : dmg;
      this.hooks.damageDragon(hit.dragon, final, heavy);
      this.vfx.weaponImpact(hit.point);
      this.hooks.sound('hit_scale');
      if (big) this.onCameraPunch?.(0.4);
      return;
    }
    // 2) Boarding pirates
    if (this.hooks.crewHit(p.position, p.yaw, dmg, weapon.reach, weapon.arc)) {
      this.hooks.sound(big ? 'hit_scale' : 'damage');
      if (big) this.onCameraPunch?.(0.5);
      return;
    }
    // 3) Training dummy (needs to face it & be close)
    if (this.hooks.dummyHit(p.position, p.yaw)) {
      this.hooks.sound('damage');
    }
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
      // Released (or interrupted) → fire if meaningfully drawn
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
      // Terrain hit → stick (some can be recovered); over open water the
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
