import * as THREE from 'three';
import type { AssetSystem } from './AssetSystem';

/**
 * Fase 25 — the user's uploaded weapon models become the hero's steel:
 *   · medieval_sword.glb  (2 m greatsword, tip at −X, guard at x≈0.35,
 *     pommel at +X)  → normalized: grip at origin, blade +Y, ~1.24 m.
 *   · medieval_bow_game_model.glb (2 m longbow, limbs ±Y, string at +X)
 *     → normalized: grip at origin, limbs ±Y, string facing −Z (backwards —
 *     the arrow flies the character's forward +Z).
 *
 * The sword keeps the forge-tier glow (generic emissive path in
 * KnightModelGLB.applyWeaponGlow) and grows a touch per tier, exactly like
 * the old HeroSword did.
 */

const SWORD_FILE = 'medieval_sword.glb';
const BOW_FILE = 'medieval_bow_game_model.glb';

/** Model-space grip centre on the sword handle (metres, pre-scale): the fist
 *  wraps just behind the crossguard (guard ≈ x 0.35-0.40, pommel at x 1.0). */
const SWORD_GRIP_X = 0.50;
/** Total scale for the greatsword: 2.0 m → 1.24 m (0.93 m of steel above
 *  the fist — the old HeroSword carried 0.90 m, so every tuned reach, arc
 *  and swing reads unchanged). */
const SWORD_SCALE = 0.62;
/** Longbow scale: 2.0 m tip-to-tip → 1.42 m — a proper war bow for a 1.95 m
 *  knight. */
const BOW_SCALE = 0.71;

let swordTemplate: THREE.Object3D | null = null;
let bowTemplate: THREE.Object3D | null = null;

/** Blade length above the grip once normalized (slash-arc sampling). */
export const GLB_SWORD_BLADE = (1.0 + SWORD_GRIP_X) * SWORD_SCALE;

/** Warm the cache during boot (call once, before the player spawns). */
export async function initGlbWeapons(assets: AssetSystem): Promise<void> {
  const [sword, bow] = await Promise.all([
    assets.loadModel(SWORD_FILE).catch(() => null),
    assets.loadModel(BOW_FILE).catch(() => null),
  ]);
  if (sword) swordTemplate = normalizeSword(sword);
  if (bow) bowTemplate = normalizeBow(bow);
  if (swordTemplate) console.log('[F25] uploaded sword model: ready');
  else console.log('[F25] uploaded sword model missing — HeroSword fallback');
  if (bowTemplate) console.log('[F25] uploaded bow model: ready');
  else console.log('[F25] uploaded bow model missing — kit bow fallback');
}

/** tip (−X) → +Y, grip to the origin, scale to hero size. */
function normalizeSword(src: THREE.Object3D): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'glb_sword';
  // rotate −90° about Z: (x,y) → (y,−x), so −X → +Y and the flat (Y) → X
  src.rotation.set(0, 0, -Math.PI / 2);
  // after that rotation the grip centre sits at (0, −SWORD_GRIP_X, 0)
  src.position.set(0, SWORD_GRIP_X, 0);
  group.add(src);
  group.scale.setScalar(SWORD_SCALE);
  group.userData.glbSword = true;
  // applyWeaponGlow's tier scale MULTIPLIES onto this base (never overwrite)
  group.userData.baseScale = [SWORD_SCALE, SWORD_SCALE, SWORD_SCALE];
  // weaponTipWorld samples 0.72 × height: report the blade reach through it
  group.userData.height = ((1.0 + SWORD_GRIP_X) * SWORD_SCALE) / 0.72;
  return group;
}

/** limbs stay ±Y; rotate about +Y so the string (+X) faces −Z (the archer's
 *  side) and the arrow flight (−X) faces the character forward (+Z). */
function normalizeBow(src: THREE.Object3D): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'glb_bow';
  src.rotation.set(0, Math.PI / 2, 0);
  src.position.set(0, 0, 0);
  group.add(src);
  group.scale.setScalar(BOW_SCALE);
  group.userData.glbBow = true;
  group.userData.baseScale = [BOW_SCALE, BOW_SCALE, BOW_SCALE];
  group.userData.height = BOW_SCALE * 2.0; // tip-to-tip for tip sampling
  return group;
}

/** Fresh instance of the uploaded sword (materials cloned so the tier glow
 *  never bleeds into other instances). Null until initGlbWeapons resolved. */
export function buildGlbSword(): THREE.Object3D | null {
  if (!swordTemplate) return null;
  const w = swordTemplate.clone(true);
  w.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = mats.map((m) => m.clone());
  });
  return w;
}

/** Fresh instance of the uploaded longbow. */
export function buildGlbBow(): THREE.Object3D | null {
  if (!bowTemplate) return null;
  const w = bowTemplate.clone(true);
  w.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = mats.map((m) => m.clone());
  });
  return w;
}
