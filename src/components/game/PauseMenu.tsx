'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { SaveSystem } from '@/game/systems/SaveSystem';
import SettingsPanel from './SettingsPanel';
import { Clock, Save, Trash2 } from 'lucide-react';

type Tab = 'principal' | 'guardar' | 'ajustes';

export default function PauseMenu({ initialTab = 'principal' }: { initialTab?: Tab }) {
  const closeOverlay = useGameStore((s) => s.closeOverlay);
  const openOverlay = useGameStore((s) => s.openOverlay);
  const dayCount = useGameStore((s) => s.dayCount);
  const clock = useGameStore((s) => s.clock);
  const level = useGameStore((s) => s.level);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [slots, setSlots] = useState<
    Array<null | { level: number; dayCount: number; playtime: number; timestamp: number }>
  >(() => SaveSystem.SAVE_SLOTS.map((s) => SaveSystem.slotMeta(s)));
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);

  const refreshSlots = () => {
    setSlots(SaveSystem.SAVE_SLOTS.map((s) => SaveSystem.slotMeta(s)));
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === 'guardar') refreshSlots();
  };

  const resume = () => {
    closeOverlay();
    gameApi.resume();
    gameApi.clickResumeHint();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (tab === 'principal') {
          resume();
        } else {
          switchTab('principal');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, closeOverlay, dayCount, clock, level]);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-[2px]">
      <div className="kotfs-panel kotfs-panel-corner w-full max-w-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="kotfs-title text-lg tracking-[0.25em] text-[color:var(--kotfs-gold)]">
            {tab === 'principal' ? 'PAUSED' : tab === 'guardar' ? 'SAVE GAME' : 'SETTINGS'}
          </h2>
          <p className="flex items-center gap-2 text-xs text-[color:var(--kotfs-parchment-dim)]">
            <Clock size={12} className="text-[color:var(--kotfs-gold)]" />
            Day {dayCount} · {clock} · Level {level} · {SaveSystem.formatPlaytime(gameApi.playtime())}
          </p>
        </div>
        <hr className="kotfs-hr mb-5" />

        {tab === 'principal' && (
          <div className="flex flex-col gap-2.5">
            <button className="kotfs-btn kotfs-btn-primary" onClick={resume}>
              Resume
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button className="kotfs-btn" onClick={() => switchTab('guardar')}>
                <span className="flex items-center justify-center gap-2">
                  <Save size={14} /> Save
                </span>
              </button>
              <button className="kotfs-btn" onClick={() => switchTab('ajustes')}>
                Settings
              </button>
            </div>
            <button
              className="kotfs-btn mt-2 !border-[color:rgba(138,47,47,0.6)]"
              onClick={() => {
                if (confirmExit) {
                  gameApi.returnToMenu();
                } else {
                  setConfirmExit(true);
                  setTimeout(() => setConfirmExit(false), 3000);
                }
              }}
            >
              {confirmExit ? 'Are you sure? Press again to quit' : 'Quit to main menu'}
            </button>
            <p className="mt-3 text-center text-[0.62rem] italic text-[color:var(--kotfs-parchment-dim)] opacity-60">
              The game saves automatically when you complete quests and every two minutes.
            </p>
          </div>
        )}

        {tab === 'guardar' && (
          <div className="flex flex-col gap-3">
            {slots.map((meta, slot) => (
              <div key={slot} className="flex items-stretch gap-2">
                <button
                  className="kotfs-btn flex-1 !normal-case text-left"
                  onClick={() => {
                    gameApi.saveSlot(slot);
                    refreshSlots();
                  }}
                >
                  <span className="flex items-center justify-between">
                    <span>
                      <span className="kotfs-title mr-2 text-[color:var(--kotfs-gold)]">
                        SLOT {slot + 1}
                      </span>
                      {meta ? (
                        <span className="text-xs text-[color:var(--kotfs-parchment-dim)]">
                          Level {meta.level} · Day {meta.dayCount} ·{' '}
                          {SaveSystem.formatPlaytime(meta.playtime)}
                        </span>
                      ) : (
                        <span className="text-xs text-[color:var(--kotfs-parchment-dim)] opacity-50">
                          — empty —
                        </span>
                      )}
                    </span>
                    <span className="kotfs-title text-[0.6rem] text-[color:var(--kotfs-gold)]">
                      {meta ? 'OVERWRITE' : 'SAVE'}
                    </span>
                  </span>
                </button>
                {meta && (
                  <button
                    className="kotfs-btn !px-3"
                    title="Delete slot"
                    onClick={() => {
                      if (confirmDelete === slot) {
                        SaveSystem.delete(slot);
                        setConfirmDelete(null);
                        refreshSlots();
                      } else {
                        setConfirmDelete(slot);
                        setTimeout(() => setConfirmDelete(null), 2500);
                      }
                    }}
                  >
                    <Trash2 size={14} className={confirmDelete === slot ? 'text-[color:#c05656]' : ''} />
                  </button>
                )}
              </div>
            ))}
            {confirmDelete !== null && (
              <p className="text-center text-xs italic text-[color:#c05656]">
                Press the bin again to confirm deletion.
              </p>
            )}
            <button className="kotfs-btn mt-1" onClick={() => switchTab('principal')}>
              Back
            </button>
          </div>
        )}

        {tab === 'ajustes' && (
          <div className="kotfs-scroll max-h-[64vh] overflow-y-auto pr-2">
            <SettingsPanel onBack={() => switchTab('principal')} />
          </div>
        )}
      </div>
    </div>
  );
}
