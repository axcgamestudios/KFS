'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore, type Notification, type SailingHud, type BossHud, type WeaponSlotHud } from '@/store/gameStore';
import {
  Compass, Heart, Wind, Anchor, Ship, Sword, Axe, Navigation, BowArrow,
  Scroll, Package, Trophy, Save, MapPin, Info, Lock, Shield, Gauge, Rabbit,
} from 'lucide-react';

/* ================================================================
   Fase 7 — HUD AAA "Brass & Iron": beveled frames, rivets, ghost
   bars, medallion, gauges. Presentational upgrade only — same store.
   ================================================================ */

function Rivets() {
  return (
    <>
      <span className="kfs-rivet kfs-rivet-tl" />
      <span className="kfs-rivet kfs-rivet-tr" />
      <span className="kfs-rivet kfs-rivet-bl" />
      <span className="kfs-rivet kfs-rivet-br" />
    </>
  );
}

/** Bar with a delayed pale "ghost" trail that shows recent damage. */
function GhostBar({
  value, max, kind, low,
}: { value: number; max: number; kind: 'hp' | 'st'; low?: boolean }) {
  const [ghost, setGhost] = useState(value);
  useEffect(() => {
    if (value >= ghost) { setGhost(value); return; }
    const t = setTimeout(() => setGhost(value), 420);
    return () => clearTimeout(t);
  }, [value, ghost]);
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const ghostPct = Math.max(pct, Math.min(100, (ghost / max) * 100));
  return (
    <div className={`kfs-bar ${low ? 'kfs-bar-low' : ''}`}>
      <div className="kfs-bar-ghost" style={{ width: `${ghostPct}%` }} />
      <div className={`kfs-bar-fill ${kind === 'hp' ? 'kfs-bar-fill-hp' : 'kfs-bar-fill-st'}`} style={{ width: `${pct}%` }} />
      <div className="kfs-bar-ticks" />
    </div>
  );
}

/** Circular level medallion with an XP progress ring. */
function XpMedallion({ level, xp, xpToNext }: { level: number; xp: number; xpToNext: number }) {
  const R = 24;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, xp / xpToNext));
  return (
    <div className="kfs-medallion" title={`Nivel ${level} · ${xp}/${xpToNext} XP`}>
      <svg width="54" height="54" viewBox="0 0 54 54">
        <circle cx="27" cy="27" r={R} fill="rgba(12,9,6,0.92)" stroke="rgba(0,0,0,0.85)" strokeWidth="5" />
        <circle cx="27" cy="27" r={R} fill="none" stroke="rgba(201,162,39,0.18)" strokeWidth="4"
          strokeDasharray={`${C} ${C}`} transform="rotate(-90 27 27)" />
        <circle cx="27" cy="27" r={R} fill="none" stroke="#e8c96a" strokeWidth="3.2"
          strokeDasharray={`${C * frac} ${C}`} strokeLinecap="round" transform="rotate(-90 27 27)"
          style={{ filter: 'drop-shadow(0 0 5px rgba(232,201,106,0.7))', transition: 'stroke-dasharray 0.5s ease' }} />
        <circle cx="27" cy="27" r="18" fill="none" stroke="rgba(201,162,39,0.28)" strokeWidth="1" />
      </svg>
      <div className="kfs-medallion-num">{level}</div>
    </div>
  );
}

/** Brass speed gauge (semicircle + needle). */
function SpeedGauge({ knots }: { knots: number }) {
  const frac = Math.min(1, Math.max(0, knots / 10));
  const angle = frac * 180 - 90;
  const arc = Math.PI * 30;
  return (
    <svg width="78" height="46" viewBox="0 0 78 46" className="shrink-0">
      <path d="M 9 40 A 30 30 0 0 1 69 40" fill="none" stroke="rgba(201,162,39,0.22)" strokeWidth="3.4" />
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i * 36 - 90) * (Math.PI / 180);
        return (
          <line key={i}
            x1={39 + Math.sin(a) * 24} y1={40 - Math.cos(a) * 24}
            x2={39 + Math.sin(a) * 30} y2={40 - Math.cos(a) * 30}
            stroke="rgba(201,162,39,0.55)" strokeWidth={i % 5 === 0 ? 2 : 1.2} />
        );
      })}
      <path d="M 9 40 A 30 30 0 0 1 69 40" fill="none" stroke="url(#kfsGaugeGrad)" strokeWidth="3.4"
        strokeDasharray={`${frac * arc} 200`} strokeLinecap="round" />
      <defs>
        <linearGradient id="kfsGaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#9cc168" />
          <stop offset="100%" stopColor="#e8c96a" />
        </linearGradient>
      </defs>
      <g transform={`rotate(${angle} 39 40)`} style={{ transition: 'transform 0.3s ease-out' }}>
        <line x1="39" y1="40" x2="39" y2="15" stroke="#f0e2b6" strokeWidth="2" />
        <circle cx="39" cy="40" r="3.4" fill="#8a6a1e" stroke="#e8c96a" strokeWidth="1" />
      </g>
    </svg>
  );
}

