import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/MathUtils';

/** Fase 14 — scratch colors compartidos: el update() mezclaba 13 colores
 *  nuevos por frame (presión de GC constante en el bucle). */
const SCRATCH = {
  tmp: new THREE.Color(),
  fog: new THREE.Color(),
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  moonLight: new THREE.Color(0x8fa8cc),
  lightning: new THREE.Color(0xd8e2ee),
};

/** Length of a full in-game day in real seconds. */
export const DAY_LENGTH_SECONDS = 600;

interface SkyPalette {
  zenith: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  sunColor: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fogDensity: number;
}

const PALETTE_NIGHT: SkyPalette = {
  zenith: new THREE.Color(0x0a1226), horizon: new THREE.Color(0x1a2537),
  fog: new THREE.Color(0x121a2a), sunColor: new THREE.Color(0x9db6e8),
  hemiSky: new THREE.Color(0x2a3854), hemiGround: new THREE.Color(0x181c28),
  hemiIntensity: 0.62, fogDensity: 0.0034,
};
const PALETTE_DAWN: SkyPalette = {
  zenith: new THREE.Color(0x2c3a58), horizon: new THREE.Color(0xd9885a),
  fog: new THREE.Color(0x8f7a6a), sunColor: new THREE.Color(0xffb066),
  hemiSky: new THREE.Color(0x58586e), hemiGround: new THREE.Color(0x2e2418),
  hemiIntensity: 0.5, fogDensity: 0.0026,
};
const PALETTE_DAY: SkyPalette = {
  // Fase 21 — deeper, colder daylight (the bright cyan-blue read arcade-y;
  // the menu key art is a colder slate-blue sea sky)
  zenith: new THREE.Color(0x42719f), horizon: new THREE.Color(0xaebfc9),
  fog: new THREE.Color(0x9fb2bc), sunColor: new THREE.Color(0xfff2dd),
  hemiSky: new THREE.Color(0x9db8cc), hemiGround: new THREE.Color(0x4a5238),
  hemiIntensity: 0.60, fogDensity: 0.0016,
};

/**
 * Day/night cycle: sky dome (gradient, sun, moon, stars, clouds), the main
 * directional light (sun by day, moon by night), hemisphere ambient and fog.
 */
export class SkySystem {
  dayFraction = 0.30; // 0=midnight … 0.5=noon. Start ~7:12
  dayCount = 1;
  timePaused = false;
  /** Fase 8 — quality fog multiplier (Ultra-Bajo pulls the world in close). */
  qualityFogMul = 1;

  readonly sunLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly dome: THREE.Mesh;

  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly moonDir = new THREE.Vector3(0, -1, 0);
  readonly sunColor = new THREE.Color();
  readonly zenithColor = new THREE.Color();
  readonly horizonColor = new THREE.Color();
  dayFactor = 1;
  nightFactor = 0;
  duskFactor = 0;
  /** Fase 4 — weather-driven multipliers applied by the Game loop. */
  weatherLightMul = 1;
  weatherFogMul = 1;
  lightning = 0;

  private domeMat: THREE.ShaderMaterial;
  private time = 0;

