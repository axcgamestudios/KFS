import * as THREE from 'three';
import type { CharacterVisual } from '../entities/CharacterModel';
import type { TerrainHeight } from '../world/TerrainHeight';
import { dampAngle } from '../core/MathUtils';

/**
 * Fase 11 — CineActors: a puppet library for REAL performances inside
 * cinematics. Halo-style cutscenes are camera + ACTORS doing things; these
 * helpers drive the game's actual bodies (KnightModelGLB / any
 * CharacterVisual) and objects while the CinematicSystem flies the camera.
 *
 * Every helper returns a `{ enter, update, exit }` fx block that plugs
 * straight into a CineShot (CinematicSystem) — or an EndingShot action.
 *
 * The animations are the game's own locomotion/attack/block layers — the
 * same ones gameplay uses — so a walking knight in a cutscene walks exactly
 * like a walking knight in the world. Nothing is faked with decals.
 */

export interface CineFx {
  enter?(): void;
  update?(k: number, dt: number): void;
  exit?(): void;
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Walk an actor from A to B with the REAL walk cycle (legs, arms, bob). */
export function walkActor(opts: {
  actor: THREE.Group;             // world transform (feet)
  model: CharacterVisual;         // body driven with the walk layer
  from: THREE.Vector3;
  to: THREE.Vector3;
  terrain?: TerrainHeight;        // keeps feet on the ground
  speed?: number;                 // m/s (default 1.55 — a calm stride)
  faceTravel?: boolean;           // default true
  holdAtEnd?: boolean;            // stay at B after arrival (default true)
}): CineFx {
  const speed = opts.speed ?? 1.55;
  const total = opts.from.distanceTo(opts.to);
  const dur = Math.max(0.5, total / Math.max(0.4, speed));
  let phase = 0;
  let arrived = false;
  const cur = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  return {
    enter() {
      cur.copy(opts.from);
      opts.actor.position.copy(cur);
      if (opts.terrain) opts.actor.position.y = opts.terrain.height(cur.x, cur.z);
    },
    update(k, dt) {
      const e = easeInOut(Math.min(1, k));
      cur.lerpVectors(opts.from, opts.to, e);
      if (opts.terrain) cur.y = opts.terrain.height(cur.x, cur.z);
      // travel speed for the gait: derivative of the eased path
      const stepBack = tmp.copy(cur).sub(opts.actor.position);
      const moved = Math.hypot(stepBack.x, stepBack.z);
      opts.actor.position.copy(cur);
      if (moved > 1e-5 && (opts.faceTravel ?? true)) {
        opts.actor.rotation.y = dampAngle(
          opts.actor.rotation.y,
          Math.atan2(stepBack.x, stepBack.z),
          10,
          Math.max(1e-4, dt),
        );
      }
      const mps = moved / Math.max(1e-4, dt);
      arrived = k >= 0.999;
      phase += dt;
      opts.model.update({
        dt,
        speed: Math.min(2.4, mps),
        moving: !arrived,
        grounded: true,
        swimming: false,
        attackT: 0,
        blockT: 0,
        rollT: 0,
        bowDraw: -1,
      });
      void phase;
    },
    exit() {
      if (!(opts.holdAtEnd ?? true)) return;
      // settle into idle at the destination
      opts.model.update({
        dt: 1 / 60,
        speed: 0,
        moving: false,
        grounded: true,
        swimming: false,
        attackT: 0,
        blockT: 0,
        rollT: 0,
        bowDraw: -1,
      });
    },
  };
}

/** A knight's salute: the slow heavy swing repurposed as raising the blade
 *  to the sky and bringing it to rest — the classic vow/victory beat. */
export function heroSalute(model: CharacterVisual, opts: { repeat?: boolean } = {}): CineFx {
  let t = 0;
  let cycle = 0;
  return {
    update(k, dt) {
      t += dt;
      const period = 2.6;
      const inCycle = t - cycle * period;
      if (inCycle > period) {
        if (opts.repeat) {
          cycle++;
        } else {
          model.update({ dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0 });
          return;
        }
      }
      const kk = Math.min(1, inCycle / period);
      model.update({
        dt,
        speed: 0,
        moving: false,
        grounded: true,
        swimming: false,
        attackT: 0.001 + kk,
        attackKind: 'heavy',
        blockT: 0,
        rollT: 0,
        bowDraw: -1,
      });
    },
  };
}

/** An idle stance with breathing (and optional talking gestures). */
export function idleActor(model: CharacterVisual, talking = false): CineFx {
  return {
    update(_k, dt) {
      model.update({
        dt,
        speed: 0,
        moving: false,
        grounded: true,
        swimming: false,
        attackT: 0,
        blockT: 0,
        rollT: 0,
        bowDraw: -1,
        talking,
      });
    },
  };
}

/** A real fight flurry — attack cycles on the game's own attack curves. */
export function flurryActor(model: CharacterVisual, period = 1.15): CineFx {
  let t = 0;
  const kinds: Array<'light1' | 'light2' | 'heavy' | 'spin'> = ['light1', 'light2', 'spin', 'heavy'];
  let ki = 0;
  return {
    update(_k, dt) {
      t += dt;
      const kk = (t % period) / period;
      if (kk < 0.04) ki = (ki + 1) % kinds.length;
      model.update({
        dt,
        speed: 0,
        moving: kk < 0.2,
        grounded: true,
        swimming: false,
        attackT: 0.001 + kk,
        attackKind: kinds[ki],
        blockT: 0,
        rollT: 0,
        bowDraw: -1,
      });
    },
  };
}

/** Orient an actor toward a target every frame (head/body follows the
 *  camera or another actor — the "noticing" beat). */
export function faceTarget(actor: THREE.Group, getTarget: () => THREE.Vector3 | null, rate = 6): CineFx {
  return {
    update(_k, dt) {
      const t = getTarget();
      if (!t) return;
      const dx = t.x - actor.position.x;
      const dz = t.z - actor.position.z;
      if (Math.hypot(dx, dz) < 0.001) return;
      actor.rotation.y = dampAngle(actor.rotation.y, Math.atan2(dx, dz), rate, Math.max(1e-4, dt));
    },
  };
}

/** Combine several fx blocks into one (all run in order every frame). */
export function together(...fxs: CineFx[]): CineFx {
  return {
    enter() { for (const f of fxs) f.enter?.(); },
    update(k, dt) { for (const f of fxs) f.update?.(k, dt); },
    exit() { for (const f of fxs) f.exit?.(); },
  };
}