/** Compass strip with 15° ticks, cardinal letters and a degree readout. */
function CompassStrip() {
  const [yaw, setYaw] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      const y = (window as unknown as { __kotfsYaw?: number }).__kotfsYaw;
      if (typeof y === 'number') setYaw(y);
    }, 80);
    return () => clearInterval(iv);
  }, []);
  const deg = Math.round(((-yaw * 180) / Math.PI + 360) % 360);
  const CARDINALS: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'O' };
  const HALVES: Record<number, string> = { 45: 'NE', 135: 'SE', 225: 'SO', 315: 'NO' };

  const marks: React.ReactNode[] = [];
  for (let d = 0; d < 360; d += 15) {
    let delta = d - deg;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const px = delta * 2.7;
    if (Math.abs(px) > 158) continue;
    const cardinal = CARDINALS[d];
    const half = HALVES[d];
    if (cardinal) {
      marks.push(
        <span key={d} className="kotfs-title absolute text-[0.86rem] font-bold text-[color:#e8c96a]"
          style={{
            left: `calc(50% + ${px}px)`, top: '50%', transform: 'translate(-50%,-54%)',
            textShadow: '0 0 10px rgba(232,201,106,0.75), 0 2px 4px #000',
            opacity: 1 - Math.abs(px) / 210,
          }}>
          {cardinal}
        </span>,
      );
    } else if (half) {
      marks.push(
        <span key={d} className="kotfs-title absolute text-[0.56rem] text-[color:var(--kotfs-parchment-dim)]"
          style={{
            left: `calc(50% + ${px}px)`, top: '56%', transform: 'translateX(-50%)',
            opacity: 0.85 - Math.abs(px) / 220,
          }}>
          {half}
        </span>,
      );
    } else {
      marks.push(
        <span key={d} className="absolute w-px bg-[color:rgba(201,162,39,0.5)]"
          style={{
            left: `calc(50% + ${px}px)`, top: 7, height: d % 45 === 0 ? 8 : 5,
            opacity: 0.8 - Math.abs(px) / 220,
          }} />,
      );
    }
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="kfs-compass kotfs-compass-mask relative w-[330px]">
        {marks}
        <div className="kfs-compass-vignette" />
      </div>
      <p className="kotfs-title text-[0.56rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-75">
        {String(deg).padStart(3, '0')}°
      </p>
    </div>
  );
}

/** Turn "(E)" fragments of a prompt into brass keycaps. */
function renderPromptText(text: string) {
  return text.split(/(\([^)]+\))/g).map((p, i) => {
    const m = p.match(/^\((.+)\)$/);
    if (m) return <span key={i} className="kfs-kbd">{m[1]}</span>;
    return <span key={i}>{p}</span>;
  });
}

/* ---------------------------------------------------------------- panels */

function NotifCard({ n }: { n: Notification }) {
  const dismiss = useGameStore((s) => s.dismissNotification);
  useEffect(() => {
    const t = setTimeout(() => dismiss(n.id), 6500);
    return () => clearTimeout(t);
  }, [n.id, dismiss]);

  const conf: Record<Notification['kind'], { icon: typeof Scroll; color: string; glow?: boolean }> = {
    info: { icon: Info, color: '#c9bb9c' },
    quest: { icon: Scroll, color: '#e8c96a', glow: true },
    discovery: { icon: MapPin, color: '#e8c96a', glow: true },
    item: { icon: Package, color: '#a8c48a' },
    levelup: { icon: Trophy, color: '#ffd97a', glow: true },
    save: { icon: Save, color: '#c9bb9c' },
  };
  const c = conf[n.kind] ?? conf.info;
  const Icon = c.icon;

  return (
    <div
      className={`kfs-notif kfs-frame pointer-events-auto flex max-w-xs items-start gap-2.5 px-3.5 py-2 ${c.glow ? 'kfs-notif-glow-quest' : ''}`}
      onClick={() => dismiss(n.id)}
    >
      <span className="kfs-rivet kfs-rivet-tl" />
      <span className="kfs-rivet kfs-rivet-br" />
      <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: c.color, opacity: 0.85 }} />
      <Icon size={15} style={{ color: c.color }} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="kotfs-title text-[0.7rem] leading-tight" style={{ color: c.color }}>{n.title}</p>
        {n.body && <p className="mt-0.5 text-[0.72rem] leading-snug text-[color:var(--kotfs-parchment-dim)]">{n.body}</p>}
      </div>
    </div>
  );
}

