'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { Crown, ScrollText } from 'lucide-react';

/**
 * Fase 10 — CINEMATIC dialogue: letterbox bars slide in, the speaker gets a
 * gold nameplate with an animated rule, the text arrives letter-by-letter
 * with soft voice blips, and the options stagger in as engraved rows.
 * Simple, readable, premium — no more generic grey box.
 */

const CHAR_MS = 22;      // typing speed
const BLIP_EVERY = 5;    // voice blip cadence (characters)

export default function DialogueBox() {
  const dialogue = useGameStore((s) => s.dialogue);

  // Typewriter state — { text, typed }. When a new line arrives we reset
  // DURING RENDER (React's sanctioned "adjust state on prop change" pattern)
  // so no effect ever calls setState synchronously.
  const [tw, setTw] = useState({ text: '', typed: 0 });
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);

  let typed = tw.typed;
  let typingDone = true;
  if (dialogue) {
    if (tw.text !== dialogue.text) {
      typed = 0;
      typingDone = false;
      setTw({ text: dialogue.text, typed: 0 });
    } else {
      typingDone = tw.typed >= dialogue.text.length;
    }
  }

  // The reveal clock: only lives while the current line is still typing
  useEffect(() => {
    if (!dialogue || typingDone) return;
    let i = 0;
    ivRef.current = setInterval(() => {
      i += 1;
      setTw({ text: dialogue.text, typed: i });
      if (i % BLIP_EVERY === 0) gameApi.narrationBlip();
      if (i >= dialogue.text.length && ivRef.current) {
        clearInterval(ivRef.current);
        ivRef.current = null;
      }
    }, CHAR_MS);
    return () => {
      if (ivRef.current) clearInterval(ivRef.current);
      ivRef.current = null;
    };
  }, [dialogue, typingDone]);

  // Keyboard: ESC closes, 1-9 pick options, SPACE/ENTER completes the line
  useEffect(() => {
    if (!dialogue) return;
    const onKey = (e: KeyboardEvent) => {
      if (!dialogue) return;
      if (e.code === 'Escape') {
        gameApi.closeDialogue();
        gameApi.clickResumeHint();
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        if (tw.typed < dialogue.text.length) {
          // reveal the whole line at once
          if (ivRef.current) clearInterval(ivRef.current);
          ivRef.current = null;
          setTw({ text: dialogue.text, typed: dialogue.text.length });
        }
        return;
      }
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= dialogue.options.length) {
        gameApi.chooseDialogue(num - 1);
        setTimeout(() => {
          if (!useGameStore.getState().dialogue) gameApi.clickResumeHint();
        }, 30);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogue, tw]);

  if (!dialogue) return null;

  const shown = typingDone ? dialogue.text : dialogue.text.slice(0, typed);
  const isNarrator = dialogue.isNarrator;

  const completeLine = () => {
    if (!typingDone) {
      if (ivRef.current) clearInterval(ivRef.current);
      ivRef.current = null;
      setTw({ text: dialogue.text, typed: dialogue.text.length });
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center pb-[7vh]">
      {/* Cinematic backdrop: soft vignette instead of a flat curtain */}
      <div
        className="absolute inset-0 bg-black/25"
        style={{ background: 'radial-gradient(ellipse at 50% 38%, rgba(0,0,0,0.14), rgba(0,0,0,0.62) 100%)' }}
      />

      {/* Letterbox bars — a whisper of film while talking */}
      <div className="kfs-dlg-bar pointer-events-none absolute inset-x-0 top-0 h-[6.5vh] bg-black/85" />
      <div className="kfs-dlg-bar pointer-events-none absolute inset-x-0 bottom-0 h-[6.5vh] bg-black/85" style={{ animationDirection: 'reverse' }} />

      <div
        className="kfs-dlg relative z-10 w-full max-w-3xl px-8 py-6"
        onClick={completeLine}
      >
        {/* Speaker nameplate */}
        <div className="mb-1.5 flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 items-center justify-center border border-[rgba(201,162,39,0.5)] bg-[rgba(201,162,39,0.1)]"
            style={{ transform: 'rotate(45deg)' }}
          >
            <span style={{ transform: 'rotate(-45deg)' }} className="text-[color:var(--kotfs-gold)]">
              {isNarrator ? <ScrollText size={13} /> : <Crown size={13} />}
            </span>
          </span>
          <h3
            className={`kfs-dlg-name kotfs-title text-sm tracking-[0.24em] ${
              isNarrator ? 'italic text-[color:var(--kotfs-gold)]' : 'text-[color:var(--kotfs-gold)]'
            }`}
          >
            {dialogue.npcName}
          </h3>
        </div>
        <div className="kfs-dlg-rule mb-4 w-2/3" />

        {/* Text with typewriter reveal */}
        <p className="mb-5 min-h-[3.5rem] text-base leading-relaxed text-[color:var(--kotfs-parchment)] md:text-lg">
          {shown}
          {!typingDone && (
            <span className="kfs-dlg-caret ml-0.5 inline-block text-[color:var(--kotfs-gold)]">▌</span>
          )}
        </p>

        {/* Options — staggered engraved rows */}
        <div className="flex flex-col gap-1.5">
          {dialogue.options.map((opt, i) => (
            <button
              key={opt.index}
              className="kfs-dlg-opt group flex items-center gap-3 border border-transparent px-3 py-2 text-left"
              style={{ animationDelay: `${0.32 + i * 0.09}s` }}
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

        {/* Footer hint + continue arrow */}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[0.58rem] tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)] opacity-45">
            ESC PARA TERMINAR
          </p>
          {typingDone ? (
            <span className="kfs-dlg-caret text-[color:var(--kotfs-gold)] opacity-80">▼</span>
          ) : (
            <span className="text-[0.58rem] tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)] opacity-45">
              CLIC PARA COMPLETAR
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
