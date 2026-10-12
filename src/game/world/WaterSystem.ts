import * as THREE from 'three';
import { TerrainHeight } from './TerrainHeight';
import { smoothstep } from '../core/MathUtils';

/**
 * Gerstner wave parameters — shared by the water shader AND the CPU-side
 * waveHeightAt() used for ship buoyancy. Never change one without the other.
 * Epic set: a long North-Sea swell + two cross swells; chop and ripples live
 * in the fragment shader so the mesh stays efficiently tessellated.
 */
export const WAVES = {
  amp: [1.35, 0.58, 0.32],
  len: [34.0, 20.0, 13.5],
  speed: [1.0, 1.45, 1.9],
  dirs: [
    [1.0 / Math.hypot(1.0, 0.28), 0.28 / Math.hypot(1.0, 0.28)],
    [0.82 / Math.hypot(0.82, 0.57), -0.57 / Math.hypot(0.82, 0.57)],
    [-0.45 / Math.hypot(0.45, 0.89), 0.89 / Math.hypot(0.45, 0.89)],
  ],
} as const;

/** Slow swell-set modulation (waves arrive in groups — real ocean feel).
 *  Mirrored EXACTLY by CPU waveHeightAt. */
function swellSet(t: number): number {
  return 0.82 + 0.22 * Math.sin(t * 0.11) * Math.sin(t * 0.073 + 1.7);
}

/** Max simultaneous interactive wake sources (boats, splashes, swimming). */
const WAKE_SLOTS = 28;

interface Wake {
  x: number;
  z: number;
  /** Current ring radius (m) — expands over time. */
  r: number;
  /** Strength 0..1 (decays as the ring expands). */
  s: number;
  /** Expansion speed (m/s). */
  v: number;
  /** Ring radius at which the wake dies. */
  maxR: number;
}

/**
 * Animated ocean: a large plane that follows the player. Waves are computed
 * in the vertex shader (3 Gerstner waves), shore foam and shallow tint come
 * from a pre-baked terrain heightmap texture, and day/night colors arrive as
 * uniforms from the sky system.
 *
 * Fase 12:
 *  · REAL planar reflection — the scene is re-rendered from a mirrored
 *    camera into a render target, so the knight, ships, dragons and castle
 *    are truly mirrored on the surface (you can see yourself).
 *  · Interactive WAKES — boats and swimmers push expanding wave rings +
 *    foam into the shader (uniform ring buffer).
 */
export class WaterSystem {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private time = 0;
  private terrain: TerrainHeight;

  // ------------------------------------------------------------- reflection
  private reflRT: THREE.WebGLRenderTarget | null = null;
  private reflCam = (() => {
    const c = new THREE.PerspectiveCamera();
    // Fase 14 — marca para que el domo del cielo sepa que este pase es el
    // reflejo y se salte las nubes (ver SkySystem dome.onBeforeRender).
    c.userData.kfsRefl = true;
    return c;
  })();
  private reflOn = false;
  private reflFrame = 0;
  private reflVisibleK = 1;
  private texMatrix = new THREE.Matrix4();
  private clipPlane = new THREE.Plane();
  private clipVec = new THREE.Vector4();
  private q4 = new THREE.Vector4();
  private lookTarget = new THREE.Vector3();
  private reflPos = new THREE.Vector3();
  private reflLook = new THREE.Vector3();
  private reflUp = new THREE.Vector3();

  // ------------------------------------------------------------------ wakes
  private wakes: Wake[] = [];
  private wakeArr: THREE.Vector4[] = [];
  private wakeUniform: { value: THREE.Vector4[] };

