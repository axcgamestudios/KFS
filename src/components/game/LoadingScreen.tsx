'use client';

import { useGameStore } from '@/store/gameStore';
import { Embers, SeaWaves } from './menuFx';
import { ASSET_BASE } from '@/game/core/Graphics';

const TIPS = [
  'Ivory petals bloom where the water sings: waterfalls and ruins.',
  'The best swords are never bought: they are inherited… and tempered in Bram\'s forge.',
  'Maren gives nothing away for free… but she rewards patience.',
  'The runes of the Circle of Vigils glow when night falls.',
  'The shepherds swear a winged shadow crosses the Iceclaw peaks at dusk.',
  'Press L at nightfall: your lantern burns brighter than the moon.',
  'A smoking ship is a dying ship: get close and board her before she sinks.',
  'The wind decides your speed: watch the rose on the helm.',
  'Port and starboard broadsides recharge separately.',
  'The chests of the islands hold more gold than every tavern combined.',
  'When a dragon rears its head back, its fire is already charging: run.',
  'The axe swings slow but staggers beasts: hold the click.',
  'The spear keeps the distance; the bow erases it. Swap weapons with 1-4.',
  'Hold LMB on the ground to AIR LAUNCH a bandit — then juggle him with clicks.',
  'F fires the hook dash; press C right at impact to vault over his shoulders.',
  'A white glow warns of a quick strike; the RED flash is your window — C dodges it in slow motion.',
  'YELLOW means a heavy blow is coming: Q at the instant of impact parries it and breaks his guard.',
  'BLUE means musket fire: it cannot be blocked — roll out of the line.',
  'In the air, SPACE + click slams the ground and flattens everyone nearby.',
  'The SEA FURY bar fills as you fight: R drinks a tonic, V unleashes the finisher.',
  'Red knights haunt the roads: their camps hide good gold.',
  'Small dragons guard scales… and the scales guard secrets.',
];

/**
 * Fase 10 — cinematic loading screen: the studio key art breathing under a
 * slow ken-burns zoom, god-rays, drifting mist, the forged progress dial and
 * the tips carousel. (The old "FASE X · vX" build label is gone by request.)
 *
 * Fase 17 — fully English, and the chapter line now reads
 * CHAPTER 1 — A BRAND NEW BEGINNING (the game's official title beat).
 */
