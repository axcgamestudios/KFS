import * as THREE from 'three';

/** Graphics quality presets. */
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  pixelRatioCap: number;
  shadowMapSize: number;
  shadowsEnabled: boolean;
  viewChunkRadius: number;   // terrain chunk streaming radius
  grassDensity: number;      // 0..1 multiplier
  anisotropy: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low:    { pixelRatioCap: 0.75, shadowMapSize: 0,    shadowsEnabled: false, viewChunkRadius: 4, grassDensity: 0.0,  anisotropy: 1 },
  medium: { pixelRatioCap: 1.0,  shadowMapSize: 1024, shadowsEnabled: true,  viewChunkRadius: 5, grassDensity: 0.4,  anisotropy: 2 },
  high:   { pixelRatioCap: 1.25, shadowMapSize: 2048, shadowsEnabled: true,  viewChunkRadius: 6, grassDensity: 0.75, anisotropy: 4 },
  ultra:  { pixelRatioCap: 1.5,  shadowMapSize: 2048, shadowsEnabled: true,  viewChunkRadius: 7, grassDensity: 1.0,  anisotropy: 8 },
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
      this.renderer.render(this.scene, this.camera);
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
