'use client';

import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';

/**
 * Fase 4 — ending cinematic overlay: epilogue cards over the flying camera,
 * letterbox bars and a skip button. Rendered only while `endingActive`.
 */
export default function EndingOverlay() {
  const endingActive = useGameStore((s) => s.endingActive);
  const card = useGameStore((s) => s.endingCard);

  if (!endingActive) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      {/* Letterbox */}
      <div className="kotfs-letterbox kotfs-letterbox-top" />
      <div className="kotfs-letterbox kotfs-letterbox-bottom" />

      {/* Epilogue card */}
      {card && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-[16vh] max-w-2xl w-[86%] text-center"
          style={{ animation: 'kotfs-fade-in 1.4s ease' }}
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
