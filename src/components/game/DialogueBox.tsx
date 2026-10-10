'use client';

import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { Feather } from 'lucide-react';

export default function DialogueBox() {
  const dialogue = useGameStore((s) => s.dialogue);

  useEffect(() => {
    if (!dialogue) return;
    const onKey = (e: KeyboardEvent) => {
      if (!dialogue) return;
      if (e.code === 'Escape') {
        gameApi.closeDialogue();
        gameApi.clickResumeHint();
        return;
      }
      // Number keys select options
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= dialogue.options.length) {
        gameApi.chooseDialogue(num - 1);
        // If dialogue closed after the choice, re-acquire pointer lock
        setTimeout(() => {
          if (!useGameStore.getState().dialogue) gameApi.clickResumeHint();
        }, 30);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogue]);

  if (!dialogue) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center pb-10">
      {/* Dim the world slightly during conversations */}
      <div className="absolute inset-0 bg-black/35" />

      <div className="kotfs-panel kotfs-panel-corner relative z-10 w-full max-w-3xl px-7 py-5">
        {/* Speaker */}
        <div className="mb-2 flex items-center gap-2">
          <Feather size={14} className="text-[color:var(--kotfs-gold)]" />
          <h3
            className={`kotfs-title text-sm tracking-[0.2em] ${
              dialogue.isNarrator ? 'italic text-[color:var(--kotfs-gold)]' : 'text-[color:var(--kotfs-gold)]'
            }`}
          >
            {dialogue.npcName}
          </h3>
        </div>

        {/* Text */}
        <p className="mb-5 min-h-[3.5rem] text-base leading-relaxed text-[color:var(--kotfs-parchment)] md:text-lg">
          {dialogue.text}
        </p>

        {/* Options */}
        <div className="flex flex-col gap-1.5">
          {dialogue.options.map((opt) => (
            <button
              key={opt.index}
              className="group flex items-center gap-3 px-2 py-1.5 text-left transition"
              onClick={() => {
                gameApi.chooseDialogue(opt.index);
                setTimeout(() => {
                  if (!useGameStore.getState().dialogue) gameApi.clickResumeHint();
                }, 30);
              }}
            >
              <span className="kotfs-title text-[0.65rem] text-[color:var(--kotfs-gold)] opacity-70 group-hover:opacity-100">
                {opt.index + 1}
              </span>
              <span className="text-sm text-[color:var(--kotfs-parchment-dim)] transition group-hover:text-[color:var(--kotfs-parchment)]">
                {opt.text}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-3 text-right text-[0.6rem] tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)] opacity-50">
          ESC PARA TERMINAR LA CONVERSACIÓN
        </p>
      </div>
    </div>
  );
}
