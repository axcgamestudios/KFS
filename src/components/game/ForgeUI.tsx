'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import {
  Boxes, CircleDashed, Coins, Crown, Droplets, Drumstick, Flame, Grab, Hammer,
  Heart, Layers, Moon, Package, Scissors, Shell, Shield, ShieldCheck, Shirt,
  Square, Sun, Swords, Sword, X, Zap,
} from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  Coins, Hammer, Boxes, Layers, Shield, ShieldCheck, Shirt, Sword, Swords, Package,
  Flame, Zap, Sun, Moon, Heart, Square, Crown, Droplets, Grab, Drumstick, Shell,
  Scissors, CircleDashed,
};

const RARITY_CLS = (r: string): string =>
  r === 'legendary' ? 'kotfs-rarity-legendary' : r === 'rare' ? 'kotfs-rarity-rare' : 'text-[color:var(--kotfs-parchment)]';

/**
 * Fase 22 — THE FORGE OF LEGENDS: the crafting panel.
 * Opened at a station (Great Anvil / Altar of the Gods / Anvil of the
 * Titans); ESC or the X closes it and hands control back. Crafts go through
 * gameApi.forgeCraft, which re-validates materials + gold + gates on the
 * game side (the UI is never trusted).
 */
export default function ForgeUI() {
  const forge = useGameStore((s) => s.forge);
  const setForge = useGameStore((s) => s.setForge);

  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const catalog = useMemo(
    () => (forge ? gameApi.forgeCatalog(forge.station) : null),
    [forge, tick],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        setForge(null);
        gameApi.clickResumeHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setForge]);

  if (!forge || !catalog) return null;

  const close_ = () => {
    setForge(null);
    gameApi.clickResumeHint();
  };

  const summon = () => {
    gameApi.summonEclipse();
    refresh();
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

        {/* the eclipse banner — Altar of the Gods only */}
        {catalog.station === 'altar' && (
          <div
            className={`mb-4 border p-3 ${
              catalog.eclipse.active
                ? 'border-[color:rgba(255,140,60,0.55)] bg-[color:rgba(60,20,5,0.5)]'
                : 'border-[color:rgba(201,162,39,0.25)] bg-black/30'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="kotfs-title flex items-center gap-2 text-[0.8rem] text-[color:var(--kotfs-gold)]">
                  <Sun size={15} /> {catalog.eclipse.active ? 'THE ECLIPSE HOLDS' : 'THE SKY IS CLEAR'}
                </h3>
                <p className="mt-1 text-[0.66rem] leading-snug text-[color:var(--kotfs-parchment-dim)]">
                  {catalog.eclipse.hasEssence
                    ? catalog.eclipse.active
                      ? `Apollo's Bow may be strung while the ring of fire lasts — ${catalog.eclipse.left}s remain.`
                      : 'Present the Primal Sun Essence and the sun will close its eye for four minutes.'
                    : 'The lighthouse keepers kept a bead of the first morning. Find the First Light cache in the old lighthouse ruins.'}
                </p>
              </div>
              <button
                className={`kotfs-btn !px-3 !py-1.5 shrink-0 text-[0.65rem] ${catalog.eclipse.canSummon ? '' : 'opacity-40'}`}
                disabled={!catalog.eclipse.canSummon}
                onClick={summon}
              >
                {catalog.eclipse.active ? 'EXTEND THE OMEN' : 'SUMMON THE ECLIPSE'}
              </button>
            </div>
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
                  <OutIcon
                    size={24}
                    className={RARITY_CLS(r.outRarity)}
                  />
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
                  {r.level > 0 && (
                    <p
                      className={`mt-0.5 text-[0.6rem] tracking-wide ${
                        r.levelOk ? 'text-[color:var(--kotfs-gold)] opacity-80' : 'text-[color:rgb(200,110,90)]'
                      }`}
                    >
                      REQUIRES LEVEL {r.level} TO EQUIP{r.levelOk ? '' : ' (you may forge it anyway)'}
                    </p>
                  )}
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
                        gameApi.forgeCraft(catalog.station, r.id);
                        refresh();
                      }}
                    >
                      {r.status === 'gate'
                        ? 'REQUIRES THE ECLIPSE'
                        : r.status === 'materials'
                          ? 'MATERIALS MISSING'
                          : r.status === 'gold'
                            ? 'NOT ENOUGH GOLD'
                            : 'FORGE IT'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-center text-[0.6rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-50">
          ESC TO CLOSE · THE FORGE DOES NOT CHECK YOUR BIRTH CERTIFICATE
        </p>
      </div>
    </div>
  );
}
