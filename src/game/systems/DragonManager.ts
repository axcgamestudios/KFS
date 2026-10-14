import * as THREE from 'three';
import { Dragon, type DragonDef } from '../entities/Dragon';
import { DragonModel } from '../entities/DragonModel';
import { DragonModelGLB } from '../entities/DragonModelGLB';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { GameState } from './GameState';
import type { VfxSystem } from './VfxSystem';
import type { AssetSystem } from '../world/AssetSystem';
import { gfxRuntime } from '../core/Graphics';
import type { Input } from '../core/Input';

/** Hooks the manager needs from the game (same pattern as NavalSystem). */
export interface DragonManagerHooks {
  notify(kind: 'info' | 'quest' | 'item', title: string, body?: string): void;
  sound(kind: Parameters<import('./AudioSystem').AudioSystem['playEvent']>[0]): void;
  /** Music intensity 0..1 + boss drum layer on/off. */
  music(intensity: number, boss: boolean): void;
  setFlag(flag: string): void;
  addItem(id: string, count: number): void;
  giveXp(xp: number): void;
  /** Push/clear the boss health bar. */
  bossHud(state: { name: string; title: string; hp: number; maxHp: number; phase: number } | null): void;
  /** Route damage to the player (returns health actually lost). */
  playerDamage(dmg: number, fromX: number, fromZ: number, reason: string): number;
  /** Route damage to the player's ship hull (sea wyvern). */
  shipDamage(dmg: number): void;
  cameraShake(intensity: number): void;
  /** Fase 9 — a BOSS died: narrative victory cinematic hook (PDF §6.1).
   *  Drakes and admin spawns do not fire it. */
  bossDefeated?(d: Dragon): void;
}