  constructor() {
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: this.sunDir },
        uMoonDir: { value: this.moonDir },
        uZenith: { value: this.zenithColor },
        uHorizon: { value: this.horizonColor },
        uSunColor: { value: this.sunColor },
        uNight: { value: 0 },
        uTime: { value: 0 },
        uCloudCover: { value: 0.18 },
        uCloudDark: { value: 0 },
        /** Fase 14 — calidad de nubes: 0 = solo gradiente (xlow/baja y pase
         *  de reflexión), 1 = capa cúmulus sin auto-sombra (media),
         *  2 = cúmulus + auto-sombra (alta), 3 = las tres capas (ultra). */
        uCloudQual: { value: 3 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform float uNight;
        uniform float uTime;
        uniform float uCloudCover;
        uniform float uCloudDark;
        uniform float uCloudQual;
        varying vec3 vDir;

        float hash21(vec2 p) {
          p = fract(p * vec2(233.34, 851.73));
          p += dot(p, p + 23.45);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
          return v;
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = max(dir.y, -0.08);

          // Base gradient
          float gradK = pow(clamp(h, 0.0, 1.0), 0.42);
          vec3 col = mix(uHorizon, uZenith, gradK);

          // Sun disc + glow
          float sd = dot(dir, normalize(uSunDir));
          float sunDisc = smoothstep(0.99935, 0.99965, sd);
          float sunGlow = pow(max(sd, 0.0), 300.0) * 0.55 + pow(max(sd, 0.0), 10.0) * 0.16;
          col += uSunColor * (sunDisc * 3.2 + sunGlow);

          // Moon disc + glow
          float md = dot(dir, normalize(uMoonDir));
          float moonDisc = smoothstep(0.99955, 0.99985, md);
          float moonGlow = pow(max(md, 0.0), 500.0) * 0.3;
          col += vec3(0.82, 0.87, 0.95) * (moonDisc * 1.6 + moonGlow) * uNight;

          // Stars (procedural, twinkle)
          if (uNight > 0.01 && dir.y > 0.02) {
            vec2 sp = dir.xz / (dir.y + 0.35) * 34.0;
            vec2 cell = floor(sp);
            float rnd = hash21(cell);
            if (rnd > 0.965) {
              vec2 f = fract(sp) - 0.5;
              float star = smoothstep(0.24, 0.02, length(f));
              float tw = 0.6 + 0.4 * sin(uTime * (2.0 + rnd * 4.0) + rnd * 40.0);
              col += vec3(0.9, 0.93, 1.0) * star * tw * uNight * (0.5 + rnd);
            }
          }

        // ------------------------------------------------------------------
        // Fase 11 — CLOUDS, rebuilt from scratch.
        // The old single fbm plane stretched into weird bands near the
        // horizon and read as a flat decal. The new set:
        //  · THREE real layers at different virtual altitudes (fair-weather
        //    cumulus, an altocumulus deck, thin cirrus near the zenith)
        //  · domain warping — fbm is fed through another fbm, so shapes
        //    curl and cauilflower like real convection instead of blobs
        //  · perspective-correct mapping (each layer fades at its own
        //    horizon so nothing stretches into arcs)
        //  · sun-side silver lining + depth shading (sampling toward the
        //    sun fakes self-shadowing inside each mass)
        //  · storm coverage keeps its role; night keeps the moonlit blue
        // ------------------------------------------------------------------
        if (dir.y > 0.008) {
          vec3 sun = normalize(uSunDir);
          float sunAmt = max(dot(dir, sun), 0.0);
          vec3 cloudCol = mix(vec3(0.90, 0.93, 0.97), uSunColor * 1.05 + vec3(0.28), pow(sunAmt, 2.6) * 0.9);
          cloudCol = mix(cloudCol * 0.34, cloudCol, 1.0 - uNight * 0.74);
          // storm decks lose the silver and go bruised
          cloudCol = mix(cloudCol, vec3(0.23, 0.25, 0.30), uCloudDark * 0.85);

          // domain-warped value noise: q warps r, r warps the field
          vec2 drift = vec2(uTime * 0.0065, uTime * 0.0024);
          float skyMix = 0.0;   // accumulated cloud opacity

          // ---- LAYER 1 — cumulus, the hero deck (virtual h ~ 1.4 km) ----
          // Final form: NO domain warping (the warp read as painted smoke —
          // the exact complaint about the old weird dragon clouds). Instead:
          // a two-scale plain fbm (big rounded masses with fine cauliflower
          // grain) + strong directional self-shadow. Plain fbm at the right
          // scale is what reads as CLOUD; warp reads as ink.
          {
            float h = 0.16;
            // Fase 21 — retune: LOWER frequency (0.34 -> 0.26) reads as big
            // fair-weather cumulus masses with real sky between them, not a
            // mottled sheet; the cauliflower grain octave got finer.
            vec2 cuv = dir.xz / (dir.y * h + 0.14) * 0.26 + drift * 0.6;
            float f = fbm(cuv * 0.42 + 11.3) * 0.70 + fbm(cuv * 2.3 + 31.7) * 0.30;
            float thLo = mix(0.62, 0.36, uCloudCover);
            float thHi = mix(0.84, 0.60, uCloudCover);
            float m = smoothstep(thLo, thHi, f);
            // soft rounded edge: the mass feather is wider than the threshold
            m = m * (0.72 + 0.28 * smoothstep(thLo, thHi + 0.14, f));
            // depth toward the sun: denser between us and the light = darker
            // (Fase 14 — la auto-sombra es la mitad del coste de la capa:
            // solo con calidad >= 2)
            float denser = 0.0;
            if (uCloudQual >= 1.5) {
              vec2 towardSun = sun.xz * 0.72;
              float f2 = fbm((cuv + towardSun) * 0.42 + 11.3) * 0.70 + fbm((cuv + towardSun) * 2.3 + 31.7) * 0.30;
              denser = clamp((f - f2) * 2.9, -0.3, 0.9);
            }
            vec3 lc = cloudCol * (1.0 - max(0.0, denser) * 1.15);
            lc += cloudCol * pow(sunAmt, 5.0) * 0.42;      // silver rim, wider
            float horizonFade = smoothstep(0.008, 0.12, dir.y);
            skyMix += m * horizonFade * 0.9;
            col = mix(col, lc, m * horizonFade * 0.9);
          }

          // ---- LAYER 2 — altocumulus deck: a clearly SEPARATE stratum ----
          // Plain fbm (no warp — warp reads as ink), small cellular scale,
          // cooler tint, own band above the cumulus.
          // (Fase 14 — solo con calidad 3/ultra: es la capa menos visible)
          if (uCloudQual >= 2.5) {
            vec2 cuv = dir.xz / (dir.y * 0.42 + 0.10) * 0.21 - drift * 1.15 + 77.0;
            float f = fbm(cuv * 1.7 + 3.1) * 0.75 + fbm(cuv * 3.4 + 5.3) * 0.25;
            float thLo = mix(0.62, 0.32, uCloudCover);
            float m = smoothstep(thLo, thLo + 0.18, f);
            // only the upper sky: this deck lives above the cumulus
            float band = smoothstep(0.14, 0.38, dir.y) * (1.0 - smoothstep(0.78, 0.99, dir.y) * 0.7);
            vec3 lc = cloudCol * 0.88 - vec3(0.0, 0.01, 0.02); // a hair cooler
            skyMix += m * band * 0.32;
            col = mix(col, lc, m * band * 0.32);
          }

          // ---- LAYER 3 — cirrus filaments, ONLY near the zenith ----
          // Retune: sharper anisotropy (longer, thinner), weaker warp and a
          // higher band so the mid sky belongs to the cumulus.
          if (uCloudQual >= 2.5) {
            vec2 cuv = dir.xz / (dir.y * 0.8 + 0.22) * 0.13 + drift * 1.8;
            // stretched noise = long thin strands
            float f = fbm(cuv * vec2(2.2, 0.18) + 19.0);
            float m = smoothstep(mix(0.68, 0.42, uCloudCover), mix(0.68, 0.42, uCloudCover) + 0.12, f);
            float band = smoothstep(0.42, 0.68, dir.y);
            vec3 lc = mix(cloudCol, uSunColor * 1.1 + vec3(0.3), pow(sunAmt, 3.0) * 0.75);
            skyMix += m * band * 0.22;
            col = mix(col, lc, m * band * 0.22);
          }

          // unified horizon haze where all layers thin out — keeps the
          // skyline clean instead of stacked cut-offs
          float haze = smoothstep(0.008, 0.05, dir.y) * (1.0 - smoothstep(0.05, 0.16, dir.y));
          col = mix(col, mix(uHorizon, cloudCol * 0.94, clamp(skyMix, 0.0, 0.7)), haze * 0.35 * clamp(uCloudCover * 2.2, 0.18, 0.8));
        }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const domeGeo = new THREE.SphereGeometry(1150, 32, 20);
    this.dome = new THREE.Mesh(domeGeo, this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    // Fase 14 — el pase de reflexión del mar re-dibuja el domo entero: allí
    // las nubes se saltan (la distorsión del agua las borra igual) y queda
    // solo el gradiente. Se detecta por la marca de la cámara espejo.
    this.dome.onBeforeRender = (_r, _s, cam) => {
      if ((cam as THREE.Camera).userData?.kfsRefl) {
        this.domeMat.uniforms.uCloudQual.value = 0;
      } else {
        this.domeMat.uniforms.uCloudQual.value = this.cloudQual;
      }
    };

    this.sunLight = new THREE.DirectionalLight(0xfff2dd, 2.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    // Fase 21 — shadow quality pass: tighter frustum (55 m instead of 62 m
    // = crisper texels around the hero), tighter depth range, and a normal
    // bias cut from 0.9 to 0.42 (the old value peter-panned every contact:
    // shadows floated off the objects that cast them).
    this.sunLight.shadow.camera.near = 30;
    this.sunLight.shadow.camera.far = 420;
    this.sunLight.shadow.camera.left = -55;
    this.sunLight.shadow.camera.right = 55;
    this.sunLight.shadow.camera.top = 55;
    this.sunLight.shadow.camera.bottom = -55;
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.42;

    this.hemiLight = new THREE.HemisphereLight(0x9db8cc, 0x4a5238, 0.7);
  }

  /** Advance the clock. Returns true when a new day starts.
   * Fase 8 — asymmetric clock: daylight crawls (×1.9 slower) while the small
   * hours fly by (×0.55 faster), so the playable DAY lasts noticeably more
   * and the pitch-black night doesn't overstay. */
  tick(dt: number): boolean {
    if (this.timePaused) return false;
    this.time += dt;
    const theta = (this.dayFraction - 0.25) * Math.PI * 2;
    const sy = Math.sin(theta);
    const speed = sy > -0.08 ? 0.55 : 1.9; // day crawls · deep night flies
    this.dayFraction += (dt / DAY_LENGTH_SECONDS) * speed;
    let newDay = false;
    if (this.dayFraction >= 1) {
      this.dayFraction -= 1;
      this.dayCount++;
      newDay = true;
    }
    return newDay;
  }

  /** Recompute sun/moon, colors, lights, fog. Call after tick. */
  update(camera: THREE.Camera, focusPoint: THREE.Vector3, shadowsEnabled: boolean): void {
    const theta = (this.dayFraction - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(theta), Math.sin(theta), Math.sin(theta) * 0.32 + 0.18).normalize();
    this.moonDir.copy(this.sunDir).multiplyScalar(-1);

    const sy = this.sunDir.y;
    this.dayFactor = smoothstep(-0.10, 0.22, sy);
    this.nightFactor = 1 - smoothstep(-0.14, 0.06, sy);
    this.duskFactor = Math.exp(-Math.pow(sy * 4.2, 2));

    // Blend the three palettes
    const dawnWeight = this.duskFactor;
    const dayWeight = smoothstep(0.04, 0.4, sy);
    const nightWeight = 1 - smoothstep(-0.16, 0.02, sy);
    const wSum = dawnWeight + dayWeight + nightWeight;

    // Fase 14 — mezcla SIN allocar: escribe directo en el destino
    const mixInto = (
      out: THREE.Color,
      key: 'zenith' | 'horizon' | 'fog' | 'sunColor' | 'hemiSky' | 'hemiGround',
    ): void => {
      out.setRGB(0, 0, 0);
      SCRATCH.tmp.copy(PALETTE_DAWN[key]).multiplyScalar(dawnWeight / wSum);
      out.add(SCRATCH.tmp);
      SCRATCH.tmp.copy(PALETTE_DAY[key]).multiplyScalar(dayWeight / wSum);
      out.add(SCRATCH.tmp);
      SCRATCH.tmp.copy(PALETTE_NIGHT[key]).multiplyScalar(nightWeight / wSum);
      out.add(SCRATCH.tmp);
    };
    const mixNum = (key: 'hemiIntensity' | 'fogDensity'): number =>
      ((PALETTE_DAWN[key] as number) * dawnWeight +
        (PALETTE_DAY[key] as number) * dayWeight +
        (PALETTE_NIGHT[key] as number) * nightWeight) / wSum;

    mixInto(this.zenithColor, 'zenith');
    mixInto(this.horizonColor, 'horizon');
    mixInto(SCRATCH.fog, 'fog');
    mixInto(this.sunColor, 'sunColor');
    mixInto(SCRATCH.hemiSky, 'hemiSky');
    mixInto(SCRATCH.hemiGround, 'hemiGround');
    const hemiInt = mixNum('hemiIntensity');
    const fogDensity = mixNum('fogDensity');

    // Directional light: sun by day, moon by night (single shadow caster)
    const isDay = this.dayFactor > 0.5;
    const dir = isDay ? this.sunDir : this.moonDir;
    this.sunLight.color.copy(isDay ? this.sunColor : SCRATCH.moonLight);
    this.sunLight.intensity =
      (isDay
        ? 0.35 + this.dayFactor * 2.55
        : clamp(this.nightFactor, 0, 1) * 1.05) * this.weatherLightMul + this.lightning * 3.2;
    this.sunLight.position.copy(focusPoint).addScaledVector(dir, 190);
    this.sunLight.target.position.copy(focusPoint);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.castShadow = shadowsEnabled && this.sunLight.intensity > 0.12;

    this.hemiLight.color.copy(SCRATCH.hemiSky);
    this.hemiLight.groundColor.copy(SCRATCH.hemiGround);
    this.hemiLight.intensity = hemiInt * this.weatherLightMul + this.lightning * 0.9;

    const scene = this.dome.parent as THREE.Scene | null;
    if (scene && scene.fog) {
      const f = scene.fog as THREE.FogExp2;
      f.color.copy(SCRATCH.fog);
      if (this.lightning > 0.01) f.color.lerp(SCRATCH.lightning, this.lightning * 0.55);
      f.density = fogDensity * this.weatherFogMul * this.qualityFogMul;
    }

    this.domeMat.uniforms.uNight.value = this.nightFactor;
    this.domeMat.uniforms.uTime.value = this.time;

    // Keep dome centered on the camera
    this.dome.position.set(camera.position.x, 0, camera.position.z);
  }

  /** Serializable clock state. */
  serialize(): { dayFraction: number; dayCount: number } {
    return { dayFraction: this.dayFraction, dayCount: this.dayCount };
  }

  /** Fase 14 — calidad de nubes por escalón (ver uCloudQual en el shader).
   *  xlow/baja 0 · media 1 · alta 2 · ultra 3. */
  cloudQual = 3;
  setCloudQuality(q: number): void {
    this.cloudQual = Math.max(0, Math.min(3, Math.round(q)));
    this.domeMat.uniforms.uCloudQual.value = this.cloudQual;
  }

  /** Fase 4 — weather hooks (called by Game before update()). */
  setWeather(cloudCover: number, cloudDark: number, lightMul: number, fogMul: number, lightning: number): void {
    this.weatherLightMul = lightMul;
    this.weatherFogMul = fogMul;
    this.lightning = lightning;
    this.domeMat.uniforms.uCloudCover.value = cloudCover;
    this.domeMat.uniforms.uCloudDark.value = cloudDark;
  }

  deserialize(data: { dayFraction: number; dayCount: number }): void {
    this.dayFraction = clamp(data.dayFraction, 0, 0.999);
    this.dayCount = Math.max(1, data.dayCount);
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.domeMat.dispose();
  }
}
