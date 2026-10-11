import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { buildWorld, type WorldRefs, type Interactable } from './GameWorld';
import { ColliderRegistry } from './systems/ColliderRegistry';
import { GameState, SKILLS, xpForLevel } from './systems/GameState';
import { DialogueSystem } from './systems/DialogueSystem';
import { AudioSystem } from './systems/AudioSystem';
import { SaveSystem, type SaveData, type Settings } from './systems/SaveSystem';
import { Player } from './entities/Player';
import { KnightModelGLB } from './entities/KnightModelGLB';
import { KitSystem } from './world/KitSystem';
import { CameraRig } from './entities/CameraRig';
import { NPC } from './entities/NPC';
import { villagerPalette, VillagerModel, type CharacterVisual } from './entities/CharacterModel';
import { VillagerModelGLB } from './entities/VillagerModelGLB';
import { NavalSystem, type SailingHud } from './naval/NavalSystem';
import type { Ship } from './naval/Ship';
import { VfxSystem } from './systems/VfxSystem';
import { CombatSystem, WEAPONS } from './systems/CombatSystem';
import { DragonManager } from './systems/DragonManager';
import type { Dragon } from './entities/Dragon';
import { MountSystem } from './systems/MountSystem';
import { EndingSystem, ENDINGS, type EndingId } from './systems/EndingSystem';
import { PostFX } from './world/PostFX';
import { windTime, windGust } from './world/VegetationSystem';
import { POIS } from './world/WorldConfig';
import { ITEMS } from './data/items';
import { QUESTS, MAIN_QUEST_ORDER, SIDE_QUESTS } from './data/quests';
import { LORE } from './data/dialogues';
import { useGameStore } from '../store/gameStore';
import { gameApi, type QuestView } from './api';
import { clamp, formatClock, smoothstep } from './core/MathUtils';
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
    text: 'Eldoria… Tierra de reinos que fueron. Los antiguos dominaron los mares bajo el pacto de los dragones… hasta que la gran guerra lo hundió todo bajo las olas.',
  },
  {
    from: new THREE.Vector3(220, 120, -80), to: new THREE.Vector3(160, 95, -140),
    lookFrom: new THREE.Vector3(40, 70, -320), lookTo: new THREE.Vector3(60, 80, -300),
    dur: 11,
    text: 'Los dragones duermen en las cumbres de Garrahielo. Los piratas siembran el miedo en las rutas. Y algo antiguo despierta bajo las ruinas del océano.',
  },
  {
    from: new THREE.Vector3(210, 70, 60), to: new THREE.Vector3(160, 58, 20),
    lookFrom: new THREE.Vector3(110, 45, -45), lookTo: new THREE.Vector3(105, 50, -40),
    dur: 10,
    text: 'Los reinos están divididos y los muros se agrietan. En Puerto Cuervo, un maestre de puerto guarda la última voluntad de un amigo desaparecido…',
  },
  {
    from: new THREE.Vector3(70, 30, 250), to: new THREE.Vector3(38, 10, 252),
    lookFrom: new THREE.Vector3(25, 8, 235), lookTo: new THREE.Vector3(21, 2.2, 244),
    dur: 10,
    text: '…y la marea trae a alguien de vuelta a casa. El hijo del Guardián ha regresado. KINGDOMS OF THE FORGOTTEN SEAS — Capítulo I: El Legado de Eirik.',
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
  private combat?: CombatSystem;
  private dragons?: DragonManager;
  private mounts?: MountSystem;
  private endings?: EndingSystem;
  private postfx?: PostFX;
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
    this.engine = new Engine(canvas);
    this.input = new Input(canvas);
    this.dialogue = new DialogueSystem(this.state);
    this.settings = {
      quality: 'high', masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.9,
      sensitivity: 1, invertY: false,
      ...SaveSystem.readSettings(),
    };

    this.state.onChange = () => this.syncProgression();

    this.engine.onWebGLContextLost = () => {
      useGameStore.getState().notify('info', 'Contexto gráfico perdido', 'Recarga la página para continuar.');
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
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      const s = useGameStore.getState();
      if (s.phase === 'playing' && !s.overlay && !s.dialogue) {
        this.pause();
      }
    });

    this.engine.addUpdater((dt) => this.update(dt));
  }

  // ---------------------------------------------------------------- boot

  async boot(): Promise<void> {
    const store = useGameStore.getState();
    store.setProgress(0.02, 'Desplegando las velas…');
    await new Promise((r) => setTimeout(r, 30));

    const world = await buildWorld(
      this.engine.scene, this.colliders, this.state, this.settings.quality,
      (frac, label) => store.setProgress(0.05 + frac * 0.75, label),
    );
    this.world = world;
    // Fase 8 — boot-time quality ladder (fog · water detail · NPC distance)
    const q0 = this.engine.quality;
    world.sky.qualityFogMul = q0.fogMul;
    world.water.setDetail(q0.waterSegments, q0.waveMotionRadius);
    this.npcAnimDistance = q0.npcAnimDistance;

    // Fase 4 — cinematic post chain (Ultra), attached to the engine loop
    this.postfx = new PostFX(this.engine.renderer, this.engine.scene, this.engine.camera);
    this.postfx.setEnabled(this.engine.quality.postfx);
    this.engine.postfx = this.postfx;

    // Fase 4 — repository music (ambient sea theme) as a soft bed under the
    // procedural score. Starts muted until a user gesture unlocks audio.
    this.musicEl = new Audio('/game/audio/ambient_sea.mp3');
    this.musicEl.loop = true;
    this.musicEl.volume = 0;

    store.setProgress(0.82, 'Despertando al explorador…');
    // --- Fase 5: the repository knight becomes the player's body ---
    // The kits were already exploded during buildWorld (world.dressing);
    // here we only load the rigged knight and wire the same kit instance.
    const kits = world.kits;
    let playerVisual;
    try {
      const knightScene = await world.assets.loadModel('knight_rigged.glb');
      playerVisual = new KnightModelGLB({
        scene: knightScene,
        weaponFactory: (kind) => kits.weapon(kind),
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
      } else {
        this.vfx?.waterSplash(this.player!.position.clone(), 0.5);
      }
    };
    this.player.onDamaged = (amount) => {
      this.audio.playEvent('damage');
      useGameStore.getState().notify('info', `Has perdido ${amount} de salud`, 'La caída fue dura.');
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
        playerDamage: (amount, source) => {
          // Routed through the block/i-frame system (Fase 3)
          this.applyPlayerDamage(amount, undefined, undefined, source ?? 'naval');
        },
        returnPlayerToShip: () => this.takeHelm(),
      },
    );
    this.naval.dockSpawn = world.dockSpawn;

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
    });
    this.combat.dragonHitRef = (pos, radius) =>
      this.dragons ? this.dragons.projectileHitTest(pos, radius) : null;
    this.combat.terrainHeightRef = (x, z) => world.terrainHeight.height(x, z);
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
      },
      world.assets,
    );
    // Broadside cannons can clip the sea wyvern mid-flight (swept collision)
    this.naval.dragonHitTest = (pos, prev) => {
      const d = this.dragons?.projectileHitTest(pos, 1.2, prev);
      return d ? { damage: (amount: number) => this.dragons!.damage(d, amount, true) } : null;
    };
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
    this.mounts.spawnHorse('tormenta', 'Tormenta', 'black', 36, 152, false, 0);
    this.mounts.spawnHorse('alazan', 'Alazán del Prado', 'chestnut', -50, -100, false, 220);
    this.mounts.spawnHorse('gris', 'Gris del Oeste', 'grey', -250, -190, false, 260);
    // The stable cart
    this.mounts.spawnCart('carreta', 30, 156, 0.4);
    this.endings = new EndingSystem(this.state);

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
    // Debug/testing hook (harmless in production)
    (window as unknown as { __kotfsGame?: Game }).__kotfsGame = this;

    // Menu ambience: golden hour over the bay
    world.sky.dayFraction = 0.78;
    this.player.teleport(world.village.spawnPoint.x, world.village.spawnPoint.y, world.village.spawnPoint.z);

    store.setProgress(1, 'Eldoria espera…');
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
              ? 'Abrir el cofre de Eirik'
              : state.openedChests.has('chest_eirik') ? '' : 'Examinar el cofre de Eirik';
          }
          return state.openedChests.has(chest.id) ? '' : 'Abrir el cofre';
        },
        available: () =>
          chest.id === 'chest_eirik' ? !state.openedChests.has(chest.id) : true,
        run: () => {
          if (chest.id === 'chest_eirik') {
            if (!state.hasItem('amuleto')) {
              this.dialogue.startLore('El cofre de Eirik', [
                'Un cofre de mar reforzado con bandas de hierro. El cierre es extraño: un círculo de mareas alrededor de una llama, fundido en cobre.',
                'No hay cerradura ni bisagra visible. «Solo el amuleto lo abre», diría Aldric. Maren, la herborista, sabe dónde está.',
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
            store.getState().notify('quest', 'El cofre de Eirik se abre', 'Espada de Eirik, Mapa antiguo y Carta de Eirik añadidos al inventario.');
            store.getState().notify('info', 'Lee la carta de tu padre', 'Ábrela desde el inventario (Tab).');
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
            store.getState().notify('item', 'Tesoro encontrado', 'Colmillo tallado y 25 monedas de oro.');
          } else if (chest.id === 'chest_wreck') {
            state.addItem('coin', 18);
            state.addItem('pocion', 1);
            store.getState().notify('item', 'Tesoro encontrado', '18 monedas de oro y una poción de curación.');
          } else if (chest.id === 'chest_falls') {
            state.addItem('coin', 20);
            state.addItem('petalo', 1);
            store.getState().notify('item', 'Tesoro encontrado', '20 monedas de oro y un pétalo de marfil.');
          } else if (chest.id === 'chest_crow') {
            state.addItem('botin', 1);
            state.addItem('coin', 60);
            store.getState().notify('item', 'El botín del Cuervo', 'Botín del Cuervo y 60 monedas de oro, arrancados a la guarida pirata.');
          } else if (chest.id === 'chest_faro') {
            state.addItem('espejo', 1);
            state.addItem('coin', 30);
            store.getState().notify('item', 'El espejo del faro', 'El viejo espejo de latón de los Guardianes y 30 monedas.');
          } else if (chest.id === 'chest_bruma') {
            state.addItem('escama', 1);
            state.addItem('petalo', 2);
            state.addItem('coin', 35);
            store.getState().notify('item', 'Algo late en el cofre', 'Una escama que duerme, dos pétalos de marfil y 35 monedas. Léela desde el inventario (Tab).');
          } else if (chest.id === 'chest_lanza') {
            state.addItem('lanza_caza', 1);
            state.addItem('flecha', 6);
            state.addItem('coin', 15);
            store.getState().notify('item', 'El arsenal del vigía', 'Lanza de Caza, 6 flechas y 15 monedas. Equípala con la tecla 3.');
          } else if (chest.id === 'chest_arco') {
            state.addItem('arco_naufragio', 1);
            state.addItem('flecha', 12);
            state.addItem('coin', 10);
            store.getState().notify('item', 'El arco varado por la marea', 'Arco del Naufragio y 12 flechas. Equípalo con la tecla 4: mantén el clic para tensar.');
          } else if (chest.id === 'chest_tesoro') {
            state.addItem('mapa_tesoro', 1);
            state.addItem('coin', 25);
            store.getState().notify('item', 'El mapa del Capitán', 'Dibujado con carbón y sangre de pulpo. Una X marca la ensenada del faro. Léelo desde el inventario (Tab).');
          } else if (chest.id === 'chest_antigua_1' || chest.id === 'chest_antigua_2' || chest.id === 'chest_antigua_3') {
            state.addItem('moneda_antigua', 1);
            state.addItem('coin', 30);
            store.getState().notify('item', 'Moneda de Thalassar', 'Oro viejo del reino hundido. Elin paga bien por estas.');
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
        prompt: 'Recoger pétalo de marfil',
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
            mult > 1 ? 'Pétalos de marfil ×2' : 'Pétalo de marfil recogido',
            'Crece donde el agua canta. Maren los necesita.',
          );
        },
      });
    }

    // --- Rosa's crate (wreck) ---
    w.interactables.push({
      id: 'crate_rosa',
      pos: new THREE.Vector3(wreck.x + 4.5, terrainH(wreck.x + 4.5, wreck.z + 3.5), wreck.z + 3.5),
      radius: 2.2,
      prompt: 'Examinar el cargamento',
      available: () => !state.hasFlag('rosa_crate_found'),
      run: () => {
        state.setFlag('rosa_crate_found');
        state.addItem('cargamento', 1);
        state.interactMilestone('crate_rosa');
        audio.playEvent('pickup');
        state.giveXp(10);
        store.getState().notify('item', 'Cargamento de Rosa', 'La caja lleva el sello del Ancla Rota. Rosa pagará bien por esto.');
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
        prompt: 'Recoger madera de roble (×2)',
        available: () => !state.hasFlag(`oak_${id}`),
        run: () => {
          state.setFlag(`oak_${id}`);
          state.addItem('madera', 2);
          audio.playEvent('pickup');
          state.giveXp(6);
          store.getState().notify('item', 'Madera de roble ×2', 'Roble curado con el sello de Bram. Perfecto para el casco del Colibrí.');
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
          ? 'Entregar los materiales para la reparación'
          : 'Examinar el Colibrí de Mar';
      },
      available: () => !state.hasFlag('ship_repaired'),
      run: () => {
        const ready = state.hasItem('madera', 4) && state.hasItem('lona', 3) && state.hasItem('cuerda', 2);
        if (!ready) {
          const missing: string[] = [];
          if (!state.hasItem('madera', 4)) missing.push(`madera (${Math.min(4, state.countItem('madera'))}/4)`);
          if (!state.hasItem('lona', 3)) missing.push(`lona (${Math.min(3, state.countItem('lona'))}/3)`);
          if (!state.hasItem('cuerda', 2)) missing.push(`cuerda (${Math.min(2, state.countItem('cuerda'))}/2)`);
          this.dialogue.startLore('El Colibrí de Mar', [
            'El casco aguarda entre andamios. Bram revisa la lista garabateada en carbón sobre la cubierta.',
            `«Todavía falta: ${missing.join(', ')}. El roble está en cajas con mi sello — muelle, costa del naufragio y sendero de la cascada. La lona la prepara Rosa y la cuerda la tiene Tom.»`,
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
    addLore('tablet_ruins', -243, -135, 'Leer la tablilla antigua');
    addLore('stones_center', -140, -260, 'Tocar el altar de piedra');
    addLore('tower_door', 300, 64.2, 'Examinar la puerta tapiada');
    addLore('ship_colibri', w.village.shipDeck.x, w.village.shipDeck.z, 'Contemplar el Colibrí de Mar');

    // ===================== FASE 4 interactables =====================
    const f4 = w.fase4;

    // --- The sunken sanctuary: swim out & claim the Crown ---
    w.interactables.push({
      id: 'santuario_thalassar',
      pos: f4.altarThalassarPos.clone(),
      radius: 4.6,
      get prompt(): string {
        if (state.hasItem('corona_thalassar')) return '';
        return 'Sumergir la mano en la cuenca del altar';
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
        store.getState().notify('item', 'La Corona de Thalassar', 'Los reyes hundidos sueltan su corona. El agua la entrega… como si llevara cien años esperándote.');
        store.getState().notify('info', 'Un lugar en la mesa', 'La Orden custodiaba tres reliquias. Con el Sello y el Corazón ya en tu poder, Halvard espera en el establo del camino norte.');
      },
    });

    // --- The flagship wreck: the Crow's navigation chart ---
    w.interactables.push({
      id: 'wreck_flagship',
      pos: f4.flagshipPos.clone(),
      radius: 9,
      get prompt(): string {
        if (state.hasFlag('flagship_looted')) return '';
        return 'Registrar el camarote del buque insignia';
      },
      available: () => !state.hasFlag('flagship_looted'),
      run: () => {
        state.setFlag('flagship_looted');
        state.addItem('carta_navegacion', 1);
        state.addItem('estandarte_orden', 1);
        state.interactMilestone('wreck_flagship');
        state.giveXp(80);
        audio.playEvent('chest');
        store.getState().notify('item', 'La carta del Cuervo', 'Carta de Navegación del Cuervo y el Estandarte robado de la Orden, arrancados al buque insignia. La cala sin nombre aparece al pie de la fortaleza.');
      },
    });

    // --- Bram's forge: the Guardian blade ---
    const forgePos = new THREE.Vector3(28, terrainH(28, 193), 193);
    w.interactables.push({
      id: 'forge_guardian',
      pos: forgePos,
      radius: 3.4,
      get prompt(): string {
        if (state.hasItem('espada_guardian')) return '';
        const ready = state.hasItem('colmillo_ancestro', 1) && state.hasItem('escama', 3);
        return ready ? 'Forjar la Espada del Guardián' : 'Forja de Bram (necesitas el Colmillo y 3 escamas)';
      },
      available: () => !state.hasItem('espada_guardian'),
      run: () => {
        const ready = state.hasItem('colmillo_ancestro', 1) && state.hasItem('escama', 3);
        if (!ready) {
          this.dialogue.startLore('La forja canta', [
            'Bram revisa el yunque: «El colmillo del Ancestro y tres escamas de dragón. Ni más ni menos — la forja distingue».',
            'El fuego de la fragua late como un corazón impaciente.',
          ]);
          return;
        }
        state.removeItem('colmillo_ancestro', 1);
        state.removeItem('escama', 3);
        state.addItem('espada_guardian', 1);
        state.interactMilestone('forge_guardian');
        state.giveXp(100);
        audio.playEvent('unlock');
        this.musicIntensityTarget = 0.85;
        store.getState().notify('item', '¡La Espada del Guardián!', 'Forjada con el Colmillo del Ancestro. Equípala desde el inventario (Tab): daño terrible, juramento incluido.');
      },
    });

    // --- The black altar: awaken Kraivenn ---
    w.interactables.push({
      id: 'altar_cuervo',
      pos: f4.altarCuervoPos.clone(),
      radius: 4.2,
      get prompt(): string {
        if (state.hasFlag('kraivenn_awake')) return '';
        return 'Depositar las reliquias y despertar al Cuervo';
      },
      available: () => state.hasFlag('kraivenn_seen') && !state.hasFlag('kraivenn_awake'),
      run: () => {
        this.dialogue.startLore('El altar negro bebe la luz', [
          'Colocas el Sello, la Corona y el Corazón en las tres cuencas. La piedra está más fría que el mar.',
          'El silencio de la cala se vuelve absoluto — ni el agua golpea, ni el viento respira.',
          'Y entonces, del fondo del basalto, algo enorme abre un ojo rojo.',
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
        return ready ? 'Presentar las tres reliquias ante el altar' : 'Altar del pacto (requiere Sello, Corona y Corazón)';
      },
      available: () => !state.hasFlag('ending_done'),
      run: () => {
        const ready = state.hasItem('corona_thalassar') && state.hasItem('corazon_cuervo') && state.hasItem('sello');
        if (!ready) {
          this.dialogue.startLore('El altar duerme', [
            'Tres cuencas aguardan: el Sello de la Orden, la Corona de los reyes hundidos y el Corazón del Cuervo.',
            'Solo un Guardián con las tres reliquias puede convocar al Consejo de las Mareas.',
          ]);
          return;
        }
        state.interactMilestone('altar_marea');
        state.giveXp(80);
        this.dialogue.startLore('El Consejo de las Mareas', [
          'El lecho de monedas se abre. Una luz de marea recorre las costillas de ballena como un latido antiguo.',
          'Las tres reliquias resuenan entre sí — Sello, Corona y Corazón — y el altar reconoce a su Guardián.',
          'Toca el altar de nuevo para tomar tu decisión.',
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
        return state.hasFlag('altar_ready') ? 'Decidir el destino de las Mareas' : '';
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
        return state.hasItem('mapa_tesoro') ? 'Excavar donde marca la X' : 'Un extraño cruce de tablones en la arena';
      },
      available: () => !state.hasFlag('treasure_dug'),
      run: () => {
        if (!state.hasItem('mapa_tesoro')) {
          this.dialogue.startLore('Marcas en la piedra', [
            'Dos tablones cruzados clavados en la roca. Algo está enterrado aquí… pero necesitarías un mapa para saber qué — y valor para cavarlo.',
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
        store.getState().notify('item', '¡El cofre de Eirik!', '200 monedas, dos monedas de Thalassar y flechas del buen sauz. «Que lo encuentre mi sangre», decía el mapa. Lo encontró.');
      },
    });

    // --- Stranded fish (sq_raciones) ---
    for (const [i, spot] of f4.fishSpots.entries()) {
      w.interactables.push({
        id: `fish_spot_${i}`,
        pos: spot.clone(),
        radius: 2.6,
        get prompt(): string {
          return state.hasFlag(`fish_${i}_taken`) ? '' : 'Recoger la pesca varada (×2)';
        },
        available: () => !state.hasFlag(`fish_${i}_taken`),
        run: () => {
          state.setFlag(`fish_${i}_taken`);
          state.addItem('pez', 2);
          audio.playEvent('pickup');
          state.giveXp(6);
          store.getState().notify('item', 'Pesca varada ×2', 'Tom las necesita para las raciones del pueblo.');
        },
      });
    }

    // --- The Great Maple seed (sq_arce) ---
    w.interactables.push({
      id: 'seed_arce',
      pos: f4.granArcePos.clone().add(new THREE.Vector3(2.5, 0, 2)),
      radius: 3.2,
      get prompt(): string {
        return state.hasItem('semilla_arce') || state.hasFlag('semilla_taken') ? '' : 'Recoger una semilla del Gran Arce';
      },
      available: () => !state.hasFlag('semilla_taken'),
      run: () => {
        state.setFlag('semilla_taken');
        state.addItem('semilla_arce', 1);
        audio.playEvent('pickup');
        state.giveXp(15);
        store.getState().notify('item', 'Semilla del Gran Arce', 'Una sámara dorada, cálida como un recién nacido. Maren sabe dónde plantarla.');
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
          return state.hasFlag(flag) ? '' : `Marcar la posición del ${wild.id === 'potro_norte' ? 'potro alazán' : 'potro gris'}`;
        },
        available: () => true,
        run: () => {
          const isNorth = wild.id === 'potro_norte';
          state.setFlag(isNorth ? 'wildhorse_1_done' : 'wildhorse_2_done');
          state.interactMilestone(isNorth ? 'wildhorse_1' : 'wildhorse_2');
          state.giveXp(20);
          audio.playEvent('pickup');
          store.getState().notify('info', 'Potro marcado', 'Halvard podrá venir a por él con la soga y la paciencia.');
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
        return 'Escuchar la cascada al caer el sol';
      },
      available: () => !state.hasFlag('cascada_escuchada'),
      run: () => {
        const night = w.sky.dayFactor < 0.35 || w.sky.nightFactor > 0.4;
        if (!night) {
          this.dialogue.startLore('El agua canta… de día', [
            'La cascada rumorea con voz de todos los días. Sigrid insists: hay que escucharla al caer el último sol.',
          ]);
          return;
        }
        state.setFlag('cascada_escuchada');
        state.interactMilestone('cascada_noche');
        state.giveXp(30);
        this.musicIntensityTarget = 0.5;
        this.dialogue.startLore('La canción de la cascada', [
          'Te sientas al borde del estanque cuando el último sol se apaga.',
          'El agua cambia. No es rumor: es armonía. Voces graves, viejas, que suben y bajan con la corriente como si recordaran nombres.',
          'Los que duermen abajo saben canciones nuevas. Ahora lo sabes tú también.',
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
        return 'Registrar la puerta tapiada';
      },
      available: () => !state.hasFlag('tower_stash_found'),
      run: () => {
        const night = w.sky.nightFactor > 0.35;
        const lantern = this.player!.lanternOn;
        if (!night || !lantern) {
          this.dialogue.startLore('La puerta tapiada', [
            'Juntas podridas, telarañas y una placa oxidada. Jorund hablaba de un escondite «que solo la noche y el fuego encuentran».',
            night ? 'Quizá con el farol encendido (F)…' : 'Quizá de noche, con luz propia…',
          ]);
          return;
        }
        state.setFlag('tower_stash_found');
        state.interactMilestone('tower_stash');
        state.addItem('coin', 90);
        state.addItem('flecha', 8);
        state.giveXp(50);
        audio.playEvent('chest');
        store.getState().notify('item', 'El escondite del vigía', 'La luz del farol revela una piedra movida: oro contado, flechas secas y un diario casi ilegible.');
      },
    });

    // --- Vaelthara's silence (sq_lamento) ---
    w.interactables.push({
      id: 'ruins_silence',
      pos: new THREE.Vector3(-240, terrainH(-240, -140), -140),
      radius: 6,
      get prompt(): string {
        if (state.hasFlag('lamento_done')) return '';
        return state.hasFlag('vaelthara_dead') ? 'Escuchar el silencio de las ruinas' : '';
      },
      available: () => state.hasFlag('vaelthara_dead') && !state.hasFlag('lamento_done'),
      run: () => {
        state.setFlag('lamento_done');
        state.interactMilestone('ruins_silence');
        state.giveXp(40);
        this.musicIntensityTarget = 0.3;
        this.dialogue.startLore('El duelo de las columnas', [
          'Entre las columnas no hay amenaza: hay duelo. La guardiana ya no ruge, y las piedras parecen notarlo.',
          'Un guardián sin dragón y un dragón sin guardián, ambos sin casa.',
          'Aldric entenderá lo que oíste — o lo que no oíste.',
        ]);
      },
    });

    // --- The knight statue lore (sq_guardianes) ---
    w.interactables.push({
      id: 'knight_statue',
      pos: f4.knightPos.clone(),
      radius: 4,
      prompt: 'Contemplar al caballero de piedra',
      run: () => {
        if (!state.hasFlag('knight_seen')) {
          state.setFlag('knight_seen');
          state.giveXp(35);
          state.interactMilestone('knight_statue');
        }
        this.dialogue.startLore('El Caballero del Norte', [
          'Un Guardián de la Orden tallado en piedra, la espada baja y la mirada al mar. Trescientos años de vigilancia ni siquiera han arañado su gesto.',
          'En el pedestal, medio borrada, una inscripción: «Velarán por nosotros cuando nosotros ya no podamos».',
          'Algo te dice que la estatua no está mirando al mar. Está mirando lo que duerme detrás de él.',
        ]);
      },
    });
  }

  // -------------------------------------------------------- helm helpers

  /** Attach the player to the wheel of their ship (sailing mode). */
  private takeHelm(): void {
    const naval = this.naval;
    const ship = naval?.playerShip;
    if (!naval || !ship || ship.sunk || ship.sinking > 0) return;
    naval.playerBoardsHelm();
    this.attachPlayerToWheel();
    this.rig!.setShipMode(ship);
    if (!this.state.hasFlag('tut_sailing')) {
      this.state.setFlag('tut_sailing');
      useGameStore.getState().notify(
        'info',
        'Al timón del Colibrí',
        'W/S velas · A/D timón · Espacio fondear · Clic izq./der. bordadas · E desembarcar o abordar',
      );
    }
  }

  private attachPlayerToWheel(): void {
    const ship = this.naval!.playerShip!;
    const wheel = ship.wheelWorld;
    this.player!.teleport(wheel.x, wheel.y, wheel.z);
    this.player!.yaw = ship.heading;
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
      '¡El Colibrí de Mar flota de nuevo!',
      'La carena está lista. Acércate al costado del barco, junto al muelle, para zarpar. Las habilidades de navegación (K) se han desbloqueado.',
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
    store.notify('quest', 'Nueva misión: El Legado de Eirik', 'Habla con el Maestre Aldric en el puerto.');
    store.notify('info', 'Controles', 'WASD moverse · Mayús correr · Espacio saltar · E interactuar · Tab inventario · M mapa · J diario');
    store.notify('info', 'Combate', 'Clic atacar (mantén = pesado) · Clic der. bloquear · C esquivar · 1-4 cambiar de arma');
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
      useGameStore.getState().notify('save', 'Partida guardada', `Ranura ${slot + 1} · Día ${this.world!.sky.dayCount}`);
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
    if (this.naval.playerSailing && this.naval.playerShip) {
      this.naval.playerBoardsHelm();
      this.attachPlayerToWheel();
      this.rig!.setShipMode(this.naval.playerShip);
    }

    // Fase 4: mounts & weather restoration
    this.mounts?.deserialize(data.mounts);
    if (data.mounts?.riding) {
      this.mounts?.restoreRiding(data.mounts.riding);
      if (this.mounts?.ridingId) this.rig!.setMountMode(true);
    }
    this.world.weather.deserialize(data.weather);
    this.endingPlayed = this.state.hasFlag('ending_done');

    this.restoreWorldFromState();
    this.applyStats();
    this.syncProgression();
    // Fase 3: align dragons & weapon visuals with the loaded save
    this.dragons?.syncWithState();
    this.combat?.refreshVisuals();
    this.audio.bossIntensity = 0;
    const store = useGameStore.getState();
    store.setPhase('playing');
    this.input.requestLock();
    store.notify('save', 'Partida cargada', `Día ${data.time.dayCount} · Nivel ${data.gameState.level}`);
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

  // ------------------------------------------------------------- main loop

  private update(dt: number): void {
    if (!this.world || !this.player || !this.rig) return;
    const store = useGameStore.getState();
    const w = this.world;
    const p = this.player;
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
  private applyPlayerDamage(dmg: number, fromX?: number, fromZ?: number, reason?: string): number {
    const p = this.player!;
    const lost = p.takeHit(dmg, fromX, fromZ);
    if (lost > 0) {
      this.audio.playEvent('damage');
      useGameStore.getState().triggerHurtFlash();
      this.musicIntensityTarget = Math.max(this.musicIntensityTarget, 0.6);
    }
    void reason;
    return lost;
  }

  private updatePlaying(dt: number, store: ReturnType<typeof useGameStore.getState>): void {
    const w = this.world!;
    const p = this.player!;
    const rig = this.rig!;
    const naval = this.naval!;
    const dialogueActive = !!store.dialogue;
    const sailing = naval.playerSailing && !!naval.playerShip;
    const riding = !!this.mounts?.ridingId;

    // --- Fase 4: ending cinematic takes over everything ---
    if (this.endings?.isPlaying) {
      this.endings.update(dt, this.engine.camera);
      w.sky.tick(dt);
      w.sky.update(this.engine.camera, p.position, this.engine.quality.shadowsEnabled);
      w.water.update(dt, this.engine.camera);
      w.water.setSky(w.sky.sunDir, w.sky.sunColor, w.sky.zenithColor, w.sky.horizonColor, w.sky.nightFactor);
      w.terrain.update(p.position.x, p.position.z);
      w.vegetation.update(p.position.x, p.position.z);
      return;
    }

    // --- Naval layer: wind, fleets, cannonballs, boarding, effects ---
    const sailingHud: SailingHud | null = naval.update(dt, p.position);

    // --- Fase 3: dragons + combat VFX (both on foot and at sea) ---
    this.dragons?.update(
      dt, p.position, !this.dead, sailing,
      sailing && naval.playerShip ? naval.playerShip.pos : null,
    );
    this.vfx?.update(dt);

    // --- Death / respawn ---
    if (p.health <= 0 && !this.dead) {
      this.dead = true;
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
      store.notify('info', 'Las olas te devuelven a la orilla', 'Despiertas en el muelle, empapado pero vivo.');
      this.audio.playEvent('splash');
    }

    // --- Clock ---
    const newDay = w.sky.tick(dt);
    if (newDay) {
      store.notify('info', `Día ${w.sky.dayCount} en Aldmor`, formatClock(w.sky.dayFraction));
    }

    // --- Fase 8 — dusk swaps the shield for a lit torch (dawn brings it back) ---
    const isNight = w.sky.nightFactor > 0.5;
    if (isNight !== this.nightTorchActive && this.player) {
      this.nightTorchActive = isNight;
      this.player.model.setNightTorch?.(isNight);
      if (isNight) {
        store.notify('info', 'Cae la noche', 'Enciendes una antorcha para iluminar el camino.');
      }
    }

    if (sailing && !naval.boardingActive) {
      // ================= SAILING MODE — the player holds the wheel =================
      const ship = naval.playerShip!;
      rig.handleInput(this.input, dt);
      // No personal weapons while steering — the cannons are the weapon
      p.blocking = false;
      p.bowDraw = -1;
      if (!dialogueActive) {
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
          store.notify('quest', 'Aguas del Cuervo Viejo', 'Acantilados negros al noroeste. La Gaviota Sangrienta patrulla esta cala.');
        }
      }
    } else {
      // ================= FOOT MODE — normal third-person play =================
      // Camera input & combat (Fase 3) before physics so anims stay in sync
      rig.handleInput(this.input, dt);

      if (riding) {
        // --- Fase 4: MOUNTED — the horse carries the player ---
        const mountHud = this.mounts!.update(
          dt, this.input, p.position, !dialogueActive && !this.dead,
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
        if (!dialogueActive && this.input.anyPressed('KeyH') && !this.mounts!.ridingId) {
          this.mounts!.whistle(p.position);
        }
      } else {
        this.mounts?.update(dt, this.input, p.position, false, (x, z) => w.water.waveHeightAt(x, z));
        this.ridingGait = '';
        this.combat!.setCameraYaw(rig.yawForward);
        this.combat!.update(dt, this.input, dialogueActive, this.dead);
        p.update(dt, this.input, rig.yawForward, w.terrainHeight, this.colliders, dialogueActive || this.dead);
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
      if (!dialogueActive && this.input.pressed('lantern')) {
        p.toggleLantern();
        this.audio.playEvent('pickup');
      }
    }

    // --- Camera ---
    const sprinting = this.input.isDown('sprint') && !dialogueActive;
    rig.update(dt, p.position, sprinting, w.terrainHeight, this.colliders);

    // Impact camera shake (Fase 3)
    if (this.shakeT > 0.002) {
      const cam = this.engine.camera;
      const s = this.shakeT;
      cam.position.x += (Math.random() - 0.5) * s * 0.55;
      cam.position.y += (Math.random() - 0.5) * s * 0.45;
      cam.position.z += (Math.random() - 0.5) * s * 0.55;
      this.shakeT = Math.max(0, this.shakeT - dt * 1.9);
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
    if (w.weather.onThunder === undefined) {
      w.weather.onThunder = () => {
        this.audio.playEvent('thunder');
        this.shakeT = Math.max(this.shakeT, 0.25);
      };
      w.weather.onStormStart = () => {
        useGameStore.getState().notify('info', 'Tormenta sobre Aldmor', 'El cielo se cierra. Refúgiate o atraviésala: los marineros de verdad navegan igual.');
        this.audio.playEvent('rain_start');
      };
    }
    // Storm at sea (sq_cazatormentas)
    if (sailing && w.weather.kind === 'storm' && !this.state.hasFlag('storm_at_sea')) {
      this.state.setFlag('storm_at_sea');
    }

    w.water.update(dt, this.engine.camera);
    w.water.setSky(w.sky.sunDir, w.sky.sunColor, w.sky.zenithColor, w.sky.horizonColor, w.sky.nightFactor);
    const focusX = sailing ? naval.playerShip!.pos.x : p.position.x;
    const focusZ = sailing ? naval.playerShip!.pos.z : p.position.z;
    w.terrain.update(focusX, focusZ);
    w.vegetation.update(focusX, focusZ);
    this.refreshGrass(focusX, focusZ);
    w.streamer.update(dt, focusX, focusZ);
    w.gulls.update(dt);
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
    for (const npc of this.npcs) {
      const near = npc.position.distanceToSquared(p.position) < this.npcAnimDistance * this.npcAnimDistance;
      npc.update(dt, w.sky.dayFraction, w.terrainHeight, this.colliders, p.position, near);
    }

    // --- Interaction scan ---
    this.updateInteractions(store, dialogueActive);

    // --- Discoveries ---
    this.discoveryTimer -= dt;
    if (this.discoveryTimer <= 0) {
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
      sailing ? naval.playerShip!.pos.x : p.position.x,
      sailing ? naval.playerShip!.pos.z : p.position.z,
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
      const clickHint =
        !this.input.pointerLocked && !dialogueActive
          ? 'Haz clic para tomar el control'
          : null;
      store.setHud({
        health: p.health,
        maxHealth: p.stats.maxHealth,
        stamina: p.stamina,
        maxStamina: p.stats.maxStamina,
        clock: formatClock(w.sky.dayFraction),
        dayCount: w.sky.dayCount,
        questTracker: tracker,
        fps: this.engine.fps,
        prompt: clickHint ?? store.prompt,
        sailing: sailingHud,
        atHelm: sailing,
      });
      // Fase 4 — riding HUD (gait / speed / cart)
      const mount = this.mounts?.mounted;
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
      store.setEndingActive(!!this.endings?.isPlaying);
      // Fase 3 combat HUD
      store.setWeaponSlots(this.combat!.slots());
      store.setBowDraw(p.bowDraw);
      this.pollQuestEvents();
    }

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
      store.notify('info', 'Cae la noche', 'Pulsa F para encender tu farol. Las antorchas del pueblo iluminan los caminos.');
    }
    if (!this.state.hasFlag('tut_stamina') && p.stamina < 25) {
      this.state.setFlag('tut_stamina');
      store.notify('info', 'Resistencia baja', 'Deja de correr para recuperarla. Mejórala con habilidades (K).');
    }

    // --- Fase 4 polls (story events that happen outside interactions) ---
    this.pollTimer -= dt;
    if (this.pollTimer <= 0) {
      this.pollTimer = 0.7;
      // Tormenta gifted by Halvard → the warhorse becomes yours
      if (this.state.hasFlag('tormenta_gifted') && !this.state.hasFlag('tormenta_bound')) {
        this.state.setFlag('tormenta_bound');
        this.mounts?.setOwned('tormenta');
        store.notify('quest', 'Tormenta es tuyo', 'El caballo de guerra de Eirik acepta tu montura. Acércate y pulsa E para cabalgar; H para llamarlo.');
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
          this.endings?.play(choice, () => {
            // After the cinematic: continue playing in the transformed world
            this.input.requestLock();
            this.autosave();
          });
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

  // Interactions -----------------------------------------------------------

  private updateInteractions(store: ReturnType<typeof useGameStore.getState>, dialogueActive: boolean): void {
    const w = this.world!;
    const p = this.player!;
    let best: { prompt: string; run: () => void } | null = null;
    let bestDist = Infinity;
    const riding = !!this.mounts?.ridingId;
    let interactHandled = false;

    if (!dialogueActive) {
      // Naval prompts have priority while aboard / at sea
      const navalPrompt = this.naval?.currentPrompt(p.position) ?? null;
      // Fase 4 — riding: E interacts with the cart OR dismounts
      if (riding) {
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
      } else if (!this.naval?.playerSailing) {
        // Fase 4 — mount prompts (mount / buy) compete with world prompts
        const mountPrompt = this.mounts?.interactionPrompt(p.position) ?? null;
        if (mountPrompt) {
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
              prompt: `Hablar con ${npc.name}`,
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

    const promptText = best ? `[E] ${best.prompt}` : null;
    if (promptText !== store.prompt) {
      store.setHud({ prompt: promptText });
    }
    if (best && !dialogueActive && this.input.pressed('interact') && !interactHandled) {
      best.run();
    }
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
    const cx = Math.floor(((x + 1024) / 2048) * size);
    const cz = Math.floor(((z + 1024) / 2048) * size);
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
        useGameStore.getState().notify('item', 'Poción de curación', 'Salud restaurada.');
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
      this.audio.playEvent('unlock');
      const w = WEAPONS[id];
      const hint = w
        ? w.kind === 'bow'
          ? 'Mantén pulsado el clic para tensar; suelta para disparar. Las flechas clavadas se recuperan.'
          : w.kind === 'spear'
            ? 'Clic para estocadas rápidas de largo alcance; mantén pulsado para un golpe pesado.'
            : 'Clic para atacar; mantén pulsado para un golpe pesado que tambalea a las bestias.'
        : 'Haz clic izquierdo para atacar.';
      useGameStore.getState().notify('item', ITEMS[id].name, hint);
    };
    gameApi.unequipWeapon = () => {
      st().unequip();
      this.combat?.onUiEquip();
    };
    gameApi.equippedWeapon = () => st().equippedWeapon;

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
      this.engine.applyQuality(s.quality);
      // Fase 4 — post chain follows the quality preset (Ultra only)
      this.postfx?.setEnabled(this.engine.quality.postfx);
      this.world?.terrain.updateQuality(s.quality);
      // Fase 8 — quality drives the whole optimisation ladder:
      //   grass density · water detail & wave-motion radius · fog · NPC pose
      const q = this.engine.quality;
      this.world?.vegetation.setGrassDensity(q.grassDensity);
      this.world?.water.setDetail(q.waterSegments, q.waveMotionRadius);
      if (this.world) this.world.sky.qualityFogMul = q.fogMul;
      this.npcAnimDistance = q.npcAnimDistance;
      // Rebuild the grass ring at the new density right away
      if (this.player) {
        this.world?.vegetation.refreshGrassNear(this.player.position.x, this.player.position.z);
      }
      this.input.sensitivity = s.sensitivity;
      this.rig!.sensitivity = s.sensitivity;
      this.rig!.invertY = s.invertY;
      this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume });
    };
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
        return `Barco fondeado en el agua (${w.x.toFixed(0)}, ${w.z.toFixed(0)})`;
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
        return `${name} (${coat}) apareció frente a ti`;
      }
      if (kind === 'dragon') {
        const d = this.dragons!.adminSpawn(species ?? 'drake_stones', sx, sz);
        return d ? `${d.def.name} invocado — ¡cuidado!` : null;
      }
      return null;
    };
    gameApi.adminFly = (on) => {
      if (!this.player) return false;
      this.player.flying = on;
      if (on) {
        this.player.velocity.set(0, 0, 0);
        useGameStore.getState().notify('info', 'Modo vuelo ACTIVADO', 'ESPACIO sube · E baja · MAYÚS acelera');
      } else {
        this.player.verticalVel = 0;
        useGameStore.getState().notify('info', 'Modo vuelo desactivado', 'La gravedad vuelve a mandar.');
      }
      return on;
    };
    gameApi.adminFlying = () => !!this.player?.flying;
    gameApi.adminSetTime = (f) => {
      if (!this.world) return;
      this.world.sky.dayFraction = Math.max(0, Math.min(0.999, f));
    };
  }

  // ---------------------------------------------------------------- state events

  private lastQuestCount = -1;

  /** Detect newly completed quests → notify + autosave (polled from HUD sync). */
  pollQuestEvents(): void {
    const completed = [...this.state.questStates.entries()]
      .filter(([, s]) => s.status === 'completed').length;
    if (this.lastQuestCount >= 0 && completed > this.lastQuestCount) {
      const store = useGameStore.getState();
      store.notify('quest', 'Misión completada', 'Consulta tu diario (J) para saber más.');
      this.audio.playEvent('quest');
      this.musicIntensityTarget = 0.8;
      this.autosave();
      // Level-up check
      this.syncProgression();
    }
    this.lastQuestCount = completed;
  }

  dispose(): void {
    this.engine.dispose();
    this.input.dispose();
  }
}
