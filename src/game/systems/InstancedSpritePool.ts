import * as THREE from 'three';

/**
 * Fase 15 — InstancedSpritePool.
 *
 * Drop-in replacement for the old per-THREE.Sprite pools used by VfxSystem
 * and NavalSystem. Every THREE.Sprite is its own draw call; during a dragon
 * fire breath the embers + smoke alone could add ~90 transparent draws per
 * frame. Here the WHOLE pool renders as ONE InstancedMesh billboard batch:
 *
 *   · instanceMatrix carries position + uniform scale
 *   · aOpacity / aScale carry per-instance fade + live size
 *   · the texture keeps its baked radial gradient (same look as before)
 *
 * Same lifecycle API (spawn/update) so call sites barely change.
 */

export interface SpawnOpts {
  grow?: number;
  drag?: number;
  gravity?: number;
  fade?: number;
  opacity?: number;
}

interface Active {
  slot: number;
  t: number;
  dur: number;
  grow: number;
  vel: THREE.Vector3;
  drag: number;
  gravity: number;
  fade: number;
  baseOpacity: number;
  baseScale: number;
  scale: number;
  pos: THREE.Vector3;
}

const VERT = /* glsl */ `
  attribute float aOpacity;
  varying vec2 vUv;
  varying float vOpacity;
  void main() {
    vUv = uv;
    vOpacity = aOpacity;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // billboard: expand in view space using the instance's uniform scale
    float s = length(instanceMatrix[0].xyz);
    mv.xy += position.xy * s;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying float vOpacity;
  void main() {
    if (vOpacity <= 0.004) discard;
    vec4 tex = texture2D(uMap, vUv);
    gl_FragColor = vec4(tex.rgb, tex.a * vOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class InstancedSpritePool {
  private mesh: THREE.InstancedMesh;
  private aOpacity: THREE.InstancedBufferAttribute;
  private slots: Active[] = [];
  private free: number[] = [];
  private mat4 = new THREE.Matrix4();
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private scl = new THREE.Vector3();
  private dirty = false;

  constructor(
    scene: THREE.Scene,
    count: number,
    color: string,
    additive: boolean,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, color);
    grad.addColorStop(0.55, additive ? color : 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(1, 1);
    this.aOpacity = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('aOpacity', this.aOpacity);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uMap: { value: tex } },
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'inst_sprite_pool';
    // hide every slot until spawned
    this.scl.set(0, 0, 0);
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, this.mat4.compose(this.pos.set(0, -999, 0), this.quat, this.scl));
      this.aOpacity.setX(i, 0);
      this.free.push(i);
    }
    scene.add(this.mesh);
  }

  get activeCount(): number {
    return this.slots.length;
  }

  spawn(pos: THREE.Vector3, scale: number, dur: number, vel?: THREE.Vector3, opts: SpawnOpts = {}): void {
    const slot = this.free.pop();
    if (slot === undefined) return; // cap reached — silently drop
    const a: Active = {
      slot,
      t: 0,
      dur,
      grow: opts.grow ?? 1.4,
      vel: vel ? vel.clone() : new THREE.Vector3(),
      drag: opts.drag ?? 0.4,
      gravity: opts.gravity ?? 0,
      fade: opts.fade ?? 1,
      baseOpacity: opts.opacity ?? 0.9,
      baseScale: scale,
      scale,
      pos: pos.clone(),
    };
    this.slots.push(a);
    this.aOpacity.setX(slot, a.baseOpacity);
    this.aOpacity.needsUpdate = true;
    this.dirty = true;
  }

  update(dt: number): void {
    if (this.slots.length === 0 && !this.dirty) return;
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const a = this.slots[i];
      a.t += dt;
      const k = a.t / a.dur;
      if (k >= 1) {
        this.aOpacity.setX(a.slot, 0);
        this.scl.set(0, 0, 0);
        this.mesh.setMatrixAt(a.slot, this.mat4.compose(this.pos.set(0, -999, 0), this.quat, this.scl));
        this.free.push(a.slot);
        this.slots.splice(i, 1);
        continue;
      }
      const dampK = Math.max(0, 1 - a.drag * dt);
      a.vel.multiplyScalar(dampK);
      a.vel.y += a.gravity * dt;
      a.pos.addScaledVector(a.vel, dt);
      a.scale *= 1 + a.grow * dt;
      this.aOpacity.setX(a.slot, a.baseOpacity * (1 - Math.pow(k, a.fade)));
      this.mesh.setMatrixAt(a.slot, this.mat4.compose(a.pos, this.quat, this.scl.set(a.scale, a.scale, a.scale)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aOpacity.needsUpdate = true;
    this.dirty = this.slots.length > 0;
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    (this.mesh.material as THREE.ShaderMaterial).dispose();
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uMap.value?.dispose?.();
    this.mesh.geometry.dispose();
    this.slots.length = 0;
    this.free.length = 0;
  }
}
