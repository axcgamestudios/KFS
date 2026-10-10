import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Fase 4 — Asset system.
 * Loads the PBR texture set and the GLB models obtained from the project
 * repository (public/game/) and wires them into the shared material library.
 *
 * Everything degrades gracefully: if any file fails to load the game keeps
 * its Fase 1-3 look (plain colors / vertex colors).
 */

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap?: THREE.Texture;
}

const TEX_BASE = '/game/textures/';
const MODEL_BASE = '/game/models/';

function loadTexture(
  loader: THREE.TextureLoader,
  url: string,
  anisotropy: number,
  srgb: boolean,
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (t) => {
        t.anisotropy = anisotropy;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        resolve(t);
      },
      undefined,
      () => reject(new Error(`texture failed: ${url}`)),
    );
  });
}

export class AssetSystem {
  /** PBR sets by short name (stone_wall, wood, roof_tiles, …). */
  readonly pbr: Record<string, PbrSet> = {};
  /** Maple bark / leaf textures (tree shader). */
  mapleBark?: THREE.Texture;
  mapleLeaf?: THREE.Texture;
  terrainDetail?: THREE.Texture;

  private gltf = new GLTFLoader();
  private models = new Map<string, THREE.Object3D>();
  private modelWaiters = new Map<string, Array<() => void>>();
  private failed = new Set<string>();
  private anisotropy = 4;

  /** Texture loading status for the progress screen. */
  loadedCount = 0;
  totalCount = 0;

  /**
   * Load the core texture set. Called during boot BEFORE the world is built
   * so structures can receive PBR materials right away.
   */
  async loadCoreTextures(anisotropy: number, onProgress?: (frac: number) => void): Promise<void> {
    this.anisotropy = anisotropy;
    const loader = new THREE.TextureLoader();
    const sets: Array<[string, boolean]> = [
      // [name, hasRoughness]
      ['stone_wall', true],
      ['cobblestone', true],
      ['wood', true],
      ['dirt', false],
      ['grass', false],
      ['roof_tiles', true],
      ['castle_floor', true],
      ['dungeon_stone', true],
    ];
    const singles: Array<[keyof AssetSystem, string, boolean]> = [
      ['mapleBark', 'maple_bark.jpg', true],
      ['mapleLeaf', 'maple_leaf.png', true],
      ['terrainDetail', 'terrain_detail.jpg', true],
    ];
    this.totalCount = sets.length * 2 + sets.filter((s) => s[1]).length + singles.length;

    const tick = () => {
      this.loadedCount++;
      onProgress?.(this.loadedCount / this.totalCount);
    };

    await Promise.all([
      ...sets.map(async ([name, hasRgh]) => {
        try {
          const [map, nrm] = await Promise.all([
            loadTexture(loader, `${TEX_BASE}${name}_alb.jpg`, anisotropy, true),
            loadTexture(loader, `${TEX_BASE}${name}_nrm.jpg`, anisotropy, false),
          ]);
          const set: PbrSet = { map, normalMap: nrm };
          if (hasRgh) {
            try {
              set.roughnessMap = await loadTexture(loader, `${TEX_BASE}${name}_rgh.jpg`, anisotropy, false);
            } catch { /* optional */ }
          }
          this.pbr[name] = set;
        } catch {
          // Keep the plain-color fallback
        }
        tick();
      }),
      ...singles.map(async ([key, file, srgb]) => {
        try {
          (this[key] as THREE.Texture | undefined) = await loadTexture(loader, TEX_BASE + file, anisotropy, srgb);
        } catch { /* optional */ }
        tick();
      }),
    ]);
  }

