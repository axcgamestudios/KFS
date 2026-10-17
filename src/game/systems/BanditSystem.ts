import * as THREE from 'three';
import { KnightModelGLB } from '../entities/KnightModelGLB';
import type { AssetSystem } from '../world/AssetSystem';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { KitSystem } from '../world/KitSystem';
import { buildHeroSword } from '../world/HeroSword';
import { damp, dampAngle } from '../core/MathUtils';

/**
 * Fase 10 — BanditSystem: RED KNIGHT bandits roaming set zones of the map.
 *
 * The Order's discipline gone rotten: deserters and road-wolves wearing
 * oxidised crimson plate. Every camp is 3 swords + 1 captain (taller, cloaked,
 * more health). They patrol their camp, spot the player at ~16 m, chase and
 * swing real melee attacks (dodgeable, blockable, parryable through the
 * player's own takeHit), and drop coins/potions. Camps respawn slowly so the
 * roads stay dangerous without ever becoming a grind.
 *
 * Fase 11 — CHOREOGRAPHED FIGHTS (the Spider-Man-grade combat spec):
 *  · ATTACK TOKENS: at most 2 bandits press the attack at once; everyone
 *    else holds a ring around the player and strafes for an opening —
 *    no more 4-on-1 blender
 *  · GUARD: when the hero's blade whistles past (a whiff), nearby bandits
 *    snap into a weapon-up guard that soaks light hits (sparks + clang);
 *    heavies smash it open
 *  · UNBLOCKABLE captain heavies: the guard does nothing — those MUST be
 *    dodged (Player.takeHit(opts.unblockable) breaks the stance)
 *  · PHYSICAL reactions: every landed hit shoves the bandit back a step
 *    (they stumble, they don't just flash)
 *  · REMATES: a bandit under 30% HP (captain 35%) can be executed with E —
 *    a short hit-stop, a heavy hero swing and a clean kill
 *  · first-contact help: the opening scrape of a fight prints the controls
 */

export interface BanditHooks {
  playerDamage: (dmg: number, fromX?: number, fromZ?: number, reason?: string, opts?: { unblockable?: boolean }) => void;
  sound: (kind: 'swing' | 'damage' | 'hit_scale' | 'block' | 'stagger' | 'bow_release' | 'thunder' | 'roar_big' | 'boss_die') => void;
  notify: (kind: 'info' | 'item' | 'quest', title: string, body?: string) => void;
  giveXp: (xp: number) => void;
  addCoins: (n: number) => void;
  weaponImpact: (pos: THREE.Vector3) => void;
  blockSparks: (pos: THREE.Vector3) => void;
  cameraShake: (i: number) => void;
  hitStop: (dur: number) => void;
  /** Fase 12 — a bandit died (kill streaks + bounty counters). */
  onBanditKilled?: (captain: boolean) => void;
  /** Fase 17 — a thrown bandit crashed (AoE splash + screenshake). */
  onThrownCrash?: (pos: THREE.Vector3, victims: number) => void;
  /** Fase 22 — THE FORGE: legend loot + persistence + the boss bar. */
  addItem?: (id: string, count: number) => void;
  hasFlag?: (flag: string) => boolean;
  setFlag?: (flag: string) => void;
  bossHud?: (state: { name: string; title: string; hp: number; maxHp: number; phase: number } | null) => void;
}

interface CampDef {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

/** Four hand-placed camps guarding roads and POI approaches. */
const CAMPS: CampDef[] = [
  { id: 'camp_camino', name: 'King\'s Road Ambush', x: 62, z: 58, radius: 10 },
  { id: 'camp_vaelthara', name: 'Wolves of Vaelthara', x: -206, z: -112, radius: 11 },
  { id: 'camp_vigilias', name: 'The Red Crow\'s Crag', x: -118, z: -232, radius: 10 },
  { id: 'camp_costa', name: 'West Coast Corsairs', x: -286, z: 170, radius: 11 },
];

/** Fase 17 — the bandit cast per the combat spec:
 *  · thief  — fast cutthroat, quick white-glow lights
 *  · heavy  — armoured axe-and-board bruiser, slow YELLOW heavies
 *  · shooter— musket skirmisher, keeps range, BLUE unblockable volleys
 *  · captain— elite foreman, mixed attacks + the finisher window. */
export type BanditRole = 'thief' | 'heavy' | 'shooter' | 'captain';

interface RoleDef {
  hp: number;
  damage: number;
  aggroRadius: number;
  chaseSpeed: number;
  poise: boolean;           // light hits never stagger him
  meleeCooldown: [number, number];
}
const ROLE_DEFS: Record<BanditRole, RoleDef> = {
  thief:   { hp: 58,  damage: 11, aggroRadius: 17, chaseSpeed: 4.7, poise: false, meleeCooldown: [0.9, 1.5] },
  heavy:   { hp: 118, damage: 22, aggroRadius: 16, chaseSpeed: 3.1, poise: true,  meleeCooldown: [1.5, 2.3] },
  shooter: { hp: 62,  damage: 17, aggroRadius: 19, chaseSpeed: 3.8, poise: false, meleeCooldown: [2.6, 3.4] },
  captain: { hp: 135, damage: 20, aggroRadius: 20, chaseSpeed: 3.9, poise: true,  meleeCooldown: [0.9, 1.4] },
};

// ---- Fase 22 — THE FORGE OF LEGENDS: the named bosses + their guards ----

export interface LegendDrop { id: string; count: number; chance?: number }

export interface LegendDef {
  id: string;
  name: string;
  title: string;
  role: BanditRole;
  hp: number;
  damage: number;
  x: number; z: number;
  aggroRadius: number;
  chaseSpeed: number;
  /** Visual scale + armour tint (HSL) + eye glow. */
  scale: number;
  tint: { h: number; s: number; l: number };
  eyes: number;
  /** A brimmed hat (pirate king) or a conical kasa (ronin). */
  hat: 'tricorn' | 'kasa' | 'none';
  drops: LegendDrop[];
  lootGold: number;
  xp: number;
  deathFlag: string;
  /** Bosses chase twice as far before losing interest. */
  boss: boolean;
  intro: [string, string];
}

/** The two legends whose catalysts feed the Anvil of the Titans and the
 *  Stormplate — plus the temple guardians patrolling the Mist Isles. */
export const LEGENDS: LegendDef[] = [
  {
    id: 'rey_pirata', name: 'The Pirate King', title: 'Lord of the Crow Fortress',
    role: 'captain', hp: 620, damage: 26,
    x: -536, z: -455, aggroRadius: 22, chaseSpeed: 4.1,
    scale: 1.14, tint: { h: 0.07, s: 0.5, l: 0.2 }, eyes: 0xffd24a,
    hat: 'tricorn',
    drops: [
      { id: 'espada_rey_pirata', count: 1 },
      { id: 'sombrero_rey', count: 1 },
    ],
    lootGold: 420, xp: 320,
    deathFlag: 'rey_pirata_dead', boss: true,
    intro: ['THE PIRATE KING', '"A hundred boardings, and the hat never fell. Bring your best steel, Warden — the Anvil of the Titans is counting on you losing it."'],
  },
  {
    id: 'ronin_tormenta', name: 'The Storm Ronin', title: 'Keeper of the Mist Temple',
    role: 'heavy', hp: 520, damage: 30,
    x: -12, z: 616, aggroRadius: 24, chaseSpeed: 4.4,
    scale: 1.08, tint: { h: 0.58, s: 0.42, l: 0.17 }, eyes: 0x48c8e8,
    hat: 'kasa',
    drops: [
      { id: 'nucleo_tormenta', count: 1 },
      { id: 'seda_sombras', count: 2 },
    ],
    lootGold: 340, xp: 280,
    deathFlag: 'ronin_tormenta_dead', boss: true,
    intro: ['THE STORM RONIN', 'A masterless blade the tempest never put down. The glass core in his chest ticks like a clock made of thunder.'],
  },
];

/** Temple guardians patrolling the Mist Isles — the wakizashi's source. */
const SAMURAI_SPOTS: Array<{ x: number; z: number }> = [
  { x: -38, z: 610 }, { x: 6, z: 632 }, { x: -8, z: 663 },
];

export interface SamuraiDef {
  hp: number;
  damage: number;
  wakizashiChance: number;
  silkChance: number;
}
export const SAMURAI_DEF: SamuraiDef = { hp: 88, damage: 15, wakizashiChance: 0.1, silkChance: 0.35 };

/** Telegraph glow colours (the danger-signal system). */
const GLOW_WHITE = new THREE.Color(0.92, 0.92, 0.95);
const GLOW_RED = new THREE.Color(1.0, 0.16, 0.1);
const GLOW_YELLOW = new THREE.Color(1.0, 0.82, 0.1);
const GLOW_BLUE = new THREE.Color(0.22, 0.62, 1.0);

/** HP fraction under which the REMATE prompt lights up. */
const FINISHER_HP_FRAC = 0.3;
const CAPTAIN_FINISHER_HP_FRAC = 0.35;

type BanditState = 'patrol' | 'chase' | 'hold' | 'attack' | 'aim' | 'stagger' | 'dead';

class Bandit {
  readonly group = new THREE.Group();
  model: KnightModelGLB | null = null;
  state: BanditState = 'patrol';
  hp: number;
  maxHp: number;
  readonly captain: boolean;
  readonly role: BanditRole;
  readonly camp: CampDef;
  private campIndex: number;
  private angle = Math.random() * Math.PI * 2;
  private anchor = new THREE.Vector3();
  private target = new THREE.Vector3();
  private yaw = Math.random() * Math.PI * 2;
  private speedSm = 0;
  private phase = Math.random() * 8;
  private attackT = 0;
  private attackKind: 'light1' | 'light2' | 'heavy' = 'light1';
  private attackDur = 0.75;
  /** Post-swing cooldown (s) — the token system reads it (Fase 11). */
  attackCooldown = 0;
  private hitDone = false;
  private staggerT = 0;
  /** Fase 22 — public: legend corpses spawn with a preset death clock. */
  deathT = 0;
  respawnT = 0;
  private moving = false;
  /** Fase 22 — public: the system loop reads it for the legend boss bar. */
  aggro = false;
  private idlePause = 2 + Math.random() * 3;
  readonly pos = new THREE.Vector3();

