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
import { CameraRig } from './entities/CameraRig';
import { NPC } from './entities/NPC';
import { NavalSystem, type SailingHud } from './naval/NavalSystem';
import type { Ship } from './naval/Ship';
import { VfxSystem } from './systems/VfxSystem';
import { CombatSystem, WEAPONS } from './systems/CombatSystem';
import { DragonManager } from './systems/DragonManager';
import type { Dragon } from './entities/Dragon';
import { windTime } from './world/VegetationSystem';
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

    const world = buildWorld(
      this.engine.scene, this.colliders, this.state, this.settings.quality,
      (frac, label) => store.setProgress(0.05 + frac * 0.75, label),
    );
    this.world = world;

    store.setProgress(0.85, 'Despertando al explorador…');
    this.player = new Player(this.engine.scene);
    this.player.onFootstep = (surface) => this.audio.playFootstep(surface);
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
    );
    // Broadside cannons can clip the sea wyvern mid-flight (swept collision)
    this.naval.dragonHitTest = (pos, prev) => {
      const d = this.dragons?.projectileHitTest(pos, 1.2, prev);
      return d ? { damage: (amount: number) => this.dragons!.damage(d, amount, true) } : null;
    };
    this.player.onBlockSparks = (pos) => {
      this.vfx!.blockSparks(pos);
      this.audio.playEvent('block');
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

    for (const def of world.npcDefs) {
      this.npcs.push(new NPC(def, this.engine.scene));
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
      version: 2,
      timestamp: Date.now(),
      player: this.player!.serialize(),
      time: this.world!.sky.serialize(),
      gameState: this.state.serialize(),
      naval: this.naval?.serialize(),
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
    if (this.naval.playerSailing && this.naval.playerShip) {
      this.naval.playerBoardsHelm();
      this.attachPlayerToWheel();
      this.rig!.setShipMode(this.naval.playerShip);
    }

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
      this.combat!.setCameraYaw(rig.yawForward);
      this.combat!.update(dt, this.input, dialogueActive, this.dead);
      p.update(dt, this.input, rig.yawForward, w.terrainHeight, this.colliders, dialogueActive || this.dead);

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
    w.water.update(dt, this.engine.camera);
    w.water.setSky(w.sky.sunDir, w.sky.sunColor, w.sky.zenithColor, w.sky.horizonColor, w.sky.nightFactor);
    const focusX = sailing ? naval.playerShip!.pos.x : p.position.x;
    const focusZ = sailing ? naval.playerShip!.pos.z : p.position.z;
    w.terrain.update(focusX, focusZ);
    w.vegetation.update();
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

    // NPC updates
    for (const npc of this.npcs) {
      npc.update(dt, w.sky.dayFraction, w.terrainHeight, this.colliders, p.position);
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
  }

  private grassRefreshKey = '';

  private refreshGrass(px: number, pz: number): void {
    const cx = Math.floor(px / 64);
    const cz = Math.floor(pz / 64);
    const key = `${cx},${cz}`;
    if (key === this.grassRefreshKey) return;
    this.grassRefreshKey = key;
    this.world!.vegetation.refreshGrassNear(px, pz, 2);
  }

  // Interactions -----------------------------------------------------------

  private updateInteractions(store: ReturnType<typeof useGameStore.getState>, dialogueActive: boolean): void {
    const w = this.world!;
    const p = this.player!;
    let best: { prompt: string; run: () => void } | null = null;
    let bestDist = Infinity;

    if (!dialogueActive) {
      // Naval prompts have priority while aboard / at sea
      const navalPrompt = this.naval?.currentPrompt(p.position) ?? null;
      if (navalPrompt) {
        best = { prompt: navalPrompt.prompt, run: navalPrompt.run };
        bestDist = 0;
      } else if (!this.naval?.playerSailing) {
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
    if (best && !dialogueActive && this.input.pressed('interact')) {
      best.run();
    }
  }

  private checkDiscoveries(store: ReturnType<typeof useGameStore.getState>): void {
    const w = this.world!;
    const p = this.player!;
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
      this.world?.terrain.updateQuality(s.quality);
      this.world?.vegetation.setGrassDensity(
        s.quality === 'low' ? 0 : s.quality === 'medium' ? 0.4 : s.quality === 'high' ? 0.75 : 1,
      );
      // Rebuild the grass ring at the new density right away
      if (this.player) {
        this.world?.vegetation.refreshGrassNear(this.player.position.x, this.player.position.z, 2);
      }
      this.input.sensitivity = s.sensitivity;
      this.rig!.sensitivity = s.sensitivity;
      this.rig!.invertY = s.invertY;
      this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume });
    };
    gameApi.skipIntro = () => this.finishIntro();
    gameApi.chooseDialogue = (i) => this.dialogue.choose(i);
    gameApi.closeDialogue = () => this.dialogue.close();
    gameApi.narrationBlip = () => this.audio.playWhooshVoice();
    gameApi.playtime = () => st().playtimeSeconds;
    gameApi.clickResumeHint = () => {
      const phase = useGameStore.getState().phase;
      if (phase === 'playing') this.input.requestLock();
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
