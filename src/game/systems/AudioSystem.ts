import type { FootstepSurface } from '../entities/Player';
import { clamp } from '../core/MathUtils';

/**
 * Fully procedural WebAudio soundscape: wind, waves, birds, crickets,
 * footsteps per surface, UI sounds, discovery chimes and an adaptive
 * medieval music bed — zero external audio files.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;

  // Ambience nodes
  private windGain: GainNode | null = null;
  private wavesGain: GainNode | null = null;
  private waterfallGain: GainNode | null = null;
  private birdTimer = 0;
  private cricketTimer = 0;

  // Music state
  private musicTimer = 0;
  private chordIndex = 0;
  private melodyTimer = 0;
  musicIntensity = 0; // 0 calm exploration … 1 dramatic

  private volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
  private noiseBuffer: AudioBuffer | null = null;
  private started = false;

  get initialized(): boolean {
    return this.started;
  }

  /** Must be called from a user gesture. */
  init(): void {
    if (this.started) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volumes.master;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.volumes.music * 0.5;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.volumes.sfx;
      this.sfxGain.connect(this.master);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.value = 0.9;
      this.ambienceGain.connect(this.master);

      // Shared noise buffer
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const chan = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) chan[i] = Math.random() * 2 - 1;

      this.buildAmbience();
      this.started = true;
    } catch {
      this.ctx = null;
    }
  }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    return src;
  }

  private buildAmbience(): void {
    if (!this.ctx || !this.ambienceGain) return;

    // --- Wind: filtered noise with a slow gust LFO ---
    const wind = this.noiseSource();
    if (wind) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 320;
      bp.Q.value = 0.45;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.035;
      wind.connect(bp).connect(this.windGain).connect(this.ambienceGain);
      // Gust LFO
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain).connect(this.windGain.gain);
      lfo.start();
      wind.start();
    }

    // --- Waves: deep slow-breathing noise ---
    const waves = this.noiseSource();
    if (waves) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      this.wavesGain = this.ctx.createGain();
      this.wavesGain.gain.value = 0.0;
      waves.connect(lp).connect(this.wavesGain).connect(this.ambienceGain);
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.11;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain).connect(this.wavesGain.gain);
      lfo.start();
      waves.start();
    }

    // --- Waterfall rumble (gain driven by proximity) ---
    const wf = this.noiseSource();
    if (wf) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      this.waterfallGain = this.ctx.createGain();
      this.waterfallGain.gain.value = 0;
      wf.connect(lp).connect(this.waterfallGain).connect(this.ambienceGain);
      wf.start();
    }
  }

  setVolumes(v: Partial<{ master: number; music: number; sfx: number }>): void {
    this.volumes = { ...this.volumes, ...v };
    if (this.master) this.master.gain.value = this.volumes.master;
    if (this.musicGain) this.musicGain.gain.value = this.volumes.music * 0.5;
    if (this.sfxGain) this.sfxGain.gain.value = this.volumes.sfx;
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => undefined);
  }

  resume(): void {
    this.ctx?.resume().catch(() => undefined);
  }

  /**
   * Ambient mix by context. shoreDist: distance to waterline (m).
   */
  update(
    dt: number,
    ctx: {
      altitude: number;      // player Y above sea level
      shoreDist: number;     // meters (clamped 0..200, negative = in water)
      dayFactor: number;     // 0 night … 1 day
      waterfallDist: number; // meters to falls (Infinity if far)
    },
  ): void {
    if (!this.started || !this.ctx) return;

    // Wind grows with altitude
    if (this.windGain) {
      const alt = clamp(ctx.altitude / 90, 0, 1);
      this.windGain.gain.value = 0.03 + alt * 0.10;
    }
    // Waves fade with distance to shore
    if (this.wavesGain) {
      const k = 1 - clamp(ctx.shoreDist / 160, 0, 1);
      this.wavesGain.gain.value = 0.028 * k * k + (ctx.shoreDist < 0 ? 0.02 : 0);
    }
    // Waterfall proximity
    if (this.waterfallGain) {
      const k = ctx.waterfallDist < 60 ? 1 - ctx.waterfallDist / 60 : 0;
      this.waterfallGain.gain.value = 0.16 * k * k;
    }

    // Birds by day
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 2.5 + Math.random() * 7;
      if (ctx.dayFactor > 0.55 && Math.random() < 0.8) this.chirp();
    }
    // Crickets at night
    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = 1.4 + Math.random() * 2.2;
      if (ctx.dayFactor < 0.25) this.cricket();
    }

    // Music scheduling
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 7.5;
      this.playChord();
    }
    this.melodyTimer -= dt;
    if (this.melodyTimer <= 0) {
      this.melodyTimer = 2.2 + Math.random() * 3.5;
      if (Math.random() < 0.55) this.playMelodyNote();
    }
  }

  // ---------------- Ambience voices ----------------

  private chirp(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      const base = 2100 + Math.random() * 1400;
      const st = t + i * 0.09 + Math.random() * 0.04;
      osc.frequency.setValueAtTime(base, st);
      osc.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), st + 0.07);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.014, st + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
      osc.connect(g).connect(this.ambienceGain ?? this.sfxGain);
      osc.start(st);
      osc.stop(st + 0.12);
    }
  }

  private cricket(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pulses = 3;
    for (let i = 0; i < pulses; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 4300 + Math.random() * 300;
      const g = this.ctx.createGain();
      const st = t + i * 0.07;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.006, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.05);
      osc.connect(g).connect(this.ambienceGain ?? this.master!);
      osc.start(st);
      osc.stop(st + 0.06);
    }
  }

  // ---------------- Music ----------------

  /** D minor-ish progression with a calm/adaptative tint. */
  private playChord(): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const roots = [146.83, 116.54, 174.61, 130.81, 146.83, 98.0, 110.0, 146.83]; // D3 Bb2 F3 C3 D3 G2 A2 D3
    const chordTypes = [
      [0, 3, 7, 12],   // minor add
      [0, 4, 7, 12],   // major
      [0, 4, 7, 11],   // major add4
      [0, 4, 7, 12],
      [0, 3, 7, 10],   // minor 7
      [0, 4, 7, 10],   // dom 7
      [0, 4, 7, 10],
      [0, 3, 7, 12],
    ];
    const root = roots[this.chordIndex % roots.length];
    const intervals = chordTypes[this.chordIndex % chordTypes.length];
    this.chordIndex++;

    const dur = 7.0;
    intervals.forEach((semi, i) => {
      const osc = this.ctx!.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = root * Math.pow(2, semi / 12);
      osc.detune.value = (Math.random() - 0.5) * 7;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime((i === 0 ? 0.05 : 0.028) * (1 + this.musicIntensity * 0.6), t + 2.2);
      g.gain.setValueAtTime((i === 0 ? 0.05 : 0.028) * (1 + this.musicIntensity * 0.6), t + dur - 2.4);
      g.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(g).connect(this.musicGain!);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    });
    // Low drone for warmth
    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = root / 2;
    const dg = this.ctx.createGain();
    dg.gain.setValueAtTime(0, t);
    dg.gain.linearRampToValueAtTime(0.05, t + 2.5);
    dg.gain.linearRampToValueAtTime(0, t + dur);
    drone.connect(dg).connect(this.musicGain);
    drone.start(t);
    drone.stop(t + dur + 0.1);
  }

  private playMelodyNote(): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const pent = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33]; // D F G A C D
    const freq = pent[Math.floor(Math.random() * pent.length)];
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035 * (0.7 + this.musicIntensity * 0.8), t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    // Simple echo
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.28;
    osc.connect(g);
    g.connect(this.musicGain);
    g.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 2.0);
  }

  // ---------------- SFX ----------------

  private noiseBurst(opts: {
    freq: number; q?: number; type?: BiquadFilterType; dur: number; gain: number;
  }): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + opts.dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  playFootstep(surface: FootstepSurface): void {
    switch (surface) {
      case 'grass': this.noiseBurst({ freq: 480, q: 0.7, dur: 0.09, gain: 0.05 }); break;
      case 'sand': this.noiseBurst({ freq: 300, q: 0.5, type: 'lowpass', dur: 0.13, gain: 0.06 }); break;
      case 'stone': this.noiseBurst({ freq: 900, q: 1.6, dur: 0.07, gain: 0.05 }); break;
      case 'wood': this.noiseBurst({ freq: 1100, q: 3.2, dur: 0.08, gain: 0.07 }); this.tone(140, 0.06, 0.03, 'sine'); break;
    }
  }

  playUi(kind: 'hover' | 'click' | 'back'): void {
    if (kind === 'hover') this.tone(720, 0.05, 0.02, 'sine');
    else if (kind === 'click') this.tone(520, 0.09, 0.05, 'triangle', 640);
    else this.tone(420, 0.1, 0.04, 'triangle', 300);
  }

  playEvent(kind: 'discovery' | 'quest' | 'levelup' | 'chest' | 'pickup' | 'swing' | 'damage' | 'splash' | 'unlock'): void {
    switch (kind) {
      case 'discovery':
        this.tone(587.33, 0.5, 0.06, 'sine');
        this.tone(880, 0.7, 0.05, 'sine', undefined, 0.14);
        this.tone(1174.66, 0.9, 0.035, 'sine', undefined, 0.28);
        break;
      case 'quest':
        this.tone(392, 0.35, 0.06, 'triangle');
        this.tone(523.25, 0.4, 0.06, 'triangle', undefined, 0.16);
        this.tone(659.25, 0.8, 0.05, 'triangle', undefined, 0.32);
        this.tone(783.99, 1.0, 0.04, 'sine', undefined, 0.48);
        break;
      case 'levelup':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.7, 0.05, 'triangle', undefined, i * 0.12));
        break;
      case 'chest':
        this.tone(180, 0.28, 0.06, 'sawtooth', 90); // creak
        this.tone(659.25, 0.5, 0.04, 'sine', undefined, 0.2);
        this.tone(880, 0.6, 0.04, 'sine', undefined, 0.32);
        break;
      case 'pickup':
        this.tone(880, 0.14, 0.05, 'sine', 1174);
        break;
      case 'swing':
        this.noiseBurst({ freq: 1600, q: 0.8, type: 'highpass', dur: 0.16, gain: 0.07 });
        break;
      case 'damage':
        this.tone(160, 0.2, 0.09, 'sawtooth', 70);
        this.noiseBurst({ freq: 300, q: 0.6, type: 'lowpass', dur: 0.16, gain: 0.08 });
        break;
      case 'splash':
        this.noiseBurst({ freq: 800, q: 0.4, type: 'lowpass', dur: 0.5, gain: 0.12 });
        break;
      case 'unlock':
        this.tone(1200, 0.1, 0.05, 'square', 800);
        this.tone(700, 0.2, 0.05, 'triangle', undefined, 0.1);
        break;
    }
  }

  playWhooshVoice(): void {
    // Narration blip during cinematic text
    this.tone(500 + Math.random() * 160, 0.03, 0.012, 'square');
  }
}
