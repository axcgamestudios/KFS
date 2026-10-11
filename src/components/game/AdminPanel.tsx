'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { gameApi } from '@/game/api';
import { useGameStore } from '@/store/gameStore';
import {
  Ship, Rabbit, Flame, Swords, Wind, X, Compass, Sun, Moon, Sparkles, Clapperboard,
} from 'lucide-react';

/**
 * Fase 8 — Admin panel ( combinación U+I+O ).
 * Hold the three keys at once to open/close. Spawn ships, horses and dragons
 * right where you stand, toggle free-fly, drag the sun across the sky,
 * replay any cinematic (Fase 10).
 * Purely a dev/cheat surface — gameplay code never reads it.
 *
 * Fase 10: the combo hint is HIDDEN (user request) — the panel is a
 * deliberate secret for the developer.
 */

const DRAGON_SPECIES: Array<{ id: string; label: string; boss: boolean }> = [
  { id: 'drake_stones', label: 'Drakeling de las Vigilias', boss: false },
  { id: 'drake_grotto', label: 'Drakeling de la Gruta', boss: false },
  { id: 'vaelthara', label: 'Vaelthara · Guardiana', boss: true },
  { id: 'skarnvind', label: 'Skarnvind · Wyvern', boss: true },
  { id: 'ancestro', label: 'Vaelyx · Ancestro', boss: true },
  { id: 'kraivenn', label: 'Kraivenn · El Cuervo', boss: true },
];

