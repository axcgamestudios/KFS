import * as THREE from 'three';
import { useGameStore } from '../../store/gameStore';
import type { GameState } from './GameState';

/**
 * Fase 4 → Fase 10 — multiple endings with real consequences.
 *
 * Three endings, conditioned by the player's own hand at the Altar of the
 * Tides (the choice dialogue sets ending_guardian / ending_crown /
 * ending_free). Each ending:
 *  - plays a LONG EPIC cinematic (~90 s): 8-9 camera shots over the real
 *    world (altar → dragons → village → castle → sea) with per-shot FOV,
 *    fade-to-black cuts and epilogue cards in rhythm
 *  - grants unique aftermath rewards & world flags
 *  - lets the player CONTINUE exploring afterwards (post-campaign state)
 *  - is persisted (endings unlocked are remembered across sessions)
 *  - can be REPLAYED from the admin panel in preview mode (no rewards)
 */

export type EndingId = 'guardian' | 'crown' | 'free';

export interface EndingShot {
  from: [number, number, number];
  to: [number, number, number];
  lookFrom: [number, number, number];
  lookTo: [number, number, number];
  dur: number;
  fov?: number;
  /** Epilogue card shown from this shot on (index into epilogue). */
  card?: number;
  /** Fase 11 — LIVE camera providers (evaluated per frame; they override
   *  the statics when present, so a shot can TRACK a moving ship or a
   *  walking hero instead of a fixed landmark). */
  fromFn?: () => [number, number, number];
  toFn?: () => [number, number, number];
  lookFromFn?: () => [number, number, number];
  lookToFn?: () => [number, number, number];
  /** Fase 11 — acting hook: real performances under the camera (the hero
   *  walks, salutes, takes the wheel; ships actually sail). */
  action?: (k: number, dt: number) => void;
}

export interface EndingDef {
  id: EndingId;
  title: string;
  subtitle: string;
  shots: EndingShot[];
  epilogue: string[];
  aftermathFlag: string;
  reward: { xp: number; items?: Array<{ id: string; count: number }>; gold?: number };
}

/* World landmarks (from WorldConfig):
 * Altar of the Tides ~ (20, -302) · Nido del Ancestro (20, -300)
 * Cumbres de Garrahielo (40, -320) · Castillo de Aldmor (110, -40)
 * Puerto Cuervo (20, 150) · bay (0, 330) · Cascada (-95, -195)
 * Fortaleza del Cuervo (-540, -450) · Islas de la Bruma (-15, 622) */

