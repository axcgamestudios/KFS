import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/MathUtils';

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
  zenith: new THREE.Color(0x4b7cab), horizon: new THREE.Color(0xb9cdd6),
  fog: new THREE.Color(0xa8bcc4), sunColor: new THREE.Color(0xfff2dd),
  hemiSky: new THREE.Color(0x9db8cc), hemiGround: new THREE.Color(0x4a5238),
  hemiIntensity: 0.72, fogDensity: 0.0016,
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

          // Drifting clouds projected on a virtual plane
          if (dir.y > 0.015) {
            vec2 cuv = dir.xz / (dir.y + 0.18);
            vec2 drift = vec2(uTime * 0.006, uTime * 0.0023);
            float cl = fbm(cuv * 0.55 + drift);
            float cl2 = fbm(cuv * 1.35 - drift * 1.7 + 50.0);
            // uCloudCover (Fase 4 weather) lowers the coverage threshold
            float thLo = mix(0.55, 0.30, uCloudCover);
            float thHi = mix(0.80, 0.58, uCloudCover);
            float cover = smoothstep(thLo, thHi, cl * 0.72 + cl2 * 0.38);
            float fade = smoothstep(0.015, 0.16, dir.y); // fade at horizon
            // Cloud lighting: warm toward the sun, dark at night / storms
            float sunLit = pow(max(sd, 0.0), 3.0);
            vec3 cloudCol = mix(vec3(0.92, 0.94, 0.96), uSunColor * 1.05 + vec3(0.25), sunLit * 0.8);
            cloudCol = mix(cloudCol * 0.35, cloudCol, 1.0 - uNight * 0.72);
            // Storm clouds lose their silver lining
            cloudCol = mix(cloudCol, vec3(0.24, 0.26, 0.30), uCloudDark * 0.85);
            col = mix(col, cloudCol, cover * fade * 0.82);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const domeGeo = new THREE.SphereGeometry(1150, 32, 20);
    this.dome = new THREE.Mesh(domeGeo, this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;

    this.sunLight = new THREE.DirectionalLight(0xfff2dd, 2.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 460;
    this.sunLight.shadow.camera.left = -62;
    this.sunLight.shadow.camera.right = 62;
    this.sunLight.shadow.camera.top = 62;
    this.sunLight.shadow.camera.bottom = -62;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.9;

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

    const mixColor = (
      key: 'zenith' | 'horizon' | 'fog' | 'sunColor' | 'hemiSky' | 'hemiGround',
    ): THREE.Color => {
      const c = new THREE.Color(0, 0, 0);
      const tmp = new THREE.Color();
      tmp.copy(PALETTE_DAWN[key]).multiplyScalar(dawnWeight / wSum);
      c.add(tmp);
      tmp.copy(PALETTE_DAY[key]).multiplyScalar(dayWeight / wSum);
      c.add(tmp);
      tmp.copy(PALETTE_NIGHT[key]).multiplyScalar(nightWeight / wSum);
      c.add(tmp);
      return c;
    };
    const mixNum = (key: 'hemiIntensity' | 'fogDensity'): number =>
      ((PALETTE_DAWN[key] as number) * dawnWeight +
        (PALETTE_DAY[key] as number) * dayWeight +
        (PALETTE_NIGHT[key] as number) * nightWeight) / wSum;

    const zenith = mixColor('zenith');
    const horizon = mixColor('horizon');
    const fog = mixColor('fog');
    const sunCol = mixColor('sunColor');
    const hemiSky = mixColor('hemiSky');
    const hemiGround = mixColor('hemiGround');
    const hemiInt = mixNum('hemiIntensity');
    const fogDensity = mixNum('fogDensity');

    this.zenithColor.copy(zenith);
    this.horizonColor.copy(horizon);
    this.sunColor.copy(sunCol);

    // Directional light: sun by day, moon by night (single shadow caster)
    const isDay = this.dayFactor > 0.5;
    const dir = isDay ? this.sunDir : this.moonDir;
    this.sunLight.color.copy(isDay ? sunCol : new THREE.Color(0x8fa8cc));
    this.sunLight.intensity =
      (isDay
        ? 0.35 + this.dayFactor * 2.3
        : clamp(this.nightFactor, 0, 1) * 1.05) * this.weatherLightMul + this.lightning * 3.2;
    this.sunLight.position.copy(focusPoint).addScaledVector(dir, 190);
    this.sunLight.target.position.copy(focusPoint);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.castShadow = shadowsEnabled && this.sunLight.intensity > 0.12;

    this.hemiLight.color.copy(hemiSky);
    this.hemiLight.groundColor.copy(hemiGround);
    this.hemiLight.intensity = hemiInt * this.weatherLightMul + this.lightning * 0.9;

    const scene = this.dome.parent as THREE.Scene | null;
    if (scene && scene.fog) {
      const f = scene.fog as THREE.FogExp2;
      f.color.copy(fog);
      if (this.lightning > 0.01) f.color.lerp(new THREE.Color(0xd8e2ee), this.lightning * 0.55);
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
