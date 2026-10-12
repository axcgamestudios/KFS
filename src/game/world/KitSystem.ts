import * as THREE from 'three';
import type { AssetSystem } from './AssetSystem';
import type { WeaponKind } from '../entities/CharacterModel';

/**
 * Fase 5 — Kit system.
 * The repository ships two asset KITS as single GLB files (a lowpoly medieval
 * set + a furniture minipack). This module EXPLODES them into individual named
 * objects, normalises each one (world transform baked, bottom anchored at y=0,
 * longest axis up, target size) and hands out clones ready to place —
 * weapons and shields for characters, furniture, village & castle dressing.
 *
 * Degrades gracefully: if a kit file fails to load, procedural fallbacks stay.
 */

export interface KitEntry {
  /** Object name inside the GLB (group node). */
  name: string;
  /** Final height in metres after normalisation. */
  size: number;
  /** Fraction of the height where the object is held / grounded (0 = bottom). */
  grip?: number;
}

const MEDIEVAL: KitEntry[] = [
  { name: 'sword_01', size: 1.06, grip: 0.13 },
  { name: 'sword_02', size: 1.02, grip: 0.14 },
  { name: 'shield_01', size: 0.72 },
  { name: 'shield_02', size: 0.66 },
  { name: 'spear', size: 1.85, grip: 0.18 },
  { name: 'bow.001', size: 1.35, grip: 0.5 },
  { name: 'ax', size: 0.98, grip: 0.1 },
  { name: 'arrow', size: 0.85 },
  { name: 'helmet', size: 0.34 },
  { name: 'well', size: 2.4 },
  { name: 'lamp_post', size: 2.6 },
  { name: 'lamp_wall', size: 0.7 },
  { name: 'banner', size: 2.2 },
  { name: 'barrel', size: 0.95 },
  { name: 'crate', size: 0.8 },
  { name: 'chest', size: 0.72 },
  { name: 'bonfire', size: 1.1 },
  { name: 'target', size: 1.5 },
  { name: 'cage', size: 1.6 },
  { name: 'sign', size: 1.5 },
  { name: 'ladder', size: 2.2 },
  { name: 'fence', size: 1.1 },
  { name: 'bench', size: 0.55 },
  { name: 'table', size: 1.0 },
  { name: 'mug', size: 0.16 },
  { name: 'bottle', size: 0.3 },
  { name: 'jar', size: 0.35 },
  { name: 'candle', size: 0.4 },
  { name: 'plant_01', size: 0.5 },
  { name: 'rock_01', size: 0.9 },
  { name: 'tree_pine', size: 5.5 },
  { name: 'tree_pine_small', size: 3.2 },
  { name: 'tree_chopped', size: 1.4 },
  { name: 'stone_column_01', size: 3.0 },
  { name: 'stone_block', size: 0.9 },
  { name: 'stone_floor', size: 2.0 },
  { name: 'tiles', size: 0.9 },
  { name: 'wall_single', size: 1.8 },
  { name: 'door_arc', size: 2.3 },
  { name: 'door', size: 2.2 },
  { name: 'globe', size: 0.45 },
  { name: 'wood-bridge', size: 3.2 },
];

const FURNITURE: KitEntry[] = [
  { name: 'furniture_table_01', size: 0.95 },
  { name: 'furniture_table_02', size: 0.95 },
  { name: 'furniture_table_round_01', size: 0.9 },
  { name: 'furniture_table_round_02', size: 0.9 },
  { name: 'furniture_chair_01', size: 0.95 },
  { name: 'furniture_chair_02', size: 0.95 },
  { name: 'furniture_bench_01', size: 0.6 },
  { name: 'furniture_bench_02', size: 0.6 },
  { name: 'furniture_bench_small_01', size: 0.5 },
  { name: 'furniture_bench_small_02', size: 0.5 },
  { name: 'furniture_bench_round_01', size: 0.6 },
  { name: 'furniture_bench_round_02', size: 0.6 },
];

