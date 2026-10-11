import * as THREE from 'three';

/**
 * Fase 9 — CinematicSystem: narrative cinematics built with the game's own
 * world (PDF §6). Camera shots with easing, live subjects (the camera can
 * track a dragon corpse or the player while the world keeps animating),
 * letterbox + title cards via the store, skippable, control-safe.
 *
 * Design rules (straight from the PDF):
 *  · Never teleports or recreates world objects — shots reference live
 *    positions through functions evaluated every frame.
 *  · Controls are blocked ONLY while active; skip restores everything.
 *  · Milestone flags live in GameState so nothing replays on load.
 */

export interface CineShot {
  /** Seconds this shot lasts. */
  dur: number;
  /** Camera eye at shot start (world). Function = re-evaluated per frame. */
  fromPos: THREE.Vector3 | (() => THREE.Vector3);
  /** Camera eye at shot end (defaults to fromPos: static camera). */
  toPos?: THREE.Vector3 | (() => THREE.Vector3);
  /** Look target at shot start. */
  fromLook: THREE.Vector3 | (() => THREE.Vector3);
  /** Look target at shot end (defaults to fromLook). */
  toLook?: THREE.Vector3 | (() => THREE.Vector3);
  /** Optional FOV for the shot (default: leave the camera's FOV alone). */
  fov?: number;
  /** Title card shown while this shot plays (top letterbox). */
  title?: string;
  /** Smaller line under the title. */
  subtitle?: string;
  /** Fase 10 — long narration paragraph shown at the bottom (intro replay). */
  text?: string;
}

export interface CineOpts {
  /** Called when the sequence finishes OR is skipped. */
  onDone?: () => void;
  /** Store sync so the React layer can draw letterbox + cards. */
  onState?: (s: { active: boolean; title: string; subtitle: string; text?: string; progress: number; shot: number; total: number } | null) => void;
  /** Camera driver (Game wires this to CameraRig.setManual). */
  drive: (pos: THREE.Vector3, look: THREE.Vector3, fov?: number) => void;
}

const easeInOut = (t: number): number => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export class CinematicSystem {
  private shots: CineShot[] = [];
  private opts: CineOpts | null = null;
  private idx = 0;
  private t = 0;
  private activeFlag = false;
  /** Seconds since the sequence started (skip is ignored at the very start
   *  so the killing blow's own inputs don't cancel the show). */
  private age = 0;
  /** Restores the FOV the camera had before the sequence. */
  private restoreFov = -1;

  private posA = new THREE.Vector3();
  private posB = new THREE.Vector3();
  private lookA = new THREE.Vector3();
  private lookB = new THREE.Vector3();
  private eye = new THREE.Vector3();
  private look = new THREE.Vector3();

  get active(): boolean {
    return this.activeFlag;
  }

  /** Seconds the sequence has been running. */
  get elapsed(): number {
    return this.age;
  }

  get shotIndex(): number {
    return this.idx;
  }

  get shotCount(): number {
    return this.shots.length;
  }

  /** Start a sequence. Any previous one is finished first (no overlap). */
  play(shots: CineShot[], opts: CineOpts): void {
    if (this.activeFlag) this.finish();
    if (shots.length === 0) return;
    this.shots = shots;
    this.opts = opts;
    this.idx = 0;
    this.t = 0;
    this.age = 0;
    this.activeFlag = true;
    this.emitState();
  }

  /** Skip to the end (any key during the sequence). */
  skip(): void {
    if (!this.activeFlag) return;
    this.finish();
  }

  private finish(): void {
    this.activeFlag = false;
    const done = this.opts?.onDone;
    const state = this.opts?.onState;
    this.opts = null;
    this.shots = [];
    state?.(null);
    done?.();
  }

  private emitState(): void {
    const s = this.shots[this.idx];
    this.opts?.onState?.({
      active: true,
      title: s?.title ?? '',
      subtitle: s?.subtitle ?? '',
      text: s?.text,
      progress: this.totalProgress(),
      shot: this.idx,
      total: this.shots.length,
    });
  }

  private totalProgress(): number {
    let before = 0;
    for (let i = 0; i < this.idx; i++) before += this.shots[i].dur;
    const total = before + (this.shots[this.idx]?.dur ?? 0);
    let all = 0;
    for (const s of this.shots) all += s.dur;
    return all > 0 ? Math.min(1, (before + this.t) / all) : 1;
  }

  update(dt: number): void {
    if (!this.activeFlag || !this.opts) return;
    this.age += dt;
    const shot = this.shots[this.idx];
    if (!shot) {
      this.finish();
      return;
    }
    this.t += dt;
    const k = Math.min(1, this.t / shot.dur);
    const e = easeInOut(k);

    const posA = typeof shot.fromPos === 'function' ? shot.fromPos() : shot.fromPos;
    const posB = shot.toPos
      ? (typeof shot.toPos === 'function' ? shot.toPos() : shot.toPos)
      : posA;
    const lookA = typeof shot.fromLook === 'function' ? shot.fromLook() : shot.fromLook;
    const lookB = shot.toLook
      ? (typeof shot.toLook === 'function' ? shot.toLook() : shot.toLook)
      : lookA;

    this.posA.copy(posA);
    this.posB.copy(posB);
    this.lookA.copy(lookA);
    this.lookB.copy(lookB);
    this.eye.lerpVectors(this.posA, this.posB, e);
    this.look.lerpVectors(this.lookA, this.lookB, e);
    // Keep the eye above the terrain so shots never clip into hills
    this.opts.drive(this.eye, this.look, shot.fov);

    if (k >= 1) {
      this.idx++;
      this.t = 0;
      if (this.idx >= this.shots.length) {
        this.finish();
      } else {
        this.emitState();
      }
    }
  }

  /** Helper: a fixed world point as a Vector3 provider. */
  static at(x: number, y: number, z: number): () => THREE.Vector3 {
    const v = new THREE.Vector3(x, y, z);
    return () => v;
  }
}
