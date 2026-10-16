import * as THREE from 'three';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { NavalSystem, EnemyBrain } from '../naval/NavalSystem';
import type { DragonManager } from './DragonManager';
import type { BanditSystem, DuelHandle } from './BanditSystem';
import type { GameState } from './GameState';
import type { VfxSystem } from './VfxSystem';
import type { Ship } from '../naval/Ship';

type SoundKind = Parameters<import('./AudioSystem').AudioSystem['playEvent']>[0];

export interface LegendaryHooks {
  notify(kind: 'info' | 'quest' | 'item', title: string, body?: string): void;
  sound(kind: SoundKind): void;
  /** Music intensity 0..1 + the boss drum layer. */
  music(intensity: number, boss: boolean): void;
  bossHud(state: { name: string; title: string; hp: number; maxHp: number; phase: number } | null): void;
  /** Fase 27 — the world-wide big text announcement (Elder Dragon). */
  worldBanner(title: string, sub?: string): void;
  addItem(id: string, count: number): void;
  giveXp(xp: number): void;
  playerDamage(dmg: number, fromX: number, fromZ: number, reason: string): number;
  shipDamage(dmg: number): void;
  cameraShake(intensity: number): void;
}

/** Per-frame context the Game feeds the system. */
export interface LegendaryCtx {
  playerPos: THREE.Vector3;
  playerAlive: boolean;
  /** The player is at the helm (sailing). */
  sailing: boolean;
  ship: Ship | null;
  storm: boolean;
  /** Current land-combat kill streak (duel bonus). */
  duelStreak: number;
}

/** Crowhaven — the safe home waters the Pirate King never enters. */
const VILLAGE = { x: 20, z: 150 };
/** The Sea King's arena (El Ombligo del Mar) — his water, not the King's. */
const SEA_KING = { x: 476, z: 476 };
/** The Circle of Vigils — the ancient altar that wakes the Elder. */
const ELDER_ALTAR = { x: -136, z: -252 };
/** Relics the altar accepts as a sacrifice. */
const DRAGON_RELICS = ['escama_ancestral', 'colmillo_ancestro', 'corazon_dragon_anciano', 'escama'];

/** The drops the naval Pirate King pays on defeat. */
const KING_DROPS: Array<{ id: string; count: number; chance?: number; label: string }> = [
  { id: 'oro_rey_pirata', count: 1, label: "Pirate King's Gold" },
  { id: 'madera_reforzada', count: 2, chance: 0.5, label: 'Reinforced Galleon Wood' },
  { id: 'espada_rey_pirata', count: 1, chance: 0.05, label: "Pirate King's Sword" },
  { id: 'sombrero_rey', count: 1, chance: 0.05, label: "Pirate King's Hat" },
  { id: 'tesoro_siete_mares', count: 1, chance: 0.05, label: 'Treasure of the Seven Seas' },
];

/** The drops the duel Ronin pays on defeat. */
const RONIN_DROPS: Array<{ id: string; count: number; chance?: number; label: string }> = [
  { id: 'cuero_bestia_tormenta', count: 2, chance: 0.4, label: 'Storm Beast Leather' },
  { id: 'gemelas_viento', count: 1, chance: 0.15, label: 'Twins of the Voracious Wind' },
  { id: 'nucleo_tormenta', count: 1, chance: 0.05, label: 'Captive Storm Core' },
  { id: 'sombrero_kasa', count: 1, chance: 0.05, label: 'Kasa of the Calm Wind' },
  { id: 'corazon_tormenta', count: 1, chance: 0.03, label: 'Heart of the Storm' },
];

/** The RONIN duel legend (the dynamic event variant of the Mist Temple one). */
export const RONIN_DUEL_DEF = {
  id: 'ronin_duel',
  name: 'The Storm Ronin',
  title: 'Duelist of the Pass',
  role: 'heavy' as const,
  hp: 560,
  damage: 24,
  x: 0,
  z: 0,
  aggroRadius: 30,
  chaseSpeed: 5.0,
  scale: 1.08,
  tint: { h: 0.58, s: 0.42, l: 0.17 },
  eyes: 0x48c8e8,
  hat: 'kasa' as const,
  drops: [],
  lootGold: 260,
  xp: 300,
  deathFlag: 'ronin_duel_dead',
  boss: true,
  intro: ['DUELO LEGENDARIO', 'A masterless blade bars the road. The storm walks with him.'] as [string, string],
};

