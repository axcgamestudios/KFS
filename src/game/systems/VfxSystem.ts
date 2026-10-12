import * as THREE from 'three';
import { getFlameFX } from '../world/FlameFX';
import { gfxRuntime } from '../core/Graphics';

/**
 * Pooled combat/creature VFX (Fase 3): dragon fire, embers, smoke, weapon
 * sparks, block clangs and landing dust. Everything is pre-allocated and
 * recycled — strict caps keep the GPU load bounded no matter how many
 * dragons breathe at once.
 */

interface PooledSprite {
  sp: THREE.Sprite;
  t: number;
  dur: number;
  grow: number;
  vel: THREE.Vector3;
  drag: number;
  gravity: number;
  fade: number;
}

class SpritePool {
  private sprites: THREE.Sprite[] = [];
  private active: PooledSprite[] = [];

  constructor(
    scene: THREE.Scene,
    count: number,
    color: string,
    private additive: boolean,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, color);
    grad.addColorStop(0.55, additive ? color : 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }));
      sp.visible = false;
      sp.frustumCulled = false;
      scene.add(sp);
      this.sprites.push(sp);
    }
  }

  spawn(
    pos: THREE.Vector3,
    scale: number,
    dur: number,
    vel: THREE.Vector3,
    opts: { grow?: number; drag?: number; gravity?: number; fade?: number; opacity?: number } = {},
  ): void {
    const sp = this.sprites.find((s) => !s.visible);
    if (!sp) return; // cap reached — silently drop
    sp.position.copy(pos);
    sp.scale.setScalar(scale);
    (sp.material as THREE.SpriteMaterial).opacity = opts.opacity ?? 0.9;
    sp.visible = true;
    this.active.push({
      sp, t: 0, dur,
      grow: opts.grow ?? 1.4,
      vel: vel.clone(),
      drag: opts.drag ?? 0.4,
      gravity: opts.gravity ?? 0,
      fade: opts.fade ?? 1,
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += dt;
      const k = a.t / a.dur;
      if (k >= 1) {
        a.sp.visible = false;
        this.active.splice(i, 1);
        continue;
      }
      const mat = a.sp.material as THREE.SpriteMaterial;
      mat.opacity = (0.9 - 0.9 * Math.pow(k, a.fade)) * 1;
      a.sp.scale.multiplyScalar(1 + a.grow * dt);
      // Velocity integration with drag + gravity
      const damp = Math.max(0, 1 - a.drag * dt);
      a.vel.multiplyScalar(damp);
      a.vel.y += a.gravity * dt;
      a.sp.position.addScaledVector(a.vel, dt);
    }
  }
}