  constructor(terrain: TerrainHeight, worldHalf = 716) {
    this.terrain = terrain;
    for (let i = 0; i < WAKE_SLOTS; i++) {
      this.wakes.push({ x: 0, z: 0, r: 0, s: 0, v: 3.4, maxR: 16 });
      this.wakeArr.push(new THREE.Vector4(0, 0, 0, 0));
    }
    this.wakeUniform = { value: this.wakeArr };

    // --- Pre-bake a low-res terrain height texture for shore effects ---
    // HalfFloat: linear filtering is guaranteed in WebGL2 core (Float32 would
    // silently sample black on GPUs without OES_texture_float_linear).
    const texRes = 256;
    const data = new Uint16Array(texRes * texRes);
    for (let j = 0; j < texRes; j++) {
      for (let i = 0; i < texRes; i++) {
        const x = (i / (texRes - 1) - 0.5) * 2 * worldHalf;
        const z = (j / (texRes - 1) - 0.5) * 2 * worldHalf;
        data[j * texRes + i] = THREE.DataUtils.toHalfFloat(terrain.height(x, z));
      }
    }
    const heightTex = new THREE.DataTexture(
      data, texRes, texRes, THREE.RedFormat, THREE.HalfFloatType,
    );
    heightTex.minFilter = THREE.LinearFilter;
    heightTex.magFilter = THREE.LinearFilter;
    heightTex.wrapS = THREE.ClampToEdgeWrapping;
    heightTex.wrapT = THREE.ClampToEdgeWrapping;
    heightTex.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide, // visible from underwater (swimming / diving views)
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.2) },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uSkyColor: { value: new THREE.Color(0.55, 0.7, 0.85) },
        uHorizonColor: { value: new THREE.Color(0.8, 0.85, 0.9) },
        uDeepColor: { value: new THREE.Color(0.012, 0.085, 0.145) },
        uShallowColor: { value: new THREE.Color(0.07, 0.34, 0.35) },
        uFoamColor: { value: new THREE.Color(0.92, 0.95, 0.94) },
        uNightFactor: { value: 0 },
        uHeightMap: { value: heightTex },
        uWorldHalf: { value: worldHalf },
        uCameraPos: { value: new THREE.Vector3() },
        /** Radius (m) around the camera where waves still move. */
        uWaveMotion: { value: 2000.0 },
        /** Fase 13 — interruptor de oleaje: 1 = mar Gerstner vivo,
         *  0 = mar espejo (las estelas interactivas siguen funcionando). */
        uWaveAmp: { value: 1.0 },
        /** 1 = procedural sky/sun reflection (fallback + distant blend). */
        uReflQuality: { value: 1 },
        // Fase 12 — REAL planar reflection
        uReflMap: { value: null },
        uReflTexMat: { value: new THREE.Matrix4() },
        uReflOn: { value: 0 },
        // Fase 12 — interactive wakes
        uWakes: this.wakeUniform,
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uHeightMap;
        uniform float uWorldHalf;
        uniform vec3 uCameraPos;
        uniform float uWaveMotion;
        uniform float uWaveAmp;
        uniform mat4 uReflTexMat;
        uniform vec4 uWakes[${WAKE_SLOTS}];
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vShore;
        varying float vCrest;
        varying float vSteep;
        varying vec4 vReflUv;
        varying float vWakeFoam;

        // Sample terrain height (baked) at world XZ
        float terrainH(vec2 p) {
          vec2 uv = p / (uWorldHalf * 2.0) + 0.5;
          uv = clamp(uv, 0.0, 1.0);
          return texture2D(uHeightMap, uv).r;
        }

        void main() {
          vec3 pos = (modelMatrix * vec4(position, 1.0)).xyz;
          float shore = terrainH(pos.xz);
          // Fase 8/11 — quality: the far sea calms down. Waves only MOVE within
          // uWaveMotion metres of the camera; beyond it the surface is a flat
          // plane (the fade is a BRANCH: flat vertices skip the whole Gerstner
          // evaluation — the same pixels, a fraction of the ALU).
          float dist2cam = distance(pos.xz, uCameraPos.xz);
          float motionK = 1.0 - smoothstep(uWaveMotion * 0.55, uWaveMotion, dist2cam);

          // Fase 12 — interactive wakes (boats, splashes, swimming):
          // expanding gaussian rings + a hull dip near the source.
          float wakeH = 0.0;
          float wakeFoam = 0.0;
          if (motionK > 0.004) {
            // Fase 14 — las estelas ACTIVAS van primero en el uniform (ver
            // packWakes): el bucle corta en la primera vacante en vez de
            // recorrer los 28 slots siempre.
            for (int i = 0; i < ${WAKE_SLOTS}; i++) {
              vec4 w = uWakes[i];
              if (w.w < 0.004) break;
              float d = distance(pos.xz, w.xy);
              float ring = exp(-pow((d - w.z) * 0.55, 2.0));
              wakeH += ring * w.w * 0.5;
              wakeFoam += ring * w.w * 0.9;
              wakeFoam += exp(-d * d * 0.10) * w.w * 0.55;
            }
          }
          vWakeFoam = wakeFoam;

          if (motionK < 0.004) {
            // ---- FAR SEA: flat, cheap, visually identical to the old fade ----
            vNormal = vec3(0.0, 1.0, 0.0);
            vSteep = 0.0;
            vCrest = 0.0;
            vWorldPos = pos;
            vShore = shore;
            vReflUv = uReflTexMat * vec4(position, 1.0);
            gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
            return;
          }
          // Ola completa en aguas profundas, amortiguada en bahías y orilla
          // (profundo ≤ -20 m → 1.0 · muelle/bahía ≥ -3.5 m → 0.12)
          float shallowK = 1.0 - smoothstep(-20.0, -3.5, shore);
          shallowK = clamp(shallowK, 0.12, 1.0);

          float t = uTime;
          // swell sets: las olas llegan en grupos (mar real)
          float set = 0.82 + 0.22 * sin(t * 0.11) * sin(t * 0.073 + 1.7);
          // Fase 13 — oleaje apagado: set = 0 y el mar queda en espejo
          set *= uWaveAmp;

          // Tres olas Gerstner épicas: el desplazamiento horizontal afila las crestas
          float amp1 = 1.35 * shallowK * set * motionK, len1 = 34.0;
          float amp2 = 0.58 * shallowK * set * motionK, len2 = 20.0;
          float amp3 = 0.32 * shallowK * set * motionK, len3 = 13.5;
          vec2 d1 = normalize(vec2(1.0, 0.28));
          vec2 d2 = normalize(vec2(0.82, -0.57));
          vec2 d3 = normalize(vec2(-0.45, 0.89));

          float k1 = 6.28318 / len1, k2 = 6.28318 / len2, k3 = 6.28318 / len3;
          float f1 = k1 * dot(d1, pos.xz) - t * 1.0;
          float f2 = k2 * dot(d2, pos.xz) - t * 1.45;
          float f3 = k3 * dot(d3, pos.xz) - t * 1.9;

          // Q de Gerstner por ola (pendiente empinada sin lazos)
          float q1 = 0.9 / (k1 * 1.35 * 3.0);
          float q2 = 0.9 / (k2 * 0.58 * 3.0);
          float q3 = 0.9 / (k3 * 0.32 * 3.0);

          float h = amp1 * sin(f1) + amp2 * sin(f2) + amp3 * sin(f3);
          vec2 hd = d1 * (q1 * amp1 * cos(f1))
                  + d2 * (q2 * amp2 * cos(f2))
                  + d3 * (q3 * amp3 * cos(f3));
          pos.xz += hd;
          pos.y += h + wakeH;

          // Analytic-ish normal from partial derivatives (+ wake slope)
          float dhx = amp1 * k1 * cos(f1) * d1.x + amp2 * k2 * cos(f2) * d2.x + amp3 * k3 * cos(f3) * d3.x;
          float dhz = amp1 * k1 * cos(f1) * d1.y + amp2 * k2 * cos(f2) * d2.y + amp3 * k3 * cos(f3) * d3.y;
          vNormal = normalize(vec3(-dhx, 1.0, -dhz));
          vSteep = clamp(length(vec2(dhx, dhz)) * 0.55, 0.0, 1.5);

          vWorldPos = pos;
          vShore = shore;
          vCrest = (h + wakeH) / max(0.001, (amp1 + amp2 + amp3));
          vReflUv = uReflTexMat * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uFoamColor;
        uniform float uNightFactor;
        uniform vec3 uCameraPos;
        uniform float uTime;
        uniform float uReflQuality;
        uniform sampler2D uReflMap;
        uniform float uReflOn;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vShore;
        varying float vCrest;
        varying float vSteep;
        varying vec4 vReflUv;
        varying float vWakeFoam;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }

        /** Procedural sky on the reflected ray: gradient + sun glow. Blended
         *  as the FAR fallback under the real planar reflection. */
        vec3 skyReflection(vec3 rDir, vec3 sunDir, vec3 sunColor, vec3 sky, vec3 horizon) {
          float up = clamp(rDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, sky, pow(up, 0.62));
          float sd = max(dot(rDir, sunDir), 0.0);
          col += sunColor * (pow(sd, 240.0) * 2.6 + pow(sd, 12.0) * 0.3);
          return col;
        }

        void main() {
          vec3 viewDir = normalize(uCameraPos - vWorldPos);
          vec3 n = normalize(vNormal);
          // When seen from below, flip the normal so shading still works
          if (!gl_FrontFacing) n = -n;
          // Detail ripples: three drifting directional octaves (chop sin malla)
          vec2 drift = vec2(uTime * 0.32, uTime * -0.21);
          float rip = noise(vWorldPos.xz * 1.15 + drift) - 0.5;
          float rip2 = noise(vWorldPos.xz * 2.7 - drift * 1.7) - 0.5;
          float rip3 = noise(vWorldPos.xz * 5.6 + drift * 2.6) - 0.5;
          n = normalize(n + vec3(rip + rip3 * 0.55, 0.0, rip2 + rip3 * 0.4) * 0.42);

          // --- Optical depth (Beer-Lambert): the ray crosses more water when
          // grazing, so distance darkens/blues like a real sea.
          float depth = max(0.0, -vShore);                       // water column
          float grazing = 1.0 - clamp(viewDir.y, 0.0, 1.0);      // 0 overhead → 1 grazing
          float viewLen = distance(uCameraPos, vWorldPos);
          float opticalDepth = depth * (1.0 + grazing * 1.6) + viewLen * 0.014 * grazing;
          vec3 transmit = exp(-opticalDepth * vec3(0.36, 0.15, 0.115));

          // Water body: turquoise shore → deep blue offshore (exp transition)
          float shallowT = clamp(transmit.g, 0.0, 1.0);
          vec3 body = mix(uDeepColor, uShallowColor, shallowT);
          body *= 0.72 + 0.28 * transmit.r;   // deep water drops red → richer blue

          // --- Schlick fresnel (F0 = 0.02 agua): reflejo fuerte al ras,
          // cuerpo azul dominante mirando desde arriba — nunca un espejo puro.
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(viewDir, n), 0.0), 5.0);
          fres = clamp(fres, 0.02, 0.85);

          vec3 sunDir = normalize(uSunDir);
          float nightK = mix(1.0, 0.22, uNightFactor);

          // --- Reflection: procedural sky as base…
          vec3 rDir = reflect(-viewDir, n);
          rDir.y = abs(rDir.y) * 0.96 + 0.04;
          vec3 refl = skyReflection(rDir, sunDir, uSunColor, uSkyColor, uHorizonColor) * nightK;

          // --- Fase 12 — …overlaid by the REAL mirrored scene (you, ships,
          // dragons, castle). Rippled sampling + distance fade for a seamless
          // horizon; the RT already carries the night lighting.
          if (uReflOn > 0.5) {
            vec2 rUv = vReflUv.xy / max(0.0001, vReflUv.w);
            rUv += vec2(rip + rip3 * 0.5, rip2 + rip3 * 0.4) * 0.055;
            rUv = clamp(rUv, vec2(0.001), vec2(0.999));
            vec3 realRefl = texture2D(uReflMap, rUv).rgb;
            float nearFade = 1.0 - smoothstep(120.0, 260.0, viewLen);
            refl = mix(refl, realRefl, nearFade * 0.88);
          }

          vec3 col = mix(body * nightK, refl, fres);

          // Sun specular glint (not underwater)
          vec3 halfV = normalize(viewDir + sunDir);
          float upK = gl_FrontFacing ? 1.0 : 0.0;
          float spec = pow(max(dot(n, halfV), 0.0), 260.0);
          col += uSunColor * spec * 1.7 * upK;
          // Broad glitter path with sparkle noise
          float glit = pow(max(dot(n, halfV), 0.0), 24.0);
          float sparkle = noise(vWorldPos.xz * 7.0 + uTime * 1.4);
          col += uSunColor * glit * (0.12 + 0.22 * sparkle) * upK;

          // Subsurface glow: light bleeding through the wave crests
          float crestK = max(0.0, vCrest);
          float backK = max(0.0, dot(-sunDir, viewDir)) * 0.5 + 0.5;
          col += uShallowColor * crestK * crestK * 0.55 * backK * upK;

          // Foam — three layers:
          float fnoise = noise(vWorldPos.xz * 1.7 + uTime * 0.5) * 0.6
                       + noise(vWorldPos.xz * 4.3 - uTime * 0.7) * 0.4;
          // 1) whitecaps rompiendo en las crestas empinadas (por grupos de swell)
          float field = noise(vWorldPos.xz * 0.16 - uTime * 0.06) * 0.65 + 0.35;
          float crestFoam = smoothstep(0.42, 0.82, vCrest) * smoothstep(0.16, 0.55, vSteep);
          crestFoam *= smoothstep(0.24, 0.55, fnoise * field * 1.9);
          // 2) orilla: banda de espuma con oleaje que lava la playa por pulsos
          float shoreBand = smoothstep(-1.9, -0.15, vShore) * (1.0 - smoothstep(-0.15, 0.45, vShore));
          float wash = 0.55 + 0.45 * sin(vShore * 7.0 - uTime * 2.1 + fnoise * 2.4);
          float shoreFoam = shoreBand * wash * smoothstep(0.3, 0.72, fnoise);
          // 3) Fase 12 — estelas vivas: anillos y rastros de espuma de barcos
          float wakeFoam = vWakeFoam * smoothstep(0.18, 0.5, fnoise);
          float foam = clamp(crestFoam * 1.5 + shoreFoam * 1.25 + wakeFoam, 0.0, 1.0);
          // bordes de espuma deshilachados
          float foamEdge = smoothstep(0.25, 0.5, foam) * (0.75 + 0.25 * fnoise);
          col = mix(col, uFoamColor * nightK, foamEdge * 0.9);

          // Underside (seen while swimming): darker, murkier
          if (!gl_FrontFacing) {
            col = mix(col, col * vec3(0.35, 0.5, 0.55), 0.75);
          }

          // alpha follows absorption: deep sea reads opaque,
          // the shore stays transparent so the sand shows through
          float alpha = mix(0.92, 0.62, shallowT);
          alpha = mix(alpha, 0.95, foam);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const size = 1900;
    // 384×384: suficiente muestreo para la ola corta de 13.5 m (≈3 quads/ola)
    const geo = new THREE.PlaneGeometry(size, size, 384, 384);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 5;
    this.mesh.matrixAutoUpdate = true;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    // Follow the camera on XZ — waves are world-anchored so motion is invisible.
    this.mesh.position.x = camera.position.x;
    this.mesh.position.z = camera.position.z;
    this.material.uniforms.uCameraPos.value.copy(camera.position);
    // the CPU mirror uses the same motion center so distant ships
    // bob on the SAME flat sea the GPU draws (buoyancy and surface agree).
    this.motionCenter.copy(camera.position);
    this.updateWakes(dt);
  }

  /** Fase 11 — camera anchor for the CPU-side wave fade (kept fresh by update). */
  private motionCenter = new THREE.Vector3(0, 0, 0);

  // ---------------------------------------------------------------- wakes

  /** Push an expanding wave ring + foam (boats, splashes, swimming strokes). */
  addWake(x: number, z: number, strength: number, maxR = 16, speed = 3.4): void {
    const s = Math.min(1, Math.max(0.06, strength));
    // reuse the slot with the least remaining life, or a free one
    let slot: Wake | undefined = this.wakes.find((w) => w.s <= 0.01);
    if (!slot) {
      let oldest = Infinity;
      for (const w of this.wakes) {
        const life = w.maxR - w.r;
        if (life < oldest) { oldest = life; slot = w; }
      }
    }
    if (!slot) return;
    slot.x = x; slot.z = z; slot.r = 0.6; slot.s = s; slot.v = speed; slot.maxR = maxR;
    // pack immediately so the very next draw already shows the ring
    this.packWakes();
  }

  private updateWakes(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.wakes.length; i++) {
      const w = this.wakes[i];
      if (w && w.s > 0.01) {
        w.r += w.v * dt;
        w.s *= Math.max(0, 1 - dt * 0.55);
        if (w.r >= w.maxR) w.s = 0;
        dirty = true;
      }
    }
    // pack the uniform array — Fase 14: partición estable, activas al frente
    if (dirty || this.wakePackDirty) {
      this.wakePackDirty = false;
      this.packWakes();
    }
  }
  private wakePackDirty = false;

  /** Compacta las estelas vivas al frente del array (el shader hace break
   *  en la primera vacante) y sincroniza el uniform. */
  private packWakes(): void {
    const ws = this.wakes;
    let n = 0;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w && w.s > 0.01) {
        if (n !== i) { const t = ws[n]; ws[n] = w; ws[i] = t; }
        this.wakeArr[n].set(ws[n].x, ws[n].z, ws[n].r, ws[n].s);
        n++;
      }
    }
    for (let i = n; i < WAKE_SLOTS; i++) this.wakeArr[i].set(0, 0, 0, 0);
  }

  // ------------------------------------------------------------ reflection

  /** Create/destroy the reflection render target (quality change).
   *  Fase 13 — recreates the target when the requested size changes
   *  (baja = 384², alta = 512²). */
  setReflection(on: boolean, size = 512): void {
    this.reflOn = on;
    if (on && (!this.reflRT || this.reflRTSize !== size)) {
      this.reflRT?.dispose();
      this.reflRT = new THREE.WebGLRenderTarget(size, size, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      this.reflRT.texture.colorSpace = THREE.SRGBColorSpace;
      this.reflRT.texture.generateMipmaps = false;
      this.reflRTSize = size;
      this.material.uniforms.uReflMap.value = this.reflRT.texture;
      this.material.uniforms.uReflOn.value = 1;
    } else if (!on && this.reflRT) {
      this.reflRT.dispose();
      this.reflRT = null;
      this.reflRTSize = 0;
      this.material.uniforms.uReflMap.value = null;
      this.material.uniforms.uReflOn.value = 0;
    }
  }
  private reflRTSize = 0;
  /** Fase 13 — reflection update rate: alta = cada 2º frame,
   *  baja = cada 3º (menos escenas re-renderizadas por segundo). */
  private reflRate = 2;

  /** Fase 14 — objetos que NO se dibujan en el pase de reflexión (el pasto
   *  son ~500k triángulos en un solo draw: su reflejo es invisible bajo la
   *  distorsión del agua y cuesta un re-render entero). */
  reflHide: THREE.Object3D[] = [];

  /**
   * Fase 12 — REAL planar reflection: render the scene from a camera mirrored
   * across the sea plane (y=0) into a small render target, with an oblique
   * near-plane so nothing below the water leaks in. Called every OTHER frame
   * (30 fps reflections) and only while the camera is near/above the sea.
   */
  renderReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    if (!this.reflRT || !this.reflOn) return;
    this.reflFrame++;
    const camY = camera.position.y;
    // Skip while underwater / high in the mountains — cheap and invisible.
    let vis = 1;
    if (camY < 0.35 || camY > 46) vis = 0;
    else if (camY > 30) vis = 1 - (camY - 30) / 16;
    this.reflVisibleK += (vis - this.reflVisibleK) * 0.2;
    this.material.uniforms.uReflOn.value = this.reflVisibleK > 0.15 ? 1 : 0;
    if (vis <= 0 || this.reflFrame % this.reflRate !== 0) return; // tiered rate

    // --- mirror the camera across the sea plane (normal +Y through origin)
    this.reflPos.set(camera.position.x, -camera.position.y, camera.position.z);
    camera.getWorldDirection(this.lookTarget);
    this.lookTarget.add(camera.position);          // look-at point in world
    this.reflLook.set(this.lookTarget.x, -this.lookTarget.y, this.lookTarget.z);
    this.reflUp.set(0, 1, 0);
    // mirror the up vector: reflect across the XZ plane → negate Y
    this.reflUp.copy(camera.up).applyQuaternion(camera.quaternion);
    this.reflUp.y = -this.reflUp.y;

    const rc = this.reflCam;
    rc.position.copy(this.reflPos);
    rc.up.copy(this.reflUp);
    rc.lookAt(this.reflLook);
    rc.near = camera.near;
    rc.far = Math.min(camera.far, 900);
    rc.fov = camera.fov;
    rc.aspect = camera.aspect;
    rc.updateProjectionMatrix();
    rc.updateMatrixWorld();

    // --- oblique near plane: clip everything below y=0 in the mirrored view
    this.clipPlane.set(new THREE.Vector3(0, 1, 0), 0);
    this.clipPlane.applyMatrix4(rc.matrixWorldInverse);
    this.clipVec.set(this.clipPlane.normal.x, this.clipPlane.normal.y, this.clipPlane.normal.z, this.clipPlane.constant);
    const pe = rc.projectionMatrix.elements;
    this.q4.x = (Math.sign(this.clipVec.x) + pe[8]) / pe[0];
    this.q4.y = (Math.sign(this.clipVec.y) + pe[9]) / pe[5];
    this.q4.z = -1.0;
    this.q4.w = (1.0 + pe[10]) / pe[14];
    this.clipVec.multiplyScalar(2.0 / this.clipVec.dot(this.q4));
    pe[2] = this.clipVec.x;
    pe[6] = this.clipVec.y;
    pe[10] = this.clipVec.z + 1.0 - 0.003; // clip bias
    pe[14] = this.clipVec.w;

    // --- screen-space texture matrix (bias ∘ mirroredProj ∘ mirroredView ∘ model)
    this.mesh.updateMatrixWorld();
    this.texMatrix.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    this.texMatrix.multiply(rc.projectionMatrix);
    this.texMatrix.multiply(rc.matrixWorldInverse);
    this.texMatrix.multiply(this.mesh.matrixWorld);
    (this.material.uniforms.uReflTexMat.value as THREE.Matrix4).copy(this.texMatrix);

    // --- render the mirrored scene (the sea itself stays out of its own image)
    const prevVis = this.mesh.visible;
    this.mesh.visible = false;
    // Fase 14 — fuera del reflejo lo que no aporta visuals y pesa un mundo
    const hidden: THREE.Object3D[] = [];
    for (const o of this.reflHide) {
      if (o.visible) { o.visible = false; hidden.push(o); }
    }
    const prevRT = renderer.getRenderTarget();
    const prevXrEnabled = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(this.reflRT);
    renderer.clear();
    renderer.render(scene, rc);
    renderer.setRenderTarget(prevRT);
    renderer.xr.enabled = prevXrEnabled;
    for (const o of hidden) o.visible = true;
    this.mesh.visible = prevVis;
  }

  /**
   * Quality ladder: rebuild the sea mesh at a new segment count and set the
   * radius around the camera within which waves actually move.
   * Fase 12 — reflQuality 1 also enables the REAL planar reflection pass.
   * (Compat: boot anterior — Fase 13 usa applyGraphicsOptions). */
  setDetail(segments: number, waveMotionRadius: number, reflQuality = 1): void {
    this.material.uniforms.uWaveMotion.value = Math.max(20, waveMotionRadius);
    this.material.uniforms.uReflQuality.value = reflQuality > 0.5 ? 1 : 0;
    this.setReflection(reflQuality > 0.5, 512);
    this.reflRate = 2;
    this.rebuildSegments(segments);
  }

  /**
   * Fase 13 — ajustes individuales del mar:
   *  · waves: oleaje Gerstner ON/OFF (las estelas y salpicaduras siguen)
   *  · refl: 0 apagado · 1 baja (384², cada 3er frame) · 2 alta (512², cada 2º)
   */
  applyGraphicsOptions(o: { segments: number; waveRadius: number; refl: 0 | 1 | 2; waves: boolean }): void {
    this.material.uniforms.uWaveMotion.value = Math.max(20, o.waveRadius);
    this.material.uniforms.uWaveAmp.value = o.waves ? 1 : 0;
    this.material.uniforms.uReflQuality.value = o.refl > 0 ? 1 : 0;
    if (o.refl === 1) {
      this.setReflection(true, 384);
      this.reflRate = 3;
    } else if (o.refl === 2) {
      this.setReflection(true, 512);
      this.reflRate = 2;
    } else {
      this.setReflection(false);
      this.reflRate = 2;
    }
    this.rebuildSegments(o.segments);
  }

  private rebuildSegments(segments: number): void {
    const seg = Math.max(48, Math.min(384, Math.round(segments)));
    const params = this.mesh.geometry as THREE.PlaneGeometry;
    if (params.parameters?.widthSegments === seg) return; // same detail
    const size = params.parameters?.width ?? 1900;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }

  /**
   * CPU wave height at a world point — mirrors the vertex shader exactly
   * (same waves, same shallow-water damping) so ships ride the same sea
   * the player sees. Used for buoyancy and wake placement.
   */
  waveHeightAt(x: number, z: number): number {
    const shore = this.terrain.height(x, z);
    // espejo exacto del shader: profundo → ola completa, bahía/orilla → amortiguada
    let shallowK = 1 - smoothstep(-20, -3.5, shore);
    shallowK = Math.min(1, Math.max(0.12, shallowK));
    // same distance fade as the shader: outside the motion radius the sea is
    // flat on BOTH sides of the GPU/CPU mirror.
    const r = this.material.uniforms.uWaveMotion.value as number;
    const d = Math.hypot(x - this.motionCenter.x, z - this.motionCenter.z);
    const motionK = 1 - smoothstep(r * 0.55, r, d);
    if (motionK < 0.004) return 0;
    // Fase 13 — el interruptor de oleaje también se refleja aquí (espejo CPU)
    const amp = this.material.uniforms.uWaveAmp.value as number;
    if (amp < 0.004) return 0;
    const set = swellSet(this.time) * motionK * amp;
    let h = 0;
    for (let i = 0; i < 3; i++) {
      const k = (Math.PI * 2) / WAVES.len[i];
      const f = k * (WAVES.dirs[i][0] * x + WAVES.dirs[i][1] * z) - this.time * WAVES.speed[i];
      h += WAVES.amp[i] * shallowK * set * Math.sin(f);
    }
    return h;
  }

  /** Called by the sky system every frame. */
  setSky(sunDir: THREE.Vector3, sunColor: THREE.Color, skyColor: THREE.Color, horizon: THREE.Color, nightFactor: number): void {
    this.material.uniforms.uSunDir.value.copy(sunDir);
    this.material.uniforms.uSunColor.value.copy(sunColor);
    this.material.uniforms.uSkyColor.value.copy(skyColor);
    this.material.uniforms.uHorizonColor.value.copy(horizon);
    this.material.uniforms.uNightFactor.value = nightFactor;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.material.uniforms.uHeightMap.value as THREE.Texture).dispose();
    this.reflRT?.dispose();
    this.material.dispose();
  }
}