/** A traveling iaijutsu slash wave (the Ronin's ranged cut). */
class SlashWave {
  readonly mesh: THREE.Mesh;
  private vel = new THREE.Vector3();
  private life = 0;
  private readonly maxLife = 1.5;
  private hit = false;
  constructor(scene: THREE.Scene, from: THREE.Vector3, dir: THREE.Vector3, private hooks: LegendaryHooks, private dmg: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(64, 32, 4, 64, 32, 60);
    grad.addColorStop(0, 'rgba(190,240,255,0.95)');
    grad.addColorStop(0.5, 'rgba(90,190,255,0.55)');
    grad.addColorStop(1, 'rgba(40,90,200,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(64, 32, 62, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), mat);
    this.mesh.position.copy(from);
    this.vel.copy(dir).normalize().multiplyScalar(17);
    this.mesh.rotation.y = Math.atan2(this.vel.x, this.vel.z) + Math.PI / 2;
    scene.add(this.mesh);
  }
  update(dt: number, playerPos: THREE.Vector3): boolean {
    this.life += dt;
    this.mesh.position.addScaledVector(this.vel, dt);
    this.mesh.rotation.z += dt * 9;
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 1 - this.life / this.maxLife);
    if (!this.hit) {
      const d = this.mesh.position.distanceTo(playerPos);
      if (d < 1.9) {
        this.hit = true;
        this.hooks.playerDamage(this.dmg, this.mesh.position.x, this.mesh.position.z, 'ronin');
        this.hooks.cameraShake(0.35);
      }
    }
    if (this.life >= this.maxLife) {
      this.mesh.parent?.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      return false;
    }
    return true;
  }
}

/**
 * Fase 27 — THE THREE LEGENDARY EVENTS.
 *
 *  1. EMBOSCADA LEGENDARIA — El Rey de los Piratas: every 10 minutes of
 *     CONTINUOUS deep-sea sailing a check fires (1%, +5% cumulative for
 *     every pirate ship sunk recently). His war galleon + elite escorts
 *     hunt the player with cannons, incendiary rounds and ramming.
 *  2. DUELO LEGENDARIO — El Ronin de la Tormenta: crossing the mountains
 *     (or the open country in a storm) rolls a check every 5 minutes in
 *     zone (4%, +10% per active duel streak). At half health his steel
 *     takes the storm.
 *  3. DEVASTACIÓN CELESTIAL — the Elder Dragon: at the highest summits a
 *     10-minute check (0.5%); sacrificing a dragon relic at the ancient
 *     altar of the Circle of Vigils rolls 20% every minute. The world
 *     banner announces the awakening.
 */
export class LegendaryEvents {
  // ---- shared ----
  private t = 0;
  private readonly hooks: LegendaryHooks;

  // ---- 1. the Pirate King ----
  private seaState: 'idle' | 'hunting' = 'idle';
  private seaT = 0;
  private seaCheckAt = 600;
  private kingCooldown = 0;
  private kingBrain: EnemyBrain | null = null;
  private escortBrains: EnemyBrain[] = [];
  private knownSunk = new Set<Ship>();
  private pirateStreak = 0;
  private streakDecay = 0;
  private bombT = 0;
  private ramCd = 0;
  private huntT = 0;

  // ---- 2. the Storm Ronin ----
  private roninState: 'idle' | 'duel' = 'idle';
  private roninT = 0;
  private roninCheckAt = 300;
  private roninCooldown = 0;
  private ronin: DuelHandle | null = null;
  private roninPhase2 = false;
  private roninTrailT = 0;
  private iaiCharge = -1;
  private iaiCd = 5;
  private waves: SlashWave[] = [];