/** Encounter definitions — three bosses + two minor drakes. */
export const DRAGON_DEFS: DragonDef[] = [
  {
    id: 'vaelthara', name: 'Vaelthara', title: 'Warden of the Ruins',
    boss: true, wyvern: false, canFly: true, startsAsleep: true,
    useGlbModel: true,
    colors: { body: 0x50634a, belly: 0xa89a6a, membrane: 0x7d8f6d, eye: 0xffc040, horn: 0xc9b17a },
    scale: 1.15, maxHp: 420,
    home: { x: -243, z: -140 }, territory: 130, aggroRange: 55,
    attacks: ['bite', 'claw', 'tail', 'fire'],
    meleeRange: 6.9, fireRange: 27, fireDps: 24, meleeDamage: 16,
    speedGround: 3.4, speedFly: 10,
    xp: 220, deathFlag: 'vaelthara_dead', introFlag: 'vaelthara_seen',
    phase2At: 0.5,
    drops: [{ id: 'corazon_marea', count: 1 }, { id: 'escama', count: 2 }],
    lootGold: 80,
  },
  {
    id: 'skarnvind', name: 'Skarnvind', title: 'Wyvern of the Mists',
    boss: true, wyvern: true, canFly: true,
    useGlbModel: true,
    colors: { body: 0x4a5560, belly: 0x9aa5b0, membrane: 0x5a6a7a, eye: 0x9fe8ff, horn: 0x2e3640 },
    scale: 1.05, maxHp: 300,
    home: { x: 0, z: 460 }, territory: 420, aggroRange: 90,
    attacks: ['fire'],
    meleeRange: 5.8, fireRange: 40, fireDps: 20, meleeDamage: 14,
    speedGround: 3, speedFly: 13,
    xp: 260, deathFlag: 'skarnvind_dead', introFlag: 'skarnvind_seen',
    drops: [{ id: 'garra_skarnvind', count: 1 }, { id: 'espada_tormenta', count: 1 }, { id: 'escama', count: 2 },
      // Fase 22 — THE FORGE: the Twins fell from the wyvern's wing
      { id: 'gemelas_viento', count: 1 }],
    lootGold: 90,
  },
  {
    id: 'ancestro', name: 'Vaelyx', title: 'Ancestor of the Iceclaw Peaks',
    boss: true, wyvern: false, canFly: true, startsAsleep: true,
    useGlbModel: true,
    colors: { body: 0x3d4a5e, belly: 0xb8c4d4, membrane: 0x6a7f9e, eye: 0x8fd8ff, horn: 0xdce8f4 },
    scale: 1.7, maxHp: 700,
    home: { x: 20, z: -300 }, territory: 95, aggroRange: 48,
    attacks: ['bite', 'claw', 'tail', 'fire'],
    meleeRange: 9.2, fireRange: 35, fireDps: 30, meleeDamage: 22,
    speedGround: 3.8, speedFly: 11.5,
    xp: 500, deathFlag: 'ancestro_dead', introFlag: 'ancestro_seen',
    phase2At: 0.66, phase3At: 0.33,
    drops: [{ id: 'colmillo_ancestro', count: 1 }, { id: 'espada_escarcha', count: 1 }, { id: 'escama', count: 3 },
      // Fase 22 — THE FORGE: what the Elder Dragon left behind. The claw
      // sword and the heart are guaranteed; the antlers live in the hoard.
      { id: 'espada_garra', count: 1 },
      { id: 'corazon_dragon_anciano', count: 1 },
      { id: 'escama_ancestral', count: 10 },
      { id: 'placa_sangre', count: 5 }],
    lootGold: 220,
  },
  {
    // Fase 4 — final boss: the repository's black dragon with its native
    // idle clip + procedural combat on the same skeleton.
    id: 'kraivenn', name: 'Kraivenn', title: 'The Three-Headed Crow',
    boss: true, wyvern: true, canFly: true,
    useGlbModel: true,
    spawnFlag: 'kraivenn_awake',
    colors: { body: 0x17141c, belly: 0x3a3444, membrane: 0x241f2e, eye: 0xff4030, horn: 0x55505c },
    scale: 1.55, maxHp: 950,
    home: { x: -398, z: -450 }, territory: 120, aggroRange: 60,
    attacks: ['bite', 'claw', 'tail', 'fire'],
    meleeRange: 9.4, fireRange: 41, fireDps: 34, meleeDamage: 26,
    speedGround: 4.2, speedFly: 12.5,
    xp: 800, deathFlag: 'kraivenn_dead', introFlag: 'kraivenn_intro',
    phase2At: 0.62, phase3At: 0.3,
    drops: [{ id: 'corazon_cuervo', count: 1 }, { id: 'espada_fuego', count: 1 }, { id: 'reliquia_cuervo', count: 3 }],
    lootGold: 400,
  },
  {
    id: 'drake_stones', name: 'Drakeling of the Vigils', boss: false,
    wyvern: false, canFly: false,
    useGlbModel: true,
    colors: { body: 0x6a4034, belly: 0xa8846a, membrane: 0x8a5a4a, eye: 0xffb050, horn: 0x3a2620 },
    scale: 0.52, maxHp: 90,
    home: { x: -136, z: -252 }, territory: 60, aggroRange: 26,
    attacks: ['bite', 'fire'],
    meleeRange: 3.4, fireRange: 16, fireDps: 14, meleeDamage: 11,
    speedGround: 3.6, speedFly: 0,
    xp: 60, deathFlag: 'drake_stones_dead',
    drops: [{ id: 'escama', count: 1 }, { id: 'flecha', count: 3 }, { id: 'colmillo_cria', count: 1, chance: 0.65 }, { id: 'escama_quemada', count: 1, chance: 0.45 }],
    lootGold: 15,
  },
  {
    id: 'drake_grotto', name: 'Drakeling of the Grotto', boss: false,
    wyvern: true, canFly: true,
    useGlbModel: true,
    colors: { body: 0x3f5544, belly: 0x93a88a, membrane: 0x5d7a68, eye: 0xd0ffb0, horn: 0x2a352c },
    scale: 0.5, maxHp: 80,
    home: { x: 196, z: -172 }, territory: 70, aggroRange: 28,
    attacks: ['bite', 'fire'],
    meleeRange: 3.2, fireRange: 17, fireDps: 12, meleeDamage: 10,
    speedGround: 3.2, speedFly: 9,
    xp: 60, deathFlag: 'drake_grotto_dead',
    drops: [{ id: 'escama', count: 1 }, { id: 'flecha', count: 3 }, { id: 'colmillo_cria', count: 1, chance: 0.65 }, { id: 'escama_quemada', count: 1, chance: 0.45 }],
    lootGold: 15,
  },
];

/**
 * Owns every dragon in the world: spawning, AI LOD, boss presentation,
 * death rewards (idempotent via flags), the Skarnvind sea event and
 * weapon/cannonball hit queries.
 */
