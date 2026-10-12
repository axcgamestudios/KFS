'use client';

import { useGameStore } from '@/store/gameStore';
import { Embers, EpicTitle, SeaWaves } from './menuFx';
import { ASSET_BASE } from '@/game/core/Graphics';

const TIPS = [
  'Los pétalos de marfil florecen donde el agua canta: cascadas y ruinas.',
  'Las mejores espadas no se compran: se heredan… y se templan en la forja de Bram.',
  'Maren no regala nada… pero premia la paciencia.',
  'Las runas del Círculo de las Vigilias brillan cuando cae la noche.',
  'Los pastores juran que una sombra alada cruza las Garrahielo al atardecer.',
  'Pulsa F al anochecer: tu farol ilumina más que la luna.',
  'Un barco tocado echa humo: acércate y abórdalo antes de que se hunda.',
  'El viento decide la velocidad: mira la rosa de los vientos del timón.',
  'Las bordadas de babor y estribor recargan por separado.',
  'Los cofres de las islas guardan más oro que todas las tabernas juntas.',
  'Cuando un dragón echa la cabeza hacia atrás, su fuego ya está cargando: corre.',
  'El hacha golpea despacio pero tambalea a las bestias: mantén pulsado el clic.',
  'La lanza mantiene la distancia; el arco la elimina. Cambia de arma con 1–4.',
  'Con un escudo, el bloqueo derecho detiene hasta el aliento de un dragón.',
  'C esquivar no es huir: los rollos esquivan garras, colas y bocanadas de fuego.',
  '¡Doble salto! Un segundo impulso en el aire hace una marometa completa.',
  'Los caballeros rojos asaltan los caminos: sus campamentos esconden buen oro.',
  'Los dragones pequeños guardan escamas… y las escamas guardan secretos.',
];

/**
 * Fase 10 — cinematic loading screen: the studio key art breathing under a
 * slow ken-burns zoom, god-rays, drifting mist, the epic letter reveal, a
 * rune-ring progress dial and the tips carousel. (The old "FASE X · vX"
 * build label is gone by request.)
 */