  // ---- 3. the Elder Dragon ----
  private elderState: 'idle' | 'awake' = 'idle';
  private summitT = 0;
  private elderCheckAt = 600;
  private altarT = 0;
  private altarCheckAt = 60;

  constructor(
    private scene: THREE.Scene,
    private terrain: TerrainHeight,
    private naval: NavalSystem,
    private dragons: DragonManager,
    private bandits: BanditSystem,
    private state: GameState,
    private vfx: VfxSystem,
    hooks: LegendaryHooks,
  ) {
    this.hooks = hooks;
  }

  update(dt: number, ctx: LegendaryCtx): void {
    this.t += dt;
    if (this.kingCooldown > 0) this.kingCooldown -= dt;
    if (this.roninCooldown > 0) this.roninCooldown -= dt;
    if (this.streakDecay > 0) {
      this.streakDecay -= dt;
      if (this.streakDecay <= 0) this.pirateStreak = 0;
    }
    this.trackPirateSinks();
    this.updateKingEvent(dt, ctx);
    this.updateRoninEvent(dt, ctx);
    this.updateElderEvent(dt, ctx);
  }

  // ================================================================ 1. KING
  private trackPirateSinks(): void {
    for (const e of this.naval.enemies) {
      if (e.quest || e === this.kingBrain || this.escortBrains.includes(e)) continue;
      if (e.ship.sunk && !this.knownSunk.has(e.ship)) {
        this.knownSunk.add(e.ship);
        this.pirateStreak++;
        this.streakDecay = 600;
        this.hooks.notify('item', 'PIRATE HUNT', `Enemy ship sunk — legendary ambush odds rising (streak ${this.pirateStreak}).`);
      }
    }
  }

  private deepSea(ctx: LegendaryCtx): boolean {
    const p = ctx.playerPos;
    const h = this.terrain.height(p.x, p.z);
    const dV = Math.hypot(p.x - VILLAGE.x, p.z - VILLAGE.z);
    const dK = Math.hypot(p.x - SEA_KING.x, p.z - SEA_KING.z);
    return h < -6 && dV > 320 && dK > 340;
  }

  private updateKingEvent(dt: number, ctx: LegendaryCtx): void {
    if (this.seaState === 'idle') {
      if (this.kingCooldown > 0) return;
      const sailing = ctx.sailing && ctx.ship != null && !ctx.ship.sunk;
      if (sailing && this.deepSea(ctx)) {
        this.seaT += dt;
        if (this.seaT >= this.seaCheckAt) {
          this.seaT = 0;
          const roll = 0.01 + Math.min(this.pirateStreak, 5) * 0.05;
          if (Math.random() < roll) this.spawnKingFleet(ctx);
        }
      } else {
        this.seaT = Math.max(0, this.seaT - dt * 2);
      }
      return;
    }
    // hunting
    this.huntT += dt;
    this.ramCd -= dt;
    this.bombT -= dt;
    const boss = this.kingBrain;
    if (!boss || !ctx.ship) return;
    const ship = ctx.ship;
    const dist = Math.hypot(boss.ship.pos.x - ship.pos.x, boss.ship.pos.z - ship.pos.z);

    // boss bar
    this.hooks.bossHud({
      name: 'EL REY DE LOS PIRATAS', title: 'Emboscada Legendaria',
      hp: Math.max(0, boss.ship.hullHp), maxHp: boss.ship.maxHullHp, phase: 1,
    });

    // incendiary broadsides: periodic burn ticks on the hull
    if (this.bombT <= 0 && dist < 110) {
      this.bombT = 13 + Math.random() * 4;
      this.hooks.sound('fire');
      this.hooks.notify('info', 'INCENDIARY ROUND!', 'The galleon\'s fire bombs are burning the deck — break away or sink her!');
      let ticks = 0;
      const burn = () => {
        if (ticks++ >= 5 || !this.kingBrain || this.seaState !== 'hunting') return;
        this.hooks.shipDamage(7);
        setTimeout(burn, 900);
      };
      burn();
    }
    // the reinforced ram
    if (dist < 15 && this.ramCd <= 0) {
      this.ramCd = 7;
      this.hooks.shipDamage(40);
      this.hooks.cameraShake(1.2);
      this.hooks.sound('hit_hull');
    }

    // outcome
    if (boss.ship.sunk || boss.ship.sinking > 0) {
      this.endKingEvent(true);
    } else if (ship.sunk || ship.sinking > 0 || !ctx.playerAlive || this.huntT > 480) {
      this.endKingEvent(false);
    }
  }

