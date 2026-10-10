'use client';

import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { SaveSystem } from '@/game/systems/SaveSystem';
import { Play, ScrollText, Settings2, Sparkles, ChevronRight, Ship } from 'lucide-react';
import { Embers, EpicTitle, SeaWaves } from './menuFx';

function SlotButton({ slot, onPick, onEmpty }: { slot: number; onPick: () => void; onEmpty: () => void }) {
  const meta = SaveSystem.slotMeta(slot);
  return (
    <button
      className="kotfs-btn w-full text-left normal-case"
      disabled={!meta}
      onClick={meta ? onPick : onEmpty}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="kotfs-title text-sm text-[color:var(--kotfs-gold)]">
            Ranura {slot + 1}
          </div>
          {meta ? (
            <div className="text-xs normal-case text-[color:var(--kotfs-parchment-dim)]">
              Nivel {meta.level} · Día {meta.dayCount} · {SaveSystem.formatPlaytime(meta.playtime)}
            </div>
          ) : (
            <div className="text-xs normal-case text-[color:var(--kotfs-parchment-dim)] opacity-50">
              Vacía
            </div>
          )}
        </div>
        <ChevronRight size={16} />
      </div>
    </button>
  );
}

/** Deterministic pseudo-random field of rising embers. */
// (ember FX, title reveal & waves live in ./menuFx)

