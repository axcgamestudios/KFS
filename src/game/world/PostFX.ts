import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Fase 21 — REALISTIC SUN SHAFTS (god rays): a single radial-accumulation
 * pass over the bright pixels of the rendered frame. The sky dome's sun +
 * the bloomed clouds are the emitters, so the shafts flow THROUGH the cloud
 * masses exactly like crepuscular rays at sea — never a bolted-on flare.
 * Tuned subtle (see GODRAY_STRENGTH): "rays, not a laser show".
 */
const SunShaftsShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSunPos: { value: new THREE.Vector2(0.5, 0.5) },  // screen UV of the sun
    uStrength: { value: 0.0 },                          // 0 = hidden/off
    uAspect: { value: 1.0 },
    uTime: { value: 0.0 },                              // slow shaft drift
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunPos;
    uniform float uStrength;
    uniform float uAspect;
    uniform float uTime;
    varying vec2 vUv;

    // 1-D hash noise for the shaft pattern (stable, no textures)
    float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
    float noise1(float x) {
      float i = floor(x); float f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(hash1(i), hash1(i + 1.0), f);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.001) {
        gl_FragColor = base;
        return;
      }

      // aspect-corrected vector from the sun to this pixel
      vec2 toPix = (vUv - uSunPos) * vec2(uAspect, 1.0);
      float dist = length(toPix);

      // The crepuscular CORRIDOR: shafts live within ~65% of the screen
      // around the sun and melt into the sky at the edges.
      float radial = clamp(1.0 - dist * 1.05, 0.0, 1.0);
      radial *= radial;

      // Shaft pattern: two noise octaves across the ANGLE around the sun —
      // bright rays separated by darker gaps, drifting imperceptibly like
      // the real atmosphere. The gaps widen with distance (nature's
      // perspective: near the sun the rays fan out tight).
      float ang = atan(toPix.y, toPix.x);
      float shafts = noise1(ang * 26.0 + uTime * 0.015) * 0.62
                   + noise1(ang * 55.0 - uTime * 0.009) * 0.38;
      shafts = pow(shafts, 1.7);                       // deepen the gaps
      shafts *= 0.75 + 0.25 * noise1(ang * 9.0 + 40.0); // a few dominant beams

      // Sun-colored light: warm gold, slightly desaturating with distance
      vec3 shaftCol = mix(vec3(1.08, 0.95, 0.72), vec3(1.0, 0.93, 0.82), clamp(dist * 1.3, 0.0, 1.0));

      // Composite: additive, clamped — never a blowout, never neon
      vec3 add = shaftCol * shafts * radial * uStrength;
      add = min(add, vec3(0.85));
      gl_FragColor = vec4(base.rgb + add, base.a);
    }
  `,
};

/**
 * Fase 4 — cinematic post-processing (Ultra quality).
 *
 * Pipeline: RenderPass → UnrealBloom (subtle, only bright light sources) →
 * Sun Shafts (Fase 21) → OutputPass (ACES tone mapping + sRGB). The composer
 * render target is multisampled (4×) so antialiasing survives the post chain.
 *
 * Fase 13 — LAZY: the render target multisample HalfFloat at full screen
 * costs ~80 MB of GPU even with the chain off. The composer is now built the
 * first time the chain is enabled; low qualities never reserve it.
 *
 * Fase 21 — HIGH also runs the chain now (bloom + the sun shafts the user
 * asked for on high graphics).
 */
export class PostFX {
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  shafts: ShaderPass | null = null;
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

  /** Builds the chain (once, on demand). */
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
    // Fase 21 — sun shafts after the bloom (the bloom-fed sun/cloud edges
    // become the shaft emitters)
    this.shafts = new ShaderPass(SunShaftsShader);
    this.shafts.uniforms.uAspect.value = size.x / Math.max(1, size.y);
    this.composer.addPass(this.shafts);
    // ACES tone mapping + sRGB conversion at the end of the chain
    this.composer.addPass(new OutputPass());
  }

  /** Toggle the whole chain (quality preset change). */
  setEnabled(on: boolean): void {
    if (on) this.build(); // lazy: only those who really use it reserve GPU
    this.enabled = on && !!this.composer;
    // When disabled the renderer draws directly (renderer.render), which the
    // engine falls back to when postfx.enabled === false.
  }

  /**
   * Fase 21 — feed the shaft pass: the sun's screen position (UV) and a
   * combined strength (0 hides the rays: sun behind the camera, night,
   * heavy storm). Called every frame by the game loop when the chain is on.
   */
  setSun(uvX: number, uvY: number, strength: number, time = 0): void {
    if (!this.shafts) return;
    this.shafts.uniforms.uSunPos.value.set(uvX, uvY);
    this.shafts.uniforms.uStrength.value = strength;
    this.shafts.uniforms.uTime.value = time;
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
    if (this.shafts) this.shafts.uniforms.uAspect.value = size.x / Math.max(1, size.y);
  }

  render(): void {
    this.composer?.render();
  }

  dispose(): void {
    this.composer?.dispose();
    this.rt?.dispose();
    this.composer = null;
    this.bloom = null;
    this.shafts = null;
    this.rt = null;
  }
}
