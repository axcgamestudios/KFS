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
  /** Fase 16 — armor & wings slots (null = nothing on). */
  equippedArmor(): string | null;
  equippedWings(): string | null;
  unequipArmor(): void;
  unequipWings(): void;
  // Fase 16 — merchant system
  /** Catalog for a vendor: entries + whether the player can currently buy. */
  shopCatalog(vendor: string): {
    name: string;
    title: string;
    minLevel: number;
    levelOk: boolean;
    level: number;
    coins: number;
    entries: Array<{ id: string; name: string; desc: string; icon: string; price: number; qty?: number; note?: string; owned: boolean; canAfford: boolean; rarity?: string; stats?: string }>;
  } | null;
  /** Buy one unit. Returns 'ok' | 'gold' | 'level'. */
  buyShopItem(vendor: string, itemId: string): 'ok' | 'gold' | 'level';

  /** Fase 28 — EL VIAJERO. */
  travelerCatalog(): {
    present: boolean;
    name: string;
    camp: string;
    biome: string;
    coins: number;
    budget: number;
    reputation: number;
    discount: number;
    demand: Array<{ id: string; name: string; bonus: number }>;
    stock: Array<{ id: string; qty: number; price: number; stock: number; note: string; offer?: boolean }>;
    buyback: Array<{ id: string; count: number; price: number }>;
    sells: Array<{ id: string; name: string; count: number; have: number; priceEach: number; rate: string; locked: boolean; demand: boolean }>;
    relicCost: number;
    ambush: { active: boolean; posture: number; postureFrac: number; count: number } | null;
  } | null;
  travelerBuy(id: string): 'ok' | 'stock' | 'gold';
  travelerSell(id: string, count: number): { ok: boolean; paid: number; credit: number };
  travelerBuyback(index: number): 'ok' | 'gold' | 'range';
  travelerRelic(): { ok: boolean; got: string; tier: string };
  toggleFavorite(id: string): void;
  isFavorite(id: string): boolean;
  /** Fase 28 — live potion effects for the HUD chips. */
  activeEffects(): Array<{ id: string; left: number; icon: string; name: string }>;
  // Fase 15 — pirate toll negotiation
  /** Resolve the standing pirate negotiation ('item' | 'coins' | 'mercy'). */
  negotiateChoice(option: 'item' | 'coins' | 'mercy'): void;
  // Fase 22 — THE FORGE OF LEGENDS
  /** Live catalog for a forge station (recipes + eclipse state at the altar). */
  forgeCatalog(station: 'anvil' | 'altar' | 'titans' | 'still'): {
    station: 'anvil' | 'altar' | 'titans' | 'still';
    name: string;
    title: string;
    greeting: string;
    level: number;
    coins: number;
    eclipse: { active: boolean; left: number; hasEssence: boolean; canSummon: boolean };
    recipes: Array<{
      id: string; out: string; outName: string; outIcon: string; outRarity: string;
      gold: number; note: string; canCraft: boolean;
      status: 'ok' | 'materials' | 'gold' | 'level' | 'gate';
      level: number; levelOk: boolean;
      mats: Array<{ id: string; name: string; icon: string; have: number; need: number }>;
    }>;
  } | null;
  /** Run a recipe (ALL validation on the game side). */
  forgeCraft(station: 'anvil' | 'altar' | 'titans' | 'still', recipeId: string): 'ok' | 'materials' | 'gold' | 'gate' | 'level';
  /** Present the Primal Sun Essence at the Altar of the Gods. */
  summonEclipse(): boolean;
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
  equippedArmor: () => null,
  equippedWings: () => null,
  unequipArmor: () => undefined,
  unequipWings: () => undefined,
  shopCatalog: () => null,
  buyShopItem: () => 'gold',
  travelerCatalog: () => null,
  travelerBuy: () => 'stock',
  travelerSell: () => ({ ok: false, paid: 0, credit: 0 }),
  travelerBuyback: () => 'range',
  travelerRelic: () => ({ ok: false, got: '', tier: '' }),
  toggleFavorite: () => undefined,
  isFavorite: () => false,
  activeEffects: () => [],
  negotiateChoice: () => undefined,
  forgeCatalog: () => null,
  forgeCraft: () => 'gate',
  summonEclipse: () => false,
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
