'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { ITEMS } from '@/game/data/items';
import {
  Coins, Package, ShieldCheck, Star, X, Flame, Handshake, ScrollText, Weight, Droplets,
  ShoppingBag, Undo2, Dices, MapPin, Sparkles,
} from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  Coins, Package, ShieldCheck, Flame, Weight, Droplets, ShoppingBag, Sparkles,
};

type Tab = 'supplies' | 'sell' | 'relics';

/**
 * Fase 28 — EL VIAJERO: the wandering merchant's trade panel.
 * Three tabs: SUPPLIES (basics + the Offer of the Day) · SELL & DEMAND
 * (rates, the wanted materials, favorites-lock, buyback) · RELICS (the
 * gambling coffers). All transactions re-validate on the game side.
 */
export default function TravelerUI() {
  const traveler = useGameStore((s) => s.traveler);
  const setTraveler = useGameStore((s) => s.setTraveler);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [flash, setFlash] = useState<string | null>(null);

  const cat = useMemo(() => (traveler ? gameApi.travelerCatalog() : null), [traveler, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        setTraveler(null);
        gameApi.clickResumeHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTraveler]);

  if (!traveler || !cat || !cat.present) return null;

  const close_ = () => {
    setTraveler(null);
    gameApi.clickResumeHint();
  };
  const tab = (traveler.tab as Tab) ?? 'supplies';
  const setTab = (t: Tab) => setTraveler({ tab: t });

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="kotfs-panel kotfs-panel-corner w-full max-w-4xl p-6">
        {/* header */}
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="kotfs-title text-lg tracking-[0.2em] text-[color:var(--kotfs-gold)]">
              EL VIAJERO — GUILD OF TRADERS
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[0.65rem] tracking-[0.18em] text-[color:var(--kotfs-parchment-dim)]">
              <span className="flex items-center gap-1"><MapPin size={11} /> {cat.camp}</span>
              <span className="flex items-center gap-1"><Coins size={11} /> {cat.coins}</span>
              <span className="flex items-center gap-1">HIS PURSE: {cat.budget}</span>
              <span className="flex items-center gap-1">
                <Star size={11} className="text-[color:var(--kotfs-gold)]" /> {cat.reputation}
              </span>
              {cat.discount > 0 && (
                <span className="kotfs-title text-[color:var(--kotfs-gold)]">−{Math.round(cat.discount * 100)}% DISCOUNT</span>
              )}
            </p>
          </div>
          <button
            className="text-[color:var(--kotfs-parchment-dim)] transition hover:text-[color:var(--kotfs-parchment)]"
            onClick={close_}
          >
            <X size={20} />
          </button>
        </div>

        {/* the wanted materials */}
        <div className="mb-3 flex flex-wrap items-center gap-2 border border-[color:rgba(201,162,39,0.25)] bg-black/30 p-2">
          <span className="kotfs-title flex items-center gap-1 text-[0.65rem] tracking-[0.2em] text-[color:var(--kotfs-gold)]">
            <Handshake size={13} /> DEMAND OF THE DAY:
          </span>
          {cat.demand.map((d) => {
            const it = ITEMS[d.id];
            const Icon = ICONS[it?.icon ?? 'Package'] ?? Package;
            return (
              <span
                key={d.id}
                className="flex items-center gap-1 border border-[color:rgba(201,162,39,0.35)] px-2 py-0.5 text-[0.62rem] text-[color:var(--kotfs-parchment)]"
              >
                <Icon size={12} className="text-[color:var(--kotfs-gold)]" /> {it?.name ?? d.id}
                <span className="text-[color:var(--kotfs-gold)]">+50%</span>
              </span>
            );
          })}
          <span className="ml-auto text-[0.58rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)] opacity-70">
            HIS PURSE RUNS DRY → PAYS IN REPUTATION
          </span>
        </div>

        {/* tabs */}
        <div className="mb-3 flex gap-2">
          {([['supplies', 'SUPPLIES'], ['sell', 'SELL & BUYBACK'], ['relics', 'UNIDENTIFIED RELICS']] as Array<[Tab, string]>).map(([id, label]) => (
            <button
              key={id}
              className={`kotfs-btn !px-4 !py-1 text-[0.65rem] ${tab === id ? '!border-[color:var(--kotfs-gold)] text-[color:var(--kotfs-gold)]' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <hr className="kotfs-hr mb-4" />

        {/* the ambush posture banner */}
        {cat.ambush?.active && (
          <div className="mb-3 border border-[color:rgba(190,80,60,0.5)] bg-black/40 p-2">
            <p className="kotfs-title text-[0.7rem] tracking-[0.2em] text-[#e08a6a]">
              ATTACK ON THE ROAD — POSTURE {cat.ambush.posture}/100 · {cat.ambush.count} HOSTILES STANDING
            </p>
            <div className="mt-1 h-2 w-full bg-black/60">
              <div className="h-full bg-[#c9a227]" style={{ width: `${Math.round(cat.ambush.postureFrac * 100)}%` }} />
            </div>
            <p className="mt-1 text-[0.6rem] text-[color:var(--kotfs-parchment-dim)]">
              Clear them before the bar empties, or he flees and the visit is cancelled.
            </p>
          </div>
        )}

        {flash && <p className="mb-2 text-center text-[0.65rem] text-[color:var(--kotfs-gold)]">{flash}</p>}

        {/* ---------------------------------------------- tab: supplies */}
        {tab === 'supplies' && (
          <div className="kotfs-scroll grid max-h-[46vh] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
            {cat.stock.map((s) => {
              const it = ITEMS[s.id];
              const Icon = ICONS[it?.icon ?? 'Package'] ?? Package;
              const soldOut = s.stock <= 0;
              const infinite = s.stock === Infinity;
              return (
                <div
                  key={s.id}
                  className={`relative flex gap-3 border p-3 ${
                    s.offer
                      ? 'border-[color:rgba(201,162,39,0.5)] bg-black/30'
                      : 'border-[color:rgba(201,162,39,0.25)] bg-black/30'
                  } ${soldOut ? 'opacity-40' : 'hover:border-[color:var(--kotfs-gold)]'}`}
                >
                  {s.offer && (
                    <span className="kotfs-title absolute right-2 top-2 text-[0.55rem] tracking-[0.2em] text-[color:var(--kotfs-gold)]">
                      OFFER OF THE DAY
                    </span>
                  )}
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center border border-[color:rgba(201,162,39,0.25)] bg-black/40 ${it?.rarity === 'legendary' ? 'kotfs-rarity-legendary' : it?.rarity === 'rare' ? 'kotfs-rarity-rare' : ''}`}>
                    <Icon size={24} className={it?.rarity === 'legendary' ? 'kotfs-rarity-legendary' : it?.rarity === 'rare' ? 'kotfs-rarity-rare' : 'text-[color:var(--kotfs-parchment-dim)]'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="kotfs-title truncate text-[0.8rem] text-[color:var(--kotfs-parchment)]">{it?.name ?? s.id}</h3>
                      <span className="kotfs-title flex shrink-0 items-center gap-1 text-[0.75rem] text-[color:var(--kotfs-gold)]">
                        {s.qty > 1 && <span className="text-[0.6rem] text-[color:var(--kotfs-parchment-dim)]">×{s.qty}</span>}
                        <Coins size={12} /> {s.price}
                      </span>
                    </div>
                    <p className="kotfs-scroll mt-1 max-h-16 overflow-y-auto text-[0.68rem] leading-snug text-[color:var(--kotfs-parchment-dim)]">
                      {s.note ?? it?.desc}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        className={`kotfs-btn !px-3 !py-1 text-[0.65rem] ${soldOut ? 'opacity-40' : ''}`}
                        disabled={soldOut}
                        onClick={() => {
                          const r = gameApi.travelerBuy(s.id);
                          setFlash(r === 'ok' ? null : r === 'gold' ? 'Not enough gold.' : 'Sold out.');
                          refresh();
                        }}
                      >
                        {soldOut ? 'Sold out' : 'Buy'}
                      </button>
                      <span className="text-[0.6rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
                        {infinite ? 'UNLIMITED' : `${s.stock} LEFT`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ---------------------------------------------- tab: sell & buyback */}
        {tab === 'sell' && (
          <div className="kotfs-scroll grid max-h-[46vh] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
            {cat.sells.length === 0 && (
              <p className="col-span-2 py-8 text-center italic text-[color:var(--kotfs-parchment-dim)]">
                Nothing he will take off you right now.
              </p>
            )}
            {cat.sells.map((s) => {
              const it = ITEMS[s.id];
              const Icon = ICONS[it?.icon ?? 'Package'] ?? Package;
              const fav = gameApi.isFavorite(s.id);
              const favDisabled = it?.kind === 'weapon' || it?.kind === 'armor' || it?.kind === 'wings';
              return (
                <div
                  key={s.id}
                  className={`flex gap-3 border p-3 ${
                    s.demand
                      ? 'border-[color:rgba(120,190,120,0.45)] bg-black/30'
                      : 'border-[color:rgba(201,162,39,0.25)] bg-black/30'
                  }`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-[color:rgba(201,162,39,0.25)] bg-black/40">
                    <Icon size={24} className={s.demand ? 'text-[#9ad89a]' : 'text-[color:var(--kotfs-parchment-dim)]'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="kotfs-title truncate text-[0.8rem] text-[color:var(--kotfs-parchment)]">
                        {it?.name ?? s.id}
                        {s.demand && <span className="ml-2 text-[0.6rem] text-[#9ad89a]">WANTED +50%</span>}
                      </h3>
                      <span className="kotfs-title flex shrink-0 items-center gap-1 text-[0.75rem] text-[color:var(--kotfs-gold)]">
                        ×{s.have} <Coins size={12} /> {s.priceEach}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.62rem] tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">{s.rate}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        className="kotfs-btn !px-3 !py-1 text-[0.65rem]"
                        onClick={() => {
                          const r = gameApi.travelerSell(s.id, 1);
                          setFlash(`Sold for ${r.paid} gold${r.credit > 0 ? ` + ${r.credit} reputation credit` : ''}.`);
                          refresh();
                        }}
                      >
                        Sell 1
                      </button>
                      {s.have > 1 && (
                        <button
                          className="kotfs-btn !px-3 !py-1 text-[0.65rem]"
                          onClick={() => {
                            const r = gameApi.travelerSell(s.id, s.have);
                            setFlash(`Sold ×${s.have} for ${r.paid} gold${r.credit > 0 ? ` + ${r.credit} reputation credit` : ''}.`);
                            refresh();
                          }}
                        >
                          Sell all
                        </button>
                      )}
                      {!favDisabled && (
                        <button
                          className={`ml-auto flex items-center gap-1 text-[0.6rem] tracking-[0.15em] ${fav ? 'text-[color:var(--kotfs-gold)]' : 'text-[color:var(--kotfs-parchment-dim)]'}`}
                          onClick={() => {
                            gameApi.toggleFavorite(s.id);
                            refresh();
                          }}
                        >
                          <Star size={12} /> {fav ? 'FAVORITE — LOCKED' : 'MARK FAVORITE'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* buyback */}
            <div className="col-span-2 mt-2">
              <p className="kotfs-title mb-2 flex items-center gap-2 text-[0.7rem] tracking-[0.2em] text-[color:var(--kotfs-gold)]">
                <Undo2 size={13} /> BUYBACK — THE LAST TEN, AT THE PRICE HE PAID
              </p>
              {cat.buyback.length === 0 && (
                <p className="text-[0.62rem] italic text-[color:var(--kotfs-parchment-dim)]">Nothing sold yet this visit.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {cat.buyback.map((b, i) => {
                  const it = ITEMS[b.id];
                  return (
                    <button
                      key={`${b.id}_${i}`}
                      className="flex items-center gap-2 border border-[color:rgba(201,162,39,0.3)] bg-black/30 px-3 py-1 text-[0.65rem] text-[color:var(--kotfs-parchment)] hover:border-[color:var(--kotfs-gold)]"
                      onClick={() => {
                        const r = gameApi.travelerBuyback(i);
                        setFlash(r === 'ok' ? 'Recovered.' : r === 'gold' ? 'Not enough gold.' : 'Gone.');
                        refresh();
                      }}
                    >
                  <span className="text-[color:var(--kotfs-parchment-dim)]">{it?.name ?? b.id} ×{b.count}</span>
                  <span className="kotfs-title flex items-center gap-1 text-[color:var(--kotfs-gold)]"><Coins size={11} /> {b.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------- tab: relics */}
        {tab === 'relics' && (
          <div className="max-h-[46vh] overflow-y-auto kotfs-scroll">
            <div className="mx-auto max-w-xl border border-[color:rgba(201,162,39,0.35)] bg-black/30 p-6 text-center">
              <ScrollText size={36} className="mx-auto mb-3 text-[color:var(--kotfs-gold)]" />
              <h3 className="kotfs-title text-[0.9rem] tracking-[0.2em] text-[color:var(--kotfs-gold)]">
                UNIDENTIFIED RELICS
              </h3>
              <p className="mt-2 text-[0.68rem] leading-snug text-[color:var(--kotfs-parchment-dim)]">
                Sealed coffers from a caravan that will not say where it has been. The Guild prices them by
                what you can pay: <span className="text-[color:var(--kotfs-gold)]">{cat.relicCost} gold</span> a piece.
              </p>
              <ul className="mx-auto mt-3 max-w-sm space-y-1 text-left text-[0.62rem] tracking-wide text-[color:var(--kotfs-parchment-dim)]">
                <li>· 50% — common / uncommon goods</li>
                <li>· 35% — advanced crafting material</li>
                <li>· 12% — a piece of epic gear</li>
                <li>· 3% — mythic material of the bosses</li>
              </ul>
              <button
                className="kotfs-btn mt-4 flex items-center gap-2 !px-5 !py-2 text-[0.7rem]"
                onClick={() => {
                  const r = gameApi.travelerRelic();
                  if (!r.ok) setFlash('Not enough gold.');
                  else setFlash(`The seal breaks: ${r.tier} — ${ITEMS[r.got]?.name ?? r.got}.`);
                  refresh();
                }}
              >
                <Dices size={14} /> BUY A SEALED COFFER — {cat.relicCost}
              </button>
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-[0.6rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-50">
          ESC TO CLOSE · THE GUILD REMEMBERS WHO CARRIES WEIGHT
        </p>
      </div>
    </div>
  );
}