  /**
   * Apply the loaded PBR sets to the shared structure material library.
   * `mat` is the MAT record from structures/Materials.ts.
   */
  applyToStructureMaterials(mat: Record<string, THREE.MeshStandardMaterial>): void {
    const wire = (
      m: THREE.MeshStandardMaterial | undefined,
      set: PbrSet | undefined,
      opts: { repeat: number; tint?: number; normalScale?: number; roughness?: number } ,
    ) => {
      if (!m || !set) return;
      const map = set.map.clone();
      const nrm = set.normalMap.clone();
      map.repeat.set(opts.repeat, opts.repeat);
      nrm.repeat.set(opts.repeat, opts.repeat);
      map.needsUpdate = true;
      nrm.needsUpdate = true;
      if (opts.tint !== undefined) m.color.setHex(opts.tint).multiplyScalar(1);
      m.map = map;
      m.normalMap = nrm;
      m.normalScale.set(opts.normalScale ?? 1, opts.normalScale ?? 1);
      if (set.roughnessMap) {
        const rgh = set.roughnessMap.clone();
        rgh.repeat.set(opts.repeat, opts.repeat);
        rgh.needsUpdate = true;
        m.roughnessMap = rgh;
      }
      if (opts.roughness !== undefined) m.roughness = opts.roughness;
      m.needsUpdate = true;
    };

    // Stone → castle walls, ruins, towers
    wire(mat.stone, this.pbr.stone_wall, { repeat: 0.5, tint: 0xb8b2a6, normalScale: 0.9 });
    wire(mat.stoneDark, this.pbr.dungeon_stone, { repeat: 0.45, tint: 0x9a958a, normalScale: 1.1 });
    wire(mat.stoneMoss, this.pbr.stone_wall, { repeat: 0.5, tint: 0x9aa08c, normalScale: 1.0 });
    // Wood family
    wire(mat.wood, this.pbr.wood, { repeat: 1.1, tint: 0xb08a64, normalScale: 0.9 });
    wire(mat.woodDark, this.pbr.wood, { repeat: 1.2, tint: 0x8a6a4a, normalScale: 1.0 });
    wire(mat.woodLight, this.pbr.wood, { repeat: 1.0, tint: 0xc9a67e, normalScale: 0.8 });
    wire(mat.timber, this.pbr.wood, { repeat: 1.4, tint: 0x7a5c3e, normalScale: 1.1 });
    wire(mat.woodShip, this.pbr.wood, { repeat: 1.0, tint: 0xa07e5a, normalScale: 1.0 });
    wire(mat.woodPirate, this.pbr.wood, { repeat: 1.1, tint: 0x6e5640, normalScale: 1.15 });
    // Roofs
    wire(mat.roofRed, this.pbr.roof_tiles, { repeat: 1.6, tint: 0xc98a72, normalScale: 1.2 });
    wire(mat.roofSlate, this.pbr.roof_tiles, { repeat: 1.5, tint: 0x8e959e, normalScale: 1.1 });
    wire(mat.roofThatch, this.pbr.grass, { repeat: 2.2, tint: 0xb99e62, normalScale: 0.8, roughness: 0.95 });
    // Fase 4 ground materials
    wire(mat.cobble, this.pbr.cobblestone, { repeat: 0.42, tint: 0xb5aca0, normalScale: 1.1 });
    wire(mat.dirt, this.pbr.dirt, { repeat: 0.5, tint: 0xb59a76, normalScale: 0.9 });
  }

  // ------------------------------------------------------------------ models

  /** Load a GLB model once; returns a CLONE ready to place (materials shared). */
  loadModel(key: string): Promise<THREE.Object3D> {
    const ready = this.models.get(key);
    if (ready) return Promise.resolve(this.cloneModel(key, ready));
    if (this.failed.has(key)) return Promise.reject(new Error(`model failed earlier: ${key}`));
    return new Promise((resolve, reject) => {
      const waiters = this.modelWaiters.get(key) ?? [];
      waiters.push(() => {
        const m = this.models.get(key);
        if (m) resolve(this.cloneModel(key, m));
        else reject(new Error(`model failed: ${key}`));
      });
      this.modelWaiters.set(key, waiters);
      if (waiters.length === 1) {
        this.gltf.load(
          MODEL_BASE + key,
          (gltf) => {
            const root = gltf.scene;
            root.traverse((o) => {
              const mesh = o as THREE.Mesh;
              if (mesh.isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
              }
            });
            this.models.set(key, root);
            this.modelWaiters.get(key)?.forEach((fn) => fn());
            this.modelWaiters.delete(key);
          },
          undefined,
          () => {
            this.failed.add(key);
            this.modelWaiters.get(key)?.forEach((fn) => fn());
            this.modelWaiters.delete(key);
          },
        );
      }
    });
  }

  /** Is the model already downloaded? (for optional UI hints) */
  hasModel(key: string): boolean {
    return this.models.has(key);
  }

  private cloneModel(key: string, root: THREE.Object3D): THREE.Object3D {
    // Skinned meshes MUST own their skeleton. Object3D.clone(true) shares the
    // original skeleton (three r170 SkinnedMesh.copy assigns the reference),
    // so the clone's mesh would be skinned by the CACHED, detached original
    // bones: animations written to the cloned bones never reach the mesh and
    // stale world matrices distort it. SkeletonUtils.clone rebuilds the
    // skeleton around the cloned bones and rebinds every SkinnedMesh.
    const clone = skeletonClone(root);
    clone.name = `${key}_instance`;
    return clone;
  }

  /** Extract the native animations of a loaded model (for the black dragon idle). */
  loadModelWithAnimations(key: string): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> {
    return new Promise((resolve, reject) => {
      this.gltf.load(
        MODEL_BASE + key,
        (gltf) => {
          gltf.scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          resolve({ scene: gltf.scene, clips: gltf.animations });
        },
        undefined,
        () => reject(new Error(`model failed: ${key}`)),
      );
    });
  }

  dispose(): void {
    for (const set of Object.values(this.pbr)) {
      set.map.dispose();
      set.normalMap.dispose();
      set.roughnessMap?.dispose();
    }
    this.mapleBark?.dispose();
    this.mapleLeaf?.dispose();
    this.terrainDetail?.dispose();
    for (const m of this.models.values()) {
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
        }
      });
    }
    this.models.clear();
  }
}