export const ENDINGS: Record<EndingId, EndingDef> = {
  guardian: {
    id: 'guardian',
    title: 'EL GUARDIÁN DE LA MAREA',
    subtitle: 'Final I — El pacto restaurado',
    shots: [
      // 1 — high above the altar, descending toward the hero
      { from: [64, 130, -246], to: [44, 96, -268], lookFrom: [20, 86, -302], lookTo: [20, 88, -300], dur: 10, fov: 50 },
      // 2 — the oath: low orbit around the altar stone
      { from: [30, 92, -282], to: [8, 93, -290], lookFrom: [20, 89, -302], lookTo: [20, 89, -302], dur: 9, fov: 42, card: 0 },
      // 3 — the dragons sleep again: flight over the frozen peaks
      { from: [-30, 78, -220], to: [86, 84, -268], lookFrom: [30, 62, -330], lookTo: [24, 58, -318], dur: 11, fov: 58 },
      // 4 — the Order reborn: golden hour over Puerto Cuervo
      { from: [-42, 30, 118], to: [-12, 22, 168], lookFrom: [20, 6, 208], lookTo: [24, 8, 220], dur: 11, fov: 52, card: 1 },
      // 5 — life returns: the waterfall glade
      { from: [-124, 42, -158], to: [-104, 30, -176], lookFrom: [-95, 16, -195], lookTo: [-95, 14, -199], dur: 10, fov: 48 },
      // 6 — the castle keeps its watch
      { from: [158, 66, 22], to: [148, 58, 44], lookFrom: [110, 30, -40], lookTo: [110, 34, -46], dur: 10, fov: 50, card: 2 },
      // 7 — the watcher on the cliff (hero silhouette against the sea)
      { from: [30, 10, -238], to: [26, 12, -250], lookFrom: [22, 6, -286], lookTo: [20, 5, -300], dur: 10, fov: 40 },
      // 8 — the long horizon: rise over the boundless sea
      { from: [22, 16, -320], to: [22, 44, -352], lookFrom: [20, 8, -302], lookTo: [12, 2, -196], dur: 11, fov: 56 },
      // 9 — FIN card
      { from: [20, 52, -356], to: [20, 60, -372], lookFrom: [10, 0, -190], lookTo: [0, 0, -120], dur: 9, fov: 60 },
    ],
    epilogue: [
      'El pacto se teje de nuevo, hilo a hilo, con tu juramento como nudo. Esa noche, por primera vez en cien años, los tres dragones de Aldmor duermen custodiados — y los cuervos pierden su sombra.',
      'La Orden de la Marea reabre sus puertas en Puerto Cuervo: Aldric escribe, Bram forja, Maren planta el segundo arce junto a la cascada. Y cada Guardián que venga después jurará sobre el Colmillo… como tú.',
      'Los reinos olvidados siguen olvidados — pero ya no perdidos. Alguien vela. La marea guarda, la marea juzga. Y tú, Guardián, eres su mano.',
    ],
    aftermathFlag: 'ending_guardian',
    reward: { xp: 300, items: [{ id: 'pocion', count: 3 }], gold: 200 },
  },
  crown: {
    id: 'crown',
    title: 'LA CORONA DE LAS ISLAS',
    subtitle: 'Final II — El nuevo trono',
    shots: [
      // 1 — the crowning: descend on the altar
      { from: [58, 122, -252], to: [38, 94, -272], lookFrom: [20, 88, -302], lookTo: [20, 90, -300], dur: 10, fov: 48 },
      // 2 — the weight of gold: tight orbit on the altar
      { from: [34, 93, -286], to: [10, 92, -292], lookFrom: [20, 89, -302], lookTo: [20, 89, -302], dur: 9, fov: 40, card: 0 },
      // 3 — the fortress kneels: approach over the pirate bay
      { from: [-468, 70, -382], to: [-498, 56, -422], lookFrom: [-540, 30, -450], lookTo: [-538, 34, -454], dur: 11, fov: 55 },
      // 4 — banners over the castle of Aldmor
      { from: [166, 62, 16], to: [150, 50, 52], lookFrom: [110, 32, -40], lookTo: [110, 36, -48], dur: 11, fov: 52, card: 1 },
      // 5 — the harbour obeys: caravels at anchor
      { from: [-30, 26, 128], to: [6, 16, 186], lookFrom: [30, 4, 246], lookTo: [34, 5, 258], dur: 10, fov: 50 },
      // 6 — tribute on the road: the village plaza
      { from: [4, 20, 122], to: [16, 12, 138], lookFrom: [22, 4, 160], lookTo: [20, 5, 166], dur: 10, fov: 46, card: 2 },
      // 7 — the throne room of the sea: wide command shot
      { from: [240, 90, -140], to: [220, 96, -180], lookFrom: [80, 30, -60], lookTo: [60, 24, -100], dur: 10, fov: 54 },
      // 8 — an empire of water: climb toward the horizon
      { from: [214, 104, -190], to: [200, 130, -240], lookFrom: [40, 10, -80], lookTo: [-20, 0, -20], dur: 11, fov: 58 },
      // 9 — FIN card
      { from: [196, 138, -250], to: [190, 150, -280], lookFrom: [-30, 0, 0], lookTo: [-60, 0, 60], dur: 9, fov: 62 },
    ],
    epilogue: [
      'La Corona de Thalassar pesa sobre tu frente — y sin embargo, nunca sentiste los hombros tan rectos. Dragones y puertos, fortalezas y faros: un solo cetro sobre el mar.',
      'Aldric archiva la Orden «en servicio de la Corona» y sonríe a medias: las canciones prefieren a los reyes que a los custodios. Bram forja tu estandarte. Rosa compone — cobra bien por él.',
      'Gobiernas con la marea como consejera y la espada como última palabra. El Cuervo no volverá: las sombras no se alimentan de juramentos que se cumplen. Reinarás… mientras el mar lo permita.',
    ],
    aftermathFlag: 'ending_crown',
    reward: { xp: 300, items: [{ id: 'coin', count: 500 }] },
  },
  free: {
    id: 'free',
    title: 'EL MAR SIN DUEÑO',
    subtitle: 'Final III — La marea libre',
    shots: [
      // 1 — the seal sinks: looking down into the deep from the altar cliff
      { from: [50, 108, -258], to: [30, 86, -280], lookFrom: [20, 60, -308], lookTo: [20, 30, -330], dur: 10, fov: 52 },
      // 2 — everything returns to the water: slow tilt to the horizon
      { from: [24, 22, -310], to: [24, 26, -316], lookFrom: [20, 2, -345], lookTo: [20, 6, -380], dur: 9, fov: 46, card: 0 },
      // 3 — the dragons wake FREE: banking over the peaks
      { from: [96, 86, -252], to: [-16, 78, -236], lookFrom: [30, 60, -330], lookTo: [26, 56, -322], dur: 11, fov: 60 },
      // 4 — no tolls, no flags: the Bruma islands from the sea
      { from: [-90, 22, 530], to: [-40, 14, 570], lookFrom: [-20, 6, 612], lookTo: [-16, 6, 618], dur: 11, fov: 52 },
      // 5 — the wreck that started it all, at peace now
      { from: [-368, 26, 158], to: [-342, 14, 178], lookFrom: [-330, 4, 190], lookTo: [-328, 4, 196], dur: 10, fov: 48, card: 1 },
      // 6 — sails of every colour: the bay at midday
      { from: [-24, 24, 132], to: [14, 14, 190], lookFrom: [34, 3, 250], lookTo: [40, 3, 262], dur: 10, fov: 50 },
      // 7 — nobody guards anything: wide wild sea
      { from: [60, 40, 380], to: [80, 46, 420], lookFrom: [0, 0, 300], lookTo: [-40, 0, 240], dur: 10, fov: 58, card: 2 },
      // 8 — the Colibrí sails: chase the horizon
      { from: [96, 18, 430], to: [150, 24, 480], lookFrom: [170, 4, 505], lookTo: [200, 4, 530], dur: 11, fov: 50 },
      // 9 — FIN card: open water, open sky
      { from: [160, 30, 496], to: [170, 40, 530], lookFrom: [220, 2, 560], lookTo: [260, 2, 600], dur: 9, fov: 62 },
    ],
    epilogue: [
      'El Sello se hunde primero, girando como una moneda de cobre; la Corona le sigue, plateada y silenciosa; el Corazón del Cuervo se disuelve en la corriente como tinta negra que se vuelve azul.',
      'Nadie custodia nada — y por primera vez, nada necesita ser custodiado. Los dragones despiertan libres, los puertos negocian en igualdad, y las canciones ya no hablan de reyes hundidos sino de mares abiertos.',
      'Los viejos te llamarán imprudente. Los jóvenes, libre. El mar — el mar no te llama nada: el mar nunca tuvo dueño, y por fin lo saben todos. Zarpa, Colibrí. Hay horizonte de sobra.',
    ],
    aftermathFlag: 'ending_free',
    reward: { xp: 300, items: [{ id: 'escama', count: 2 }] },
  },
};

