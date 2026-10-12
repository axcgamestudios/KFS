import type { SaveMeta, Settings } from './systems/SaveSystem';
import { SaveSystem, resolveSettings } from './systems/SaveSystem';
import type { JournalEntry, SkillDef } from './systems/GameState';

/** Inventory entry for the UI. */
export interface InvEntry { id: string; count: number }

export interface QuestView {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'locked';
  objectives: Array<{ text: string; done: boolean }>;
}

export interface GameApi {
  // Session
  startNewGame(): void;
  continueGame(): boolean;
  loadSlot(slot: number): boolean;
  saveSlot(slot: number): boolean;
  slotMetas(): Array<SaveMeta | null>;
  resume(): void;
  returnToMenu(): void;
  // Items
  inventory(): InvEntry[];
  useItem(id: string): void;
  readItem(id: string): void;
  equipItem(id: string): void;
  unequipWeapon(): void;
  equippedWeapon(): string | null;
  // Progression
  journal(): JournalEntry[];
  quests(): QuestView[];
  skills(): Array<SkillDef & { learned: boolean; canLearn: boolean }>;
  skillPoints(): number;
  learnSkill(id: string): void;
  levelInfo(): { level: number; xp: number; xpToNext: number };
  // Map
  mapCanvas(): HTMLCanvasElement | null;
  playerMap(): {
    x: number; z: number; yaw: number; discovered: string[]; explored: boolean[];
    ship?: { x: number; z: number; heading: number };
  };
  // Settings
  settings(): Settings;
  applySettings(s: Settings): void;
  /** Fase 13 — FPS actuales del motor (para el HUD). */
  fps(): number;
  // Cinematic
  skipIntro(): void;
  /** Fase 4 — skip the ending cinematic. */
  skipEnding(): void;
  /** Fase 4 — riding HUD info (null when on foot). */
  mountInfo(): { name: string; gait: string; speed: number; cart: boolean } | null;
  /** Fase 4 — endings unlocked on this browser. */
  endingsUnlocked(): string[];
  // Dialogue
  chooseDialogue(index: number): void;
  closeDialogue(): void;
  narrationBlip(): void;
  // Misc
  playtime(): number;
  clickResumeHint(): void;
  // Fase 8 — admin panel (U+I+O)
  /** Spawn a world entity near the player. Returns a human-readable location. */
  adminSpawn(kind: 'ship' | 'horse' | 'dragon', species?: string): string | null;
  /** Toggle the free-fly mode. Returns the new state. */
  adminFly(on: boolean): boolean;
  /** Is free-fly active right now? */
  adminFlying(): boolean;
  /** Jump the clock (0..1 day fraction). */
  adminSetTime(f: number): void;
  /** Fase 10 — replayable cinematics for the admin panel. */
  adminCinematics(): Array<{ key: string; label: string }>;
  /** Play a cinematic by key (returns false if unavailable). */
  adminPlayCinematic(key: string): boolean;
}

/** Live implementation is installed by the Game instance at boot. */

/** Pre-boot settings: read whatever is saved so the MAIN MENU shows the real
 *  configuration before the engine exists (Fase 13). */
function readSettingsRaw(): Partial<Settings> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem('kotfs_settings');
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
  } catch {
    return {};
  }
}

export const gameApi: GameApi = {
  startNewGame: () => undefined,
  continueGame: () => false,
  loadSlot: () => false,
  saveSlot: () => false,
  slotMetas: () => [null, null, null],
  resume: () => undefined,
  returnToMenu: () => undefined,
  inventory: () => [],
  useItem: () => undefined,
  readItem: () => undefined,
  equipItem: () => undefined,
  unequipWeapon: () => undefined,
  equippedWeapon: () => null,
  journal: () => [],
  quests: () => [],
  skills: () => [],
  skillPoints: () => 0,
  learnSkill: () => undefined,
  levelInfo: () => ({ level: 1, xp: 0, xpToNext: 100 }),
  mapCanvas: () => null,
  playerMap: () => ({ x: 0, z: 0, yaw: 0, discovered: [], explored: [] }),
  settings: () => resolveSettings(readSettingsRaw()),
  // Pre-boot (menú principal): persistir aunque el motor aún no exista —
  // el Game leerá estos ajustes al arrancar.
  applySettings: (s) => { SaveSystem.writeSettings(s); },
  fps: () => 0,
  skipIntro: () => undefined,
  skipEnding: () => undefined,
  mountInfo: () => null,
  endingsUnlocked: () => [],
  chooseDialogue: () => undefined,
  closeDialogue: () => undefined,
  narrationBlip: () => undefined,
  playtime: () => 0,
  clickResumeHint: () => undefined,
  adminSpawn: () => null,
  adminFly: () => false,
  adminFlying: () => false,
  adminSetTime: () => undefined,
  adminCinematics: () => [],
  adminPlayCinematic: () => false,
};
