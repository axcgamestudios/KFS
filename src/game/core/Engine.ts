import * as THREE from 'three';
import type { PostFX } from '../world/PostFX';
import type { GraphicsSettings } from './Graphics';

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
  xlow: 4, low: 3, medium: 2, high: 1, ultra: 1,
};

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  xlow:   { pixelRatioCap: 0.62, shadowMapSize: 0,    shadowsEnabled: false, viewChunkRadius: 2, grassDensity: 0.0,  anisotropy: 1, postfx: false, fogMul: 3.4, waterSegments: 80,  waveMotionRadius: 45,  waterRefl: 0, npcAnimDistance: 28, streamDistance: 0.45 },
  low:    { pixelRatioCap: 0.75, shadowMapSize: 0,    shadowsEnabled: false, viewChunkRadius: 4, grassDensity: 0.0,  anisotropy: 1, postfx: false, fogMul: 1.7, waterSegments: 112, waveMotionRadius: 80,  waterRefl: 0, npcAnimDistance: 45, streamDistance: 0.7 },
  medium: { pixelRatioCap: 1.0,  shadowMapSize: 1024, shadowsEnabled: true,  viewChunkRadius: 5, grassDensity: 0.26, anisotropy: 2, postfx: false, fogMul: 1.25, waterSegments: 152, waveMotionRadius: 95,  waterRefl: 0, npcAnimDistance: 55, streamDistance: 0.9 },
  high:   { pixelRatioCap: 1.25, shadowMapSize: 2048, shadowsEnabled: true,  viewChunkRadius: 6, grassDensity: 0.65, anisotropy: 4, postfx: false, fogMul: 1.0, waterSegments: 208, waveMotionRadius: 130, waterRefl: 1, npcAnimDistance: 95, streamDistance: 1.0 },
  ultra:  { pixelRatioCap: 1.5,  shadowMapSize: 4096, shadowsEnabled: true,  viewChunkRadius: 7, grassDensity: 1.0,  anisotropy: 8, postfx: true,  fogMul: 0.92, waterSegments: 280, waveMotionRadius: 160, waterRefl: 1, npcAnimDistance: 130, streamDistance: 1.0 },
};

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
    const pr = Math.min(window.devicePixelRatio, this.quality.pixelRatioCap);
    this.renderer.setPixelRatio(pr);
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
    const pr = Math.min(window.devicePixelRatio, this.quality.pixelRatioCap);
    this.renderer.setPixelRatio(pr);
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
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.postfx?.resize();
  };

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
      const dt = Math.min(this.clock.getDelta(), 0.1); // clamp huge pauses
      const elapsed = this.clock.elapsedTime;
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