  // ---- Fase 17 — the choreography states ----
  /** AIRBORNE: launched / juggled / grabbed — no AI, physics owns him. */
  airborne = false;
  airVy = 0;
  throwVX = 0;
  throwVZ = 0;
  thrown = false;
  /** Grabbed by the rope: parked at the whirl point every frame. */
  grabbed = false;
  /** Flat on his back (ground slam, whirlwind, crash landing). */
  knockdownT = 0;
  /** VAULTED: back turned to the player — bonus damage, no attacks. */
  backTurnedT = 0;
  /** Musket aim progress 0..1 (shooters only, BLUE telegraph). */
  aimT = 0;
  /** Telegraph glow sprite above the head (lazily built). */
  glow: THREE.Sprite | null = null;

  // ---- Fase 22 — THE FORGE OF LEGENDS ----
  /** Named boss config (Pirate King / Storm Ronin) — no respawn, boss bar,
   *  guaranteed catalyst loot. */
  legend: LegendDef | null = null;
  /** Fase 22 — the legend's intro card has played (per session). */
  legendIntroduced = false;
  /** Mist Isles temple guardian — wakizashi/silk drops, no camp. */
  samurai = false;
  /** DoT status (burn from embers/sunlight, poison from arrows). */
  statusKind: 'burn' | 'poison' | null = null;
  statusT = 0;
  private statusTick = 0;
  /** Fase 22 — died to a DoT tick this frame (the system routes loot). */
  dotKilled = false;

  // ---- Fase 11 — choreography state ----
  /** Weapon-up guard timer (raised after a hero whiff nearby). */
  guardT = 0;
  /** Hit knockback impulse (world), decays fast. */
  knockX = 0;
  knockZ = 0;
  knockT = 0;
  /** This bandit currently owns one of the attack slots. */
  hasToken = false;
  /** Orbit direction on the ring (+1/-1) — assigned per camp slot. */
  ringSide = 1;
  /** Feint timer: a fake lunge from the ring to keep the hero honest. */
  private feintT = 0;
  private feintCd = 3 + Math.random() * 5;

  constructor(campIndex: number, camp: CampDef, captain: boolean, seed: number, role?: BanditRole) {
    this.camp = camp;
    this.captain = captain;
    this.role = role ?? (captain ? 'captain' : 'thief');
    this.campIndex = campIndex;
    const def = ROLE_DEFS[this.role];
    this.maxHp = def.hp;
    this.hp = this.maxHp;
    this.aggroRadius = def.aggroRadius;
    this.damage = def.damage;
    this.chaseSpeed = def.chaseSpeed;
    this.poise = def.poise;
    this.meleeCooldown = def.meleeCooldown;
    this.anchor.set(camp.x, 0, camp.z);
    void seed;
    this.ringSide = Math.random() < 0.5 ? 1 : -1;
    this.pickPatrolTarget();
  }

  /** Fase 22 — no longer readonly: legends and samurais are spawned with
   *  bespoke stats after construction. */
  aggroRadius: number;
  damage: number;
  chaseSpeed: number;
  poise: boolean;
  private readonly meleeCooldown: [number, number];

  get indexSeed(): number {
    return this.campIndex;
  }

  /** Seconds until a YELLOW heavy lands (HUD parry cue). */
  get heavyLeft(): number {
    if (this.state !== 'attack' || this.attackKind !== 'heavy') return Infinity;
    return Math.max(0, (0.55 - this.attackT) * this.attackDur);
  }

  /** Seconds until the BLUE volley cracks (HUD dodge cue). */
  get aimLeft(): number {
    if (this.state !== 'aim') return Infinity;
    return (1 - this.aimT) * 1.15;
  }

  private pickPatrolTarget(): void {
    this.angle += 0.6 + Math.random() * 1.4;
    const r = 2.5 + Math.random() * (this.camp.radius - 2);
    this.target.set(
      this.camp.x + Math.cos(this.angle) * r,
      0,
      this.camp.z + Math.sin(this.angle) * r,
    );
  }

  get alive(): boolean {
    return this.state !== 'dead' || this.respawnT > 0;
  }

  get dead(): boolean {
    return this.state === 'dead';
  }

  /** Centre of the torso for hit tests. */
  center(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.15, this.pos.z);
  }

  get aggroed(): boolean {
    return this.aggro && !this.dead;
  }

  /** Fase 12 — ambush spawns come in already hunting. */
  forceAggro(): void {
    this.aggro = true;
  }

  /** Fase 22 — apply a damage-over-time status (burn / poison). */
  applyStatus(kind: 'burn' | 'poison', dur: number): void {
    // burn replaces poison and vice-versa; same kind refreshes
    this.statusKind = kind;
    this.statusT = Math.max(this.statusT, dur);
  }

  /** Can the player execute a REMATE on this bandit right now? */
  get finisherable(): boolean {
    if (this.dead || this.respawnT > 0) return false;
    const frac = this.hp / this.maxHp;
    return frac <= (this.captain ? CAPTAIN_FINISHER_HP_FRAC : FINISHER_HP_FRAC);
  }

