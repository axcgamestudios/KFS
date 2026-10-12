import * as THREE from 'three';

/**
 * Fase 7 — FlameFX: procedural fire.
 *
 * Every flame is a camera-facing quad driven by a small shader: an fbm
 * turbulence field eats away a teardrop silhouette and the remaining energy
 * maps through an incandescent ramp (deep red → orange → yellow → white
 * core). No textures, no sprites — real fire licks that scroll, wobble and
 * gutter. Two flavours:
 *
 *   · PersistentFlame — torches, braziers, bonfires: it lives forever, flutters
 *     in-shader and can be driven externally (setIntensity) so the point
 *     light and the flame flicker in sync.
 *   · Transient pool — dragon breath / impact bursts: spawned with a velocity,
 *     grows, drag+gravity, fades out. Same lifecycle API as the old sprite
 *     pool so VfxSystem keeps its structure.
 *
 * All materials share ONE uTime uniform object (a single write per frame) and
 * one compiled program instance; per-flame variety comes from uSeed.
 */

// ---------------------------------------------------------------- shader

const VERT = /* glsl */ `
  uniform float uScaleX;
  uniform float uScaleY;
  uniform float uSeed;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // in-shader gutter: the tongue of fire stretches and squashes
    float squash = sin(uTime * 12.0 + uSeed * 41.0) * 0.07
                 + sin(uTime * 4.3 + uSeed * 13.0) * 0.05;
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.x += position.x * uScaleX;
    mv.y += position.y * uScaleY * (1.0 + squash) + uScaleY * 0.5; // anchor = base
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uHeat;
  uniform float uFlicker;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + vec2(11.3, 7.7);
      a *= 0.55;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 2.4 + uSeed * 37.0;

    // teardrop silhouette: wide rounded base, tapering tip
    float taper = smoothstep(0.0, 1.0, uv.y);
    float halfW = mix(0.30, 0.05, taper * taper);
    float cx = abs(uv.x - 0.5) + uv.y * 0.10;
    float body = 1.0 - smoothstep(halfW, halfW * 2.4, cx);

    // turbulence erodes the silhouette; licks scroll upward
    float n1 = fbm(vec2(uv.x * 3.6 + uSeed * 9.0, uv.y * 2.4 - t * 0.85));
    float n2 = fbm(vec2(uv.x * 7.0 - t * 0.33 + uSeed, uv.y * 5.4 - t * 1.5));
    float f = clamp((body * 1.9 - n1 * 1.02 - n2 * 0.58) * 2.3, 0.0, 1.0);

    // hard cut at the very base + soft dissolve at the tip
    f *= smoothstep(0.0, 0.10, uv.y);
    f *= 1.0 - smoothstep(0.62, 1.0, uv.y + (n1 - 0.5) * 0.35);
    f = pow(f, 1.62);
    if (f < 0.012) discard;

    // Incandescent ramp — Fase 8 retune II: fire is ORANGE, never white.
    // The previous top end (1.0, 0.86, 0.42) read as a milky core once ACES
    // tone mapping + additive stacking had their way. Keep every stop warm:
    // ember red → torch orange → amber, and the hottest core stays ORANGE.
    vec3 col = mix(vec3(0.42, 0.024, 0.002), vec3(0.92, 0.24, 0.010), smoothstep(0.03, 0.44, f));
    col = mix(col, vec3(1.0, 0.46, 0.045), smoothstep(0.40, 0.78, f));
    col = mix(col, vec3(1.0, 0.62, 0.14), smoothstep(0.80, 0.99, f) * (0.3 + 0.7 * uHeat));
    col *= 0.84 + 0.28 * uHeat;
    // hard warm ceiling: a fire never burns whiter than deep orange
    col = min(col, vec3(1.0, 0.64, 0.22));

    // auto flicker for free-running flames (uFlicker = 1)
    float flick = 1.0 - uFlicker * (0.14 + 0.12 * sin(uTime * 11.0 + uSeed * 17.0) * sin(uTime * 4.7 + uSeed * 5.0));

    gl_FragColor = vec4(col, f * uIntensity * flick);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- core

/** One pooled transient flame (dragon breath, bursts). */
interface TransientFlame {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
  vel: THREE.Vector3;
  drag: number;
  gravity: number;
  grow: number;
  baseOpacity: number;
  baseScale: number;
  active: boolean;
}

export interface PersistentFlameHandle {
  /** External flicker drive (0..1). Pass -1 to let the shader flutter alone. */
  setIntensity(k: number): void;
  position: THREE.Vector3;
  dispose(): void;
}

class PersistentFlame implements PersistentFlameHandle {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor(
    mesh: THREE.Mesh,
    mat: THREE.ShaderMaterial,
    public position: THREE.Vector3,
    private owner: FlameFX,
  ) {
    this.mesh = mesh;
    this.mat = mat;
  }
  setIntensity(k: number): void {
    if (k < 0) {
      this.mat.uniforms.uFlicker.value = 1;
      this.mat.uniforms.uIntensity.value = 1;
    } else {
      this.mat.uniforms.uFlicker.value = 0;
      this.mat.uniforms.uIntensity.value = Math.max(0, Math.min(1.4, k));
    }
  }
  dispose(): void {
    this.owner.removePersistent(this);
  }
}

export class FlameFX {
  /** Shared across EVERY flame material — one write advances all shaders. */
  private timeU: { value: number } = { value: 0 };
  private geo = new THREE.PlaneGeometry(1, 1);
  private baseMat: THREE.ShaderMaterial;
  private persistent: PersistentFlame[] = [];
  private pool: TransientFlame[] = [];
  private embers: THREE.Points | null = null;
  private emberData: {
    origin: THREE.Vector3;
    vel: Float32Array;
    life: Float32Array;
    maxLife: Float32Array;
  } | null = null;
  private lastNow = 0;

  constructor(private scene: THREE.Scene) {
    this.baseMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: this.timeU,
        uSeed: { value: 0 },
        uIntensity: { value: 1 },
        uHeat: { value: 0.35 },
        uFlicker: { value: 1 },
        uScaleX: { value: 0.5 },
        uScaleY: { value: 0.8 },
      } as unknown as Record<string, THREE.IUniform>,
    });
  }

  private makeMaterial(seed: number, heat: number, sx: number, sy: number, flicker: number): THREE.ShaderMaterial {
    const mat = this.baseMat.clone();
    // cloned uniforms are deep-copied — re-tie uTime to the shared object
    mat.uniforms.uTime = this.timeU;
    mat.uniforms.uSeed.value = seed;
    mat.uniforms.uHeat.value = heat;
    mat.uniforms.uFlicker.value = flicker;
    mat.uniforms.uScaleX.value = sx;
    mat.uniforms.uScaleY.value = sy;
    mat.uniforms.uIntensity.value = 1;
    return mat;
  }

  // ---------------------------------------------------------- persistent

  /** A fire that never goes out: torch, brazier, bonfire. */
  addFlame(
    pos: THREE.Vector3,
    opts: { scale?: number; height?: number; heat?: number; embers?: number } = {},
  ): PersistentFlameHandle {
    const scale = opts.scale ?? 0.5;
    const height = opts.height ?? scale * 1.7;
    const seed = Math.random() * 100;
    const mat = this.makeMaterial(seed, opts.heat ?? 0.3, scale, height, 1);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.copy(pos);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.name = 'flame_fx';
    this.scene.add(mesh);
    const flame = new PersistentFlame(mesh, mat, mesh.position, this);
    this.persistent.push(flame);
    if (opts.embers) this.addEmbers(pos, opts.embers, opts.height ?? height);
    return flame;
  }

  removePersistent(f: PersistentFlame): void {
    const i = this.persistent.indexOf(f);
    if (i >= 0) this.persistent.splice(i, 1);
    this.scene.remove(f.mesh);
    f.mat.dispose();
  }

  // ---------------------------------------------------------- embers

  /** Rising sparks for the big fires (a single Points cloud, CPU animated). */
  private addEmbers(pos: THREE.Vector3, count: number, spread: number): void {
    if (this.emberData) {
      // one cloud serves all persistent fires: extend in place
      const d = this.emberData;
      const n0 = d.vel.length / 3;
      const grown = new Float32Array((n0 + count) * 3);
      grown.set(d.vel);
      const life2 = new Float32Array(n0 + count);
      const max2 = new Float32Array(n0 + count);
      life2.set(d.life); max2.set(d.maxLife);
      for (let i = n0; i < n0 + count; i++) {
        grown[i * 3] = pos.x + (Math.random() - 0.5) * spread * 0.5;
        grown[i * 3 + 1] = pos.y + Math.random() * 0.3;
        grown[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread * 0.5;
        life2[i] = Math.random();
        max2[i] = 1.6 + Math.random() * 1.8;
      }
      d.vel = grown;
      d.life = life2;
      d.maxLife = max2;
      // rebuild the attribute arrays
      this.buildEmbersGeometry();
      return;
    }
    this.emberData = {
      origin: pos.clone(),
      vel: new Float32Array(count * 3),
      life: new Float32Array(count),
      maxLife: new Float32Array(count),
    };
    for (let i = 0; i < count; i++) {
      this.emberData.vel[i * 3] = pos.x + (Math.random() - 0.5) * spread * 0.5;
      this.emberData.vel[i * 3 + 1] = pos.y + Math.random() * 0.3;
      this.emberData.vel[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread * 0.5;
      this.emberData.life[i] = Math.random();
      this.emberData.maxLife[i] = 1.6 + Math.random() * 1.8;
    }
    this.buildEmbersGeometry();
  }

  private buildEmbersGeometry(): void {
    const d = this.emberData!;
    const n = d.vel.length / 3;
    if (this.embers) {
      this.embers.geometry.dispose();
      this.scene.remove(this.embers);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.vel), 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(n), 1));
    // soft round spark
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,176,84,1)');
    grad.addColorStop(0.4, 'rgba(255,128,38,0.65)');
    grad.addColorStop(1, 'rgba(230,80,16,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(c),
      size: 0.075,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.embers = new THREE.Points(geo, mat);
    this.embers.frustumCulled = false;
    this.embers.name = 'flame_embers';
    this.scene.add(this.embers);
  }

  // ---------------------------------------------------------- transients

  /** Fase 14 — presupuesto de llamas transitorias activas a la vez (el
   *  aliento de dragón generaba >100 quads aditivos por segundo: cada uno
   *  es un draw call transparente). Por calidad: media 44, baja 24. */
  private budget = 150;
  setBudget(n: number): void { this.budget = Math.max(8, Math.min(150, Math.round(n))); }

  private activeCount = 0;

  private takeTransient(): TransientFlame | null {
    // el presupuesto cuenta ACTIVAS (no el tamaño del pool)
    if (this.activeCount >= this.budget) return null; // Fase 14 — presupuesto
    for (const f of this.pool) if (!f.active) return f;
    if (this.pool.length >= 150) return null; // hard cap
    // grow the pool lazily
    const mat = this.makeMaterial(Math.random() * 100, 0.5, 1, 1, 0);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.name = 'flame_fx_transient';
    this.scene.add(mesh);
    const f: TransientFlame = {
      mesh, mat, t: 0, dur: 1, vel: new THREE.Vector3(),
      drag: 1, gravity: 0, grow: 1, baseOpacity: 1, baseScale: 1, active: false,
    };
    this.pool.push(f);
    return f;
  }

  /** Spawn a short-lived flame (dragon breath, impacts, muzzle fire). */
  spawn(
    pos: THREE.Vector3,
    scale: number,
    dur: number,
    vel: THREE.Vector3,
    opts: { heat?: number; grow?: number; drag?: number; gravity?: number; opacity?: number } = {},
  ): void {
    const f = this.takeTransient();
    if (!f) return;
    f.active = true;
    this.activeCount++;
    f.t = 0;
    f.dur = dur;
    f.vel.copy(vel);
    f.drag = opts.drag ?? 1.4;
    f.gravity = opts.gravity ?? 0.6;
    f.grow = opts.grow ?? 2.2;
    f.baseOpacity = opts.opacity ?? 0.85;
    f.baseScale = scale;
    f.mesh.position.copy(pos);
    f.mesh.visible = true;
    f.mat.uniforms.uSeed.value = Math.random() * 100;
    f.mat.uniforms.uHeat.value = opts.heat ?? 0.55;
    f.mat.uniforms.uScaleX.value = scale * 0.9;
    f.mat.uniforms.uScaleY.value = scale * 1.5;
    f.mat.uniforms.uIntensity.value = f.baseOpacity;
    f.mat.uniforms.uFlicker.value = 0;
  }

  /** One-shot fire burst (impacts, cannon muzzle, charge puffs). */
  burst(pos: THREE.Vector3, scale = 1.4, count = 6, heat = 0.6): void {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 3.4,
        1.2 + Math.random() * 2.4,
        (Math.random() - 0.5) * 3.4,
      );
      this.spawn(pos, scale * (0.5 + Math.random() * 0.6), 0.4 + Math.random() * 0.35, v, {
        heat, grow: 1.6, drag: 2.0, gravity: 1.2, opacity: 0.9,
      });
    }
  }

  // ---------------------------------------------------------- update

  /** Frame-safe: any system may call it, only the first call per frame runs. */
  update(): void {
    const now = performance.now();
    if (!this.lastNow) { this.lastNow = now; return; }
    const dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.timeU.value += dt;

    // transient flames: physics + growth + fade
    for (const f of this.pool) {
      if (!f.active) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        f.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
        f.mesh.visible = false;
        continue;
      }
      const damp = Math.max(0, 1 - f.drag * dt);
      f.vel.multiplyScalar(damp);
      f.vel.y += f.gravity * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      const growK = 1 + f.grow * f.t;
      f.mat.uniforms.uScaleX.value = f.baseScale * 0.9 * growK;
      f.mat.uniforms.uScaleY.value = f.baseScale * 1.5 * growK;
      f.mat.uniforms.uIntensity.value = f.baseOpacity * (1 - k * k);
    }

    // embers: rise, waver, respawn
    if (this.embers && this.emberData) {
      const d = this.emberData;
      const n = d.vel.length / 3;
      const lifeAttr = this.embers.geometry.getAttribute('aLife') as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        d.life[i] += dt;
        if (d.life[i] > d.maxLife[i]) {
          // respawn at a random persistent flame
          const src = this.persistent.length > 0
            ? this.persistent[Math.floor(Math.random() * this.persistent.length)].position
            : d.origin;
          d.vel[i * 3] = src.x + (Math.random() - 0.5) * 0.5;
          d.vel[i * 3 + 1] = src.y + Math.random() * 0.25;
          d.vel[i * 3 + 2] = src.z + (Math.random() - 0.5) * 0.5;
          d.life[i] = 0;
          d.maxLife[i] = 1.4 + Math.random() * 2.0;
        } else {
          d.vel[i * 3] += Math.sin(this.timeU.value * 6 + i * 2.4) * dt * 0.35;
          d.vel[i * 3 + 1] += dt * (1.1 + (i % 5) * 0.22);
          d.vel[i * 3 + 2] += Math.cos(this.timeU.value * 5 + i * 1.7) * dt * 0.35;
        }
        lifeAttr.setX(i, d.life[i] / d.maxLife[i]);
      }
      (this.embers.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      lifeAttr.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const f of this.persistent) this.scene.remove(f.mesh);
    this.persistent.length = 0;
    for (const f of this.pool) { this.scene.remove(f.mesh); f.mat.dispose(); }
    this.pool.length = 0;
    if (this.embers) {
      this.embers.geometry.dispose();
      this.scene.remove(this.embers);
    }
    this.baseMat.dispose();
    this.geo.dispose();
  }
}

// ---------------------------------------------------------------- singleton

let instance: FlameFX | null = null;

/** Lazy shared instance (torch systems, VFX and dressing all share it). */
export function getFlameFX(scene?: THREE.Scene): FlameFX {
  if (!instance) {
    if (!scene) throw new Error('FlameFX: primera llamada requiere la escena');
    instance = new FlameFX(scene);
  }
  return instance;
}
