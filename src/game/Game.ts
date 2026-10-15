import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { buildWorld, type WorldRefs, type Interactable } from './GameWorld';
import { ColliderRegistry } from './systems/ColliderRegistry';
import { GameState, SKILLS, xpForLevel } from './systems/GameState';
import { getFlameFX } from './world/FlameFX';
import { DialogueSystem } from './systems/DialogueSystem';
import { AudioSystem } from './systems/AudioSystem';
import { SaveSystem, type SaveData, type Settings, resolveSettings } from './systems/SaveSystem';
import {
  gfxRuntime, graphicsOf, applyPreset, fogMulForChunks, cameraFarForChunks, ASSET_BASE, CLOUD_QUAL, FLAME_BUDGET,
} from './core/Graphics';
import { QUALITY_PRESETS, type QualityLevel } from './core/Engine';
import { Player } from './entities/Player';
import { KnightModelGLB } from './entities/KnightModelGLB';
import { KitSystem } from './world/KitSystem';
import { buildHeroSword } from './world/HeroSword';
import { initGlbWeapons, buildGlbSword, buildGlbBow } from './world/GlbWeapons';
import { CameraRig } from './entities/CameraRig';
import { NPC } from './entities/NPC';
import { villagerPalette, VillagerModel, type CharacterVisual } from './entities/CharacterModel';
import { VillagerModelGLB } from './entities/VillagerModelGLB';
import { NavalSystem, type SailingHud } from './naval/NavalSystem';
import type { Ship } from './naval/Ship';
import { VfxSystem } from './systems/VfxSystem';
import { SeaBeastSystem } from './systems/SeaBeastSystem';
import { PirateAmbushSystem } from './systems/PirateAmbushSystem';
import { CombatSystem, WEAPONS, SWORD_TIER_NAMES, SWORD_PRIORITY, swordElementOf } from './systems/CombatSystem';
import { DragonManager } from './systems/DragonManager';
import { BanditSystem } from './systems/BanditSystem';
import { ForgeSystem } from './systems/ForgeSystem';
import type { Dragon } from './entities/Dragon';
import { CinematicSystem, type CineShot } from './systems/CinematicSystem';
import { walkActor, heroSalute, idleActor, faceTarget } from './systems/CineActors';
import { MountSystem } from './systems/MountSystem';
import { EndingSystem, ENDINGS, type EndingId, type EndingShot } from './systems/EndingSystem';
import { PostFX } from './world/PostFX';
import { windTime, windGust } from './world/VegetationSystem';
import { POIS, ISLANDS, WIND } from './world/WorldConfig';
import { ITEMS } from './data/items';
import { VENDORS } from './data/shops';
import { QUESTS, MAIN_QUEST_ORDER, SIDE_QUESTS } from './data/quests';
import { LORE } from './data/dialogues';
import { useGameStore } from '../store/gameStore';
import { gameApi, type QuestView } from './api';
import { clamp, dampAngle, formatClock, smoothstep } from './core/MathUtils';
import { updateChests } from './structures/Props';

interface IntroShot {
  from: THREE.Vector3; to: THREE.Vector3;
  lookFrom: THREE.Vector3; lookTo: THREE.Vector3;
  dur: number; text: string;
}

const INTRO_SHOTS: IntroShot[] = [
  {
    from: new THREE.Vector3(-60, 55, 720), to: new THREE.Vector3(20, 42, 620),
    lookFrom: new THREE.Vector3(0, 30, 100), lookTo: new THREE.Vector3(20, 25, 150),
    dur: 11,
    text: 'Eldoria… a land of kingdoms that were. The ancients ruled the seas under the pact of the dragons… until the great war sank it all beneath the waves.',
  },
  {
    from: new THREE.Vector3(220, 120, -80), to: new THREE.Vector3(160, 95, -140),
    lookFrom: new THREE.Vector3(40, 70, -320), lookTo: new THREE.Vector3(60, 80, -300),
    dur: 11,
    text: 'The dragons sleep on the Iceclaw peaks. The pirates sow fear along the trade routes. And something ancient is waking beneath the ruins of the ocean.',
  },
  {
    from: new THREE.Vector3(210, 70, 60), to: new THREE.Vector3(160, 58, 20),
    lookFrom: new THREE.Vector3(110, 45, -45), lookTo: new THREE.Vector3(105, 50, -40),
    dur: 10,
    text: 'The kingdoms are divided and the walls are cracking. In Crowhaven, a port master keeps the last will of a vanished friend…',
  },
  {
    from: new THREE.Vector3(70, 30, 250), to: new THREE.Vector3(38, 10, 252),
    lookFrom: new THREE.Vector3(25, 8, 235), lookTo: new THREE.Vector3(21, 2.2, 244),
    dur: 10,
    text: '…and the tide carries someone back home. The Warden\'s son has returned. KINGDOMS OF THE FORGOTTEN SEAS — Chapter 1: A Brand New Beginning.',
  },
];

export class Game {
  private engine: Engine;
  private input: Input;
  private colliders = new ColliderRegistry();
  private state = new GameState();
  private dialogue: DialogueSystem;
  private audio = new AudioSystem();
  private world?: WorldRefs;
  private player?: Player;
  private rig?: CameraRig;
  private npcs: NPC[] = [];
  private naval?: NavalSystem;
  private vfx?: VfxSystem;
  /** Fase 12 — wake emission cadence + scratch vector. */
  private wakeTimer = 0;
  private tmpSplash = new THREE.Vector3();
  /** Fase 12 — element of the equipped legendary sword (trail particles). */
  private equippedElement: 'fire' | 'frost' | 'storm' | null = null;
  private elemTrailT = 0;
  /** Fase 12 — kill streak window (dopamine) + ambush cooldown. */
  private streakN = 0;
  private streakT = 0;
  private ambushCd = 0;

  /** A combat kill landed: streak labels + bonus XP keep the blood hot. */
  private registerCombatKill(label = ''): void {
    this.state.registerKill('bandit');
    this.streakT = 7;                      // the window stays open
    this.streakN++;
    const n = this.streakN;
    if (n >= 2) {
      const names = ['', '', 'DOUBLE!', 'TRIPLE!', 'SLAUGHTER!', 'UNSTOPPABLE!', 'LEGENDARY!'];
      const text = label || names[Math.min(n, 6)];
      this.combat?.flashEvent(text);
      const bonus = 6 * n;
      this.state.giveXp(bonus);
      useGameStore.getState().notify('item', text, `Streak ×${n} — +${bonus} fury XP.`);
      this.rig?.punch(0.3 + Math.min(0.3, n * 0.06));
    } else if (label) {
      this.combat?.flashEvent(label);
    }
  }
  private combat?: CombatSystem;
  private dragons?: DragonManager;
  private mounts?: MountSystem;
  private endings?: EndingSystem;
  /** Fase 10 — red knight bandits patrolling road camps. */
  private bandits?: BanditSystem;
  /** Fase 22 — THE FORGE OF LEGENDS: recipes, stations and the eclipse. */
  private forge?: ForgeSystem;
  /** Fase 15 — sea serpents + the King of the Sea (Navel of the Sea arena). */
  private seaBeasts?: SeaBeastSystem;
  /** Fase 15 — random pirate ambushes on the high seas + toll negotiation. */
  private pirateAmbush?: PirateAmbushSystem;
  /** Fase 9 — in-game narrative cinematics (dragon victories, chapters). */
  private cinematics = new CinematicSystem();
  /** Fase 9 — chapter cinematic waiting for the closing dialogue to end. */
  private pendingChapter: { n: number; title: string; sub: string } | null = null;
  /** Fase 9 — quest ids already seen completed (chapter detection). */
  private lastCompletedIds = new Set<string>();
  private postfx?: PostFX;
  /** Fase 21 — scratch vector for the sun-shafts screen projection (no per-frame alloc). */
  private SHAFT_SCRATCH = new THREE.Vector3();
  /** Fase 4 — ambient music bed from the asset repository (MP3). */
  private musicEl: HTMLAudioElement | null = null;
  private settings: Settings;
  private shakeT = 0;

  private hudTimer = 0;
  private discoveryTimer = 0;
  private autosaveTimer = 0;
  private mapTimer = 0;
  private menuOrbit = 0;
  private introT = 0;
  private introDone = false;
  private lastIntroShot = -1;
  private musicIntensityTarget = 0.15;
  private dead = false;
  private nightTorchActive = false;
  /** Fase 8 — NPCs animate their poses only inside this radius (quality). */
  private npcAnimDistance = 95;
  /** Fase 4 — riding state mirrors (for save & HUD). */
  private ridingGait = '';
  private pollTimer = 0;
  /** Fase 4 — ending playback lock (input frozen while cinematic runs). */
  private endingPlayed = false;