  takeDamage(amount: number, heavy: boolean, fromX?: number, fromZ?: number, opts?: { guardBreak?: boolean; forceStagger?: boolean }): { died: boolean; guarded: boolean } {
    if (this.dead) return { died: false, guarded: false };
    let guarded = false;
    let dealt = amount;
    // Fase 17 — exposed states bleed: back-turned (vault) ×1.5, floored ×1.25
    if (this.backTurnedT > 0) dealt *= 1.5;
    else if (this.knockdownT > 0) dealt *= 1.25;
    // Fase 11 — the guard soaks LIGHT hits (sparks + clang); heavies smash it
    // Fase 22 — BOKKEN and GOLIATH break the guard outright: a raised weapon
    // is posture, and these two are hammers against posture
    if (this.guardT > 0 && !heavy && !opts?.guardBreak && this.backTurnedT <= 0 && !this.airborne) {
      guarded = true;
      dealt = amount * 0.35;
      this.guardT = Math.min(this.guardT, 0.3); // the guard buckles a little
    } else if (this.guardT > 0 && opts?.guardBreak) {
      this.guardT = 0; // the stance shatters
    }
    this.hp -= dealt;
    this.aggro = true;
    // Fase 17 — a hit on an airborne bandit POPs him back up (juggle!)
    if (this.airborne && !this.grabbed) {
      this.airVy = Math.max(this.airVy, 1.8);
    }
    // physical reaction: every landed hit shoves the bandit a step back
    if (fromX !== undefined && fromZ !== undefined && !this.airborne) {
      const dx = this.pos.x - fromX;
      const dz = this.pos.z - fromZ;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        const power = heavy ? 3.6 : 2.4;
        this.knockX = (dx / len) * power;
        this.knockZ = (dz / len) * power;
        this.knockT = 0.24;
      }
    } else if (!this.airborne) {
      this.knockX = this.knockZ = 0;
      this.knockT = 0.2;
    }
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deathT = 0;
      // Fase 22 — legends fall ONCE: no respawn, the corpse remains where
      // it dropped (the fortress keeps its dead king; the isles their ronin)
      this.respawnT = this.legend ? Number.POSITIVE_INFINITY : 360 + Math.random() * 120;
      this.attackT = 0;
      this.airborne = false;
      this.grabbed = false;
      this.setGlow(null);
      return { died: true, guarded };
    }
    // Fase 22 — a forced stagger (bokken solid strikes) reads like a stun
    if (opts?.forceStagger && !this.airborne) {
      this.staggerT = Math.max(this.staggerT, 0.85);
    }
    // poise roles (heavy / captain) don't stagger on light hits — and NOBODY
    // staggers out of the air (the juggle would die instantly)
    if ((heavy || !this.poise) && this.guardT <= 0 && !this.airborne) {
      this.state = 'stagger';
      this.staggerT = this.poise && heavy ? 0.55 : 0.42;
      this.attackT = 0;
    }
    return { died: false, guarded };
  }

  /** Instant kill used by the REMATE (the blow itself is the hero's anim). */
  execute(hooks: BanditHooks): void {
    if (this.dead) return;
    this.hp = 0;
    this.state = 'dead';
    this.deathT = 0;
    this.respawnT = 360 + Math.random() * 120;
    this.attackT = 0;
    this.guardT = 0;
    this.airborne = false;
    this.grabbed = false;
    this.setGlow(null);
    hooks.sound('hit_scale');
    hooks.cameraShake(this.captain ? 0.55 : 0.35);
    hooks.hitStop(0.14);
  }

  // ------------------------------------------------- Fase 17 combat API

  /** AIR LAUNCH: fling him skyward — the juggle begins. */
  launch(vy: number): void {
    if (this.dead) return;
    this.airborne = true;
    this.grabbed = false;
    this.airVy = vy;
    this.attackT = 0;
    this.aimT = 0;
    this.state = 'stagger';
    this.staggerT = 99; // held until the landing resolves it
    this.knockX = this.knockZ = 0;
    this.guardT = 0;
    this.setGlow(null);
  }

  /** Juggle pop: keep him floating while the dance continues. */
  jugglePop(): void {
    if (this.airborne && !this.dead) this.airVy = Math.max(this.airVy, 1.7);
  }

  /** Rope grab: park him at the whirl point (CombatSystem drives it). */
  holdAt(x: number, y: number, z: number): void {
    if (this.dead) return;
    this.grabbed = true;
    this.airborne = true;
    this.airVy = 0;
    this.pos.set(x, y - 0.9, z);
    this.state = 'stagger';
    this.staggerT = 99;
  }

  /** The throw: a ballistic arc that detonates where he lands. */
  throwFrom(dirX: number, dirZ: number, power: number): void {
    if (this.dead) return;
    this.grabbed = false;
    this.airborne = true;
    this.thrown = true;
    this.airVy = 4.6;
    this.throwVX = dirX * power;
    this.throwVZ = dirZ * power;
    this.state = 'stagger';
    this.staggerT = 99;
  }

  /** Flat on his back for a beat (slam / whirlwind / crash). */
  knockdown(dur: number): void {
    if (this.dead) return;
    if (this.airborne) return; // he'll fold on landing
    this.knockdownT = Math.max(this.knockdownT, dur);
    this.attackT = 0;
    this.aimT = 0;
    this.state = 'stagger';
    this.staggerT = Math.max(this.staggerT, dur);
    this.setGlow(null);
  }

  /** VAULT: back turned, wide open. */
  turnBack(dur: number): void {
    if (this.dead) return;
    this.backTurnedT = Math.max(this.backTurnedT, dur);
    this.attackT = 0;
    this.aimT = 0;
    this.setGlow(null);
  }

  /** Rope-dart yank toward the player (light ones only). */
  pull(dx: number, dz: number): void {
    if (this.dead || this.airborne) return;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    if (this.poise) {
      // heavies & captains dig in: only a stumble
      this.knockX = (-dx / len) * 2.2;
      this.knockZ = (-dz / len) * 2.2;
      this.knockT = 0.2;
    } else {
      this.knockX = (-dx / len) * 7.5;
      this.knockZ = (-dz / len) * 7.5;
      this.knockT = 0.3;
      this.state = 'stagger';
      this.staggerT = Math.max(this.staggerT, 0.5);
      this.attackT = 0;
    }
  }

  /** Telegraph glow: null hides it. */
  setGlow(color: THREE.Color | null, flash = 1): void {
    if (!this.glow) {
      if (!color) return;
      this.glow = Bandit.makeGlowSprite();
      this.glow.position.set(0, 2.42, 0);
      this.group.add(this.glow);
    }
    this.glow.visible = !!color;
    if (color) {
      (this.glow.material as THREE.SpriteMaterial).color.copy(color);
      (this.glow.material as THREE.SpriteMaterial).opacity = 0.55 + 0.45 * flash;
      const s = 0.5 + 0.16 * flash;
      this.glow.scale.set(s, s, 1);
    }
  }

  private static glowTexture(): THREE.CanvasTexture {
    if (!Bandit.GLOW_TEX) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d')!;
      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      Bandit.GLOW_TEX = new THREE.CanvasTexture(c);
    }
    return Bandit.GLOW_TEX;
  }
  private static GLOW_TEX: THREE.CanvasTexture | null = null;

  private static makeGlowSprite(): THREE.Sprite {
    return new THREE.Sprite(new THREE.SpriteMaterial({
      map: Bandit.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    terrain: TerrainHeight,
    playerVulnerable: boolean,
    hooks: BanditHooks,
    /** Fase 14 — true cuando está lejos: la IA sigue (barata) pero la pose
     *  del caballero se congela (dt 0) — el álgebra de huesos es lo caro. */
    farAnim = false,
    /** Fase 22 — sight multiplier (the Temple Shadow Dō lends its silence). */
    detectionMult = 1,
  ): void {
    const g = this.group;

    if (this.state === 'dead') {
      this.deathT += dt;
      this.respawnT -= dt;
      // fall over, then sink into the ground and free the slot
      // (Fase 22 — legends NEVER sink: the corpse of a king stays)
      if (this.legend) {
        if (this.deathT < 0.55) {
          g.rotation.x = -Math.PI / 2 * Math.min(1, this.deathT / 0.55);
        }
        return;
      }
      if (this.deathT < 0.55) {
        g.rotation.x = -Math.PI / 2 * Math.min(1, this.deathT / 0.55);
        this.model?.update({ dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1 });
      } else if (this.deathT > 6) {
        const s = Math.max(0, 1 - (this.deathT - 6) / 2.2);
        g.position.y -= dt * 0.22;
        g.scale.setScalar(Math.max(0.01, s));
        if (this.deathT > 8.5) g.visible = false;
      }
      return;
    }

    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // --- Fase 22: DoT statuses tick (burn embers / poison blight) ---
    if (this.statusKind && this.statusT > 0) {
      this.statusT -= dt;
      this.statusTick -= dt;
      if (this.statusTick <= 0) {
        this.statusTick = 0.5;
        const dot = this.statusKind === 'burn' ? 3.2 : 2.1;
        this.hp -= dot;
        if (this.hp <= 0) {
          this.state = 'dead';
          this.deathT = 0;
          this.respawnT = this.legend ? Number.POSITIVE_INFINITY : 360 + Math.random() * 120;
          this.attackT = 0;
          this.setGlow(null);
          this.dotKilled = true; // the system grants loot/XP
          return;
        }
      }
      if (this.statusT <= 0) this.statusKind = null;
    }

    // --- perception (Fase 22: detectionMult — the Shadow Dō sees you later) ---
    const aggroR = this.aggroRadius * (detectionMult ?? 1);
    if (!this.aggro && dist < aggroR && Math.abs(playerPos.y - this.pos.y) < 6) {
      this.aggro = true;
      hooks.sound('swing'); // a bark as they draw steel
    }
    // leash: far from camp or player dead/dialog -> back to patrol
    // (Fase 22 — legends are bosses: they chase twice as far and never
    //  wander home while you still breathe in their sight)
    const leashDist = this.legend?.boss ? 58 : 34;
    const leashCamp = this.legend ? 120 : 46;
    if (this.aggro && (dist > leashDist || Math.hypot(this.pos.x - this.camp.x, this.pos.z - this.camp.z) > leashCamp)) {
      this.aggro = false;
      this.hasToken = false;
      this.pickPatrolTarget();
    }

    // --- timers (Fase 11/17) ---
    if (this.guardT > 0) this.guardT -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.knockT > 0) this.knockT = Math.max(0, this.knockT - dt);
    if (this.backTurnedT > 0) this.backTurnedT -= dt;

    // ================= Fase 17 — choreography states =================
    if (this.grabbed) {
      // the rope owns him: park at the whirl point, pose limp
      g.position.copy(this.pos);
      g.rotation.y = this.yaw;
      g.rotation.x = damp(g.rotation.x, -1.25, 10, dt);
      this.model?.update({ dt: farAnim ? 0 : dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1 });
      return;
    }
    if (this.airborne) {
      // ballistic: launched, juggled or thrown
      this.airVy -= 13.5 * dt;
      this.pos.y += this.airVy * dt;
      if (this.thrown) {
        this.pos.x += this.throwVX * dt;
        this.pos.z += this.throwVZ * dt;
        this.pos.x = THREE.MathUtils.clamp(this.pos.x, -1005, 1005);
        this.pos.z = THREE.MathUtils.clamp(this.pos.z, -1005, 1005);
      }
      const groundY = terrain.height(this.pos.x, this.pos.z);
      if (this.pos.y <= groundY) {
        this.pos.y = groundY;
        this.airborne = false;
        if (this.thrown) {
          // CRASH LANDING: the throw detonates where he lands (the system
          // reads pendingCrash and splashes the pack)
          this.thrown = false;
          this.pendingCrash = new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z);
          this.knockdownT = 1.35;
          this.staggerT = 1.35;
          this.state = 'stagger';
        } else {
          this.knockdownT = Math.max(this.knockdownT, 0.85);
          this.staggerT = this.knockdownT;
          this.state = 'stagger';
          hooks.sound('damage');
        }
        this.hasToken = false;
      } else {
        g.position.copy(this.pos);
        g.rotation.y = this.yaw;
        // on his back, spinning if he was hurled
        g.rotation.x = damp(g.rotation.x, this.thrown ? -1.5 : -1.15, 8, dt);
        if (this.thrown) g.rotation.y += dt * 9;
        this.model?.update({ dt: farAnim ? 0 : dt, speed: 0, moving: false, grounded: false, swimming: false, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1 });
        return;
      }
    }
    if (this.knockdownT > 0) {
      // flat on his back: the get-up reads clearly from any angle
      this.knockdownT -= dt;
      g.position.copy(this.pos);
      g.rotation.y = this.yaw;
      const lie = Math.min(1, this.knockdownT / 0.35);
      g.rotation.x = damp(g.rotation.x, -1.42 * lie, 12, dt);
      this.model?.update({ dt: farAnim ? 0 : dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1 });
      if (this.knockdownT <= 0) {
        this.staggerT = 0;
        this.state = 'chase';
        this.attackCooldown = Math.max(this.attackCooldown, 0.4);
      }
      return;
    }
    if (this.backTurnedT > 0) {
      // VAULTED: he lost the player — searches the wrong way, wide open
      g.position.copy(this.pos);
      this.yaw = dampAngle(this.yaw, Math.atan2(-dx, -dz), 6, dt);
      g.rotation.y = this.yaw;
      g.rotation.x = damp(g.rotation.x, 0, 10, dt);
      this.model?.update({ dt: farAnim ? 0 : dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0, blockT: 0, rollT: 0.12, bowDraw: -1 });
      return;
    }
    // ===================================================================

    // --- state logic ---
    let targetSpeed = 0;
    this.moving = false;

    if (this.state === 'stagger') {
      this.staggerT -= dt;
      if (this.staggerT <= 0) this.state = 'chase';
      this.setGlow(null);
    } else if (this.state === 'attack') {
      this.attackT += dt / this.attackDur;
      // --- the danger signal: WHITE builds, RED flashes at the perfect-
      //     dodge window; YELLOW marks the parryable heavies ---
      const impactK = this.attackKind === 'heavy' ? 0.55 : 0.45;
      if (this.attackKind === 'heavy') {
        this.setGlow(GLOW_YELLOW, 0.6 + 0.4 * Math.sin(this.attackT * 18));
      } else if (this.attackT > impactK - 0.34) {
        this.setGlow(GLOW_RED, 0.55 + 0.45 * Math.sin(this.attackT * 42));
      } else {
        this.setGlow(GLOW_WHITE, 0.5 + 0.5 * this.attackT);
      }
      // damage lands mid-swing if the player is still in range
      if (!this.hitDone && this.attackT >= impactK) {
        this.hitDone = true;
        if (playerVulnerable && dist < 2.7) {
          const facing = Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz;
          if (facing > 0) {
            // Fase 17 — bandit melee is blockable & parryable (Q); only the
            // musket volleys are unblockable (BLUE)
            hooks.playerDamage(this.damage, this.pos.x, this.pos.z, 'bandit');
          }
        }
      }
      if (this.attackT >= 1) {
        this.attackT = 0;
        this.state = 'chase';
        this.hasToken = false; // the slot frees up the moment the swing ends
        this.attackCooldown = this.meleeCooldown[0] + Math.random() * (this.meleeCooldown[1] - this.meleeCooldown[0]);
        this.setGlow(null);
      }
    } else if (this.state === 'aim') {
      // --- the musketeer: BLUE glow while the shot charges, then the crack ---
      this.aimT += dt / 1.15;
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);
      this.setGlow(GLOW_BLUE, 0.5 + 0.5 * this.aimT);
      if (dist < 3.2) {
        // rushed at the gun: he drops it and fights dirty
        this.aimT = 0;
        this.state = 'chase';
        this.attackCooldown = Math.max(this.attackCooldown, 0.5);
        this.setGlow(null);
      } else if (this.aimT >= 1) {
        this.aimT = 0;
        this.state = 'chase';
        this.hasToken = false;
        this.attackCooldown = this.meleeCooldown[0] + Math.random() * (this.meleeCooldown[1] - this.meleeCooldown[0]);
        this.setGlow(null);
        if (dist < 16 && playerVulnerable) {
          // the volley: UNBLOCKABLE — dodge or die (a roll through it is a
          // PERFECT DODGE: slow-mo + the counter window opens)
          hooks.playerDamage(this.damage, this.pos.x, this.pos.z, 'musket', { unblockable: true });
          hooks.weaponImpact(new THREE.Vector3(
            this.pos.x + Math.sin(this.yaw) * 0.9,
            this.pos.y + 1.35,
            this.pos.z + Math.cos(this.yaw) * 0.9,
          ));
          hooks.blockSparks(new THREE.Vector3(playerPos.x, playerPos.y + 1.2, playerPos.z));
          hooks.sound('bow_release');
        }
      }
    } else if (this.aggro && this.guardT <= 0) {
      this.state = 'chase';
      if (this.hasToken) {
        // ---- ATTACKER: close the distance and swing (or aim) ----
        const meleeRange = this.role === 'heavy' ? 2.35 : this.role === 'thief' ? 1.95 : 2.1;
        if (this.role === 'shooter' && dist > 4.5 && dist < 15 && this.attackCooldown <= 0) {
          // the musket takes the token at range
          this.state = 'aim';
          this.aimT = 0.001;
        } else if (dist < (this.role === 'shooter' ? 2.2 : meleeRange)) {
          if (this.attackCooldown <= 0) {
            this.state = 'attack';
            this.hitDone = false;
            this.attackT = 0.001;
            const roll = Math.random();
            if (this.role === 'heavy') {
              this.attackKind = roll < 0.6 ? 'heavy' : 'light1';
              this.attackDur = this.attackKind === 'heavy' ? 1.05 : 0.8;
            } else if (this.role === 'thief') {
              this.attackKind = roll < 0.5 ? 'light1' : 'light2';
              this.attackDur = 0.55;
            } else if (this.role === 'shooter') {
              this.attackKind = 'light1';
              this.attackDur = 0.6;
            } else {
              this.attackKind = roll < 0.35 ? 'heavy' : roll < 0.55 ? 'light2' : 'light1';
              this.attackDur = this.attackKind === 'heavy' ? 0.95 : 0.7;
            }
            hooks.sound('swing');
            this.yaw = Math.atan2(dx, dz); // square up for the blow
          } else {
            // token holder waiting on cooldown: circle menacingly
            this.state = 'hold';
          }
        } else {
          this.target.set(playerPos.x, 0, playerPos.z);
          targetSpeed = this.chaseSpeed;
          this.moving = true;
        }
      } else {
        // ---- HOLDER: the ring. No token -> orbit the player, shifting with
        // your ring side, feinting now and then. The pack reads like it is
        // taking turns — because it is. Shooters ring WIDE. ----
        this.state = 'hold';
        const ringR = this.role === 'shooter' ? 8.5 : this.role === 'heavy' ? 2.7 : 3.1;
        const nx = -dx / Math.max(0.001, dist);
        const nz = -dz / Math.max(0.001, dist);
        // tangential direction * ringSide
        const tx = -nz * this.ringSide;
        const tz = nx * this.ringSide;
        if (dist > ringR + 0.45) {
          this.target.set(playerPos.x + nx * ringR + tx * 0.8, 0, playerPos.z + nz * ringR + tz * 0.8);
          targetSpeed = 2.6;
          this.moving = true;
        } else if (dist < ringR - 0.5) {
          this.target.set(playerPos.x + nx * (ringR + 0.6) + tx * 0.8, 0, playerPos.z + nz * (ringR + 0.6) + tz * 0.8);
          targetSpeed = 2.4;
          this.moving = true;
        } else {
          // on the ring: sidestep along it
          this.target.set(this.pos.x + tx * 2.2, 0, this.pos.z + tz * 2.2);
          targetSpeed = 1.7;
          this.moving = true;
          // occasional feint — half a lunge, then back
          this.feintT -= dt;
          if (this.feintT <= 0 && this.feintCd <= 0) {
            this.feintT = 0.32;
            this.feintCd = 3 + Math.random() * 5;
          }
          if (this.feintT > 0) {
            this.target.set(playerPos.x, 0, playerPos.z);
            targetSpeed = 4.4;
          }
          this.feintCd -= dt;
        }
      }
    } else if (this.aggro && this.guardT > 0) {
      // guarding in place: face the hero, weapon up
      this.state = 'hold';
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
    } else {
      // patrol the camp
      this.state = 'patrol';
      const tdx = this.target.x - this.pos.x;
      const tdz = this.target.z - this.pos.z;
      const td = Math.hypot(tdx, tdz);
      if (td < 0.6) {
        this.idlePause -= dt;
        this.moving = false;
        if (this.idlePause <= 0) {
          this.idlePause = 1.5 + Math.random() * 3.5;
          this.pickPatrolTarget();
        }
      } else {
        this.moving = true;
        targetSpeed = 1.25;
      }
    }

    // --- steering + terrain ---
    const tdx = this.target.x - this.pos.x;
    const tdz = this.target.z - this.pos.z;
    const tdl = Math.hypot(tdx, tdz);
    if (this.moving && tdl > 0.01 && this.state !== 'attack' && this.state !== 'stagger') {
      const nx = tdx / tdl;
      const nz = tdz / tdl;
      this.speedSm = damp(this.speedSm, targetSpeed, 6, dt);
      this.pos.x += nx * this.speedSm * dt;
      this.pos.z += nz * this.speedSm * dt;
      this.yaw = dampAngle(this.yaw, Math.atan2(nx, nz), 8, dt);
    } else {
      this.speedSm = damp(this.speedSm, 0, 8, dt);
      if (this.aggro && dist < 7) {
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
      }
    }
    // hit knockback: a physical shove on top of the steering
    if (this.knockT > 0) {
      const k = this.knockT / 0.24;
      this.pos.x += this.knockX * k * dt * 4.2;
      this.pos.z += this.knockZ * k * dt * 4.2;
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -1005, 1005);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -1005, 1005);
    this.pos.y = terrain.height(this.pos.x, this.pos.z);
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    g.rotation.x = damp(g.rotation.x, 0, 10, dt);

    // --- animation ---
    this.phase += dt * (this.speedSm > 3.2 ? 8.6 : 5.4) * (this.moving ? 1 : 0);
    // shooters aim their musket like a bow (BLUE telegraph reads on the pose)
    const aimPose = this.state === 'aim' ? Math.min(1, this.aimT * 1.6) : -1;
    this.model?.update({
      dt: farAnim ? 0 : dt,
      speed: this.speedSm,
      moving: this.moving,
      grounded: true,
      swimming: false,
      attackT: this.attackT,
      attackKind: this.attackKind,
      // Fase 11 — the guard is a real weapon-up stance (block pose layer)
      blockT: this.guardT > 0 ? Math.min(1, this.guardT * 4) : 0,
      rollT: 0,
      bowDraw: aimPose,
    });
  }

  /** Fase 17 — set while a thrown bandit just crash-landed (the system
   *  detonates the AoE and clears it). */
  pendingCrash: THREE.Vector3 | null = null;

  /** The hero's blade just cut air near this bandit — snap to guard. */
  onPlayerWhiff(playerPos: THREE.Vector3): void {
    if (this.dead || !this.aggro) return;
    const d = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    if (d < 4.2 && this.state !== 'attack') {
      this.guardT = Math.max(this.guardT, 0.85);
    }
  }

  respawn(terrain: TerrainHeight): void {
    this.hp = this.maxHp;
    this.state = 'patrol';
    this.aggro = false;
    this.deathT = 0;
    this.attackT = 0;
    this.staggerT = 0;
    this.guardT = 0;
    this.hasToken = false;
    this.airborne = false;
    this.grabbed = false;
    this.thrown = false;
    this.knockdownT = 0;
    this.backTurnedT = 0;
    this.aimT = 0;
    this.pendingCrash = null;
    this.setGlow(null);
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.angle = Math.random() * Math.PI * 2;
    this.pickPatrolTarget();
    this.pos.set(this.camp.x, 0, this.camp.z);
    this.pos.y = terrain.height(this.pos.x, this.pos.z);
    this.group.position.copy(this.pos);
  }
}