/** Weapon kind → kit object (and grip point as a fraction of its height). */
const WEAPON_OBJECT: Record<Exclude<WeaponKind, 'none'>, { kit: string; grip: number }> = {
  sword: { kit: 'sword_02', grip: 0.14 },
  axe: { kit: 'ax', grip: 0.1 },
  spear: { kit: 'spear', grip: 0.18 },
  bow: { kit: 'bow.001', grip: 0.5 },
};

export class KitSystem {
  private templates = new Map<string, THREE.Object3D>();
  /** Fase 12 — textured material library by original material name. */
  private matLib = new Map<string, THREE.Material>();
  ready = false;

  constructor(private assets: AssetSystem) {}

  /** Load + explode both kits. Call during boot. */
  async load(): Promise<void> {
    await Promise.all([
      this.explodeFile('medieval_props.glb', MEDIEVAL, 'kfs_medieval'),
      this.explodeFile('furniture.glb', FURNITURE, 'kfs_furniture'),
    ]);
    this.ready = this.templates.size > 0;
  }

  private async explodeFile(file: string, entries: KitEntry[], label: string): Promise<void> {
    try {
      const root = await this.assets.loadModel(file);
      // Fase 12 — the medieval kit ships 61 FLAT diffuse materials (zero
      // textures): every prop renders as plastic. Remap them to the game's
      // real photo-PBR library, keeping each original colour as a hue tint.
      if (file === 'medieval_props.glb') this.retextureKit(root);
      const byName = new Map<string, THREE.Object3D>();
      root.traverse((o) => { if (o.name && !byName.has(o.name)) byName.set(o.name, o); });
      for (const entry of entries) {
        const node = byName.get(entry.name) ?? byName.get(`${entry.name}_0`);
        if (!node) continue;
        const holder = this.normalise(node, entry, label);
        if (holder) this.templates.set(entry.name, holder);
      }
    } catch {
      /* kit unavailable → procedural fallbacks stay in place */
    }
  }

