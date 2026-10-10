import type { GameState } from './GameState';

/** localStorage-backed save slots + settings. */

export interface SaveMeta {
  slot: number;
  timestamp: number;
  level: number;
  dayCount: number;
  playtime: number;
  chapter: string;
}

export interface SaveData {
  version: number;
  timestamp: number;
  player: { x: number; y: number; z: number; yaw: number; health: number; stamina: number };
  time: { dayFraction: number; dayCount: number };
  gameState: ReturnType<GameState['serialize']>;
}

export interface Settings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  sensitivity: number;
  invertY: boolean;
}

const SAVE_PREFIX = 'kotfs_save_';
const AUTOSAVE_SLOT = 9;
const SETTINGS_KEY = 'kotfs_settings';

export class SaveSystem {
  static readonly SAVE_SLOTS = [0, 1, 2];

  static readSettings(): Partial<Settings> {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    } catch {
      return {};
    }
  }

  static writeSettings(s: Settings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* storage full / private mode */
    }
  }

  static save(slot: number, data: SaveData): boolean {
    try {
      localStorage.setItem(`${SAVE_PREFIX}${slot}`, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  static load(slot: number): SaveData | null {
    try {
      const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 1) return null;
      return data;
    } catch {
      return null;
    }
  }

  static delete(slot: number): void {
    try {
      localStorage.removeItem(`${SAVE_PREFIX}${slot}`);
    } catch {
      /* ignore */
    }
  }

  static slotMeta(slot: number): SaveMeta | null {
    const data = SaveSystem.load(slot);
    if (!data) return null;
    return {
      slot,
      timestamp: data.timestamp,
      level: data.gameState.level,
      dayCount: data.time.dayCount,
      playtime: data.gameState.playtimeSeconds,
      chapter: 'Capítulo I — El Legado de Eirik',
    };
  }

  static autosave(data: SaveData): boolean {
    return SaveSystem.save(AUTOSAVE_SLOT, data);
  }

  static loadAutosave(): SaveData | null {
    return SaveSystem.load(AUTOSAVE_SLOT);
  }

  static newestSlot(): number | null {
    // Prefer manual slots by recency, else autosave.
    let best: { slot: number; ts: number } | null = null;
    for (const s of SaveSystem.SAVE_SLOTS) {
      const meta = SaveSystem.slotMeta(s);
      if (meta && (!best || meta.timestamp > best.ts)) best = { slot: s, ts: meta.timestamp };
    }
    if (best) return best.slot;
    const auto = SaveSystem.loadAutosave();
    if (auto) return AUTOSAVE_SLOT;
    return null;
  }

  static formatPlaytime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }
}
