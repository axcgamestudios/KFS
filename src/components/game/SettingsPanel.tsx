'use client';

import { useEffect, useState } from 'react';
import { gameApi } from '@/game/api';
import type { Settings } from '@/game/systems/SaveSystem';
import { applyPreset, type GraphicsSettings } from '@/game/core/Graphics';
import {
  Monitor, Music, Volume2, MousePointer2, Waves, CloudSun, Flame, Sprout, Gauge, Sparkles, Eye,
} from 'lucide-react';

type QualityKey = 'xlow' | 'low' | 'medium' | 'high' | 'ultra';

const QUALITY_LABEL: Record<QualityKey, string> = {
  xlow: 'Ultra Bajo — máxima optimización',
  low: 'Baja — equipos modestos',
  medium: 'Media — recomendada',
  high: 'Alta — equipos potentes',
  ultra: 'Ultra — todo al máximo',
};

/** Interruptor estilo consola con la paleta del juego. */
function Toggle({
  on, onChange, label, hint, icon,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`group flex w-full items-center justify-between gap-3 border px-3 py-2 text-left transition ${
        on
          ? 'border-[color:rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.08)]'
          : 'border-[color:rgba(201,162,39,0.22)] bg-[rgba(0,0,0,0.25)] hover:border-[color:rgba(201,162,39,0.5)]'
      }`}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[0.7rem] tracking-[0.14em] text-[color:var(--kotfs-parchment)]">
          {icon}{label}
        </span>
        {hint && (
          <span className="mt-0.5 block text-[0.58rem] leading-tight text-[color:var(--kotfs-parchment-dim)] opacity-75">
            {hint}
          </span>
        )}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 border transition-colors ${
          on
            ? 'border-[color:var(--kotfs-gold)] bg-[rgba(201,162,39,0.28)]'
            : 'border-[color:rgba(201,162,39,0.35)] bg-[rgba(0,0,0,0.4)]'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[14px] w-[14px] transition-all duration-150 ${
            on
              ? 'left-[20px] bg-[color:var(--kotfs-gold)] shadow-[0_0_6px_rgba(201,162,39,0.7)]'
              : 'left-[3px] bg-[color:rgba(230,220,190,0.45)]'
          }`}
        />
      </span>
    </button>
  );
}

export default function SettingsPanel({ onBack }: { onBack?: () => void }) {
  const [s, setS] = useState<Settings>(() => gameApi.settings());

  useEffect(() => {
    gameApi.applySettings(s);
  }, [s]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
  };

  /** Cambiar un interruptor gráfico individual → la config pasa a CUSTOM. */
  const setGfx = <K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]) => {
    setS((prev) => ({ ...prev, [key]: value, quality: 'custom' as const }));
  };

  const isCustom = s.quality === 'custom';

  return (
    <div className="flex w-full flex-col">
      <h3 className="kotfs-title mb-4 text-sm tracking-[0.25em] text-[color:var(--kotfs-gold)]">
        AJUSTES
      </h3>

      {/* ================= GRÁFICOS ================= */}
      <div className="mb-5">
        <p className="mb-2 flex items-center justify-between text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
          <span className="flex items-center gap-2">
            <Monitor size={13} className="text-[color:var(--kotfs-gold)]" /> CALIDAD GRÁFICA
          </span>
          {isCustom && (
            <span className="border border-[color:rgba(201,162,39,0.5)] px-1.5 py-0.5 text-[0.55rem] tracking-[0.2em] text-[color:var(--kotfs-gold)]">
              PERSONALIZADO
            </span>
          )}
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {(['xlow', 'low', 'medium', 'high', 'ultra'] as const).map((q) => (
            <button
              key={q}
              onClick={() => setS((prev) => applyPreset(prev, q))}
              className={`border px-1 py-2 text-center text-[0.62rem] transition ${
                !isCustom && s.quality === q
                  ? 'border-[color:var(--kotfs-gold)] bg-[rgba(201,162,39,0.12)] text-[color:var(--kotfs-parchment)]'
                  : 'border-[color:rgba(201,162,39,0.25)] text-[color:var(--kotfs-parchment-dim)] hover:border-[color:var(--kotfs-gold)]'
              }`}
            >
              <span className="kotfs-title block">{q === 'xlow' ? 'X-BAJA' : q.toUpperCase()}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.62rem] italic text-[color:var(--kotfs-parchment-dim)] opacity-70">
          {isCustom ? 'Configuración a tu medida — cada interruptor manda.' : QUALITY_LABEL[s.quality as QualityKey]}
        </p>
      </div>

      {/* Interruptores individuales */}
      <div className="mb-2">
        <p className="mb-2 text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
          <Gauge size={13} className="mr-2 inline text-[color:var(--kotfs-gold)]" />
          DETALLE DEL MUNDO
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <Toggle
            on={s.waves} onChange={(v) => setGfx('waves', v)}
            label="OLEAJE" hint="Olas del mar (las estelas siguen)"
            icon={<Waves size={12} className="text-[color:var(--kotfs-gold)]" />}
          />
          <Toggle
            on={s.shadows} onChange={(v) => setGfx('shadows', v)}
            label="SOMBRAS" hint="Sombras proyectadas del sol"
            icon={<CloudSun size={12} className="text-[color:var(--kotfs-gold)]" />}
          />
          <Toggle
            on={s.realLights} onChange={(v) => setGfx('realLights', v)}
            label="LUCES REALISTAS" hint="Antorchas, farol y fuego dinámico"
            icon={<Flame size={12} className="text-[color:var(--kotfs-gold)]" />}
          />
          <Toggle
            on={s.grass3d} onChange={(v) => setGfx('grass3d', v)}
            label="PASTO 3D" hint="Prado instanciado con viento"
            icon={<Sprout size={12} className="text-[color:var(--kotfs-gold)]" />}
          />
          <Toggle
            on={s.postfx} onChange={(v) => setGfx('postfx', v)}
            label="EFECTOS CINE" hint="Bloom cinematográfico (caro)"
            icon={<Sparkles size={12} className="text-[color:var(--kotfs-gold)]" />}
          />
          <Toggle
            on={s.showFps} onChange={(v) => setGfx('showFps', v)}
            label="MOSTRAR FPS" hint="Contador en el HUD"
            icon={<Eye size={12} className="text-[color:var(--kotfs-gold)]" />}
          />
        </div>
      </div>

      {/* Reflejo del mar — 3 niveles */}
      <div className="mb-4">
        <p className="mb-1.5 flex items-center justify-between text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
          <span className="flex items-center gap-2">
            <Sparkles size={13} className="text-[color:var(--kotfs-gold)]" /> REFLEJO DEL MAR
          </span>
          <span className="kotfs-title text-[0.62rem] text-[color:var(--kotfs-gold)]">
            {s.reflections === 0 ? 'APAGADO' : s.reflections === 1 ? 'BAJA' : 'ALTA'}
          </span>
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {([0, 1, 2] as const).map((r) => (
            <button
              key={r}
              onClick={() => setGfx('reflections', r)}
              className={`border px-2 py-1.5 text-[0.62rem] tracking-[0.12em] transition ${
                s.reflections === r
                  ? 'border-[color:var(--kotfs-gold)] bg-[rgba(201,162,39,0.12)] text-[color:var(--kotfs-parchment)]'
                  : 'border-[color:rgba(201,162,39,0.25)] text-[color:var(--kotfs-parchment-dim)] hover:border-[color:var(--kotfs-gold)]'
              }`}
            >
              {r === 0 ? 'APAGADO' : r === 1 ? 'BAJA' : 'ALTA'}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[0.58rem] italic text-[color:var(--kotfs-parchment-dim)] opacity-70">
          Te ves reflejado en el agua — lo más caro del juego: baja o apágalo si va a tirones.
        </p>
      </div>

      {/* Distancia de renderizado (chunks) */}
      <div className="mb-4">
        <p className="mb-1.5 flex items-center justify-between text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
          <span className="flex items-center gap-2">
            <Gauge size={13} className="text-[color:var(--kotfs-gold)]" /> DISTANCIA DE RENDERIZADO
          </span>
          <span className="kotfs-title text-[0.65rem] text-[color:var(--kotfs-gold)]">
            {s.renderChunks} chunks · {s.renderChunks * 64} m
          </span>
        </p>
        <input
          type="range" min={2} max={10} step={1} value={s.renderChunks}
          onChange={(e) => setGfx('renderChunks', parseInt(e.target.value, 10))}
          className="w-full accent-[color:var(--kotfs-gold)]"
        />
        <div className="mt-0.5 flex justify-between text-[0.55rem] text-[color:var(--kotfs-parchment-dim)] opacity-70">
          <span>2 · rápido</span>
          <span>6</span>
          <span>10 · lejano</span>
        </div>
      </div>

      {/* Resolución interna */}
      <div className="mb-5">
        <p className="mb-1.5 flex items-center justify-between text-xs tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">
          <span className="flex items-center gap-2">
            <Monitor size={13} className="text-[color:var(--kotfs-gold)]" /> RESOLUCIÓN
          </span>
          <span className="kotfs-title text-[0.65rem] text-[color:var(--kotfs-gold)]">
            {Math.round(s.resolution * 100)}%
          </span>
        </p>
        <input
          type="range" min={0.5} max={1.5} step={0.05} value={s.resolution}
          onChange={(e) => setGfx('resolution', parseFloat(e.target.value))}
          className="w-full accent-[color:var(--kotfs-gold)]"
        />
        <div className="mt-0.5 flex justify-between text-[0.55rem] text-[color:var(--kotfs-parchment-dim)] opacity-70">
          <span>50% · ligero</span>
          <span>100%</span>
          <span>150% · nítido</span>
        </div>
        <p className="mt-1 text-[0.58rem] italic text-[color:var(--kotfs-parchment-dim)] opacity-70">
          Menos resolución = muchos más FPS. El antialias se decide al recargar la página.
        </p>
      </div>

      {/* ================= AUDIO ================= */}
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

      {/* ================= CÁMARA ================= */}
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
        Los ajustes se guardan automáticamente y se aplican al instante.
      </p>

      {onBack && (
        <button className="kotfs-btn mt-5 w-full" onClick={onBack}>
          Volver
        </button>
      )}
    </div>
  );
}