export class DragonManager {
  private dragons: Dragon[] = [];
  private byId = new Map<string, Dragon>();
  /** Fase 14 — la ÚNICA luz de aliento de la escena: se coloca en la boca
   *  del dragón que esté cargando fuego (antes eran 4-6 PointLights fijas
   *  multiplicando el coste PBR de cada píxel del juego). */
  private breathLight = new THREE.PointLight(0xff7a2a, 0, 60, 1.8);
  private breathTmp = new THREE.Vector3();

  /** Fase 12 — public live lookup (admin/E2E). */
  dragonById(id: string): Dragon | undefined {
    return this.byId.get(id);
  }
  /** Skarnvind spawns only during the q8 hunt in the southern corridor. */
  seaEventState: 'unspawned' | 'active' | 'done' = 'unspawned';
  /** Fase 15 — the dragon the hero rides right now (admin spawns only). */
  ridingId: string | null = null;

  get riddenDragon(): Dragon | null {
    if (!this.ridingId) return null;
    const d = this.dragons.find((x) => x.def.id === this.ridingId);
    return d && d.ridden && d.alive ? d : null;
  }

  /** Fase 16 — read-only access to the live herd (quest markers + saves).
   *  Includes admin spawns; the list is the internal array — treat as const. */
  list(): readonly Dragon[] {
    return this.dragons;
  }

  // ------------------------------------------------------ admin persistence

  /**
   * Fase 16 — the hero's own (admin-spawned) dragons, ready for the save
   * file. They are creator-tool mounts like the Colibrí/horses and used to
   * evaporate on every reload. Species is recovered from the generated id
   * (`admin_{species}_{ts}`) so a fresh session can rebuild the exact breed.
   */
  serializeAdmins(): {
    admins: Array<{ id?: string; species: string; x: number; y: number; z: number; yaw: number; flying: boolean; hp: number; name?: string }>;
    riding: string | null;
  } {
    const admins: Array<{ id?: string; species: string; x: number; y: number; z: number; yaw: number; flying: boolean; hp: number; name?: string }> = [];
    for (const d of this.dragons) {
      if (!d.def.id.startsWith('admin_')) continue;
      if (!d.alive) continue;
      const m = /^admin_(.+)_(\d+)$/.exec(d.def.id);
      const species = m ? m[1] : d.def.id;
      admins.push({
        id: d.def.id, // Fase 16 — stable across save→load→save round-trips
        species,
        x: Math.round(d.pos.x * 10) / 10,
        y: Math.round(d.pos.y * 10) / 10,
        z: Math.round(d.pos.z * 10) / 10,
        yaw: Math.round(d.yaw * 100) / 100,
        flying: d.flying,
        hp: Math.round(d.hp),
        name: d.def.name.replace(' (summoned)', ''),
      });
    }
    return { admins, riding: this.ridingId };
  }

  /** Fase 16 — rebuild the saved admin dragons (docile, rideable) on load.
   *  Riding itself is NOT auto-restored: loading never starts you mounted. */
  restoreAdmins(
    data: { admins?: Array<{ id?: string; species: string; x: number; y: number; z: number; yaw: number; flying: boolean; hp: number; name?: string }> } | undefined,
  ): void {
    if (!data?.admins) return;
    // dismount first: a live ride would fight the rebuild
    if (this.ridingId) this.dismountDragon();
    for (const a of data.admins) {
      const live = this.dragons.find(
        (d) => d.def.id.startsWith('admin_') && Math.hypot(d.pos.x - a.x, d.pos.z - a.z) < 1.5,
      );
      if (live) continue; // same-session reload: keep the living twin
      // restore with the SAVED id so a later save round-trips the same entity
      const dragon = this.adminSpawn(a.species, a.x, a.z, a.id);
      if (!dragon) continue;
      dragon.flying = a.flying;
      dragon.hp = Math.max(1, Math.min(a.hp, dragon.def.maxHp));
      dragon.pos.set(a.x, a.y, a.z);
      dragon.yaw = a.yaw;
      // the saved spot wins over spawnAt's ground clamp
      dragon.group.position.copy(dragon.pos);
      dragon.group.rotation.y = a.yaw;
    }
  }