function SailingPanel({ s }: { s: SailingHud }) {
  const sailLabel = ['RECOGIDAS', 'MEDIA VELA', 'VELA PLENA'][s.sailState];
  const windDeg = (s.windRel * 180) / Math.PI;
  const hullPct = Math.max(0, (s.hull / s.hullMax) * 100);
  return (
    <div className="kfs-frame kotfs-panel-corner absolute bottom-24 right-5 w-[272px] px-4 py-3">
      <Rivets />
      <div className="mb-2 flex items-center justify-between">
        <span className="kotfs-title flex items-center gap-1.5 text-[0.66rem] tracking-[0.22em] text-[color:var(--kotfs-parchment)]">
          <Ship size={12} className="text-[color:#e8c96a]" /> {s.shipName.toUpperCase()}
        </span>
        {s.anchored && (
          <span className="flex items-center gap-1 text-[0.58rem] tracking-widest text-[color:#e8c96a]">
            <Anchor size={10} /> FONDEADO
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <SpeedGauge knots={s.knots} />
        <div className="flex-1">
          <div className="mb-0.5 flex items-center justify-between">
            <span className="kotfs-title flex items-center gap-1 text-[0.55rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
              <Shield size={9} className="text-[color:#c05656]" /> CASCO
            </span>
            <span className="text-[0.58rem] text-[color:var(--kotfs-parchment-dim)]">{Math.round(s.hull)}/{s.hullMax}</span>
          </div>
          <GhostBar value={s.hull} max={s.hullMax} kind="hp" low={hullPct < 25} />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="kotfs-title text-[0.55rem] tracking-[0.2em] text-[color:#a8c48a]">
              <Gauge size={9} className="mr-0.5 inline" /> {sailLabel}
            </span>
            <span className="flex items-center gap-1 text-[0.55rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
              VIENTO
              <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color:rgba(201,162,39,0.45)]">
                <span className="absolute left-1/2 top-[1px] h-1 w-[2px] -translate-x-1/2 bg-[color:#e8c96a]" />
                <Wind size={11} className="text-[color:#9cc168]"
                  style={{ transform: `rotate(${windDeg}deg)`, transition: 'transform 0.3s ease' }} />
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Broadsides */}
      <div className="mt-2.5 flex items-center gap-2 border-t border-[color:rgba(201,162,39,0.2)] pt-2">
        <div className="flex-1">
          <p className="text-center text-[0.5rem] tracking-widest text-[color:var(--kotfs-parchment-dim)]">BABOR · CLIC IZQ.</p>
          <div className="kfs-bar mt-0.5 h-[5px]">
            <div className="kfs-bar-fill" style={{
              width: `${s.cdPort * 100}%`,
              background: s.cdPort >= 1
                ? 'linear-gradient(90deg,#8a6a1e,#e8c96a)'
                : 'linear-gradient(90deg,#4a3a10,#8a6a1e)',
              boxShadow: s.cdPort >= 1 ? '0 0 10px rgba(232,201,106,0.6)' : 'none',
            }} />
          </div>
        </div>
        <span className="kotfs-title text-[0.55rem] tracking-[0.18em] text-[color:var(--kotfs-parchment-dim)]">BORDADAS</span>
        <div className="flex-1">
          <p className="text-center text-[0.5rem] tracking-widest text-[color:var(--kotfs-parchment-dim)]">ESTRIBOR · CLIC DER.</p>
          <div className="kfs-bar mt-0.5 h-[5px]">
            <div className="kfs-bar-fill" style={{
              width: `${s.cdStar * 100}%`,
              background: s.cdStar >= 1
                ? 'linear-gradient(90deg,#8a6a1e,#e8c96a)'
                : 'linear-gradient(90deg,#4a3a10,#8a6a1e)',
              boxShadow: s.cdStar >= 1 ? '0 0 10px rgba(232,201,106,0.6)' : 'none',
            }} />
          </div>
        </div>
      </div>

      {s.enemy && (
        <div className="mt-2 border-t border-[color:rgba(201,162,39,0.25)] pt-1.5">
          <div className="flex items-center justify-between">
            <span className="kotfs-title text-[0.6rem] tracking-[0.15em] text-[color:#d88080]">⚓ {s.enemy.name}</span>
            <span className="text-[0.58rem] text-[color:var(--kotfs-parchment-dim)]">{Math.round(s.enemy.dist)} m</span>
          </div>
          <div className="kfs-bar mt-1 h-[6px]">
            <div className="kfs-bar-fill kfs-bar-fill-hp" style={{ width: `${s.enemy.hullFrac * 100}%` }} />
          </div>
          {s.enemy.hullFrac < 0.36 && (
            <p className="kotfs-pulse mt-1 text-center text-[0.58rem] italic text-[color:#e8c96a]">
              ¡Tocada! Acércate y <span className="kfs-kbd !h-[17px] !min-w-[17px] !text-[0.6rem]">E</span> ABORDA
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MountPanel({ m }: { m: { horseName: string; gait: string; speedKmh: number; cart: boolean } }) {
  return (
    <div className="kfs-frame absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 px-5 py-1.5">
      <Rivets />
      <Rabbit size={13} className="text-[color:#e8c96a]" />
      <span className="kotfs-title text-[0.72rem] tracking-[0.15em] text-[color:#e8c96a]">{m.horseName.toUpperCase()}</span>
      <span className="opacity-30">|</span>
      <span className="text-[0.72rem] text-[color:var(--kotfs-parchment)]">{m.gait}</span>
      <span className="opacity-30">|</span>
      <span className="text-[0.72rem] text-[color:var(--kotfs-parchment-dim)]">{m.speedKmh} km/h</span>
      {m.cart && (
        <>
          <span className="opacity-30">|</span>
          <span className="kotfs-title text-[0.62rem] tracking-widest text-[color:#e8c96a]">CARRETA</span>
        </>
      )}
      <span className="opacity-30">|</span>
      <span className="text-[0.68rem]"><span className="kfs-kbd !h-[19px] !min-w-[19px] !text-[0.62rem]">E</span> desmontar</span>
    </div>
  );
}

/** Ornate boss bar: filigree flanks, name plate, phase gems, ghost damage. */
function BossBar({ b }: { b: BossHud }) {
  const [ghost, setGhost] = useState(b.hp);
  useEffect(() => {
    if (b.hp >= ghost) { setGhost(b.hp); return; }
    const t = setTimeout(() => setGhost(b.hp), 520);
    return () => clearTimeout(t);
  }, [b.hp, ghost]);
  const pct = Math.max(0, (b.hp / b.maxHp) * 100);
  const ghostPct = Math.max(pct, Math.min(100, (ghost / b.maxHp) * 100));
  return (
    <div className="kfs-boss absolute left-1/2 top-16 w-[min(600px,74vw)] -translate-x-1/2">
      <div className="kfs-frame px-6 py-2.5" style={{ borderColor: 'rgba(192,86,86,0.5)' }}>
        <Rivets />
        <div className="flex items-center justify-center gap-3">
          <svg width="64" height="18" viewBox="0 0 64 18" className="opacity-70">
            <path d="M62,9 C46,1 34,17 18,9 C11,5.5 6,7 2,9" fill="none" stroke="#c9a227" strokeWidth="1.3" />
            <circle cx="2" cy="9" r="1.8" fill="#c9a227" />
          </svg>
          <span className="kotfs-title text-[0.92rem] tracking-[0.24em] text-[color:#e09090] kotfs-shadow-text">
            {b.name.toUpperCase()}
          </span>
          <svg width="64" height="18" viewBox="0 0 64 18" className="opacity-70" style={{ transform: 'scaleX(-1)' }}>
            <path d="M62,9 C46,1 34,17 18,9 C11,5.5 6,7 2,9" fill="none" stroke="#c9a227" strokeWidth="1.3" />
            <circle cx="2" cy="9" r="1.8" fill="#c9a227" />
          </svg>
        </div>
        <div className="mt-1 flex items-baseline justify-center gap-2">
          <span className="text-[0.62rem] italic tracking-wider text-[color:var(--kotfs-parchment-dim)]">{b.title}</span>
          {b.phase > 1 && (
            <span className="flex items-center gap-1.5">
              {[1, 2, 3].slice(0, Math.max(2, b.phase)).map((p) => (
                <span key={p} className={`kfs-gem ${p <= b.phase ? 'kfs-gem-lit' : ''}`} />
              ))}
            </span>
          )}
        </div>
        <div className="kfs-bar mt-1.5 h-[11px]">
          <div className="kfs-bar-ghost" style={{ width: `${ghostPct}%`, background: 'linear-gradient(90deg,rgba(238,200,180,0.8),rgba(192,86,86,0.7))' }} />
          <div className="kfs-bar-fill" style={{
            width: `${pct}%`,
            background: pct > 40
              ? 'linear-gradient(180deg,#c46a5a 0%,#8f2f2f 45%,#5c1a19 100%)'
              : 'linear-gradient(180deg,#e8a05a 0%,#c05a20 45%,#7a2f0e 100%)',
            boxShadow: '0 0 16px rgba(220,80,50,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
          }} />
          <div className="kfs-bar-ticks" />
        </div>
      </div>
    </div>
  );
}

/** Weapon action bar (keys 1-4) with brass keycaps. */
function WeaponSlots({ slots }: { slots: WeaponSlotHud[] }) {
  if (slots.length === 0) return null;
  const icons: Record<string, typeof Sword> = { sword: Sword, axe: Axe, spear: Navigation, bow: BowArrow };
  return (
    <div className="absolute bottom-24 right-5 flex gap-2">
      {slots.map((s) => {
        const Icon = icons[s.kind] ?? Sword;
        return (
          <div
            key={s.id}
            className={`kfs-slot ${s.equipped ? 'kfs-slot-equipped' : s.owned ? 'kfs-slot-owned' : 'kfs-slot-locked'}`}
            title={s.name}
          >
            <span className="kfs-keycap">{s.slot}</span>
            {s.owned
              ? <Icon size={20} className={s.equipped ? 'text-[color:#ffe9a6]' : 'text-[color:var(--kotfs-parchment-dim)]'} />
              : <Lock size={15} className="text-[color:var(--kotfs-parchment-dim)]" />}
            <span className={`kotfs-title max-w-[56px] truncate text-center text-[0.44rem] tracking-wide ${
              s.equipped ? 'text-[color:var(--kotfs-parchment)]' : 'text-[color:var(--kotfs-parchment-dim)]'
            }`}>
              {s.name.toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- root */

export default function HUD() {
  const health = useGameStore((s) => s.health);
  const maxHealth = useGameStore((s) => s.maxHealth);
  const stamina = useGameStore((s) => s.stamina);
  const maxStamina = useGameStore((s) => s.maxStamina);
  const clock = useGameStore((s) => s.clock);
  const dayCount = useGameStore((s) => s.dayCount);
  const prompt = useGameStore((s) => s.prompt);
  const questTracker = useGameStore((s) => s.questTracker);
  const discovery = useGameStore((s) => s.discovery);
  const notifications = useGameStore((s) => s.notifications);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const xpToNext = useGameStore((s) => s.xpToNext);
  const overlay = useGameStore((s) => s.overlay);
  const dialogue = useGameStore((s) => s.dialogue);
  const sailing = useGameStore((s) => s.sailing);
  const boss = useGameStore((s) => s.boss);
  const weaponSlots = useGameStore((s) => s.weaponSlots);
  const bowDraw = useGameStore((s) => s.bowDraw);
  const atHelm = useGameStore((s) => s.atHelm);
  const mount = useGameStore((s) => s.mount);
  const hurtFlash = useGameStore((s) => s.hurtFlash);
  const combo = useGameStore((s) => s.combo);
  const staminaOut = useRef(false);
  if (stamina <= 0.5 && !staminaOut.current) staminaOut.current = true;
  if (stamina > 8 && staminaOut.current) staminaOut.current = false;

  const hidden = overlay !== null || dialogue !== null;
  if (hidden) return null;

  const lowHp = health / maxHealth < 0.28;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* --- Top center: compass + clock --- */}
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1">
        <CompassStrip />
        <p className="kotfs-title flex items-center gap-2 text-[0.6rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-85">
          <span>DÍA {dayCount}</span>
          <span className="h-3 w-px bg-[color:rgba(201,162,39,0.5)]" />
          <span>{clock}</span>
        </p>
      </div>

      {/* --- Boss health bar --- */}
      {boss && <BossBar b={boss} />}

      {/* --- Fase 9 — combo chain indicator (cinematic combat) --- */}
      {combo && !atHelm && (
        <div className="absolute left-1/2 top-[64px] -translate-x-1/2 text-center">
          <p
            className="kotfs-title text-lg tracking-[0.24em] text-[color:#e8c96a]"
            style={{ textShadow: '0 1px 10px rgba(0,0,0,0.85)' }}
          >
            {combo.counter ? '¡CONTRAATAQUE!' : `CADENA ×${combo.step + 1}`}
          </p>
          <p className="text-[0.58rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] uppercase">
            {combo.counter ? 'golpea ahora — daño ×1.6' : combo.step >= 1 ? 'sigue — remate a la tercera' : 'encadena' }
          </p>
        </div>
      )}

      {/* --- Top right: quest tracker scroll --- */}
      {questTracker && (
        <div className="kfs-frame absolute right-4 top-4 max-w-[300px] px-4 py-2.5 text-right">
          <Rivets />
          <p className="kotfs-title flex items-center justify-end gap-1.5 text-[0.6rem] tracking-[0.3em] text-[color:#e8c96a] opacity-95">
            <Scroll size={10} /> MISIÓN ACTUAL
          </p>
          <p className="kotfs-title mt-1 text-[0.92rem] leading-tight text-[color:var(--kotfs-parchment)] kotfs-shadow-text">
            {questTracker.title}
          </p>
          <ul className="mt-1.5 space-y-1">
            {questTracker.objectives.map((o, i) => (
              <li key={i} className={`flex items-center justify-end gap-2 text-[0.74rem] leading-snug kotfs-shadow-text ${
                o.done ? 'text-[color:var(--kotfs-parchment-dim)] line-through opacity-55' : 'text-[color:var(--kotfs-parchment)]'
              }`}>
                <span className={`inline-block h-[7px] w-[7px] rotate-45 ${o.done ? 'bg-[color:#4a4232]' : 'bg-[color:#e8c96a]'}`}
                  style={!o.done ? { boxShadow: '0 0 6px rgba(232,201,106,0.8)' } : undefined} />
                {o.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Bottom left: vitals + medallion --- */}
      <div className="absolute bottom-5 left-5 flex items-end gap-3">
        <XpMedallion level={level} xp={xp} xpToNext={xpToNext} />
        <div className="kfs-frame w-56 px-4 pb-3 pt-2.5">
          <Rivets />
          <div className="mb-1 flex items-center justify-between">
            <span className="kotfs-title flex items-center gap-1.5 text-[0.6rem] tracking-[0.22em] text-[color:var(--kotfs-parchment-dim)]">
              <Heart size={11} className="text-[color:#e06a5a]" /> SALUD
            </span>
            <span className="kotfs-title text-[0.62rem] text-[color:var(--kotfs-parchment)]">
              {Math.round(health)}<span className="opacity-50">/{maxHealth}</span>
            </span>
          </div>
          <GhostBar value={health} max={maxHealth} kind="hp" low={lowHp} />
          <div className="mb-1 mt-2.5 flex items-center justify-between">
            <span className="kotfs-title flex items-center gap-1.5 text-[0.6rem] tracking-[0.22em] text-[color:var(--kotfs-parchment-dim)]">
              <Wind size={11} className="text-[color:#9cc168]" /> RESISTENCIA
            </span>
            <span className="kotfs-title text-[0.62rem] text-[color:var(--kotfs-parchment)]">
              {Math.round(stamina)}<span className="opacity-50">/{maxStamina}</span>
            </span>
          </div>
          <div className={staminaOut.current ? 'kfs-stamina-out' : ''}>
            <GhostBar value={stamina} max={maxStamina} kind="st" />
          </div>
        </div>
      </div>

      {/* --- Bottom center: interaction prompt --- */}
      {prompt && (
        <div className="kfs-prompt absolute bottom-[12vh] left-1/2 -translate-x-1/2">
          <div className="kfs-frame px-6 py-2">
            <Rivets />
            <p className="kotfs-shadow-text text-[0.92rem] tracking-wide text-[color:var(--kotfs-parchment)]">
              {renderPromptText(prompt)}
            </p>
          </div>
        </div>
      )}

      {/* --- Naval / mount panels --- */}
      {sailing && <SailingPanel s={sailing} />}
      {mount && !atHelm && <MountPanel m={mount} />}

      {/* --- Weapon quick-slots (on foot) --- */}
      {!atHelm && <WeaponSlots slots={weaponSlots} />}

      {/* --- Bow reticle --- */}
      {!atHelm && bowDraw >= 0 && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {(() => {
            const gap = 7 + (1 - Math.max(0, bowDraw)) * 20;
            const len = 9;
            return (
              <div className="relative h-1 w-1">
                <span className="kfs-reticle-tick" style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: len, transform: `translate(-50%,-50%) translateY(-${gap}px)`, opacity: 0.9 }} />
                <span className="kfs-reticle-tick" style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: len, transform: `translate(-50%,-50%) translateY(${gap}px)`, opacity: 0.9 }} />
                <span className="kfs-reticle-tick" style={{ position: 'absolute', left: '50%', top: '50%', width: len, height: 2, transform: `translate(-50%,-50%) translateX(-${gap}px)`, opacity: 0.9 }} />
                <span className="kfs-reticle-tick" style={{ position: 'absolute', left: '50%', top: '50%', width: len, height: 2, transform: `translate(-50%,-50%) translateX(${gap}px)`, opacity: 0.9 }} />
                <span className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:#e8c96a]"
                  style={{ boxShadow: '0 0 6px rgba(232,201,106,0.9)' }} />
              </div>
            );
          })()}
        </div>
      )}

      {/* --- Damage vignette / low-health pulse --- */}
      {hurtFlash !== 0 && (
        <div key={hurtFlash} className="kotfs-hurt-vignette pointer-events-none absolute inset-0" />
      )}
      {lowHp && !sailing && <div className="kfs-lowhp" />}

      {/* --- Keymap hints --- */}
      <div className="absolute bottom-5 right-5 text-right text-[0.6rem] leading-[1.7] tracking-wider text-[color:var(--kotfs-parchment-dim)] opacity-60">
        {sailing ? (
          <>
            <p><span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">W</span><span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">S</span> velas · <span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">A</span><span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">D</span> timón · <span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">ESPACIO</span> fondear</p>
            <p>CLIC IZQ./DER. bordadas · <span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">E</span> desembarcar / abordar</p>
            {boss && <p className="text-[color:#e8c96a]">¡APUNTA LAS BORDADAS AL WYVERN!</p>}
          </>
        ) : (
          <>
            <p>CLIC atacar (mantén = pesado) · CLIC DER. bloquear · <span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">C</span> esquivar</p>
            <p><span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">1</span>–<span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">4</span> armas · <span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">MAYÚS</span> correr · <span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">ESPACIO</span> saltar · <span className="kfs-kbd !h-[16px] !min-w-[16px] !text-[0.55rem]">E</span> interactuar</p>
          </>
        )}
      </div>

      {/* --- Top left: notifications --- */}
      <div className="pointer-events-auto absolute left-4 top-4 flex flex-col gap-2">
        {notifications.map((n) => <NotifCard key={n.id} n={n} />)}
      </div>

      {/* --- Center: discovery banner --- */}
      {discovery && (
        <div className="kfs-discovery absolute left-1/2 top-[26%] w-[min(520px,80vw)] -translate-x-1/2 text-center">
          <p className="kotfs-title text-[0.62rem] tracking-[0.6em] text-[color:#e8c96a]">
            — LUGAR DESCUBIERTO —
          </p>
          <div className="kfs-discovery-line mx-auto mt-1.5 w-2/3" />
          <h3 className="kotfs-title mt-2 text-[2rem] leading-tight text-[color:var(--kotfs-parchment)]"
            style={{ textShadow: '0 0 34px rgba(201,162,39,0.55), 0 4px 16px #000' }}>
            {discovery.title}
          </h3>
          <p className="mt-1 text-[0.85rem] italic text-[color:var(--kotfs-parchment-dim)]">{discovery.sub}</p>
          <div className="kfs-discovery-line mx-auto mt-2 w-1/2" />
        </div>
      )}

      {/* Decorative compass icon */}
      <div className="absolute left-1/2 top-[4.4rem] hidden -translate-x-1/2 opacity-50 lg:block">
        <Compass size={11} className="text-[color:#e8c96a]" />
      </div>
    </div>
  );
}
