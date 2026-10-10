'use client';

import { useGameStore } from '@/store/gameStore';

const TIPS = [
  'Los pétalos de marfil florecen donde el agua canta: cascadas y ruinas.',
  'Las mejores espadas no se compran: se heredan.',
  'Maren no regala nada… pero premia la paciencia.',
  'Las runas del Círculo de las Vigilias brillan cuando cae la noche.',
  'Los pastores juran que una sombra alada cruza las Garrahielo al atardecer.',
  'Pulsa F al anochecer: tu farol ilumina más que la luna.',
  'Los cofres escondidos guardan más oro que todas las tabernas juntas.',
  'El Colibrí de Mar volverá a surcar las olas… cuando esté reparado.',
];

export default function LoadingScreen() {
  const progress = useGameStore((s) => s.loadProgress);
  const label = useGameStore((s) => s.loadLabel);
  const tip = TIPS[Math.floor(progress * TIPS.length) % TIPS.length];

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#06080a]">
      {/* Animated compass rose backdrop */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07]">
        <svg width="720" height="720" viewBox="0 0 100 100" className="kotfs-pulse">
          <circle cx="50" cy="50" r="48" fill="none" stroke="#c9a227" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="#c9a227" strokeWidth="0.3" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#c9a227" strokeWidth="0.3" />
          <path d="M50 2 L54 50 L50 98 L46 50 Z" fill="#c9a227" />
          <path d="M2 50 L50 46 L98 50 L50 54 Z" fill="#c9a227" />
        </svg>
      </div>

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center px-8">
        <p className="kotfs-title mb-2 text-xs tracking-[0.5em] text-[color:var(--kotfs-gold)] opacity-80">
          EL ESTUDIO MAREA PRESENTA
        </p>
        <h1
          className="kotfs-title mb-8 text-center text-3xl leading-tight text-[color:var(--kotfs-parchment)] md:text-4xl"
          style={{ textShadow: '0 0 30px rgba(201,162,39,0.25)' }}
        >
          KINGDOMS OF THE
          <br />
          <span className="kotfs-gold-text">FORGOTTEN SEAS</span>
        </h1>

        <div className="kotfs-panel kotfs-panel-corner w-full p-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm italic text-[color:var(--kotfs-parchment-dim)]">{label}</span>
            <span className="kotfs-title text-sm text-[color:var(--kotfs-gold)]">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <div className="kotfs-bar">
            <div
              className="kotfs-bar-fill"
              style={{
                width: `${Math.max(2, progress * 100)}%`,
                background: 'linear-gradient(90deg, #6b5416, #c9a227, #e8cc6a)',
              }}
            />
          </div>
          <p className="mt-4 text-center text-sm italic text-[color:var(--kotfs-parchment-dim)]">
            «{tip}»
          </p>
        </div>

        <p className="mt-8 text-xs tracking-widest text-[color:var(--kotfs-parchment-dim)] opacity-60">
          CAPÍTULO I — EL LEGADO DE EIRIK · FASE 1: EL MUNDO Y LA EXPLORACIÓN
        </p>
      </div>
    </div>
  );
}
