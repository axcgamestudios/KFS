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
  /** Fase 2 naval state (version 2 saves; absent in version 1). */
  naval?: {
    player: {
      x: number; z: number; heading: number; hullHp: number;
      sailState: 0 | 1 | 2; anchored: boolean; sunk: boolean; sinking: number;
    } | null;
    sailing: boolean;
    enemies: Array<{
      x: number; z: number; heading: number; hullHp: number;
      sailState: 0 | 1 | 2; anchored: boolean; sunk: boolean; sinking: number;
      questBoarded?: boolean;
    }>;
  };
  /** Fase 4 mounts & weather (version 3 saves; absent in earlier versions). */
  mounts?: {
    horses: Array<{ id: string; x: number; z: number; yaw: number; owned: boolean }>;
    cart: { x: number; z: number; heading: number; hitchedTo: string | null } | null;
    riding: string | null;
  };
  weather?: { kind: 'clear' | 'cloudy' | 'rain' | 'storm'; timer: number };
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
      if (data.version !== 1 && data.version !== 2 && data.version !== 3) return null;
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
    const flags = data.gameState.flags ?? [];
    let chapter = 'Capítulo I — El Legado de Eirik';
    if (flags.includes('ending_done')) chapter = 'Epílogo — El Destino de las Mareas';
    else if (flags.includes('kraivenn_awake')) chapter = 'Capítulo V — El Cuervo de Tres Cabezas';
    else if (flags.includes('corona_taken')) chapter = 'Capítulo IV — La Corona Hundida';
    else if (flags.includes('ancestro_dead')) chapter = 'Capítulo IV — La Corona Hundida';
    else if (flags.includes('ship_repaired')) chapter = flags.includes('vaelthara_seen') ? 'Capítulo III — El Rumor de las Alas' : 'Capítulo II — Los Mares Olvidados';
    return {
      slot,
      timestamp: data.timestamp,
      level: data.gameState.level,
      dayCount: data.time.dayCount,
      playtime: data.gameState.playtimeSeconds,
      chapter,
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
