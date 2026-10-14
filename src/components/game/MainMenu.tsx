'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { SaveSystem } from '@/game/systems/SaveSystem';
import { Play, ScrollText, Settings2, Sparkles, ChevronRight, Ship } from 'lucide-react';
import { Embers, SeaWaves } from './menuFx';
import { ASSET_BASE } from '@/game/core/Graphics';

/**
 * Fase 6 menu — the repository key art (Fondo_Menu.JPG: the grimdark fortress
 * over the stormy sea, the knight on the rock, title baked into the sky) is
 * the whole background: no DOM title, per the game direction. The buttons are
 * forged-iron plates with gold trim: idle light sweeps, hover shine + arrow
 * reveal + letter-spacing bloom, and a living gold pulse on the primary.
 * Studio: AXCGames Studios · music: Musica_fondo1 from the repository.
 */

function MenuButton({
  icon,
  label,
  onClick,
  disabled,
  title,
  primary,
  sheenDelay = '0s',
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  primary?: boolean;
  sheenDelay?: string;
}) {
  return (
    <button
      className={`kfs2-btn${primary ? ' kfs2-btn-primary' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ ['--sheen-delay' as string]: sheenDelay }}
    >
      <span className="kfs2-socket">{icon}</span>
      <span className="kfs2-label">{label}</span>
      <span className="kfs2-arrow"><ChevronRight size={15} /></span>
    </button>
  );
}

function SlotButton({ slot, onPick, onEmpty }: { slot: number; onPick: () => void; onEmpty: () => void }) {
  const meta = SaveSystem.slotMeta(slot);
  return (
    <button
      className="kfs2-btn w-full"
      disabled={!meta}
      onClick={meta ? onPick : onEmpty}
      style={{ ['--sheen-delay' as string]: `${slot * 1.7}s` }}
    >
      <span className="kfs2-socket"><ScrollText size={14} /></span>
      <span className="flex-1 text-left">
        <span className="kfs2-btn-title text-sm">Slot {slot + 1}</span>
        {meta ? (
          <span className="block text-xs font-normal tracking-normal normal-case opacity-70">
            Level {meta.level} · Day {meta.dayCount} · {SaveSystem.formatPlaytime(meta.playtime)}
          </span>
        ) : (
          <span className="block text-xs font-normal tracking-normal normal-case opacity-40">Empty</span>
        )}
      </span>
      <span className="kfs2-arrow"><ChevronRight size={15} /></span>
    </button>
  );
}

export default function MainMenu() {
  const hasSave = useGameStore((s) => s.hasSave);
  const [subMenu, setSubMenu] = useState<null | 'load' | 'credits'>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Ambient menu theme from the repository (needs a user gesture to start)
  useEffect(() => {
    const audio = new Audio(`${ASSET_BASE}game/audio/menu_theme.mp3`);
    audio.loop = true;
    audio.volume = 0;
    musicRef.current = audio;
    let fading = false;
    const kick = () => {
      if (fading) return;
      fading = true;
      audio.play().then(() => {
        const t0 = performance.now();
        const fade = () => {
          const k = Math.min(1, (performance.now() - t0) / 2400);
          audio.volume = 0.34 * k;
          if (k < 1) requestAnimationFrame(fade);
        };
        fade();
      }).catch(() => { fading = false; });
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      audio.pause();
      musicRef.current = null;
    };
  }, []);

  const notifyFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2600);
  };

  return (
    <div className="absolute inset-0 z-40 flex overflow-hidden bg-[#070b12]">
      {/* The key art: the fortress over the forgotten sea (title baked in the sky) */}
      <div className="kotfs-kenburns">
        {/* Fase 20 — plain <img>: next/image's optimizer demands absolute
            paths, which broke under the /KFS base path. Relative + object-cover
            renders identically in dev and in the static export. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ASSET_BASE}menu/fondo_menu.jpg`}
          alt="Kingdoms of the Forgotten Seas"
          className="absolute inset-0 h-full w-full object-cover object-top"
          draggable={false}
        />
      </div>

      {/* Drifting sea mist over the whole scene */}
      <div className="kotfs-fog" />

      {/* Legibility scrim over the left column (the fortress silhouette stays
          readable; the knight on the right rock and the sky title stay clear) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(100deg, rgba(5,8,13,0.94) 0%, rgba(5,8,13,0.84) 28%, rgba(5,8,13,0.46) 52%, rgba(5,8,13,0.06) 76%, rgba(5,8,13,0) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-44"
        style={{ background: 'linear-gradient(180deg, rgba(5,8,13,0) 0%, rgba(5,8,13,0.78) 100%)' }}
      />
      {/* soft vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 50% 42%, transparent 55%, rgba(3,5,9,0.55) 100%)' }}
      />

      {/* Rising embers + drifting sea silhouettes */}
      <Embers count={20} seed={11} />
      <SeaWaves />

      {/* Left: studio mark, menu, version */}
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col justify-center px-8 md:px-16">
        <div className="kfs2-rise" style={{ ['--rise-delay' as string]: '0.25s' }}>
          <p className="mb-4 flex items-center gap-3 text-[0.68rem] font-semibold tracking-[0.5em] text-[#e2b95c] md:text-xs">
            <span className="inline-block h-[1px] w-8 bg-[#e2b95c]/70" />
            AXCGAMES STUDIOS PRESENTS
          </p>
        </div>

        {subMenu === null && (
          <div className="kfs2-rise flex w-[20rem] flex-col gap-3 md:w-[21rem]" style={{ ['--rise-delay' as string]: '0.5s' }}>
            <MenuButton
              primary
              icon={<Sparkles size={15} />}
              label="New Game"
              onClick={() => gameApi.startNewGame()}
              sheenDelay="0.4s"
            />
            <MenuButton
              icon={<Play size={15} />}
              label="Continue"
              disabled={!hasSave}
              title={hasSave ? undefined : 'No saved games'}
              onClick={() => {
                if (!gameApi.continueGame()) {
                  notifyFlash('No saved game found to load.');
                }
              }}
              sheenDelay="1.9s"
            />
            <MenuButton
              icon={<ScrollText size={15} />}
              label="Load Game"
              onClick={() => setSubMenu('load')}
              sheenDelay="3.4s"
            />
            <MenuButton
              icon={<Settings2 size={15} />}
              label="Settings"
              onClick={() => useGameStore.getState().openOverlay('settings')}
              sheenDelay="4.9s"
            />
          </div>
        )}

        {subMenu === 'load' && (
          <div className="kfs2-rise kfs2-panel w-80 p-5" style={{ ['--rise-delay' as string]: '0.1s' }}>
            <h3 className="kfs2-btn-title mb-4 text-sm">
              Load Game
            </h3>
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((slot) => (
                <SlotButton
                  key={slot}
                  slot={slot}
                  onPick={() => {
                    if (!gameApi.loadSlot(slot)) {
                      notifyFlash('The slot is empty or corrupted.');
                    }
                  }}
                  onEmpty={() => notifyFlash('The slot is empty. Start a new game.')}
                />
              ))}
            </div>
            <div className="mt-4">
              <MenuButton icon={<ChevronRight size={15} />} label="Back" onClick={() => setSubMenu(null)} />
            </div>
          </div>
        )}

        {subMenu === 'credits' && (
          <div className="kfs2-rise kfs2-panel max-w-md p-6" style={{ ['--rise-delay' as string]: '0.1s' }}>
            <h3 className="kfs2-btn-title mb-4 text-sm">Credits</h3>
            <div className="space-y-3 text-sm leading-relaxed text-[#c6bda8]">
              <p>
                <span className="kfs2-btn-title text-[#f0e6cd]">
                  Kingdoms of the Forgotten Seas
                </span>{' '}
                — a medieval open-world adventure: every tree, every wave and every
                snowflake is born from the island's mathematics.
              </p>
              <hr className="kfs2-hr" />
              <p>
                A game by <span className="kfs2-btn-title text-[#e2b95c]">AXCGames Studios</span> · 2026
              </p>
              <p>
                Engine: Three.js on Next.js · Music and sound: real-time WebAudio synthesis ·
                Models and textures: the studio's official repository
              </p>
              <p className="italic">
                "Where a scale falls, its owner soon follows." — Bram the Smith
              </p>
            </div>
            <div className="mt-5">
              <MenuButton icon={<ChevronRight size={15} />} label="Back" onClick={() => setSubMenu(null)} />
            </div>
          </div>
        )}

        {flash && (
          <p className="kfs2-rise mt-4 text-sm italic text-[#ffb0a0]" style={{ ['--rise-delay' as string]: '0s' }}>
            {flash}
          </p>
        )}
      </div>

      {/* Right side: the knight keeps his watch on the rock */}
      <div className="pointer-events-none flex-1" />

      {/* Bottom-right studio mark + build version */}
      {subMenu === null && (
        <div className="absolute bottom-6 right-8 z-10 flex items-center gap-4">
          <span className="text-[0.6rem] font-semibold tracking-[0.28em] text-[#a9b4c2] opacity-60">
            v0.23.0 — THE STONECUTTER'S HAND
          </span>
          <button
            className="flex items-center gap-2 text-[0.68rem] font-semibold tracking-[0.34em] text-[#a9b4c2] opacity-80 transition hover:text-[#e2b95c] hover:opacity-100"
            onClick={() => setSubMenu('credits')}
          >
            <Ship size={13} />
            A GAME BY AXCGAMES STUDIOS
          </button>
        </div>
      )}
    </div>
  );
}
