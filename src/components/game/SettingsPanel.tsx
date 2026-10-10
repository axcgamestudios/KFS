'use client';

import { useEffect, useState } from 'react';
import { gameApi } from '@/game/api';
import type { Settings } from '@/game/systems/SaveSystem';
import { Monitor, Music, Volume2, MousePointer2 } from 'lucide-react';

const QUALITY_LABEL: Record<Settings['quality'], string> = {
  low: 'Baja — equipos modestos',
  medium: 'Media',
  high: 'Alta — recomendada',
  ultra: 'Ultra — equipos potentes',
};

export default function SettingsPanel({ onBack }: { onBack?: () => void }) {
  const [s, setS] = useState<Settings>(() => gameApi.settings());

  useEffect(() => {
    gameApi.applySettings(s);
  }, [s]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex w-full flex-col">
      <h3 className="kotfs-title mb-4 text-sm tracking-[0.25em] text-[color:var(--kotfs-gold)]">
        AJUSTES
      </h3>

      {/* Quality */}
      <div className="mb-5">
        <p className="mb-2 flex items-center gap-2 text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
          <Monitor size={13} className="text-[color:var(--kotfs-gold)]" /> CALIDAD GRÁFICA
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {(['low', 'medium', 'high', 'ultra'] as const).map((q) => (
            <button
              key={q}
              onClick={() => set('quality', q)}
              className={`border px-3 py-2 text-left text-xs transition ${
                s.quality === q
                  ? 'border-[color:var(--kotfs-gold)] bg-[rgba(201,162,39,0.12)] text-[color:var(--kotfs-parchment)]'
                  : 'border-[color:rgba(201,162,39,0.25)] text-[color:var(--kotfs-parchment-dim)] hover:border-[color:var(--kotfs-gold)]'
              }`}
            >
              <span className="kotfs-title">{q.toUpperCase()}</span>
              <span className="block text-[0.62rem] opacity-70">{QUALITY_LABEL[q].split(' — ')[0]}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.62rem] italic text-[color:var(--kotfs-parchment-dim)] opacity-70">
          {QUALITY_LABEL[s.quality]}
        </p>
      </div>

      {/* Volumes */}
      <div className="mb-5 space-y-4">
        <div>
          <p className="mb-1.5 flex items-center justify-between text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
            <span className="flex items-center gap-2">
              <Volume2 size={13} className="text-[color:var(--kotfs-gold)]" /> VOLUMEN GENERAL
            </span>
            <span className="kotfs-title text-[color:var(--kotfs-gold)]">{Math.round(s.masterVolume * 100)}%</span>
          </p>
          <input
            type="range" min={0} max={1} step={0.05} value={s.masterVolume}
            onChange={(e) => set('masterVolume', parseFloat(e.target.value))}
            className="w-full accent-[color:var(--kotfs-gold)]"
          />
        </div>
        <div>
          <p className="mb-1.5 flex items-center justify-between text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
            <span className="flex items-center gap-2">
              <Music size={13} className="text-[color:var(--kotfs-gold)]" /> MÚSICA
            </span>
            <span className="kotfs-title text-[color:var(--kotfs-gold)]">{Math.round(s.musicVolume * 100)}%</span>
          </p>
          <input
            type="range" min={0} max={1} step={0.05} value={s.musicVolume}
            onChange={(e) => set('musicVolume', parseFloat(e.target.value))}
            className="w-full accent-[color:var(--kotfs-gold)]"
          />
        </div>
        <div>
          <p className="mb-1.5 flex items-center justify-between text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
            <span className="flex items-center gap-2">
              <Volume2 size={13} className="text-[color:var(--kotfs-gold)]" /> EFECTOS
            </span>
            <span className="kotfs-title text-[color:var(--kotfs-gold)]">{Math.round(s.sfxVolume * 100)}%</span>
          </p>
          <input
            type="range" min={0} max={1} step={0.05} value={s.sfxVolume}
            onChange={(e) => set('sfxVolume', parseFloat(e.target.value))}
            className="w-full accent-[color:var(--kotfs-gold)]"
          />
        </div>
      </div>

      {/* Mouse */}
      <div className="mb-5">
        <p className="mb-1.5 flex items-center justify-between text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
          <span className="flex items-center gap-2">
            <MousePointer2 size={13} className="text-[color:var(--kotfs-gold)]" /> SENSIBILIDAD DE CÁMARA
          </span>
          <span className="kotfs-title text-[color:var(--kotfs-gold)]">{s.sensitivity.toFixed(1)}×</span>
        </p>
        <input
          type="range" min={0.3} max={2.5} step={0.1} value={s.sensitivity}
          onChange={(e) => set('sensitivity', parseFloat(e.target.value))}
          className="w-full accent-[color:var(--kotfs-gold)]"
        />
        <label className="mt-3 flex cursor-pointer items-center gap-3 text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
          <input
            type="checkbox"
            checked={s.invertY}
            onChange={(e) => set('invertY', e.target.checked)}
            className="h-4 w-4 accent-[color:var(--kotfs-gold)]"
          />
          INVERTIR EJE VERTICAL
        </label>
      </div>

      <p className="text-[0.62rem] italic text-[color:var(--kotfs-parchment-dim)] opacity-60">
        Los ajustes se guardan automáticamente en este navegador.
      </p>

      {onBack && (
        <button className="kotfs-btn mt-5 w-full" onClick={onBack}>
          Volver
        </button>
      )}
    </div>
  );
}