  /**
   * Fase 12 — swap the kit's flat diffuse materials for textured PBR ones.
   * The kit's UVs are valid 0-1 unwraps, so the photo textures (stone wall,
   * wood planks, roof tiles, leather…) map straight on. The original
   * diffuseFactor is kept as a normalised hue tint so every prop keeps its
   * colour identity while gaining real surface detail.
   */
  private retextureKit(root: THREE.Object3D): void {
    const pbr = this.assets.pbr;
    const texSet = (name: string) => pbr[name];

    const clone = (t: THREE.Texture, repeat = 1): THREE.Texture => {
      const c = t.clone();
      c.wrapS = THREE.RepeatWrapping;
      c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeat, repeat);
      c.needsUpdate = true;
      return c;
    };
    // Original colour as a bright hue tint (max channel → 0.95 keeps the
    // identity but lets the texture read through).
    const tintOf = (m: THREE.MeshStandardMaterial): THREE.Color => {
      const c = m.color.clone();
      const mx = Math.max(c.r, c.g, c.b);
      if (mx > 0.04) c.multiplyScalar(0.95 / mx);
      else c.setScalar(0.95);
      return c;
    };

    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next: THREE.Material[] = [];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        const name = (std.name || '').toLowerCase();
        let out = this.matLib.get(std.name);
        if (!out) {
          out = this.buildKitMaterial(std, name, texSet, clone, tintOf);
          this.matLib.set(std.name, out);
        }
        next.push(out);
      }
      mesh.material = next.length === 1 ? next[0] : next;
    });
  }

  private buildKitMaterial(
    std: THREE.MeshStandardMaterial,
    name: string,
    texSet: (n: string) => { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap?: THREE.Texture } | undefined,
    clone: (t: THREE.Texture, repeat?: number) => THREE.Texture,
    tintOf: (m: THREE.MeshStandardMaterial) => THREE.Color,
  ): THREE.Material {
    const tint = tintOf(std);
    const stone = texSet('stone_wall');
    const wood = texSet('wood');
    const tiles = texSet('roof_tiles');
    const leatherSet = texSet('dirt');
    const bark = this.assets.mapleBark;
    const leaf = this.assets.mapleLeaf;

    const mk = (opts: {
      map?: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture;
      color: THREE.Color; roughness: number; metalness?: number;
      normalScale?: number; emissive?: number; emissiveIntensity?: number;
      transparent?: boolean; opacity?: number; side?: THREE.Side;
    }): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({
        color: opts.color, roughness: opts.roughness, metalness: opts.metalness ?? 0,
        emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
        transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1,
        side: opts.side ?? THREE.FrontSide,
      });
      if (opts.map) m.map = opts.map;
      if (opts.normalMap) { m.normalMap = opts.normalMap; m.normalScale.set(opts.normalScale ?? 1, opts.normalScale ?? 1); }
      if (opts.roughnessMap) m.roughnessMap = opts.roughnessMap;
      return m;
    };

    // --- fire / glow elements stay emissive (no photo texture) ---
    if (/(bonfire|wick|glow|flame|light|lamp_post_light|checkpoint)/.test(name)) {
      return mk({
        color: tint, roughness: 0.6,
        emissive: std.emissive?.getHex() ?? 0xff7a20, emissiveIntensity: /bonfire|wick/.test(name) ? 1.6 : 1.2,
      });
    }
    // --- glass / liquid ---
    if (/(glass|wine|beer|cristal|globe)/.test(name)) {
      return mk({
        color: tint, roughness: 0.08, metalness: 0.05,
        transparent: true, opacity: 0.72,
      });
    }
    // --- metalwork: steel with hammered normal + real metalness ---
    if (/(metal|iron|brass|helmet|nails|fence|cage)/.test(name)) {
      const isBrass = /brass/.test(name);
      return mk({
        map: stone ? clone(stone.map, 0.8) : undefined,
        normalMap: stone ? clone(stone.normalMap, 0.8) : undefined,
        normalScale: 0.22,
        color: isBrass ? new THREE.Color(0xd8a940) : tint,
        roughness: isBrass ? 0.32 : 0.38, metalness: 0.82,
      });
    }
    // --- roof / floor tiles ---
    if (/(tile|tiles)/.test(name) && tiles) {
      return mk({
        map: clone(tiles.map, 1), normalMap: clone(tiles.normalMap, 1),
        roughnessMap: tiles.roughnessMap ? clone(tiles.roughnessMap, 1) : undefined,
        color: tint, roughness: 0.85, normalScale: 1.1,
      });
    }
    // --- masonry ---
    if (/(stone|rock|well$|well_|column|block|stair|bridge|arc)/.test(name) && stone) {
      return mk({
        map: clone(stone.map, 1), normalMap: clone(stone.normalMap, 1),
        roughnessMap: stone.roughnessMap ? clone(stone.roughnessMap, 1) : undefined,
        color: tint, roughness: 0.92, normalScale: 1.0,
      });
    }
    // --- foliage ---
    if (/(plant|leaves|leaf)/.test(name) && leaf) {
      return mk({
        map: clone(leaf, 1), color: tint, roughness: 0.8,
        side: THREE.DoubleSide,
      });
    }
    if (/(cortex|bark|trunk)/.test(name) && bark) {
      return mk({ map: clone(bark, 1), color: tint, roughness: 0.95, normalScale: 0.9 });
    }
    // --- leather / rope / cork ---
    if (/(leather|cork|rope)/.test(name)) {
      return mk({
        map: leatherSet ? clone(leatherSet.map, 1) : undefined,
        normalMap: leatherSet ? clone(leatherSet.normalMap, 1) : undefined,
        color: tint, roughness: 0.82, normalScale: 0.55,
      });
    }
    // --- cloth (banners, sails) keep their colour, gain fabric grain ---
    if (/(banner|sail|cloth|flag|check|white|beer|cork)/.test(name)) {
      return mk({ color: tint, roughness: 0.9 });
    }
    // --- wood family (default for this kit) ---
    if (wood) {
      return mk({
        map: clone(wood.map, 1), normalMap: clone(wood.normalMap, 1),
        roughnessMap: wood.roughnessMap ? clone(wood.roughnessMap, 1) : undefined,
        color: tint, roughness: 0.78, normalScale: 0.85,
      });
    }
    return std;
  }

  /**
   * Bake a stand-alone template:
   *  - the node's world transform is baked into cloned geometry,
   *  - the longest bbox axis is rotated to +Y,
   *  - uniformly scaled to entry.size,
   *  - re-centred so the bottom sits at y=0 and x/z are centred.
   * Returns a group of meshes with identity transforms.
   */
  private normalise(node: THREE.Object3D, entry: KitEntry, label: string): THREE.Object3D | null {
    node.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(node);
    const size = box.getSize(new THREE.Vector3());
    if (!isFinite(size.x + size.y + size.z) || size.lengthSq() < 1e-8) return null;
    const longest: 'x' | 'y' | 'z' =
      size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    const rot = new THREE.Matrix4();
    if (longest === 'x') rot.makeRotationZ(Math.PI / 2);
    else if (longest === 'z') rot.makeRotationX(-Math.PI / 2);

    // gather meshes with their world transforms
    const parts: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }> = [];
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        const g = mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld);
        g.applyMatrix4(rot);
        parts.push({ geo: g, mat: mesh.material });
      }
    });
    if (parts.length === 0) return null;

    // measure the rotated parts
    const box2 = new THREE.Box3();
    const pos = new THREE.Vector3();
    for (const p of parts) {
      const attr = p.geo.getAttribute('position');
      for (let i = 0; i < attr.count; i++) {
        pos.fromBufferAttribute(attr, i);
        box2.expandByPoint(pos);
      }
    }
    const height = Math.max(1e-6, box2.max.y - box2.min.y);
    const scale = entry.size / height;
    const cx = (box2.min.x + box2.max.x) / 2;
    const cz = (box2.min.z + box2.max.z) / 2;
    const bake = new THREE.Matrix4()
      .makeScale(scale, scale, scale)
      .multiply(new THREE.Matrix4().makeTranslation(-cx, -box2.min.y, -cz));

    const holder = new THREE.Group();
    holder.name = `${label}_${entry.name}`;
    for (const p of parts) {
      p.geo.applyMatrix4(bake);
      const m = new THREE.Mesh(p.geo, p.mat);
      m.castShadow = true;
      m.receiveShadow = true;
      holder.add(m);
    }
    holder.userData.grip = entry.grip ?? 0.2;
    holder.userData.height = entry.size;
    return holder;
  }

  /** Ready-to-place clone of a kit object (null when the kit lacks it). */
  create(name: string): THREE.Object3D | null {
    const t = this.templates.get(name);
    if (!t) return null;
    const clone = t.clone(true);
    clone.name = `${name}_${Math.floor(Math.random() * 1e6)}`;
    return clone;
  }

  has(name: string): boolean {
    return this.templates.has(name);
  }

  /** Names available (for debugging / dressing loops). */
  names(): string[] {
    return [...this.templates.keys()];
  }

  /** Weapon visual for a character hand: the grip point sits at the local
   * origin so callers attach it directly to a wrist bone. */
  weapon(kind: Exclude<WeaponKind, 'none'>): THREE.Object3D | null {
    const spec = WEAPON_OBJECT[kind];
    const obj = this.create(spec.kit);
    if (!obj) return null;
    obj.position.y = -spec.grip * (obj.userData.height as number ?? 1);
    return obj;
  }
}