  private spawnKingFleet(ctx: LegendaryCtx): void {
    const p = ctx.playerPos;
    const a = Math.random() * Math.PI * 2;
    const r = 130 + Math.random() * 40;
    const bx = p.x + Math.cos(a) * r;
    const bz = p.z + Math.sin(a) * r;
    this.kingBrain = this.naval.spawnLegendaryGalleon(bx, bz, 'Rey de los Piratas', 520, 2.5);
    this.escortBrains = [
      this.naval.spawnLegendaryGalleon(bx + 40, bz + 26, 'Guardia del Rey', 130, 3.4),
      this.naval.spawnLegendaryGalleon(bx - 34, bz + 38, 'Guardia del Rey', 130, 3.4),
    ];
    this.seaState = 'hunting';
    this.huntT = 0;
    this.bombT = 8;
    this.ramCd = 4;
    this.hooks.worldBanner('EMBOSCADA LEGENDARIA', 'El Rey de los Piratas ha tendido su emboscada');
    this.hooks.notify('quest', 'EMBOSCADA LEGENDARIA — EL REY DE LOS PIRATAS',
      'A war galleon with elite escorts bears down on you. Her cannons are loaded with fire. Sink her for legendary spoils.');
    this.hooks.sound('roar_big');
    this.hooks.cameraShake(0.6);
    this.hooks.music(1, true);
  }

  private endKingEvent(victory: boolean): void {
    const boss = this.kingBrain;
    for (const e of this.escortBrains) {
      if (!e.ship.sunk) this.naval.fleeAmbushPirate(e);
    }
    this.escortBrains = [];
    this.kingBrain = null;
    this.seaState = 'idle';
    this.seaT = 0;
    this.seaCheckAt = 600;
    this.kingCooldown = 900;
    this.hooks.bossHud(null);
    this.hooks.music(0, false);
    if (victory && boss) {
      const gold = 60 + Math.floor(Math.random() * 41);
      this.hooks.addItem('coin', gold);
      const won: string[] = [];
      for (const d of KING_DROPS) {
        if (d.chance != null && Math.random() > d.chance) continue;
        this.hooks.addItem(d.id, d.count);
        won.push(d.label);
      }
      this.hooks.giveXp(600);
      this.hooks.sound('boss_die');
      this.hooks.worldBanner('EL REY DE LOS PIRATAS HA CAÍDO', `El botín legendario es tuyo (+${gold} oro)`);
      this.hooks.notify('item', 'LEGENDARY SPOILS', won.join(', '));
      this.state.setFlag('rey_pirata_ambush_won');
    } else {
      this.hooks.notify('info', 'THE FLEET DISENGAGES', 'The galleon breaks off the hunt. The King will be back.');
    }
  }

  // =============================================================== 2. RONIN
  private roninZone(ctx: LegendaryCtx): boolean {
    const p = ctx.playerPos;
    const h = this.terrain.height(p.x, p.z);
    const dV = Math.hypot(p.x - VILLAGE.x, p.z - VILLAGE.z);
    if (h > 38) return dV > 160;                       // the passes and the peaks
    if (ctx.storm && h > 10 && dV > 220) return true;  // the open country under a storm
    return false;
  }