export default function MainMenu() {
  const hasSave = useGameStore((s) => s.hasSave);
  const [subMenu, setSubMenu] = useState<null | 'load' | 'credits'>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const notifyFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2600);
  };

  return (
    <div className="absolute inset-0 z-40 flex overflow-hidden">
      {/* Atmosphere over the 3D golden-hour bay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(5,7,10,0.88) 0%, rgba(5,7,10,0.55) 34%, rgba(5,7,10,0.08) 62%, rgba(5,7,10,0.25) 100%)',
        }}
      />
      <Embers count={20} seed={5} />
      <SeaWaves />

      {/* Left: title & menu */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col justify-center px-8 md:px-16">
        <div>
          <p className="kotfs-rise mb-3 text-[0.65rem] tracking-[0.55em] text-[color:var(--kotfs-gold)] opacity-90 md:text-xs" style={{ ['--rise-delay' as string]: '0.15s' }}>
            EL ESTUDIO MAREA PRESENTA
          </p>

          <h1 className="kotfs-title relative mb-1 text-4xl leading-[1.05] text-[color:var(--kotfs-parchment)] md:text-6xl">
            <EpicTitle text="KINGDOMS OF THE" delay={0.4} />
            <br />
            <EpicTitle text="FORGOTTEN SEAS" delay={1.2} className="kotfs-shine-text" />
            <span
              className="kotfs-title-glow pointer-events-none absolute left-1/2 top-[64%] -z-10 h-20 w-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: 'radial-gradient(ellipse, rgba(201,162,39,0.3), transparent 70%)' }}
            />
          </h1>

          <p className="kotfs-rise mb-1 mt-2 flex items-center gap-2 text-sm italic tracking-wide text-[color:var(--kotfs-parchment-dim)] md:text-base" style={{ ['--rise-delay' as string]: '2.1s' }}>
            <Ship size={14} className="text-[color:var(--kotfs-gold)]" />
            Capítulo II — Los Mares Olvidados · El océano y los piratas
          </p>
          <div className="kotfs-rise mb-10 mt-4 h-[1px] w-64 bg-gradient-to-r from-[color:var(--kotfs-gold)] via-[rgba(201,162,39,0.35)] to-transparent" style={{ ['--rise-delay' as string]: '2.3s' }} />

          {subMenu === null && (
            <div className="flex w-72 flex-col gap-3">
              <button
                className="kotfs-btn kotfs-btn-primary kotfs-rise text-left"
                style={{ ['--rise-delay' as string]: '2.4s' }}
                onClick={() => gameApi.startNewGame()}
              >
                <span className="flex items-center gap-3">
                  <Sparkles size={16} className="text-[color:var(--kotfs-gold)]" />
                  Nueva partida
                </span>
              </button>
              <button
                className="kotfs-btn kotfs-rise text-left"
                style={{ ['--rise-delay' as string]: '2.55s' }}
                disabled={!hasSave}
                title={hasSave ? undefined : 'No hay partidas guardadas'}
                onClick={() => {
                  if (!gameApi.continueGame()) {
                    notifyFlash('No se encontró ninguna partida que cargar.');
                  }
                }}
              >
                <span className="flex items-center gap-3">
                  <Play size={16} className="text-[color:var(--kotfs-gold)]" />
                  Continuar
                </span>
              </button>
              <button
                className="kotfs-btn kotfs-rise text-left"
                style={{ ['--rise-delay' as string]: '2.7s' }}
                onClick={() => setSubMenu('load')}
              >
                <span className="flex items-center gap-3">
                  <ScrollText size={16} className="text-[color:var(--kotfs-gold)]" />
                  Cargar partida
                </span>
              </button>
              <button
                className="kotfs-btn kotfs-rise text-left"
                style={{ ['--rise-delay' as string]: '2.85s' }}
                onClick={() => useGameStore.getState().openOverlay('settings')}
              >
                <span className="flex items-center gap-3">
                  <Settings2 size={16} className="text-[color:var(--kotfs-gold)]" />
                  Ajustes
                </span>
              </button>
            </div>
          )}

          {subMenu === 'load' && (
            <div className="kotfs-panel kotfs-panel-corner kotfs-fade-in w-80 p-5">
              <h3 className="kotfs-title mb-4 text-sm text-[color:var(--kotfs-gold)]">
                CARGAR PARTIDA
              </h3>
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((slot) => (
                  <SlotButton
                    key={slot}
                    slot={slot}
                    onPick={() => {
                      if (!gameApi.loadSlot(slot)) {
                        notifyFlash('La ranura está vacía o dañada.');
                      }
                    }}
                    onEmpty={() => notifyFlash('La ranura está vacía. Comienza una nueva partida.')}
                  />
                ))}
              </div>
              <button className="kotfs-btn mt-4 w-full" onClick={() => setSubMenu(null)}>
                Volver
              </button>
            </div>
          )}

          {subMenu === 'credits' && (
            <div className="kotfs-panel kotfs-panel-corner kotfs-fade-in max-w-md p-6">
              <h3 className="kotfs-title mb-4 text-sm text-[color:var(--kotfs-gold)]">CRÉDITOS</h3>
              <div className="space-y-3 text-sm leading-relaxed text-[color:var(--kotfs-parchment-dim)]">
                <p>
                  <span className="kotfs-title text-[color:var(--kotfs-parchment)]">
                    Kingdoms of the Forgotten Seas
                  </span>{' '}
                  — una aventura de mundo abierto medieval generada proceduralmente: cada árbol,
                  cada ola y cada copo de nieve nace de las matemáticas de la isla.
                </p>
                <hr className="kotfs-hr" />
                <p>Dirección de arte y código — Estudio Marea · 2026</p>
                <p>
                  Motor: Three.js sobre Next.js · Música y sonido: síntesis WebAudio en tiempo real ·
                  Mundos: ruido simplex y cariño artesanal
                </p>
                <p className="italic">
                  «Donde cae una escama, pronto cae su dueño.» — Bram el Herrero
                </p>
              </div>
              <button className="kotfs-btn mt-5 w-full" onClick={() => setSubMenu(null)}>
                Volver
              </button>
            </div>
          )}

          {flash && (
            <p className="kotfs-notif mt-4 text-sm italic text-[color:var(--kotfs-blood)]">{flash}</p>
          )}

          {subMenu === null && (
            <p className="kotfs-rise mt-10 text-xs tracking-widest text-[color:var(--kotfs-parchment-dim)] opacity-60" style={{ ['--rise-delay' as string]: '3s' }}>
              FASE 2 — EL OCÉANO Y LOS PIRATAS · v0.2
            </p>
          )}
        </div>
      </div>

      {/* Right side: the 3D world shows through (bay at golden hour) */}
      <div className="pointer-events-none flex-1" />

      {/* Bottom-right credits link */}
      {subMenu === null && (
        <button
          className="absolute bottom-6 right-8 z-10 text-xs tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-70 transition hover:text-[color:var(--kotfs-gold)] hover:opacity-100"
          onClick={() => setSubMenu('credits')}
        >
          CRÉDITOS
        </button>
      )}
    </div>
  );
}
