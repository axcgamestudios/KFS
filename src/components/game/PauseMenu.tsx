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
            {tab === 'principal' ? 'PAUSA' : tab === 'guardar' ? 'GUARDAR PARTIDA' : 'AJUSTES'}
          </h2>
          <p className="flex items-center gap-2 text-xs text-[color:var(--kotfs-parchment-dim)]">
            <Clock size={12} className="text-[color:var(--kotfs-gold)]" />
            Día {dayCount} · {clock} · Nivel {level} · {SaveSystem.formatPlaytime(gameApi.playtime())}
          </p>
        </div>
        <hr className="kotfs-hr mb-5" />

        {tab === 'principal' && (
          <div className="flex flex-col gap-2.5">
            <button className="kotfs-btn kotfs-btn-primary" onClick={resume}>
              Reanudar
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button className="kotfs-btn" onClick={() => switchTab('guardar')}>
                <span className="flex items-center justify-center gap-2">
                  <Save size={14} /> Guardar
                </span>
              </button>
              <button className="kotfs-btn" onClick={() => switchTab('ajustes')}>
                Ajustes
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
              {confirmExit ? '¿Seguro? Pulsa de nuevo para salir' : 'Salir al menú principal'}
            </button>
            <p className="mt-3 text-center text-[0.62rem] italic text-[color:var(--kotfs-parchment-dim)] opacity-60">
              La partida se guarda automáticamente al completar misiones y cada dos minutos.
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
                        RANURA {slot + 1}
                      </span>
                      {meta ? (
                        <span className="text-xs text-[color:var(--kotfs-parchment-dim)]">
                          Nivel {meta.level} · Día {meta.dayCount} ·{' '}
                          {SaveSystem.formatPlaytime(meta.playtime)}
                        </span>
                      ) : (
                        <span className="text-xs text-[color:var(--kotfs-parchment-dim)] opacity-50">
                          — vacía —
                        </span>
                      )}
                    </span>
                    <span className="kotfs-title text-[0.6rem] text-[color:var(--kotfs-gold)]">
                      {meta ? 'SOBRESCRIBIR' : 'GUARDAR'}
                    </span>
                  </span>
                </button>
                {meta && (
                  <button
                    className="kotfs-btn !px-3"
                    title="Borrar ranura"
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
                Pulsa de nuevo el cubo para confirmar el borrado.
              </p>
            )}
            <button className="kotfs-btn mt-1" onClick={() => switchTab('principal')}>
              Volver
            </button>
          </div>
        )}

        {tab === 'ajustes' && <SettingsPanel onBack={() => switchTab('principal')} />}
      </div>
    </div>
  );
}
