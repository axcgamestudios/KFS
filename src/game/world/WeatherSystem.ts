import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/MathUtils';

/**
 * Fase 4 — dynamic weather: clear → cloudy → rain → storm cycles with
 * smooth transitions, wind strength for the vegetation shaders, rain streaks
 * around the player and thunderstorms with lightning.
 *
 * The rest of the game consumes the normalized factors:
 *  - cloudCover 0..1  (sky dome cloud threshold + darkening)
 *  - rain        0..1  (audio + rain streaks + fog)
 *  - wind        0..1  (vegetation sway, rain slant)
 *  - lightning   0..1  (flash impulse, decays fast)
 */

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm';

interface WeatherProfile {
  cloud: number;
  rain: number;
  wind: number;
  fogMul: number;
  lightMul: number;
}

const PROFILES: Record<WeatherKind, WeatherProfile> = {
  clear: { cloud: 0.18, rain: 0, wind: 0.25, fogMul: 0.9, lightMul: 1 },
  cloudy: { cloud: 0.58, rain: 0, wind: 0.45, fogMul: 1.15, lightMul: 0.86 },
  rain: { cloud: 0.82, rain: 0.65, wind: 0.6, fogMul: 1.6, lightMul: 0.62 },
  storm: { cloud: 0.97, rain: 1, wind: 1, fogMul: 1.9, lightMul: 0.42 },
};

/** Transition graph — weather never jumps, it drifts between neighbours. */
const NEXT: Record<WeatherKind, Array<[WeatherKind, number]>> = {
  clear: [['clear', 0.45], ['cloudy', 0.55]],
  cloudy: [['clear', 0.3], ['cloudy', 0.25], ['rain', 0.45]],
  rain: [['cloudy', 0.42], ['rain', 0.33], ['storm', 0.25]],
  storm: [['rain', 0.72], ['storm', 0.28]],
};

const RAIN_DROPS = 1400;
const RAIN_RADIUS = 26;
const RAIN_HEIGHT = 30;

export class WeatherSystem {
  kind: WeatherKind = 'clear';
  /** Next change timer (in-game seconds). */
  private timer = 240;
  /** Smoothed factors (damped toward the profile of `kind`). */
  cloudCover = PROFILES.clear.cloud;
  rain = 0;
  wind = 0.25;
  fogMul = 1;
  lightMul = 1;
  /** Lightning flash impulse 0..1 (decays quickly; boosts lights). */
  lightning = 0;
  /** Did the current storm already greet the player? (for notification) */
  private announced = false;
  private thunderDelay = 0;

  private lines: THREE.LineSegments;
  private positions: Float32Array;
  private speeds: Float32Array;
  private group = new THREE.Group();

  onThunder?: (distance: number) => void;
  onStormStart?: () => void;

  constructor(scene: THREE.Scene) {
    // --- Rain streaks: vertical line segments recycled around the player ---
    this.positions = new Float32Array(RAIN_DROPS * 6);
    this.speeds = new Float32Array(RAIN_DROPS);
    for (let i = 0; i < RAIN_DROPS; i++) {
      this.speeds[i] = 17 + Math.random() * 7;
      this.respawnDrop(i, true);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xa8b6c4,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      fog: true,
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.group.add(this.lines);
    scene.add(this.group);
  }

  private respawnDrop(i: number, anywhere: boolean): void {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * RAIN_RADIUS;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Local space: the group is centered on the player, drops live in [-6, +RAIN_HEIGHT]
    const y = anywhere
      ? -6 + Math.random() * (RAIN_HEIGHT + 6)
      : RAIN_HEIGHT * (0.72 + Math.random() * 0.26);
    // top vertex and bottom vertex (streak length ~0.9m)
    this.positions[i * 6] = x;
    this.positions[i * 6 + 1] = y;
    this.positions[i * 6 + 2] = z;
    this.positions[i * 6 + 3] = x + 0.14;
    this.positions[i * 6 + 4] = y - 0.9;
    this.positions[i * 6 + 5] = z + 0.1;
  }

  /** Serialize for the save system. */
  serialize(): { kind: WeatherKind; timer: number } {
    return { kind: this.kind, timer: Math.round(this.timer) };
  }

  deserialize(d: { kind: WeatherKind; timer: number } | undefined): void {
    if (!d || !PROFILES[d.kind]) return;
    this.kind = d.kind;
    this.timer = clamp(d.timer, 30, 900);
    // Snap factors to the restored profile (no 2-minute transition on load)
    const p = PROFILES[this.kind];
    this.cloudCover = p.cloud;
    this.rain = p.rain;
    this.wind = p.wind;
    this.fogMul = p.fogMul;
    this.lightMul = p.lightMul;
    this.announced = this.kind !== 'storm';
  }

  /** Force a weather kind (debug / story events). */
  force(kind: WeatherKind): void {
    if (this.kind === kind) return;
    this.kind = kind;
    this.timer = 300 + Math.random() * 240;
    this.announced = kind !== 'storm';
    if (kind === 'storm') this.onStormStart?.();
  }

  update(dt: number, center: THREE.Vector3, paused: boolean): void {
    if (!paused) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.pickNext();
      }
    }

