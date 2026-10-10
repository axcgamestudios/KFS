import { create } from 'zustand';

export type GamePhase = 'boot' | 'menu' | 'loading' | 'intro' | 'playing' | 'paused';
export type OverlayKind = 'inventory' | 'map' | 'journal' | 'skills' | 'settings' | 'saves' | 'credits' | null;

/** Naval HUD snapshot (null when away from the ship). */
export interface SailingHud {
  hull: number;
  hullMax: number;
  knots: number;
  sailState: 0 | 1 | 2;
  windRel: number;
  cdPort: number;
  cdStar: number;
  anchored: boolean;
  shipName: string;
  enemy: { name: string; hullFrac: number; dist: number } | null;
  boarding: boolean;
}

export interface Notification {
  id: number;
  kind: 'info' | 'quest' | 'discovery' | 'item' | 'levelup' | 'save';
  title: string;
  body?: string;
}

export interface DialogueState {
  npcName: string;
  text: string;
  options: Array<{ text: string; index: number; disabled?: boolean }>;
  isNarrator?: boolean;
}

export interface QuestTracker {
  title: string;
  objectives: Array<{ text: string; done: boolean }>;
}

interface GameStore {
  phase: GamePhase;
  overlay: OverlayKind;
  previousOverlay: OverlayKind;
  // HUD
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  clock: string;
  dayCount: number;
  prompt: string | null;
  questTracker: QuestTracker | null;
  discovery: { title: string; sub: string } | null;
  notifications: Notification[];
  dialogue: DialogueState | null;
  sailing: SailingHud | null;
  // Progression
  level: number;
  xp: number;
  xpToNext: number;
  skillPoints: number;
  inventoryVersion: number;
  // Loading
  loadProgress: number;
  loadLabel: string;
  // Menu
  hasSave: boolean;
  fps: number;
  // Intro
  introActive: boolean;
  introText: string;
  introShotIndex: number;
  introTotal: number;
  introTitle: boolean;

  setPhase: (p: GamePhase) => void;
  openOverlay: (o: OverlayKind) => void;
  closeOverlay: () => void;
  setHud: (h: Partial<Pick<GameStore, 'health' | 'maxHealth' | 'stamina' | 'maxStamina' | 'clock' | 'dayCount' | 'prompt' | 'questTracker' | 'fps' | 'sailing'>>) => void;
  setDialogue: (d: DialogueState | null) => void;
  setDiscovery: (d: { title: string; sub: string } | null) => void;
  notify: (kind: Notification['kind'], title: string, body?: string) => void;
  dismissNotification: (id: number) => void;
  setProgress: (p: number, label: string) => void;
  setProgression: (p: Partial<Pick<GameStore, 'level' | 'xp' | 'xpToNext' | 'skillPoints' | 'inventoryVersion'>>) => void;
  setHasSave: (v: boolean) => void;
  setIntroActive: (v: boolean) => void;
  setIntro: (v: { text: string; shot: number; total: number; title: boolean }) => void;
}

let notifSeq = 1;

export const useGameStore = create<GameStore>((set) => ({
  phase: 'boot',
  overlay: null,
  previousOverlay: null,
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  clock: '07:12',
  dayCount: 1,
  prompt: null,
  questTracker: null,
  discovery: null,
  notifications: [],
  dialogue: null,
  sailing: null,
  level: 1,
  xp: 0,
  xpToNext: 120,
  skillPoints: 0,
  inventoryVersion: 0,
  loadProgress: 0,
  loadLabel: 'Despertando Eldoria…',
  hasSave: false,
  fps: 60,
  introActive: false,
  introText: '',
  introShotIndex: 0,
  introTotal: 4,
  introTitle: false,

  setPhase: (p) => set({ phase: p, overlay: null }),
  openOverlay: (o) => set({ overlay: o }),
  closeOverlay: () => set((s) => ({ overlay: null, previousOverlay: s.overlay })),
  setHud: (h) => set(h as Partial<GameStore>),
  setDialogue: (d) => set({ dialogue: d }),
  setDiscovery: (d) => set({ discovery: d }),
  notify: (kind, title, body) =>
    set((s) => ({
      notifications: [...s.notifications.slice(-4), { id: notifSeq++, kind, title, body }],
    })),
  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  setProgress: (p, label) => set({ loadProgress: p, loadLabel: label }),
  setProgression: (p) => set(p as Partial<GameStore>),
  setHasSave: (v) => set({ hasSave: v }),
  setIntroActive: (v) => set({ introActive: v }),
  setIntro: (v) =>
    set({
      introActive: true,
      introText: v.text,
      introShotIndex: v.shot,
      introTotal: v.total,
      introTitle: v.title,
    }),
}));