  /** Fase 15 — nearest rideable (admin) dragon within reach of the player. */
  nearestRideableDragon(playerPos: THREE.Vector3): Dragon | null {
    let best: Dragon | null = null;
    let bestD = Infinity;
    for (const d of this.dragons) {
      if (!d.rideable || d.ridden || !d.alive) continue;
      const dist = Math.hypot(d.pos.x - playerPos.x, d.pos.z - playerPos.z);
      const reach = d.bodyRadius + 5.5;
      if (dist < reach && dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  /** Fase 15 — saddle up: AI off, the hero holds the reins. */
  mountDragon(d: Dragon): boolean {
    if (!d.rideable || d.ridden || !d.alive || this.ridingId) return false;
    this.ridingId = d.def.id;
    d.enterRideMode();
    return true;
  }

  /** Fase 15 — get off (the dragon calms down where it stands). */
  dismountDragon(): Dragon | null {
    const d = this.riddenDragon;
    if (!d) return null;
    d.exitRideMode();
    this.ridingId = null;
    return d;
  }

  /** Fase 15 — one frame of the ridden dragon: input → flight/walk/fire.
   *  Runs INSTEAD of the AI update (the loop skips ridden dragons). */
  rideUpdate(dt: number, input: Input, fireHeld: boolean, terrain: TerrainHeight): void {
    const d = this.riddenDragon;
    if (!d) return;
    const fwd = (input.isDown('forward') ? 1 : 0) + (input.isDown('back') ? -1 : 0);
    const turn = (input.isDown('left') ? 1 : 0) + (input.isDown('right') ? -1 : 0);
    d.rideControl(
      dt,
      {
        fwd,
        turn,
        up: input.isDown('jump'),
        down: input.isDown('sprint'),
        fire: fireHeld,
      },
      terrain,
      this.dragonHooksFor(d),
    );
  }

  private hooks: DragonManagerHooks;
  private vfx: VfxSystem;
  private state: GameState;
  private terrain: TerrainHeight;
  private lastBossHud: string | null = null;
  private lodAcc = new Map<string, number>();

  constructor(
    scene: THREE.Scene,
    terrain: TerrainHeight,
    state: GameState,
    vfx: VfxSystem,
    hooks: DragonManagerHooks,
    assets?: AssetSystem,
  ) {
    this.terrain = terrain;
    this.state = state;
    this.vfx = vfx;
    this.hooks = hooks;
    this.scene = scene;
    this.assets = assets ?? null;

    // Fase 14 — los modelos no cuelgan su propia luz: una compartida arriba
    DragonModel.SHARED_MOUTH_LIGHT = true;
    DragonModelGLB.SHARED_MOUTH_LIGHT = true;
    scene.add(this.breathLight);

    // Spawn the world dragons (skarnvind waits for its sea event;
    // kraivenn waits for the black altar awakening)
    for (const def of DRAGON_DEFS) {
      if (def.id === 'skarnvind') continue;
      if (def.spawnFlag) {
        // Deferred boss: spawn on load only if it was already awake and alive
        if (state.hasFlag(def.spawnFlag) && !state.hasFlag(def.deathFlag)) {
          this.spawnDeferred(def, true);
        }
        continue;
      }
      const loader = def.useGlbModel && this.assets
        ? () => this.assets!.loadAnimatedModelShared('black_dragon.glb')
        : undefined;
      const dragon = new Dragon(def, scene, def.id.length * 7 + def.home.x, loader);
      const deadAlready = state.hasFlag(def.deathFlag);
      dragon.spawnAt(terrain, false);
      if (deadAlready) {
        // Reward already claimed — leave the skeleton in its nest
        dragon.state = 'dead';
        dragon.aggro = false;
      }
      dragon.setStepHook(() => {
        this.hooks.sound('thud');
      });
      this.dragons.push(dragon);
      this.byId.set(def.id, dragon);
    }
  }

  private scene: THREE.Scene;
  private assets: AssetSystem | null;

  /** Build a deferred dragon (Kraivenn) — called by the altar awakening. */
  spawnDeferred(def: DragonDef, restored = false): Dragon | null {
    if (this.byId.has(def.id)) return this.byId.get(def.id)!;
    const loader = this.assets
      ? () => this.assets!.loadAnimatedModelShared('black_dragon.glb')
      : undefined;
    const dragon = new Dragon(def, this.scene, 4242, loader);
    dragon.spawnAt(this.terrain, false);
    dragon.setStepHook(() => this.hooks.sound('thud'));
    this.dragons.push(dragon);
    this.byId.set(def.id, dragon);
    if (!restored) {
      // Awakening: a beat of stillness, then the fight begins
      dragon.aggro = false;
      this.hooks.cameraShake(0.9);
      this.hooks.sound('roar_big');
      setTimeout(() => {
        if (dragon.alive) dragon.aggro = true;
      }, 2200);
    } else {
      // Restored mid-fight from a save: engage directly
      dragon.aggro = true;
    }
    return dragon;
  }

  /** Fase 4 — the black altar awakens Kraivenn (Game wires the interactable). */
  awakenKraivenn(): void {
    const def = DRAGON_DEFS.find((d) => d.id === 'kraivenn');
    if (!def) return;
    this.hooks.setFlag('kraivenn_awake');
    this.spawnDeferred(def, false);
  }

  /**
   * Fase 8 — admin panel: conjure a dragon of the chosen species right in
   * front of a point. These are EXTRA specimens (unique ids, not registered
   * in the quest tables): bosses keep their phases, drakes are minors.
   * Fase 16 — `preferId` lets restoreAdmins() keep the SAVED id stable
   * across sessions (save → load → save again must round-trip).
   */
  adminSpawn(speciesId: string, x: number, z: number, preferId?: string): Dragon | null {
    const base = DRAGON_DEFS.find((d) => d.id === speciesId) ?? DRAGON_DEFS[3];
    const def: DragonDef = {
      ...base,
      id: preferId ?? `admin_${speciesId}_${Date.now() % 100000}`,
      name: `${base.name} (summoned)`,
      home: { x, z },
      spawnFlag: undefined,
      deathFlag: `admin_kill_${Date.now()}`,
      startsAsleep: false,
      drops: [],
      lootGold: 0,
    };
    const loader = this.assets
      ? () => this.assets!.loadAnimatedModelShared('black_dragon.glb')
      : undefined;
    const dragon = new Dragon(def, this.scene, (x * 31 + z * 7) | 0 || 99, loader);
    dragon.spawnAt(this.terrain, false);
    // Fase 15 — admin dragons arrive TAME and rideable (the panel is a
    // creator tool: mount it, fly it, breathe fire — like your own mount).
    dragon.rideable = true;
    dragon.aggro = false;
    dragon.setStepHook(() => this.hooks.sound('thud'));
    this.dragons.push(dragon);
    this.byId.set(def.id, dragon);
    return dragon;
  }

  // ---------------------------------------------------------------- events

  private onAggro(d: Dragon): void {
    const def = d.def;
    if (def.boss) {
      if (def.introFlag && !this.state.hasFlag(def.introFlag)) {
        this.hooks.setFlag(def.introFlag);
      }
      this.hooks.notify('quest', `${def.name.toUpperCase()} — ${def.title ?? 'Boss'}`,
        'A boss awakens! Block with right click, dodge with C, and strike in its pauses.');
      this.hooks.music(1, true);
      this.hooks.cameraShake(0.7);
    } else {
      this.hooks.music(0.7, false);
    }
  }

  private onDeath(d: Dragon): void {
    const def = d.def;
    this.hooks.sound('boss_die');
    this.hooks.cameraShake(1);
    if (!this.state.hasFlag(def.deathFlag)) {
      this.state.setFlag(def.deathFlag);
      // Rewards — granted exactly once thanks to the flag
      for (const drop of def.drops ?? []) {
        // Fase 22 — chance-gated drops (drakeling fangs/scales)
        if (drop.chance !== undefined && Math.random() > drop.chance) continue;
        this.hooks.addItem(drop.id, drop.count);
      }
      if (def.lootGold) this.hooks.addItem('coin', def.lootGold);
      this.hooks.giveXp(def.xp);
      this.hooks.notify(
        'quest',
        def.boss ? `${def.name} has fallen!` : `${def.name} slain`,
        def.boss
          ? `Loot: ${(def.drops ?? []).map((x) => x.id).join(', ')} and ${def.lootGold} coins. +${def.xp} XP`
          : `You gather scales and arrows. +${def.xp} XP`,
      );
    }
    // Fase 9 — the victory cinematic plays for real bosses (not drakes,
    // not admin conjures) once the death animation has had its beat
    if (def.boss && !def.id.startsWith('admin_')) {
      setTimeout(() => {
        if (this.hooks.bossDefeated) this.hooks.bossDefeated(d);
      }, 2600);
    }
    this.hooks.music(0.3, false);
  }

  // ---------------------------------------------------------------- queries

  get activeBoss(): Dragon | null {
    for (const d of this.dragons) {
      if (d.def.boss && d.alive && d.aggro) return d;
    }
    return null;
  }

  /** Melee arc check against every living dragon. */
  meleeHitCheck(
    origin: THREE.Vector3,
    yaw: number,
    reach: number,
    arcRad: number,
  ): { dragon: Dragon; head: boolean; point: THREE.Vector3 } | null {
    let best: { dragon: Dragon; head: boolean; point: THREE.Vector3; d: number } | null = null;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (const d of this.dragons) {
      if (!d.alive || !d.visibleToPlayer) continue;
      if (d.pos.distanceTo(origin) > reach + d.bodyRadius + 6) continue;
      for (const s of d.getHitSpheres()) {
        const dx = s.center.x - origin.x;
        const dz = s.center.z - origin.z;
        const dist = Math.hypot(dx, dz);
        if (dist > reach + s.radius) continue;
        if (Math.abs(s.center.y - origin.y) > reach * 0.9 + 2.5) continue;
        if (arcRad < Math.PI * 1.9) {
          const along = dx * fx + dz * fz;
          if (along < 0) continue; // behind the player
          const side = Math.abs(dx * fz - dz * fx);
          if (side > Math.tan(arcRad / 2) * Math.max(2, along) + s.radius) continue;
        }
        if (!best || dist < best.d) {
          best = { dragon: d, head: s.head, point: s.center.clone(), d: dist };
        }
      }
    }
    return best ? { dragon: best.dragon, head: best.head, point: best.point } : null;
  }

  /** Projectile (arrow / cannonball) sphere test — swept along the frame's
   *  motion segment so fast projectiles can't tunnel through at low fps. */
  projectileHitTest(pos: THREE.Vector3, radius: number, prevPos?: THREE.Vector3): Dragon | null {
    for (const d of this.dragons) {
      if (!d.alive || !d.visibleToPlayer) continue;
      for (const s of d.getHitSpheres()) {
        if (prevPos ? this.segSphere(prevPos, pos, s.center, s.radius + radius)
                    : s.center.distanceTo(pos) <= s.radius + radius) {
          return d;
        }
      }
    }
    return null;
  }

  /** Distance from point c to segment ab within r. */
  private segSphere(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, r: number): boolean {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
    const ab2 = abx * abx + aby * aby + abz * abz;
    let t = ab2 > 0 ? (acx * abx + acy * aby + acz * abz) / ab2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = acx - abx * t;
    const dy = acy - aby * t;
    const dz = acz - abz * t;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }

  /** Direct damage helper (debug / scripted). */
  damage(dragon: Dragon, amount: number, heavy: boolean): void {
    dragon.takeDamage(amount, heavy, this.dragonHooksFor(dragon));
  }

  private onPhaseInternal(d: Dragon, phase: number): void {
    this.hooks.notify('quest', `${d.def.name} — Phase ${phase}`,
      phase === 2
        ? 'The beast changes tactics! Exploit its pauses.'
        : 'The dragon flies into a fury! It strikes faster and harder.');
    this.hooks.cameraShake(0.5);
  }

  /** Player died: every dragon disengages, heals and returns home. */
  resetCombat(): void {
    for (const d of this.dragons) {
      if (!d.alive) continue;
      d.aggro = false;
      d.hp = d.def.maxHp;
      d.phase = 1;
      d.staggerMeter = 0;
      if (d.state !== 'sleep') {
        d.state = 'return';
        d.stateT = 0;
      }
    }
    if (this.seaEventState === 'active') {
      this.retireSeaWyvern();
    }
    this.hooks.music(0.15, false);
    this.hooks.bossHud(null);
    this.lastBossHud = null;
  }

  /** After load/new game: align every dragon with the save's flags. */
  syncWithState(): void {
    if (this.seaEventState === 'active') this.retireSeaWyvern();
    for (const d of this.dragons) {
      if (d.def.id === 'skarnvind') continue;
      d.spawnAt(this.terrain, false);
      if (this.state.hasFlag(d.def.deathFlag)) {
        d.state = 'dead';
        d.aggro = false;
        d.hp = 0;
      }
    }
    this.seaEventState = this.state.hasFlag('skarnvind_dead') ? 'done' : 'unspawned';
    this.hooks.bossHud(null);
    this.lastBossHud = null;
  }

  private retireSeaWyvern(): void {
    const d = this.byId.get('skarnvind');
    if (d) {
      d.dispose();
      this.byId.delete('skarnvind');
      this.dragons = this.dragons.filter((x) => x !== d);
    }
    this.seaEventState = this.state.hasFlag('skarnvind_dead') ? 'done' : 'unspawned';
  }

  // ---------------------------------------------------------------- update

  /**
   * @param playerPos feet position of the player
   * @param playerAlive false while the respawn screen is up
   * @param sailing true at the helm — the sea wyvern hunts the SHIP
   * @param shipPos live ship position (may be null before the refit)
   */
  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerAlive: boolean,
    sailing: boolean,
    shipPos: THREE.Vector3 | null,
  ): void {
    // --- Skarnvind sea event: q8 hunt in the southern corridor ---
    if (
      this.seaEventState === 'unspawned' &&
      sailing && shipPos &&
      this.state.isQuestActive('q8_skarnvind') &&
      !this.state.hasFlag('skarnvind_dead') &&
      shipPos.z > 340 && shipPos.z < 560 &&
      Math.hypot(shipPos.x, shipPos.z + 60) > 420 // off the main island
    ) {
      this.spawnSeaWyvern(shipPos);
    }
    // Retire the wyvern when the fight is over or the player leaves the sea
    if (this.seaEventState === 'active') {
      const d = this.byId.get('skarnvind');
      if (d) {
        if (d.state === 'dead') {
          // Leave the crashed body for a while, then clean up
          d.stateT += dt;
          if (d.stateT > 14) this.retireSeaWyvern();
        } else if (!sailing && d.state === 'return') {
          this.retireSeaWyvern();
        }
      } else {
        this.seaEventState = this.state.hasFlag('skarnvind_dead') ? 'done' : 'unspawned';
      }
    }

    // --- Per-dragon LOD updates ---
    for (const d of this.dragons) {
      // Fase 15 — the ridden dragon is driven by rideUpdate() (Game layer)
      if (d.ridden) continue;
      const dist = d.pos.distanceTo(playerPos);
      const isSeaTarget = d.def.id === 'skarnvind';
      const targetPos = isSeaTarget
        ? (sailing && shipPos ? shipPos : playerPos)
        : playerPos;
      const targetAlive = isSeaTarget ? true : playerAlive;

      // Visibility culling (far dragons freeze + hide).
      // Fase 9 — giants stay visible much further (a 40 m dragon at 470 m
      // was still clearly readable before it vanished).
      if (dist > 780 && !d.aggro) {
        d.group.visible = false;
        d.visibleToPlayer = false;
        continue;
      }
      d.group.visible = true;
      d.visibleToPlayer = true;

      if (dist > 520 && !d.aggro) {
        // Far & calm: update at 2 Hz
        const acc = (this.lodAcc.get(d.def.id) ?? 0) + dt;
        if (acc < 0.5) {
          this.lodAcc.set(d.def.id, acc);
          continue;
        }
        this.lodAcc.set(d.def.id, 0);
        d.update(Math.min(acc, 0.5), targetPos, targetAlive, this.terrain, this.dragonHooksFor(d));
        continue;
      }
      if (dist > 260 && !d.aggro) {
        // Mid range: 8 Hz
        const acc = (this.lodAcc.get(d.def.id) ?? 0) + dt;
        if (acc < 0.125) {
          this.lodAcc.set(d.def.id, acc);
          continue;
        }
        this.lodAcc.set(d.def.id, 0);
        d.update(Math.min(acc, 0.2), targetPos, targetAlive, this.terrain, this.dragonHooksFor(d));
        continue;
      }
      d.update(dt, targetPos, targetAlive, this.terrain, this.dragonHooksFor(d));
    }

    // Fase 14 — una sola luz de aliento: sigue al dragón con más carga.
    // (dos dragones escupiendo a la vez es rarísimo; el flare visual
    //  de la boca sigue siendo por-dragón en cualquier caso)
    let bestK = 0;
    let bestDragon: Dragon | null = null;
    for (const d of this.dragons) {
      const k = d.model.glowValue;
      if (k > bestK && d.group.visible) { bestK = k; bestDragon = d; }
    }
    if (bestDragon) {
      bestDragon.model.mouthWorldPos(this.breathTmp);
      this.breathLight.position.copy(this.breathTmp);
      this.breathLight.intensity = gfxRuntime.pointLights ? bestK * 26 : 0;
    } else {
      this.breathLight.intensity = 0;
    }

    // --- Boss HUD ---
    const boss = this.activeBoss;
    if (boss) {
      const key = `${boss.def.id}|${boss.phase}|${Math.round(boss.hp)}`;
      if (key !== this.lastBossHud) {
        this.lastBossHud = key;
        this.hooks.bossHud({
          name: boss.def.name,
          title: boss.def.title ?? '',
          hp: boss.hp,
          maxHp: boss.def.maxHp,
          phase: boss.phase,
        });
      }
    } else if (this.lastBossHud) {
      this.lastBossHud = null;
      this.hooks.bossHud(null);
    }
  }

  private spawnSeaWyvern(shipPos: THREE.Vector3): void {
    const def = DRAGON_DEFS.find((d) => d.id === 'skarnvind')!;
    const scene = this.dragons[0]?.group.parent as THREE.Scene | undefined;
    if (!scene) return;
    const dragon = new Dragon(def, scene, 977);
    dragon.spawnAt(this.terrain, true);
    // Appear ahead of the ship, low over the water
    dragon.pos.set(shipPos.x, 26, shipPos.z + 90);
    dragon.aggro = true;
    dragon.state = 'chase';
    dragon.group.position.copy(dragon.pos);
    dragon.setStepHook(() => this.hooks.sound('thud'));
    this.dragons.push(dragon);
    this.byId.set('skarnvind', dragon);
    this.seaEventState = 'active';
    if (def.introFlag && !this.state.hasFlag(def.introFlag)) {
      this.state.setFlag(def.introFlag);
    }
    this.hooks.notify('quest', 'SKARNVIND — WYVERN OF THE MISTS',
      'A sail with claws descends upon the Sea Hummingbird! Aim your broadsides when it hovers off the bow.');
    this.hooks.music(1, true);
    this.hooks.sound('roar_big');
  }

  /** Hooks bundle shared by all dragons. */
  private hooksBundle: Parameters<Dragon['update']>[4] | null = null;

  private dragonHooksFor(_d: Dragon): Parameters<Dragon['update']>[4] {
    if (this.hooksBundle) return this.hooksBundle;
    this.hooksBundle = {
      roar: (big) => this.hooks.sound(big ? 'roar_big' : 'roar'),
      wing: (big) => this.hooks.sound(big ? 'wing_big' : 'wing'),
      fire: () => this.hooks.sound('fire'),
      thud: (big) => {
        this.hooks.sound('thud');
        if (big) this.hooks.cameraShake(0.55);
      },
      step: () => this.hooks.sound('thud'),
      onAggro: (d) => this.onAggro(d),
      onDeath: (d) => this.onDeath(d),
      onPhase: (d, p) => this.onPhaseInternal(d, p),
      fireStream: (from, dir, dt, power) => this.vfx.fireBreath(from, dir, dt, power),
      firePuff: (pos, scale) => this.vfx.firePuff(pos, scale),
      landingDust: (pos, scale) => this.vfx.landingDust(pos, 14, scale),
      onMelee: (d, dmg) => {
        const lost = this.hooks.playerDamage(dmg, d.pos.x, d.pos.z, 'dragon');
        if (lost > 0) this.hooks.cameraShake(0.45);
      },
      onFireDamage: (d, dmg) => {
        if (d.def.id === 'skarnvind') {
          this.hooks.shipDamage(dmg * 0.7);
          const lost = this.hooks.playerDamage(dmg * 0.35, d.pos.x, d.pos.z, 'fire');
          if (lost > 0) this.hooks.cameraShake(0.3);
        } else {
          const lost = this.hooks.playerDamage(dmg, d.pos.x, d.pos.z, 'fire');
          if (lost > 0) this.hooks.cameraShake(0.35);
        }
      },
    };
    return this.hooksBundle;
  }

  dispose(): void {
    for (const d of this.dragons) d.dispose();
    this.dragons = [];
    this.byId.clear();
  }
}