export class VfxSystem {
  private embers: SpritePool;   // small rising sparks
  private smoke: SpritePool;    // dark lingering smoke
  private sparks: SpritePool;   // weapon/block impacts (additive)
  private dust: SpritePool;     // landing dust rings
  private splash: SpritePool;   // Fase 4: water splashes (white foam, additive)
  private frost: SpritePool;    // Fase 12: elemental sword — ice shards
  private storm: SpritePool;    // Fase 12: elemental sword — arcing sparks
  private lights: THREE.PointLight[] = [];
  private lightTimers: number[] = [];
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    // Fase 7 — real shader flames live in the shared FlameFX singleton
    getFlameFX(scene);
    this.embers = new SpritePool(scene, 50, 'rgba(255,200,90,1)', true);
    this.smoke = new SpritePool(scene, 40, 'rgba(40,36,34,0.85)', false);
    this.sparks = new SpritePool(scene, 48, 'rgba(255,230,160,1)', true);
    this.dust = new SpritePool(scene, 40, 'rgba(120,104,84,0.7)', false);
    this.splash = new SpritePool(scene, 48, 'rgba(214,234,244,1)', true);
    this.frost = new SpritePool(scene, 40, 'rgba(158,220,255,1)', true);
    this.storm = new SpritePool(scene, 40, 'rgba(196,160,255,1)', true);
    // Two shared flickering lights for dragon fire (borrowed round-robin)
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 46, 1.7);
      l.visible = false;
      scene.add(l);
      this.lights.push(l);
      this.lightTimers.push(0);
    }
  }

  /** One frame of dragon fire breath: a cone of real shader flames + embers
   *  from `from` toward `dir`. */
  fireBreath(from: THREE.Vector3, dir: THREE.Vector3, dt: number, power = 1): void {
    const fx = getFlameFX();
    // Fase 8 — fewer, hotter tongues: the additive stack was saturating
    // into a milky cone. 6/frame with lower opacity reads as true fire.
    const spawnCount = Math.min(6, Math.max(2, Math.round(dt * 100 * power)));
    for (let i = 0; i < spawnCount; i++) {
      const dist = Math.random() * 9 * power;
      this.tmp.copy(from).addScaledVector(dir, dist);
      // Spread grows with distance (cone)
      const spread = 0.35 + dist * 0.16;
      this.tmp.x += (Math.random() - 0.5) * spread * 2;
      this.tmp.y += (Math.random() - 0.5) * spread * 1.4;
      this.tmp.z += (Math.random() - 0.5) * spread * 2;
      this.tmp2.copy(dir).multiplyScalar(11 + Math.random() * 7);
      this.tmp2.y += 0.8;
      // white-hot near the mouth → cooler oranges down the cone
      const heat = 0.85 - Math.min(0.55, dist * 0.07);
      fx.spawn(this.tmp, 1.0 + Math.random() * 0.75 * power, 0.5 + Math.random() * 0.32, this.tmp2, {
        heat, grow: 2.2, drag: 1.5, gravity: 0.5, opacity: 0.55,
      });
      if (Math.random() < 0.3) {
        this.tmp2.copy(dir).multiplyScalar(6 + Math.random() * 8);
        this.tmp2.y += 2.5 + Math.random() * 2;
        this.embers.spawn(this.tmp, 0.4 + Math.random() * 0.5, 0.9 + Math.random() * 0.6, this.tmp2, {
          grow: 0.4, drag: 0.9, gravity: 1.6,
        });
      }
    }
    // Trailing smoke
    if (Math.random() < 0.55) {
      this.tmp.copy(from).addScaledVector(dir, 3 + Math.random() * 7);
      this.tmp2.copy(dir).multiplyScalar(2.5);
      this.smoke.spawn(this.tmp, 2.4, 1.6 + Math.random(), this.tmp2, { grow: 1.5, drag: 1.2, opacity: 0.4 });
    }
    // Shared fire light
    this.borrowLight(from, 2.6 * power, 0.3);
  }

  /** Small fire puff (mouth glow while charging, crash impacts). */
  firePuff(pos: THREE.Vector3, scale = 1.6): void {
    getFlameFX().burst(pos, scale * 0.8, 4, 0.7);
    this.borrowLight(pos, 1.6, 0.3);
  }

  /** Weapon impact on scales/flesh: bright sparks + a dark smoke wisp. */
  weaponImpact(pos: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      this.tmp2.set(
        (Math.random() - 0.5) * 5,
        Math.random() * 3.4,
        (Math.random() - 0.5) * 5,
      );
      this.sparks.spawn(pos, 0.28 + Math.random() * 0.3, 0.28 + Math.random() * 0.2, this.tmp2, {
        grow: 0.6, drag: 2.2, gravity: -6.5,
      });
    }
    this.tmp2.set(0, 0.8, 0);
    this.smoke.spawn(pos, 0.5, 0.7, this.tmp2, { grow: 1.6, drag: 2, opacity: 0.3 });
  }

  /** Metallic clang when the player blocks a hit. */
  blockSparks(pos: THREE.Vector3): void {
    for (let i = 0; i < 8; i++) {
      this.tmp2.set(
        (Math.random() - 0.5) * 6,
        Math.random() * 4,
        (Math.random() - 0.5) * 6,
      );
      this.sparks.spawn(pos, 0.22 + Math.random() * 0.24, 0.24, this.tmp2, {
        grow: 0.5, drag: 2.4, gravity: -7,
      });
    }
  }

  /** Dust ring when a heavy creature lands. */
  landingDust(pos: THREE.Vector3, count = 12, scale = 1): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      this.tmp2.set(Math.cos(a) * (2 + Math.random() * 2.5), 0.6 + Math.random(), Math.sin(a) * (2 + Math.random() * 2.5));
      this.dust.spawn(pos, 1.2 * scale, 0.9 + Math.random() * 0.5, this.tmp2, {
        grow: 1.9, drag: 1.7, opacity: 0.45,
      });
    }
  }

  /** Ground thud for heavy footsteps of big creatures. */
  stepDust(pos: THREE.Vector3, scale = 0.6): void {
    this.tmp2.set(0, 0.8, 0);
    this.dust.spawn(pos, 0.9 * scale, 0.6, this.tmp2, { grow: 1.7, drag: 2.2, opacity: 0.3 });
  }

  /** Fase 4 — water splash: entry dives, climbing out, hooves in shallows. */
  waterSplash(pos: THREE.Vector3, strength = 1): void {
    const n = Math.min(14, 4 + Math.round(strength * 9));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.5;
      this.tmp.set(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
      const up = 1.8 + Math.random() * 2.6 * strength;
      this.tmp2.set((Math.random() - 0.5) * 2.6 * strength, up, (Math.random() - 0.5) * 2.6 * strength);
      this.splash.spawn(this.tmp, 0.3 + Math.random() * 0.45 * strength, 0.65 + Math.random() * 0.4, this.tmp2, {
        grow: 1.5, drag: 1.1, gravity: -7.5, opacity: 0.85,
      });
    }
    // foam ring
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.tmp2.set(Math.cos(a) * 1.4, 0.35, Math.sin(a) * 1.4);
      this.splash.spawn(pos, 0.8 + Math.random() * 0.5, 0.8, this.tmp2, {
        grow: 2.2, drag: 2.6, opacity: 0.4,
      });
    }
  }

  /** Fase 12 — an elemental sword connected: element-coloured burst. */
  elementalBurst(pos: THREE.Vector3, element: 'fire' | 'frost' | 'storm'): void {
    if (element === 'fire') {
      // a gout of flame + embers at the impact
      for (let i = 0; i < 7; i++) {
        this.tmp2.set((Math.random() - 0.5) * 3.4, Math.random() * 2.6, (Math.random() - 0.5) * 3.4);
        this.embers.spawn(pos, 0.3 + Math.random() * 0.35, 0.5 + Math.random() * 0.3, this.tmp2, {
          grow: 1.2, drag: 1.6, gravity: 1.2,
        });
      }
      this.smoke.spawn(pos, 0.7, 0.9, this.tmp2.set(0, 1, 0), { grow: 1.6, drag: 2, opacity: 0.3 });
    } else if (element === 'frost') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.tmp2.set(Math.cos(a) * 2.4, 0.8 + Math.random() * 1.6, Math.sin(a) * 2.4);
        this.frost.spawn(pos, 0.2 + Math.random() * 0.26, 0.42 + Math.random() * 0.25, this.tmp2, {
          grow: 0.7, drag: 2.2, gravity: -2.2,
        });
      }
    } else {
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2;
        this.tmp2.set(Math.cos(a) * (2 + Math.random() * 3), Math.random() * 2.2, Math.sin(a) * (2 + Math.random() * 3));
        this.storm.spawn(pos, 0.16 + Math.random() * 0.22, 0.3 + Math.random() * 0.2, this.tmp2, {
          grow: 0.4, drag: 3.0, gravity: -1.2,
        });
      }
    }
  }

  /** Fase 12 — living elemental trail off an equipped legendary blade. */
  elementalTrail(pos: THREE.Vector3, element: 'fire' | 'frost' | 'storm'): void {
    if (element === 'fire') {
      this.tmp2.set((Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5);
      this.embers.spawn(pos, 0.12 + Math.random() * 0.14, 0.5, this.tmp2, {
        grow: 0.8, drag: 1.4, gravity: 0.9, opacity: 0.8,
      });
    } else if (element === 'frost') {
      this.tmp2.set((Math.random() - 0.5) * 0.35, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.35);
      this.frost.spawn(pos, 0.09 + Math.random() * 0.1, 0.55, this.tmp2, {
        grow: 0.4, drag: 1.8, gravity: -0.5, opacity: 0.75,
      });
    } else {
      this.tmp2.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9);
      this.storm.spawn(pos, 0.07 + Math.random() * 0.08, 0.28, this.tmp2, {
        grow: 0.3, drag: 2.4, gravity: 0, opacity: 0.9,
      });
    }
  }

  /** Arrow hitting terrain: tiny dust kick. */
  arrowDust(pos: THREE.Vector3): void {
    for (let i = 0; i < 3; i++) {
      this.tmp2.set((Math.random() - 0.5) * 2, Math.random() * 1.6, (Math.random() - 0.5) * 2);
      this.dust.spawn(pos, 0.4, 0.5, this.tmp2, { grow: 1.4, drag: 2.6, opacity: 0.3 });
    }
  }

  /** Grab one of the shared point lights for a moment (fire glow). */
  private borrowLight(pos: THREE.Vector3, intensity: number, time: number): void {
    if (!gfxRuntime.pointLights) return; // Fase 13 — luces realistas OFF
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < this.lights.length; i++) {
      if (this.lightTimers[i] <= 0) { idx = i; best = -1; break; }
      if (this.lightTimers[i] < best) { best = this.lightTimers[i]; idx = i; }
    }
    const l = this.lights[idx];
    l.position.copy(pos);
    l.intensity = Math.max(l.intensity, intensity);
    l.visible = true;
    this.lightTimers[idx] = Math.max(this.lightTimers[idx], time);
  }

  update(dt: number): void {
    getFlameFX().update(); // frame-guarded: safe alongside TorchSystem's call
    this.embers.update(dt);
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    this.frost.update(dt);
    this.storm.update(dt);
    for (let i = 0; i < this.lights.length; i++) {
      if (this.lightTimers[i] > 0) {
        if (!gfxRuntime.pointLights) { // Fase 13 — apagado instantáneo
          this.lightTimers[i] = 0;
          this.lights[i].intensity = 0;
          this.lights[i].visible = false;
          continue;
        }
        this.lightTimers[i] -= dt;
        this.lights[i].intensity *= Math.max(0, 1 - dt * 6);
        if (this.lightTimers[i] <= 0) {
          this.lights[i].intensity = 0;
          this.lights[i].visible = false;
        }
      }
    }
  }
}