  constructor(canvas: HTMLCanvasElement) {
    // Fase 13 — los ajustes se leen ANTES de crear el renderer: el antialias
    // (MSAA) pertenece al contexto WebGL y no se puede alternar en caliente,
    // así que la resolución/calidad guardada decide aquí mismo.
    this.settings = resolveSettings(SaveSystem.readSettings());
    const bootGfx = graphicsOf(this.settings);
    const bootTier: QualityLevel = this.settings.tier;
    // Fase 14 — el MSAA multiplica TODO el coste de fragmentos ×2-3 (agua,
    // cielo, pasto…). Solo en alta/ultra: en media el fill-rate vale más.
    const antialias = bootGfx.resolution >= 1.0 && (bootTier === 'high' || bootTier === 'ultra');

    this.engine = new Engine(canvas, { antialias });
    this.engine.applyGraphics(bootGfx, bootTier);
    this.input = new Input(canvas);
    this.dialogue = new DialogueSystem(this.state);
    gfxRuntime.pointLights = bootGfx.realLights;
    // Fase 16 — wakes interactivos siguen el interruptor de oleaje
    gfxRuntime.waves = bootGfx.waves;

    this.state.onChange = () => this.syncProgression();

    this.engine.onWebGLContextLost = () => {
      useGameStore.getState().notify('info', 'Graphics context lost', 'Reload the page to continue.');
    };

    // Click canvas → resume pointer lock while playing
    canvas.addEventListener('click', () => {
      const s = useGameStore.getState();
      if (s.phase === 'playing' && !s.overlay && !s.dialogue && !this.input.pointerLocked) {
        this.input.requestLock();
      }
    });

    // Esc exits pointer lock → open pause menu automatically (debounced so a
    // failed lock request right after resuming doesn't instantly re-pause)
    document.addEventListener('pointerlockchange', () => {
      const s = useGameStore.getState();
      if (
        !this.input.pointerLocked &&
        s.phase === 'playing' &&
        !s.overlay &&
        !s.dialogue &&
        !s.introActive &&
        performance.now() - this.lastResumeAt > 1200
      ) {
        this.pause();
      }
    });

    // Escape while playing without pointer lock → pause as well
    // (but never while a panel owns the screen: overlays, dialogue, the
    // merchant's shop, the forge station, a toll negotiation — their own
    // ESC handlers close them instead)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      const s = useGameStore.getState();
      if (s.phase === 'playing' && !s.overlay && !s.dialogue && !s.shop && !s.forge && !s.negotiation) {
        this.pause();
      }
    });

    this.engine.addUpdater((dt) => this.update(dt));
  }

  // ---------------------------------------------------------------- boot

  async boot(): Promise<void> {
    const store = useGameStore.getState();
    store.setProgress(0.02, 'Unfurling the sails…');
    await new Promise((r) => setTimeout(r, 30));

    const world = await buildWorld(
      this.engine.scene, this.colliders, this.state, this.settings.tier,
      (frac, label) => store.setProgress(0.05 + frac * 0.75, label),
      {
        renderChunks: graphicsOf(this.settings).renderChunks,
        grass3d: graphicsOf(this.settings).grass3d,
        grassDensity: QUALITY_PRESETS[this.settings.tier].grassDensity,
      },
    );
    this.world = world;
    // Fase 8/13 — boot-time quality ladder (fog · water detail · NPC distance)
    const gfx0 = graphicsOf(this.settings);
    const q0 = this.engine.quality;
    world.sky.qualityFogMul = fogMulForChunks(q0.fogMul, gfx0.renderChunks, QUALITY_PRESETS[this.settings.tier].viewChunkRadius);
    world.water.applyGraphicsOptions({
      segments: q0.waterSegments,
      waveRadius: q0.waveMotionRadius,
      refl: gfx0.reflections,
      waves: gfx0.waves,
    });
    // Fase 14 — nubes por escalón + pasto fuera del reflejo + llenado suave
    world.sky.setCloudQuality(CLOUD_QUAL[this.settings.tier]);
    world.water.reflHide = world.vegetation.grassMeshes;
    const fills0 = this.settings.tier === 'ultra' ? 8 : this.settings.tier === 'high' ? 6 : this.settings.tier === 'medium' ? 3 : 4;
    world.vegetation.setGrassDensity(q0.grassDensity, fills0);
    // Fase 14 — presupuesto de llamas simultáneas por escalón
    try { getFlameFX().setBudget(FLAME_BUDGET[this.settings.tier]); } catch { /* sin escena aún */ }
    this.npcAnimDistance = q0.npcAnimDistance;
    this.engine.camera.far = cameraFarForChunks(gfx0.renderChunks);
    this.engine.camera.updateProjectionMatrix();

    // Fase 4 — cinematic post chain (Ultra), attached to the engine loop
    this.postfx = new PostFX(this.engine.renderer, this.engine.scene, this.engine.camera);
    this.postfx.setEnabled(this.engine.quality.postfx);
    this.engine.postfx = this.postfx;

    // Fase 4 — repository music (ambient sea theme) as a soft bed under the
    // procedural score. Starts muted until a user gesture unlocks audio.
    this.musicEl = new Audio(`${ASSET_BASE}game/audio/ambient_sea.mp3`);
    this.musicEl.loop = true;
    this.musicEl.volume = 0;

    store.setProgress(0.82, 'Waking the explorer…');
    // --- Fase 5: the repository knight becomes the player's body ---
    // The kits were already exploded during buildWorld (world.dressing);
    // here we only load the rigged knight and wire the same kit instance.
    const kits = world.kits;
    // Fase 25 — warm the user's uploaded weapon models (greatsword + longbow)
    // so the (synchronous) weapon factory can hand them out instantly.
    await initGlbWeapons(world.assets);
    let playerVisual;
    try {
      // Fase 25 — the NEW body: the user's lightweight A-pose armour model
      // (medieval_knight_armour.glb), auto-rigged offline onto the game's
      // 15-bone skeleton + cape chain (scripts/rig_armour.ts), so the whole
      // procedural animation layer (run/jump/dodge/swim/ride/block/bow/
      // attack curves + cloth cape) drives it unchanged. Falls back to the
      // earlier rigged knights if the file is missing.
      let knightScene: THREE.Object3D;
      try {
        knightScene = await world.assets.loadModel('knight_armour_rigged.glb');
      } catch {
        try {
          knightScene = await world.assets.loadModel('medieval_knight_rigged.glb');
        } catch {
          knightScene = await world.assets.loadModel('knight_rigged.glb');
        }
      }
      playerVisual = new KnightModelGLB({
        scene: knightScene,
        // Fase 25 — the hero's steel is the user's uploaded greatsword
        // (medieval_sword.glb, grip-normalized + forge-tier glow); the bow is
        // the uploaded longbow. Everything else keeps its kit model, and a
        // missing file falls back to the HeroSword / kit bow.
        weaponFactory: (kind) => (kind === 'sword'
          ? buildGlbSword() ?? buildHeroSword({
              tier: this.state?.swordTier ?? 0,
              element: swordElementOf(this.state?.equippedWeapon) ?? undefined,
            })
          : kind === 'bow'
            ? buildGlbBow() ?? kits.weapon('bow')
            : kits.weapon(kind)),
        shieldFactory: () => kits.create('shield_02'),
      });
      playerVisual.root.scale.setScalar(1.0);
    } catch {
      playerVisual = undefined; // procedural fallback body
    }
    this.player = new Player(this.engine.scene, playerVisual);
    this.player.onFootstep = (surface) => this.audio.playFootstep(surface);
    // Fase 4 — the waving surface is the single swimming reference, and
    // entering/leaving the water splashes
    this.player.waterHeightAt = (x, z) => world.water.waveHeightAt(x, z);
    this.player.onWaterEvent = (kind, speed) => {
      if (kind === 'enter') {
        this.vfx?.waterSplash(this.player!.position.clone(), Math.min(1.4, speed));
        this.audio.playEvent('splash');
        // Fase 12 — a real wake ring spreads from the dive.
        // Fase 16 — only with waves ON: a flat sea turns the ring into a
        // bloom-like blob (player request: no water physics on low graphics).
        if (gfxRuntime.waves) {
          world.water.addWake(
            this.player!.position.x, this.player!.position.z,
            Math.min(1, 0.4 + speed * 0.4), 9 + speed * 9, 3.4 + speed * 1.4,
          );
        }
      } else {
        this.vfx?.waterSplash(this.player!.position.clone(), 0.5);
        if (gfxRuntime.waves) {
          world.water.addWake(this.player!.position.x, this.player!.position.z, 0.3, 7, 3);
        }
      }
    };
    this.player.onDamaged = (amount) => {
      this.audio.playEvent('damage');
      useGameStore.getState().notify('info', `You lost ${amount} health`, 'That was a hard fall.');
    };
    this.player.onAttackSwing = () => this.audio.playEvent('swing');
    this.rig = new CameraRig(this.engine.camera);
    this.rig.sensitivity = this.settings.sensitivity;
    this.rig.invertY = this.settings.invertY;

    // Naval layer (Fase 2): the player's caravel + the pirate fleets
    this.naval = new NavalSystem(
      this.engine.scene, world.terrainHeight, world.water, this.state,
      {
        notify: (kind, title, body) => useGameStore.getState().notify(kind, title, body),
        sound: (kind) => this.audio.playEvent(kind),
        music: (intensity) => {
          this.musicIntensityTarget = intensity;
        },
        setFlag: (flag) => this.state.setFlag(flag),
        lore: (title, paragraphs) => this.dialogue.startLore(title, paragraphs),
        closeDialogue: () => this.dialogue.close(),
        playerDamage: (amount, source) => this.applyPlayerDamage(amount, undefined, undefined, source ?? 'naval'),
        wasParried: () => (this.player?.parryT ?? 0) > 0,
        onFinisher: (x, y, z) => {
          // Fase 9 — the hero's execution blow: face the target, swing heavy
          const p = this.player!;
          p.yaw = Math.atan2(x - p.position.x, z - p.position.z);
          p.attackKind = 'heavy';
          p.attackDur = 0.85;
          p.attackT = 0.001;
          this.rig?.punch(0.85);
          this.audio.playEvent('hit_scale');
        },
        returnPlayerToShip: (ship) => this.takeHelm(ship),
      },
    );
    this.naval.dockSpawn = world.dockSpawn;
    // Fase 9 — every hull is solid: no walking through ships, real bulwarks
    this.naval.bindColliders(this.colliders);

    // Fase 7 — every ship wears the repository's pirate_ship.glb hull
    // (caravels are re-canvassed to warm cream, pirates keep the black sails)
    this.naval.shipModelLoader = () =>
      world.assets.loadModel('pirate_ship.glb').catch(() => null);

    // --- Fase 3: VFX pool, player combat and the dragons of Eldoria ---
    this.vfx = new VfxSystem(this.engine.scene);
    this.combat = new CombatSystem(this.engine.scene, this.player, this.state, this.vfx, {
      sound: (kind) => this.audio.playEvent(kind),
      notify: (kind, title, body) => useGameStore.getState().notify(kind, title, body),
      dragonMelee: (origin, yaw, reach, arc) =>
        this.dragons ? this.dragons.meleeHitCheck(origin, yaw, reach, arc) : null,
      damageDragon: (dragon, amount, heavy) => {
        this.dragons?.damage(dragon, amount, heavy);
        this.musicIntensityTarget = Math.max(this.musicIntensityTarget, 0.7);
      },
      crewHit: (origin, yaw, dmg, reach, arc) => {
        const hit = this.naval!.crewHitCheck(origin, yaw, dmg, reach, arc);
        if (hit) this.state.giveXp(5);
        return hit;
      },
      dummyHit: (origin, yaw) => {
        const d = this.world!.dummyPos;
        const dx = d.x - origin.x;
        const dz = d.z - origin.z;
        if (Math.hypot(dx, dz) < 2.3) {
          const facing = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
          if (facing > 0) {
            this.state.giveXp(2);
            return true;
          }
        }
        return false;
      },
      aimRay: () => {
        const cam = this.engine.camera;
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        return { origin: cam.position.clone(), dir };
      },
      // Fase 10 — red knight bandits: the player's steel finds them too
      banditMelee: (origin, yaw, reach, arc) =>
        this.bandits ? this.bandits.meleeHitCheck(origin, yaw, reach, arc) : null,
      damageBandit: (bandit, amount, heavy) => {
        this.bandits?.damage(bandit, amount, heavy);
        this.musicIntensityTarget = Math.max(this.musicIntensityTarget, 0.55);
      },
      // Fase 11 — multi-target sweeps (spin finishers) + radial AoE (plunge)
      banditMeleeMulti: (origin, yaw, reach, arc, max) =>
        this.bandits ? this.bandits.meleeHitCheckMulti(origin, yaw, reach, arc, max) : [],
      banditMeleeRadius: (center, radius, max) =>
        this.bandits ? this.bandits.meleeHitCheckRadius(center, radius, max) : [],
      // Fase 11 — a whiff: nearby bandits snap into a weapon-up guard
      onWhiff: (pos) => this.bandits?.onPlayerWhiff(pos),
      // Fase 12 — elemental sword connected: element burst at the impact
      elementalHit: (pos, element) => this.vfx?.elementalBurst(pos, element),
      // ---- Fase 17 — the Spider-Man-grade layer ----
      hookTarget: (origin, yaw, maxDist) =>
        this.bandits ? this.bandits.hookTargetCheck(origin, yaw, maxDist) : null,
      launchBandit: (bandit, vy) => this.bandits?.launch(bandit, vy),
      juggleBandit: (bandit) => this.bandits?.juggle(bandit),
      airborneBanditNear: (pos, radius) =>
        this.bandits ? this.bandits.airborneNear(pos, radius) : null,
      holdBanditAt: (bandit, x, y, z) => this.bandits?.holdBanditAt(bandit, x, y, z),
      throwBandit: (bandit, dx, dz, power) => this.bandits?.throwBandit(bandit, dx, dz, power),
      knockdownBandit: (bandit, dur) => this.bandits?.knockdown(bandit, dur),
      turnBanditBack: (bandit, dur) => this.bandits?.turnBanditBack(bandit, dur),
      pullBandit: (bandit, dx, dz) => this.bandits?.pullBandit(bandit, dx, dz),
      finisherTarget: (playerPos) =>
        this.bandits ? this.bandits.finisherTarget(playerPos) : null,
    });
    this.combat.dragonHitRef = (pos, radius) =>
      this.dragons ? this.dragons.projectileHitTest(pos, radius) : null;
    // Fase 10 — arrows also clip the bandits
    this.combat.banditHitRef = (pos, radius, prev) =>
      this.bandits ? this.bandits.projectileHitTest(pos, radius) : null;
    this.combat.damageBanditRef = (bandit, amount) => {
      this.bandits?.damage(bandit, amount, false);
    };
    this.combat.terrainHeightRef = (x, z) => world.terrainHeight.height(x, z);
    // Fase 22 — THE FORGE wiring: bandit DoT statuses (burn/poison finally
    // bite), radial queries for ember patches + mythic actives, the daylight
    // factor for Apollo's blessing, and the rain the Tide-Steel drinks
    this.combat.banditStatusRef = (bandit, kind, dur) => this.bandits?.applyStatus(bandit, kind, dur);
    this.combat.banditsInRadiusRef = (pos, r) =>
      this.bandits ? this.bandits.banditsInRadius(pos, r) : [];
    this.combat.dayFactorRef = () => {
      const w = this.world;
      if (!w) return 0;
      const f = w.sky.dayFraction;
      return f > 0.25 && f < 0.78 ? 1 : 0; // daylight window
    };
    this.combat.isRainingRef = () => (this.world?.weather.kind === 'rain' || this.world?.weather.kind === 'storm');
    // Fase 9 — combat camera punch: parries/counters/finishers kick the FOV
    this.combat.onCameraPunch = (i) => this.rig?.punch(i);
    // Fase 11 — hit-stop (a slow-mo beat on decisive blows) + HUD fight labels
    this.combat.onHitStop = (dur) => { this.hitStopT = Math.max(this.hitStopT, dur); };
    this.combat.onCombatEvent = (label) => this.combat?.flashEvent(label);
    // Fase 17 — Sea Fury (Valor) mirrors to the HUD bar
    this.combat.onValorChange = (v) => useGameStore.getState().setValor(v);
    // Fase 9 — cinematic store sync (letterbox + title cards)
    this.cinematicsPlaySetup();
    this.dragons = new DragonManager(
      this.engine.scene, world.terrainHeight, this.state, this.vfx,
      {
        notify: (kind, title, body) => useGameStore.getState().notify(kind, title, body),
        sound: (kind) => this.audio.playEvent(kind),
        music: (intensity, boss) => {
          this.musicIntensityTarget = intensity;
          this.audio.bossIntensity = boss ? 1 : 0;
        },
        setFlag: (flag) => this.state.setFlag(flag),
        addItem: (id, count) => this.state.addItem(id, count),
        giveXp: (xp) => this.state.giveXp(xp),
        bossHud: (s) => useGameStore.getState().setBoss(s),
        playerDamage: (dmg, fromX, fromZ, reason) => this.applyPlayerDamage(dmg, fromX, fromZ, reason),
        shipDamage: (dmg) => {
          this.naval?.playerShip?.applyDamage(dmg);
        },
        cameraShake: (i) => { this.shakeT = Math.max(this.shakeT, i); },
        bossDefeated: (d) => this.playBossVictoryCinematic(d),
      },
      world.assets,
    );
    // Broadside cannons can clip the sea wyvern mid-flight (swept collision)
    this.naval.dragonHitTest = (pos, prev) => {
      const d = this.dragons?.projectileHitTest(pos, 1.2, prev);
      return d ? { damage: (amount: number) => this.dragons!.damage(d, amount, true) } : null;
    };

    // --- Fase 15 — SEA BEASTS + PIRATE AMBUSHES on the high seas ---
    this.seaBeasts = new SeaBeastSystem(
      this.engine.scene, world.terrainHeight, world.water, this.state, this.vfx!, {
        notify: (kind, title, body) => useGameStore.getState().notify(kind, title, body),
        sound: (kind) => this.audio.playEvent(kind),
        music: (intensity, boss) => {
          this.musicIntensityTarget = intensity;
          this.audio.bossIntensity = boss ? 1 : 0;
        },
        bossHud: (s) => useGameStore.getState().setBoss(s),
        shipDamage: (dmg) => {
          const hull = this.naval?.activeShip ?? this.naval?.playerShip;
          hull?.applyDamage(dmg);
        },
        playerDamage: (dmg, fromX, fromZ, reason) =>
          this.applyPlayerDamage(dmg, fromX, fromZ, reason ?? 'serpent'),
        cameraShake: (i) => { this.shakeT = Math.max(this.shakeT, i); },
      },
    );
    this.naval.seaBeasts = this.seaBeasts;
    this.pirateAmbush = new PirateAmbushSystem(
      world.terrainHeight, this.state, this.naval, {
        notify: (kind, title, body) => useGameStore.getState().notify(kind, title, body),
        sound: (kind) => this.audio.playEvent(kind),
        music: (intensity) => { this.musicIntensityTarget = intensity; },
        negotiation: (n) => useGameStore.getState().setHud({ negotiation: n }),
      },
    );
    this.player.onBlockSparks = (pos) => {
      this.vfx!.blockSparks(pos);
      this.audio.playEvent('block');
      this.player!.model.blockImpact?.();
    };
    this.naval.onDisembark = (spot) => {
      const p = this.player!;
      const g = world.terrainHeight.height(spot.x, spot.z);
      p.teleport(spot.x, Math.max(g, 1.2), spot.z);
      p.platformProbe = undefined;
      this.rig!.setShipMode(null);
    };
    this.naval.onShipRespawned = () => {
      const p = this.player!;
      const sp = world.village.spawnPoint;
      p.teleport(sp.x, Math.max(world.terrainHeight.height(sp.x, sp.z), 1.5), sp.z);
      p.platformProbe = undefined;
      this.rig!.setShipMode(null);
    };
    this.naval.onBoardingStarted = (enemy) => {
      const p = this.player!;
      const deck = enemy.toWorld(0, 0, 3.4);
      p.teleport(deck.x, enemy.deckHeightAt(0, 3.4) ?? 1, deck.z);
      p.yaw = enemy.heading + Math.PI;
      p.velocity.set(0, 0, 0);
      p.platformProbe = (x, z) => {
        const local = enemy.toLocal(x, z);
        return enemy.deckHeightAt(local.x, local.y);
      };
      this.rig!.setShipMode(null);
      this.state.setFlag('boarding_fought');
    };
    this.naval.spawnEnemies();

    // --- Fase 4: horses, carts, endings ---
    this.mounts = new MountSystem(this.engine.scene, world.terrainHeight, this.colliders, {
      sound: (kind) => this.audio.playEvent(kind as Parameters<AudioSystem['playEvent']>[0]),
      notify: (kind, title, body) => useGameStore.getState().notify(kind, title, body),
      dust: (pos, strength) => this.vfx?.landingDust(pos, Math.round(6 * strength), 0.7),
      splash: (pos, strength) => this.vfx?.waterSplash(pos, strength),
      setFlag: (flag) => this.state.setFlag(flag),
      hasFlag: (flag) => this.state.hasFlag(flag),
      spendGold: (amount) => {
        if (!this.state.hasItem('coin', amount)) return false;
        this.state.removeItem('coin', amount);
        return true;
      },
    });
    // Tormenta (the Order's warhorse, gift of q10) + Halvard's stock
    // Fase 18 — the stable moved west of the green (-14, 187)
    this.mounts.spawnHorse('tormenta', 'Tormenta', 'black', -10, 190, false, 0);
    this.mounts.spawnHorse('alazan', 'Meadow Chestnut', 'chestnut', -50, -100, false, 220);
    this.mounts.spawnHorse('gris', 'Grey of the West', 'grey', -250, -190, false, 260);
    // The stable cart
    this.mounts.spawnCart('carreta', -8, 192, 0.4);
    this.endings = new EndingSystem(this.state);

    // --- Fase 10: RED KNIGHT bandits camped on the roads ---
    this.bandits = new BanditSystem(
      this.engine.scene, world.terrainHeight, world.assets, world.kits,
      {
        playerDamage: (dmg, fromX, fromZ, reason, opts) => this.applyPlayerDamage(dmg, fromX, fromZ, reason ?? 'bandit', opts),
        sound: (kind) => this.audio.playEvent(kind),
        notify: (kind, title, body) => useGameStore.getState().notify(kind, title, body),
        giveXp: (xp) => this.state.giveXp(xp),
        addCoins: (n) => this.state.addItem('coin', n),
        weaponImpact: (pos) => this.vfx?.weaponImpact(pos),
        blockSparks: (pos) => this.vfx?.blockSparks(pos),
        cameraShake: (i) => { this.shakeT = Math.max(this.shakeT, i); },
        hitStop: (dur) => { this.hitStopT = Math.max(this.hitStopT, dur); },
        // Fase 12 — bounty counters + KILL STREAK dopamine
        onBanditKilled: (captain) => this.registerCombatKill(captain ? 'CAPTAIN DOWN!' : ''),
        // Fase 22 — THE FORGE: legend loot + persistence + the boss bar
        addItem: (id, count) => this.state.addItem(id, count),
        hasFlag: (flag) => this.state.hasFlag(flag),
        setFlag: (flag) => this.state.setFlag(flag),
        bossHud: (s) => useGameStore.getState().setBoss(s),
      },
    );

    // --- Fase 22 — THE FORGE OF LEGENDS: the crafting engine ---
    this.forge = new ForgeSystem(this.state, {
      notify: (kind: 'info' | 'item' | 'quest', title: string, body?: string) =>
        useGameStore.getState().notify(kind, title, body),
      sound: (id: Parameters<typeof this.audio.playEvent>[0]) => this.audio.playEvent(id),
      sparks: (pos: THREE.Vector3) => this.vfx?.blockSparks(pos.clone().add(new THREE.Vector3(0, 1.0, 0))),
      cameraShake: (i: number) => { this.shakeT = Math.max(this.shakeT, i); },
    });

    // Fase 12 — AMBUSHES: gathering quest materials can wake the red
    // knights. Not every pickup — the threat must stay a surprise.
    const AMBUSH_ITEMS = new Set(['petalo', 'madera', 'lona', 'cuerda', 'cargamento', 'petalo_marfil']);
    this.state.onItemGained = (id) => {
      // Fase 12 — a better sword leaps INTO your hand the moment you claim it
      // (boss legendaries: the blade is burning before the loot banner fades)
      const rank = SWORD_PRIORITY.indexOf(id);
      if (rank >= 0) {
        // SWORD_PRIORITY is BEST-FIRST: a lower index beats the current one
        const cur = this.state.equippedWeapon;
        const curRank = cur ? SWORD_PRIORITY.indexOf(cur) : Infinity;
        if (rank < curRank) {
          this.state.equip(id);
          this.combat?.refreshVisuals();
          this.syncSwordVisuals();
          useGameStore.getState().notify('item', 'LEGENDARY SWORD!', 'The new steel leaps to your hand. Wield it with key 1.');
        }
        return;
      }
      if (!AMBUSH_ITEMS.has(id)) return;
      if (this.ambushCd > 0 || !this.player || !this.bandits) return;
      if (Math.random() > 0.4) return;
      this.ambushCd = 55;                       // no machine-gun ambushes
      const n = 2 + Math.floor(Math.random() * 2);
      this.bandits.spawnAmbush(this.player.position.x, this.player.position.z, n);
      this.combat?.flashEvent('AMBUSH!');
      useGameStore.getState().notify('quest', 'AMBUSH!', 'Red knights of the Crow burst from the underbrush!');
      this.musicIntensityTarget = Math.max(this.musicIntensityTarget, 0.85);
      this.audio.playEvent('stagger');
      this.rig?.punch(0.5);
    };

    // Fase 10 — the marometa kick: camera pulse + whoosh on double jump
    this.player.onDoubleJump = () => {
      this.rig?.punch(0.42);
      this.audio.playEvent('swing');
    };

    // Fase 22 — ARMADURA ANCESTRAL: Draconic Retribution — melee wounds to
    // the titan-skin answer with a burning shockwave around the wearer
    this.player.onRetaliation = (fromX, fromZ) => {
      const p = this.player!;
      const at = new THREE.Vector3(p.position.x, p.position.y + 1.0, p.position.z);
      this.vfx?.elementalBurst(at, 'fire');
      this.vfx?.firePuff(at, 1.6);
      this.audio.playEvent('fire');
      if (this.bandits) {
        for (const h of this.bandits.banditsInRadius(at, 3.2)) {
          this.bandits.damage(h.bandit, 26, false);
          this.bandits.applyStatus(h.bandit, 'burn', 2.5);
        }
      }
      void fromX; void fromZ;
    };

    for (const def of world.npcDefs) {
      // Fase 8 — NPCs wear the repository's fuse_civilian_2.glb (Mixamo
      // civilian, procedurally animated idle/walk/talk). Falls back to the
      // procedural VillagerModel when the GLB is unavailable.
      let visual: CharacterVisual | undefined;
      try {
        const pal = villagerPalette(def.paletteIndex);
        const seed = def.paletteIndex * 13.7 + def.name.length;
        visual = new VillagerModelGLB({
          palette: pal,
          seed,
          role: def.role,
          assets: world.assets,
          fallback: () => new VillagerModel(pal, seed, def.role),
        });
      } catch {
        visual = undefined;
      }
      this.npcs.push(new NPC(def, this.engine.scene, visual));
    }

    this.buildInteractables();
    this.installApi();
    // Debug/testing hooks (harmless in production)
    (window as unknown as { __kotfsGame?: Game }).__kotfsGame = this;
    // Fase 16 — the live gameApi for E2E probes (adminSpawn lives there)
    (window as unknown as { __kotfsApi?: typeof gameApi }).__kotfsApi = gameApi;
    // Fase 12 — debug/E2E hook: live HUD store reads
    (window as unknown as { __kotfsStoreGet?: () => unknown }).__kotfsStoreGet = () => useGameStore.getState();

    // Menu ambience: golden hour over the bay
    world.sky.dayFraction = 0.78;
    this.player.teleport(world.village.spawnPoint.x, world.village.spawnPoint.y, world.village.spawnPoint.z);

    store.setProgress(1, 'Eldoria awaits…');
    store.setHasSave(SaveSystem.newestSlot() !== null);
    await new Promise((r) => setTimeout(r, 250));
    store.setPhase('menu');
    this.engine.start();
  }

  // -------------------------------------------------------- interactables

  private buildInteractables(): void {
    const w = this.world!;
    const state = this.state;
    const audio = this.audio;
    const store = useGameStore;
    const terrainH = (x: number, z: number) => w.terrainHeight.height(x, z);

    // --- Chests ---
    const wreck = POIS.find((p) => p.id === 'wreck')!;
    for (const chest of w.chests) {
      w.interactables.push({
        id: chest.id,
        pos: chest.pos,
        radius: 2.4,
        get prompt() {
          if (chest.id === 'chest_eirik') {
            return state.hasItem('amuleto') && !state.openedChests.has('chest_eirik')
              ? "Open Eirik's chest"
              : state.openedChests.has('chest_eirik') ? '' : "Inspect Eirik's chest";
          }
          return state.openedChests.has(chest.id) ? '' : 'Open the chest';
        },
        available: () =>
          chest.id === 'chest_eirik' ? !state.openedChests.has(chest.id) : true,
        run: () => {
          if (chest.id === 'chest_eirik') {
            if (!state.hasItem('amuleto')) {
              this.dialogue.startLore("Eirik's chest", [
                'A sea chest reinforced with iron bands. The clasp is strange: a circle of tides around a flame, cast in copper.',
                'There is no visible lock or hinge. "Only the amulet opens it," Aldric would say. Maren the herbalist knows where it is.',
              ]);
              return;
            }
            chest.handles.open();
            state.openedChests.add('chest_eirik');
            state.setFlag('chest_opened');
            state.interactMilestone('chest_eirik');
            audio.playEvent('chest');
            state.addItem('espada_eirik', 1);
            state.addItem('mapa', 1);
            state.addItem('carta', 1);
            state.giveXp(25);
            this.musicIntensityTarget = 0.7;
            store.getState().notify('quest', "Eirik's chest opens", "Eirik's Sword, the Ancient Map and Eirik's Letter added to your inventory.");
            store.getState().notify('info', "Read your father's letter", 'Open it from the inventory (TAB).');
            return;
          }
          if (state.openedChests.has(chest.id)) return;
          chest.handles.open();
          state.openedChests.add(chest.id);
          audio.playEvent('chest');
          state.giveXp(15);
          if (chest.id === 'chest_grotto') {
            state.addItem('colmillo', 1);
            state.addItem('coin', 25);
            store.getState().notify('item', 'Treasure found', 'A carved fang and 25 gold coins.');
          } else if (chest.id === 'chest_wreck') {
            state.addItem('coin', 18);
            state.addItem('pocion', 1);
            store.getState().notify('item', 'Treasure found', '18 gold coins and a healing potion.');
          } else if (chest.id === 'chest_falls') {
            state.addItem('coin', 20);
            state.addItem('petalo', 1);
            store.getState().notify('item', 'Treasure found', '20 gold coins and an ivory petal.');
          } else if (chest.id === 'chest_crow') {
            state.addItem('botin', 1);
            state.addItem('coin', 60);
            store.getState().notify('item', "The Crow's loot", "The Crow's Loot and 60 gold coins, torn from the pirate den.");
          } else if (chest.id === 'chest_faro') {
            state.addItem('espejo', 1);
            state.addItem('coin', 30);
            store.getState().notify('item', 'The lighthouse mirror', "The Wardens' old brass mirror and 30 coins.");
          } else if (chest.id === 'chest_bruma') {
            state.addItem('escama', 1);
            state.addItem('petalo', 2);
            state.addItem('coin', 35);
            store.getState().notify('item', 'Something stirs in the chest', 'A sleeping scale, two ivory petals and 35 coins. Read it from the inventory (TAB).');
          } else if (chest.id === 'chest_lanza') {
            state.addItem('lanza_caza', 1);
            state.addItem('flecha', 6);
            state.addItem('coin', 15);
            store.getState().notify('item', "The watchman's arsenal", 'Hunting Spear, 6 arrows and 15 coins. Equip it with key 3.');
          } else if (chest.id === 'chest_arco') {
            state.addItem('arco_naufragio', 1);
            state.addItem('flecha', 12);
            state.addItem('coin', 10);
            store.getState().notify('item', 'The tide-stranded bow', 'Wreck Bow and 12 arrows. Equip it with key 4: hold the click to draw.');
          } else if (chest.id === 'chest_tesoro') {
            state.addItem('mapa_tesoro', 1);
            state.addItem('coin', 25);
            store.getState().notify('item', "The Captain's map", 'Drawn in charcoal and octopus blood. An X marks the lighthouse cove. Read it from the inventory (TAB).');
          } else if (chest.id === 'chest_antigua_1' || chest.id === 'chest_antigua_2' || chest.id === 'chest_antigua_3') {
            state.addItem('moneda_antigua', 1);
            state.addItem('coin', 30);
            store.getState().notify('item', 'Thalassar coin', 'Old gold from the sunken kingdom. Erica pays well for these.');
          } else if (chest.id === 'chest_crow_settlement') {
            state.addItem('flecha_perforante', 6);
            state.addItem('coin', 45);
            store.getState().notify('item', 'The smugglers\' cache', 'Six bodkin piercing arrows and 45 coins, wrapped in oilcloth. Cycle arrow families with X.');
          } else if (chest.id === 'chest_crow_cove') {
            state.addItem('flecha_fuego', 5);
            state.addItem('coin', 30);
            store.getState().notify('item', 'A charred strongbox', 'Five fire arrows and 30 coins — pitch still wet, wicks still good.');
          } else if (chest.id === 'chest_crow_lookout') {
            state.addItem('flecha_electrica', 5);
            state.addItem('flecha_veneno', 4);
            state.addItem('coin', 35);
            store.getState().notify('item', 'The lookout\'s quiver', 'Storm-glass shock arrows, a bundle of poisoned heads, and 35 coins from the crow\'s nest.');
          }
        },
      });
    }

    // --- Fase 12 — CARTEL DE RECOMPENSAS (bounty board, plaza) ---
    {
      // Fase 18 — moved NE of the green: the old spot (33, 141) now lies
      // inside Erica's rebuilt cottage footprint.
      const boardX = 27, boardZ = 156;
      const boardY = terrainH(boardX, boardZ);
      const board = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9 }),
      );
      post.position.y = 1.3;
      post.castShadow = true;
      board.add(post);
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.0, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.85 }),
      );
      panel.position.y = 2.0;
      panel.castShadow = true;
      board.add(panel);
      // the red bounty sheet + the raven mark
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.72),
        new THREE.MeshStandardMaterial({ color: 0xa8281e, roughness: 0.8 }),
      );
      sheet.position.set(-0.3, 2.05, 0.05);
      board.add(sheet);
      const sheet2 = sheet.clone();
      sheet2.material = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.85 });
      sheet2.position.set(0.38, 1.98, 0.05);
      sheet2.rotation.z = 0.08;
      board.add(sheet2);
      board.position.set(boardX, boardY, boardZ);
      board.rotation.y = -0.6;
      this.engine.scene.add(board);
      w.interactables.push({
        id: 'bounty_board',
        pos: new THREE.Vector3(boardX, boardY, boardZ),
        radius: 2.6,
        get prompt() {
          if (state.isQuestActive('sq_cazarrecompensas')) {
            const k = state.killCounters.bandit ?? 0;
            return k >= 6 ? 'Claim the bounty (150 gold)' : `Hunt red knights (${k}/6)`;
          }
          if (state.isQuestActive('sq_tormenta_caminos')) {
            const k = state.killCounters.bandit ?? 0;
            return k >= 10 ? 'Claim the bounty (90 gold)' : `The hunt continues (${k}/10)`;
          }
          if (state.questStates?.get?.('sq_cazarrecompensas')?.status === 'completed' &&
              state.questStates?.get?.('sq_tormenta_caminos')?.status !== 'active') return '';
          return 'Read the bounty board';
        },
        run: () => {
          const st1 = state.questStates?.get?.('sq_cazarrecompensas')?.status;
          const st2 = state.questStates?.get?.('sq_tormenta_caminos')?.status;
          const kills = state.killCounters.bandit ?? 0;
          if (st1 !== 'active' && st1 !== 'completed') {
            state.startQuest('sq_cazarrecompensas');
            useGameStore.getState().notify('quest', 'NEW HUNT!', 'The Crow Hunt: 6 red knights. 150 gold coins on completion.');
            this.audio.playEvent('quest');
          } else if (st1 === 'active' && kills >= 6) {
            state.setFlag('interacted_bounty_board');
            useGameStore.getState().notify('item', 'Bounty collected', '150 gold coins and the Order\'s respect.');
          } else if (st2 === 'active' && kills >= 10) {
            // auto-completed by the kill objective; acknowledge the payoff
            useGameStore.getState().notify('item', 'The King\'s Road breathes', '90 more coins. The carts climb to the castle again.');
          } else {
            useGameStore.getState().notify(
              'info',
              'Bounty board',
              st1 === 'active'
                ? `Red knights felled: ${kills}/6. Their camps watch the King\'s Road, Vaelthara, the Vigils and the west coast.`
                : `Caza en curso: ${kills}/10 abatidos.`,
            );
          }
        },
      });
    }

    // --- Herbs ---
    for (const herb of w.herbs) {
      w.interactables.push({
        id: herb.id,
        pos: herb.pos,
        radius: 1.8,
        prompt: 'Pick up the ivory petal',
        available: () => !state.pickedHerbs.has(herb.id),
        run: () => {
          state.pickedHerbs.add(herb.id);
          herb.mesh.visible = false;
          const mult = state.learnedSkills.has('sup_botanico') ? 2 : 1;
          state.addItem('petalo', mult);
          audio.playEvent('pickup');
          state.giveXp(8);
          store.getState().notify(
            'item',
            mult > 1 ? 'Ivory petals ×2' : 'Ivory petal picked',
            'It grows where the water sings. Maren needs them.',
          );
        },
      });
    }

    // --- Rosa's crate (wreck) ---
    w.interactables.push({
      id: 'crate_rosa',
      pos: new THREE.Vector3(wreck.x + 4.5, terrainH(wreck.x + 4.5, wreck.z + 3.5), wreck.z + 3.5),
      radius: 2.2,
      prompt: 'Inspect the cargo',
      available: () => !state.hasFlag('rosa_crate_found'),
      run: () => {
        state.setFlag('rosa_crate_found');
        state.addItem('cargamento', 1);
        state.interactMilestone('crate_rosa');
        audio.playEvent('pickup');
        state.giveXp(10);
        store.getState().notify('item', "Rosa's cargo", 'The crate bears the Broken Anchor\'s seal. Rosa will pay well for this.');
      },
    });

    // --- Oak crates for the Colibrí refit (Fase 2) ---
    const oakCrates: Array<[string, number, number]> = [
      ['crate_madera_a', 17.5, 231.5],
      ['crate_madera_b', -326, 183],
      ['crate_madera_c', -100, -188],
    ];
    for (const [id, x, z] of oakCrates) {
      w.interactables.push({
        id,
        pos: new THREE.Vector3(x, terrainH(x, z), z),
        radius: 2.2,
        prompt: 'Pick up oak planks (×2)',
        available: () => !state.hasFlag(`oak_${id}`),
        run: () => {
          state.setFlag(`oak_${id}`);
          state.addItem('madera', 2);
          audio.playEvent('pickup');
          state.giveXp(6);
          store.getState().notify('item', 'Oak planks ×2', 'Oak cured under Bram\'s seal. Perfect for the Sea Hummingbird\'s hull.');
        },
      });
    }

    // --- The refit delivery point: the Colibrí itself ---
    w.interactables.push({
      id: 'colibri_refit',
      pos: new THREE.Vector3(w.village.shipPos.x, 0, w.village.shipPos.z),
      radius: 9,
      get prompt(): string {
        if (state.hasFlag('ship_repaired')) return '';
        const ready = state.hasItem('madera', 4) && state.hasItem('lona', 3) && state.hasItem('cuerda', 2);
        return ready
          ? 'Deliver the repair materials'
          : 'Inspect the Sea Hummingbird';
      },
      available: () => !state.hasFlag('ship_repaired'),
      run: () => {
        const ready = state.hasItem('madera', 4) && state.hasItem('lona', 3) && state.hasItem('cuerda', 2);
        if (!ready) {
          const missing: string[] = [];
          if (!state.hasItem('madera', 4)) missing.push(`madera (${Math.min(4, state.countItem('madera'))}/4)`);
          if (!state.hasItem('lona', 3)) missing.push(`lona (${Math.min(3, state.countItem('lona'))}/3)`);
          if (!state.hasItem('cuerda', 2)) missing.push(`cuerda (${Math.min(2, state.countItem('cuerda'))}/2)`);
          this.dialogue.startLore('The Sea Hummingbird', [
            'The hull waits among the scaffolds. Bram checks the list scribbled in charcoal on the deck.',
            `"Still missing: ${missing.join(', ')}. The oak sits in crates under my seal — the dock, the wreck coast and the waterfall path. Rosa readies the canvas and Tom holds the rope."`,
          ]);
          return;
        }
        state.removeItem('madera', 4);
        state.removeItem('lona', 3);
        state.removeItem('cuerda', 2);
        state.setFlag('ship_repaired');
        state.interactMilestone('colibri_refit');
        audio.playEvent('unlock');
        this.launchShip();
      },
    });

    // --- Lore tablets ---
    const addLore = (id: string, x: number, z: number, prompt: string) => {
      w.interactables.push({
        id,
        pos: new THREE.Vector3(x, terrainH(x, z), z),
        radius: 2.6,
        prompt,
        run: () => {
          const lore = LORE[id];
          this.dialogue.startLore(lore.title, lore.text);
          if (!state.hasFlag(`lore_${id}`)) {
            state.setFlag(`lore_${id}`);
            state.giveXp(10);
          }
        },
      });
    };
    addLore('tablet_ruins', -243, -135, 'Read the ancient tablet');
    addLore('stones_center', -140, -260, 'Touch the stone altar');
    addLore('tower_door', 300, 64.2, 'Inspect the walled-up door');
    addLore('ship_colibri', w.village.shipDeck.x, w.village.shipDeck.z, 'Gaze at the Sea Hummingbird');

    // --- Fase 22 — THE FORGE OF LEGENDS: the three stations ---
    // The panel is data-driven: recipes gate on materials + gold (and the
    // eclipse for Apollo), never on the UI's word.
    const FORGE_PROMPTS: Record<string, string> = {
      anvil: 'Work the Great Anvil',
      altar: 'Kneel at the Altar of the Gods',
      titans: 'Approach the Anvil of the Titans',
    };
    for (const [station, pos] of Object.entries(w.forgeStations)) {
      if (station === 'firstLight') continue;
      w.interactables.push({
        id: `forge_${station}`,
        pos: pos.clone(),
        radius: 3.2,
        prompt: FORGE_PROMPTS[station] ?? 'Use the forge station',
        available: () => true,
        run: () => {
          if (!this.forge) return;
          // release the pointer so the panel's buttons are clickable (the
          // panel's ESC/close path re-locks through clickResumeHint)
          this.input.releaseLock();
          useGameStore.getState().setForge({ station: station as 'anvil' | 'altar' | 'titans' });
        },
      });
    }

    // --- Fase 22 — THE FIRST LIGHT CACHE (old lighthouse): the sun essence ---
    {
      const fl = w.forgeStations.firstLight;
      w.interactables.push({
        id: 'first_light_cache',
        pos: fl.clone(),
        radius: 2.4,
        get prompt() {
          return state.hasFlag('first_light_taken') ? '' : 'Open the First Light cache';
        },
        available: () => !state.hasFlag('first_light_taken'),
        run: () => {
          if (state.hasFlag('first_light_taken')) return;
          state.setFlag('first_light_taken');
          state.addItem('esencia_solar', 1);
          state.giveXp(60);
          audio.playEvent('chest');
          this.vfx?.blockSparks(fl.clone().add(new THREE.Vector3(0, 0.9, 0)));
          this.dialogue.startLore('The First Light', [
            'Under a film of dust that has never once been disturbed, a bead of morning hangs in a cradle of gold wire. It does not light the room — it lights the ROOM THE ROOM IS IN.',
            'The lighthouse keepers called it "the wick of the world". The last one wrote, on the lid: "For the Altar, when the sky is needed."',
            'Primal Sun Essence taken. Present it at the Altar of the Gods, in the Circle of Vigils.',
          ]);
        },
      });
    }

    // --- Fase 22 — THE ANCESTOR'S HOARD: after Vaelyx falls, the nest can be
    //     searched once a day for scales, frozen blood… and RARELY the
    //     Crown of Primal Antlers ("one in a hundred times… come back, and
    //     back, and back" — the loop the lore promises). ---
    {
      const nest = w.forgeStations.titans;
      w.interactables.push({
        id: 'hoard_ancestor',
        pos: nest.clone().add(new THREE.Vector3(0, 0, 3.4)),
        radius: 3.0,
        get prompt() {
          if (!state.hasFlag('ancestro_dead')) return '';
          const today = Math.floor(useGameStore.getState().dayCount ?? 0);
          return state.hasFlag(`hoard_day_${today}`)
            ? 'The hoard has been picked clean today'
            : 'Search the hoard of the Ancestor';
        },
        available: () => state.hasFlag('ancestro_dead'),
        run: () => {
          const today = Math.floor(useGameStore.getState().dayCount ?? 0);
          if (state.hasFlag(`hoard_day_${today}`)) {
            useGameStore.getState().notify('info', 'Picked clean', 'The coins have not had time to grow back. Return tomorrow.');
            return;
          }
          state.setFlag(`hoard_day_${today}`);
          audio.playEvent('chest');
          // 18% the antlers; otherwise a consolation of scales and blood
          if (Math.random() < 0.18) {
            state.addItem('corona_astas', 1);
            state.giveXp(50);
            useGameStore.getState().notify('quest', 'THE CROWN OF PRIMAL ANTLERS',
              'Deep under the frozen coins, a crown of antlers that never stopped growing. The Anvil of the Titans is waiting.');
          } else {
            const scales = 1 + Math.floor(Math.random() * 2);
            state.addItem('escama_ancestral', scales);
            if (Math.random() < 0.5) state.addItem('placa_sangre', 1);
            state.giveXp(15);
            useGameStore.getState().notify('item', 'From the hoard',
              `${scales} × Ancestral Dragonscale${Math.random() < 0.5 ? ' and a plate of frozen blood' : ''}. The antlers are still out there — come back, and back, and back.`);
          }
        },
      });
    }

    // ===================== FASE 4 interactables =====================
    const f4 = w.fase4;

    // --- The sunken sanctuary: swim out & claim the Crown ---
    w.interactables.push({
      id: 'santuario_thalassar',
      pos: f4.altarThalassarPos.clone(),
      radius: 4.6,
      get prompt(): string {
        if (state.hasItem('corona_thalassar')) return '';
        return 'Plunge your hand into the altar hollow';
      },
      available: () => !state.hasItem('corona_thalassar') && !state.hasFlag('corona_taken'),
      run: () => {
        state.setFlag('corona_taken');
        state.setFlag('corona_thalassar_counted');
        state.addItem('corona_thalassar', 1);
        state.interactMilestone('santuario_thalassar');
        state.giveXp(60);
        audio.playEvent('chest');
        this.vfx?.waterSplash(f4.altarThalassarPos.clone(), 1.2);
        this.musicIntensityTarget = 0.7;
        store.getState().notify('item', 'The Crown of Thalassar', 'The sunken kings let go of their crown. The water hands it over… as if it had been waiting a hundred years for you.');
        store.getState().notify('info', 'A seat at the table', 'The Order kept three relics. With the Seal and the Heart already yours, Halvard waits at the stable on the north road.');
      },
    });

    // --- The flagship wreck: the Crow's navigation chart ---
    w.interactables.push({
      id: 'wreck_flagship',
      pos: f4.flagshipPos.clone(),
      radius: 9,
      get prompt(): string {
        if (state.hasFlag('flagship_looted')) return '';
        return 'Search the flagship cabin';
      },
      available: () => !state.hasFlag('flagship_looted'),
      run: () => {
        state.setFlag('flagship_looted');
        state.addItem('carta_navegacion', 1);
        state.addItem('estandarte_orden', 1);
        state.interactMilestone('wreck_flagship');
        state.giveXp(80);
        audio.playEvent('chest');
        store.getState().notify('item', "The Crow's chart", 'The Crow\'s Navigation Chart and the stolen Banner of the Order, torn from the flagship. The nameless cove lies at the foot of the fortress.');
      },
    });

    // --- Bram's forge: the Guardian blade + Fase 10 sword upgrades ---
    const forgePos = new THREE.Vector3(28, terrainH(28, 193), 193);
    const SWORD_UPGRADE_COST = [
      { gold: 120, scales: 0, label: 'Temper your sword (120 gold)' },
      { gold: 260, scales: 2, label: 'Grabar runas (260 oro + 2 escamas)' },
    ];
    w.interactables.push({
      id: 'forge_guardian',
      pos: forgePos,
      radius: 3.4,
      get prompt(): string {
        if (!state.hasItem('espada_guardian')) {
          const ready = state.hasItem('colmillo_ancestro', 1) && state.hasItem('escama', 3);
          if (ready) return 'Forge the Warden\'s Sword';
        }
        // Fase 10 — progressive upgrades for the sword you carry
        if (state.swordTier < SWORD_UPGRADE_COST.length) {
          const cost = SWORD_UPGRADE_COST[state.swordTier];
          const hasSword = state.hasItem('espada_acero') || state.hasItem('espada_eirik') || state.hasItem('espada_guardian');
          if (hasSword && state.hasItem('coin', cost.gold) && state.hasItem('escama', cost.scales)) {
            return cost.label;
          }
          if (hasSword) {
            return `Bram\'s forge — upgrade your sword (${cost.gold} gold${cost.scales ? ` + ${cost.scales} scales` : ''})`;
          }
        }
        return 'Bram\'s forge';
      },
      available: () => true,
      run: () => {
        // 1 — the legendary Guardian blade (chapter quest)
        if (!state.hasItem('espada_guardian')) {
          const ready = state.hasItem('colmillo_ancestro', 1) && state.hasItem('escama', 3);
          if (ready) {
            state.removeItem('colmillo_ancestro', 1);
            state.removeItem('escama', 3);
            state.addItem('espada_guardian', 1);
            state.interactMilestone('forge_guardian');
            state.giveXp(100);
            audio.playEvent('unlock');
            this.musicIntensityTarget = 0.85;
            store.getState().notify('item', "The Warden's Sword!", 'Forged from the Ancestor\'s Fang. Equip it from the inventory (TAB): terrible damage, oath included.');
            return;
          }
        }
        // 2 — Fase 10: upgrade the sword you carry
        if (state.swordTier < SWORD_UPGRADE_COST.length) {
          const cost = SWORD_UPGRADE_COST[state.swordTier];
          const hasSword = state.hasItem('espada_acero') || state.hasItem('espada_eirik') || state.hasItem('espada_guardian');
          if (
            hasSword && state.hasItem('coin', cost.gold) && state.hasItem('escama', cost.scales)
          ) {
            state.removeItem('coin', cost.gold);
            if (cost.scales > 0) state.removeItem('escama', cost.scales);
            state.swordTier += 1;
            state.giveXp(30);
            audio.playEvent('unlock');
            audio.playEvent('chest');
            this.syncSwordVisuals();
            const tierName = SWORD_TIER_NAMES[state.swordTier] ?? '';
            store.getState().notify(
              'item',
              `Your sword improves:${tierName}`,
              state.swordTier === 1
                ? 'Bram tempers the red-hot steel: +30% damage and an edge that sings.'
                : 'Tide runes fire-etched into the blade: +70% damage and a blue gleam on the steel.',
            );
            this.autosave();
            return;
          }
        }
        this.dialogue.startLore('The forge sings', [
          'Bram wipes his hands on the apron: "The steel of this old forge has watched kings fall. Bring me gold — and scales, if you want runes — and I will temper that sword of yours until it sings."',
          'The forge fire pulses like an impatient heart.',
        ]);
      },
    });

    // --- The black altar: awaken Kraivenn ---
    w.interactables.push({
      id: 'altar_cuervo',
      pos: f4.altarCuervoPos.clone(),
      radius: 4.2,
      get prompt(): string {
        if (state.hasFlag('kraivenn_awake')) return '';
        return 'Lay down the relics and wake the Crow';
      },
      available: () => state.hasFlag('kraivenn_seen') && !state.hasFlag('kraivenn_awake'),
      run: () => {
        this.dialogue.startLore('The black altar drinks the light', [
          'You set the Seal, the Crown and the Heart in the three hollows. The stone is colder than the sea.',
          'The silence of the cove becomes absolute — the water does not lap, the wind does not breathe.',
          'And then, from the depth of the basalt, something enormous opens a red eye.',
        ]);
        // The awakening happens when the lore dialogue closes
        const waitAwake = setInterval(() => {
          if (!useGameStore.getState().dialogue) {
            clearInterval(waitAwake);
            if (!this.state.hasFlag('kraivenn_awake')) {
              this.dragons?.awakenKraivenn();
              this.musicIntensityTarget = 1;
            }
          }
        }, 300);
      },
    });

    // --- The Altar of the Tides at the Ancestro's nest (q14) ---
    w.interactables.push({
      id: 'altar_marea',
      pos: f4.altarMareaPos.clone(),
      radius: 4.4,
      get prompt(): string {
        if (state.hasFlag('ending_done')) return '';
        const ready = state.hasItem('corona_thalassar') && state.hasItem('corazon_cuervo') && state.hasItem('sello');
        return ready ? 'Present the three relics to the altar' : 'Altar of the pact (requires Seal, Crown and Heart)';
      },
      available: () => !state.hasFlag('ending_done'),
      run: () => {
        const ready = state.hasItem('corona_thalassar') && state.hasItem('corazon_cuervo') && state.hasItem('sello');
        if (!ready) {
          this.dialogue.startLore('The altar sleeps', [
            'Three hollows wait: the Seal of the Order, the Crown of the sunken kings and the Heart of the Crow.',
            'Only a Warden carrying the three relics can summon the Council of the Tides.',
          ]);
          return;
        }
        state.interactMilestone('altar_marea');
        state.giveXp(80);
        this.dialogue.startLore('The Council of the Tides', [
          'The bed of coins parts. A tide-light runs along the whale ribs like an ancient heartbeat.',
          'The three relics resonate with one another — Seal, Crown and Heart — and the altar knows its Warden.',
          'Touch the altar again to make your choice.',
        ]);
        state.setFlag('altar_ready');
      },
    });

    // --- The final decision (opens the choice dialogue) ---
    w.interactables.push({
      id: 'altar_decision',
      pos: f4.altarMareaPos.clone(),
      radius: 4.4,
      get prompt(): string {
        if (state.hasFlag('ending_done')) return '';
        return state.hasFlag('altar_ready') ? 'Decide the fate of the Tides' : '';
      },
      available: () => state.hasFlag('altar_ready') && !state.hasFlag('ending_done'),
      run: () => {
        this.dialogue.start('altar_decision');
        state.interactMilestone('altar_decision');
      },
    });

    // --- The treasure dig (needs the captain's map) ---
    w.interactables.push({
      id: 'dig_treasure',
      pos: f4.digPos.clone(),
      radius: 3.4,
      get prompt(): string {
        if (state.hasFlag('treasure_dug')) return '';
        return state.hasItem('mapa_tesoro') ? 'Dig where the X marks' : 'A strange crossing of planks in the sand';
      },
      available: () => !state.hasFlag('treasure_dug'),
      run: () => {
        if (!state.hasItem('mapa_tesoro')) {
          this.dialogue.startLore('Marks on the stone', [
            'Two planks nailed crosswise into the rock. Something is buried here… but you would need a map to know what — and the nerve to dig it.',
          ]);
          return;
        }
        state.setFlag('treasure_dug');
        state.removeItem('mapa_tesoro', 1);
        state.addItem('coin', 200);
        state.addItem('moneda_antigua', 2);
        state.addItem('flecha', 8);
        state.interactMilestone('dig_treasure');
        state.giveXp(120);
        audio.playEvent('chest');
        this.vfx?.landingDust(f4.digPos.clone(), 10, 0.8);
        store.getState().notify('item', "Eirik's cache!", '200 coins, two Thalassar coins and good willow-wood arrows. "May my own blood find it," the map said. It did.');
      },
    });

    // --- Stranded fish (sq_raciones) ---
    for (const [i, spot] of f4.fishSpots.entries()) {
      w.interactables.push({
        id: `fish_spot_${i}`,
        pos: spot.clone(),
        radius: 2.6,
        get prompt(): string {
          return state.hasFlag(`fish_${i}_taken`) ? '' : 'Pick up the beached catch (×2)';
        },
        available: () => !state.hasFlag(`fish_${i}_taken`),
        run: () => {
          state.setFlag(`fish_${i}_taken`);
          state.addItem('pez', 2);
          audio.playEvent('pickup');
          state.giveXp(6);
          store.getState().notify('item', 'Beached catch ×2', 'Tom needs them for the town\'s rations.');
        },
      });
    }

    // --- The Great Maple seed (sq_arce) ---
    w.interactables.push({
      id: 'seed_arce',
      pos: f4.granArcePos.clone().add(new THREE.Vector3(2.5, 0, 2)),
      radius: 3.2,
      get prompt(): string {
        return state.hasItem('semilla_arce') || state.hasFlag('semilla_taken') ? '' : 'Pick up a seed of the Great Maple';
      },
      available: () => !state.hasFlag('semilla_taken'),
      run: () => {
        state.setFlag('semilla_taken');
        state.addItem('semilla_arce', 1);
        audio.playEvent('pickup');
        state.giveXp(15);
        store.getState().notify('item', 'Seed of the Great Maple', 'A golden samara, warm as a newborn. Maren knows where to plant it.');
      },
    });

    // --- Wild horse marking (sq_caballos) ---
    for (const wild of f4.wildHorses) {
      w.interactables.push({
        id: wild.id === 'potro_norte' ? 'wildhorse_1' : 'wildhorse_2',
        pos: wild.pos.clone(),
        radius: 6,
        get prompt(): string {
          const flag = wild.id === 'potro_norte' ? 'wildhorse_1_done' : 'wildhorse_2_done';
          return state.hasFlag(flag) ? '' : `Mark the position of the ${wild.id === 'potro_norte' ? 'chestnut colt' : 'grey colt'}`;
        },
        available: () => true,
        run: () => {
          const isNorth = wild.id === 'potro_norte';
          state.setFlag(isNorth ? 'wildhorse_1_done' : 'wildhorse_2_done');
          state.interactMilestone(isNorth ? 'wildhorse_1' : 'wildhorse_2');
          state.giveXp(20);
          audio.playEvent('pickup');
          store.getState().notify('info', 'Colt marked', 'Halvard can come for him with rope and patience.');
        },
      });
    }

    // --- Nightfall at the waterfall (sq_cascada) ---
    const fallsBasin = w.waterfallBasin;
    w.interactables.push({
      id: 'cascada_noche',
      pos: new THREE.Vector3(fallsBasin.x, terrainH(fallsBasin.x, fallsBasin.z), fallsBasin.z),
      radius: 6.5,
      get prompt(): string {
        if (state.hasFlag('cascada_escuchada')) return '';
        return 'Listen to the waterfall as the sun sets';
      },
      available: () => !state.hasFlag('cascada_escuchada'),
      run: () => {
        const night = w.sky.dayFactor < 0.35 || w.sky.nightFactor > 0.4;
        if (!night) {
          this.dialogue.startLore('The water sings… by day', [
            'The waterfall murmurs in its everyday voice. Sigrid insists: it must be heard as the last sun falls.',
          ]);
          return;
        }
        state.setFlag('cascada_escuchada');
        state.interactMilestone('cascada_noche');
        state.giveXp(30);
        this.musicIntensityTarget = 0.5;
        this.dialogue.startLore('The song of the waterfall', [
          'You sit at the pond\'s edge as the last light dies.',
          'The water changes. It is not a murmur: it is harmony. Deep, old voices rising and falling with the current as if remembering names.',
          'Those who sleep below know new songs. Now you know it too.',
        ]);
      },
    });

    // --- The watchman's stash (sq_vigia: night + lantern) ---
    w.interactables.push({
      id: 'tower_stash',
      pos: new THREE.Vector3(300, terrainH(300, 64.2), 64.2),
      radius: 3.6,
      get prompt(): string {
        if (state.hasFlag('tower_stash_found')) return '';
        return 'Search the walled-up door';
      },
      available: () => !state.hasFlag('tower_stash_found'),
      run: () => {
        const night = w.sky.nightFactor > 0.35;
        const lantern = this.player!.lanternOn;
        if (!night || !lantern) {
          this.dialogue.startLore('The walled-up door', [
            'Rotten joints, cobwebs and an oxidised plate. Jorund spoke of a stash "that only night and fire find".',
            night ? 'Perhaps with the lantern lit (L)…' : 'Perhaps at night, with a light of your own…',
          ]);
          return;
        }
        state.setFlag('tower_stash_found');
        state.interactMilestone('tower_stash');
        state.addItem('coin', 90);
        state.addItem('flecha', 8);
        state.giveXp(50);
        audio.playEvent('chest');
        store.getState().notify('item', "The watchman's stash", 'The lantern light reveals a shifted stone: counted gold, dry arrows and a diary barely legible.');
      },
    });

    // --- Vaelthara's silence (sq_lamento) ---
    w.interactables.push({
      id: 'ruins_silence',
      pos: new THREE.Vector3(-240, terrainH(-240, -140), -140),
      radius: 6,
      get prompt(): string {
        if (state.hasFlag('lamento_done')) return '';
        return state.hasFlag('vaelthara_dead') ? 'Listen to the silence of the ruins' : '';
      },
      available: () => state.hasFlag('vaelthara_dead') && !state.hasFlag('lamento_done'),
      run: () => {
        state.setFlag('lamento_done');
        state.interactMilestone('ruins_silence');
        state.giveXp(40);
        this.musicIntensityTarget = 0.3;
        this.dialogue.startLore('The duel of the columns', [
          'Among the columns there is no threat: there is a duel. The guardian no longer roars, and the stones seem to notice.',
          'A warden without a dragon and a dragon without a warden, both without a home.',
          'Aldric will understand what you heard — or what you did not.',
        ]);
      },
    });

    // --- The knight statue lore (sq_guardianes) ---
    w.interactables.push({
      id: 'knight_statue',
      pos: f4.knightPos.clone(),
      radius: 4,
      prompt: 'Gaze at the stone knight',
      run: () => {
        if (!state.hasFlag('knight_seen')) {
          state.setFlag('knight_seen');
          state.giveXp(35);
          state.interactMilestone('knight_statue');
        }
        this.dialogue.startLore('The Knight of the North', [
          'A Warden of the Order carved in stone, sword lowered and eyes on the sea. Three hundred years of vigil have not even scratched his expression.',
          'On the pedestal, half effaced, an inscription: "They will watch over us when we no longer can."',
          'Something tells you the statue is not looking at the sea. It is looking at what sleeps behind it.',
        ]);
      },
    });

    // --- Fase 15 — THE HORN ALTAR of the Navel of the Sea (King of the Sea) ---
    const beasts = this.seaBeasts;
    w.interactables.push({
      id: 'horn_altar',
      pos: w.navel.altarPos.clone(),
      radius: 5.5,
      get prompt() {
        if (!beasts) return '';
        const pre = beasts.summonPrereq();
        if (pre.ok) return 'Sound the Tide Horn';
        if (pre.reason === 'fight') return 'The King already walks the sea';
        if (pre.reason === 'horn') return 'The altar awaits a horn…';
        return 'The altar does not heed you (level 6)';
      },
      run: () => {
        if (!beasts?.summonKing()) return;
        audio.playEvent('roar_big');
      },
    });
  }

  // -------------------------------------------------------- helm helpers

  /** Attach the player to a wheel (Fase 11: ANY ship's — the Colibrí or an
   *  anchored vessel the player walked up to). */
  private takeHelm(ship?: import('./naval/Ship').Ship): void {
    const naval = this.naval;
    if (!naval) return;
    const target = ship && !ship.sunk && ship.sinking === 0
      ? ship
      : naval.helmCandidate(this.player!.position);
    if (!target || target.sunk || target.sinking > 0) return;
    naval.takeHelmAt(target);
    this.attachPlayerToWheel(target);
    this.rig!.setShipMode(target);
    this.player!.platformProbe = (x, z) => {
      const local = target.toLocal(x, z);
      return target.deckHeightAt(local.x, local.y);
    };
    if (!this.state.hasFlag('tut_sailing')) {
      this.state.setFlag('tut_sailing');
      useGameStore.getState().notify(
        'info',
        `At the helm of ${target.name}`,
        'W/S sails · A/D rudder · SPACE anchor · LMB/RMB broadsides · E disembark or board',
      );
    } else {
      useGameStore.getState().notify('info', `At the helm of ${target.name}`, 'W/S sails · A/D rudder · SPACE anchor · E broadsides.');
    }
  }

  private attachPlayerToWheel(ship?: import('./naval/Ship').Ship): void {
    const target = ship ?? this.naval!.activeShip ?? this.naval!.playerShip;
    if (!target) return;
    const wheel = target.wheelWorld;
    this.player!.teleport(wheel.x, wheel.y, wheel.z);
    this.player!.yaw = target.heading;
    this.player!.velocity.set(0, 0, 0);
  }

  /** The refit is complete: swap the static hull for the real ship. */
  private launchShip(): void {
    const w = this.world!;
    w.village.setStaticShip(false);
    // Stop the streamer from re-showing the retired static hull
    w.streamer.unregister(w.village.staticShip);
    const dock = w.dockSpawn;
    this.naval!.spawnPlayerShip(dock.x, dock.z, dock.heading);
    this.naval!.applyPerks();
    this.audio.playEvent('quest');
    this.musicIntensityTarget = 0.8;
    useGameStore.getState().notify(
      'quest',
      'The Sea Hummingbird floats again!',
      'The hull is ready. Walk to the ship\'s side by the dock to set sail. Navigation skills (K) have been unlocked.',
    );
    this.autosave();
  }

  // ---------------------------------------------------------------- phases

  private startNewGameCore(): void {
    const w = this.world!;
    this.state.resetForNewGame();
    this.state.setFlag('intro_done');
    w.sky.dayFraction = 0.295;
    w.sky.dayCount = 1;
    this.dead = false;
    // Fase 15 — never start a new game riding a dragon
    if (this.dragons?.ridingId) this.dragons.dismountDragon();
    // Fresh naval layer: the Colibrí is still under repair on land
    this.naval?.resetAll();
    w.village.setStaticShip(true);
    w.streamer.register(w.village.staticShip, w.village.shipPos.x, w.village.shipPos.z, 30);
    this.player!.platformProbe = undefined;
    this.rig?.setShipMode(null);
    const sp = w.village.spawnPoint;
    const groundY = w.terrainHeight.height(sp.x, sp.z);
    this.player!.teleport(sp.x, Math.max(groundY, 1.5), sp.z);
    this.player!.health = 100;
    this.player!.stamina = 100;
    this.player!.model.setEquippedState(false);
    // Fase 10 — the hero STARTS with a sword: honest steel from the village
    // forge, equipped and visible from the first second. Bram's forge can
    // temper it further as the adventure progresses.
    this.state.addItem('espada_acero', 1);
    this.state.equip('espada_acero');
    this.state.swordTier = 0;
    this.applyStats();
    // Fase 3: dragons reset to their lairs, combat state cleared
    this.dragons?.syncWithState();
    this.combat?.refreshVisuals();
    this.audio.bossIntensity = 0;
    this.mounts?.dismount();
    this.rig?.setMountMode(false);
    this.endingPlayed = this.state.hasFlag('ending_done');
    for (const npc of this.npcs) {
      npc.deserialize({ x: npc.def.work.x, y: npc.def.work.y, z: npc.def.work.z, yaw: 0 });
    }
    this.restoreWorldFromState();
    this.syncProgression();
  }

  newGameWithIntro(): void {
    this.startNewGameCore();
    this.introT = 0;
    this.introDone = false;
    this.lastIntroShot = -1;
    useGameStore.getState().setPhase('intro');
    useGameStore.getState().setIntro({ text: INTRO_SHOTS[0].text, shot: 0, total: INTRO_SHOTS.length, title: false });
  }

  private finishIntro(): void {
    const store = useGameStore.getState();
    store.setIntroActive(false);
    store.setPhase('playing');
    this.state.startQuest('q1_legacy');
    this.audio.playEvent('quest');
    this.musicIntensityTarget = 0.35;
    store.notify('quest', 'New quest: The Legacy of Eirik', 'Talk to Master Aldric at the port.');
    store.notify('info', 'Controls', 'WASD move · SHIFT sprint · SPACE jump · E interact · TAB inventory · M map · J journal');
    store.notify('info', 'Combat', 'Click: 4-hit combos · hold: air launch · Q parry/block · C dodge · F hook dash · E rope dart · V finisher · 1-4 weapons');
    this.autosave();
    this.input.requestLock();
  }

  pause(): void {
    const store = useGameStore.getState();
    if (store.phase !== 'playing') return;
    if (this.endings?.isPlaying) return; // ending cinematic owns the screen
    store.setPhase('paused');
    this.input.releaseLock();
    this.input.clearAll();
  }

  resume(): void {
    const store = useGameStore.getState();
    if (store.phase !== 'paused') return;
    store.setPhase('playing');
    this.lastResumeAt = performance.now();
    this.input.requestLock();
  }

  private lastResumeAt = 0;

  returnToMenu(): void {
    this.autosave();
    const store = useGameStore.getState();
    store.setPhase('menu');
    store.setDialogue(null);
    this.input.releaseLock();
    this.input.clearAll();
    this.world!.sky.timePaused = false;
    store.setHasSave(SaveSystem.newestSlot() !== null);
  }

  // ------------------------------------------------------------ save/load

  buildSaveData(): SaveData {
    return {
      version: 3,
      timestamp: Date.now(),
      player: this.player!.serialize(),
      time: this.world!.sky.serialize(),
      gameState: this.state.serialize(),
      naval: this.naval?.serialize(),
      mounts: this.mounts?.serialize(),
      // Fase 16 — the hero's own (admin) dragons survive the reload too
      dragons: this.dragons?.serializeAdmins(),
      weather: this.world!.weather.serialize(),
    };
  }

  autosave(): void {
    if (!this.world || !this.player) return;
    if (SaveSystem.autosave(this.buildSaveData())) {
      useGameStore.getState().setHasSave(true);
    }
  }

  saveToSlot(slot: number): boolean {
    const ok = SaveSystem.save(slot, this.buildSaveData());
    if (ok) {
      useGameStore.getState().setHasSave(true);
      useGameStore.getState().notify('save', 'Game saved', `Slot ${slot + 1} · Day ${this.world!.sky.dayCount}`);
      this.audio.playEvent('unlock');
    }
    return ok;
  }

  loadFromSlot(slot: number): boolean {
    const data = SaveSystem.load(slot);
    if (!data || !this.world || !this.player || !this.naval) return false;
    this.state.deserialize(data.gameState);
    this.player.deserialize(data.player);
    this.world.sky.deserialize(data.time);
    this.dead = false;

    // Naval restoration: only when the Colibrí was already repaired
    if (this.state.hasFlag('ship_repaired')) {
      this.world.village.setStaticShip(false);
      if (data.naval) {
        this.naval.deserialize(data.naval, true);
      } else {
        // v1 save that somehow has the flag — spawn at dock
        const dock = this.world.dockSpawn;
        this.naval.spawnPlayerShip(dock.x, dock.z, dock.heading);
      }
      this.naval.applyPerks();
    } else {
      this.world.village.setStaticShip(true);
      this.world.streamer.register(this.world.village.staticShip, this.world.village.shipPos.x, this.world.village.shipPos.z, 30);
      this.naval.resetAll();
      if (data.naval) this.naval.deserialize(data.naval, false);
    }

    // Sailing state after load: resume at the helm or on foot
    this.player.platformProbe = undefined;
    this.rig!.setShipMode(null);
    this.rig!.setMountMode(false);
    const restored = this.naval.playerSailing ? (this.naval.activeShip ?? this.naval.playerShip) : null;
    if (restored) {
      this.naval.playerBoardsHelm();
      this.attachPlayerToWheel(restored);
      this.rig!.setShipMode(restored);
    }

    // Fase 4: mounts & weather restoration
    this.mounts?.deserialize(data.mounts);
    if (data.mounts?.riding) {
      this.mounts?.restoreRiding(data.mounts.riding);
      if (this.mounts?.ridingId) this.rig!.setMountMode(true);
    }
    // Fase 16 — the player's admin dragons (and their exact spot) back in
    // the world. Riding is not auto-restored: you load standing beside them.
    this.dragons?.restoreAdmins(data.dragons);
    this.world.weather.deserialize(data.weather);
    this.endingPlayed = this.state.hasFlag('ending_done');

    this.restoreWorldFromState();
    this.applyStats();
    this.syncProgression();
    // Fase 3: align dragons & weapon visuals with the loaded save
    this.dragons?.syncWithState();
    this.combat?.refreshVisuals();
    // Fase 10 — restore the forge tier glow on the blade
    this.syncSwordVisuals();
    this.audio.bossIntensity = 0;
    const store = useGameStore.getState();
    store.setPhase('playing');
    this.input.requestLock();
    store.notify('save', 'Game loaded', `Day ${data.time.dayCount} · Level ${data.gameState.level}`);
    return true;
  }

  /** Sync chests/herbs visuals with loaded state. */
  private restoreWorldFromState(): void {
    const w = this.world!;
    for (const chest of w.chests) {
      const opened = this.state.openedChests.has(chest.id);
      if (opened && !chest.handles.isOpen()) chest.handles.open();
      if (!opened && chest.handles.isOpen()) {
        chest.handles.lid.rotation.x = 0;
      }
    }
    for (const herb of w.herbs) {
      herb.mesh.visible = !this.state.pickedHerbs.has(herb.id);
    }
    this.combat?.refreshVisuals();
  }

  // --------------------------------------------------------------- skills

  private applyStats(): void {
    const p = this.player!;
    const s = this.state;
    let maxHp = 100;
    let maxSt = 100;
    let speedMult = 1;
    if (s.learnedSkills.has('comb_piel')) maxHp += 20;
    if (s.learnedSkills.has('sup_corazon')) maxHp += 25;
    if (s.learnedSkills.has('comb_vigor')) maxSt += 20;
    if (s.learnedSkills.has('comb_vigor2')) maxSt += 20;
    if (s.learnedSkills.has('sup_zancada')) speedMult = 1.08;
    // Fase 16 — the smith's armor: flat health + damage reduction;
    // the wings: glide physics (visual toggled alongside).
    const armorDef = s.equippedArmor ? ITEMS[s.equippedArmor]?.armor : undefined;
    if (armorDef) maxHp += armorDef.hp;
    p.stats.damageReduction = armorDef ? armorDef.reduce : 0;
    const wingsDef = s.equippedWings ? ITEMS[s.equippedWings]?.glide : undefined;
    p.stats.glideSink = wingsDef ? wingsDef.sink : undefined;
    p.stats.glideSpeed = wingsDef ? wingsDef.speed : undefined;
    p.setWingsVisual(s.equippedWings);
    p.stats.maxHealth = maxHp;
    p.stats.maxStamina = maxSt;
    p.stats.walkSpeed = 3.6 * speedMult;
    p.stats.runSpeed = 6.6 * speedMult;
    p.stats.swimSpeed = 2.3 * speedMult;
    p.health = Math.min(p.health, maxHp);
    p.stamina = Math.min(p.stamina, maxSt);
  }

  private syncProgression(): void {
    const st = useGameStore.getState();
    st.setProgression({
      level: this.state.level,
      xp: this.state.xp,
      xpToNext: xpForLevel(this.state.level),
      skillPoints: this.state.skillPoints,
      inventoryVersion: st.inventoryVersion + 1,
    });
  }

  /** Fase 10 — push the forge tier onto the player's blade (glow + pride).
   *  Fase 12 — elemental legendaries restyle the whole sword. */
  private syncSwordVisuals(): void {
    const visual = this.player?.model;
    if (visual instanceof KnightModelGLB) {
      visual.setWeaponTier(this.state.swordTier);
      visual.setWeaponElement(swordElementOf(this.state.equippedWeapon));
      this.equippedElement = swordElementOf(this.state.equippedWeapon);
    }
  }

  // ------------------------------------------------------------- main loop

  /** Fase 11 — hit-stop: a slow-motion beat on decisive blows (parries,
   *  ripostes, finishers, remates). The world crawls at 15% for a few
   *  hundred milliseconds — impacts land HEAVY without stealing control. */
  hitStopT = 0;

  private update(rawDt: number): void {
    if (!this.world || !this.player || !this.rig) return;
    const store = useGameStore.getState();
    const w = this.world;
    const p = this.player;
    let dt = rawDt;
    if (this.hitStopT > 0) {
      this.hitStopT = Math.max(0, this.hitStopT - rawDt);
      dt = rawDt * 0.15;
    }
    windTime.value += dt;

    switch (store.phase) {
      case 'menu': {
        this.menuOrbit += dt * 0.021;
        const r = 150;
        const cx = 20 + Math.cos(this.menuOrbit) * r;
        const cz = 200 + Math.sin(this.menuOrbit) * r;
        const cy = w.terrainHeight.height(cx, cz) + 42;
        this.rig.setManual(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(20, 12, 170));
        w.sky.dayFraction = 0.78;
        w.sky.update(this.engine.camera, p.position, this.engine.quality.shadowsEnabled);
        w.water.update(dt, this.engine.camera);
        w.water.setSky(w.sky.sunDir, w.sky.sunColor, w.sky.zenithColor, w.sky.horizonColor, w.sky.nightFactor);
        w.gulls.update(dt);
        w.village.torches.update(dt, w.sky.nightFactor, this.engine.camera.position);
        w.terrain.update(cx, cz);
        w.vegetation.update();
        break;
      }
      case 'intro': {
        this.updateIntro(dt);
        w.sky.tick(dt);
        w.sky.update(this.engine.camera, p.position, this.engine.quality.shadowsEnabled);
        w.water.update(dt, this.engine.camera);
        w.water.setSky(w.sky.sunDir, w.sky.sunColor, w.sky.zenithColor, w.sky.horizonColor, w.sky.nightFactor);
        w.gulls.update(dt);
        w.village.torches.update(dt, w.sky.nightFactor, this.engine.camera.position);
        break;
      }
      case 'playing': {
        // Toggle overlays (works whether or not one is already open)
        const toggle = this.input.menuTogglePressed();
        if (toggle && !store.dialogue) {
          const map: Record<string, 'inventory' | 'map' | 'journal' | 'skills'> = {
            inventory: 'inventory', map: 'map', journal: 'journal', skills: 'skills',
          };
          const target = map[toggle];
          if (store.overlay === target) {
            store.closeOverlay();
            this.input.requestLock();
          } else {
            store.openOverlay(target);
            this.input.releaseLock();
          }
        }
        if (!store.overlay) {
          this.updatePlaying(dt, store);
        } else {
          // Overlays pause input but keep rendering a frozen frame
          w.sky.update(this.engine.camera, p.position, this.engine.quality.shadowsEnabled);
        }
        break;
      }
      case 'paused': {
        // frozen — nothing updates
        break;
      }
      default:
        break;
    }
    this.input.endFrame();
  }

  private updateIntro(dt: number): void {
    const store = useGameStore.getState();
    // Skip
    if (this.input.anyPressed('Space', 'Escape', 'Enter', 'KeyE')) {
      this.finishIntro();
      return;
    }
    this.introT += dt;
    let shot = 0;
    let t0 = 0;
    for (let i = 0; i < INTRO_SHOTS.length; i++) {
      if (this.introT < t0 + INTRO_SHOTS[i].dur) {
        shot = i;
        break;
      }
      t0 += INTRO_SHOTS[i].dur;
      shot = i;
    }
    const totalDur = INTRO_SHOTS.reduce((a, s) => a + s.dur, 0);
    if (this.introT >= totalDur) {
      this.finishIntro();
      return;
    }
    const s = INTRO_SHOTS[shot];
    const k = smoothstep(0, 1, clamp((this.introT - t0) / s.dur, 0, 1));
    const pos = s.from.clone().lerp(s.to, k);
    const look = s.lookFrom.clone().lerp(s.lookTo, k);
    this.rig!.setManual(pos, look);
    // Only push to the store when the shot changes (avoids per-frame renders)
    if (this.lastIntroShot !== shot) {
      this.lastIntroShot = shot;
      store.setIntro({
        text: s.text,
        shot,
        total: INTRO_SHOTS.length,
        title: shot === INTRO_SHOTS.length - 1,
      });
    }
  }

  /** Central player-damage router (dragons, fire, …) with block support. */
  private applyPlayerDamage(dmg: number, fromX?: number, fromZ?: number, reason?: string, opts?: { unblockable?: boolean }): number {
    const p = this.player!;
    // ---- Fase 22 — elemental armor passives (the desc contract) ----
    // · STORMPLATE: drinks a tenth of any lightning and pays you in breath
    // · DRAKE-SCALE: the cold cannot bite, burns lose half their fury
    // · ANCESTRAL: immune to burning outright (Skin of the Titan)
    const armor = this.state.equippedArmor;
    if (armor) {
      const isShock = !!reason && /shock|lightning|storm|ronin/i.test(reason);
      const isFire = !!reason && /fire|burn|flame|dragon/i.test(reason);
      if (armor === 'coraza_tormenta' && isShock) {
        dmg *= 0.9;
        p.stamina = Math.min(p.stats.maxStamina, p.stamina + 15);
      } else if (armor === 'coraza_cria' && isFire) {
        dmg *= 0.5;
      } else if (armor === 'coraza_cria' && !!reason && /frost|freeze|ice/i.test(reason)) {
        dmg = 0;
      } else if (armor === 'armadura_ancestral' && isFire) {
        dmg = 0;
      }
    }
    const lost = p.takeHit(dmg, fromX, fromZ, opts);
    if (lost > 0) {
      this.audio.playEvent('damage');
      useGameStore.getState().triggerHurtFlash();
      this.musicIntensityTarget = Math.max(this.musicIntensityTarget, 0.6);
    }
    void reason;
    return lost;
  }

  // Fase 22 — slash-arc sampling state (the swept ribbon of each cut)
  private arcScratchGrip = new THREE.Vector3();
  private arcScratchTip = new THREE.Vector3();
  private arcPrevGrip = new THREE.Vector3();
  private arcPrevTip = new THREE.Vector3();
  private arcPrevValid = false;

  /** Fase 22 — THE SLASH ARC TICK: while a melee swing is inside its strike
   *  window, sample the blade (grip + tip) every frame and emit the swept
   *  ribbon between consecutive samples. The ribbons composite into the
   *  visible wake of the cut — the cinematic read of a live swing. */
  private slashArcTick(dt: number): void {
    const p = this.player;
    if (!p || !this.vfx) return;
    const km = p.model as KnightModelGLB;
    const inStrike = p.attackT > 0 && p.attackT > 0.28 && p.attackT < 0.85;
    if (!inStrike) { this.arcPrevValid = false; return; }
    if (typeof km.weaponTipWorld !== 'function' || typeof km.weaponHandWorld !== 'function') return;
    const hasGrip = km.weaponHandWorld(this.arcScratchGrip);
    const hasTip = km.weaponTipWorld(this.arcScratchTip);
    if (!hasGrip || !hasTip) { this.arcPrevValid = false; return; }
    if (this.arcPrevValid) {
      this.vfx.slashArc(this.arcPrevGrip, this.arcPrevTip, this.arcScratchGrip, this.arcScratchTip);
    }
    this.arcPrevGrip.copy(this.arcScratchGrip);
    this.arcPrevTip.copy(this.arcScratchTip);
    this.arcPrevValid = true;
  }

  private updatePlaying(dt: number, store: ReturnType<typeof useGameStore.getState>): void {
    const w = this.world!;
    const p = this.player!;
    const rig = this.rig!;
    const naval = this.naval!;
    const dialogueActive = !!store.dialogue;
    // Fase 22 — any screen-owning panel freezes the hero (shop/forge/toll)
    const panelActive = dialogueActive || !!store.shop || !!store.forge || !!store.negotiation;
    const sailing = naval.playerSailing && !!naval.activeShip;
    const riding = !!this.mounts?.ridingId;
    // Fase 15 — dragon riding (admin spawns): the hero holds the reins
    const dragonRiding = !!this.dragons?.ridingId;
    const riddenDragon = this.dragons?.riddenDragon ?? null;

    // Fase 10 — conversations get the cinematic lens (tighter FOV + closer)
    rig.setDialogueFocus(dialogueActive && !sailing);

    // --- Fase 4: ending cinematic takes over everything ---
    if (this.endings?.isPlaying) {
      this.endings.update(dt, this.engine.camera);
      w.sky.tick(dt);
      w.sky.update(this.engine.camera, p.position, this.engine.quality.shadowsEnabled);
      w.water.update(dt, this.engine.camera);
      w.water.setSky(w.sky.sunDir, w.sky.sunColor, w.sky.zenithColor, w.sky.horizonColor, w.sky.nightFactor);
      w.terrain.update(p.position.x, p.position.z);
      w.vegetation.update(p.position.x, p.position.z);
      // Fase 14 — gaviotas con culling de distancia
      w.gulls.update(dt, p.position);
      return;
    }

    // --- Fase 9 — narrative cinematics (PDF §6) ---
    // A pending chapter card waits for the closing dialogue to finish.
    if (
      this.pendingChapter && !dialogueActive && !this.cinematics.active
      && !naval.boardingActive && !this.dead
    ) {
      const ch = this.pendingChapter;
      this.pendingChapter = null;
      this.playChapterCinematic(ch);
    }
    if (this.cinematics.active) {
      // Skip after the opening beat (Space / Enter / E)
      if (
        this.cinematics.elapsed > 0.8 &&
        (this.input.pressed('jump') || this.input.anyPressed('Enter') || this.input.anyPressed('KeyE'))
      ) {
        this.cinematics.skip();
      }
    }
    const cine = this.cinematics.active;

    // --- Fase 20 — FREE CAM (P): detach the lens from the hero ---
    if (
      !cine && !this.endings?.isPlaying && !dialogueActive &&
      this.input.anyPressed('KeyP')
    ) {
      this.toggleFreeCam(store);
    }

    // --- Fase 21 — FIRST PERSON (B): the lens rides the hero's eyes ---
    if (
      !cine && !this.endings?.isPlaying && !dialogueActive &&
      !sailing && !this.mounts?.ridingId && !this.dragons?.ridingId &&
      this.input.anyPressed('KeyB')
    ) {
      this.toggleFirstPerson(store);
    }
    // Sailing or mounting always takes the camera back to third person
    if (rig.firstPerson && (sailing || this.mounts?.ridingId || this.dragons?.ridingId)) {
      rig.setFirstPerson(false);
      (this.player!.model as KnightModelGLB)?.setHeadHidden?.(false);
      store.setFirstPerson(false);
    }

    // --- Naval layer: wind, fleets, cannonballs, boarding, effects ---
    const sailingHud: SailingHud | null = naval.update(dt, p.position);

    // --- Fase 15: sea serpents + pirate ambushes (only while really at sea) ---
    if (this.seaBeasts) {
      // While the Black Siren hunts, common serpents stay in the deep
      this.seaBeasts.blockCommonSpawns = this.pirateAmbush?.ambushActive ?? false;
      this.seaBeasts.update(dt, sailing && !naval.boardingActive, naval.activeShip ?? naval.playerShip);
      // The nearest surfaced serpent rides the sailing HUD's enemy slot
      if (sailingHud && !sailingHud.enemy) {
        const beast = this.seaBeasts.hudBeast(naval.activeShip ?? naval.playerShip);
        if (beast) {
          sailingHud.enemy = { name: beast.name, hullFrac: beast.hpFrac, dist: beast.dist };
        }
      }
    }
    if (this.pirateAmbush && !cine) {
      this.pirateAmbush.update(dt, sailing && !naval.boardingActive, naval.activeShip ?? naval.playerShip);
    }

    // --- Fase 3: dragons + combat VFX (both on foot and at sea) ---
    this.dragons?.update(
      dt, p.position, !this.dead && !rig.freeCam, sailing,
      sailing && naval.activeShip ? naval.activeShip.pos : null,
    );
    // Fase 22 — the slash arc rides just before the VFX pool update
    this.slashArcTick(dt);
    this.vfx?.update(dt);

    // --- Fase 10: red knight bandits (AI frozen during cinematics/dialogue) ---
    if (!cine && !this.endings?.isPlaying) {
      this.bandits?.update(dt, p.position, !this.dead && !dialogueActive && !sailing && !rig.freeCam);
    }

    // --- Fase 22 — THE FORGE: eclipse tick + armor passive sync ---
    if (this.forge) {
      this.forge.update(dt);
      const eclipse = this.forge.eclipseFactor;
      // the eclipse owns the sky: the light dims to a bruised twilight and
      // the sun glows like a ring of fire (mirrored to the HUD countdown)
      w.sky.eclipseFactor = eclipse;
      useGameStore.getState().setEclipseLeft(this.forge.eclipseLeft);
      // armor passives: the equipped piece's tag rides the Player
      const armorId = this.state.equippedArmor;
      p.armorPassive = armorId ?? '';
      // the Shadow Dō: enemies see you 20% later at night or in fog
      const nightOrFog = w.sky.dayFraction < 0.22 || w.sky.dayFraction > 0.8 || w.weather.fogMul > 1.5;
      this.bandits?.setDetectionMult(armorId === 'do_sombras' && nightOrFog ? 0.8 : 1);
    }

    // --- Fase 11 — combat framing: the rig widens while enemies are hot ---
    {
      const heat = (this.bandits?.combatHeat(p.position) ?? 0) + (naval.boardingActive ? 2 : 0);
      this.rig?.setCombatFraming(!sailing && heat > 0 && !cine);
    }

    // --- Death / respawn ---
    if (p.health <= 0 && !this.dead) {
      this.dead = true;
      // Fase 15 — the pirates spare you: if the ambush corsairs dealt the
      // killing blow, the toll negotiation deploys ON TOP of the respawn
      // (the panel's footer tells the story: you wake on the dock).
      this.pirateAmbush?.notifyPlayerDeath();
      // Dragons lose interest and return to their lairs at full strength
      this.dragons?.resetCombat();
      this.audio.bossIntensity = 0;
      if (naval.boardingActive) {
        naval.abortBoarding();
        p.platformProbe = undefined;
        rig.setShipMode(null);
      }
      const sp = w.village.spawnPoint;
      p.teleport(sp.x, 1.5, sp.z);
      p.health = Math.floor(p.stats.maxHealth * 0.5);
      p.stamina = Math.floor(p.stats.maxStamina * 0.5);
      store.notify('info', 'The waves carry you back to shore', 'You wake on the dock, soaked but alive. The tide is not done with you.');
      this.audio.playEvent('splash');
      // Fase 10 FIX — death used to SOFT-LOCK the run (the `dead` flag never
      // cleared, so the hero could never act again). The tide gives you back:
      // the respawn IS the recovery — wake up on the dock, briefly untouchable.
      p.invulnT = 2.5;
      this.dead = false;
    }

    // --- Fase 15 — pirate toll: when the player's hull starts sinking under
    //     the ambush broadsides, the negotiation buys a tow back to port ---
    if (this.pirateAmbush?.ambushActive) {
      const hull = naval.activeShip ?? naval.playerShip;
      if (hull && hull.sinking > 0 && !hull.sunk) {
        if (this.pirateAmbush.notifyShipSinking()) {
          // Bram tows the hull: the sinking stops, the planks hold
          hull.sinking = 0;
          hull.hullHp = Math.max(hull.hullHp, Math.round(hull.maxHullHp * 0.45));
        }
      }
    }

    // --- Clock ---
    const newDay = w.sky.tick(dt);
    if (newDay) {
      store.notify('info', `Day ${w.sky.dayCount} in Aldmor`, formatClock(w.sky.dayFraction));
    }

    // --- Fase 8 — dusk swaps the shield for a lit torch (dawn brings it back) ---
    const isNight = w.sky.nightFactor > 0.5;
    if (isNight !== this.nightTorchActive && this.player) {
      this.nightTorchActive = isNight;
      this.player.model.setNightTorch?.(isNight);
      if (isNight) {
        store.notify('info', 'Night falls', 'You light a torch to light the way.');
      }
    }

    if (sailing && !naval.boardingActive) {
      // ================= SAILING MODE — the player holds the wheel =================
      const ship = naval.activeShip ?? naval.playerShip!;
      if (!cine) rig.handleInput(this.input, dt);
      // No personal weapons while steering — the cannons are the weapon
      p.blocking = false;
      p.bowDraw = -1;
      if (!dialogueActive && !cine && !rig.freeCam) {
        // Sails: W raises, S furls
        if (this.input.anyPressed('KeyW')) {
          naval.setSailState(Math.min(2, ship.sailState + 1) as 0 | 1 | 2);
        }
        if (this.input.anyPressed('KeyS')) {
          naval.setSailState(Math.max(0, ship.sailState - 1) as 0 | 1 | 2);
        }
        // Rudder: A = turn to port, D = turn to starboard
        ship.rudderInput = (this.input.isDown('left') ? 1 : 0) + (this.input.isDown('right') ? -1 : 0);
        // Anchor
        if (this.input.pressed('jump')) naval.toggleAnchor();
        // Broadside cannons
        if (this.input.leftPressed) naval.firePlayer('port');
        if (this.input.rightPressed) naval.firePlayer('starboard');
      } else {
        ship.rudderInput = 0;
      }
      // Keep the player glued to the helm (no free physics while sailing)
      this.attachPlayerToWheel();
      p.stamina = Math.min(p.stats.maxStamina, p.stamina + dt * 12);
      p.model.update({ dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0 });

      // Chapter II milestone: reaching the Crow Isle waters
      if (this.state.isQuestActive('q5_raven') && !this.state.hasFlag('reached_crow')) {
        if (Math.hypot(ship.pos.x + 620, ship.pos.z + 520) < 300) {
          this.state.setFlag('reached_crow');
          this.musicIntensityTarget = 0.7;
          store.notify('quest', 'Old Crow Isle waters', 'Black cliffs to the northwest. The Bloody Gull patrols this cove.');
        }
      }
    } else {
      // ================= FOOT MODE — normal third-person play =================
      // Camera input & combat (Fase 3) before physics so anims stay in sync
      if (!cine) rig.handleInput(this.input, dt);

      if (rig.freeCam) {
        // --- Fase 20 — FREE CAM: the lens is away. The hero holds a
        // heroic stillness (same freeze the cinematics use), mounts graze,
        // and no steering/combat input is consumed — WASD belongs to the
        // camera now. Toggling back (P) resumes physics exactly as it was. ---
        this.mounts?.update(dt, this.input, p.position, false, (x, z) => w.water.waveHeightAt(x, z));
        this.ridingGait = '';
        p.blocking = false;
        p.bowDraw = -1;
        p.model.update({ dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: p.attackT });
      } else if (dragonRiding && riddenDragon) {
        // --- Fase 15: DRAGON RIDING — the hero flies the beast ---
        this.dragons!.rideUpdate(dt, this.input, this.input.leftDown, w.terrainHeight);
        // Horses keep grazing while the hero is away
        this.mounts?.update(dt, this.input, p.position, false, (x, z) => w.water.waveHeightAt(x, z));
        this.ridingGait = '';
        // Glue the rider to the saddle between the shoulder blades
        const seat = riddenDragon.rideSeatWorld(new THREE.Vector3());
        p.teleport(seat.x, seat.y - 1.02, seat.z);
        p.yaw = riddenDragon.yaw;
        p.velocity.set(0, 0, 0);
        p.stamina = Math.min(p.stats.maxStamina, p.stamina + dt * 10);
        p.model.update({
          dt, speed: 0, moving: false, grounded: true, swimming: false,
          attackT: 0, riding: true,
          rideBounce: (performance.now() / 1000) * (riddenDragon.flying ? 3.4 : 0.8) * 0.12,
        });
      } else if (riding) {
        // --- Fase 4: MOUNTED — the horse carries the player ---
        const mountHud = this.mounts!.update(
          dt, this.input, p.position, !dialogueActive && !this.dead && !cine,
          (x, z) => w.water.waveHeightAt(x, z),
        );
        this.ridingGait = mountHud ? mountHud.gait : '';
        // Glue the rider to the saddle
        const horse = this.mounts!.mounted;
        if (horse) {
          const saddle = horse.model.saddle.getWorldPosition(new THREE.Vector3());
          p.teleport(saddle.x, saddle.y - 1.06, saddle.z);
          p.yaw = horse.yaw;
          p.velocity.set(0, 0, 0);
          p.model.update({
            dt, speed: 0, moving: false, grounded: true, swimming: false,
            attackT: 0, riding: true,
            rideBounce: (performance.now() / 1000) * (mountHud?.speed ?? 0) * 0.12,
          });
        }
        // Whistle brings the horse if dismounted far away — but not now
        if (!dialogueActive && !cine && this.input.anyPressed('KeyH') && !this.mounts!.ridingId) {
          this.mounts!.whistle(p.position);
        }
      } else if (cine) {
        // Fase 9 — the hero holds a heroic stillness while the camera works:
        // physics and combat are suspended, the body keeps breathing.
        this.mounts?.update(dt, this.input, p.position, false, (x, z) => w.water.waveHeightAt(x, z));
        this.ridingGait = '';
        p.blocking = false;
        p.model.update({ dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: p.attackT });
      } else {
        this.mounts?.update(dt, this.input, p.position, false, (x, z) => w.water.waveHeightAt(x, z));
        this.ridingGait = '';
        this.combat!.setCameraYaw(rig.yawForward);
        this.combat!.update(dt, this.input, panelActive, this.dead, this.interactionPromptActive);
        p.update(dt, this.input, rig.yawForward, w.terrainHeight, this.colliders,
          // frozen: dialogue, death, or any panel that owns the screen
          // (Fase 22 fix: the shop/forge panels no longer let you walk away)
          panelActive || this.dead);
        // Whistle: the owned horse trots over
        if (!dialogueActive && this.input.anyPressed('KeyH') && this.state.hasFlag('tormenta_gifted')) {
          this.mounts!.whistle(p.position);
        }
      }

      // While fighting on a ship deck: the grappled hulls keep you aboard —
      // recover the player if they slip off, and clamp inside the rails.
      if (naval.boardingActive && naval.boardingShip) {
        const enemy = naval.boardingShip;
        const local = enemy.toLocal(p.position.x, p.position.z);
        const deck = enemy.deckHeightAt(local.x, local.y);
        if (deck === null) {
          // Fell between the hulls / pushed off — the boarding lines pull you back
          const back = enemy.toWorld(0, 0, 2.5);
          p.teleport(back.x, (enemy.deckHeightAt(0, 2.5) ?? 1) + 0.05, back.z);
          p.velocity.set(0, 0, 0);
        } else if (Math.abs(local.x) > 1.5) {
          const clampedX = Math.sign(local.x) * 1.5;
          const fixed = enemy.toWorld(clampedX, 0, local.y);
          p.position.x = fixed.x;
          p.position.z = fixed.z;
          p.velocity.x = 0;
          p.velocity.z = 0;
        }
      }

      // --- Lantern ---
      if (!dialogueActive && !cine && !rig.freeCam && this.input.pressed('lantern')) {
        p.toggleLantern();
        this.audio.playEvent('pickup');
      }
    }

    // --- Camera ---
    if (cine) {
      // Fase 9 — the narrative sequence drives the camera directly
      this.cinematics.update(dt);
    } else if (rig.freeCam) {
      // Fase 20 — the lens flies free: no follow spring, no shake
      rig.updateFree(dt, this.input);
    } else {
      const sprinting = this.input.isDown('sprint') && !dialogueActive;
      const moving = this.input.isDown('forward') || this.input.isDown('back') ||
        this.input.isDown('left') || this.input.isDown('right');
      rig.update(dt, p.position, sprinting, w.terrainHeight, this.colliders, moving);

      // Fase 21 — FIRST PERSON: the hero faces where you look (strafe/backpedal
      // like a proper FPS; CombatSystem aims along the camera anyway)
      if (rig.firstPerson) {
        p.yaw = dampAngle(p.yaw, rig.yawForward, 20, dt);
        p.group.rotation.y = p.yaw;
      }

      // Impact camera shake (Fase 3)
      if (this.shakeT > 0.002) {
        const cam = this.engine.camera;
        const s = this.shakeT;
        cam.position.x += (Math.random() - 0.5) * s * 0.55;
        cam.position.y += (Math.random() - 0.5) * s * 0.45;
        cam.position.z += (Math.random() - 0.5) * s * 0.55;
        this.shakeT = Math.max(0, this.shakeT - dt * 1.9);
      }
    }

    // --- World systems ---
    w.sky.update(this.engine.camera, p.position, this.engine.quality.shadowsEnabled);

    // Fase 4 — weather drives sky, wind and rain audio
    const weatherPaused = sailing ? false : false;
    w.weather.update(dt, p.position, weatherPaused);
    w.sky.setWeather(
      w.weather.cloudCover,
      Math.max(0, w.weather.rain - 0.35),
      w.weather.lightMul,
      w.weather.fogMul,
      w.weather.lightning,
    );
    windGust.value = 1 + w.weather.wind * 1.7;
    this.audio.setRain(w.weather.rain);
    this.postfx?.setMoodBoost(w.weather.rain * 0.35 + w.sky.duskFactor * 0.12);

    // --- Fase 21 — SUN SHAFTS (god rays) on the cinematic chain ---
    // Project the sun into screen space and grade the strength: strongest at
    // low sun (dawn/dusk crepuscular rays), gentle at noon, none at night or
    // under a storm deck. The sky dome's own sun disc + bloom-lit cloud edges
    // are the emitters, so the shafts flow through the cloud masses.
    if (this.postfx?.enabled && this.postfx.shafts) {
      const sunNdc = this.SHAFT_SCRATCH.copy(w.sky.sunDir).multiplyScalar(900).add(this.engine.camera.position)
        .project(this.engine.camera);
      const onScreen = sunNdc.z < 1 && Math.abs(sunNdc.x) < 1.25 && Math.abs(sunNdc.y) < 1.25;
      // bell: rises 0.03..0.16, holds, fades 0.5..0.95 (zenith)
      const elev = w.sky.sunDir.y;
      const bell = smoothstep(0.03, 0.16, elev) * (1 - smoothstep(0.55, 0.95, elev) * 0.65);
      const stormK = clamp(w.weather.lightMul, 0.25, 1);
      const strength = onScreen
        ? 0.52 * bell * stormK * w.sky.dayFactor
        : 0;
      this.postfx.setSun(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5, strength, this.world ? this.world.sky.dayFraction * 600 : 0);
    }
    if (w.weather.onThunder === undefined) {
      w.weather.onThunder = () => {
        this.audio.playEvent('thunder');
        this.shakeT = Math.max(this.shakeT, 0.25);
      };
      w.weather.onStormStart = () => {
        useGameStore.getState().notify('info', 'Storm over Aldmor', 'The sky is closing. Shelter or sail through it: true sailors sail all the same.');
        this.audio.playEvent('rain_start');
      };
    }
    // Storm at sea (sq_cazatormentas)
    if (sailing && w.weather.kind === 'storm' && !this.state.hasFlag('storm_at_sea')) {
      this.state.setFlag('storm_at_sea');
    }

    w.water.update(dt, this.engine.camera);
    w.water.setSky(w.sky.sunDir, w.sky.sunColor, w.sky.zenithColor, w.sky.horizonColor, w.sky.nightFactor);
    // Fase 12 — REAL planar reflection (mirrored scene, half-rate when near sea)
    w.water.renderReflection(this.engine.renderer, this.engine.scene, this.engine.camera);
    // Fase 12 — boat wakes + bow spray: every moving ship pushes wave rings.
    // Fase 16 — with waves OFF (low graphics / no swell) the rings deform a
    // FLAT sea: the displaced circle + foam reads as an ugly bloom halo, so
    // the whole interactive-water pass is skipped for BOTH player and boats.
    this.wakeTimer -= dt;
    if (this.wakeTimer <= 0) {
      this.wakeTimer = 0.32;
      const cam = this.engine.camera.position;
      const feed = (ship: import('./naval/Ship').Ship) => {
        if (ship.sunk || ship.sinking > 0) return;
        const spd = Math.abs(ship.speed);
        if (spd < 0.6) return;
        if (Math.hypot(ship.pos.x - cam.x, ship.pos.z - cam.z) > 420) return;
        // bow + stern wave rings along the hull line
        const bx = ship.pos.x + Math.sin(ship.heading) * 6;
        const bz = ship.pos.z + Math.cos(ship.heading) * 6;
        const sx = ship.pos.x - Math.sin(ship.heading) * 6;
        const sz = ship.pos.z - Math.cos(ship.heading) * 6;
        const k = Math.min(1, spd / 4.5);
        w.water.addWake(bx, bz, 0.28 + k * 0.5, 13 + k * 9, 3.2 + k * 1.6);
        w.water.addWake(sx, sz, 0.2 + k * 0.42, 11 + k * 8, 3.0 + k * 1.4);
        // bow spray particles at speed
        if (spd > 1.9 && this.vfx) {
          const bowY = w.water.waveHeightAt(bx, bz);
          this.tmpSplash.set(bx, bowY + 0.15, bz);
          this.vfx.waterSplash(this.tmpSplash, 0.22 + k * 0.3);
        }
      };
      if (gfxRuntime.waves) {
        if (naval.playerShip) feed(naval.playerShip);
        for (const e of naval.enemies) feed(e.ship);
        for (const s of naval.extraShips) feed(s);
        // swimming strokes leave ripples too
        if (p.swimming) {
          w.water.addWake(p.position.x, p.position.z, 0.16, 7, 2.2);
        }
      }
    }
    const focusX = rig.freeCam
      ? this.engine.camera.position.x
      : sailing ? (naval.activeShip ?? naval.playerShip)!.pos.x : p.position.x;
    const focusZ = rig.freeCam
      ? this.engine.camera.position.z
      : sailing ? (naval.activeShip ?? naval.playerShip)!.pos.z : p.position.z;
    w.terrain.update(focusX, focusZ);
    w.vegetation.update(focusX, focusZ);
    this.refreshGrass(focusX, focusZ);
    // Fase 13 — la distancia de stream de estructuras sigue la distancia de
    // renderizado del jugador (chunks): nada de cargar lo que no se ve.
    w.streamer.update(dt, focusX, focusZ, this.engine.quality.viewChunkRadius * 64 * 1.15);
    // Fase 14 — gaviotas con culling de distancia
    w.gulls.update(dt, p.position);
    w.village.torches.update(dt, w.sky.nightFactor, p.position);
    updateChests(dt, w.chests.map((c) => c.handles));

    // Waterfall shimmer
    const sheetMat = w.waterfallSheet.material as THREE.MeshStandardMaterial;
    sheetMat.opacity = 0.48 + Math.sin(windTime.value * 2.2) * 0.08;
    const foamMat = w.waterfallFoam.material as THREE.MeshBasicMaterial;
    foamMat.opacity = 0.42 + Math.sin(windTime.value * 3.1) * 0.12;

    // NPC updates (Fase 8 — pose animation culled by distance/quality;
    // far villagers keep their schedule but stop animating, so distant
    // streets stop saturating the frame)
    // Fase 9 — beyond ~260 m a villager is a handful of pixels: hide the
    // body outright (draw calls saved; schedule keeps running; they pop
    // back in well inside the fog so it's never visible)
    for (const npc of this.npcs) {
      const d2 = npc.position.distanceToSquared(p.position);
      const near = d2 < this.npcAnimDistance * this.npcAnimDistance;
      npc.group.visible = d2 < 260 * 260;
      npc.update(dt, w.sky.dayFraction, w.terrainHeight, this.colliders, p.position, near);
    }

    // --- Interaction scan ---
    if (!cine) {
      this.updateInteractions(store, dialogueActive);
    }

    // --- Discoveries ---
    this.discoveryTimer -= dt;
    if (!cine && this.discoveryTimer <= 0) {
      this.discoveryTimer = 0.5;
      this.checkDiscoveries(store);
    }

    // --- Herb glow pulse ---
    for (const herb of w.herbs) {
      if (herb.mesh.visible) {
        const petals = herb.mesh.children[herb.mesh.children.length - 1] as THREE.Mesh;
        const m = petals.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 0.55 + Math.sin(windTime.value * 2 + herb.pos.x) * 0.25;
      }
    }

    // --- Audio ambience ---
    const terrainHNow = w.terrainHeight.height(
      sailing ? (naval.activeShip ?? naval.playerShip)!.pos.x : p.position.x,
      sailing ? (naval.activeShip ?? naval.playerShip)!.pos.z : p.position.z,
    );
    this.audio.update(dt, {
      altitude: Math.max(0, p.position.y),
      shoreDist: clamp(terrainHNow, 0, 160),
      dayFactor: w.sky.dayFactor,
      waterfallDist: p.position.distanceTo(w.waterfallBasin),
      sailSpeed: sailingHud ? sailingHud.knots / 1.944 : 0,
    });

    // --- Heart of Oak slow regeneration ---
    if (this.state.learnedSkills.has('sup_corazon') && p.health < p.stats.maxHealth) {
      p.health = Math.min(p.stats.maxHealth, p.health + 0.6 * dt);
    }

    // --- Music intensity decay ---
    this.audio.musicIntensity += (this.musicIntensityTarget - this.audio.musicIntensity) * dt * 0.3;
    this.musicIntensityTarget += (0.15 - this.musicIntensityTarget) * dt * 0.05;

    // --- HUD sync ---
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.15;
      (window as unknown as { __kotfsYaw?: number }).__kotfsYaw = rig.yaw;
      (window as unknown as { __kotfsPlayer?: { x: number; y: number; z: number } }).__kotfsPlayer = {
        x: p.position.x, y: p.position.y, z: p.position.z,
      };
      const tracker = this.state.currentTracker();
      // Fase 11 — the señálero: live distance + bearing + in-world beacon
      // Fase 12 — + a true SCREEN-SPACE pin (edge-clamped when off-screen)
      const questPos = tracker ? this.resolveQuestTarget() : null;
      let marker: { dist: number; bearing: number } | null = null;
      let marker3d: { x: number; y: number; onScreen: boolean; dist: number; angle: number } | null = null;
      if (tracker && questPos) {
        const dx = questPos.x - p.position.x;
        const dz = questPos.z - p.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 2.5) {
          let rel = Math.atan2(dx, dz) - rig.yaw;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          marker = { dist: Math.round(dist), bearing: Math.round(rel * 10) / 10 };
        }
        // project the objective (raised to head height on its terrain) to screen
        this.tmpSplash.set(
          questPos.x,
          w.terrainHeight.height(questPos.x, questPos.z) + 2.2,
          questPos.z,
        );
        // camera-space first: z > 0 means BEHIND the camera (it looks down -z)
        const camSpace = this.tmpSplash.clone().applyMatrix4(this.engine.camera.matrixWorldInverse);
        const behindCam = camSpace.z > 0;
        this.tmpSplash.project(this.engine.camera);
        let sx = (this.tmpSplash.x * 0.5 + 0.5);
        let sy = (-this.tmpSplash.y * 0.5 + 0.5);
        if (behindCam) { sx = 1 - sx; sy = 1 - sy; }
        const onScreen = !behindCam && sx > 0.04 && sx < 0.96 && sy > 0.06 && sy < 0.94;
        // edge arrow: direction from screen centre toward the pin
        let ex = sx, ey = sy, angle = 0;
        if (!onScreen) {
          const cx0 = 0.5, cy0 = 0.5;
          let vx = ex - cx0, vy = ey - cy0;
          const len = Math.hypot(vx, vy) || 1;
          vx /= len; vy /= len;
          angle = Math.atan2(vx, -vy); // 0 = up, positive = clockwise
          ex = cx0 + vx * 0.40;
          ey = cy0 + vy * 0.40;
        }
        marker3d = {
          x: Math.max(0.03, Math.min(0.97, ex)),
          y: Math.max(0.06, Math.min(0.93, ey)),
          onScreen,
          dist: Math.round(dist),
          angle,
        };
        this.updateQuestBeacon(questPos, !!marker);
      } else {
        this.updateQuestBeacon(null, false);
      }
      const clickHint =
        !this.input.pointerLocked && !dialogueActive
          ? 'Click to take the helm'
          : null;
      store.setHud({
        health: p.health,
        maxHealth: p.stats.maxHealth,
        stamina: p.stamina,
        maxStamina: p.stats.maxStamina,
        clock: formatClock(w.sky.dayFraction),
        dayCount: w.sky.dayCount,
        questTracker: tracker ? { ...tracker, marker, marker3d } : null,
        fps: this.engine.fps,
        prompt: clickHint ?? store.prompt,
        sailing: sailingHud,
        atHelm: sailing,
        // Fase 15 — head under the sea (dive overlay in the HUD)
        submerged: p.diving || (p.swimming && p.position.y + 1.5 < w.water.waveHeightAt(p.position.x, p.position.z)),
      });
      // Fase 4 — riding HUD (gait / speed / cart) · Fase 15 — dragon riding HUD
      const mount = this.mounts?.mounted;
      const dRiddenHud = this.dragons?.riddenDragon ?? null;
      if (dragonRiding && dRiddenHud) {
        store.setMount({
          horseName: dRiddenHud.def.name.replace(' (summoned)', ''),
          gait: dRiddenHud.flying ? 'Vuelo' : Math.abs(dRiddenHud.rideVel) > 0.6 ? 'Marcha' : 'Quieto',
          speedKmh: Math.round(dRiddenHud.rideVel * 3.6),
          cart: false,
        });
      } else {
        store.setMount(
          riding && mount
            ? {
                horseName: mount.name,
                gait: this.ridingGait === 'gallop' ? 'Galope' : this.ridingGait === 'trot' ? 'Trote' : this.ridingGait === 'walk' ? 'Paso' : this.ridingGait === 'jump' ? 'Salto' : 'Quieto',
                speedKmh: Math.round(Math.abs(mount.speed) * 3.6),
                cart: !!this.mounts?.isCartHitched,
              }
            : null,
        );
      }
      store.setEndingActive(!!this.endings?.isPlaying);
      // Fase 3 combat HUD
      store.setWeaponSlots(this.combat!.slots());
      store.setBowDraw(p.bowDraw);
      // Fase 18 — archery HUD (ammo family, overdraw, ability cooldowns)
      if (!this.combat!.onBowHud) {
        this.combat!.onBowHud = (s) => useGameStore.getState().setBowHud(s);
      }
      // Fase 9 — melee combo chain indicator (+ Fase 11 fight labels:
      // WHIRLWIND!, COUNTER!, PERFECT DODGE!, GROUND SLAM!...)
      const comboHud = this.combat!.comboHud;
      const evLabel = this.combat!.eventLabel;
      store.setCombo(
        (comboHud || evLabel)
          ? { step: comboHud?.step ?? 0, counter: comboHud?.counter ?? false, label: comboHud?.label ?? evLabel ?? undefined }
          : null,
      );
      // Fase 17 — Sea Fury bar + the danger cue + finisher readiness
      useGameStore.getState().setValor(this.combat!.valorValue);
      const cue = this.bandits ? this.bandits.dangerCue(p.position) : null;
      useGameStore.getState().setDangerCue(cue);
      const canFinish = this.combat!.valorValue >= 100
        && !!(this.bandits?.finisherTarget(p.position));
      useGameStore.getState().setFinisherReady(canFinish);
      this.pollQuestEvents();
    }

    // --- Fase 11 — quest beacon life (spin + bob), every frame ---
    this.tickQuestBeacon(dt);

    // --- Map exploration ---
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 2;
      this.markExplored(p.position.x, p.position.z, 3);
    }

    // --- Playtime & autosave ---
    this.state.playtimeSeconds += dt;
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = 120;
      this.autosave();
    }

    // --- Tutorials ---
    if (!this.state.hasFlag('tut_night') && w.sky.dayFactor < 0.2) {
      this.state.setFlag('tut_night');
      store.notify('info', 'Night falls', 'Press L to light your lantern. The town torches keep the paths lit.');
    }
    if (!this.state.hasFlag('tut_stamina') && p.stamina < 25) {
      this.state.setFlag('tut_stamina');
      store.notify('info', 'Low stamina', 'Stop sprinting to recover it. Improve it with skills (K).');
    }

    // --- Fase 4 polls (story events that happen outside interactions) ---
    this.pollTimer -= dt;
    if (this.pollTimer <= 0) {
      this.pollTimer = 0.7;
      // Tormenta gifted by Halvard → the warhorse becomes yours
      if (this.state.hasFlag('tormenta_gifted') && !this.state.hasFlag('tormenta_bound')) {
        this.state.setFlag('tormenta_bound');
        this.mounts?.setOwned('tormenta');
        store.notify('quest', 'Tormenta is yours', "Eirik's warhorse accepts your saddle. Walk up and press E to ride; H to whistle him over.");
      }
      // Rich: 200 coins at once (sq_comercio)
      if (!this.state.hasFlag('rich_200') && this.state.countItem('coin') >= 200) {
        this.state.setFlag('rich_200');
      }
      // The ending triggers: choice dialogue flags → cinematic
      if (!this.endingPlayed) {
        const choice: EndingId | null = this.state.hasFlag('ending_guardian')
          ? 'guardian'
          : this.state.hasFlag('ending_crown')
            ? 'crown'
            : this.state.hasFlag('ending_free')
              ? 'free'
              : null;
        if (choice) {
          this.endingPlayed = true;
          this.audio.playEvent('ending');
          this.input.releaseLock();
          this.launchEndingCinematic(choice, false);
        }
      }
      // Ambient MP3 music bed: soft during peace, ducked by combat intensity
      if (this.musicEl) {
        const target = Math.max(0, this.settings.musicVolume * 0.32 * (1 - this.audio.musicIntensity * 0.85) * (this.audio.bossIntensity > 0.1 ? 0.15 : 1));
        this.musicEl.volume += (target - this.musicEl.volume) * 0.2;
        if (this.musicEl.paused && this.audio.initialized && store.phase === 'playing') {
          this.musicEl.play().catch(() => undefined);
        }
      }
    }
  }

  private grassRefreshKey = '';

  private refreshGrass(px: number, pz: number): void {
    const cx = Math.floor(px / 64);
    const cz = Math.floor(pz / 64);
    const key = `${cx},${cz}`;
    if (key === this.grassRefreshKey) return;
    this.grassRefreshKey = key;
    this.world!.vegetation.refreshGrassNear(px, pz);
  }

  /** Fase 20 — toggle the FREE CAM (P). Handoff is seamless both ways:
   *  entering keeps the current view, leaving lets the follow spring glide
   *  the rig back behind the hero. The store flag drives the HUD chip. */
  private toggleFreeCam(store: ReturnType<typeof useGameStore.getState>): void {
    const rig = this.rig!;
    const p = this.player!;
    const on = !rig.freeCam;
    // the two lenses are exclusive
    if (on && rig.firstPerson) this.toggleFirstPerson(store, true);
    rig.setFreeCam(on);
    // Drop any combat stance so the hero idles cleanly
    p.blocking = false;
    if (p.bowDraw >= 0) p.bowDraw = -1;
    store.setFreeCam(on);
    if (on) {
      store.notify(
        'info', 'Free camera',
        'The lens is yours: WASD fly · SPACE rise · SHIFT sink / hold for speed · wheel tunes speed · P returns to the hero.',
      );
    } else {
      store.notify('info', 'Back with the hero', 'The camera falls back into step behind you.');
    }
  }

  /** Fase 21 — toggle FIRST PERSON (B). The head bone collapses so the helm
   *  never blocks the eye-level lens; the body, hands and cape stay visible
   *  when you look down. `silent` = internal call (mode switch, no toast). */
  private toggleFirstPerson(store: ReturnType<typeof useGameStore.getState>, silent = false): void {
    const rig = this.rig!;
    const on = !rig.firstPerson;
    rig.setFirstPerson(on);
    const visual = this.player?.model as KnightModelGLB | undefined;
    visual?.setHeadHidden?.(on);
    store.setFirstPerson(on);
    if (!silent) {
      if (on) {
        store.notify(
          'info', 'First person',
          'Through the knight\u2019s eyes: look around, fight and sail as one — you\u2019ll see your own hands swing. B returns to third person.',
        );
      } else {
        store.notify('info', 'Third person', 'The camera settles back over your shoulder.');
      }
    }
  }

  // Interactions -----------------------------------------------------------

  private updateInteractions(store: ReturnType<typeof useGameStore.getState>, dialogueActive: boolean): void {
    // Fase 20 — while the free cam flies, prompts stand down (clean framing)
    if (this.rig?.freeCam) {
      if (store.prompt) store.setHud({ prompt: null });
      this.interactionPromptActive = false;
      return;
    }
    const w = this.world!;
    const p = this.player!;
    let best: { prompt: string; run: () => void } | null = null;
    let bestDist = Infinity;
    const riding = !!this.mounts?.ridingId;
    // Fase 15 — dragon riding (admin mounts)
    const dragonRiding = !!this.dragons?.ridingId;
    let interactHandled = false;

    if (!dialogueActive) {
      // Naval prompts have priority while aboard / at sea
      const navalPrompt = this.naval?.currentPrompt(p.position) ?? null;
      // Fase 15 — dragon riding: E dismounts (only near the ground)
      if (dragonRiding) {
        const dRidden = this.dragons!.riddenDragon;
        if (dRidden) {
          best = {
            prompt: dRidden.tooHighToDismount ? 'Descend with SHIFT to dismount' : 'Dismount the dragon',
            run: () => undefined,
          };
          bestDist = 0;
          if (this.input.pressed('interact')) {
            if (dRidden.tooHighToDismount) {
              store.notify('info', 'Too high to jump', 'Descend with SHIFT and land before dismounting.');
            } else {
              const d = this.dragons!.dismountDragon();
              if (d) {
                const spot = d.dismountSpot(new THREE.Vector3(), w.terrainHeight);
                p.teleport(spot.x, spot.y, spot.z);
                p.velocity.set(0, 0, 0);
              }
              this.rig!.setMountMode(false);
              this.audio.playEvent('wing');
            }
            interactHandled = true;
          }
        }
      } else if (riding) {
        const mountPrompt = this.mounts!.interactionPrompt(p.position);
        if (mountPrompt) {
          best = { prompt: mountPrompt.prompt, run: mountPrompt.run };
          bestDist = 0;
        }
        if (this.input.pressed('interact')) {
          if (best) {
            best.run(); // hitch/unhitch the cart
          } else {
            this.mounts!.dismount();
            const spot = this.mounts!.dismountSpot;
            if (spot) p.teleport(spot.x, spot.y, spot.z);
            this.rig!.setMountMode(false);
            this.audio.playEvent('hoof');
          }
          interactHandled = true;
        }
      } else if (navalPrompt) {
        best = { prompt: navalPrompt.prompt, run: navalPrompt.run };
        bestDist = 0;
      } else if (this.naval?.boardingActive) {
        // Fase 9 — cinematic finisher (PDF §5): a weakened captain exposes
        // the REMATE. E executes the killing blow.
        const fin = this.naval.finisherTarget();
        if (fin) {
          best = {
            prompt: `FINISHER! Execute ${fin.name}`,
            run: () => { this.naval!.executeFinisher(); },
          };
          bestDist = 0;
        }
      } else if (!this.naval?.playerSailing) {
        // Fase 17 — bandit finishers moved to V / Shift+Space and the Valor
        //  bar (see CombatSystem.doFinisher); E stays for the world.
        {
          // Fase 15 — a tame dragon (admin spawn) offers its saddle first
          const dNear = this.dragons?.nearestRideableDragon(p.position) ?? null;
          if (dNear && !this.dead) {
            best = {
              prompt: `Mount ${dNear.def.name.replace(' (summoned)', '')}`,
              run: () => {
                if (this.dragons!.mountDragon(dNear)) {
                  this.rig!.setMountMode(true, Math.max(11, dNear.bodyRadius * 2.6));
                  store.notify(
                    'info',
                    `Flying on ${dNear.def.name.replace(' (summoned)', '')}`,
                    'W forward · A/D turn · SPACE climb · SHIFT descend · LMB fire breath · E dismount',
                  );
                }
              },
            };
            bestDist = 0.3;
          }
          // Fase 4 — mount prompts (mount / buy) compete with world prompts
          const mountPrompt = this.mounts?.interactionPrompt(p.position) ?? null;
          if (mountPrompt && !best) {
            best = {
              prompt: mountPrompt.prompt,
              run: () => {
                mountPrompt.run();
                if (this.mounts?.ridingId) this.rig!.setMountMode(true);
              },
            };
            bestDist = 0.5;
          }
          for (const it of w.interactables) {
            if (it.available && !it.available()) continue;
            const d = it.pos.distanceTo(p.position);
            if (d < it.radius && d < bestDist) {
              const prompt = typeof it.prompt === 'string' ? it.prompt : it.prompt;
              if (!prompt) continue;
              bestDist = d;
              best = { prompt, run: it.run };
            }
          }
          // NPCs
          for (const npc of this.npcs) {
            const d = npc.position.distanceTo(p.position);
            if (d < 2.6 && d < bestDist) {
              bestDist = d;
              best = {
                prompt: `Talk to ${npc.name}`,
                run: () => {
                  npc.talkTo(p.position);
                  if (!this.dialogue.start(npc.def.dialogueId)) {
                    this.dialogue.startLore(npc.name, ['…']);
                  }
                  this.audio.playUi('click');
                },
              };
            }
          }
        }
      }
    }

    const promptText = best ? `[E] ${best.prompt}` : null;
    if (promptText !== store.prompt) {
      store.setHud({ prompt: promptText });
    }
    // Fase 17 — remember whether E is spoken for this frame (the rope-dart
    // stands down while an interaction owns the key). One frame of lag is
    // invisible: prompts live for seconds.
    this.interactionPromptActive = !!best;
    if (best && !dialogueActive && this.input.pressed('interact') && !interactHandled) {
      best.run();
    }
  }

  // Fase 11 — quest señálero ------------------------------------------------

  /** Fase 17 — true while an interaction prompt owns the E key (the
   *  rope-dart yields). Written by the prompt scan each frame. */
  private interactionPromptActive = false;

  /** The in-world beacon (gold diamond + light shaft + ground ring). */
  private questBeacon?: THREE.Group;
  private questBeaconTarget?: THREE.Vector3;

  private ensureQuestBeacon(): THREE.Group {
    if (this.questBeacon) return this.questBeacon;
    const g = new THREE.Group();
    g.name = 'quest_beacon';
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, opacity: 0.98, depthTest: false,
      }),
    );
    diamond.name = 'diamond';
    diamond.renderOrder = 999;
    diamond.position.y = 5.0;
    g.add(diamond);
    // a smaller counter-rotating diamond above reads as a compass
    const diamond2 = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshBasicMaterial({
        color: 0xfff0c0, transparent: true, opacity: 0.85, depthTest: false,
      }),
    );
    diamond2.name = 'diamond2';
    diamond2.renderOrder = 999;
    diamond2.position.y = 6.4;
    g.add(diamond2);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.14, 5.6, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd76a, transparent: true, opacity: 0.34,
        depthTest: false, blending: THREE.AdditiveBlending,
      }),
    );
    shaft.renderOrder = 998;
    shaft.position.y = 2.8;
    g.add(shaft);
    for (const [ri, rad] of [[0, 0.7], [1, 1.15]] as const) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(rad, rad + 0.2, 28),
        new THREE.MeshBasicMaterial({
          color: 0xffd76a, transparent: true, opacity: 0.3, depthTest: false,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        }),
      );
      ring.name = ri === 0 ? 'ring' : 'ring2';
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 998;
      ring.position.y = 0.06 + ri * 0.04;
      g.add(ring);
    }
    g.visible = false;
    this.engine.scene.add(g);
    this.questBeacon = g;
    return g;
  }

  /** Move/hide the beacon; the spin + bob runs every frame (below). */
  private updateQuestBeacon(target: THREE.Vector3 | null, show: boolean): void {
    const g = this.ensureQuestBeacon();
    if (!show || !target) {
      g.visible = false;
      this.questBeaconTarget = undefined;
      return;
    }
    if (!this.questBeaconTarget) this.questBeaconTarget = new THREE.Vector3();
    this.questBeaconTarget.copy(target);
    g.position.set(target.x, 0, target.z);
    g.position.y = this.world!.terrainHeight.height(target.x, target.z);
    g.visible = true;
  }

  /** Per-frame beacon life (spin + bob + ring pulse). */
  private tickQuestBeacon(dt: number): void {
    const g = this.questBeacon;
    if (!g || !g.visible) return;
    const now = performance.now();
    const diamond = g.getObjectByName('diamond') as THREE.Mesh | undefined;
    if (diamond) {
      diamond.rotation.y += dt * 2.2;
      diamond.position.y = 5.0 + Math.sin(now * 0.0021) * 0.3;
    }
    const diamond2 = g.getObjectByName('diamond2') as THREE.Mesh | undefined;
    if (diamond2) {
      diamond2.rotation.y -= dt * 3.4;
      diamond2.position.y = 6.4 + Math.sin(now * 0.0027 + 1.3) * 0.22;
    }
    const ring2 = g.getObjectByName('ring2') as THREE.Mesh | undefined;
    if (ring2) {
      const pulse = 1 + Math.sin(now * 0.0035) * 0.16;
      ring2.scale.setScalar(pulse);
      (ring2.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(now * 0.0035) * 0.12;
    }
    g.scale.setScalar(0.94 + Math.sin(now * 0.0031) * 0.05);
  }

  /**
   * Fase 11 — resolve the CURRENT objective of the active quest to a world
   * position (talk → the NPC, interact → the interactable, collect → a
   * known source, flag → a hand-mapped landmark). Returns null when the
   * step has no meaningful place (read a letter, wait states...).
   */
  private resolveQuestTarget(): THREE.Vector3 | null {
    const w = this.world;
    if (!w) return null;
    const state = this.state;
    // find the active quest + its first undone objective
    for (const qid of [...MAIN_QUEST_ORDER, ...SIDE_QUESTS]) {
      const st = state.questStates?.get?.(qid);
      if (!st || (st as { status?: string }).status !== 'active') continue;
      const def = QUESTS[qid];
      if (!def) continue;
      const obj = def.objectives.find((o) => !st.objectives.has(o.id));
      if (!obj) continue;
      return this.objectiveWorldPos(obj, qid);
    }
    return null;
  }

  private objectiveWorldPos(
    obj: { type: string; target: string; text: string },
    qid: string,
  ): THREE.Vector3 | null {
    const w = this.world!;
    const state = this.state;
    const t = obj.target;
    // 1) interactables by id (skip consumed/unavailable ones)
    for (const it of w.interactables) {
      if (it.id !== t) continue;
      if (it.available && !it.available()) break; // not currently reachable
      return it.pos.clone();
    }
    // 2) NPCs by dialogue id (talk objectives)
    for (const npc of this.npcs) {
      if (npc.def.dialogueId === t || npc.def.id === t) {
        return npc.position.clone();
      }
    }
    // 3) known NPC names used as talk targets
    const byName: Record<string, string> = {
      maren: 'Maren', rosa: 'Rosa', bram: 'Bram', aldric: 'Aldric', tom: 'Tom',
    };
    for (const npc of this.npcs) {
      if (byName[t] && npc.name.toLowerCase().includes(byName[t].toLowerCase())) {
        return npc.position.clone();
      }
    }
    // 3.5) Fase 12 — bounty hunts: point at the NEAREST bandit camp.
    // Fase 16 — ask the REAL camp table from BanditSystem (the hand-copied
    // list had drifted before and sent players to empty clearings).
    if (obj.type === 'kill' && t === 'bandit' && this.player) {
      const camps = this.bandits?.campList() ?? [
        { id: 'camp_camino', name: '', x: 62, z: 58 },
        { id: 'camp_vaelthara', name: '', x: -206, z: -112 },
        { id: 'camp_vigilias', name: '', x: -118, z: -232 },
        { id: 'camp_costa', name: '', x: -286, z: 170 },
      ];
      let best: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (const c of camps) {
        const d = Math.hypot(c.x - this.player.position.x, c.z - this.player.position.z);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) return new THREE.Vector3(best.x, 0, best.z);
    }
    // 3.6) Fase 16 — DYNAMIC collect sources: the marker points at the
    // nearest thing that can actually still be collected/used, so it never
    // leads somewhere "else" (the old fixed coords were up to 40+ m off and
    // kept pointing at spent spots).
    if (obj.type === 'collect' && this.player) {
      const px = this.player.position.x;
      const pz = this.player.position.z;
      const nearest = (spots: Array<{ x: number; z: number }>) => {
        let b: { x: number; z: number } | null = null;
        let bd = Infinity;
        for (const s of spots) {
          const d = Math.hypot(s.x - px, s.z - pz);
          if (d < bd) { bd = d; b = s; }
        }
        return b ? new THREE.Vector3(b.x, 0, b.z) : null;
      };
      // petals → the closest UNPICKED herb
      if (t === 'petalo') {
        const spots = w.herbs
          .filter((h) => !state.pickedHerbs.has(h.id))
          .map((h) => ({ x: h.pos.x, z: h.pos.z }));
        const hit = nearest(spots);
        if (hit) return hit;
      }
      // oak planks → the closest crate that has not been emptied
      // (interactables `crate_madera_*` with `available()` true)
      if (t === 'madera') {
        const spots = w.interactables
          .filter((it) => it.id.startsWith('crate_madera_') && (!it.available || it.available()))
          .map((it) => ({ x: it.pos.x, z: it.pos.z }));
        const hit = nearest(spots);
        if (hit) return hit;
      }
      // reef fish → the closest stranded catch not yet taken
      if (t === 'pez') {
        const spots = w.interactables
          .filter((it) => it.id.startsWith('fish_spot_') && (!it.available || it.available()))
          .map((it) => ({ x: it.pos.x, z: it.pos.z }));
        const hit = nearest(spots);
        if (hit) return hit;
      }
      // dragon scales → the closest LIVING dragon (they drop them)
      if (t === 'escama') {
        const spots = (this.dragons?.list() ?? [])
          .filter((d) => d.alive)
          .map((d) => ({ x: d.pos.x, z: d.pos.z }));
        const hit = nearest(spots);
        if (hit) return hit;
      }
      // Morwen's seal → the Gaviota Sangrienta herself (live position)
      if (t === 'sello') {
        const g = this.naval?.enemies.find((b) => b.ship.id === 'gaviota' && !b.ship.sunk);
        if (g) return new THREE.Vector3(g.ship.pos.x, 0, g.ship.pos.z);
      }
      // maple seed → under the Great Maple
      if (t === 'semilla_arce') {
        const seed = w.interactables.find((it) => it.id === 'seed_arce');
        if (seed && (!seed.available || seed.available())) return seed.pos.clone();
      }
    }
    // 4) collect items → static source areas (last resort: the dynamic
    // branches above already caught everything with a real source)
    const SOURCES: Record<string, [number, number]> = {
      petalo: [22, 150],        // village square + meadows (the mission text)
      madera: [17.5, 231.5],   // Bram's stamped crates — the home pier
      lona: [11, 172],         // Rosa prepares the canvas (her stall)
      cuerda: [18, 226],       // Tom has the hemp rope (the dock)
      sello: [-425, -308],     // aboard the Gaviota Sangrienta
      escama: [-136, -252],    // the drake nest by the stone circle
      semilla_arce: [-120, -270],   // the Great Maple
      moneda_antigua: [-15, 622],   // tides drop old coins on the Mist Isles
      espejo: [575, 108],      // the lighthouse plateau chest
      mapa_tesoro: [-178, -187],    // the crystal-grotto captain's chest
      corazon_cuervo: [-398, -450], // Kraivenn's cove
      reliquia_cuervo: [-398, -450],
    };
    if (obj.type === 'collect' && SOURCES[t]) {
      return new THREE.Vector3(SOURCES[t][0], 0, SOURCES[t][1]);
    }
    // 5) flag objectives → mapped to the REAL landmark each flag lives at.
    // Fase 16 rewrite: the old four entries were up to 40 m off the actual
    // trigger spots (maren_herbs_done pointed at the square — 40 m from
    // Maren; read_letter pointed at the square while the letter is read
    // from the inventory). Everything now resolves to live data where it
    // exists and to verified coordinates otherwise.
    if (obj.type === 'flag') {
      // 5a) flags completed by talking to a specific NPC → that NPC, live
      const FLAG_NPC: Record<string, string> = {
        maren_herbs_done: 'maren',
      };
      const npcFlag = FLAG_NPC[t]
        ? this.npcs.find((n) => n.def.id === FLAG_NPC[t] || n.def.dialogueId === FLAG_NPC[t])
        : undefined;
      if (npcFlag) return npcFlag.position.clone();
      // 5b) dragon flags → the LIVE dragon while it exists (else its lair)
      const DRAGON_LAIRS: Record<string, [number, number]> = {
        vaelthara_seen: [-243, -140], vaelthara_dead: [-243, -140],
        skarnvind_seen: [0, 460], skarnvind_dead: [0, 460],
        ancestro_seen: [20, -300], ancestro_dead: [20, -300],
        kraivenn_seen: [-398, -450], kraivenn_dead: [-398, -450],
        drake_stones_dead: [-136, -252],
        drake_grotto_dead: [196, -172],
      };
      const DRAGON_FLAG_TO_ID: Record<string, string> = {
        vaelthara_seen: 'vaelthara', vaelthara_dead: 'vaelthara',
        skarnvind_seen: 'skarnvind', skarnvind_dead: 'skarnvind',
        ancestro_seen: 'ancestro', ancestro_dead: 'ancestro',
        kraivenn_seen: 'kraivenn', kraivenn_dead: 'kraivenn',
      };
      const dId = DRAGON_FLAG_TO_ID[t];
      if (dId) {
        const live = (this.dragons?.list() ?? []).find((d) => d.def.id === dId && d.alive);
        if (live) return new THREE.Vector3(live.pos.x, 0, live.pos.z);
      }
      if (DRAGON_LAIRS[t]) return new THREE.Vector3(DRAGON_LAIRS[t][0], 0, DRAGON_LAIRS[t][1]);
      // 5c) the lore tablets — the marker points at the physical tablet
      // (the interactable), not at a random nearby clearing
      const LORE_TO_INTERACTABLE: Record<string, string> = {
        lore_tablet_ruins: 'tablet_ruins',
        lore_stones_center: 'stones_center',
        lore_tower_door: 'tower_door',
      };
      const loreId = LORE_TO_INTERACTABLE[t];
      if (loreId) {
        const it = w.interactables.find((x) => x.id === loreId);
        if (it) return it.pos.clone();
      }
      // 5d) discovery flags → the POI's true coordinates
      const POI_FLAGS: Record<string, string> = {
        poi_faro: 'faro', poi_grotto: 'grotto', gran_arce_seen: 'granarce',
        knight_seen: 'cala',
      };
      const poi = POIS.find((p) => p.id === POI_FLAGS[t]);
      if (poi) return new THREE.Vector3(poi.x, 0, poi.z);
      // 5e) sailing / story landmarks — verified against the actual triggers
      const FLAGS: Record<string, [number, number]> = {
        reached_crow: [-540, -450],     // ISLANDS.crow — the real island centre
        morwen_defeated: [-425, -308], // the Gaviota's cove anchorage
        elite_hunter_sunk: [-360, -490], // the flagship wreck reef
        cart_hitched: [-8, 192],      // the cart by the stable (Fase 18 spot)
        // read_letter intentionally NOT mapped: the letter is read from the
        // inventory (Tab), so a map pin would send you walking nowhere.
      };
      if (t === 'reached_crow') {
        const crow = ISLANDS.find((i) => i.id === 'crow');
        if (crow) return new THREE.Vector3(crow.x, 0, crow.z);
      }
      if (t === 'cart_hitched' && this.mounts?.cart) {
        return new THREE.Vector3(this.mounts.cart.pos.x, 0, this.mounts.cart.pos.z);
      }
      if (t === 'morwen_defeated') {
        const g = this.naval?.enemies.find((b) => b.ship.id === 'gaviota');
        if (g && !g.ship.sunk) return new THREE.Vector3(g.ship.pos.x, 0, g.ship.pos.z);
      }
      if (FLAGS[t]) return new THREE.Vector3(FLAGS[t][0], 0, FLAGS[t][1]);
    }
    void qid;
    void state;
    return null;
  }

  private checkDiscoveries(store: ReturnType<typeof useGameStore.getState>): void {
    const w = this.world!;
    const p = this.player!;
    // Fase 4 — POI ids that also unlock story flags
    const poiFlags: Record<string, string> = {
      faro: 'poi_faro',
      grotto: 'poi_grotto',
      cala: 'kraivenn_seen',
      granarce: 'gran_arce_seen',
    };
    for (const poi of POIS) {
      if (this.state.discoveredPOIs.has(poi.id)) continue;
      const d = Math.hypot(p.position.x - poi.x, p.position.z - poi.z);
      if (d < poi.radius) {
        this.state.discoveredPOIs.add(poi.id);
        this.state.giveXp(poi.xp);
        this.state.addJournal({
          id: `poi_${poi.id}`,
          kind: 'discovery',
          title: poi.name,
          text: poi.journal,
        });
        // Fase 4 — certain discoveries unlock story flags
        const flag = poiFlags[poi.id];
        if (flag) this.state.setFlag(flag);
        this.audio.playEvent('discovery');
        this.musicIntensityTarget = 0.45;
        store.setDiscovery({ title: poi.name, sub: `Lugar descubierto · +${poi.xp} XP` });
        setTimeout(() => {
          if (useGameStore.getState().discovery?.title === poi.name) {
            useGameStore.getState().setDiscovery(null);
          }
        }, 4200);
        this.markExplored(poi.x, poi.z, 6);
      }
    }
  }

  private markExplored(x: number, z: number, radiusCells: number): void {
    const size = 128;
    if (this.state.exploredMap.length !== size * size) {
      this.state.exploredMap = new Array(size * size).fill(false);
    }
    const cx = Math.floor(((x + 716) / 1432) * size);
    const cz = Math.floor(((z + 716) / 1432) * size);
    for (let dz = -radiusCells; dz <= radiusCells; dz++) {
      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= size || iz >= size) continue;
        this.state.exploredMap[iz * size + ix] = true;
      }
    }
  }

  // ------------------------------------------------------------------- api

  private installApi(): void {
    const st = () => this.state;

    gameApi.startNewGame = () => {
      this.audio.init();
      this.audio.resume();
      this.newGameWithIntro();
    };
    gameApi.continueGame = () => {
      this.audio.init();
      this.audio.resume();
      const slot = SaveSystem.newestSlot();
      return slot !== null && this.loadFromSlot(slot);
    };
    gameApi.loadSlot = (slot) => {
      this.audio.init();
      this.audio.resume();
      return this.loadFromSlot(slot);
    };
    gameApi.saveSlot = (slot) => this.saveToSlot(slot);
    gameApi.slotMetas = () => SaveSystem.SAVE_SLOTS.map((s) => SaveSystem.slotMeta(s));
    gameApi.resume = () => this.resume();
    gameApi.returnToMenu = () => this.returnToMenu();

    gameApi.inventory = () => {
      const inv = [...st().inventory.entries()].map(([id, count]) => ({ id, count }));
      return inv.sort((a, b) => (ITEMS[a.id]?.kind ?? '').localeCompare(ITEMS[b.id]?.kind ?? ''));
    };
    gameApi.useItem = (id) => {
      const item = ITEMS[id];
      if (!item?.usable) return;
      if (id === 'pocion') {
        if (!st().removeItem('pocion', 1)) return;
        const p = this.player!;
        p.health = Math.min(p.stats.maxHealth, p.health + 45);
        this.audio.playEvent('pickup');
        useGameStore.getState().notify('item', 'Healing potion', 'Health restored.');
      }
    };
    gameApi.readItem = (id) => {
      const item = ITEMS[id];
      if (!item?.lore) return;
      this.dialogue.startLore(item.name, item.lore);
      if (id === 'carta' && !st().hasFlag('read_letter')) {
        st().setFlag('read_letter');
      }
      useGameStore.getState().openOverlay(null);
    };
    gameApi.equipItem = (id) => {
      if (!ITEMS[id]?.equipable) return;
      st().equip(id);
      this.combat?.onUiEquip();
      this.applyStats();
      this.syncSwordVisuals();
      this.audio.playEvent('unlock');
      // Fase 16 — armor / wings get their own hints
      const kind = ITEMS[id]?.kind;
      if (kind === 'armor') {
        useGameStore.getState().notify('item', ITEMS[id].name, 'Armor equipped: more max health and less damage taken.');
        return;
      }
      if (kind === 'wings') {
        useGameStore.getState().notify(
          'item', ITEMS[id].name,
          'Wings equipped. Jump from a height and hold SPACE in the air to glide.',
        );
        return;
      }
      const w = WEAPONS[id];
      const hint = w
        ? w.kind === 'bow'
          ? 'Hold the click to draw; release to fire. Stuck arrows can be recovered.'
          : w.kind === 'spear'
            ? 'Click for long-reaching quick thrusts; hold for a heavy blow.'
            : 'Click to attack; hold for a heavy blow that staggers beasts.'
        : 'Left-click to attack.';
      useGameStore.getState().notify('item', ITEMS[id].name, hint);
    };
    gameApi.unequipWeapon = () => {
      st().unequip();
      this.combat?.onUiEquip();
    };
    gameApi.equippedWeapon = () => st().equippedWeapon;
    gameApi.equippedArmor = () => st().equippedArmor;
    gameApi.equippedWings = () => st().equippedWings;
    gameApi.unequipArmor = () => {
      st().unequipArmor();
      this.applyStats();
      this.combat?.onUiEquip();
    };
    gameApi.unequipWings = () => {
      st().unequipWings();
      this.applyStats();
      this.combat?.onUiEquip();
    };

    // --- Fase 16 — merchant system (the smiths) ---
    gameApi.shopCatalog = (vendor) => {
      const def = VENDORS[vendor];
      if (!def) return null;
      const s = st();
      const levelOk = s.level >= def.minLevel;
      const coins = s.countItem('coin');
      return {
        name: def.name,
        title: def.title,
        minLevel: def.minLevel,
        levelOk,
        level: s.level,
        coins,
        entries: def.entries.map((e) => {
          const item = ITEMS[e.item];
          const statsBits: string[] = [];
          if (item?.armor) statsBits.push(`+${item.armor.hp} health · −${Math.round(item.armor.reduce * 100)}% damage`);
          if (item?.glide) statsBits.push(`planeo ${item.glide.speed} m/s · descenso ${Math.abs(item.glide.sink)} m/s`);
          if (item?.kind === 'weapon') {
            const w = WEAPONS[e.item];
            if (w) statsBits.push(`${w.lightDmg}/${w.heavyDmg} light/heavy damage`);
          }
          return {
            id: e.item,
            name: item?.name ?? e.item,
            desc: item?.desc ?? '',
            icon: item?.icon ?? 'Package',
            price: e.price,
            qty: e.qty ?? 1,
            note: e.note,
            // Fase 18 — consumable bundles (arrow quivers) stay repeatable:
            // only unique gear locks the buy button once carried.
            owned: s.hasItem(e.item) && !(item?.stackable ?? false),
            canAfford: coins >= e.price,
            rarity: item?.rarity,
            stats: statsBits.join(' · '),
          };
        }),
      };
    };
    gameApi.buyShopItem = (vendor, itemId) => {
      const def = VENDORS[vendor];
      const entry = def?.entries.find((e) => e.item === itemId);
      if (!def || !entry) return 'level';
      const s = st();
      if (s.level < def.minLevel) return 'level';
      if (s.countItem('coin') < entry.price) return 'gold';
      if (!s.removeItem('coin', entry.price)) return 'gold';
      const qty = entry.qty ?? 1;
      s.addItem(itemId, qty);
      this.audio.playEvent('unlock');
      useGameStore.getState().notify(
        'item',
        ITEMS[itemId]?.name ?? itemId,
        `${def.name}: "Fair deal." ${qty > 1 ? `${qty} units` : 'One piece'} added — you have ${s.countItem('coin')} coins left.`,
      );
      return 'ok';
    };

    // Fase 15 — resolve the standing pirate toll negotiation
    gameApi.negotiateChoice = (option) => {
      this.pirateAmbush?.resolve(option);
    };

    // --- Fase 22 — THE FORGE OF LEGENDS (crafting api) ---
    gameApi.forgeCatalog = (station) => {
      if (!this.forge) return null;
      const def = this.forge.stationDef(station);
      const s = st();
      const recipes = this.forge.catalog(station).map((r) => ({
        id: r.id,
        out: r.out,
        outName: r.outName,
        outIcon: r.outIcon,
        outRarity: r.outRarity,
        gold: r.gold,
        note: r.note,
        canCraft: r.canCraft,
        status: r.status,
        level: r.level,
        levelOk: r.levelOk,
        mats: r.mats,
      }));
      return {
        station,
        name: def.name,
        title: def.title,
        greeting: def.greeting,
        level: s.level,
        coins: s.countItem('coin'),
        eclipse: {
          active: this.forge.eclipseActive,
          left: Math.ceil(this.forge.eclipseLeft),
          hasEssence: s.hasItem('esencia_solar'),
          canSummon: s.hasItem('esencia_solar') && !this.forge.eclipseActive,
        },
        recipes,
      };
    };
    gameApi.forgeCraft = (station, recipeId) => this.forge?.craft(recipeId, station) ?? 'gate';
    gameApi.summonEclipse = () => this.forge?.summonEclipse() ?? false;

    gameApi.journal = () => st().journal;
    gameApi.quests = (): QuestView[] => {
      const views: QuestView[] = [];
      const all = [...MAIN_QUEST_ORDER, ...SIDE_QUESTS];
      for (const qid of all) {
        const def = QUESTS[qid];
        const qs = st().questStates.get(qid);
        if (!qs) {
          // Hide not-yet-started quests
          continue;
        }
        views.push({
          id: qid,
          title: def.title,
          description: def.description,
          status: qs.status,
          objectives: def.objectives.map((o) => ({
            text: o.text,
            done: qs.objectives.has(o.id),
          })),
        });
      }
      return views;
    };
    gameApi.skills = () =>
      SKILLS.map((s) => ({
        ...s,
        learned: st().learnedSkills.has(s.id),
        canLearn: st().canLearn(s.id),
      }));
    gameApi.skillPoints = () => st().skillPoints;
    gameApi.learnSkill = (id) => {
      if (st().learnSkill(id)) {
        this.applyStats();
        this.naval?.applyPerks(); // navigation skills change the ship
        this.audio.playEvent('levelup');
        useGameStore.getState().notify('item', 'Habilidad aprendida', SKILLS.find((s) => s.id === id)?.name ?? id);
      }
    };
    gameApi.levelInfo = () => ({
      level: st().level,
      xp: st().xp,
      xpToNext: xpForLevel(st().level),
    });

    gameApi.mapCanvas = () => this.world?.mapCanvas ?? null;
    gameApi.playerMap = () => ({
      x: this.player!.position.x,
      z: this.player!.position.z,
      yaw: this.player!.yaw,
      discovered: [...st().discoveredPOIs],
      explored: st().exploredMap,
      ship: this.naval?.playerShip && !this.naval.playerShip.sunk
        ? {
          x: this.naval.playerShip.pos.x,
          z: this.naval.playerShip.pos.z,
          heading: this.naval.playerShip.heading,
        }
        : undefined,
    });
    gameApi.settings = () => ({ ...this.settings });
    gameApi.applySettings = (s) => {
      this.settings = { ...s };
      SaveSystem.writeSettings(s);
      // Fase 13 — cada interruptor gráfico se aplica EN CALIENTE:
      // resolución, sombras, niebla, agua, pasto, luces, distancia de chunks…
      const gfx = graphicsOf(s);
      const tier: QualityLevel = s.tier ?? 'medium';
      this.engine.applyGraphics(gfx, tier);
      this.postfx?.setEnabled(this.engine.quality.postfx);
      this.world?.terrain.setChunkRadius(gfx.renderChunks);
      const q = this.engine.quality;
      // Fase 14 — ritmo de relleno del pasto por escalón (anti-stutter)
      const fillsPerFrame = tier === 'ultra' ? 8 : tier === 'high' ? 4 : tier === 'medium' ? 3 : 4;
      this.world?.vegetation.setGrassDensity(q.grassDensity, fillsPerFrame);
      this.world?.water.applyGraphicsOptions({
        segments: q.waterSegments,
        waveRadius: q.waveMotionRadius,
        refl: gfx.reflections,
        waves: gfx.waves,
      });
      if (this.world) {
        this.world.sky.qualityFogMul = fogMulForChunks(q.fogMul, gfx.renderChunks, QUALITY_PRESETS[tier].viewChunkRadius);
        // Fase 14 — nubes por escalón; el pasto se recrea al cambiar densidad:
        // re-anclar los meshes vivos al excluidor del reflejo.
        this.world.sky.setCloudQuality(CLOUD_QUAL[tier]);
        this.world.water.reflHide = this.world.vegetation.grassMeshes;
      }
      // Fase 14 — presupuesto de llamas simultáneas por escalón
      try { getFlameFX().setBudget(FLAME_BUDGET[tier]); } catch { /* sin escena aún */ }
      this.engine.camera.far = cameraFarForChunks(gfx.renderChunks);
      this.engine.camera.updateProjectionMatrix();
      this.npcAnimDistance = q.npcAnimDistance;
      // Luces realistas: flag global — cada dueño de PointLight lo consulta
      // al frame siguiente (antorchas, farol, brasas de dragón, fuego VFX).
      gfxRuntime.pointLights = gfx.realLights;
      // Fase 16 — oleaje OFF ⇒ sin wakes interactivos (jugador/barcos): en un
      // mar plano los anillos de estela se leen como un bloom feo.
      gfxRuntime.waves = gfx.waves;
      // Rebuild the grass ring at the new density right away
      if (this.player) {
        this.world?.vegetation.refreshGrassNear(this.player.position.x, this.player.position.z);
      }
      this.input.sensitivity = s.sensitivity;
      this.rig!.sensitivity = s.sensitivity;
      this.rig!.invertY = s.invertY;
      this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume });
    };
    gameApi.fps = () => this.engine.fps;
    gameApi.skipIntro = () => this.finishIntro();
    gameApi.skipEnding = () => this.endings?.skip();
    gameApi.mountInfo = () => {
      const mount = this.mounts?.mounted;
      if (!mount) return null;
      return { name: mount.name, gait: this.ridingGait, speed: Math.abs(mount.speed), cart: !!this.mounts?.isCartHitched };
    };
    gameApi.endingsUnlocked = () => EndingSystem.unlockedEndings();
    gameApi.chooseDialogue = (i) => this.dialogue.choose(i);
    gameApi.closeDialogue = () => this.dialogue.close();
    gameApi.narrationBlip = () => this.audio.playWhooshVoice();
    gameApi.playtime = () => st().playtimeSeconds;
    gameApi.clickResumeHint = () => {
      const phase = useGameStore.getState().phase;
      if (phase === 'playing') this.input.requestLock();
    };

    // --- Fase 8 — admin panel (U+I+O): spawn anything + free-fly ---
    gameApi.adminSpawn = (kind, species) => {
      const p = this.player;
      if (!p) return null;
      // spawn point: 12 m in front of the player, on open ground
      const sx = p.position.x + Math.sin(p.yaw) * 14;
      const sz = p.position.z + Math.cos(p.yaw) * 14;
      if (kind === 'ship') {
        const w = this.naval!.spawnAdminShip(p.position.x, p.position.z);
        return `Ship anchored in the water (${w.x.toFixed(0)}, ${w.z.toFixed(0)})`;
      }
      if (kind === 'horse') {
        const coats = ['bay', 'black', 'chestnut', 'grey'] as const;
        const coat = coats[Math.floor(Math.random() * coats.length)];
        const names = ['Siroco', 'Vendaval', 'Marea', 'Bruma', 'Ceniza', 'Tempestad'];
        const name = names[Math.floor(Math.random() * names.length)];
        this.mounts!.spawnHorse(
          `admin_h_${Date.now() % 100000}`, name, coat,
          sx, sz, true, 0,
        );
        return `${name} (${coat}) appeared before you`;
      }
      if (kind === 'dragon') {
        const d = this.dragons!.adminSpawn(species ?? 'drake_stones', sx, sz);
        return d ? `${d.def.name.replace(' (summoned)', '')} appeared — docile and rideable (E)` : null;
      }
      return null;
    };
    gameApi.adminFly = (on) => {
      if (!this.player) return false;
      this.player.flying = on;
      if (on) {
        this.player.velocity.set(0, 0, 0);
        useGameStore.getState().notify('info', 'Flight mode ON', 'SPACE up · E down · SHIFT faster');
      } else {
        this.player.verticalVel = 0;
        useGameStore.getState().notify('info', 'Flight mode OFF', 'Gravity is in charge again.');
      }
      return on;
    };
    gameApi.adminFlying = () => !!this.player?.flying;
    gameApi.adminSetTime = (f) => {
      if (!this.world) return;
      this.world.sky.dayFraction = Math.max(0, Math.min(0.999, f));
    };
    gameApi.adminCinematics = () => this.adminCinematicList();
    gameApi.adminPlayCinematic = (key) => this.adminPlayCinematic(key);
  }

  // ---------------------------------------------------------------- state events

  private lastQuestCount = -1;

  /** Fase 9 — wire the cinematic camera driver once (shots steer the real
   *  camera through the rig's manual mode). */
  private cinematicsPlaySetup(): void {
    this.cinematicDrive = (pos, look, fov) => {
      this.rig?.setManual(pos, look, fov);
    };
  }

  private cinematicDrive: ((pos: THREE.Vector3, look: THREE.Vector3, fov?: number) => void) | null = null;

  /**
   * Fase 9 (PDF §6.1) — EPIC VICTORY cinematic after a boss dragon falls.
   * Shot on the real corpse with the real hero; the world keeps breathing
   * (sky, sea, death animation) around the camera. Skippable.
   */
  private playBossVictoryCinematic(d: Dragon): void {
    if (!this.world || !this.player) return;
    if (this.cinematics.active) return;
    if (this.endings?.isPlaying) return;
    if (this.naval?.boardingActive) return;
    if (this.dead) return;
    const w = this.world;
    const p = this.player;
    const dp = d.pos;                       // live corpse anchor
    const R = Math.max(16, d.bodyRadius * 2.0);
    const firstEver = !this.state.hasFlag('cine_first_dragon');
    if (firstEver) this.state.setFlag('cine_first_dragon');
    this.audio.bossIntensity = 0;
    this.musicIntensityTarget = 0.28;

    const groundClamp = (x: number, y: number, z: number): THREE.Vector3 => {
      const g = w.terrainHeight.height(x, z);
      return new THREE.Vector3(x, Math.max(y, g + 1.7), z);
    };
    const corpseCenter = () => new THREE.Vector3(dp.x, dp.y + d.bodyRadius * 0.25, dp.z);
    const a0 = Math.random() * Math.PI * 2;

    const shots: CineShot[] = [
      // 1 — the beast falls: a low quarter-orbit around the dying dragon
      {
        dur: 3.4,
        fromPos: groundClamp(dp.x + Math.cos(a0) * R, dp.y + 3.4, dp.z + Math.sin(a0) * R),
        toPos: groundClamp(dp.x + Math.cos(a0 + 1.35) * R, dp.y + 4.6, dp.z + Math.sin(a0 + 1.35) * R),
        fromLook: corpseCenter,
        toLook: corpseCenter,
        fov: 46,
        title: firstEver ? 'FIRST DRAGON FELLED' : undefined,
        subtitle: firstEver ? 'the songs do not yet dare tell it' : undefined,
      },
      // 2 — the hero: over-the-shoulder of the knight, dragon beyond.
      //    Fase 11 — REAL ACTING: the vow over the fallen beast — the blade
      //    rises slowly to the sky while the camera frames the living hero.
      {
        dur: 2.5,
        fromPos: () => {
          const toD = new THREE.Vector3(dp.x - p.position.x, 0, dp.z - p.position.z).normalize();
          const side = new THREE.Vector3(-toD.z, 0, toD.x);
          return groundClamp(
            p.position.x - toD.x * 2.4 + side.x * 1.9,
            p.position.y + 2.1,
            p.position.z - toD.z * 2.4 + side.z * 1.9,
          );
        },
        fromLook: () => new THREE.Vector3(
          p.position.x + (dp.x - p.position.x) * 0.4,
          p.position.y + 1.5,
          p.position.z + (dp.z - p.position.z) * 0.4,
        ),
        fov: 40,
        fx: {
          update: (k, dt) => heroSalute(p.model).update?.(k, dt),
        },
      },
      // 3 — the world breathes: wide establishing shot + title card
      {
        dur: 3.1,
        fromPos: groundClamp(dp.x - R * 1.25, dp.y + d.bodyRadius * 0.9 + 7.5, dp.z - R * 1.25),
        toPos: groundClamp(dp.x - R * 1.05, dp.y + d.bodyRadius * 0.7 + 6.2, dp.z - R * 1.05),
        fromLook: corpseCenter,
        toLook: corpseCenter,
        fov: 52,
        title: `${d.def.name.toUpperCase()} HAS FALLEN`,
        subtitle: d.def.title ?? 'the legend of the tides',
      },
    ];

    this.cinematics.play(shots, {
      drive: (pos, look, fov) => this.cinematicDrive?.(pos, look, fov),
      onState: (s) => useGameStore.getState().setCinematic(
        s ? { title: s.title, subtitle: s.subtitle, progress: s.progress, shot: s.shot, total: s.total } : null,
      ),
      onDone: () => {
        this.musicIntensityTarget = 0.45;
        // Smooth handoff: the rig snaps behind the hero
        this.rig?.snapBehind(p.position);
      },
    });
  }

  /** Fase 13 — sonda de depuración para las sondas E2E del navegador
   *  (solo lectura: estado de los ajustes gráficos aplicados en caliente). */
  debugProbe(): Record<string, unknown> {
    const w = this.world as WorldRefs | undefined;
    const u = (w?.water as unknown as { material?: { uniforms?: Record<string, { value: unknown }> } })
      ?.material?.uniforms;
    return {
      fps: this.engine.fps,
      quality: this.engine.quality,
      cameraFar: this.engine.camera.far,
      pixelRatio: this.engine.renderer.getPixelRatio(),
      shadowsEnabled: this.engine.renderer.shadowMap.enabled,
      waveAmp: u?.uWaveAmp?.value,
      waveMotion: u?.uWaveMotion?.value,
      chunkRadius: w?.terrain.chunkRadius,
      fogMul: w?.sky.qualityFogMul,
      pointLights: gfxRuntime.pointLights,
      // Fase 14 — métricas de rendimiento para E2E
      cloudQual: w?.sky.cloudQual,
      grassBlades: w?.vegetation.stats.blades,
      waterSegments: (w?.water as unknown as { mesh?: { geometry: { parameters?: { widthSegments?: number } } } })
        ?.mesh?.geometry?.parameters?.widthSegments,
      // Fase 16 — interactive-water gate (wakes OFF when the sea is flat)
      waves: gfxRuntime.waves,
      // Fase 16 — merchant anchors for the E2E (positions + dwarf scale)
      npcs: this.npcs.map((n) => ({
        id: n.def.id,
        x: Math.round(n.position.x), z: Math.round(n.position.z),
        scale: n.def.scale ?? null,
      })),
      settings: { ...this.settings },
    };
  }

  /** Fase 13 — E2E: aplicar ajustes por el mismo camino que el panel UI. */
  debugApplySettings(s: Settings): void {
    gameApi.applySettings(s);
  }

  /** Fase 16 — E2E: the live quest-marker resolution (or null). */
  debugQuestTarget(): { x: number; z: number } | null {
    const t = this.resolveQuestTarget();
    return t ? { x: Math.round(t.x * 10) / 10, z: Math.round(t.z * 10) / 10 } : null;
  }

  /** Fase 9 (PDF §6.2) — chapter milestone cinematic (short panoramic card).
   *  `force` (Fase 10 admin viewer) replays even if the flag is set. */
  private playChapterCinematic(ch: { n: number; title: string; sub: string }, force = false): void {
    if (!this.world || !this.player) return;
    if (this.cinematics.active || this.endings?.isPlaying) return;
    const p = this.player;
    const w = this.world;
    const flag = `cine_chapter_${ch.n}`;
    if (this.state.hasFlag(flag) && !force) return;
    this.state.setFlag(flag);

    const groundClamp = (x: number, y: number, z: number): THREE.Vector3 => {
      const g = w.terrainHeight.height(x, z);
      return new THREE.Vector3(x, Math.max(y, g + 1.7), z);
    };
    const yaw = this.rig?.yaw ?? 0;
    const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const shots: CineShot[] = [
      // 1 — rise from the hero toward the horizon
      {
        dur: 2.6,
        fromPos: groundClamp(p.position.x + back.x * 4.2, p.position.y + 1.8, p.position.z + back.z * 4.2),
        toPos: groundClamp(p.position.x + back.x * 7.5, p.position.y + 6.5, p.position.z + back.z * 7.5),
        fromLook: () => new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z),
        toLook: () => new THREE.Vector3(p.position.x - back.x * 14, p.position.y + 2.2, p.position.z - back.z * 14),
        fov: 48,
      },
      // 2 — the milestone card: slow orbit around the hero
      {
        dur: 3.2,
        fromPos: groundClamp(p.position.x + back.x * 5.4 + 2.6, p.position.y + 2.6, p.position.z + back.z * 5.4 - 2.6),
        toPos: groundClamp(p.position.x + back.x * 5.4 - 2.6, p.position.y + 3.2, p.position.z + back.z * 5.4 + 2.6),
        fromLook: () => new THREE.Vector3(p.position.x, p.position.y + 1.35, p.position.z),
        toLook: () => new THREE.Vector3(p.position.x, p.position.y + 1.35, p.position.z),
        fov: 44,
        title: ch.title,
        subtitle: ch.sub,
      },
      // 3 — settle behind the hero for a seamless handoff
      {
        dur: 1.6,
        fromPos: groundClamp(p.position.x + back.x * 5.2, p.position.y + 2.4, p.position.z + back.z * 5.2),
        toPos: groundClamp(p.position.x + back.x * 4.6, p.position.y + 1.9, p.position.z + back.z * 4.6),
        fromLook: () => new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z),
        toLook: () => new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z),
        fov: 54,
      },
    ];

    this.musicIntensityTarget = 0.5;
    this.cinematics.play(shots, {
      drive: (pos, look, fov) => this.cinematicDrive?.(pos, look, fov),
      onState: (s) => useGameStore.getState().setCinematic(
        s ? { title: s.title, subtitle: s.subtitle, progress: s.progress, shot: s.shot, total: s.total } : null,
      ),
      onDone: () => {
        this.rig?.snapBehind(p.position);
      },
    });
  }

  // -------------------------------------------------- Fase 10: admin viewer

  /** Replayable cinematics for the admin panel. */
  adminCinematicList(): Array<{ key: string; label: string }> {
    return [
      { key: 'intro', label: 'Intro — The Legacy of Eirik' },
      { key: 'cap1', label: 'Milestone · Chapter I complete' },
      { key: 'cap2', label: 'Milestone · Chapter II complete' },
      { key: 'cap3', label: 'Milestone · Chapter III complete' },
      { key: 'cap4', label: 'Milestone · Chapter IV complete' },
      { key: 'victoria', label: 'Dragon victory (generic)' },
      { key: 'final_guardian', label: 'FINAL I — The Warden of the Tide' },
      { key: 'final_crown', label: 'FINAL II — The Crown of the Isles' },
      { key: 'final_free', label: 'FINAL III — The Sea Without a Master' },
    ];
  }

  /** Play one of the registry cinematics on demand. */
  adminPlayCinematic(key: string): boolean {
    if (!this.world || !this.player) return false;
    if (this.cinematics.active || this.endings?.isPlaying) return false;
    if (this.naval?.boardingActive) return false;
    const chapters: Record<string, { n: number; title: string; sub: string }> = {
      cap1: { n: 1, title: 'CHAPTER I COMPLETE', sub: 'the legacy of Eirik' },
      cap2: { n: 2, title: 'CHAPTER II COMPLETE', sub: 'the forgotten seas' },
      cap3: { n: 3, title: 'CHAPTER III COMPLETE', sub: 'the whisper of wings' },
      cap4: { n: 4, title: 'CHAPTER IV COMPLETE', sub: 'the sunken crown' },
    };
    if (key.startsWith('cap') && chapters[key]) {
      this.playChapterCinematic(chapters[key], true);
      return this.cinematics.active;
    }
    if (key === 'intro') {
      this.playIntroReplay();
      return this.cinematics.active;
    }
    if (key === 'victoria') {
      this.playHeroicOrbit();
      return this.cinematics.active;
    }
    if (key.startsWith('final_')) {
      const id = key.slice('final_'.length) as EndingId;
      if (!ENDINGS[id]) return false;
      this.audio.playEvent('ending');
      this.input.releaseLock();
      this.launchEndingCinematic(id, true);
      return true;
    }
    return false;
  }

  /**
   * Fase 11 — endings with REAL ACTING (the Halo note): the hero walks,
   * salutes, takes the wheel; for Final III the Colibrí genuinely SAILS
   * with the hero at the helm while live cameras track her. The acting
   * layer + live camera providers ride on EndingSystem's shots.
   */
  private launchEndingCinematic(id: EndingId, preview: boolean): void {
    if (!this.world || !this.player) return;
    const w = this.world;
    const p = this.player;
    const terrain = w.terrainHeight;
    const ship = this.naval?.playerShip ?? null;
    const extras: Array<Partial<EndingShot>> = [];

    // The hero's head as a live look-target (cameras frame the ACTOR)
    const heroHead = (): [number, number, number] => [
      p.position.x, p.position.y + 1.62, p.position.z,
    ];

    // ---- Shared beat 1: the vow at the altar (shots 1-2) ----
    // Shot 2 (idx 1): the salute — the blade rises to the sky, slowly.
    extras[1] = {
      lookFromFn: heroHead,
      lookToFn: heroHead,
      action: (k, dt) => {
        heroSalute(p.model).update?.(k, dt);
      },
    };

    // ---- Guardian & Crown: the watcher walks to the cliff ----
    if (id === 'guardian' || id === 'crown') {
      // During shots 5-6 (idx 4-5) the hero walks from the altar to the
      // cliff lookout — a real walk cycle, terrain-fitted, facing travel.
      // The walk's k is remapped across BOTH shots so it always completes:
      // idx4 covers 0→0.55, idx5 closes 0.55→1 (idx6 catches up if skipped).
      const cliff = new THREE.Vector3(25, 0, -291);
      cliff.y = terrain.height(cliff.x, cliff.z);
      const walk = walkActor({
        actor: p.group,
        model: p.model,
        from: new THREE.Vector3(p.position.x, p.position.y, p.position.z),
        to: cliff,
        terrain,
        speed: 1.0,
      });
      extras[4] = { action: (k, dt) => walk.update?.(k * 0.55, dt) };
      extras[5] = { action: (k, dt) => walk.update?.(0.55 + k * 0.45, dt) };
      // Shot 7 (idx 6): the silhouette — guardian holds a breathing vigil,
      // the sovereign raises the blade to the realm. If the walk was cut
      // short (fast-forward/skip timing), finish the last stretch first.
      const atCliff = () => Math.hypot(p.position.x - cliff.x, p.position.z - cliff.z) < 1.2;
      if (id === 'guardian') {
        const idle = idleActor(p.model);
        const faceSea = faceTarget(p.group, () => new THREE.Vector3(p.position.x, p.position.y, p.position.z - 40));
        extras[6] = {
          lookFromFn: heroHead,
          lookToFn: heroHead,
          action: (k, dt) => {
            if (!atCliff()) walk.update?.(1, dt);
            faceSea.update?.(k, dt);
            idle.update?.(k, dt);
          },
        };
      } else {
        const salute = heroSalute(p.model, { repeat: true });
        extras[6] = {
          lookFromFn: heroHead,
          lookToFn: heroHead,
          action: (k, dt) => {
            if (!atCliff()) walk.update?.(1, dt);
            salute.update?.(k, dt);
          },
        };
      }
    }

    // ---- Free: the Colibrí truly sails, hero at the wheel ----
    if (id === 'free' && ship) {
      // shots 7-9 (idx 6-8): setup rides on idx 6's first frame (the screen
      // is black at the cut — the perfect moment to move a ship).
      let started = false;
      const startSail = () => {
        if (started) return;
        started = true;
        ship.pos.set(170, 0, 505);
        ship.heading = Math.atan2(90, 115); // bearing toward the open east
        ship.speed = 2.2;
        ship.sailState = 2;
        ship.anchored = false;
        ship.grappled = false;
        ship.frozen = false;
        ship.rudderInput = 0.14;
        ship.syncTransform();
        const wheel = ship.wheelWorld;
        p.teleport(wheel.x, wheel.y, wheel.z);
        p.yaw = ship.heading;
      };
      const glueToWheel = (dt: number) => {
        // hero rides the wheel: physics are suspended during endings
        ship.update(dt, w.water, terrain, WIND.dir);
        const wheel = ship.wheelWorld;
        p.group.position.set(wheel.x, wheel.y, wheel.z);
        p.group.rotation.y = ship.heading;
        p.model.update({
          dt, speed: 0, moving: false, grounded: true, swimming: false,
          attackT: 0, blockT: 0, rollT: 0, bowDraw: -1,
        });
      };
      // idx 6: the ship comes alive (camera still on the wild sea shot)
      extras[6] = {
        action: (k, dt) => { startSail(); glueToWheel(dt); },
      };
      // idx 7: the chase — LIVE camera tracking the moving ship
      const shipMast = (): [number, number, number] => [
        ship.pos.x, ship.group.position.y + 4.2, ship.pos.z + 6,
      ];
      extras[7] = {
        fromFn: () => [ship.pos.x - 26, ship.group.position.y + 14, ship.pos.z - 30],
        toFn: () => [ship.pos.x - 10, ship.group.position.y + 7, ship.pos.z - 14],
        lookFromFn: shipMast,
        lookToFn: shipMast,
        action: (k, dt) => glueToWheel(dt),
      };
      // idx 8: the FIN card — she sails into the light, camera drifting up
      extras[8] = {
        fromFn: () => [ship.pos.x - 34, ship.group.position.y + 18, ship.pos.z - 38],
        toFn: () => [ship.pos.x - 42, ship.group.position.y + 26, ship.pos.z - 48],
        lookFromFn: shipMast,
        lookToFn: shipMast,
        action: (k, dt) => glueToWheel(dt),
      };
    }

    this.endings?.play(id, () => {
      // ---- the handoff: continue playing in the transformed world ----
      this.input.requestLock();
      if (preview) {
        // Preview: put the hero and the ship back where they were
        const altarY = Math.max(terrain.height(20, -302), 2);
        p.teleport(20, altarY, -302);
        p.yaw = Math.PI;
        this.rig?.snapBehind(p.position);
        if (ship) {
          ship.pos.set(this.naval!.dockSpawn.x, 0, this.naval!.dockSpawn.z);
          ship.heading = this.naval!.dockSpawn.heading;
          ship.anchored = true;
          ship.sailState = 0;
          ship.speed = 0;
          ship.syncTransform();
        }
        return;
      }
      if (id === 'free' && ship) {
        // the hero stays at the helm — the Colibrí is mid-sea, sails full
        this.naval?.resumeHelm(ship);
        this.rig?.setShipMode(ship);
        this.attachPlayerToWheel(ship);
      } else {
        this.rig?.snapBehind(p.position);
      }
      this.autosave();
    }, preview, extras);
  }

  /** The 4-shot intro, rebuilt as a skippable in-game cinematic. */
  private playIntroReplay(): void {
    const shots: CineShot[] = INTRO_SHOTS.map((s, i) => ({
      dur: s.dur,
      fromPos: s.from,
      toPos: s.to,
      fromLook: s.lookFrom,
      toLook: s.lookTo,
      fov: i === 0 ? 52 : 48,
      text: s.text,
    }));
    this.musicIntensityTarget = 0.3;
    this.cinematics.play(shots, {
      drive: (pos, look, fov) => this.cinematicDrive?.(pos, look, fov),
      onState: (s) => useGameStore.getState().setCinematic(
        s ? { title: s.title, subtitle: s.subtitle, text: s.text, progress: s.progress, shot: s.shot, total: s.total } : null,
      ),
      onDone: () => {
        this.rig?.snapBehind(this.player!.position);
      },
    });
  }

  /** A generic epic orbit around the hero (admin "victory" preview). */
  private playHeroicOrbit(): void {
    if (!this.world || !this.player) return;
    const p = this.player;
    const w = this.world;
    const groundClamp = (x: number, y: number, z: number): THREE.Vector3 => {
      const g = w.terrainHeight.height(x, z);
      return new THREE.Vector3(x, Math.max(y, g + 1.7), z);
    };
    const hero = () => new THREE.Vector3(p.position.x, p.position.y + 1.3, p.position.z);
    const shots: CineShot[] = [
      {
        dur: 3.4,
        fromPos: groundClamp(p.position.x + 7.5, p.position.y + 2.4, p.position.z + 4.5),
        toPos: groundClamp(p.position.x - 5.5, p.position.y + 3.4, p.position.z + 6.8),
        fromLook: hero,
        toLook: hero,
        fov: 42,
      },
      {
        dur: 2.8,
        fromPos: groundClamp(p.position.x - 3.2, p.position.y + 1.7, p.position.z - 6.4),
        toPos: groundClamp(p.position.x + 3.2, p.position.y + 1.7, p.position.z - 6.4),
        fromLook: hero,
        toLook: hero,
        fov: 38,
      },
      {
        dur: 3.4,
        fromPos: groundClamp(p.position.x + 9.5, p.position.y + 6.5, p.position.z + 9.5),
        toPos: groundClamp(p.position.x + 7.5, p.position.y + 8.5, p.position.z + 7.5),
        fromLook: hero,
        toLook: hero,
        fov: 52,
        title: 'THE LEGEND OF THE KNIGHT',
        subtitle: 'the songs do not yet dare tell it',
      },
    ];
    this.musicIntensityTarget = 0.5;
    this.cinematics.play(shots, {
      drive: (pos, look, fov) => this.cinematicDrive?.(pos, look, fov),
      onState: (s) => useGameStore.getState().setCinematic(
        s ? { title: s.title, subtitle: s.subtitle, progress: s.progress, shot: s.shot, total: s.total } : null,
      ),
      onDone: () => {
        this.rig?.snapBehind(p.position);
      },
    });
  }

  /** Detect newly completed quests → notify + autosave (polled from HUD sync). */
  pollQuestEvents(): void {
    const completedIds = new Set<string>();
    for (const [id, s] of this.state.questStates.entries()) {
      if (s.status === 'completed') completedIds.add(id);
    }
    const newly = [...completedIds].filter((id) => !this.lastCompletedIds.has(id));
    const completed = completedIds.size;
    if (this.lastQuestCount >= 0 && newly.length > 0) {
      const store = useGameStore.getState();
      store.notify('quest', 'Quest completed', 'Check your journal (J) to learn more.');
      this.audio.playEvent('quest');
      this.musicIntensityTarget = 0.8;
      this.autosave();
      // Level-up check
      this.syncProgression();
      // Fase 9 — chapter milestone cinematics (PDF §6.2). Wait for any open
      // dialogue to close so the letterbox never fights a conversation.
      const CHAPTER_FINAL: Record<string, { n: number; title: string; sub: string }> = {
        q3_chest: { n: 1, title: 'CHAPTER I COMPLETE', sub: 'the legacy of Eirik' },
        q5_raven: { n: 2, title: 'CHAPTER II COMPLETE', sub: 'the forgotten seas' },
        q9_ancestro: { n: 3, title: 'CHAPTER III COMPLETE', sub: 'the whisper of wings' },
        q12_acero: { n: 4, title: 'CHAPTER IV COMPLETE', sub: 'the sunken crown' },
      };
      for (const id of newly) {
        const ch = CHAPTER_FINAL[id];
        if (ch && !this.pendingChapter) this.pendingChapter = ch;
      }
    }
    this.lastCompletedIds = completedIds;
    this.lastQuestCount = completed;
  }

  dispose(): void {
    this.engine.dispose();
    this.input.dispose();
  }
}