/** Runtime state of one ending playback. */
export class EndingSystem {
  active: EndingDef | null = null;
  private t = 0;
  private shot = 0;
  private card = 0;
  private cardTimer = 0;
  private done = false;
  private onFinished?: () => void;
  private state: GameState;
  /** Fase 10 — admin preview: play the film, keep the world untouched. */
  private preview = false;
  /** Fase 11 — shot overrides for THIS playback (live cameras + acting). */
  private liveShots: EndingShot[] | null = null;

  constructor(state: GameState) {
    this.state = state;
  }

  /** Begin an ending sequence (called once the choice flag is set).
   *  Fase 11 — `extras` merges per-shot live camera providers and acting
   *  hooks into the definition (sparse, by index). */
  play(id: EndingId, onFinished: () => void, preview = false, extras?: Array<Partial<EndingShot>>): boolean {
    const def = ENDINGS[id];
    if (!def) return false;
    this.active = def;
    this.t = 0;
    this.shot = 0;
    this.card = 0;
    this.cardTimer = 0;
    this.done = false;
    this.preview = preview;
    this.onFinished = onFinished;
    this.liveShots = extras && extras.length
      ? def.shots.map((s, i) => ({ ...s, ...(extras[i] ?? {}) }))
      : null;
    const store = useGameStore.getState();
    store.setEndingActive(true);
    if (!preview) store.notify('quest', def.subtitle, def.title);
    return true;
  }

  get isPlaying(): boolean {
    return this.active !== null && !this.done;
  }

  /** Current camera placement (lerped inside the active shot) + fades. */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    const def = this.active;
    if (!def || this.done) return;
    this.t += dt;

