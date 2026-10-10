'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { SaveSystem } from '@/game/systems/SaveSystem';
import { Play, ScrollText, Settings2, Sparkles, ChevronRight, Ship } from 'lucide-react';

/**
 * Fase 5 menu — the repository key art (the golden-hour galleon, title baked
 * into the sky) is the whole background: no DOM title, per the game direction.
 * Buttons are styled after the artwork (weathered brass over dark walnut,
 * sunset gold). Studio: AXCGames Studios.
 */

function SlotButton({ slot, onPick, onEmpty }: { slot: number; onPick: () => void; onEmpty: () => void }) {
  const meta = SaveSystem.slotMeta(slot);
  return (
    <button
      className="kfs2-btn w-full text-left"
      disabled={!meta}
      onClick={meta ? onPick : onEmpty}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="kfs2-btn-title text-sm">
            Ranura {slot + 1}
          </div>
          {meta ? (
            <div className="text-xs font-normal tracking-normal opacity-70">
              Nivel {meta.level} · Día {meta.dayCount} · {SaveSystem.formatPlaytime(meta.playtime)}
            </div>
          ) : (
            <div className="text-xs font-normal tracking-normal opacity-40">
              Vacía
            </div>
          )}
        </div>
        <ChevronRight size={16} className="kfs2-chevron" />
      </div>
    </button>
  );
}

export default function MainMenu() {
  const hasSave = useGameStore((s) => s.hasSave);
  const [subMenu, setSubMenu] = useState<null | 'load' | 'credits'>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const notifyFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2600);
  };

  return (
    <div className="absolute inset-0 z-40 flex overflow-hidden bg-[#0a0d16]">
      {/* The key art: galleon at golden hour with the title baked into the sky */}
      <Image
        src="/game/menu/menu_bg.png"
        alt="Kingdoms of the Forgotten Seas"
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />

      {/* Legibility scrim over the left column (keeps the galleon clear on the right) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(100deg, rgba(6,8,14,0.93) 0%, rgba(6,8,14,0.82) 30%, rgba(6,8,14,0.42) 55%, rgba(6,8,14,0.05) 78%, rgba(6,8,14,0) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{ background: 'linear-gradient(180deg, rgba(6,8,14,0) 0%, rgba(6,8,14,0.72) 100%)' }}
      />

      {/* Left: studio mark, menu, version */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col justify-center px-8 md:px-16">
        <div className="kfs2-rise" style={{ ['--rise-delay' as string]: '0.2s' }}>
          <p className="mb-4 flex items-center gap-3 text-[0.68rem] font-semibold tracking-[0.5em] text-[#e2b95c] md:text-xs">
            <span className="inline-block h-[1px] w-8 bg-[#e2b95c]/70" />
            AXCGAMES STUDIOS PRESENTA
          </p>
        </div>

        {subMenu === null && (
          <div className="kfs2-rise flex w-[19rem] flex-col gap-3 md:w-80" style={{ ['--rise-delay' as string]: '0.45s' }}>
            <button
              className="kfs2-btn kfs2-btn-primary text-left"
              onClick={() => gameApi.startNewGame()}
            >
              <span className="flex items-center gap-3">
                <Sparkles size={16} className="text-[#3a2a10]" />
                Nueva partida
              </span>
            </button>
            <button
              className="kfs2-btn text-left"
              disabled={!hasSave}
              title={hasSave ? undefined : 'No hay partidas guardadas'}
              onClick={() => {
                if (!gameApi.continueGame()) {
                  notifyFlash('No se encontró ninguna partida que cargar.');
                }
              }}
            >
              <span className="flex items-center gap-3">
                <Play size={16} className="kfs2-icon" />
                Continuar
              </span>
            </button>
            <button
              className="kfs2-btn text-left"
              onClick={() => setSubMenu('load')}
            >
              <span className="flex items-center gap-3">
                <ScrollText size={16} className="kfs2-icon" />
                Cargar partida
              </span>
            </button>
            <button
              className="kfs2-btn text-left"
              onClick={() => useGameStore.getState().openOverlay('settings')}
            >
              <span className="flex items-center gap-3">
                <Settings2 size={16} className="kfs2-icon" />
                Ajustes
              </span>
            </button>
          </div>
        )}

        {subMenu === 'load' && (
          <div className="kfs2-rise kfs2-panel w-80 p-5" style={{ ['--rise-delay' as string]: '0.1s' }}>
            <h3 className="kfs2-btn-title mb-4 text-sm">
              Cargar partida
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
            <button className="kfs2-btn mt-4 w-full" onClick={() => setSubMenu(null)}>
              Volver
            </button>
          </div>
        )}

        {subMenu === 'credits' && (
          <div className="kfs2-rise kfs2-panel max-w-md p-6" style={{ ['--rise-delay' as string]: '0.1s' }}>
            <h3 className="kfs2-btn-title mb-4 text-sm">Créditos</h3>
            <div className="space-y-3 text-sm leading-relaxed text-[#cfc3a4]">
              <p>
                <span className="kfs2-btn-title text-[#f0e6cd]">
                  Kingdoms of the Forgotten Seas
                </span>{' '}
                — una aventura de mundo abierto medieval: cada árbol, cada ola y cada copo de
                nieve nace de las matemáticas de la isla.
              </p>
              <hr className="kfs2-hr" />
              <p>
                Un juego de <span className="kfs2-btn-title text-[#e2b95c]">AXCGames Studios</span> · 2026
              </p>
              <p>
                Motor: Three.js sobre Next.js · Música y sonido: síntesis WebAudio en tiempo real ·
                Modelos y texturas: repositorio oficial del estudio
              </p>
              <p className="italic">
                «Donde cae una escama, pronto cae su dueño.» — Bram el Herrero
              </p>
            </div>
            <button className="kfs2-btn mt-5 w-full" onClick={() => setSubMenu(null)}>
              Volver
            </button>
          </div>
        )}

        {flash && (
          <p className="kfs2-rise mt-4 text-sm italic text-[#ffb0a0]" style={{ ['--rise-delay' as string]: '0s' }}>
            {flash}
          </p>
        )}

        <div className="kfs2-rise mt-10 flex items-center gap-2 text-xs tracking-widest text-[#b9ac8e] opacity-80" style={{ ['--rise-delay' as string]: '0.8s' }}>
          <Ship size={13} className="text-[#e2b95c]" />
          FASE 5 — EL CABALLERO Y LOS KITS · v0.5
        </div>
      </div>

      {/* Right side: the galleon sails free */}
      <div className="pointer-events-none flex-1" />

      {/* Bottom-right studio mark */}
      {subMenu === null && (
        <button
          className="absolute bottom-6 right-8 z-10 text-[0.68rem] font-semibold tracking-[0.34em] text-[#b9ac8e] opacity-80 transition hover:text-[#e2b95c] hover:opacity-100"
          onClick={() => setSubMenu('credits')}
        >
          UN JUEGO DE AXCGAMES STUDIOS
        </button>
      )}
    </div>
  );
}