export default function LoadingScreen() {
  const progress = useGameStore((s) => s.loadProgress);
  const label = useGameStore((s) => s.loadLabel);
  const tip = TIPS[Math.floor(progress * TIPS.length) % TIPS.length];
  const done = progress >= 0.999;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#04060a]">
      {/* Key-art backdrop with slow ken-burns breathing */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={`${ASSET_BASE}menu/fondo_menu.jpg`}
          alt=""
          className="kfs-load-art absolute inset-0 h-full w-full object-cover object-top"
          draggable={false}
        />
        {/* cinematic grade: dark veil + warm horizon + vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(4,6,10,0.82) 0%, rgba(6,10,16,0.6) 40%, rgba(4,6,10,0.86) 100%),' +
              'radial-gradient(ellipse 90% 60% at 50% 112%, rgba(201,162,39,0.22), transparent 55%)',
          }}
        />
        {/* god-rays sweeping across the art */}
        <div className="kfs-load-rays absolute -inset-x-1/2 top-[-30%] h-[160%] opacity-[0.14]"
          style={{
            background:
              'repeating-linear-gradient(77deg, transparent 0px, transparent 90px, rgba(232,204,106,0.55) 120px, transparent 150px)',
            filter: 'blur(6px)',
          }}
        />
        {/* drifting mist band */}
        <div className="kfs-load-mist absolute inset-x-0 bottom-0 h-1/3 opacity-40"
          style={{
            background: 'linear-gradient(0deg, rgba(140,160,180,0.25), transparent)',
            filter: 'blur(18px)',
          }}
        />
        {/* vignette */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.72) 100%)' }}
        />
      </div>

      <Embers count={34} seed={11} />
      <SeaWaves horizon />

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center px-8">
        <p className="kotfs-rise mb-2 text-[0.65rem] tracking-[0.55em] text-[color:var(--kotfs-gold)] opacity-80" style={{ ['--rise-delay' as string]: '0.1s' }}>
          AXCGAMES STUDIOS PRESENTS
        </p>

        {/* Fase 17 — the official title beat: CHAPTER 1 — A BRAND NEW
            BEGINNING (the epic letter-by-letter title lives in the key art). */}
        <p className="kotfs-rise mb-7 mt-4 text-xs italic tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)]" style={{ ['--rise-delay' as string]: '1.1s' }}>
          CHAPTER 1 — A BRAND NEW BEGINNING
        </p>

        {/* Rune-ring progress dial */}
        <div className="kotfs-rise relative mb-6 flex h-28 w-28 items-center justify-center" style={{ ['--rise-delay' as string]: '2.25s' }}>
          {/* outer rune ring */}
          <svg viewBox="0 0 100 100" className="kotfs-compass-spin absolute inset-0 h-full w-full">
            <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(201,162,39,0.25)" strokeWidth="0.6" strokeDasharray="1.5 3" />
          </svg>
          <svg viewBox="0 0 100 100" className="kotfs-compass-spin-rev absolute inset-0 h-[86%] w-[86%] opacity-80">
            <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(201,162,39,0.16)" strokeWidth="0.5" strokeDasharray="6 4" />
          </svg>
          {/* progress arc */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(201,162,39,0.16)" strokeWidth="1.4" />
            <circle
              cx="50" cy="50" r="44" fill="none" stroke="#e8cc6a" strokeWidth="1.4"
              strokeLinecap="round" strokeDasharray="276.5"
              strokeDashoffset={276.5 - 276.5 * Math.max(0.02, progress)}
              transform="rotate(-90 50 50)"
              style={{ filter: 'drop-shadow(0 0 4px rgba(232,204,106,0.8))' }}
            />
            {/* compass needles track the progress */}
            <path d="M50 6 L52.6 50 L50 94 L47.4 50 Z" fill="rgba(201,162,39,0.5)" />
            <path d="M6 50 L50 47.6 L94 50 L50 52.4 Z" fill="rgba(201,162,39,0.5)" />
          </svg>
          <div className="flex flex-col items-center">
            <span className="kotfs-title text-2xl text-[color:var(--kotfs-gold)]" style={{ textShadow: '0 0 18px rgba(201,162,39,0.55)' }}>
              {Math.round(progress * 100)}
              <span className="text-[0.6rem] opacity-70">%</span>
            </span>
            <span className="text-[0.5rem] tracking-[0.3em] text-[color:var(--kotfs-parchment-dim)] opacity-70">
              LOADING
            </span>
          </div>
          {/* Ring pulse on progress */}
          <span className="kotfs-ring absolute inset-0 rounded-full border border-[rgba(201,162,39,0.5)]" />
        </div>

        {/* Forged progress bar */}
        <div className="kotfs-panel kotfs-panel-corner kotfs-rise w-full p-5" style={{ ['--rise-delay' as string]: '2.45s' }}>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm italic text-[color:var(--kotfs-parchment-dim)]">{label}</span>
            <span className="kotfs-title text-[0.7rem] tracking-widest text-[color:var(--kotfs-gold)]">
              {done ? 'SET SAIL!' : 'HOISTING SAILS…'}
            </span>
          </div>
          <div className="kotfs-bar relative" style={{ height: 10 }}>
            <div
              className="kotfs-bar-fill relative"
              style={{
                width: `${Math.max(2, progress * 100)}%`,
                background: 'linear-gradient(90deg, #6b5416, #c9a227, #f4dd8a)',
                boxShadow: '0 0 14px rgba(201,162,39,0.45)',
              }}
            >
              <span className="kotfs-bar-sheen" />
              {/* ember tip */}
              <span
                className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full"
                style={{ background: 'radial-gradient(circle, #ffe9a8, #e8a13c 55%, transparent 75%)', filter: 'blur(0.5px)' }}
              />
            </div>
          </div>
          <p className="mt-4 text-center text-sm italic text-[color:var(--kotfs-parchment-dim)]" key={tip}
            style={{ animation: 'kotfs-fade-in 0.7s ease' }}>
            “{tip}”
          </p>
        </div>
      </div>
    </div>
  );
}