export class BanditSystem {
  private bandits: Bandit[] = [];
  private scene: THREE.Scene;
  private terrain: TerrainHeight;
  private assets: AssetSystem;
  private kits: KitSystem | null;
  private hooks: BanditHooks;
  /** Alive bandits near a point (for the melee hook). */
  private tmpV = new THREE.Vector3();
  /** Fase 11 — one-time first-contact help (controls of the trade). */
  private helpShown = false;

  constructor(
    scene: THREE.Scene,
    terrain: TerrainHeight,
    assets: AssetSystem,
    kits: KitSystem | null,
    hooks: BanditHooks,
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.assets = assets;
    this.kits = kits;
    this.hooks = hooks;
    this.spawnAll();
  }

  private spawnAll(): void {
    let n = 0;
    for (let c = 0; c < CAMPS.length; c++) {
      const camp = CAMPS[c];
      // Fase 17 — the full cast per camp: cutthroat, bruiser, musketeer +
      // the captain (elite foreman). Four reads like a real ambush.
      const crew: Array<{ role: BanditRole; captain: boolean }> = [
        { role: 'thief', captain: false },
        { role: 'heavy', captain: false },
        { role: 'shooter', captain: false },
        { role: 'captain', captain: true },
      ];
      for (let i = 0; i < crew.length; i++) {
        const bandit = new Bandit(c, camp, crew[i].captain, c * 31 + i * 7, crew[i].role);
        const angle = (i / crew.length) * Math.PI * 2;
        bandit.pos.set(
          camp.x + Math.cos(angle) * 3.2,
          0,
          camp.z + Math.sin(angle) * 3.2,
        );
        bandit.pos.y = this.terrain.height(bandit.pos.x, bandit.pos.z);
        bandit.group.position.copy(bandit.pos);
        this.scene.add(bandit.group);
        this.bandits.push(bandit);
        this.attachVisual(bandit, crew[i].captain);
        n++;
      }
    }
    void n;
    this.spawnLegends();
  }

