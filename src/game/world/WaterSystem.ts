import * as THREE from 'three';
import { TerrainHeight } from './TerrainHeight';

/**
 * Animated ocean: a large plane that follows the player. Waves are computed
 * in the vertex shader (3 Gerstner waves), shore foam and shallow tint come
 * from a pre-baked terrain heightmap texture, and day/night colors arrive as
 * uniforms from the sky system.
 */
export class WaterSystem {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private time = 0;

  constructor(terrain: TerrainHeight, worldHalf = 1024) {
    // --- Pre-bake a low-res terrain height texture for shore effects ---
    const texRes = 256;
    const data = new Float32Array(texRes * texRes);
    for (let j = 0; j < texRes; j++) {
      for (let i = 0; i < texRes; i++) {
        const x = (i / (texRes - 1) - 0.5) * 2 * worldHalf;
        const z = (j / (texRes - 1) - 0.5) * 2 * worldHalf;
        data[j * texRes + i] = terrain.height(x, z);
      }
    }
    const heightTex = new THREE.DataTexture(
      data, texRes, texRes, THREE.RedFormat, THREE.FloatType,
    );
    heightTex.minFilter = THREE.LinearFilter;
    heightTex.magFilter = THREE.LinearFilter;
    heightTex.wrapS = THREE.ClampToEdgeWrapping;
    heightTex.wrapT = THREE.ClampToEdgeWrapping;
    heightTex.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.2) },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uSkyColor: { value: new THREE.Color(0.55, 0.7, 0.85) },
        uHorizonColor: { value: new THREE.Color(0.8, 0.85, 0.9) },
        uDeepColor: { value: new THREE.Color(0.035, 0.13, 0.16) },
        uShallowColor: { value: new THREE.Color(0.1, 0.38, 0.38) },
        uFoamColor: { value: new THREE.Color(0.92, 0.95, 0.94) },
        uNightFactor: { value: 0 },
        uHeightMap: { value: heightTex },
        uWorldHalf: { value: worldHalf },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uHeightMap;
        uniform float uWorldHalf;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vShore;
        varying float vCrest;

        // Sample terrain height (baked) at world XZ
        float terrainH(vec2 p) {
          vec2 uv = p / (uWorldHalf * 2.0) + 0.5;
          uv = clamp(uv, 0.0, 1.0);
          return texture2D(uHeightMap, uv).r;
        }

        void main() {
          vec3 pos = (modelMatrix * vec4(position, 1.0)).xyz;
          float shore = terrainH(pos.xz);
          // Reduce wave amplitude in very shallow water
          float shallowK = smoothstep(-14.0, -1.5, shore);
          shallowK = clamp(shallowK, 0.15, 1.0);

          float t = uTime;
          // Three Gerstner-ish waves
          float amp1 = 0.42 * shallowK, len1 = 26.0;
          float amp2 = 0.24 * shallowK, len2 = 14.0;
          float amp3 = 0.13 * shallowK, len3 = 7.0;
          vec2 d1 = normalize(vec2(1.0, 0.35));
          vec2 d2 = normalize(vec2(-0.7, 1.0));
          vec2 d3 = normalize(vec2(0.45, -1.0));

          float k1 = 6.28318 / len1, k2 = 6.28318 / len2, k3 = 6.28318 / len3;
          float f1 = k1 * dot(d1, pos.xz) - t * 1.05;
          float f2 = k2 * dot(d2, pos.xz) - t * 1.5;
          float f3 = k3 * dot(d3, pos.xz) - t * 2.1;

          float h = amp1 * sin(f1) + amp2 * sin(f2) + amp3 * sin(f3);
          pos.y += h;

          // Analytic-ish normal from partial derivatives
          float dhx = amp1 * k1 * cos(f1) * d1.x + amp2 * k2 * cos(f2) * d2.x + amp3 * k3 * cos(f3) * d3.x;
          float dhz = amp1 * k1 * cos(f1) * d1.y + amp2 * k2 * cos(f2) * d2.y + amp3 * k3 * cos(f3) * d3.y;
          vNormal = normalize(vec3(-dhx, 1.0, -dhz));

          vWorldPos = pos;
          vShore = shore;
          vCrest = h / max(0.001, amp1 + amp2 + amp3);
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
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vShore;
        varying float vCrest;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }

        void main() {
          vec3 viewDir = normalize(uCameraPos - vWorldPos);
          vec3 n = normalize(vNormal);
          // Small detail ripples
          float rip = noise(vWorldPos.xz * 1.4 + uTime * 0.35) - 0.5;
          float rip2 = noise(vWorldPos.xz * 3.1 - uTime * 0.5) - 0.5;
          n = normalize(n + vec3(rip, 0.0, rip2) * 0.22);

          float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
          fres = clamp(fres, 0.04, 1.0);

          // Water body color by shore depth
          float shallowT = smoothstep(-6.0, -0.4, vShore);
          vec3 body = mix(uDeepColor, uShallowColor, shallowT);

          // Sky reflection
          vec3 refl = mix(uHorizonColor, uSkyColor, 0.5);
          vec3 col = mix(body, refl, fres * 0.85);

          // Sun specular glint
          vec3 sunDir = normalize(uSunDir);
          vec3 halfV = normalize(viewDir + sunDir);
          float spec = pow(max(dot(n, halfV), 0.0), 220.0);
          col += uSunColor * spec * 1.4;
          // Broad glitter path
          float glit = pow(max(dot(n, halfV), 0.0), 24.0);
          col += uSunColor * glit * 0.12;

          // Foam: wave crests + shore band with noise
          float crestFoam = smoothstep(0.62, 0.95, vCrest);
          float shoreFoam = smoothstep(-1.3, -0.15, vShore) * (1.0 - smoothstep(-0.15, 0.35, vShore));
          float fnoise = noise(vWorldPos.xz * 1.7 + uTime * 0.5) * 0.6 + noise(vWorldPos.xz * 4.3 - uTime * 0.7) * 0.4;
          float foam = clamp(crestFoam * fnoise * 1.3 + shoreFoam * smoothstep(0.35, 0.75, fnoise) * 1.1, 0.0, 1.0);
          col = mix(col, uFoamColor, foam * 0.85);

          // Night darkening
          col *= mix(1.0, 0.22, uNightFactor);

          float alpha = mix(0.86, 0.62, shallowT);
          alpha = mix(alpha, 0.95, foam);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const size = 1900;
    const geo = new THREE.PlaneGeometry(size, size, 160, 160);
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
    this.material.dispose();
  }
}
