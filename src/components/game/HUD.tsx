'use client';

import { useEffect, useState } from 'react';
import { useGameStore, type Notification, type SailingHud, type BossHud, type WeaponSlotHud } from '@/store/gameStore';
import { Compass, Heart, Mountain, Wind, Anchor, Ship, Sword, Axe, Navigation, BowArrow } from 'lucide-react';

/** Compass strip with cardinal points sliding by camera yaw. */
function CompassStrip() {
  // Camera yaw comes from the store (updated via prompt cycle) — we approximate
  // using a subscription-free approach: the Game writes yaw into window.__kotfsYaw.
  const [yaw, setYaw] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      const y = (window as unknown as { __kotfsYaw?: number }).__kotfsYaw;
      if (typeof y === 'number') setYaw(y);
    }, 100);
    return () => clearInterval(iv);
  }, []);

  const deg = ((-yaw * 180) / Math.PI + 360) % 360;
  const points: Array<{ label: string; angle: number }> = [
    { label: 'N', angle: 0 }, { label: 'NE', angle: 45 },
    { label: 'E', angle: 90 }, { label: 'SE', angle: 135 },
    { label: 'S', angle: 180 }, { label: 'SO', angle: 225 },
    { label: 'O', angle: 270 }, { label: 'NO', angle: 315 },
  ];

  return (
    <div className="kotfs-compass-mask relative h-7 w-72 overflow-hidden border-x border-[color:rgba(201,162,39,0.3)] bg-black/35">
      <div className="absolute inset-0 flex items-center justify-center">
        {points.map((p) => {
          let delta = p.angle - deg;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          const px = delta * 2.2;
          if (Math.abs(px) > 140) return null;
          return (
            <span
              key={p.label}
              className={`kotfs-title absolute text-xs ${
                p.label.length === 1 ? 'text-[color:var(--kotfs-gold)]' : 'text-[color:var(--kotfs-parchment-dim)]'
              }`}
              style={{ left: `calc(50% + ${px}px)`, transform: 'translateX(-50%)', opacity: 1 - Math.abs(px) / 170 }}
            >
              {p.label}
            </span>
          );
        })}
        {/* Center marker */}
        <span className="absolute left-1/2 top-0.5 h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-[color:var(--kotfs-gold)]" />
      </div>
    </div>
  );
}

function NotifCard({ n }: { n: Notification }) {
  const dismiss = useGameStore((s) => s.dismissNotification);
  useEffect(() => {
    const t = setTimeout(() => dismiss(n.id), 6500);
    return () => clearTimeout(t);
  }, [n.id, dismiss]);

  const colors: Record<Notification['kind'], string> = {
    info: 'var(--kotfs-parchment-dim)',
    quest: 'var(--kotfs-gold)',
    discovery: 'var(--kotfs-gold)',
    item: 'var(--kotfs-parchment)',
    levelup: 'var(--kotfs-gold)',
    save: 'var(--kotfs-parchment-dim)',
  };

  return (
    <div className="kotfs-notif kotfs-panel max-w-xs px-4 py-2.5" onClick={() => dismiss(n.id)}>
      <p className="kotfs-title text-[0.7rem]" style={{ color: colors[n.kind] }}>
        {n.title}
      </p>
      {n.body && (
        <p className="mt-0.5 text-xs leading-snug text-[color:var(--kotfs-parchment-dim)]">{n.body}</p>
      )}
    </div>
  );
}

