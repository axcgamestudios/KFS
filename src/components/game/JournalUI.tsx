'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi, type QuestView } from '@/game/api';
import type { JournalEntry } from '@/game/systems/GameState';
import { BookOpen, Compass, ScrollText, X } from 'lucide-react';

type Tab = 'misiones' | 'exploracion' | 'historia';

export default function JournalUI() {
  const close = useGameStore((s) => s.closeOverlay);
  const [tab, setTab] = useState<Tab>('misiones');
  const [data, setData] = useState(() => ({
    quests: gameApi.quests(),
    journal: gameApi.journal(),
  }));

  // Reload when switching tabs (user interaction, not effect)
  const switchTab = (t: Tab) => {
    setTab(t);
    setData({ quests: gameApi.quests(), journal: gameApi.journal() });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        close();
        gameApi.clickResumeHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const quests = data.quests;
  const journal = data.journal;
  const discoveries = journal.filter((e) => e.kind === 'discovery');
  const story = journal.filter((e) => e.kind === 'story');

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
      <div className="kotfs-panel kotfs-panel-corner flex h-full w-full max-w-3xl flex-col p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kotfs-title text-lg tracking-[0.25em] text-[color:var(--kotfs-gold)]">
            DIARIO DEL EXPLORADOR
          </h2>
          <button
            className="text-[color:var(--kotfs-parchment-dim)] transition hover:text-[color:var(--kotfs-parchment)]"
            onClick={() => {
              close();
              gameApi.clickResumeHint();
            }}
          >
            <X size={20} />
          </button>
        </div>
        <hr className="kotfs-hr mb-4" />

        {/* Tabs */}
        <div className="mb-4 flex gap-2">
          {(
            [
              ['misiones', 'Misiones', BookOpen],
              ['exploracion', `Exploración (${discoveries.length})`, Compass],
              ['historia', 'Crónica', ScrollText],
            ] as Array<[Tab, string, typeof BookOpen]>
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`flex items-center gap-2 border px-4 py-2 text-xs tracking-[0.15em] transition ${
                tab === id
                  ? 'border-[color:var(--kotfs-gold)] bg-[rgba(201,162,39,0.12)] text-[color:var(--kotfs-parchment)]'
                  : 'border-[color:rgba(201,162,39,0.25)] text-[color:var(--kotfs-parchment-dim)] hover:border-[color:var(--kotfs-gold)]'
              }`}
            >
              <Icon size={13} />
              <span className="kotfs-title">{label}</span>
            </button>
          ))}
        </div>

        <div className="kotfs-scroll flex-1 overflow-y-auto pr-2">
          {tab === 'misiones' && (
            <div className="space-y-4">
              {quests.length === 0 && (
                <p className="py-10 text-center italic text-[color:var(--kotfs-parchment-dim)]">
                  Aún no tienes misiones. Habla con la gente de Puerto Cuervo…
                </p>
              )}
              {quests.map((q) => (
                <div key={q.id} className="border border-[color:rgba(201,162,39,0.2)] bg-black/25 p-4">
                  <div className="mb-1 flex items-baseline justify-between">
                    <h3 className="kotfs-title text-sm text-[color:var(--kotfs-parchment)]">
                      {q.title}
                    </h3>
                    <span
                      className={`kotfs-title text-[0.6rem] tracking-[0.2em] ${
                        q.status === 'completed'
                          ? 'text-[color:#9cc168]'
                          : 'text-[color:var(--kotfs-gold)]'
                      }`}
                    >
                      {q.status === 'completed' ? 'COMPLETADA' : 'ACTIVA'}
                    </span>
                  </div>
                  <p className="mb-3 text-sm italic leading-relaxed text-[color:var(--kotfs-parchment-dim)]">
                    {q.description}
                  </p>
                  <ul className="space-y-1">
                    {q.objectives.map((o, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className={o.done ? 'text-[#9cc168]' : 'text-[color:var(--kotfs-gold)]'}>
                          {o.done ? '✓' : '◇'}
                        </span>
                        <span className={o.done ? 'text-[color:var(--kotfs-parchment-dim)] line-through opacity-60' : 'text-[color:var(--kotfs-parchment)]'}>
                          {o.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {tab === 'exploracion' && (
            <div className="space-y-4">
              {discoveries.length === 0 && (
                <p className="py-10 text-center italic text-[color:var(--kotfs-parchment-dim)]">
                  Ningún lugar descubierto todavía. Sal del camino y mira hacia el horizonte.
                </p>
              )}
              {discoveries.map((d) => (
                <div key={d.id} className="border-l-2 border-[color:var(--kotfs-gold)] bg-black/25 p-4">
                  <h3 className="kotfs-title text-sm text-[color:var(--kotfs-gold)]">{d.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--kotfs-parchment-dim)]">
                    {d.text}
                  </p>
                </div>
              ))}
            </div>
          )}

          {tab === 'historia' && (
            <div className="space-y-4">
              {story.length === 0 && (
                <p className="py-10 text-center italic text-[color:var(--kotfs-parchment-dim)]">
                  Tu crónica está en blanco. La tinta espera acontecimientos.
                </p>
              )}
              {story.map((s) => (
                <div key={s.id} className="border-l-2 border-[color:#8a2f2f] bg-black/25 p-4">
                  <h3 className="kotfs-title text-sm text-[color:var(--kotfs-parchment)]">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--kotfs-parchment-dim)]">
                    {s.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[0.6rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-50">
          J / ESC PARA CERRAR
        </p>
      </div>
    </div>
  );
}