  /** Fase 22 — THE FORGE OF LEGENDS: the Pirate King (Crow Fortress), the
   *  Storm Ronin (Mist Isles) and three temple guardians. Legends already
   *  slain in the save spawn as permanent corpses (deathFlag). */
  private spawnLegends(): void {
    for (const def of LEGENDS) {
      const slain = this.hooks.hasFlag?.(def.deathFlag) === true;
      const camp: CampDef = { id: `legend_${def.id}`, name: def.name, x: def.x, z: def.z, radius: 8 };
      const b = new Bandit(9000 + LEGENDS.indexOf(def), camp, true, 777 + def.x, def.role);
      b.legend = def;
      b.maxHp = def.hp;
      b.hp = slain ? 0 : def.hp;
      b.aggroRadius = def.aggroRadius;
      b.damage = def.damage;
      b.chaseSpeed = def.chaseSpeed;
      b.poise = true;
      b.pos.set(def.x, this.terrain.height(def.x, def.z), def.z);
      b.group.position.copy(b.pos);
      if (slain) {
        b.state = 'dead';
        b.deathT = 10; // past the fall animation: an old corpse
        b.respawnT = Number.POSITIVE_INFINITY;
        b.group.rotation.x = -Math.PI / 2;
      }
      this.scene.add(b.group);
      this.bandits.push(b);
      this.attachVisual(b, true, def);
    }
    // the temple guardians (respawn like common bandits, rare wakizashi)
    for (let i = 0; i < SAMURAI_SPOTS.length; i++) {
      const s = SAMURAI_SPOTS[i];
      const camp: CampDef = { id: `samurai_${i}`, name: 'Temple Guardian', x: s.x, z: s.z, radius: 9 };
      const b = new Bandit(9500 + i, camp, false, 555 + i * 13, 'thief');
      b.samurai = true;
      b.maxHp = SAMURAI_DEF.hp;
      b.hp = SAMURAI_DEF.hp;
      b.damage = SAMURAI_DEF.damage;
      b.aggroRadius = 18;
      b.chaseSpeed = 4.6;
      b.pos.set(s.x, this.terrain.height(s.x, s.z), s.z);
      b.group.position.copy(b.pos);
      this.scene.add(b.group);
      this.bandits.push(b);
      this.attachVisual(b, false, undefined, true);
    }
  }