/** Naval panel: hull, speed, sails, wind & broadside readiness. */
function SailingPanel({ s }: { s: SailingHud }) {
  const sailLabel = ['RECOGIDAS', 'MEDIA VELA', 'VELA PLENA'][s.sailState];
  const windDeg = (s.windRel * 180) / Math.PI;
  const hullPct = Math.max(0, (s.hull / s.hullMax) * 100);
  return (
    <div className="kotfs-panel kotfs-panel-corner absolute bottom-20 right-5 w-64 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="kotfs-title flex items-center gap-1.5 text-[0.62rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
          <Ship size={11} className="text-[color:var(--kotfs-gold)]" /> {s.shipName.toUpperCase()}
        </span>
        {s.anchored && (
          <span className="flex items-center gap-1 text-[0.6rem] tracking-widest text-[color:var(--kotfs-gold)]">
            <Anchor size={10} /> FONDEADO
          </span>
        )}
      </div>
      {/* Hull */}
      <div className="mb-1 flex items-center justify-between">
        <span className="kotfs-title text-[0.58rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">CASCO</span>
        <span className="text-[0.58rem] text-[color:var(--kotfs-parchment-dim)]">{Math.round(s.hull)}/{s.hullMax}</span>
      </div>
      <div className="kotfs-bar">
        <div
          className="kotfs-bar-fill"
          style={{
            width: `${hullPct}%`,
            background: hullPct > 50
              ? 'linear-gradient(90deg,#4a6d3a,#7fa050)'
              : hullPct > 25
                ? 'linear-gradient(90deg,#8a6a1e,#c9a227)'
                : 'linear-gradient(90deg,#7a1f1f,#c05656)',
          }}
        />
      </div>
      {/* Speed · sails · wind */}
      <div className="mt-2.5 flex items-center justify-between">
        <div>
          <p className="kotfs-title text-[0.58rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">VELOCIDAD</p>
          <p className="kotfs-title text-lg leading-none text-[color:var(--kotfs-parchment)]">
            {s.knots.toFixed(1)}<span className="ml-1 text-[0.6rem] opacity-60">NUDOS</span>
          </p>
        </div>
        <div className="text-center">
          <p className="kotfs-title text-[0.58rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">VELAS</p>
          <p className="kotfs-title text-[0.72rem] leading-tight text-[color:var(--kotfs-gold)]">{sailLabel}</p>
        </div>
        <div className="flex flex-col items-center">
          <p className="kotfs-title text-[0.58rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">VIENTO</p>
          <div className="relative mt-0.5 h-7 w-7 rounded-full border border-[color:rgba(201,162,39,0.4)]">
            {/* Arrow shows where the wind pushes relative to the bow */}
            <div
              className="absolute left-1/2 top-1/2 h-0 w-0"
              style={{
                transform: `translate(-50%,-50%) rotate(${windDeg}deg)`,
              }}
            >
              <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ transform: `rotate(${windDeg}deg)` }}>
                <Wind size={13} className="text-[color:#9cc168]" />
              </div>
            </div>
            <span className="absolute left-1/2 top-[1px] h-1 w-[2px] -translate-x-1/2 bg-[color:var(--kotfs-gold)]" />
          </div>
        </div>
      </div>
      {/* Broadside readiness */}
      <div className="mt-2.5 flex items-center gap-2">
        <span className="kotfs-title text-[0.55rem] tracking-[0.15em] text-[color:var(--kotfs-parchment-dim)]">BORDADAS</span>
        <div className="flex flex-1 items-center gap-1.5">
          <div className="flex-1">
            <p className="text-center text-[0.5rem] tracking-widest text-[color:var(--kotfs-parchment-dim)]">BABOR · CLIC IZQ.</p>
            <div className="kotfs-bar mt-0.5 h-[4px]">
              <div className="kotfs-bar-fill" style={{ width: `${s.cdPort * 100}%`, background: s.cdPort >= 1 ? '#c9a227' : '#6b5416' }} />
            </div>
          </div>
          <div className="flex-1">
            <p className="text-center text-[0.5rem] tracking-widest text-[color:var(--kotfs-parchment-dim)]">ESTRIBOR · CLIC DER.</p>
            <div className="kotfs-bar mt-0.5 h-[4px]">
              <div className="kotfs-bar-fill" style={{ width: `${s.cdStar * 100}%`, background: s.cdStar >= 1 ? '#c9a227' : '#6b5416' }} />
            </div>
          </div>
        </div>
      </div>
      {/* Enemy contact */}
      {s.enemy && (
        <div className="mt-2 border-t border-[color:rgba(201,162,39,0.25)] pt-2">
          <div className="flex items-center justify-between">
            <span className="kotfs-title text-[0.6rem] tracking-[0.15em] text-[color:#c05656]">⚓ {s.enemy.name}</span>
            <span className="text-[0.58rem] text-[color:var(--kotfs-parchment-dim)]">{Math.round(s.enemy.dist)} m</span>
          </div>
          <div className="kotfs-bar mt-1 h-[4px]">
            <div className="kotfs-bar-fill kotfs-bar-hp" style={{ width: `${s.enemy.hullFrac * 100}%` }} />
          </div>
          {s.enemy.hullFrac < 0.36 && (
            <p className="mt-1 text-center text-[0.58rem] italic text-[color:var(--kotfs-gold)]">¡Tocada! Acércate y ABORDA (E)</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Boss health bar with phase pips (Fase 3). */
/** Fase 4 — riding HUD: horse name, gait, speed and cart state. */
function MountPanel({ m }: { m: { horseName: string; gait: string; speedKmh: number; cart: boolean } }) {
  return (
    <div className="kotfs-panel kotfs-panel-corner absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 flex items-center gap-3 text-xs tracking-wider">
      <span className="kotfs-title text-[color:var(--kotfs-gold)]">{m.horseName.toUpperCase()}</span>
      <span className="opacity-40">|</span>
      <span className="text-[color:var(--kotfs-parchment)]">{m.gait}</span>
      <span className="opacity-40">|</span>
      <span className="text-[color:var(--kotfs-parchment-dim)]">{m.speedKmh} km/h</span>
      {m.cart && (
        <>
          <span className="opacity-40">|</span>
          <span className="text-[color:var(--kotfs-gold)]">CARRETA ENGANCHADA</span>
        </>
      )}
      <span className="opacity-40">|</span>
      <span className="text-[color:var(--kotfs-parchment-dim)] text-[10px]">E desmontar</span>
    </div>
  );
}

function BossBar({ b }: { b: BossHud }) {
  const pct = Math.max(0, (b.hp / b.maxHp) * 100);
  return (
    <div className="absolute left-1/2 top-16 w-[min(560px,72vw)] -translate-x-1/2">
      <div className="kotfs-panel px-5 py-2.5" style={{ borderColor: 'rgba(192,86,86,0.45)' }}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="kotfs-title text-sm tracking-[0.2em] text-[color:#d88080] kotfs-shadow-text">
            {b.name.toUpperCase()}
          </span>
          <span className="text-[0.6rem] italic tracking-wider text-[color:var(--kotfs-parchment-dim)]">
            {b.title}
          </span>
          {b.phase > 1 && (
            <span className="kotfs-title text-[0.58rem] tracking-widest text-[color:var(--kotfs-gold)]">
              FASE {b.phase}
            </span>
          )}
        </div>
        <div className="kotfs-bar mt-1.5 h-[9px]">
          <div
            className="kotfs-bar-fill"
            style={{
              width: `${pct}%`,
              background: pct > 40
                ? 'linear-gradient(90deg,#6e1f1f,#c05656)'
                : 'linear-gradient(90deg,#8a2f0f,#e08a3a)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Weapon quick-slots (keys 1-4). */
function WeaponSlots({ slots }: { slots: WeaponSlotHud[] }) {
  if (slots.length === 0) return null;
  const icons: Record<string, typeof Sword> = { sword: Sword, axe: Axe, spear: Navigation, bow: BowArrow };
  return (
    <div className="absolute bottom-24 right-5 flex flex-col gap-1.5">
      {slots.map((s) => {
        const Icon = icons[s.kind] ?? Sword;
        return (
          <div
            key={s.id}
            className={`flex items-center gap-2 border px-2.5 py-1.5 ${
              s.equipped
                ? 'border-[color:var(--kotfs-gold)] bg-black/55'
                : s.owned
                  ? 'border-[color:rgba(201,162,39,0.3)] bg-black/35'
                  : 'border-[color:rgba(120,120,120,0.15)] bg-black/25 opacity-35'
            }`}
          >
            <span className="kotfs-title w-3 text-center text-[0.6rem] text-[color:var(--kotfs-parchment-dim)]">
              {s.slot}
            </span>
            <Icon size={14} className={s.equipped ? 'text-[color:var(--kotfs-gold)]' : 'text-[color:var(--kotfs-parchment-dim)]'} />
            <span
              className={`kotfs-title text-[0.62rem] tracking-wider ${
                s.equipped ? 'text-[color:var(--kotfs-parchment)]' : 'text-[color:var(--kotfs-parchment-dim)]'
              }`}
            >
              {s.name.toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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

  const hidden = overlay !== null || dialogue !== null;
  if (hidden) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* --- Top center: compass + clock --- */}
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1">
        <CompassStrip />
        <p className="text-[0.65rem] tracking-[0.25em] text-[color:var(--kotfs-parchment-dim)] opacity-80">
          DÍA {dayCount} · {clock}
        </p>
      </div>

      {/* --- Boss health bar (Fase 3) --- */}
      {boss && <BossBar b={boss} />}

      {/* --- Top right: quest tracker --- */}
      {questTracker && (
        <div className="absolute right-4 top-4 max-w-xs text-right">
          <p className="kotfs-title text-[0.65rem] tracking-[0.25em] text-[color:var(--kotfs-gold)] opacity-90">
            MISIÓN ACTUAL
          </p>
          <p className="kotfs-title mt-0.5 text-sm text-[color:var(--kotfs-parchment)] kotfs-shadow-text">
            {questTracker.title}
          </p>
          <ul className="mt-1 space-y-0.5">
            {questTracker.objectives.map((o, i) => (
              <li
                key={i}
                className={`text-xs leading-snug kotfs-shadow-text ${
                  o.done
                    ? 'text-[color:var(--kotfs-parchment-dim)] line-through opacity-60'
                    : 'text-[color:var(--kotfs-parchment)]'
                }`}
              >
                {o.done ? '✓' : '·'} {o.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Bottom left: vitals --- */}
      <div className="absolute bottom-5 left-5 w-52">
        <div className="mb-1 flex items-center justify-between">
          <span className="kotfs-title flex items-center gap-1.5 text-[0.62rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
            <Heart size={11} className="text-[color:#c05656]" /> SALUD
          </span>
          <span className="text-[0.62rem] text-[color:var(--kotfs-parchment-dim)]">
            {Math.round(health)}
          </span>
        </div>
        <div className="kotfs-bar">
          <div className="kotfs-bar-fill kotfs-bar-hp" style={{ width: `${(health / maxHealth) * 100}%` }} />
        </div>
        <div className="mb-1 mt-2.5 flex items-center justify-between">
          <span className="kotfs-title flex items-center gap-1.5 text-[0.62rem] tracking-[0.2em] text-[color:var(--kotfs-parchment-dim)]">
            <Wind size={11} className="text-[color:#9cc168]" /> RESISTENCIA
          </span>
          <span className="text-[0.62rem] text-[color:var(--kotfs-parchment-dim)]">
            {Math.round(stamina)}
          </span>
        </div>
        <div className="kotfs-bar">
          <div className="kotfs-bar-fill kotfs-bar-st" style={{ width: `${(stamina / maxStamina) * 100}%` }} />
        </div>
        {/* XP micro-bar */}
        <div className="mt-2.5 flex items-center gap-2">
          <Mountain size={11} className="text-[color:var(--kotfs-gold)] opacity-80" />
          <span className="kotfs-title text-[0.6rem] tracking-[0.15em] text-[color:var(--kotfs-gold)] opacity-90">
            NIVEL {level}
          </span>
          <div className="kotfs-bar h-[3px] flex-1">
            <div
              className="kotfs-bar-fill"
              style={{ width: `${(xp / xpToNext) * 100}%`, background: 'linear-gradient(90deg,#6b5416,#c9a227)' }}
            />
          </div>
        </div>
      </div>

      {/* --- Bottom center: interaction prompt --- */}
      {prompt && (
        <div className="absolute bottom-[12vh] left-1/2 -translate-x-1/2">
          <div className="kotfs-panel px-5 py-2">
            <p className="kotfs-shadow-text text-sm tracking-wide text-[color:var(--kotfs-parchment)]">
              {prompt}
            </p>
          </div>
        </div>
      )}

      {/* --- Bottom right: naval panel (when aboard) --- */}
      {sailing && <SailingPanel s={sailing} />}
      {mount && !atHelm && <MountPanel m={mount} />}

      {/* --- Weapon quick-slots (on foot, Fase 3; hidden at the helm) --- */}
      {!atHelm && <WeaponSlots slots={weaponSlots} />}

      {/* --- Bow crosshair while drawing --- */}
      {!atHelm && bowDraw >= 0 && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className="rounded-full border border-[color:var(--kotfs-gold)] transition-all"
            style={{
              width: `${10 + (1 - Math.max(0, bowDraw)) * 26}px`,
              height: `${10 + (1 - Math.max(0, bowDraw)) * 26}px`,
              opacity: 0.35 + Math.max(0, bowDraw) * 0.5,
            }}
          />
          <span className="absolute left-1/2 top-1/2 h-[2px] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--kotfs-gold)]" />
        </div>
      )}

      {/* --- Damage vignette --- */}
      {hurtFlash !== 0 && (
        <div
          key={hurtFlash}
          className="kotfs-hurt-vignette pointer-events-none absolute inset-0"
        />
      )}

      {/* --- Bottom right: keymap hint --- */}
      <div className="absolute bottom-5 right-5 text-right text-[0.6rem] leading-relaxed tracking-wider text-[color:var(--kotfs-parchment-dim)] opacity-50">
        {sailing ? (
          <>
            <p>W/S VELAS · A/D TIMÓN · ESPACIO FONDEAR</p>
            <p>CLIC IZQ./DER. BORDADAS · RUEDA ZOOM · E DESEMBARCAR/ABORDAR</p>
            {boss && <p className="text-[color:var(--kotfs-gold)]">¡APUNTA LAS BORDADAS AL WYVERN!</p>}
          </>
        ) : (
          <>
            <p>CLIC ATACAR (MANTÉN = PESADO) · CLIC DER. BLOQUEAR · C ESQUIVAR</p>
            <p>1-4 ARMAS · WASD MOVER · MAYÚS CORRER · ESPACIO SALTAR · E INTERACTUAR</p>
          </>
        )}
      </div>

      {/* --- Top left: notifications --- */}
      <div className="pointer-events-auto absolute left-4 top-4 flex flex-col gap-2">
        {notifications.map((n) => (
          <NotifCard key={n.id} n={n} />
        ))}
      </div>

      {/* --- Center: discovery banner --- */}
      {discovery && (
        <div className="absolute left-1/2 top-[26%] -translate-x-1/2 text-center">
          <div className="kotfs-discovery">
            <p className="kotfs-title text-[0.6rem] tracking-[0.6em] text-[color:var(--kotfs-gold)]">
              LUGAR DESCUBIERTO
            </p>
            <h3
              className="kotfs-title mt-1 text-3xl text-[color:var(--kotfs-parchment)]"
              style={{ textShadow: '0 0 30px rgba(201,162,39,0.5), 0 4px 14px #000' }}
            >
              {discovery.title}
            </h3>
            <p className="mt-1 text-sm italic text-[color:var(--kotfs-parchment-dim)]">{discovery.sub}</p>
          </div>
        </div>
      )}

      {/* Decorative compass icon (visual anchor, top-left corner) */}
      <div className="absolute left-1/2 top-1.5 -translate-x-1/2 opacity-60">
        <Compass size={12} className="text-[color:var(--kotfs-gold)]" />
      </div>
    </div>
  );
}
