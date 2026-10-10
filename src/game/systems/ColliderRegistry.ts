/**
 * Spatial-hashed collision registry. Supports cylinders (trees, towers) and
 * axis-aligned boxes with height limits (walls, buildings, furniture).
 * The player capsule is resolved against nearby colliders each frame.
 */
export interface BoxCollider {
  kind: 'box';
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export interface CylinderCollider {
  kind: 'cylinder';
  x: number; z: number; r: number;
  minY: number; maxY: number;
}

export type Collider = BoxCollider | CylinderCollider;

const CELL = 16;

export class ColliderRegistry {
  private grid = new Map<string, Map<string, Collider>>();

  private keyOf(x: number, z: number): string {
    return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  }

  /** Cells overlapped by a collider's XZ footprint. */
  private cellsFor(minX: number, maxX: number, minZ: number, maxZ: number): string[] {
    const keys: string[] = [];
    const cx0 = Math.floor(minX / CELL);
    const cx1 = Math.floor(maxX / CELL);
    const cz0 = Math.floor(minZ / CELL);
    const cz1 = Math.floor(maxZ / CELL);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) keys.push(`${cx},${cz}`);
    }
    return keys;
  }

  add(id: string, collider: Collider): void {
    const [minX, maxX, minZ, maxZ] =
      collider.kind === 'box'
        ? [collider.minX, collider.maxX, collider.minZ, collider.maxZ]
        : [collider.x - collider.r, collider.x + collider.r, collider.z - collider.r, collider.z + collider.r];
    for (const cell of this.cellsFor(minX, maxX, minZ, maxZ)) {
      let bucket = this.grid.get(cell);
      if (!bucket) {
        bucket = new Map();
        this.grid.set(cell, bucket);
      }
      bucket.set(id, collider);
    }
  }

  remove(id: string): void {
    // Removing from every cell is expensive; instead mark tombstones by
    // scanning only cells near the caller — here we do a full scan (rare op).
    for (const bucket of this.grid.values()) bucket.delete(id);
  }

  /** Query colliders near a point (radius pad in meters). */
  query(x: number, z: number, pad = 2.5): Collider[] {
    const out: Collider[] = [];
    const seen = new Set<Collider>();
    for (const cell of this.cellsFor(x - pad, x + pad, z - pad, z + pad)) {
      const bucket = this.grid.get(cell);
      if (!bucket) continue;
      for (const c of bucket.values()) {
        if (!seen.has(c)) {
          seen.add(c);
          out.push(c);
        }
      }
    }
    return out;
  }

  clear(): void {
    this.grid.clear();
  }
}
