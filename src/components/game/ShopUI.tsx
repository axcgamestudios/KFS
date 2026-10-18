'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { ITEMS } from '@/game/data/items';
import {
  Coins, Feather, Flame, Layers, Package, Shield, Shirt, Sword, X, Zap,
} from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  Feather, Layers, Shield, Shirt, Sword, Package, Flame, Zap, Coins,
};

/**
 * Fase 16 — SISTEMA DE COMERCIANTES: the merchant panel.
 * Fase 28 — EL VIAJERO: vendors with a buyers' list get a second tab
 * ("HE BUYS") — the sell side of the economy. Sells go through
 * gameApi.sellShopItem, which re-validates the entry + the stock on the
 * game side; buys still go through buyShopItem.
 */
export default function ShopUI() {
  const shop = useGameStore((s) => s.shop);
  const setShop = useGameStore((s) => s.setShop);

  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  /** Fase 28 — active tab; the dialogue can preselect the sell tab. */
  const [tab, setTab] = useState<'wares' | 'sells'>('wares');
  useEffect(() => {
    setTab(shop?.tab === 'sells' ? 'sells' : 'wares');
  }, [shop]);

  const catalog = useMemo(() => (shop ? gameApi.shopCatalog(shop.vendor) : null), [shop, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        setShop(null);
        gameApi.clickResumeHint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShop]);

  if (!shop || !catalog) return null;

  const close_ = () => {
    setShop(null);
    gameApi.clickResumeHint();
  };

  const hasSells = !!catalog.buys && catalog.buys.length > 0;
  const sells = [...(catalog.buys ?? [])];
  if (tab === 'sells') {
    // what you actually carry floats to the top (stable within groups)
    sells.sort((a, b) => (b.have > 0 ? 1 : 0) - (a.have > 0 ? 1 : 0));
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="kotfs-panel kotfs-panel-corner w-full max-w-3xl p-6">
        {/* header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="kotfs-title text-lg tracking-[0.2em] text-[color:var(--kotfs-gold)]">
              {catalog.name.toUpperCase()} — {catalog.title.toUpperCase()}
            </h2>
            <p className="mt-1 text-[0.65rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
              {catalog.levelOk
                ? `LEVEL ${catalog.level} · REQUIRES ${catalog.minLevel}+`
                : `REQUIRES LEVEL ${catalog.minLevel} (you are level ${catalog.level})`}
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

        {/* Fase 28 — the tabs (only when the vendor buys) */}
        {hasSells && (
          <div className="mb-3 flex items-center gap-2">
            <button
              className={`kotfs-btn !px-3 !py-1 text-[0.62rem] ${tab === 'wares' ? '' : 'opacity-40'}`}
              onClick={() => setTab('wares')}
            >
              HIS WARES
            </button>
            <button
              className={`kotfs-btn !px-3 !py-1 text-[0.62rem] ${tab === 'sells' ? '' : 'opacity-40'}`}
              onClick={() => setTab('sells')}
            >
              HE BUYS
            </button>
          </div>
        )}

        {/* level gate (should not happen: the dialogue never opens the shop
            below the level, but the panel defends itself anyway) */}
        {!catalog.levelOk ? (
          <p className="py-12 text-center italic text-[color:var(--kotfs-parchment-dim)]">
            Come back when you are stronger.
          </p>
        ) : tab === 'sells' && hasSells ? (
          /* ---------------- THE SELL TAB (Fase 28) ---------------- */
          <div className="kotfs-scroll grid max-h-[56vh] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
            {sells.map((e) => {
              const Icon = ICONS[ITEMS[e.id]?.icon ?? 'Package'] ?? Package;
              const none = e.have === 0;
              return (
                <div
                  key={e.id}
                  className={`relative flex gap-3 border p-3 ${
                    none
                      ? 'border-[color:rgba(120,120,120,0.2)] bg-black/20'
                      : 'border-[color:rgba(201,162,39,0.4)] bg-black/30 hover:border-[color:var(--kotfs-gold)]'
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center border border-[color:rgba(201,162,39,0.25)] bg-black/40 ${
                      e.rarity === 'legendary'
                        ? 'kotfs-rarity-legendary'
                        : e.rarity === 'rare'
                          ? 'kotfs-rarity-rare'
                          : ''
                    }`}
                  >
                    <Icon
                      size={24}
                      className={e.rarity === 'legendary' ? 'kotfs-rarity-legendary' : e.rarity === 'rare' ? 'kotfs-rarity-rare' : 'text-[color:var(--kotfs-parchment-dim)]'}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3
                        className={`kotfs-title truncate text-[0.8rem] ${
                          e.rarity === 'legendary'
                            ? 'kotfs-rarity-legendary'
                            : e.rarity === 'rare'
                              ? 'kotfs-rarity-rare'
                              : 'text-[color:var(--kotfs-parchment)]'
                        }`}
                      >
                        {e.name}
                      </h3>
                      <span className="kotfs-title flex shrink-0 items-center gap-1 text-[0.75rem] text-[color:var(--kotfs-gold)]">
                        <Coins size={12} /> {e.price}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[0.6rem] tracking-wide text-[color:var(--kotfs-parchment-dim)]">
                      in your satchel: <span className={`tabular-nums ${none ? 'text-[color:rgb(200,120,100)]' : 'text-[color:rgb(150,200,150)]'}`}>{e.have}</span>
                    </p>
                    <p className="kotfs-scroll mt-1 max-h-16 overflow-y-auto text-[0.68rem] leading-snug text-[color:var(--kotfs-parchment-dim)]">
                      {e.note ?? e.desc}
                    </p>
                    <div className="mt-2">
                      <button
                        className={`kotfs-btn !px-3 !py-1 text-[0.65rem] ${none ? 'opacity-40' : ''}`}
                        disabled={none}
                        onClick={() => {
                          gameApi.sellShopItem(shop.vendor, e.id);
                          refresh();
                        }}
                      >
                        {none ? 'none carried' : `Sell one · ${e.price}`}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ---------------- THE WARES TAB (original) ---------------- */
          <div className="kotfs-scroll grid max-h-[56vh] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
            {catalog.entries.map((e) => {
              const Icon = ICONS[ITEMS[e.id]?.icon ?? 'Package'] ?? Package;
              const owned = e.owned;
              const canBuy = e.canAfford && !owned;
              return (
                <div
                  key={e.id}
                  className={`relative flex gap-3 border p-3 ${
                    owned
                      ? 'border-[color:rgba(120,190,120,0.35)] bg-black/30'
                      : 'border-[color:rgba(201,162,39,0.25)] bg-black/30 hover:border-[color:var(--kotfs-gold)]'
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center border border-[color:rgba(201,162,39,0.25)] bg-black/40 ${
                      e.rarity === 'legendary'
                        ? 'kotfs-rarity-legendary'
                        : e.rarity === 'rare'
                          ? 'kotfs-rarity-rare'
                          : ''
                    }`}
                  >
                    <Icon size={24} className={e.rarity === 'legendary' ? 'kotfs-rarity-legendary' : e.rarity === 'rare' ? 'kotfs-rarity-rare' : 'text-[color:var(--kotfs-parchment-dim)]'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3
                        className={`kotfs-title truncate text-[0.8rem] ${
                          e.rarity === 'legendary'
                            ? 'kotfs-rarity-legendary'
                            : e.rarity === 'rare'
                              ? 'kotfs-rarity-rare'
                              : 'text-[color:var(--kotfs-parchment)]'
                        }`}
                      >
                        {e.name}
                      </h3>
                      <span className="kotfs-title flex shrink-0 items-center gap-1 text-[0.75rem] text-[color:var(--kotfs-gold)]">
                        {(e.qty ?? 1) > 1 && <span className="text-[0.6rem] text-[color:var(--kotfs-parchment-dim)]">×{e.qty}</span>}
                        <Coins size={12} /> {e.price}
                      </span>
                    </div>
                    {e.stats && (
                      <p className="mt-0.5 text-[0.6rem] tracking-wide text-[color:var(--kotfs-gold)] opacity-80">
                        {e.stats}
                      </p>
                    )}
                    <p className="kotfs-scroll mt-1 max-h-16 overflow-y-auto text-[0.68rem] leading-snug text-[color:var(--kotfs-parchment-dim)]">
                      {e.note ?? e.desc}
                    </p>
                    <div className="mt-2">
                      {owned ? (
                        <span className="text-[0.6rem] tracking-[0.25em] text-[color:rgb(140,190,140)]">
                          IN YOUR SATCHEL — EQUIP FROM THE INVENTORY (TAB)
                        </span>
                      ) : (
                        <button
                          className={`kotfs-btn !px-3 !py-1 text-[0.65rem] ${canBuy ? '' : 'opacity-40'}`}
                          disabled={!canBuy}
                          onClick={() => {
                            gameApi.buyShopItem(shop.vendor, e.id);
                            refresh();
                          }}
                        >
                          {canBuy ? 'Buy' : 'Not enough gold'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-center text-[0.6rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-50">
          ESC TO CLOSE · GOLD WEIGHS MORE THAN PROMISES
        </p>
      </div>
    </div>
  );
}
