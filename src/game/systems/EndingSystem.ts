import * as THREE from 'three';
import { useGameStore } from '../../store/gameStore';
import type { GameState } from './GameState';

/**
 * Fase 4 — multiple endings with real consequences.
 *
 * Three endings, conditioned by the player's own hand at the Altar of the
 * Tides (the choice dialogue sets ending_guardian / ending_crown /
 * ending_free). Each ending:
 *  - plays a short cinematic sequence (camera flight + epilogue cards)
 *  - grants unique aftermath rewards & world flags
 *  - lets the player CONTINUE exploring afterwards (post-campaign state)
 *  - is persisted (endings unlocked are remembered across sessions)
 */

export type EndingId = 'guardian' | 'crown' | 'free';

export interface EndingDef {
  id: EndingId;
  title: string;
  subtitle: string;
  /** Cinematic shots: camera from→to + lookAt + duration. */
  shots: Array<{
    from: [number, number, number];
    to: [number, number, number];
    lookFrom: [number, number, number];
    lookTo: [number, number, number];
    dur: number;
  }>;
  /** Epilogue paragraphs shown as cards during the sequence. */
  epilogue: string[];
  /** Permanent world consequences (flags set when the ending seals). */
  aftermathFlag: string;
  reward: { xp: number; items?: Array<{ id: string; count: number }>; gold?: number };
}

export const ENDINGS: Record<EndingId, EndingDef> = {
  guardian: {
    id: 'guardian',
    title: 'EL GUARDIÁN DE LA MAREA',
    subtitle: 'Final I — El pacto restaurado',
    shots: [
      {
        from: [26, 96, -286], to: [30, 100, -296],
        lookFrom: [20, 92, -302], lookTo: [20, 90, -300], dur: 9,
      },
      {
        from: [-40, 30, 120], to: [-10, 14, 175],
        lookFrom: [20, 6, 210], lookTo: [20, 8, 220], dur: 10,
      },
      {
        from: [60, 60, -60], to: [60, 62, -60],
        lookFrom: [60, 40, -50], lookTo: [60, 44, -52], dur: 8,
      },
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
      {
        from: [24, 98, -290], to: [18, 102, -296],
        lookFrom: [20, 90, -300], lookTo: [20, 92, -302], dur: 9,
      },
      {
        from: [10, 4, 130], to: [16, 6, 150],
        lookFrom: [20, 3, 175], lookTo: [22, 5, 180], dur: 10,
      },
      {
        from: [-600, 60, -500], to: [-580, 65, -520],
        lookFrom: [-570, 30, -515], lookTo: [-575, 34, -520], dur: 8,
      },
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
      {
        from: [20, 94, -292], to: [20, 98, -302],
        lookFrom: [20, 80, -310], lookTo: [20, 60, -320], dur: 9,
      },
      {
        from: [40, 8, 260], to: [80, 6, 280],
        lookFrom: [200, 2, 320], lookTo: [400, 1, 380], dur: 10,
      },
      {
        from: [-140, 40, -240], to: [-120, 42, -230],
        lookFrom: [-140, 20, -260], lookTo: [-150, 24, -270], dur: 8,
      },
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

  constructor(state: GameState) {
    this.state = state;
  }

  /** Begin an ending sequence (called once the choice flag is set). */
  play(id: EndingId, onFinished: () => void): boolean {
    const def = ENDINGS[id];
    if (!def) return false;
    this.active = def;
    this.t = 0;
    this.shot = 0;
    this.card = 0;
    this.cardTimer = 0;
    this.done = false;
    this.onFinished = onFinished;
    const store = useGameStore.getState();
    store.setEndingActive(true);
    store.notify('quest', def.subtitle, def.title);
    return true;
  }

  get isPlaying(): boolean {
    return this.active !== null && !this.done;
  }

  /** Current camera placement (lerped inside the active shot). */
  update(dt: number, camera: THREE.PerspectiveCamera): void {
    const def = this.active;
    if (!def || this.done) return;
    this.t += dt;

    const shots = def.shots;
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

    if (idx !== this.shot) {
      this.shot = idx;
    }

    // Epilogue cards advance on their own rhythm
    this.cardTimer += dt;
    const cardDur = 7.5;
    if (this.cardTimer > cardDur && this.card < def.epilogue.length - 1) {
      this.cardTimer = 0;
      this.card++;
    }
    useGameStore.getState().setEndingCard({
      title: def.title,
      subtitle: def.subtitle,
      text: def.epilogue[this.card],
      card: this.card,
      totalCards: def.epilogue.length,
    });

    // Camera flight
    const k = Math.min(1, Math.max(0, (this.t - t0) / shots[idx].dur));
    const ease = k * k * (3 - 2 * k);
    const s = shots[idx];
    camera.position.set(
      s.from[0] + (s.to[0] - s.from[0]) * ease,
      s.from[1] + (s.to[1] - s.from[1]) * ease,
      s.from[2] + (s.to[2] - s.from[2]) * ease,
    );
    const lx = s.lookFrom[0] + (s.lookTo[0] - s.lookFrom[0]) * ease;
    const ly = s.lookFrom[1] + (s.lookTo[1] - s.lookFrom[1]) * ease;
    const lz = s.lookFrom[2] + (s.lookTo[2] - s.lookFrom[2]) * ease;
    camera.lookAt(lx, ly, lz);

    if (this.t >= total + 2) {
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
    const store = useGameStore.getState();
    store.setEndingCard(null);
    store.setEndingActive(false);
    store.notify(
      'quest',
      `${def.title} — El destino está sellado`,
      'Eldoria sigue abierto: puedes continuar explorando con el mundo transformado por tu decisión.',
    );
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
