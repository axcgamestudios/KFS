import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Fase 4 — cinematic post-processing (Ultra quality).
 *
 * Pipeline: RenderPass → UnrealBloom (subtle, only bright light sources) →
 * OutputPass (ACES tone mapping + sRGB). The composer render target is
 * multisampled (4×) so antialiasing survives the post chain.
 *
 * Lower quality levels bypass the composer entirely (direct render) to keep
 * the frame budget for vegetation.
 */
export class PostFX {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private rt: THREE.WebGLRenderTarget;
  enabled = false;
  private bloomBase: number;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    // Multisampled render target keeps MSAA through the post chain (WebGL2)
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });

    this.composer = new EffectComposer(renderer, this.rt);
    this.composer.addPass(new RenderPass(scene, camera));

    // Subtle bloom: only genuinely bright pixels (sun glints, fire, torches)
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.32,  // strength
      0.55,  // radius
      0.86,  // threshold — sun/fire/torch range
    );
    this.bloomBase = this.bloom.strength;
    this.composer.addPass(this.bloom);

    // ACES tone mapping + sRGB conversion at the end of the chain
    this.composer.addPass(new OutputPass());
  }

  /** Toggle the whole chain (quality preset change). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    // When disabled the renderer draws directly (renderer.render), which the
    // engine falls back to when postfx.enabled === false.
  }

  /** Storms and dusk push the bloom a little (wet glints, lanterns). */
  setMoodBoost(k: number): void {
    this.bloom.strength = this.bloomBase * (1 + k);
  }

  resize(): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(size.x, size.y);
    this.composer.setSize(size.x, size.y);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.rt.dispose();
  }
}
