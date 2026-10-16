import * as THREE from 'three';
import type { PostFX } from '../world/PostFX';
import type { GraphicsSettings } from './Graphics';
import { pixelRatioFor } from './Graphics';

/** Graphics quality presets. */
export type QualityLevel = 'xlow' | 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  pixelRatioCap: number;
  shadowMapSize: number;
  shadowsEnabled: boolean;
  viewChunkRadius: number;   // terrain chunk streaming radius
  grassDensity: number;      // 0..1 multiplier
  anisotropy: number;
  /** Fase 4 — cinematic post chain (bloom + MSAA) on Ultra. */
  postfx: boolean;
  /** Fase 8 — fog density multiplier (xlow hides the world edge). */
  fogMul: number;
  /** Fase 8 — water mesh segments per side (detail × perf). */
  waterSegments: number;
  /** Fase 9 — 1 = procedural sky/sun reflection on the water (Ultra/Alto);
   *  0 = cheap flat sky mix. Depth absorption is always on. */
  waterRefl: number;
  /** Fase 8 — waves animate only within this radius of the camera (m).
   *  Beyond it the surface stays flat: far water is calm and cheap. */
  waveMotionRadius: number;
  /** Fase 8 — NPCs animate their pose within this radius (m). */
  npcAnimDistance: number;
  /** Fase 8 — creature/tree wind & dressing distance scale. */
  streamDistance: number;
}

/** Sombra por escalón de calidad (aunque el jugador la encienda en xlow
 *  no le damos un mapa 4096 — sería castigarle por probar). */
const SHADOW_SIZE_BY_TIER: Record<QualityLevel, number> = {
  xlow: 1024, low: 1024, medium: 1024, high: 2048, ultra: 4096,
};

/** Cada cuántos frames se re-renderiza el mapa de sombras (Fase 14 — el sol
 *  se mueve despacio: a 30+ fps una sombra con 2 frames de antigüedad es
 *  invisible y ahorra un pase completo de la escena cada 2º frame). */
const SHADOW_RATE_BY_TIER: Record<QualityLevel, number> = {
  xlow: 4, low: 3, medium: 2, high: 2, ultra: 1,
};

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  xlow:   { pixelRatioCap: 0.62, shadowMapSize: 0,    shadowsEnabled: false, viewChunkRadius: 2, grassDensity: 0.0,  anisotropy: 1, postfx: false, fogMul: 3.4, waterSegments: 80,  waveMotionRadius: 45,  waterRefl: 0, npcAnimDistance: 28, streamDistance: 0.45 },
  low:    { pixelRatioCap: 0.75, shadowMapSize: 0,    shadowsEnabled: false, viewChunkRadius: 4, grassDensity: 0.0,  anisotropy: 1, postfx: false, fogMul: 1.7, waterSegments: 112, waveMotionRadius: 80,  waterRefl: 0, npcAnimDistance: 45, streamDistance: 0.7 },
  medium: { pixelRatioCap: 1.0,  shadowMapSize: 1024, shadowsEnabled: true,  viewChunkRadius: 5, grassDensity: 0.26, anisotropy: 2, postfx: false, fogMul: 1.25, waterSegments: 152, waveMotionRadius: 95,  waterRefl: 0, npcAnimDistance: 55, streamDistance: 0.9 },
  high:   { pixelRatioCap: 1.25, shadowMapSize: 2048, shadowsEnabled: true,  viewChunkRadius: 6, grassDensity: 0.65, anisotropy: 4, postfx: false, fogMul: 1.0, waterSegments: 208, waveMotionRadius: 130, waterRefl: 1, npcAnimDistance: 95, streamDistance: 1.0 },
  ultra:  { pixelRatioCap: 1.5,  shadowMapSize: 4096, shadowsEnabled: true,  viewChunkRadius: 7, grassDensity: 1.0,  anisotropy: 8, postfx: true,  fogMul: 0.92, waterSegments: 280, waveMotionRadius: 160, waterRefl: 1, npcAnimDistance: 130, streamDistance: 1.0 },
};

