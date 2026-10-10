import * as THREE from 'three';

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
  private fire: SpritePool;     // dragon breath core (additive)
  private embers: SpritePool;   // small rising sparks
  private smoke: SpritePool;    // dark lingering smoke
  private sparks: SpritePool;   // weapon/block impacts (additive)
  private dust: SpritePool;     // landing dust rings
  private lights: THREE.PointLight[] = [];
  private lightTimers: number[] = [];
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.fire = new SpritePool(scene, 140, 'rgba(255,140,40,1)', true);
    this.embers = new SpritePool(scene, 50, 'rgba(255,200,90,1)', true);
    this.smoke = new SpritePool(scene, 40, 'rgba(40,36,34,0.85)', false);
    this.sparks = new SpritePool(scene, 48, 'rgba(255,230,160,1)', true);
    this.dust = new SpritePool(scene, 40, 'rgba(120,104,84,0.7)', false);
    // Two shared flickering lights for dragon fire (borrowed round-robin)
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 46, 1.7);
      l.visible = false;
      scene.add(l);
      this.lights.push(l);
      this.lightTimers.push(0);
    }
  }

  /** One frame of dragon fire breath: a cone of fire + embers from `from` toward `dir`. */
  fireBreath(from: THREE.Vector3, dir: THREE.Vector3, dt: number, power = 1): void {
    const spawnCount = Math.min(9, Math.max(2, Math.round(dt * 160 * power)));
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
      this.fire.spawn(this.tmp, 2.1 + Math.random() * 1.7 * power, 0.55 + Math.random() * 0.3, this.tmp2, {
        grow: 2.6, drag: 1.6, opacity: 0.75,
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
    this.tmp2.set(0, 1.2, 0);
    this.fire.spawn(pos, scale, 0.5, this.tmp2, { grow: 2, drag: 2, opacity: 0.5 });
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

  /** Arrow hitting terrain: tiny dust kick. */
  arrowDust(pos: THREE.Vector3): void {
    for (let i = 0; i < 3; i++) {
      this.tmp2.set((Math.random() - 0.5) * 2, Math.random() * 1.6, (Math.random() - 0.5) * 2);
      this.dust.spawn(pos, 0.4, 0.5, this.tmp2, { grow: 1.4, drag: 2.6, opacity: 0.3 });
    }
  }

  /** Grab one of the shared point lights for a moment (fire glow). */
  private borrowLight(pos: THREE.Vector3, intensity: number, time: number): void {
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
    this.fire.update(dt);
    this.embers.update(dt);
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    for (let i = 0; i < this.lights.length; i++) {
      if (this.lightTimers[i] > 0) {
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
