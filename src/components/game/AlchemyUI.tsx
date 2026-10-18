'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import {
  Activity, Atom, CircleDot, Coins, Droplets, Dumbbell, Feather, Flame, FlaskConical,
  FlaskRound, Gem, Heart, Leaf, Mountain, Package, Shield, Sparkles, TestTubes, Wind, X,
} from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  Coins, Package, Heart, FlaskRound, Droplets, Dumbbell, Shield, Wind, Activity,
  FlaskConical, Flame, Leaf, Mountain, Sparkles, Feather, Gem, Atom, TestTubes, CircleDot,
};

const RARITY_CLS = (r: string): string =>
  r === 'legendary' ? 'kotfs-rarity-legendary' : r === 'rare' ? 'kotfs-rarity-rare' : 'text-[color:var(--kotfs-parchment)]';

/**
 * Fase 28 — LA MESA DE ALQUIMIA: the brewing panel.
 * Opened at Maren's table west of the green; ESC or the X closes it and
 * hands control back. Brews go through gameApi.alchemyCraft, which
 * re-validates materials + gold on the game side (the UI is never trusted).
 */
export default function AlchemyUI() {
  const alchemy = useGameStore((s) => s.alchemy);
  const setAlchemy = useGameStore((s) => s.setAlchemy);

  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const catalog = useMemo(() => (alchemy ? gameApi.alchemyCatalog() : null), [alchemy, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        setAlchemy(null);
        gameApi.clickResumeHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setAlchemy]);

  if (!alchemy || !catalog) return null;

  const close_ = () => {
    setAlchemy(null);
    gameApi.clickResumeHint();
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="kotfs-panel kotfs-panel-corner w-full max-w-3xl p-6">
        {/* header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="kotfs-title text-lg tracking-[0.2em] text-[color:var(--kotfs-gold)]">
              {catalog.name.toUpperCase()}
            </h2>
            <p className="mt-1 text-[0.65rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
              {catalog.title.toUpperCase()} · LEVEL {catalog.level}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="kotfs-title flex items-center gap-1.5 text-sm text-[color:var(--kotfs-gold)]">
              <Coins size={16} /> {catalog.coins}
            </span>
            <button
              className="text-[color:var(--kotfs-parchment-dim)] transition hover:text-[color:var(--kotfs-parchment)]"
              onClick={close_}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <hr className="kotfs-hr mb-3" />
        <p className="mb-3 text-[0.7rem] italic leading-snug text-[color:var(--kotfs-parchment-dim)]">
          {catalog.greeting}
        </p>

        {/* the running windows — live strip above the recipes */}
        {catalog.effects.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 border border-[color:rgba(201,162,39,0.25)] bg-black/30 p-2">
            <span className="kotfs-title mr-1 text-[0.6rem] tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)]">
              RUNNING
            </span>
            {catalog.effects.map((e) => {
              const EIcon = ICONS[e.icon] ?? Sparkles;
              const frac = Math.max(0, Math.min(1, e.left / e.total));
              return (
                <span
                  key={e.id}
                  className="flex items-center gap-1.5 border border-[color:rgba(201,162,39,0.4)] bg-black/40 px-2 py-1"
                  title={`${e.name} — ${Math.ceil(e.left)}s`}
                >
                  <EIcon size={13} className="text-[color:var(--kotfs-gold)]" />
                  <span className="text-[0.62rem] text-[color:var(--kotfs-parchment)]">{e.name}</span>
                  <span className="kotfs-title tabular-nums text-[0.62rem] text-[color:var(--kotfs-gold)]">
                    {Math.ceil(e.left)}s
                  </span>
                  <span className="relative block h-1 w-10 bg-black/60">
                    <span
                      className="absolute inset-y-0 left-0 bg-[color:var(--kotfs-gold)]"
                      style={{ width: `${Math.round(frac * 100)}%` }}
                    />
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* recipes */}
        <div className="kotfs-scroll grid max-h-[52vh] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          {catalog.recipes.map((r) => {
            const OutIcon = ICONS[r.outIcon] ?? Package;
            return (
              <div
                key={r.id}
                className={`relative flex gap-3 border p-3 ${
                  r.canCraft
                    ? 'border-[color:rgba(201,162,39,0.4)] bg-black/30 hover:border-[color:var(--kotfs-gold)]'
                    : 'border-[color:rgba(120,120,120,0.25)] bg-black/30'
                }`}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center border border-[color:rgba(201,162,39,0.25)] bg-black/40 ${
                    r.outRarity === 'legendary' ? 'kotfs-rarity-legendary' : r.outRarity === 'rare' ? 'kotfs-rarity-rare' : ''
                  }`}
                >
                  <OutIcon size={24} className={RARITY_CLS(r.outRarity)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className={`kotfs-title truncate text-[0.8rem] ${RARITY_CLS(r.outRarity)}`}>
                      {r.outName}
                    </h3>
                    <span className="kotfs-title flex shrink-0 items-center gap-1 text-[0.75rem] text-[color:var(--kotfs-gold)]">
                      <Coins size={12} /> {r.gold}
                    </span>
                  </div>
                  {/* material checklist */}
                  <ul className="mt-1.5 space-y-0.5">
                    {r.mats.map((m) => {
                      const MatIcon = ICONS[m.icon] ?? Package;
                      const ok = m.have >= m.need;
                      return (
                        <li
                          key={m.id}
                          className={`flex items-center gap-1.5 text-[0.66rem] ${ok ? 'text-[color:rgb(150,200,150)]' : 'text-[color:rgb(200,120,100)]'}`}
                        >
                          <MatIcon size={11} />
                          <span className="truncate">{m.name}</span>
                          <span className="ml-auto shrink-0 tabular-nums">
                            {m.have}/{m.need}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="kotfs-scroll mt-1.5 max-h-14 overflow-y-auto text-[0.64rem] italic leading-snug text-[color:var(--kotfs-parchment-dim)]">
                    {r.note}
                  </p>
                  <div className="mt-2">
                    <button
                      className={`kotfs-btn !px-3 !py-1 text-[0.65rem] ${r.canCraft ? '' : 'opacity-40'}`}
                      disabled={!r.canCraft}
                      onClick={() => {
                        gameApi.alchemyCraft(r.id);
                        refresh();
                      }}
                    >
                      {r.status === 'materials'
                        ? 'MATERIALS MISSING'
                        : r.status === 'gold'
                          ? 'NOT ENOUGH GOLD'
                          : 'BREW IT'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-center text-[0.6rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-50">
          ESC TO CLOSE · DRINK NOTHING THAT HISSES
        </p>
      </div>
    </div>
  );
}
