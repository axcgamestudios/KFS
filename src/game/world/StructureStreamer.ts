/**
 * Distance streaming for static structures (castle, village, POIs, island
 * camps). Groups beyond `maxDistance` from the viewer are hidden — the sea
 * fog makes them invisible long before that, so this only saves draw calls
 * and shadow-map work while sailing across the ocean.
 */
export class StructureStreamer {
  private entries: Array<{ group: { visible: boolean }; x: number; z: number; radius: number }> = [];
  private timer = 0;

  /** Register a structure group with its world position and culling radius. */
  register(group: { visible: boolean }, x: number, z: number, extent = 40): void {
    const existing = this.entries.find((e) => e.group === group);
    if (existing) {
      existing.x = x;
      existing.z = z;
      existing.radius = extent;
      return;
    }
    this.entries.push({ group, x, z, radius: extent });
  }

  /** Stop tracking a group (e.g. the static ship after the refit). */
  unregister(group: { visible: boolean }): void {
    const i = this.entries.findIndex((e) => e.group === group);
    if (i >= 0) this.entries.splice(i, 1);
  }

  /** Call every frame; internally throttled to every 0.4 s. */
  update(dt: number, px: number, pz: number, maxDistance = 560): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.4;
    for (const e of this.entries) {
      const d = Math.hypot(e.x - px, e.z - pz) - e.radius;
      e.group.visible = d < maxDistance;
    }
  }

  /** Force an immediate re-evaluation (e.g. after loading a save). */
  refresh(px: number, pz: number, maxDistance = 560): void {
    this.timer = 0;
    this.update(1, px, pz, maxDistance);
  }

  get count(): number {
    return this.entries.length;
  }
}
