'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { Lock, Sparkles, Swords, TentTree, Wind, X } from 'lucide-react';

const TREES = [
  { id: 'combate', name: 'Combat', icon: Swords, desc: 'The steel and the grit of the duelist.' },
  { id: 'supervivencia', name: 'Survival', icon: TentTree, desc: "The island's hard roads." },
  { id: 'navegacion', name: 'Navigation', icon: Wind, desc: 'The call of the open sea.' },
] as const;

export default function SkillsUI() {
  const close = useGameStore((s) => s.closeOverlay);
  const skillPoints = useGameStore((s) => s.skillPoints);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const xpToNext = useGameStore((s) => s.xpToNext);
  const [, force] = useState(0);

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

  const skills = gameApi.skills();

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
      <div className="kotfs-panel kotfs-panel-corner flex h-full w-full max-w-3xl flex-col p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="kotfs-title text-lg tracking-[0.25em] text-[color:var(--kotfs-gold)]">
            PATHS OF THE EXPLORER
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

        {/* Progression header */}
        <div className="mb-5 flex items-center gap-4 border border-[color:rgba(201,162,39,0.25)] bg-black/25 px-4 py-3">
          <div className="kotfs-title flex h-11 w-11 items-center justify-center border border-[color:var(--kotfs-gold)] text-lg text-[color:var(--kotfs-gold)]">
            {level}
          </div>
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-[0.65rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
              <span className="kotfs-title">LEVEL {level}</span>
              <span>
                {xp} / {xpToNext} XP
              </span>
            </div>
            <div className="kotfs-bar">
              <div
                className="kotfs-bar-fill"
                style={{ width: `${(xp / xpToNext) * 100}%`, background: 'linear-gradient(90deg,#6b5416,#c9a227,#e8cc6a)' }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-[color:var(--kotfs-gold)]" />
            <span className="kotfs-title text-sm text-[color:var(--kotfs-gold)]">
              {skillPoints} pts
            </span>
          </div>
        </div>

        {/* Skill trees */}
        <div className="kotfs-scroll grid flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 md:grid-cols-3">
          {TREES.map((tree) => {
            const treeSkills = skills.filter((s) => s.tree === tree.id);
            const treeLocked = tree.id === 'navegacion';
            return (
              <div
                key={tree.id}
                className={`border p-3 ${
                  treeLocked
                    ? 'border-[color:rgba(201,162,39,0.15)] bg-black/40'
                    : 'border-[color:rgba(201,162,39,0.25)] bg-black/25'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <tree.icon size={15} className="text-[color:var(--kotfs-gold)]" />
                  <h3 className="kotfs-title text-xs tracking-[0.2em] text-[color:var(--kotfs-parchment)]">
                    {tree.name.toUpperCase()}
                  </h3>
                </div>
                <p className="mb-3 text-[0.65rem] italic text-[color:var(--kotfs-parchment-dim)] opacity-70">
                  {tree.desc}
                </p>
                <div className="space-y-2">
                  {treeSkills.map((s) => {
                    const reqOk = !s.requires || s.requires.every((r) => skills.find((x) => x.id === r)?.learned);
                    return (
                      <button
                        key={s.id}
                        disabled={!s.canLearn}
                        onClick={() => {
                          gameApi.learnSkill(s.id);
                          force((x) => x + 1);
                        }}
                        className={`w-full border p-2.5 text-left transition ${
                          s.learned
                            ? 'border-[color:#9cc168] bg-[rgba(156,193,104,0.08)]'
                            : s.canLearn
                              ? 'border-[color:var(--kotfs-gold)] bg-black/30 hover:bg-[rgba(201,162,39,0.12)]'
                              : 'border-[color:rgba(201,162,39,0.15)] bg-black/30 opacity-55'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="kotfs-title text-[0.7rem] text-[color:var(--kotfs-parchment)]">
                            {s.name}
                          </span>
                          {s.learned ? (
                            <span className="text-[0.6rem] tracking-widest text-[#9cc168]">LEARNED</span>
                          ) : s.locked ? (
                            <Lock size={11} className="text-[color:var(--kotfs-parchment-dim)]" />
                          ) : s.canLearn ? (
                            <span className="text-[0.6rem] tracking-widest text-[color:var(--kotfs-gold)]">
                              +1 PT
                            </span>
                          ) : !reqOk ? (
                            <span className="text-[0.55rem] tracking-widest text-[color:var(--kotfs-parchment-dim)]">
                              REQUIRES PREVIOUS
                            </span>
                          ) : (
                            <span className="text-[0.55rem] tracking-widest text-[color:var(--kotfs-parchment-dim)]">
                              NO POINTS
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[0.68rem] leading-snug text-[color:var(--kotfs-parchment-dim)]">
                          {s.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-center text-[0.6rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-50">
          GAIN EXPERIENCE BY EXPLORING AND COMPLETING QUESTS · K / ESC TO CLOSE
        </p>
      </div>
    </div>
  );
}
