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
  /** Fase 11 — the señálero: distance (m) + bearing (rad, 0 = straight
   *  ahead, positive = to the right) toward the current objective. */
  marker?: { dist: number; bearing: number } | null;
  /** Fase 12 — screen-space marker: the objective pinned on screen (or
   *  clamped to the nearest edge with an arrow when off-screen). */
  marker3d?: {
    x: number;          // 0..1 screen fraction
    y: number;
    onScreen: boolean;
    dist: number;
    angle: number;      // edge-arrow direction (rad)
  } | null;
}

/** Boss fight HUD state (Fase 3). */
export interface BossHud {
  name: string;
  title: string;
  hp: number;
  maxHp: number;
  phase: number;
}

/** Weapon slot HUD state (Fase 3). */
export interface WeaponSlotHud {
  slot: number;
  id: string;
  name: string;
  owned: boolean;
  equipped: boolean;
  kind: string;
}

/** Fase 18 — archery HUD: selected arrow family, ammo counts, overdraw
 *  clock, recurve streak and the G/T ability cooldowns (one push per frame
 *  while a bow is equipped; null when it is not). */
export interface BowHud {
  ammo: string;
  ammoName: string;
  counts: Record<string, number>;
  overdraw: number;
  streak: number;
  rainCd: number;
  pierceCd: number;
}

/** Mount HUD state (Fase 4): gait, speed and cart while riding. */
export interface MountHud {
  horseName: string;
  gait: string;
  speedKmh: number;
  cart: boolean;
}

/** Ending cinematic card (Fase 4). */
export interface EndingCard {
  title: string;
  subtitle: string;
  text: string;
  card: number;
  totalCards: number;
  /** Fase 10 — cinematic fades/progress for the long epic endings. */
  fade?: number;
  shot?: number;
  totalShots?: number;
  progress?: number;
  finalCard?: boolean;
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
  boss: BossHud | null;
  weaponSlots: WeaponSlotHud[];
  bowDraw: number;
  /** Fase 18 — archery state (null while no bow is the active weapon). */
  bowHud: BowHud | null;
  /** True while steering the ship (weapon HUD hidden at the helm). */
  atHelm: boolean;
  /** Increments on every hit taken — triggers the red vignette flash. */
  hurtFlash: number;
  /** Fase 4 — riding HUD (null when on foot). */
  mount: MountHud | null;
  /** Fase 15 — true while the player's head is under the sea (dive overlay). */
  submerged: boolean;
  /** Fase 20 — true while the FREE CAM (P) has the camera detached from
   *  the hero (fly camera for exploring/filming). */
  freeCam: boolean;
  /** Fase 16 — open merchant panel (null = closed). */
  shop: { vendor: string } | null;
  /** Fase 15 — pirate toll negotiation (null = none deployed). Set while
   *  the ambush corsairs have the player at their mercy. */
  negotiation: { reason: 'death' | 'ship'; coins: number; canAfford: boolean; hasItems: boolean } | null;
  /** Fase 17 — SEA FURY (Valor): 0..300, one segment = 100. Spent on the
   *  Sea Tonic (R) and cinematic finishers (V / Shift+Space). */
  valor: number;
  /** Fase 17 — transient danger cue over the combat reticle: which defense
   *  the incoming attack demands (null = no cue). */
  dangerCue: 'parry' | 'dodge' | null;
  /** Fase 17 — true while a FINISHER target is in reach with a segment
   *  banked (the HUD shows the execution prompt). */
  finisherReady: boolean;
  /** Fase 4 — ending cinematic state. */
  endingActive: boolean;
  endingCard: EndingCard | null;
  /** Fase 9 — in-game narrative cinematic (letterbox + cards). */
  cinematic: { title: string; subtitle: string; progress: number; shot: number; total: number; text?: string } | null;
  /** Fase 9 — melee combo chain indicator (null when no chain).
   *  Fase 11 adds `label` — the fight moments (360 SPIN, COUNTER!...). */
  combo: { step: number; counter: boolean; label?: string } | null;
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
  setHud: (h: Partial<Pick<GameStore, 'health' | 'maxHealth' | 'stamina' | 'maxStamina' | 'clock' | 'dayCount' | 'prompt' | 'questTracker' | 'fps' | 'sailing' | 'atHelm' | 'submerged' | 'negotiation'>>) => void;
  setBoss: (b: BossHud | null) => void;
  setWeaponSlots: (s: WeaponSlotHud[]) => void;
  setBowDraw: (v: number) => void;
  setBowHud: (s: BowHud | null) => void;
  setFreeCam: (v: boolean) => void;
  setMount: (m: MountHud | null) => void;
  setEndingActive: (v: boolean) => void;
  setEndingCard: (c: EndingCard | null) => void;
  setCinematic: (c: GameStore['cinematic']) => void;
  setCombo: (c: GameStore['combo']) => void;
  triggerHurtFlash: () => void;
  setDialogue: (d: DialogueState | null) => void;
  setDiscovery: (d: { title: string; sub: string } | null) => void;
  /** Fase 16 — merchant panel state (null closes it). */
  setShop: (s: { vendor: string } | null) => void;
  /** Fase 17 — Sea Fury bar (0..300) + combat cue state. */
  setValor: (v: number) => void;
  setDangerCue: (c: 'parry' | 'dodge' | null) => void;
  setFinisherReady: (v: boolean) => void;
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
  boss: null,
  mount: null,
  submerged: false,
  shop: null,
  negotiation: null,
  valor: 0,
  dangerCue: null,
  finisherReady: false,
  endingActive: false,
  endingCard: null,
  cinematic: null,
  combo: null,
  weaponSlots: [],
  bowDraw: -1,
  bowHud: null,
  atHelm: false,
  hurtFlash: 0,
  freeCam: false,
  level: 1,
  xp: 0,
  xpToNext: 120,
  skillPoints: 0,
  inventoryVersion: 0,
  loadProgress: 0,
  loadLabel: 'Awakening Eldoria…',
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
  setBoss: (b) => set({ boss: b }),
  setMount: (m) => set({ mount: m }),
  setEndingActive: (v) => set({ endingActive: v }),
  setEndingCard: (c) => set({ endingCard: c }),
  setCinematic: (c) => set({ cinematic: c }),
  setCombo: (c) => set({ combo: c }),
  setWeaponSlots: (s) => set({ weaponSlots: s }),
  setBowDraw: (v) => set({ bowDraw: v }),
  setBowHud: (s) => set({ bowHud: s }),
  setFreeCam: (v) => set({ freeCam: v }),
  triggerHurtFlash: () => set((s) => ({ hurtFlash: s.hurtFlash + 1 })),
  setDialogue: (d) => set({ dialogue: d }),
  setDiscovery: (d) => set({ discovery: d }),
  setShop: (s) => set({ shop: s }),
  setValor: (v) => set((s) => (s.valor === v ? s : { valor: Math.max(0, Math.min(300, v)) })),
  setDangerCue: (c) => set((s) => (s.dangerCue === c ? s : { dangerCue: c })),
  setFinisherReady: (v) => set((s) => (s.finisherReady === v ? s : { finisherReady: v })),
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
