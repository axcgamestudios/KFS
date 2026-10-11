'use client';

import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';

/**
 * Fase 10 — ending cinematic overlay for the LONG EPIC finales (~90 s):
 * letterbox, fade-to-black cuts, epilogue cards, a film progress bar and
 * the final FIN card. Rendered only while `endingActive`.
 */
export default function EndingOverlay() {
  const endingActive = useGameStore((s) => s.endingActive);
  const card = useGameStore((s) => s.endingCard);

  if (!endingActive) return null;
  const fade = card?.fade ?? 0;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      {/* Cinematic fade between shots */}
      <div
        className="absolute inset-0 bg-black transition-none"
        style={{ opacity: fade }}
      />

      {/* Letterbox */}
      <div className="kotfs-letterbox kotfs-letterbox-top" />
      <div className="kotfs-letterbox kotfs-letterbox-bottom" />

      {/* Vignette for the filmic look */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%)' }}
      />

      {/* Film progress bar */}
      {card && (
        <div className="absolute left-1/2 top-[10.5vh] w-[min(420px,70vw)] -translate-x-1/2">
          <div className="h-[2px] w-full bg-[rgba(201,162,39,0.18)]">
            <div
              className="h-full bg-[color:var(--kotfs-gold)] transition-none"
              style={{ width: `${(card.progress ?? 0) * 100}%`, boxShadow: '0 0 8px rgba(201,162,39,0.8)' }}
            />
          </div>
          <p className="kotfs-title mt-1.5 text-center text-[0.55rem] tracking-[0.4em] text-[color:var(--kotfs-parchment-dim)] opacity-70">
            {(card.shot ?? 0) + 1} / {card.totalShots ?? 1}
          </p>
        </div>
      )}

      {/* Final FIN card */}
      {card?.finalCard && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ animation: 'kotfs-fade-in 2.6s ease' }}
        >
          <p className="kotfs-title text-[0.65rem] tracking-[0.6em] text-[color:var(--kotfs-gold)] opacity-80 mb-3">
            {card.subtitle.toUpperCase()}
          </p>
          <h2
            className="kotfs-title text-5xl md:text-6xl text-center text-[color:var(--kotfs-parchment)]"
            style={{ textShadow: '0 0 60px rgba(201,162,39,0.45), 0 4px 24px rgba(0,0,0,0.9)' }}
          >
            FIN
          </h2>
          <h3
            className="kotfs-title mt-4 text-lg md:text-xl text-[color:var(--kotfs-gold)] text-center"
            style={{ textShadow: '0 2px 16px rgba(0,0,0,0.9)' }}
          >
            {card.title}
          </h3>
          <p className="mt-8 text-[0.6rem] tracking-[0.35em] text-[color:var(--kotfs-parchment-dim)] opacity-60">
            AXCGAMES STUDIOS
          </p>
        </div>
      )}

      {/* Epilogue card */}
      {card && !card.finalCard && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-[15vh] max-w-2xl w-[86%] text-center"
          style={{ animation: 'kotfs-fade-in 1.6s ease' }}
          key={card.card}
        >
          <p className="kotfs-title text-sm tracking-[0.3em] text-[color:var(--kotfs-gold)] mb-1 opacity-90">
            {card.subtitle.toUpperCase()}
          </p>
          <h2
            className="kotfs-title text-3xl md:text-4xl text-[color:var(--kotfs-parchment)] mb-4"
            style={{ textShadow: '0 2px 18px rgba(0,0,0,0.9)' }}
          >
            {card.title}
          </h2>
          <p
            className="text-base md:text-lg leading-relaxed text-[color:var(--kotfs-parchment)]"
            style={{ textShadow: '0 1px 8px rgba(0,0,0,0.95)' }}
          >
            {card.text}
          </p>
          <div className="mt-3 flex justify-center gap-1.5">
            {Array.from({ length: card.totalCards }).map((_, i) => (
              <span
                key={i}
                className="w-8 h-[3px]"
                style={{
                  background: i <= card.card ? 'var(--kotfs-gold)' : 'rgba(201,162,39,0.25)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Skip */}
      <button
        className="pointer-events-auto absolute right-6 bottom-[13vh] kotfs-btn text-xs"
        onClick={() => gameApi.skipEnding()}
      >
        Saltar
      </button>
    </div>
  );
}