/** Fase 28 — ADAPTIVE RESOLUTION LADDER. Never touches the user's tier:
 *  it modulates only the INTERNAL render resolution (a multiplier on the
 *  effective pixel ratio). The eye forgives soft pixels; it never forgives
 *  a slideshow. */
const ADAPTIVE_SCALES = [1.0, 0.92, 0.84, 0.76, 0.7];

/**
 * Core render engine: renderer, scene, cameras, resize handling and the
 * fixed-ish update loop that drives every game system.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  quality: QualitySettings = { ...QUALITY_PRESETS.high };
  private clock = new THREE.Clock();
  private updaters: Array<(dt: number, elapsed: number) => void> = [];
  private running = false;
  private frameHandle = 0;
  /** Fase 14 — sombras cada N frames (1 = cada frame). */
  private shadowEvery = 1;
  private frameIdx = 0;
  fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;
  onWebGLContextLost?: () => void;
  /** Fase 4 — cinematic post-processing chain (Ultra). */
  postfx: PostFX | null = null;

  // ---- Fase 28 — adaptive resolution governor ------------------------------
  /** Current internal-resolution multiplier (1.0 = as configured). */
  adaptiveScale = 1.0;
  /** Rolling frame-interval EMA in ms (drives the governor; >18 sustained
   *  = the device can't hold the current tier at native res). */
  frameMsEma = 16.7;
  /** Diagnostics: last decided action ("down 0.84" / "up 1.0" / "-"). */
  adaptiveNote = '-';
  private adaptiveIdx = 0;
  private overloadT = 0;
  private headroomT = 0;
  private adaptiveCooldown = 0;
  private basePixelRatio = 1;

  constructor(canvas: HTMLCanvasElement, opts?: { antialias?: boolean }) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // Fase 13 — el MSAA nace apagado en calidades bajas: es de lo más
      // caro en escenas con mucho fill-rate y no se puede alternar en
      // caliente (pertenece al contexto WebGL), así que se decide aquí.
      antialias: opts?.antialias !== false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    // Fase 14 — PCF (no soft) salvo en high/ultra: el filtro soft son muchas
    // más muestras de textura por píxel iluminado y en integradas duele.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9db4c0, 0.0022);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.camera.position.set(0, 30, 60);

    this.applyQuality('high');

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.running = false;
      this.onWebGLContextLost?.();
    });

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  applyQuality(level: QualityLevel): void {
    const prevShadows = this.quality.shadowsEnabled;
    const prevShadowSize = this.quality.shadowMapSize;
    this.quality = { ...QUALITY_PRESETS[level] };
    this.basePixelRatio = pixelRatioFor(this.quality.pixelRatioCap);
    // Fase 28 — a preset change is an explicit user decision: re-arm the
    // adaptive governor at 1.0 and follow the new tier from native.
    this.adaptiveIdx = 0;
    this.adaptiveScale = ADAPTIVE_SCALES[0];
    this.overloadT = 0; this.headroomT = 0; this.adaptiveCooldown = 0;
    this.adaptiveNote = 'rearm';
    this.applyPixelRatio();
    this.renderer.shadowMap.enabled = this.quality.shadowsEnabled;
    const shadowsToggled = prevShadows !== this.quality.shadowsEnabled;
    const shadowSizeChanged = prevShadowSize !== this.quality.shadowMapSize;

    this.scene.traverse((obj) => {
      // Shadow-casting lights: apply the new shadow map size.
      const light = obj as THREE.DirectionalLight;
      if ((light as THREE.DirectionalLight).isDirectionalLight && light.shadow) {
        if (this.quality.shadowMapSize > 0) {
          if (light.shadow.mapSize.x !== this.quality.shadowMapSize) {
            light.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
            // Dispose the old map so three.js regenerates it at the new size
            light.shadow.map?.dispose();
            light.shadow.map = null;
          }
          light.castShadow = true;
        } else {
          light.castShadow = false;
        }
      }
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const std = m as THREE.MeshStandardMaterial;
          // Fase 28 — anisotropy only takes effect on an uploaded texture if
          // the texture is re-uploaded; mark it ONLY when the value actually
          // changed (a blanket needsUpdate re-uploads every mip of every
          // texture in the world — a visible hitch right at the tier switch).
          if (std.map) {
            const lastAniso = (std.map.userData.lastAniso as number | undefined) ?? -1;
            if (lastAniso !== this.quality.anisotropy) {
              std.map.userData.lastAniso = this.quality.anisotropy;
              std.map.anisotropy = this.quality.anisotropy;
              std.map.needsUpdate = true;
            }
          }
          // Shadow on/off & shadow map size require shader recompilation
          if ((shadowsToggled || shadowSizeChanged) && m.type !== 'ShaderMaterial') {
            std.needsUpdate = true;
          }
        });
      }
    });
    this.handleResize();
  }

  /**
   * Fase 13 — ajustes gráficos individuales (oleaje, sombras, luces, pasto,
   * reflejo, distancia de renderizado, resolución) sobre el escalón de
   * calidad `tier`. Es la única puerta de entrada real: los presets solo
   * escriben los interruptores y todos pasan por aquí.
   */
  applyGraphics(gfx: GraphicsSettings, tier: QualityLevel): void {
    const prevShadows = this.quality.shadowsEnabled;
    const prevShadowSize = this.quality.shadowMapSize;
    const prevShadowType = this.renderer.shadowMap.type;
    const base = QUALITY_PRESETS[tier];
    this.quality = {
      ...base,
      pixelRatioCap: gfx.resolution,
      shadowsEnabled: gfx.shadows,
      shadowMapSize: gfx.shadows ? SHADOW_SIZE_BY_TIER[tier] : 0,
      viewChunkRadius: gfx.renderChunks,
      // Fase 14 — sin suelo de 0.4: la densidad de pasto es la del escalón.
      grassDensity: gfx.grass3d ? base.grassDensity : 0,
      postfx: gfx.postfx,
      waterRefl: gfx.reflections > 0 ? 1 : 0,
    };
    // Fase 14 — cadencia + filtro de sombras por escalón
    this.shadowEvery = this.quality.shadowsEnabled ? SHADOW_RATE_BY_TIER[tier] : 1;
    const wantSoft = tier === 'high' || tier === 'ultra';
    const shadowTypeChanged = prevShadowType !== (wantSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap);
    this.renderer.shadowMap.type = wantSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = this.shadowEvery <= 1;
    if (!this.renderer.shadowMap.autoUpdate) this.renderer.shadowMap.needsUpdate = true;
    this.basePixelRatio = pixelRatioFor(this.quality.pixelRatioCap);
    this.applyPixelRatio();
    this.renderer.shadowMap.enabled = this.quality.shadowsEnabled;
    const shadowsToggled = prevShadows !== this.quality.shadowsEnabled;
    const shadowSizeChanged = prevShadowSize !== this.quality.shadowMapSize;

    this.scene.traverse((obj) => {
      // Shadow-casting lights: apply the new shadow map size.
      const light = obj as THREE.DirectionalLight;
      if ((light as THREE.DirectionalLight).isDirectionalLight && light.shadow) {
        if (this.quality.shadowMapSize > 0) {
          if (light.shadow.mapSize.x !== this.quality.shadowMapSize) {
            light.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
            // Dispose the old map so three.js regenerates it at the new size
            light.shadow.map?.dispose();
            light.shadow.map = null;
          }
          light.castShadow = true;
        } else {
          light.castShadow = false;
        }
      }
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const std = m as THREE.MeshStandardMaterial;
          if (std.map) std.map.anisotropy = this.quality.anisotropy;
          // Shadow on/off, map size and filter type require shader recompilation
          if ((shadowsToggled || shadowSizeChanged || shadowTypeChanged) && m.type !== 'ShaderMaterial') {
            std.needsUpdate = true;
          }
        });
      }
    });
    this.handleResize();
  }

  private handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.basePixelRatio * this.adaptiveScale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.postfx?.resize();
  };

  /** Fase 28 — re-apply the effective pixel ratio (base tier × adaptive). */
  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(this.basePixelRatio * this.adaptiveScale);
  }

  addUpdater(fn: (dt: number, elapsed: number) => void): void {
    this.updaters.push(fn);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.frameHandle = requestAnimationFrame(loop);
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.1); // clamp huge pauses
      const elapsed = this.clock.elapsedTime;
      this.stepAdaptive(rawDt);
      // FPS counter
      this.fpsAccum += dt;
      this.fpsFrames++;
      if (this.fpsAccum >= 0.5) {
        this.fps = Math.round(this.fpsFrames / this.fpsAccum);
        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }
      for (const u of this.updaters) u(dt, elapsed);
      // Fase 14 — cadencia de sombras: con autoUpdate apagado solo marcamos
      // needsUpdate cada N frames (el sol no corre, nadie lo nota).
      if (this.renderer.shadowMap.enabled && !this.renderer.shadowMap.autoUpdate) {
        this.frameIdx++;
        this.renderer.shadowMap.needsUpdate = this.frameIdx % this.shadowEvery === 0;
      }
      if (this.postfx?.enabled) {
        this.postfx.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  /**
   * Fase 28 — one governor step per frame. A rolling frame-INTERVAL EMA is
   * the signal (rAF pacing: on a synced display the interval IS the frame
   * cost when the device is overloaded, and the vsync floor when it is
   * not). Sustained > 1.28x the 16.7 ms budget (~<47 fps) for 0.8 s steps
   * the internal resolution DOWN the ADAPTIVE_SCALES ladder (cooldown 1.2 s
   * so a single GC/tier-switch hitch can never trigger it); sustained
   * < 0.8x budget (~>75 fps) for 2.6 s steps it back UP. Hysteresis by
   * construction: the down-window (0.8 s) is 3x shorter than the up-window
   * (2.6 s), and every step re-arms both — it can never oscillate.
   * Tab switches and >400 ms stalls are ignored entirely.
   */
  private stepAdaptive(rawDt: number): void {
    if (!this.running) return;
    const ms = rawDt * 1000;
    if (ms > 400 || ms < 1) return; // backgrounding / timer stalls
    this.frameMsEma = this.frameMsEma * 0.9 + Math.min(ms, 250) * 0.1;
    if (this.adaptiveCooldown > 0) this.adaptiveCooldown = Math.max(0, this.adaptiveCooldown - rawDt);
    const budget = 16.7;
    if (this.frameMsEma > budget * 1.28) {
      this.headroomT = 0;
      if (this.adaptiveCooldown <= 0) {
        this.overloadT += rawDt;
        if (this.overloadT > 0.8 && this.adaptiveIdx < ADAPTIVE_SCALES.length - 1) {
          this.adaptiveIdx += 1;
          this.adaptiveScale = ADAPTIVE_SCALES[this.adaptiveIdx];
          this.adaptiveNote = `down ${this.adaptiveScale.toFixed(2)}`;
          this.applyPixelRatio();
          this.overloadT = 0;
          this.adaptiveCooldown = 1.2;
        }
      }
    } else if (this.frameMsEma < budget * 0.8) {
      this.overloadT = 0;
      if (this.adaptiveIdx > 0) {
        this.headroomT += rawDt;
        if (this.headroomT > 2.6) {
          this.adaptiveIdx -= 1;
          this.adaptiveScale = ADAPTIVE_SCALES[this.adaptiveIdx];
          this.adaptiveNote = `up ${this.adaptiveScale.toFixed(2)}`;
          this.applyPixelRatio();
          this.headroomT = 0;
          this.adaptiveCooldown = 1.2;
        }
      }
    } else {
      this.overloadT = 0;
      this.headroomT = 0;
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
  }
}
