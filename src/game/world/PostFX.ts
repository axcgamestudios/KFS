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
 * Fase 13 — LAZY: el render target multisample HalfFloat a pantalla completa
 * cuesta ~80 MB de GPU aunque la cadena esté apagada. Ahora el composer se
 * construye la primera vez que se activa, y las calidades bajas nunca lo
 * reservan.
 *
 * Lower quality levels bypass the composer entirely (direct render) to keep
 * the frame budget for vegetation.
 */
export class PostFX {
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  enabled = false;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private rt: THREE.WebGLRenderTarget | null = null;
  private bloomBase = 0.32;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  /** Construye la cadena (una sola vez, bajo demanda). */
  private build(): void {
    if (this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    // Multisampled render target keeps MSAA through the post chain (WebGL2)
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(this.renderer, this.rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
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
    if (on) this.build(); // lazy: solo reserva GPU quien de verdad lo usa
    this.enabled = on && !!this.composer;
    // When disabled the renderer draws directly (renderer.render), which the
    // engine falls back to when postfx.enabled === false.
  }

  /** Storms and dusk push the bloom a little (wet glints, lanterns). */
  setMoodBoost(k: number): void {
    if (this.bloom) this.bloom.strength = this.bloomBase * (1 + k);
  }

  resize(): void {
    if (!this.composer || !this.rt) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(size.x, size.y);
    this.composer.setSize(size.x, size.y);
  }

  render(): void {
    this.composer?.render();
  }

  dispose(): void {
    this.composer?.dispose();
    this.rt?.dispose();
    this.composer = null;
    this.bloom = null;
    this.rt = null;
  }
}
