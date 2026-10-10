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
  private settings: Settings;

  private hudTimer = 0;
  private discoveryTimer = 0;
  private autosaveTimer = 0;
  private mapTimer = 0;
  private menuOrbit = 0;
  private introT = 0;
  private introDone = false;
  private lastIntroShot = -1;
  private musicIntensityTarget = 0.15;
  private lastSwingHit = false;
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

  // ---------------------------------------------------------------- phases

  private startNewGameCore(): void {
    const w = this.world!;
    this.state.resetForNewGame();
    this.state.setFlag('intro_done');
    w.sky.dayFraction = 0.295;
    w.sky.dayCount = 1;
    this.dead = false;
    const sp = w.village.spawnPoint;
    const groundY = w.terrainHeight.height(sp.x, sp.z);
    this.player!.teleport(sp.x, Math.max(groundY, 1.5), sp.z);
    this.player!.health = 100;
    this.player!.stamina = 100;
    this.player!.model.setEquippedState(false);
    this.applyStats();
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
      version: 1,
      timestamp: Date.now(),
      player: this.player!.serialize(),
      time: this.world!.sky.serialize(),
      gameState: this.state.serialize(),
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
    if (!data || !this.world || !this.player) return false;
    this.state.deserialize(data.gameState);
    this.player.deserialize(data.player);
    this.world.sky.deserialize(data.time);
    this.dead = false;
    this.restoreWorldFromState();
    this.applyStats();
    this.syncProgression();
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
    this.player!.model.setEquippedState(!!this.state.equippedWeapon);
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

  private updatePlaying(dt: number, store: ReturnType<typeof useGameStore.getState>): void {
    const w = this.world!;
    const p = this.player!;
    const rig = this.rig!;
    const dialogueActive = !!store.dialogue;

    // --- Death / respawn ---
    if (p.health <= 0 && !this.dead) {
      this.dead = true;
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

    // --- Camera input & player ---
    rig.handleInput(this.input, dt);
    p.update(dt, this.input, rig.yawForward, w.terrainHeight, this.colliders, dialogueActive || this.dead);

    // --- Attack (LMB) ---
    if (!dialogueActive && this.input.leftPressed && p.attackT === 0 && this.state.equippedWeapon) {
      p.attackT = 0.001;
      p.onAttackSwing?.();
      this.lastSwingHit = false;
    }
    if (p.attackT > 0 && !this.lastSwingHit && p.attackT >= 0.45) {
      this.lastSwingHit = true;
      // Training dummy hit check
      const d = w.dummyPos;
      const dx = d.x - p.position.x;
      const dz = d.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.3) {
        const facing = Math.sin(p.yaw) * dx + Math.cos(p.yaw) * dz;
        if (facing > 0) {
          this.audio.playEvent('damage');
          this.state.giveXp(2);
        }
      }
    }

    // --- Lantern ---
    if (!dialogueActive && this.input.pressed('lantern')) {
      p.toggleLantern();
      this.audio.playEvent('pickup');
    }

    // --- World systems ---
    rig.update(dt, p.position, this.input.isDown('sprint') && !dialogueActive, w.terrainHeight, this.colliders);
    w.sky.update(this.engine.camera, p.position, this.engine.quality.shadowsEnabled);
    w.water.update(dt, this.engine.camera);
    w.water.setSky(w.sky.sunDir, w.sky.sunColor, w.sky.zenithColor, w.sky.horizonColor, w.sky.nightFactor);
    w.terrain.update(p.position.x, p.position.z);
    w.vegetation.update();
    this.refreshGrass(p.position.x, p.position.z);
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
    const terrainHNow = w.terrainHeight.height(p.position.x, p.position.z);
    this.audio.update(dt, {
      altitude: Math.max(0, p.position.y),
      shoreDist: clamp(terrainHNow, 0, 160),
      dayFactor: w.sky.dayFactor,
      waterfallDist: p.position.distanceTo(w.waterfallBasin),
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
      });
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
      this.player!.model.setEquippedState(true);
      this.audio.playEvent('unlock');
      useGameStore.getState().notify('item', ITEMS[id].name, 'Equipada. Haz clic izquierdo para atacar.');
    };
    gameApi.unequipWeapon = () => {
      st().unequip();
      this.player!.model.setEquippedState(false);
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