    const shots = this.liveShots ?? def.shots;
    let t0 = 0;
    let idx = 0;
    for (let i = 0; i < shots.length; i++) {
      if (this.t < t0 + shots[i].dur) {
        idx = i;
        break;
      }
      t0 += shots[i].dur;
      idx = i;
    }
    const total = shots.reduce((a, s) => a + s.dur, 0);

    // The card follows the shot design (each card debuts on its shot) but
    // never outruns the epilogue length.
    if (idx !== this.shot) {
      this.shot = idx;
      const shotCard = shots[idx].card;
      if (shotCard !== undefined && shotCard > this.card) {
        this.card = shotCard;
        this.cardTimer = 0;
      }
    }

    // Epilogue cards advance on their own rhythm if the shots run long
    this.cardTimer += dt;
    const cardDur = 11;
    if (this.cardTimer > cardDur && this.card < def.epilogue.length - 1) {
      this.cardTimer = 0;
      this.card++;
    }

    // Fade to black across each cut: black at shot boundaries, clear mid-shot
    const s = shots[idx];
    const localT = this.t - t0;
    const edge = Math.min(localT, Math.max(0, s.dur - localT));
    const cutFade = edge >= 0.75 ? 0 : 1 - edge / 0.75;
    // The whole film also fades IN from black at the start
    const openFade = this.t < 2.2 ? 1 - this.t / 2.2 : 0;
    const fade = Math.max(cutFade, openFade);

    useGameStore.getState().setEndingCard({
      title: def.title,
      subtitle: def.subtitle,
      text: this.t > total - 8 ? '' : def.epilogue[this.card],
      card: this.card,
      totalCards: def.epilogue.length,
      fade,
      shot: idx,
      totalShots: shots.length,
      progress: Math.min(1, this.t / total),
      finalCard: this.t > total - 8,
    });

    // Fase 11 — the actors play first: their positions feed the live camera
    const k = Math.min(1, Math.max(0, localT / s.dur));
    s.action?.(k, dt);

    // Camera flight (live providers override the statics)
    const ease = k * k * (3 - 2 * k);
    const from = s.fromFn ? s.fromFn() : s.from;
    const to = s.toFn ? s.toFn() : s.to;
    const lookFrom = s.lookFromFn ? s.lookFromFn() : s.lookFrom;
    const lookTo = s.lookToFn ? s.lookToFn() : s.lookTo;
    camera.position.set(
      from[0] + (to[0] - from[0]) * ease,
      from[1] + (to[1] - from[1]) * ease,
      from[2] + (to[2] - from[2]) * ease,
    );
    const lx = lookFrom[0] + (lookTo[0] - lookFrom[0]) * ease;
    const ly = lookFrom[1] + (lookTo[1] - lookFrom[1]) * ease;
    const lz = lookFrom[2] + (lookTo[2] - lookFrom[2]) * ease;
    camera.lookAt(lx, ly, lz);
    if (s.fov !== undefined) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }

    if (this.t >= total + 2.5) {
      this.finish();
    }
  }

  /** Skip button. */
  skip(): void {
    if (this.active && !this.done) this.finish();
  }

  private finish(): void {
    const def = this.active;
    if (!def || this.done) return;
    this.done = true;
    this.liveShots = null;
    const store = useGameStore.getState();
    if (!this.preview) {
      // Consequences persist
      this.state.setFlag(def.aftermathFlag);
      this.state.setFlag('ending_done');
      // Unlocked-endings registry (meta-progression across playthroughs)
      try {
        const unlocked = JSON.parse(localStorage.getItem('kotfs_endings') ?? '[]') as string[];
        if (!unlocked.includes(def.id)) unlocked.push(def.id);
        localStorage.setItem('kotfs_endings', JSON.stringify(unlocked));
      } catch {
        /* storage may be unavailable */
      }
      this.state.giveXp(def.reward.xp);
      if (def.reward.gold) this.state.addItem('coin', def.reward.gold);
      def.reward.items?.forEach((it) => this.state.addItem(it.id, it.count));
      store.notify(
        'quest',
        `${def.title} — El destino está sellado`,
        'Eldoria sigue abierto: puedes continuar explorando con el mundo transformado por tu decisión.',
      );
    }
    store.setEndingCard(null);
    store.setEndingActive(false);
    this.onFinished?.();
    this.active = null;
  }

  /** Which endings has this browser seen (for the menu/journal). */
  static unlockedEndings(): EndingId[] {
    try {
      return JSON.parse(localStorage.getItem('kotfs_endings') ?? '[]') as EndingId[];
    } catch {
      return [];
    }
  }
}
