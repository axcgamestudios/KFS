'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';

/** Typewriter narration line with soft voice blips. Remounts per line via key. */
function Narration({ text, onTick }: { text: string; onTick: () => void }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setShown(i);
      if (i % 3 === 0) onTick();
      if (i >= text.length) clearInterval(interval);
    }, 34);
    return () => clearInterval(interval);
  }, [text, onTick]);

  return (
    <p className="max-w-3xl text-center text-lg leading-relaxed text-[color:var(--kotfs-parchment)] md:text-2xl"
      style={{ textShadow: '0 2px 14px rgba(0,0,0,0.95)' }}>
      {text.slice(0, shown)}
      <span className="kotfs-caret">|</span>
    </p>
  );
}

export default function IntroCinematic() {
  const introText = useGameStore((s) => s.introText);
  const shotIndex = useGameStore((s) => s.introShotIndex);
  const shotTotal = useGameStore((s) => s.introTotal);
  const isTitleShot = useGameStore((s) => s.introTitle);
  const shotKey = `${shotIndex}-${introText.length}`;
  const blip = () => gameApi.narrationBlip();

  return (
    <div className="absolute inset-0 z-40">
      {/* Letterbox */}
      <div className="kotfs-letterbox kotfs-letterbox-top" />
      <div className="kotfs-letterbox kotfs-letterbox-bottom" />

      {/* Narration */}
      <div className="absolute inset-x-0 bottom-[13vh] flex flex-col items-center gap-4 px-6">
        {isTitleShot && (
          <div className="kotfs-fade-in mb-2 text-center">
            <p className="kotfs-title mb-2 text-[0.6rem] tracking-[0.5em] text-[color:var(--kotfs-gold)] md:text-xs">
              EL MAR TE ESTÁ LLAMANDO
            </p>
            <h2
              className="kotfs-title text-2xl text-[color:var(--kotfs-parchment)] md:text-4xl"
              style={{ textShadow: '0 0 34px rgba(201,162,39,0.35), 0 4px 12px #000' }}
            >
              CAPÍTULO I <span className="kotfs-gold-text">— EL LEGADO DE EIRIK</span>
            </h2>
          </div>
        )}
        <Narration key={shotKey} text={introText} onTick={blip} />
        {/* Progress dots */}
        <div className="mt-2 flex gap-2">
          {Array.from({ length: shotTotal }).map((_, i) => (
            <span
              key={i}
              className="block h-1.5 w-1.5 rotate-45 border border-[color:var(--kotfs-gold)]"
              style={{
                background: i <= shotIndex ? 'var(--kotfs-gold)' : 'transparent',
                opacity: i <= shotIndex ? 1 : 0.35,
              }}
            />
          ))}
        </div>
        <button
          className="mt-1 text-[0.65rem] tracking-[0.35em] text-[color:var(--kotfs-parchment-dim)] opacity-60 transition hover:opacity-100"
          onClick={() => gameApi.skipIntro()}
        >
          SALTAR — ESPACIO
        </button>
      </div>
    </div>
  );
}
