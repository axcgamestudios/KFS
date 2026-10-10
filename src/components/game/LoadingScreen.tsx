'use client';

import { useGameStore } from '@/store/gameStore';
import { Embers, EpicTitle, SeaWaves } from './menuFx';

const TIPS = [
  'Los pétalos de marfil florecen donde el agua canta: cascadas y ruinas.',
  'Las mejores espadas no se compran: se heredan.',
  'Maren no regala nada… pero premia la paciencia.',
  'Las runas del Círculo de las Vigilias brillan cuando cae la noche.',
  'Los pastores juran que una sombra alada cruza las Garrahielo al atardecer.',
  'Pulsa F al anochecer: tu farol ilumina más que la luna.',
  'Un barco tocado echa humo: acércate y abórdalo antes de que se hunda.',
  'El viento decide la velocidad: mira la rosa de los vientos del timón.',
  'Las bordadas de babor y estribora recargan por separado.',
  'Los cofres de las islas guardan más oro que todas las tabernas juntas.',
  'Cuando un dragón echa la cabeza hacia atrás, su fuego ya está cargando: corre.',
  'El hacha golpea despacio pero tambalea a las bestias: mantén pulsado el clic.',
  'La lanza mantiene la distancia; el arco la elimina. Cambia de arma con 1–4.',
  'Con un escudo, el bloqueo derecho detiene hasta el aliento de un dragón.',
  'C esquivar no es huir: los rollos esquivan garras, colas y bocanadas de fuego.',
  'Los dragones pequeños guardan escamas… y las escamas guardan secretos.',
];

/** Deterministic pseudo-random field of rising embers. */
// (ember FX, title reveal & waves live in ./menuFx)

export default function LoadingScreen() {
  const progress = useGameStore((s) => s.loadProgress);
  const label = useGameStore((s) => s.loadLabel);
  const tip = TIPS[Math.floor(progress * TIPS.length) % TIPS.length];

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#06080a]">
      {/* Deep sea horizon glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 55% at 50% 108%, rgba(201,162,39,0.16), transparent 55%),' +
            'radial-gradient(ellipse 80% 40% at 50% 118%, rgba(224,148,64,0.1), transparent 60%),' +
            'linear-gradient(180deg, #04060a 0%, #071019 55%, #0b1622 100%)',
        }}
      />

      {/* Rotating compass rose backdrop */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <svg width="860" height="860" viewBox="0 0 100 100" className="kotfs-compass-spin opacity-[0.06]">
          <circle cx="50" cy="50" r="48" fill="none" stroke="#c9a227" strokeWidth="0.4" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#c9a227" strokeWidth="0.25" strokeDasharray="1 2" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#c9a227" strokeWidth="0.25" />
          <path d="M50 2 L54 50 L50 98 L46 50 Z" fill="#c9a227" />
          <path d="M2 50 L50 46 L98 50 L50 54 Z" fill="#c9a227" />
        </svg>
      </div>

      <Embers count={30} seed={11} />
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

        <p className="kotfs-rise mb-8 text-xs italic tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)]" style={{ ['--rise-delay' as string]: '2s' }}>
          CAPÍTULO III — EL RUMOR DE LAS ALAS
        </p>

        {/* Compass ring progress */}
        <div className="kotfs-rise relative mb-6 flex h-24 w-24 items-center justify-center" style={{ ['--rise-delay' as string]: '2.3s' }}>
          <svg viewBox="0 0 100 100" className="kotfs-compass-spin-rev absolute inset-0 h-full w-full">
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(201,162,39,0.18)" strokeWidth="1.6" />
            <circle
              cx="50" cy="50" r="46" fill="none" stroke="#c9a227" strokeWidth="1.6"
              strokeLinecap="round" strokeDasharray="289"
              strokeDashoffset={289 - 289 * Math.max(0.02, progress)}
              transform="rotate(-90 50 50)"
            />
            <path d="M50 6 L53 50 L50 94 L47 50 Z" fill="rgba(201,162,39,0.4)" />
            <path d="M6 50 L50 47 L94 50 L50 53 Z" fill="rgba(201,162,39,0.4)" />
          </svg>
          <span className="kotfs-title text-xl text-[color:var(--kotfs-gold)]">
            {Math.round(progress * 100)}
            <span className="text-[0.6rem] opacity-70">%</span>
          </span>
          {/* Ring pulse on progress */}
          <span className="kotfs-ring absolute inset-0 rounded-full border border-[rgba(201,162,39,0.5)]" />
        </div>

        <div className="kotfs-panel kotfs-panel-corner kotfs-rise w-full p-5" style={{ ['--rise-delay' as string]: '2.5s' }}>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm italic text-[color:var(--kotfs-parchment-dim)]">{label}</span>
            <span className="kotfs-title text-[0.7rem] tracking-widest text-[color:var(--kotfs-gold)]">
              {label === 'Eldoria espera…' ? '¡ZARPA!' : 'IZANDO VELAS…'}
            </span>
          </div>
          <div className="kotfs-bar relative">
            <div
              className="kotfs-bar-fill relative"
              style={{
                width: `${Math.max(2, progress * 100)}%`,
                background: 'linear-gradient(90deg, #6b5416, #c9a227, #e8cc6a)',
              }}
            >
              <span className="kotfs-bar-sheen" />
            </div>
          </div>
          <p className="mt-4 text-center text-sm italic text-[color:var(--kotfs-parchment-dim)]">
            «{tip}»
          </p>
        </div>

        <p className="kotfs-rise mt-8 text-[0.62rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-60" style={{ ['--rise-delay' as string]: '2.8s' }}>
          FASE 5 — EL CABALLERO Y LOS KITS · v0.5
        </p>
      </div>
    </div>
  );
}