  private updateRoninEvent(dt: number, ctx: LegendaryCtx): void {
    if (this.roninState === 'idle') {
      if (this.roninCooldown > 0) return;
      if (!ctx.playerAlive || ctx.sailing) return;
      if (this.roninZone(ctx)) {
        this.roninT += dt;
        if (this.roninT >= this.roninCheckAt) {
          this.roninT = 0;
          const roll = 0.04 + Math.min(ctx.duelStreak, 3) * 0.1;
          if (Math.random() < roll) this.spawnRonin(ctx);
        }
      } else {
        this.roninT = Math.max(0, this.roninT - dt * 2);
      }
      return;
    }
    // dueling
    const r = this.ronin;
    if (!r) { this.roninState = 'idle'; return; }
    const p = ctx.playerPos;
    const dist = Math.hypot(r.pos.x - p.x, r.pos.z - p.z);

    this.hooks.bossHud({
      name: 'EL RONIN DE LA TORMENTA', title: 'Duelo Legendario',
      hp: Math.max(0, r.hp), maxHp: r.maxHp, phase: this.roninPhase2 ? 2 : 1,
    });

    // phase 2 at half health — the storm enters the steel
    if (!this.roninPhase2 && r.hp <= r.maxHp * 0.5) {
      this.roninPhase2 = true;
      r.chaseSpeed *= 1.32;
      r.damage = Math.round(r.damage * 1.18);
      this.vfx.elementalBurst(r.pos.clone().setY(r.pos.y + 1.2), 'storm');
      this.hooks.cameraShake(0.7);
      this.hooks.sound('thunder');
      this.hooks.notify('quest', 'LA TORMENTA DESPIERTA', 'The Ronin\'s blades drink the storm — faster now, and the lightning travels the ground.');
    }
    // storm trail (the afterimage read while he moves)
    this.roninTrailT -= dt;
    if (this.roninTrailT <= 0 && this.roninPhase2 && dist < 40) {
      this.roninTrailT = 0.5;
      this.vfx.elementalBurst(r.pos.clone().setY(r.pos.y + 0.4), 'storm');
    }
    // IAIJUTSU — the standing draw: charge, then the traveling cut
    if (this.iaiCharge < 0) {
      this.iaiCd -= dt;
      if (this.iaiCd <= 0 && dist > 6 && dist < 16) {
        this.iaiCharge = 0.75;
        this.hooks.sound('bow_draw');
      }
    } else {
      this.iaiCharge -= dt;
      if (this.iaiCharge <= 0) {
        this.iaiCharge = -1;
        this.iaiCd = this.roninPhase2 ? 4.5 : 7;
        const from = r.pos.clone().setY(r.pos.y + 1.15);
        const dir = p.clone().sub(from); dir.y = 0;
        if (dir.lengthSq() > 0.01) {
          this.waves.push(new SlashWave(this.scene, from, dir, this.hooks, this.roninPhase2 ? 22 : 16));
          this.hooks.sound('swing');
        }
      }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      if (!this.waves[i].update(dt, p)) this.waves.splice(i, 1);
    }

    // outcome
    if (r.dead) {
      this.endRonin(true);
    } else if (!ctx.playerAlive || dist > 170) {
      this.endRonin(false);
    }
  }

  private spawnRonin(ctx: LegendaryCtx): void {
    const p = ctx.playerPos;
    const a = Math.atan2(-p.x, -p.z) + Math.PI + (Math.random() - 0.5); // somewhere ahead
    const r = 13 + Math.random() * 4;
    const x = p.x + Math.sin(a) * r;
    const z = p.z + Math.cos(a) * r;
    const spawned = this.bandits.spawnLegendDuel(RONIN_DUEL_DEF, x, z);
    if (!spawned) return;
    this.ronin = spawned;
    this.roninState = 'duel';
    this.roninPhase2 = false;
    this.iaiCd = 4;
    this.iaiCharge = -1;
    this.hooks.worldBanner('DUELO LEGENDARIO', 'El Ronin de la Tormenta bloquea el camino');
    this.hooks.notify('quest', 'DUELO LEGENDARIO — EL RONIN DE LA TORMENTA',
      'Two blades and no master. Break his guard before the storm takes his side — dodge the draw when he stands still.');
    this.hooks.sound('thunder');
    this.hooks.cameraShake(0.5);
    this.hooks.music(0.9, true);
  }

