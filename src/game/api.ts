import type { SaveMeta, Settings } from './systems/SaveSystem';
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
  // Cinematic
  skipIntro(): void;
  // Dialogue
  chooseDialogue(index: number): void;
  closeDialogue(): void;
  narrationBlip(): void;
  // Misc
  playtime(): number;
  clickResumeHint(): void;
}

/** Live implementation is installed by the Game instance at boot. */
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
  settings: () => ({
    quality: 'high', masterVolume: 0.8, musicVolume: 0.6, sfxVolume: 0.9,
    sensitivity: 1, invertY: false,
  }),
  applySettings: () => undefined,
  skipIntro: () => undefined,
  chooseDialogue: () => undefined,
  closeDialogue: () => undefined,
  narrationBlip: () => undefined,
  playtime: () => 0,
  clickResumeHint: () => undefined,
};
