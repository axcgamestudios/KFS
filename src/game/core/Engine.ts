import * as THREE from 'three';
import type { PostFX } from '../world/PostFX';

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

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  xlow:   { pixelRatioCap: 0.62, shadowMapSize: 0,    shadowsEnabled: false, viewChunkRadius: 2, grassDensity: 0.0,  anisotropy: 1, postfx: false, fogMul: 3.4, waterSegments: 96,  waveMotionRadius: 55,  waterRefl: 0, npcAnimDistance: 28, streamDistance: 0.45 },
  low:    { pixelRatioCap: 0.75, shadowMapSize: 0,    shadowsEnabled: false, viewChunkRadius: 4, grassDensity: 0.0,  anisotropy: 1, postfx: false, fogMul: 1.7, waterSegments: 160, waveMotionRadius: 130, waterRefl: 0, npcAnimDistance: 45, streamDistance: 0.7 },
  medium: { pixelRatioCap: 1.0,  shadowMapSize: 1024, shadowsEnabled: true,  viewChunkRadius: 5, grassDensity: 0.4,  anisotropy: 2, postfx: false, fogMul: 1.15, waterSegments: 224, waveMotionRadius: 260, waterRefl: 0, npcAnimDistance: 70, streamDistance: 0.9 },
  high:   { pixelRatioCap: 1.25, shadowMapSize: 2048, shadowsEnabled: true,  viewChunkRadius: 6, grassDensity: 0.75, anisotropy: 4, postfx: false, fogMul: 1.0, waterSegments: 320, waveMotionRadius: 520, waterRefl: 1, npcAnimDistance: 95, streamDistance: 1.0 },
  ultra:  { pixelRatioCap: 1.5,  shadowMapSize: 4096, shadowsEnabled: true,  viewChunkRadius: 7, grassDensity: 1.0,  anisotropy: 8, postfx: true,  fogMul: 0.92, waterSegments: 384, waveMotionRadius: 2000, waterRefl: 1, npcAnimDistance: 130, streamDistance: 1.0 },
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
  fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;
  onWebGLContextLost?: () => void;
  /** Fase 4 — cinematic post-processing chain (Ultra). */
  postfx: PostFX | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