export default function LoadingScreen() {
  const progress = useGameStore((s) => s.loadProgress);
  const label = useGameStore((s) => s.loadLabel);
  const tip = TIPS[Math.floor(progress * TIPS.length) % TIPS.length];
  const done = progress >= 0.999;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#04060a]">
      {/* Key-art backdrop with slow ken-burns breathing */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={`${ASSET_BASE}/menu/fondo_menu.jpg`}
          alt=""
          className="kfs-load-art absolute inset-0 h-full w-full object-cover object-top"
          draggable={false}
        />
        {/* cinematic grade: dark veil + warm horizon + vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(4,6,10,0.82) 0%, rgba(6,10,16,0.6) 40%, rgba(4,6,10,0.86) 100%),' +
              'radial-gradient(ellipse 90% 60% at 50% 112%, rgba(201,162,39,0.22), transparent 55%)',
          }}
        />
        {/* god-rays sweeping across the art */}
        <div className="kfs-load-rays absolute -inset-x-1/2 top-[-30%] h-[160%] opacity-[0.14]"
          style={{
            background:
              'repeating-linear-gradient(77deg, transparent 0px, transparent 90px, rgba(232,204,106,0.55) 120px, transparent 150px)',
            filter: 'blur(6px)',
          }}
        />
        {/* drifting mist band */}
        <div className="kfs-load-mist absolute inset-x-0 bottom-0 h-1/3 opacity-40"
          style={{
            background: 'linear-gradient(0deg, rgba(140,160,180,0.25), transparent)',
            filter: 'blur(18px)',
          }}
        />
        {/* vignette */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.72) 100%)' }}
        />
      </div>

      <Embers count={34} seed={11} />
      <SeaWaves horizon />

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center px-8">
        <p className="kotfs-rise mb-2 text-[0.65rem] tracking-[0.55em] text-[color:var(--kotfs-gold)] opacity-80" style={{ ['--rise-delay' as string]: '0.1s' }}>
          AXCGAMES STUDIOS PRESENTA
        </p>

        {/* Epic letter-by-letter title */}
        <h1 className="kotfs-title relative mb-1 text-center text-4xl leading-tight text-[color:var(--kotfs-parchment)] md:text-5xl">
          <EpicTitle text="KINGDOMS OF THE" delay={0.35} />
          <br />
          <EpicTitle
            text="FORGOTTEN SEAS"
            delay={1.15}
            letterClassName="kotfs-letter-shine"
          />
          {/* Breathing glow behind the second line */}
          <span
            className="kotfs-title-glow pointer-events-none absolute left-1/2 top-[62%] -z-10 h-16 w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(201,162,39,0.35), transparent 70%)' }}
          />
        </h1>

        <p className="kotfs-rise mb-7 text-xs italic tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)]" style={{ ['--rise-delay' as string]: '2s' }}>
          CAPÍTULO III — EL RUMOR DE LAS ALAS
        </p>

        {/* Rune-ring progress dial */}
        <div className="kotfs-rise relative mb-6 flex h-28 w-28 items-center justify-center" style={{ ['--rise-delay' as string]: '2.25s' }}>
          {/* outer rune ring */}
          <svg viewBox="0 0 100 100" className="kotfs-compass-spin absolute inset-0 h-full w-full">
            <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(201,162,39,0.25)" strokeWidth="0.6" strokeDasharray="1.5 3" />
          </svg>
          <svg viewBox="0 0 100 100" className="kotfs-compass-spin-rev absolute inset-0 h-[86%] w-[86%] opacity-80">
            <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(201,162,39,0.16)" strokeWidth="0.5" strokeDasharray="6 4" />
          </svg>
          {/* progress arc */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(201,162,39,0.16)" strokeWidth="1.4" />
            <circle
              cx="50" cy="50" r="44" fill="none" stroke="#e8cc6a" strokeWidth="1.4"
              strokeLinecap="round" strokeDasharray="276.5"
              strokeDashoffset={276.5 - 276.5 * Math.max(0.02, progress)}
              transform="rotate(-90 50 50)"
              style={{ filter: 'drop-shadow(0 0 4px rgba(232,204,106,0.8))' }}
            />
            {/* compass needles track the progress */}
            <path d="M50 6 L52.6 50 L50 94 L47.4 50 Z" fill="rgba(201,162,39,0.5)" />
            <path d="M6 50 L50 47.6 L94 50 L50 52.4 Z" fill="rgba(201,162,39,0.5)" />
          </svg>
          <div className="flex flex-col items-center">
            <span className="kotfs-title text-2xl text-[color:var(--kotfs-gold)]" style={{ textShadow: '0 0 18px rgba(201,162,39,0.55)' }}>
              {Math.round(progress * 100)}
              <span className="text-[0.6rem] opacity-70">%</span>
            </span>
            <span className="text-[0.5rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-70">
              CARGANDO
            </span>
          </div>
          {/* Ring pulse on progress */}
          <span className="kotfs-ring absolute inset-0 rounded-full border border-[rgba(201,162,39,0.5)]" />
        </div>

        {/* Forged progress bar */}
        <div className="kotfs-panel kotfs-panel-corner kotfs-rise w-full p-5" style={{ ['--rise-delay' as string]: '2.45s' }}>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm italic text-[color:var(--kotfs-parchment-dim)]">{label}</span>
            <span className="kotfs-title text-[0.7rem] tracking-widest text-[color:var(--kotfs-gold)]">
              {done ? '¡ZARPA!' : 'IZANDO VELAS…'}
            </span>
          </div>
          <div className="kotfs-bar relative" style={{ height: 10 }}>
            <div
              className="kotfs-bar-fill relative"
              style={{
                width: `${Math.max(2, progress * 100)}%`,
                background: 'linear-gradient(90deg, #6b5416, #c9a227, #f4dd8a)',
                boxShadow: '0 0 14px rgba(201,162,39,0.45)',
              }}
            >
              <span className="kotfs-bar-sheen" />
              {/* ember tip */}
              <span
                className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full"
                style={{ background: 'radial-gradient(circle, #ffe9a8, #e8a13c 55%, transparent 75%)', filter: 'blur(0.5px)' }}
              />
            </div>
          </div>
          <p className="mt-4 text-center text-sm italic text-[color:var(--kotfs-parchment-dim)]" key={tip}
            style={{ animation: 'kotfs-fade-in 0.7s ease' }}>
            «{tip}»
          </p>
        </div>
      </div>
    </div>
  );
}