  /** Fase 22 — live bandits inside a radius (ember patches, mythic actives). */
  banditsInRadius(pos: THREE.Vector3, r: number): Array<{ bandit: Bandit; point: THREE.Vector3 }> {
    return this.meleeHitCheckRadius(pos, r, 8);
  }

  /** Fase 22 — apply a burn/poison DoT (CombatSystem ref wiring). */
  applyStatus(bandit: unknown, kind: 'burn' | 'poison', dur: number): void {
    (bandit as Bandit).applyStatus(kind, dur);
  }

  /** Fase 22 — sight multiplier for the whole pack (the Shadow Dō). */
  private detectionMult = 1;
  setDetectionMult(m: number): void {
    this.detectionMult = Math.max(0.25, Math.min(1, m));
  }

  /** Fase 12 — living red knights (E2E/admin). */
  aliveCount(): number {
    return this.bandits.filter((b) => !b.dead).length;
  }

  /**
   * Fase 12 — AMBUSH: a surprise squad of red knights materialises around a
   * point (collection pickups triggering action). They spawn ALERTED and
   * charge straight in — the player can never gather in peace.
   */
  spawnAmbush(x: number, z: number, count = 3): number {
    let spawned = 0;
    const camp = { ...CAMPS[0], x, z, radius: 4 };
    const roles: BanditRole[] = ['thief', 'shooter', 'captain', 'thief', 'heavy'];
    for (let i = 0; i < count; i++) {
      const role = roles[i % roles.length];
      const captain = role === 'captain';
      const bandit = new Bandit(0, camp as CampDef, captain, 9000 + this.bandits.length * 13 + i, role);
      const a = (i / count) * Math.PI * 2 + Math.random();
      const r = 13 + Math.random() * 5;
      bandit.pos.set(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
      bandit.pos.y = this.terrain.height(bandit.pos.x, bandit.pos.z);
      bandit.group.position.copy(bandit.pos);
      bandit.forceAggro();          // they come in swinging
      this.scene.add(bandit.group);
      this.bandits.push(bandit);
      this.attachVisual(bandit, captain);
      spawned++;
    }
    return spawned;
  }

  private attachVisual(bandit: Bandit, captain: boolean, legend?: LegendDef, samurai = false): void {
    this.assets.loadModel('knight_rigged.glb').then((scene) => {
      if (bandit.dead && !legend) return; // died before the model arrived
      const weaponKind = bandit.role === 'heavy' ? 'axe' : bandit.role === 'shooter' ? 'sword' : 'sword';
      const model = new KnightModelGLB({
        scene,
        bandit: {
          seed: bandit.pos.x * 3.1 + bandit.pos.z,
          captain: legend ? true : captain,
          shield: bandit.role === 'heavy' && !legend,
          // Fase 22 — legends and guardians wear their own colours
          tint: legend
            ? { h: legend.tint.h, s: legend.tint.s, l: legend.tint.l }
            : samurai
              ? { h: 0.56, s: 0.3, l: 0.16 }
              : undefined,
          eyes: legend ? legend.eyes : samurai ? 0x9adcf0 : undefined,
        },
        // Fase 11 — bandits carry the rusted variant of the master-forged
        // sword (red-black steel, plain pommel); captains get a garnet.
        weaponFactory: (kind) => (kind === 'sword'
          ? buildHeroSword({ rusted: true, captain: legend ? true : captain })
          : this.kits ? this.kits.weapon(kind) : null),
        shieldFactory: this.kits ? () => this.kits!.create('shield_02') : undefined,
      });
      model.setWeapon(weaponKind as 'sword' | 'axe');
      model.setShield(bandit.role === 'heavy' && !legend);
      bandit.model = model;
      bandit.group.add(model.root);
      // role body language: thieves lean & small, heavies are slabs, shooters
      // wiry marksmen, captains stand tall
      if (legend) {
        model.root.scale.setScalar(legend.scale);
        // THE HAT: the king's tricorn or the ronin's kasa rides the head bone
        const head = model.boneByName('j_head');
        if (head) head.add(this.buildLegendHat(legend.hat));
      } else if (samurai) {
        model.root.scale.setScalar(1.0);
        const head = model.boneByName('j_head');
        if (head) head.add(this.buildLegendHat('kasa', 0.8));
      } else if (!captain) {
        const s = bandit.role === 'heavy' ? 1.06 : bandit.role === 'shooter' ? 0.96 : 0.95;
        model.root.scale.setScalar(s);
      }
      // Fase 17 — the musketeer's firearm: a real flintlock on the shoulder
      if (bandit.role === 'shooter') {
        const musket = this.buildMusket();
        bandit.group.add(musket);
      }
    }).catch(() => {
      // GLB unavailable — leave an empty group (bandits simply don't spawn)
      bandit.group.visible = false;
      bandit.takeDamage(99999, true);
    });
  }

  /** Fase 22 — the legend's headwear: a gold-trimmed tricorn (the Pirate
   *  King) or a straw kasa (the Storm Ronin / temple guardians). */
  private buildLegendHat(kind: 'tricorn' | 'kasa' | 'none', scale = 1): THREE.Group {
    const g = new THREE.Group();
    if (kind === 'none') return g;
    if (kind === 'tricorn') {
      const felt = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.92 });
      const trim = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.8 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * scale, 0.11 * scale, 0.14 * scale, 8), felt);
      crown.position.y = 0.07 * scale;
      g.add(crown);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.32 * scale, 0.03 * scale, 3), felt);
      brim.position.y = 0.015 * scale;
      brim.rotation.y = Math.PI / 3; // the tricorn's signature triangle fold
      g.add(brim);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.105 * scale, 0.014 * scale, 6, 12), trim);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.05 * scale;
      g.add(band);
      g.position.y = 0.1;
    } else {
      const straw = new THREE.MeshStandardMaterial({ color: 0xa89468, roughness: 0.95 });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.24 * scale, 0.16 * scale, 10), straw);
      cone.position.y = 0.08 * scale;
      g.add(cone);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24 * scale, 0.012 * scale, 6, 12), straw);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.012 * scale;
      g.add(rim);
      g.position.y = 0.09;
    }
    return g;
  }

  /** A simple flintlock musket riding the shooter's back. */
  private buildMusket(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'musket_prop';
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.85 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x6a7076, roughness: 0.4, metalness: 0.8 });
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.5), wood);
    stock.position.set(0, 1.32, -0.28);
    stock.rotation.x = 0.12;
    g.add(stock);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.95, 7), steel);
    barrel.rotation.x = Math.PI / 2 - 0.06;
    barrel.position.set(0, 1.44, 0.18);
    g.add(barrel);
    return g;
  }

  // ------------------------------------------------------------ combat API

  /** Player melee swing: nearest bandit inside reach+arc from origin/yaw. */
  meleeHitCheck(
    origin: THREE.Vector3,
    yaw: number,
    reach: number,
    arc: number,
  ): { bandit: Bandit; point: THREE.Vector3 } | null {
    let best: Bandit | null = null;
    let bestD = Infinity;
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const dx = b.pos.x - origin.x;
      const dz = b.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + 0.55) continue;
      const facing = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      const ang = Math.atan2(dx, dz) - yaw;
      const wrapped = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
      if (facing > 0 && wrapped < arc * 0.5 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (!best) return null;
    const c = best.center();
    return {
      bandit: best,
      point: this.tmpV.set(
        best.pos.x,
        c.y,
        best.pos.z,
      ).clone(),
    };
  }

  /** Fase 11 — multi-target sweep (spin finishers): up to `max` victims. */
  meleeHitCheckMulti(
    origin: THREE.Vector3,
    yaw: number,
    reach: number,
    arc: number,
    max: number,
  ): Array<{ bandit: Bandit; point: THREE.Vector3 }> {
    const found: Array<{ bandit: Bandit; d: number }> = [];
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const dx = b.pos.x - origin.x;
      const dz = b.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + 0.55) continue;
      const facing = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      const ang = Math.atan2(dx, dz) - yaw;
      const wrapped = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
      if (facing > 0 && wrapped < arc * 0.5) found.push({ bandit: b, d });
    }
    found.sort((a, z) => a.d - z.d);
    return found.slice(0, max).map((f) => ({
      bandit: f.bandit,
      point: f.bandit.center(),
    }));
  }

  /** Fase 11 — radial AoE (plunge landing): everyone in the ring. */
  meleeHitCheckRadius(
    center: THREE.Vector3,
    radius: number,
    max: number,
  ): Array<{ bandit: Bandit; point: THREE.Vector3 }> {
    const found: Array<{ bandit: Bandit; d: number }> = [];
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const d = Math.hypot(b.pos.x - center.x, b.pos.z - center.z);
      if (Math.abs(b.pos.y - center.y) < 2.6 && d < radius) found.push({ bandit: b, d });
    }
    found.sort((a, z) => a.d - z.d);
    return found.slice(0, max).map((f) => ({
      bandit: f.bandit,
      point: f.bandit.center(),
    }));
  }

  /** Arrow/projectile sweep: bandit whose capsule contains the point. */
  projectileHitTest(pos: THREE.Vector3, radius: number): Bandit | null {
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const dx = pos.x - b.pos.x;
      const dz = pos.z - b.pos.z;
      const dy = pos.y - (b.pos.y + 0.95);
      if (dx * dx + dz * dz < (radius + 0.45) ** 2 && Math.abs(dy) < 1.05) return b;
    }
    return null;
  }

  // ------------------------------------------------------------ Fase 17 API

  /** HOOK DASH target: nearest alive bandit within maxDist of the origin
   *  (frontal preference, any state — even airborne). */
  hookTargetCheck(
    origin: THREE.Vector3,
    yaw: number,
    maxDist: number,
  ): { bandit: Bandit; point: THREE.Vector3 } | null {
    let best: Bandit | null = null;
    let bestScore = -Infinity;
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const dx = b.pos.x - origin.x;
      const dz = b.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist || d < 0.01) continue;
      const ang = Math.atan2(dx, dz) - yaw;
      const wrapped = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
      // frontal bandits win ties; close ones win overall
      const score = -d - wrapped * 3.2;
      if (score > bestScore) {
        best = b;
        bestScore = score;
      }
    }
    if (!best) return null;
    return { bandit: best, point: best.center() };
  }

  /** AIR LAUNCH: fling a bandit skyward. */
  launch(bandit: unknown, vy: number): void {
    (bandit as Bandit).launch(vy);
  }

  /** Juggle pop (an air light connected). */
  juggle(bandit: unknown): void {
    (bandit as Bandit).jugglePop();
  }

  /** Nearest AIRBORNE bandit near a point (air grab + bounce). */
  airborneNear(pos: THREE.Vector3, radius: number): Bandit | null {
    let best: Bandit | null = null;
    let bestD = Infinity;
    for (const b of this.bandits) {
      if (b.dead || !b.airborne || b.grabbed) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      if (d < radius && Math.abs(b.pos.y - pos.y) < 4.2 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /** Rope grab: park the victim at the whirl point. */
  holdBanditAt(bandit: unknown, x: number, y: number, z: number): void {
    (bandit as Bandit).holdAt(x, y, z);
  }

  /** The throw. */
  throwBandit(bandit: unknown, dirX: number, dirZ: number, power: number): void {
    (bandit as Bandit).throwFrom(dirX, dirZ, power);
  }

  /** Knock him flat. */
  knockdown(bandit: unknown, dur: number): void {
    (bandit as Bandit).knockdown(dur);
  }

  /** Leave him back-turned (vault). */
  turnBanditBack(bandit: unknown, dur: number): void {
    (bandit as Bandit).turnBack(dur);
  }

  /** Rope-dart yank. */
  pullBandit(bandit: unknown, dx: number, dz: number): void {
    (bandit as Bandit).pull(dx, dz);
  }

  /** Which defense does the incoming danger demand? (HUD cue) */
  dangerCue(playerPos: THREE.Vector3): 'parry' | 'dodge' | null {
    let cue: 'parry' | 'dodge' | null = null;
    let soonest = Infinity;
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const d = Math.hypot(b.pos.x - playerPos.x, b.pos.z - playerPos.z);
      // YELLOW: a heavy is coming down on someone nearby → Q PARRY!
      if (b.heavyLeft < 0.7 && d < 3.6 && b.heavyLeft < soonest) {
        cue = 'parry';
        soonest = b.heavyLeft;
      }
      // BLUE: the musket volley is about to crack → C DODGE!
      if (b.aimLeft < 0.7 && d < 16 && b.aimLeft < soonest) {
        cue = 'dodge';
        soonest = b.aimLeft;
      }
    }
    return cue;
  }

  /** Apply player damage to a bandit; handles loot/XP on death. */
  damage(bandit: unknown, amount: number, heavy: boolean, opts?: { guardBreak?: boolean; forceStagger?: boolean }): void {
    const b = bandit as Bandit;
    const p = this.playerPos();
    const res = b.takeDamage(amount, heavy, p?.x, p?.z, opts);
    if (res.guarded) {
      // light hit into a raised weapon: sparks + clang, no real harm
      this.hooks.blockSparks(b.center());
      this.hooks.sound('block');
      this.hooks.weaponImpact(b.center());
      return;
    }
    this.hooks.weaponImpact(b.center());
    if (res.died) this.handleBanditDeath(b);
    else this.hooks.sound('damage');
  }

  /** Fase 22 — death resolution shared by direct hits, DoT ticks and
   *  finishers: coins, XP, legend catalysts, samurai drops, boss bar. */
  private handleBanditDeath(b: Bandit): void {
    if (b.legend) {
      // THE LEGEND FALLS: guaranteed catalysts, no respawn, bar clears
      this.hooks.setFlag?.(b.legend.deathFlag);
      const got: string[] = [];
      for (const d of b.legend.drops) {
        if (d.chance !== undefined && Math.random() > d.chance) continue;
        this.hooks.addItem?.(d.id, d.count);
        got.push(`${d.count} × ${d.id}`);
      }
      this.hooks.addCoins(b.legend.lootGold);
      this.hooks.giveXp(b.legend.xp);
      this.hooks.sound('boss_die');
      this.hooks.cameraShake(0.7);
      this.hooks.hitStop(0.14);
      this.hooks.bossHud?.(null);
      this.hooks.notify(
        'quest',
        `${b.legend.name.toUpperCase()} — DEFEATED`,
        `Loot: ${got.join(', ')} and ${b.legend.lootGold} coins. +${b.legend.xp} XP. The legends can be forged now.`,
      );
      return;
    }
    if (b.samurai) {
      // temple guardian: the wakizashi is a rare prize, the silk is not
      const got: string[] = [];
      if (Math.random() < SAMURAI_DEF.wakizashiChance) {
        this.hooks.addItem?.('wakizashi', 1);
        got.push("Temple Guardian's Wakizashi");
      }
      if (Math.random() < SAMURAI_DEF.silkChance) {
        this.hooks.addItem?.('seda_sombras', 1);
        got.push('1 × Ancestral Shadow Silk');
      }
      const coins = 14 + Math.floor(Math.random() * 18);
      this.hooks.addCoins(coins);
      this.hooks.giveXp(34);
      this.hooks.notify('item', 'Temple guardian defeated',
        got.length > 0 ? `Loot: ${got.join(', ')} and ${coins} coins.` : `Loot: ${coins} gold coins.`);
      return;
    }
    const coins = b.captain ? 25 + Math.floor(Math.random() * 35) : 8 + Math.floor(Math.random() * 14);
    this.hooks.addCoins(coins);
    this.hooks.giveXp(b.captain ? 60 : 18);
    this.hooks.sound('hit_scale');
    this.hooks.cameraShake(b.captain ? 0.5 : 0.25);
    this.hooks.hitStop(b.captain ? 0.12 : 0.07);
    this.hooks.onBanditKilled?.(b.captain);
    this.hooks.notify(
      'item',
      b.captain ? 'Bandit captain defeated!' : b.role === 'heavy' ? 'Bruiser down' : b.role === 'shooter' ? 'Musketeer down' : 'Bandit down',
      `Loot: ${coins} gold coins.`,
    );
  }

  /** Best-known player position (kept fresh by update()). */
  private lastPlayer = new THREE.Vector3();
  private playerPos(): THREE.Vector3 | undefined {
    return this.lastPlayerDefined ? this.lastPlayer : undefined;
  }
  private lastPlayerDefined = false;

  // ------------------------------------------------------------ remates

  /** A finisherable bandit within reach of the player (for the E prompt). */
  finisherTarget(playerPos: THREE.Vector3): Bandit | null {
    let best: Bandit | null = null;
    let bestD = Infinity;
    for (const b of this.bandits) {
      if (!b.finisherable || !b.group.visible) continue;
      const d = Math.hypot(b.pos.x - playerPos.x, b.pos.z - playerPos.z);
      if (d < 2.5 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /** RUN the remate: the hero's heavy (Game plays the anim) + the kill. */
  executeFinisher(bandit: unknown): void {
    const b = bandit as Bandit;
    if (!b || b.dead) return;
    b.execute(this.hooks);
    if (b.legend || b.samurai) {
      // Fase 22 — legends and guardians route through the shared loot path
      this.handleBanditDeath(b);
      return;
    }
    const coins = b.captain ? 30 + Math.floor(Math.random() * 40) : 10 + Math.floor(Math.random() * 16);
    this.hooks.addCoins(coins);
    this.hooks.giveXp(b.captain ? 70 : 22);
    this.hooks.notify(
      'quest',
      'FINISHER!',
      b.captain
        ? 'The captain falls to his knees. The road belongs to travellers again.'
        : 'Clean and quiet. The red crows will learn to fear you.',
    );
  }

  /** The hero's swing cut only air — nearby bandits snap to guard. */
  onPlayerWhiff(playerPos: THREE.Vector3): void {
    for (const b of this.bandits) {
      if (b.dead) continue;
      b.onPlayerWhiff(playerPos);
    }
  }

  /** Is anyone hot on the player right now (for the combat camera framing)? */
  combatHeat(playerPos: THREE.Vector3): number {
    let n = 0;
    for (const b of this.bandits) {
      if (!b.aggroed) continue;
      if (Math.hypot(b.pos.x - playerPos.x, b.pos.z - playerPos.z) < 16) n++;
    }
    return n;
  }

  // ------------------------------------------------------------ frame

  update(dt: number, playerPos: THREE.Vector3, playerVulnerable: boolean): void {
    this.lastPlayer.copy(playerPos);
    this.lastPlayerDefined = true;

    // ---- Fase 11: attack tokens — at most 2 press at once (aiming counts) ----
    let attackers = 0;
    const engaged: Bandit[] = [];
    for (const b of this.bandits) {
      if (b.aggroed && !b.dead) engaged.push(b);
    }
    for (const b of engaged) {
      if (b.state === 'attack' || b.state === 'aim') attackers++;
    }
    const maxAttackers = Math.max(1, Math.min(2, Math.ceil(engaged.length / 2)));
    for (const b of engaged) {
      if (b.state === 'attack' || b.state === 'aim') {
        b.hasToken = true; // keep it until the swing ends
        continue;
      }
      if (!b.hasToken && attackers < maxAttackers && b.attackCooldown <= 0 && b.guardT <= 0) {
        b.hasToken = true;
        attackers++;
      }
    }

    // first-contact help (once per session)
    if (!this.helpShown && engaged.length > 0) {
      this.helpShown = true;
      this.hooks.notify(
        'info',
        'First skirmish',
        'Click with rhythm: 4-hit combos · hold LMB: air launch · C: dodge · Q: parry/block · F: hook dash · E: rope dart · in the air, SPACE+click: ground slam · 1-4: swap weapons',
      );
    }

    // ---- Fase 22 — legend bookkeeping: intro card + the boss bar ----
    let legendBarPushed = false;
    for (const b of this.bandits) {
      if (!b.legend || b.dead) continue;
      if (b.aggro && !b.legendIntroduced) {
        b.legendIntroduced = true;
        this.hooks.notify('quest', b.legend.intro[0], b.legend.intro[1]);
        this.hooks.sound('roar_big');
        this.hooks.cameraShake(0.35);
      }
      if (b.aggro && !legendBarPushed) {
        legendBarPushed = true;
        this.hooks.bossHud?.({
          name: b.legend.name,
          title: b.legend.title,
          hp: Math.max(0, Math.ceil(b.hp)),
          maxHp: b.maxHp,
          phase: b.hp < b.maxHp * 0.4 ? 2 : 1,
        });
      }
    }

    for (const b of this.bandits) {
      if (b.dead && b.respawnT <= 0 && !b.group.visible) continue; // already despawned
      if (b.dead && b.respawnT <= 0 && Number.isFinite(b.respawnT)) {
        b.respawn(this.terrain);
        this.attachVisual(b, b.captain);
        continue;
      }
      // culling Fase 14 — tres anillos:
      //  · >330 m: ni se dibuja (los vivos; los muertos gestionan su visible)
      //  · >210 m: ni IA (comportamiento previo, se re-engancha al volver)
      //  · >70 m: IA sí, pose congelada (el hueso es lo caro, no el steering)
      const d2 = (b.pos.x - playerPos.x) ** 2 + (b.pos.z - playerPos.z) ** 2;
      if (!b.dead) b.group.visible = d2 < 330 * 330;
      if (d2 > 210 * 210) continue;
      b.update(dt, playerPos, this.terrain, playerVulnerable, this.hooks, d2 > 70 * 70, this.detectionMult);
      // Fase 22 — a DoT tick finished him: route the death loot
      if (b.dotKilled) {
        b.dotKilled = false;
        this.handleBanditDeath(b);
        if (b.legend) this.hooks.bossHud?.(null);
      }
      // Fase 17 — a thrown bandit just crash-landed: detonate the AoE
      if (b.pendingCrash) {
        const at = b.pendingCrash;
        b.pendingCrash = null;
        let victims = 0;
        for (const other of this.bandits) {
          if (other === b || other.dead) continue;
          const od = Math.hypot(other.pos.x - at.x, other.pos.z - at.z);
          if (od < 2.8 && Math.abs(other.pos.y - at.y) < 2.4) {
            const res = other.takeDamage(34, true, at.x, at.z);
            if (!res.died) other.knockdown(1.0);
            victims++;
          }
        }
        // the hurled man himself eats the crash
        const res = b.takeDamage(46, true);
        if (!res.died) b.knockdown(1.35);
        this.hooks.weaponImpact(at.clone().setY(at.y + 0.4));
        this.hooks.cameraShake(0.45);
        this.hooks.hitStop(0.08);
        this.hooks.sound('hit_scale');
        this.hooks.onThrownCrash?.(at, victims);
      }
    }
  }

  /** Debug/test surface. */
  stats(): { total: number; alive: number; camps: number } {
    return {
      total: this.bandits.length,
      alive: this.bandits.filter((b) => !b.dead).length,
      camps: CAMPS.length,
    };
  }

  campList(): Array<{ id: string; name: string; x: number; z: number }> {
    return CAMPS.map((c) => ({ id: c.id, name: c.name, x: c.x, z: c.z }));
  }

  dispose(): void {
    for (const b of this.bandits) {
      this.scene.remove(b.group);
      b.model?.dispose();
    }
    this.bandits.length = 0;
  }
}