  private endRonin(victory: boolean): void {
    this.ronin = null;
    this.roninState = 'idle';
    this.roninT = 0;
    this.roninCooldown = 600;
    this.hooks.bossHud(null);
    this.hooks.music(0, false);
    for (const w of this.waves) w.update(99, new THREE.Vector3(0, -999, 0)); // force-expire
    this.waves.length = 0;
    if (victory) {
      const gold = 120 + Math.floor(Math.random() * 81);
      this.hooks.addItem('coin', gold);
      const won: string[] = [];
      for (const d of RONIN_DROPS) {
        if (d.chance != null && Math.random() > d.chance) continue;
        this.hooks.addItem(d.id, d.count);
        won.push(d.label);
      }
      this.hooks.giveXp(450);
      this.hooks.sound('boss_die');
      this.hooks.worldBanner('EL RONIN HA CAÍDO', `El duelo terminó — botín legendario (+${gold} oro)`);
      this.hooks.notify('item', 'LEGENDARY SPOILS', won.join(', '));
      this.state.setFlag('ronin_duel_won');
    }
  }

  // =============================================================== 3. ELDER
  private updateElderEvent(dt: number, ctx: LegendaryCtx): void {
    if (this.elderState === 'awake') {
      const d = this.dragons.dragonById('elderdragon');
      if (!d || !d.alive) {
        this.elderState = 'idle';
        this.hooks.music(0, false);
        this.hooks.worldBanner('EL DRAGON LEGENDARIO HA CAÍDO', 'Las cumbres quedan en silencio');
        this.hooks.notify('quest', 'DEVASTACIÓN CELESTIAL — VICTORY',
          'The Elder Dragon is no more. Her hoard is yours: ancestral scales, frozen blood, and maybe the Crown of Primal Antlers.');
        this.state.setFlag('elder_dragon_slain');
      }
      return;
    }
    const p = ctx.playerPos;
    const h = this.terrain.height(p.x, p.z);
    // mountaintop dwell
    if (h > 52) {
      this.summitT += dt;
      if (this.summitT >= this.elderCheckAt) {
        this.summitT = 0;
        if (Math.random() < 0.005) this.awakenElder(p.x, p.z, false);
      }
    } else {
      this.summitT = Math.max(0, this.summitT - dt * 2);
    }
    // the ancient altar: sacrifice a dragon relic for a real chance
    const dA = Math.hypot(p.x - ELDER_ALTAR.x, p.z - ELDER_ALTAR.z);
    if (dA < 9 && ctx.playerAlive && !ctx.sailing) {
      this.altarT += dt;
      if (this.altarT >= this.altarCheckAt) {
        this.altarT = 0;
        const relic = DRAGON_RELICS.find((id) => this.state.hasItem(id, 1));
        if (relic && Math.random() < 0.2) {
          this.state.removeItem(relic, 1);
          this.awakenElder(p.x, p.z, true);
        } else if (relic) {
          this.hooks.notify('info', 'THE ALTAR STAYS COLD', 'The ancient stone drank the air but did not wake. Offer again.');
        }
      }
    } else {
      this.altarT = 0;
    }
  }

  /** Fase 27 — E2E/admin: wake the Elder Dragon NOW at the player's side
   *  (banner + roar + the full event path, not just the DragonManager). */
  debugAwakenElder(x: number, z: number): void {
    this.awakenElder(x, z, false);
  }

  private awakenElder(x: number, z: number, byAltar: boolean): void {
    const d = this.dragons.awakenElderDragon(x, z + 26);
    if (!d) return;
    this.elderState = 'awake';
    this.summitT = 0;
    this.hooks.worldBanner('El Dragon Legendario ha despertado', 'DEVASTACIÓN CELESTIAL — ELDER DRAGON');
    this.hooks.notify('quest', 'DEVASTACIÓN CELESTIAL',
      byAltar
        ? 'The altar accepted your relic. The summit splits — three phases of claw, breath and sky. She LANDS to fight: meet her steel with steel.'
        : 'The oldest wing in Eldoria has chosen your summit. Endgame steel only — her charged breath kills the unprotected.');
    this.hooks.sound('roar_big');
    this.hooks.cameraShake(1.5);
    this.hooks.music(1, true);
    this.state.setFlag('elderdragon_summoned');
  }
}