    // Damp factors toward the current profile
    const p = PROFILES[this.kind];
    const k = 1 - Math.exp(-dt * 0.35);
    this.cloudCover = lerp(this.cloudCover, p.cloud, k);
    this.rain = lerp(this.rain, p.rain, k);
    this.wind = lerp(this.wind, p.wind, k);
    this.fogMul = lerp(this.fogMul, p.fogMul, k);
    this.lightMul = lerp(this.lightMul, p.lightMul, k);

    // Storm behaviour: lightning + delayed thunder
    if (this.lightning > 0) {
      this.lightning = Math.max(0, this.lightning - dt * 2.6);
    }
    if (this.thunderDelay > 0) {
      this.thunderDelay -= dt;
      if (this.thunderDelay <= 0) {
        this.onThunder?.(0.4 + Math.random() * 0.6);
      }
    }
    if (this.kind === 'storm' && !paused) {
      if (Math.random() < dt * 0.16) {
        // Flash now, thunder rolls in 0.8–3 s
        this.lightning = 0.85 + Math.random() * 0.15;
        this.thunderDelay = 0.8 + Math.random() * 2.2;
      }
    }

    // --- Rain streaks ---
    const raining = this.rain > 0.06;
    this.lines.visible = raining;
    if (raining) {
      const count = Math.floor(RAIN_DROPS * clamp(this.rain, 0, 1));
      const windX = this.wind * 3.4;
      const windZ = this.wind * 1.9;
      for (let i = 0; i < count; i++) {
        const speed = this.speeds[i];
        const dy = speed * dt;
        this.positions[i * 6 + 1] -= dy;
        this.positions[i * 6 + 4] -= dy;
        // Wind slant (keep streak direction consistent)
        const dx = windX * dt;
        const dz = windZ * dt;
        this.positions[i * 6] += dx;
        this.positions[i * 6 + 3] += dx;
        this.positions[i * 6 + 2] += dz;
        this.positions[i * 6 + 5] += dz;
        // Recycle when below the player's feet (local space: group rides the player)
        if (this.positions[i * 6 + 1] < -6) {
          this.respawnDrop(i, false);
        }
      }
      // The group is fully centered on the player; drops stay in local coords
      this.group.position.set(center.x, center.y, center.z);
      // drawRange hides unused drops without touching the buffer
      this.lines.geometry.setDrawRange(0, count * 2);
      (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.lines.material as THREE.LineBasicMaterial).opacity = 0.18 + this.rain * 0.2;
    }
  }

  private pickNext(): void {
    const roll = Math.random();
    let acc = 0;
    for (const [kind, w] of NEXT[this.kind]) {
      acc += w;
      if (roll <= acc) {
        if (kind !== this.kind) {
          this.kind = kind;
          this.announced = kind !== 'storm';
          if (kind === 'storm') this.onStormStart?.();
        }
        break;
      }
    }
    // Storms are brief, clear skies can linger
    const base = this.kind === 'storm' ? 150 + Math.random() * 120 : 240 + Math.random() * 420;
    this.timer = base;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
    this.group.parent?.remove(this.group);
  }
}