export default function AdminPanel() {
  const phase = useGameStore((s) => s.phase);
  const dialogue = useGameStore((s) => s.dialogue);
  const [open, setOpen] = useState(false);
  const [flying, setFlying] = useState(false);
  const [timeSlider, setTimeSlider] = useState(0.5);
  const [log, setLog] = useState<string[]>([]);
  const keys = useRef<Set<string>>(new Set());
  const wasCombo = useRef(false);

  const pushLog = useCallback((msg: string) => {
    setLog((l) => [msg, ...l].slice(0, 5));
  }, []);

  // --- U+I+O combo detection (all three held at once) ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.code);
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    const iv = setInterval(() => {
      const combo = keys.current.has('KeyU') && keys.current.has('KeyI') && keys.current.has('KeyO');
      if (combo && !wasCombo.current) {
        setOpen((o) => !o);
        setFlying(gameApi.adminFlying());
      }
      wasCombo.current = combo;
    }, 60);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      clearInterval(iv);
    };
  }, []);

  if (phase !== 'playing' || dialogue !== null) return null;

  const spawn = (kind: 'ship' | 'horse' | 'dragon', species?: string) => {
    const msg = gameApi.adminSpawn(kind, species);
    if (msg) pushLog(msg);
  };

  const toggleFly = () => {
    const next = gameApi.adminFly(!flying);
    setFlying(next);
  };

  const applyTime = (f: number) => {
    setTimeSlider(f);
    gameApi.adminSetTime(f);
  };

  return (
    <>
      {open && (
        <div className="kfs-prompt pointer-events-auto absolute left-1/2 top-1/2 z-40 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2">
          <div className="kfs-frame px-6 py-5">
            <span className="kfs-rivet kfs-rivet-tl" />
            <span className="kfs-rivet kfs-rivet-tr" />
            <span className="kfs-rivet kfs-rivet-bl" />
            <span className="kfs-rivet kfs-rivet-br" />

            {/* header */}
            <div className="mb-4 flex items-center justify-between">
              <p className="kotfs-title flex items-center gap-2 text-sm tracking-[0.3em] text-[color:#e8c96a]">
                <Compass size={15} /> PANEL DEL ADMINISTRADOR
              </p>
              <button
                className="flex h-7 w-7 items-center justify-center border border-[color:rgba(201,162,39,0.4)] text-[color:var(--kotfs-parchment-dim)] transition hover:border-[color:#e8c96a] hover:text-[color:#e8c96a]"
                onClick={() => setOpen(false)}
                title="Cerrar (U+I+O)"
              >
                <X size={13} />
              </button>
            </div>

            {/* spawn row */}
            <p className="kotfs-title mb-2 text-[0.6rem] tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)]">
              INVOCAR FRENTE A TI
            </p>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <button className="kfs-admin-btn" onClick={() => spawn('ship')}>
                <Ship size={17} className="text-[color:#9cc168]" />
                <span>BARCO</span>
                <small>fondeado en el agua cercana</small>
              </button>
              <button className="kfs-admin-btn" onClick={() => spawn('horse')}>
                <Rabbit size={17} className="text-[color:#c9a227]" />
                <span>CABALLO</span>
                <small>montura aleatoria, ya domada</small>
              </button>
              <button className="kfs-admin-btn" onClick={() => spawn('dragon', 'drake_stones')}>
                <Flame size={17} className="text-[color:#e07a4a]" />
                <span>DRAKELING</span>
                <small>dragón menor hostil</small>
              </button>
            </div>

            {/* dragon species */}
            <p className="kotfs-title mb-2 flex items-center gap-1.5 text-[0.6rem] tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)]">
              <Swords size={11} /> DRAGONES CONCRETOS
            </p>
            <div className="mb-4 grid grid-cols-2 gap-1.5">
              {DRAGON_SPECIES.map((d) => (
                <button
                  key={d.id}
                  className={`kfs-admin-row ${d.boss ? 'kfs-admin-row-boss' : ''}`}
                  onClick={() => spawn('dragon', d.id)}
                >
                  <span className="truncate">{d.label}</span>
                  {d.boss && <span className="kfs-gem kfs-gem-lit !h-2 !w-2" />}
                </button>
              ))}
            </div>

            {/* cinematics (Fase 10) */}
            <p className="kotfs-title mb-2 flex items-center gap-1.5 text-[0.6rem] tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)]">
              <Clapperboard size={11} /> VER CINEMÁTICAS
            </p>
            <div className="mb-4 grid grid-cols-2 gap-1.5">
              {(gameApi.adminCinematics?.() ?? []).map((c) => (
                <button
                  key={c.key}
                  className="kfs-admin-row"
                  onClick={() => {
                    const ok = gameApi.adminPlayCinematic(c.key);
                    if (ok) setOpen(false);
                  }}
                >
                  <span className="truncate">{c.label}</span>
                </button>
              ))}
            </div>

            {/* fly + time */}
            <div className="grid grid-cols-2 gap-4 border-t border-[color:rgba(201,162,39,0.25)] pt-3">
              <button
                className={`kfs-admin-fly ${flying ? 'kfs-admin-fly-on' : ''}`}
                onClick={toggleFly}
              >
                <Wind size={16} />
                <span>MODO VUELO: {flying ? 'ACTIVADO' : 'APAGADO'}</span>
                <small>ESPACIO sube · E baja · MAYÚS acelera</small>
              </button>
              <div>
                <p className="kotfs-title mb-1 flex items-center gap-1.5 text-[0.6rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
                  {timeSlider < 0.22 || timeSlider > 0.8 ? <Moon size={11} /> : <Sun size={11} />}
                  HORA DEL DÍA
                </p>
                <input
                  type="range" min={0} max={0.999} step={0.002}
                  value={timeSlider}
                  onChange={(e) => applyTime(parseFloat(e.target.value))}
                  className="kfs-admin-range w-full"
                />
                <div className="mt-0.5 flex justify-between text-[0.55rem] text-[color:var(--kotfs-parchment-dim)] opacity-70">
                  <span>medianoche</span><span>mediodía</span><span>medianoche</span>
                </div>
              </div>
            </div>

            {/* mini log */}
            {log.length > 0 && (
              <div className="mt-3 border-t border-[color:rgba(201,162,39,0.18)] pt-2">
                {log.map((l, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-[0.68rem] text-[color:var(--kotfs-parchment-dim)]"
                    style={{ opacity: 1 - i * 0.18 }}>
                    <Sparkles size={10} className="text-[color:#e8c96a]" /> {l}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
