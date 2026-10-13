'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { Coins, Package, Skull, Ship, Handshake } from 'lucide-react';

/**
 * Fase 15 — PIRATE TOLL NEGOTIATION.
 *
 * When the ambush pirates kill the player or sink the ship there is no
 * permanent death: the corsairs deploy this interface. Two ways out —
 * hand over ONE random inventory item, or pay a fixed amount of gold.
 * With neither gold nor goods, the pirates leave out of pure pity.
 */
export default function NegotiationUI() {
  const negotiation = useGameStore((s) => s.negotiation);
  const [choice, setChoice] = useState<'item' | 'coins' | 'mercy' | null>(null);
  const [lastNegotiation, setLastNegotiation] = useState(negotiation);

  // Reset the pick when a NEW negotiation deploys — adjusted during render
  // (React's sanctioned "adjust state on prop change" pattern, no effect).
  let effectiveChoice = choice;
  if (lastNegotiation !== negotiation) {
    setLastNegotiation(negotiation);
    setChoice(null);
    effectiveChoice = null;
  }

  const tryPick = (opt: 'item' | 'coins' | 'mercy') => {
    if (!negotiation || effectiveChoice) return;
    if (opt === 'item' && !negotiation.hasItems) return;
    if (opt === 'coins' && !negotiation.canAfford) return;
    if (opt === 'mercy' && !(!negotiation.hasItems && !negotiation.canAfford)) return;
    setChoice(opt);
    // small beat so the player sees the pick land, then resolve
    setTimeout(() => gameApi.negotiateChoice(opt), 260);
  };

  // Keyboard: 1 = item, 2 = coins, 3 = mercy (when visible)
  useEffect(() => {
    if (!negotiation) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Digit1' || e.code === 'Numpad1') tryPick('item');
      if (e.code === 'Digit2' || e.code === 'Numpad2') tryPick('coins');
      if (e.code === 'Digit3' || e.code === 'Numpad3') tryPick('mercy');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [negotiation, choice]);

  if (!negotiation) return null;

  const dead = negotiation.reason === 'death';
  const noWayOut = !negotiation.hasItems && !negotiation.canAfford;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center">
      {/* dark red-tinted vignette — you are at the pirates' mercy */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 42%, rgba(30,4,4,0.55), rgba(8,2,2,0.88) 85%)',
        }}
      />

      <div
        className="kfs-frame relative z-10 w-full max-w-2xl px-8 py-7"
        style={{
          background: 'rgba(16,10,8,0.94)',
          borderColor: 'rgba(201,162,39,0.4)',
          boxShadow: '0 0 60px rgba(0,0,0,0.75), inset 0 0 40px rgba(122,31,31,0.12)',
          animation: 'kfs-negot-in 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        }}
      >
        {/* Header */}
        <div className="mb-1 flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center border border-[rgba(201,162,39,0.5)] bg-[rgba(122,31,31,0.18)]"
            style={{ transform: 'rotate(45deg)' }}
          >
            <span style={{ transform: 'rotate(-45deg)' }} className="text-[color:var(--kotfs-gold)]">
              <Skull size={17} />
            </span>
          </span>
          <div>
            <h3 className="kotfs-title text-base tracking-[0.22em] text-[color:var(--kotfs-gold)]">
              NEGOTIATION WITH THE BLACK SIREN
            </h3>
            <p className="text-[0.62rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-70">
              "THE TOLL OF THE SEA IS ALWAYS PAID"
            </p>
          </div>
        </div>
        <div className="kfs-dlg-rule mb-4 w-2/3" />

        {/* Situation text */}
        <p className="mb-5 text-sm leading-relaxed text-[color:var(--kotfs-parchment)] md:text-[0.95rem]">
          {dead ? (
            <>
              The Black Siren's cannons have brought you to your knees on the deck.
              The corsair captain levels his saber at you… but he smiles.{' '}
              <em className="text-[color:var(--kotfs-gold)]">
                "No one dies today. But the sea collects its toll, friend. You choose how to pay."
              </em>
            </>
          ) : (
            <>
              Your ship is going down under the pirate broadsides. Grapples hold the remains of the
              hull while the corsairs leap aboard your deck.{' '}
              <em className="text-[color:var(--kotfs-gold)]">
                "The wood is sinking, sailor, but you need not. Pay the toll and swim away."
              </em>
            </>
          )}
        </p>

        {/* The two options (A / B) */}
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <button
            onClick={() => tryPick('item')}
            disabled={!negotiation.hasItems || !!effectiveChoice}
            className="kfs-negot-opt group border border-[rgba(201,162,39,0.35)] bg-[rgba(28,20,12,0.6)] px-4 py-4 text-left transition hover:border-[rgba(201,162,39,0.75)] hover:bg-[rgba(48,34,18,0.6)]"
            style={{ opacity: !negotiation.hasItems || effectiveChoice ? 0.35 : 1, cursor: !negotiation.hasItems || effectiveChoice ? 'not-allowed' : 'pointer' }}
          >
            <div className="mb-1 flex items-center gap-2">
              <Package size={15} className="text-[color:var(--kotfs-gold)]" />
              <span className="kotfs-title text-[0.7rem] tracking-[0.18em] text-[color:var(--kotfs-gold)]">
                OPTION A · THE LOOT
              </span>
            </div>
            <p className="text-[0.8rem] leading-snug text-[color:var(--kotfs-parchment-dim)] group-hover:text-[color:var(--kotfs-parchment)]">
              Hand over <span className="text-[color:var(--kotfs-parchment)]">one item at random</span> from
              your inventory. The corsairs choose; you pray they take the tentacle and not the pearl.
            </p>
            {!negotiation.hasItems && (
              <p className="mt-1 text-[0.62rem] italic text-[#d88080]">You carry nothing that interests them.</p>
            )}
          </button>

          <button
            onClick={() => tryPick('coins')}
            disabled={!negotiation.canAfford || !!effectiveChoice}
            className="kfs-negot-opt group border border-[rgba(201,162,39,0.35)] bg-[rgba(28,20,12,0.6)] px-4 py-4 text-left transition hover:border-[rgba(201,162,39,0.75)] hover:bg-[rgba(48,34,18,0.6)]"
            style={{ opacity: !negotiation.canAfford || effectiveChoice ? 0.35 : 1, cursor: !negotiation.canAfford || effectiveChoice ? 'not-allowed' : 'pointer' }}
          >
            <div className="mb-1 flex items-center gap-2">
              <Coins size={15} className="text-[color:var(--kotfs-gold)]" />
              <span className="kotfs-title text-[0.7rem] tracking-[0.18em] text-[color:var(--kotfs-gold)]">
                OPTION B · THE GOLD
              </span>
            </div>
            <p className="text-[0.8rem] leading-snug text-[color:var(--kotfs-parchment-dim)] group-hover:text-[color:var(--kotfs-parchment)]">
              Hand over <span className="text-[color:var(--kotfs-parchment)]">{negotiation.coins} gold coins</span> from
              your purse. A price fixed by the corsair brotherhood: not one coin more, not one less.
            </p>
            {!negotiation.canAfford && (
              <p className="mt-1 text-[0.62rem] italic text-[#d88080]">You do not carry enough gold.</p>
            )}
          </button>
        </div>

        {/* The pity pass (only when broke AND empty-handed) */}
        {noWayOut && (
          <button
            onClick={() => tryPick('mercy')}
            disabled={!!effectiveChoice}
            className="kfs-negot-opt group mb-4 w-full border border-[rgba(122,31,31,0.5)] bg-[rgba(30,14,10,0.6)] px-4 py-3 text-left transition hover:border-[rgba(201,162,39,0.6)]"
            style={{ opacity: choice ? 0.35 : 1 }}
          >
            <div className="flex items-center gap-2">
              <Handshake size={15} className="text-[color:var(--kotfs-gold)]" />
              <span className="kotfs-title text-[0.7rem] tracking-[0.18em] text-[color:var(--kotfs-gold)]">
                NO GOLD, NO GOODS
              </span>
            </div>
            <p className="mt-1 text-[0.78rem] text-[color:var(--kotfs-parchment-dim)]">
              Show the empty purse and the empty hands. "What a beggar of the sea!" They let you live out of pure pity.
            </p>
          </button>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[rgba(201,162,39,0.2)] pt-3">
          <p className="flex items-center gap-1.5 text-[0.58rem] tracking-[0.22em] text-[color:var(--kotfs-parchment-dim)] opacity-60">
            <Ship size={11} />
            {dead ? 'YOU WAKE ON THE DOCK · THE HUMMINGBIRD AWAITS' : 'BRAM WILL TOW THE HULL TO PORT'}
          </p>
          {choice ? (
            <span className="kotfs-pulse text-[0.62rem] tracking-[0.25em] text-[color:var(--kotfs-gold)]">
              DEAL STRUCK…
            </span>
          ) : (
            <span className="text-[0.58rem] tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)] opacity-45">
              PRESS 1 · 2 {noWayOut ? '· 3' : ''} OR CHOOSE WITH THE MOUSE
            </span>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes kfs-negot-in {
          from { transform: translateY(26px) scale(0.96); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        .kfs-negot-opt:active:not(:disabled) {
          transform: translateY(1px);
        }
      `}</style>
    </div>
  );
}
