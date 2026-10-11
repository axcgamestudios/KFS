'use client';

import { useGameStore } from '@/store/gameStore';

/**
 * Fase 9 — CinematicOverlay: letterbox bars + title cards for the in-game
 * narrative cinematics (dragon victories, chapter milestones — PDF §6).
 * Pure presentation: the CinematicSystem drives camera and state.
 */
export default function CinematicOverlay() {
  const cine = useGameStore((s) => s.cinematic);

  if (!cine) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* Letterbox bars */}
      <div
        className="kotfs-cine-bar absolute inset-x-0 top-0 bg-black"
        style={{ height: '11vh', transform: 'translateY(-11vh)' }}
        data-active="on"
      />
      <div
        className="kotfs-cine-bar absolute inset-x-0 bottom-0 bg-black"
        style={{ height: '11vh', transform: 'translateY(11vh)' }}
        data-active="on"
      />

      {/* Title card */}
      {cine.title ? (
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ top: '13vh' }}
        >
          <h2
            className="kotfs-cine-title text-center text-3xl font-semibold tracking-[0.2em] text-[color:var(--kotfs-gold)] md:text-4xl"
            style={{ textShadow: '0 2px 22px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,1)' }}
          >
            {cine.title}
          </h2>
          {cine.subtitle ? (
            <p
              className="kotfs-cine-sub mt-3 text-center text-sm tracking-[0.32em] text-[color:var(--kotfs-parchment)]/90 uppercase md:text-base"
              style={{ textShadow: '0 1px 12px rgba(0,0,0,0.95)' }}
            >
              {cine.subtitle}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Skip hint + progress */}
      <div className="absolute inset-x-0 flex flex-col items-center gap-2" style={{ bottom: '4vh' }}>
        <span
          className="text-[11px] tracking-[0.3em] text-[color:var(--kotfs-parchment)]/70 uppercase"
          style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}
        >
          ESPACIO · omitir
        </span>
        <div className="h-[3px] w-56 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-[color:var(--kotfs-gold)]/85 transition-[width] duration-200 ease-linear"
            style={{ width: `${Math.round(cine.progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
