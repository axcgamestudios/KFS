/**
 * Shared cinematic FX for the epic menu & loading screens: rising embers,
 * letter-by-letter title reveal and drifting sea silhouettes. All values are
 * derived from pure hash functions (no render-scope mutable state).
 */

/** Deterministic hash → 0..1 (pure; independent of render scope). */
function hashUnit(i: number, salt: number): number {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export interface EmberSpec {
  left: string;
  size: string;
  dur: string;
  delay: string;
  drift: string;
  opacity: string;
  key: number;
}

/** Pseudo-random field of rising embers. */
export function emberField(count: number, seed: number): EmberSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    left: `${(hashUnit(i, seed) * 104 - 2).toFixed(2)}%`,
    size: `${(2 + hashUnit(i + 101, seed) * 3.4).toFixed(2)}px`,
    dur: `${(10 + hashUnit(i + 202, seed) * 12).toFixed(1)}s`,
    delay: `${(-hashUnit(i + 303, seed) * 16).toFixed(1)}s`,
    drift: `${(-40 + hashUnit(i + 404, seed) * 90).toFixed(0)}px`,
    opacity: (0.35 + hashUnit(i + 505, seed) * 0.5).toFixed(2),
    key: i,
  }));
}

export function Embers({ count = 26, seed = 7 }: { count?: number; seed?: number }) {
  const embers = emberField(count, seed);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {embers.map((e) => (
        <span
          key={e.key}
          className="kotfs-ember"
          style={{
            left: e.left,
            ['--ember-size' as string]: e.size,
            ['--ember-dur' as string]: e.dur,
            ['--ember-delay' as string]: e.delay,
            ['--ember-drift' as string]: e.drift,
            ['--ember-opacity' as string]: e.opacity,
          }}
        />
      ))}
    </div>
  );
}

/** Letter-by-letter cinematic title reveal.
 *  `letterClassName` styles EACH letter (used for the gold shimmer line —
 *  gradient-clip on the parent doesn't survive transformed inline-block
 *  children, so the shine must live on the letters themselves). */
export function EpicTitle({
  text,
  delay = 0,
  className = '',
  letterClassName = '',
}: {
  text: string;
  delay?: number;
  className?: string;
  letterClassName?: string;
}) {
  return (
    <span className={className} aria-label={text}>
      {text.split('').map((ch, i) => (
        <span
          key={i}
          className={`kotfs-letter ${letterClassName}`.trim()}
          style={{ ['--letter-delay' as string]: `${delay + i * 0.055}s` }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

const WAVE_PATH =
  'M0,46 C140,86 300,10 480,42 C660,74 820,18 1000,48 C1180,78 1340,22 1520,46 C1700,72 1860,16 2040,44 C2220,72 2380,20 2560,46 L2560,120 L0,120 Z';

/** Drifting sea silhouettes along the bottom edge. */
export function SeaWaves({ horizon = false }: { horizon?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 overflow-hidden md:h-32">
      <div className="kotfs-wave" style={{ ['--wave-dur' as string]: '28s', opacity: 0.14 }}>
        <svg viewBox="0 0 2560 120" className="h-full w-full" preserveAspectRatio="none">
          <path d={WAVE_PATH} fill="#0a0f14" />
        </svg>
      </div>
      <div className="kotfs-wave" style={{ ['--wave-dur' as string]: '18s', opacity: 0.26 }}>
        <svg viewBox="0 0 2560 120" className="h-full w-full" preserveAspectRatio="none">
          <path d={WAVE_PATH} fill="#070b0f" />
        </svg>
      </div>
      {horizon && (
        <div className="kotfs-horizon absolute inset-x-0 bottom-[70%] h-[2px] bg-gradient-to-r from-transparent via-[rgba(201,162,39,0.55)] to-transparent" />
      )}
    </div>
  );
}
