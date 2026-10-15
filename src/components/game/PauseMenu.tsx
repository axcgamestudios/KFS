'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { gameApi } from '@/game/api';
import { SaveSystem } from '@/game/systems/SaveSystem';
import SettingsPanel from './SettingsPanel';
import { Clock, Save, Trash2, BookOpen } from 'lucide-react';

type Tab = 'principal' | 'guardar' | 'ajustes' | 'controles';

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
            {tab === 'principal' ? 'PAUSED' : tab === 'guardar' ? 'SAVE GAME' : tab === 'controles' ? 'HOW TO PLAY' : 'SETTINGS'}
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
            <button className="kotfs-btn" onClick={() => switchTab('controles')}>
              <span className="flex items-center justify-center gap-2">
                <BookOpen size={14} /> How to Play
              </span>
            </button>
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

        {tab === 'controles' && (
          <div>
            <div className="kfs2-h2p-scroll max-h-[58vh] pr-2">
              <p className="kfs2-h2p-cat">Movement</p>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Move</span><span className="kfs2-h2p-desc"><span className="kfs2-key">W</span><span className="kfs2-key">A</span><span className="kfs2-key">S</span><span className="kfs2-key">D</span> — or the arrow keys</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Sprint</span><span className="kfs2-h2p-desc"><span className="kfs2-key">Shift</span> — hold to run</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Jump</span><span className="kfs2-h2p-desc"><span className="kfs2-key kfs2-key-gold">Space</span> — again mid-air: somersault double-jump</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Dodge roll</span><span className="kfs2-h2p-desc"><span className="kfs2-key">C</span></span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Swim</span><span className="kfs2-h2p-desc"><span className="kfs2-key">Shift</span> dive · <span className="kfs2-key">Space</span> rise — Space at a shore climbs out</span></div>

              <p className="kfs2-h2p-cat">Melee Combat</p>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Attack</span><span className="kfs2-h2p-desc"><span className="kfs2-key">LMB</span> — chains 4-hit combos</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Heavy attack</span><span className="kfs2-h2p-desc">hold <span className="kfs2-key">LMB</span> — charge, release: a staggering blow</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Air combat</span><span className="kfs2-h2p-desc"><span className="kfs2-key">LMB</span> in the air — juggle; hold: plunge-dive</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Block / Parry</span><span className="kfs2-h2p-desc"><span className="kfs2-key">Q</span> or <span className="kfs2-key">RMB</span> — parry just before the blow for a riposte</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Hook dash</span><span className="kfs2-h2p-desc"><span className="kfs2-key">F</span> — C mid-dash: vault kick</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Rope dart</span><span className="kfs2-h2p-desc"><span className="kfs2-key">E</span> — pull a distant enemy close</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Finisher</span><span className="kfs2-h2p-desc"><span className="kfs2-key">V</span> — on a staggered enemy</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Sea tonic</span><span className="kfs2-h2p-desc"><span className="kfs2-key">R</span> — heal 45%; burns a Valor bar</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Weapons</span><span className="kfs2-h2p-desc"><span className="kfs2-key">1</span> sword · <span className="kfs2-key">2</span> axe · <span className="kfs2-key">3</span> spear</span></div>

              <p className="kfs2-h2p-cat">The Bow</p>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Draw & aim</span><span className="kfs2-h2p-desc">hold <span className="kfs2-key">RMB</span></span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Release</span><span className="kfs2-h2p-desc"><span className="kfs2-key">LMB</span></span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Cycle bow / arrows</span><span className="kfs2-h2p-desc"><span className="kfs2-key">4</span> bow · <span className="kfs2-key">X</span> arrows</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Specials</span><span className="kfs2-h2p-desc"><span className="kfs2-key">G</span> arrow rain · <span className="kfs2-key">T</span> pierce shot</span></div>

              <p className="kfs2-h2p-cat">Camera & World</p>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">First person</span><span className="kfs2-h2p-desc"><span className="kfs2-key kfs2-key-gold">B</span> — rides the knight's eyes; B again to return</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Free camera</span><span className="kfs2-h2p-desc"><span className="kfs2-key">P</span> — photo mode</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Interact</span><span className="kfs2-h2p-desc"><span className="kfs2-key kfs2-key-gold">E</span> — talk, chests, shops, forge, board a ship</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Screens</span><span className="kfs2-h2p-desc"><span className="kfs2-key">Tab</span> inventory · <span className="kfs2-key">M</span> map · <span className="kfs2-key">J</span> journal · <span className="kfs2-key">K</span> skills · <span className="kfs2-key">L</span> torch</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Horse</span><span className="kfs2-h2p-desc"><span className="kfs2-key">H</span> — whistle for Tempesta</span></div>

              <p className="kfs2-h2p-cat">Sailing</p>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Sails</span><span className="kfs2-h2p-desc"><span className="kfs2-key">W</span> raise · <span className="kfs2-key">S</span> furl</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Rudder</span><span className="kfs2-h2p-desc"><span className="kfs2-key">A</span> port · <span className="kfs2-key">D</span> starboard</span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Anchor</span><span className="kfs2-h2p-desc"><span className="kfs2-key">Space</span></span></div>
              <div className="kfs2-h2p-row"><span className="kfs2-h2p-act">Broadside</span><span className="kfs2-h2p-desc"><span className="kfs2-key">LMB</span> port · <span className="kfs2-key">RMB</span> starboard</span></div>
            </div>
            <button className="kotfs-btn mt-4" onClick={() => switchTab('principal')}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
