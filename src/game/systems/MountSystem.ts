import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { ColliderRegistry } from '../systems/ColliderRegistry';
import { clamp, damp, dampAngle } from '../core/MathUtils';
import { HorseModel, CartModel, HORSE_PALETTES, type HorseGait } from '../entities/Horse';

/**
 * Fase 4 — horses & land vehicles gameplay layer.
 *
 * Owns the horse herd and the carts, handles mounting/dismounting (E),
 * mounted riding controls (W/A/S/D + Shift gallop + Space jump), the horse
 * whistle (H), cart hitching/unhitching with trailer-follow physics, and
 * serializes everything for the save system.
 */

export interface MountHooks {
  sound: (kind: string) => void;
  notify: (kind: 'info' | 'quest' | 'item' | 'save', title: string, body: string) => void;
  dust: (pos: THREE.Vector3, strength: number) => void;
  splash: (pos: THREE.Vector3, strength: number) => void;
  setFlag: (flag: string) => void;
  hasFlag: (flag: string) => boolean;
  /** Fase 4 — pay with gold; returns false when the player can't afford it. */
  spendGold?: (amount: number) => boolean;
}

interface HorseUnit {
  id: string;
  name: string;
  /** Palette key the horse was spawned with (saved so a fresh session can
   *  rebuild admin horses exactly — Fase 16). */
  coat: string;
  model: HorseModel;
  pos: THREE.Vector3;
  yaw: number;
  speed: number;
  verticalVel: number;
  grounded: boolean;
  gait: HorseGait;
  /** 'idle' = grazes · 'coming' = walks to the player after a whistle */
  ai: 'idle' | 'coming';
  owned: boolean;
  price: number;
  /** Stride phase tracker for hoofbeat sounds. */
  stridePhase: number;
  jumpT: number;
}

export class MountSystem {
  private horses: HorseUnit[] = [];
  private scene: THREE.Scene;
  private terrain: TerrainHeight;
  private colliders: ColliderRegistry;
  private hooks: MountHooks;

  /** The horse the player rides (null = on foot). */
  ridingId: string | null = null;
  /** Cart state */
  cart: {
    model: CartModel;
    pos: THREE.Vector3;
    heading: number;
    hitchedTo: string | null;
    distance: number;
  } | null = null;

  /** Mounted speed tiers (m/s). */
  static readonly WALK = 4.4;
  static readonly TROT = 8.6;
  static readonly GALLOP = 13.8;

  constructor(scene: THREE.Scene, terrain: TerrainHeight, colliders: ColliderRegistry, hooks: MountHooks) {
    this.scene = scene;
    this.terrain = terrain;
    this.colliders = colliders;
    this.hooks = hooks;
  }

  // ------------------------------------------------------------- spawning

  spawnHorse(id: string, name: string, paletteKey: keyof typeof HORSE_PALETTES, x: number, z: number, owned = false, price = 0): void {
    if (this.horses.some((h) => h.id === id)) return;
    const y = this.terrain.height(x, z);
    const model = new HorseModel(HORSE_PALETTES[paletteKey] ?? HORSE_PALETTES.bay);
    model.root.position.set(x, y, z);
    this.scene.add(model.root);
    this.horses.push({
      id, name, coat: paletteKey, model,
      pos: model.root.position,
      yaw: 0,
      speed: 0,
      verticalVel: 0,
      grounded: true,
      gait: 'idle',
      ai: 'idle',
      owned,
      price,
      stridePhase: 0,
      jumpT: 0,
    });
  }

  spawnCart(id: string, x: number, z: number, heading = 0, _cargo = true): void {
    void id;
    if (this.cart) return;
    const y = this.terrain.height(x, z);
    const model = new CartModel(true);
    model.root.position.set(x, y, z);
    model.root.rotation.y = heading;
    this.scene.add(model.root);
    this.cart = { model, pos: model.root.position, heading, hitchedTo: null, distance: 0 };
  }

  get horseList(): Array<{ id: string; name: string; owned: boolean; price: number; pos: THREE.Vector3 }> {
    return this.horses.map((h) => ({ id: h.id, name: h.name, owned: h.owned, price: h.price, pos: h.pos }));
  }

  get mounted(): HorseUnit | null {
    return this.horses.find((h) => h.id === this.ridingId) ?? null;
  }

  // ------------------------------------------------------------- mounting

  /** Nearest mountable horse within range (or null). */
  nearestHorse(playerPos: THREE.Vector3, maxDist = 3.2): HorseUnit | null {
    let best: HorseUnit | null = null;
    let bestD = maxDist;
    for (const h of this.horses) {
      const d = Math.hypot(h.pos.x - playerPos.x, h.pos.z - playerPos.z);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  /** Prompt-relevant info for the interaction system. */
  interactionPrompt(playerPos: THREE.Vector3): { prompt: string; run: () => void } | null {
    if (this.ridingId) {
      // While riding: cart hitch prompts take priority, else dismount
      if (this.cart && !this.cart.hitchedTo) {
        const d = Math.hypot(this.cart.pos.x - playerPos.x, this.cart.pos.z - playerPos.z);
        if (d < 4.2) {
          return {
            prompt: 'Hitch the cart',
            run: () => this.hitchCart(),
          };
        }
      }
      return null; // dismount is handled by the E key directly
    }
    const horse = this.nearestHorse(playerPos);
    if (horse) {
      if (!horse.owned) {
        return {
          prompt: `Buy ${horse.name} (${horse.price} coins)`,
          run: () => this.tryBuy(horse),
        };
      }
      return {
        prompt: `Mount ${horse.name}`,
        run: () => this.mount(horse.id),
      };
    }
    if (this.cart && this.cart.hitchedTo) {
      const d = Math.hypot(this.cart.pos.x - playerPos.x, this.cart.pos.z - playerPos.z);
      if (d < 4.5) {
        return { prompt: 'Unhitch the cart', run: () => this.unhitchCart() };
      }
    }
    return null;
  }

  private tryBuy(horse: HorseUnit): void {
    if (horse.owned) return;
    if (this.hooks.spendGold) {
      if (this.hooks.spendGold(horse.price)) {
        horse.owned = true;
        this.hooks.sound('unlock');
        this.hooks.notify(
          'quest',
          `${horse.name} is yours!`,
          'Halvard hands over the reins. Press E to mount and H to call him when he’s far away.',
        );
        return;
      }
      this.hooks.notify(
        'info',
        `${horse.name} — ${horse.price} coins`,
        'Halvard cracks his knuckles: “No gold, no ride. Come back with a full purse.”',
      );
      return;
    }
    this.hooks.notify(
      'info',
      horse.name,
      `Halvard wants ${horse.price} coins for this mount.`,
    );
  }

  /** Mark a horse as owned (purchase resolved by the dialogue/quest layer). */
  setOwned(id: string, owned = true): void {
    const h = this.horses.find((x) => x.id === id);
    if (h) h.owned = owned;
  }

  mount(id: string): boolean {
    const h = this.horses.find((x) => x.id === id);
    if (!h || !h.owned) return false;
    this.ridingId = id;
    h.ai = 'idle';
    this.hooks.setFlag('horse_ridden');
    this.hooks.sound('horse_neigh');
    if (!this.hooks.hasFlag('tut_horse')) {
      this.hooks.setFlag('tut_horse');
      this.hooks.notify(
        'info',
        `Mounted on ${h.name}`,
        'W move (hold for trot) · Shift canter · A/D turn · Space jump · E dismount · H whistle for your horse',
      );
    }
    return true;
  }

  dismount(): void {
    const h = this.mounted;
    if (!h) return;
    // Place the rider beside the horse, on safe ground
    const side = new THREE.Vector3(Math.cos(h.yaw), 0, -Math.sin(h.yaw)).multiplyScalar(1.15);
    const px = h.pos.x + side.x;
    const pz = h.pos.z + side.z;
    this.lastDismount = { x: px, y: this.terrain.height(px, pz) + 0.1, z: pz };
    this.ridingId = null;
    h.speed = 0;
    h.gait = 'idle';
    this.hooks.sound('hoof');
  }

  private lastDismount: { x: number; y: number; z: number } | null = null;
  get dismountSpot(): { x: number; y: number; z: number } | null {
    const s = this.lastDismount;
    this.lastDismount = null;
    return s;
  }

  // ------------------------------------------------------------- whistle

  /** H — the owned horse trots over to the player (teleports if very far). */
  whistle(playerPos: THREE.Vector3): void {
    const h = this.horses.find((x) => x.owned);
    if (!h || this.ridingId) return;
    const d = Math.hypot(h.pos.x - playerPos.x, h.pos.z - playerPos.z);
    if (d > 90) {
      // Stable teleport: appears behind the player in a dust cloud
      const bx = playerPos.x - Math.sin(0) * 6;
      const bz = playerPos.z - Math.cos(0) * 6;
      h.pos.set(bx, this.terrain.height(bx, bz), bz);
      this.hooks.dust(h.pos.clone(), 1.4);
      this.hooks.notify('info', `${h.name} answers your call`, 'The horse trots in from the distance.');
    }
    h.ai = 'coming';
    this.hooks.sound('horse_neigh');
  }

  // ------------------------------------------------------------- cart

  hitchCart(): void {
    if (!this.cart || this.cart.hitchedTo) return;
    const h = this.mounted ?? this.horses.find((x) => x.owned);
    if (!h) {
      this.hooks.notify('info', 'Cart needs a horse', 'You need a horse to hitch the cart.');
      return;
    }
    this.cart.hitchedTo = h.id;
    this.hooks.sound('chain');
    this.hooks.notify('item', 'Cart hitched', `The cart follows ${h.name}. The weight limits your pace: no cantering.`);
  }

  unhitchCart(): void {
    if (!this.cart || !this.cart.hitchedTo) return;
    this.cart.hitchedTo = null;
    this.hooks.sound('chain');
    this.hooks.notify('item', 'Cart unhitched', 'The cart stays parked where it is.');
  }

  get isCartHitched(): boolean {
    return !!this.cart?.hitchedTo;
  }

  // ------------------------------------------------------------- update

  /**
   * @returns riding HUD info when mounted (speed, gait, cart).
   */
  update(
    dt: number,
    input: Input,
    playerPos: THREE.Vector3,
    controlsActive: boolean,
    waterHeightAt?: (x: number, z: number) => number,
  ): { gait: HorseGait; speed: number; cart: boolean } | null {
    // --- Dismount / whistle keys are handled by Game (E context) ---
    let hud: { gait: HorseGait; speed: number; cart: boolean } | null = null;

    for (const h of this.horses) {
      const ridden = h.id === this.ridingId;

      // Fase 14 — culling de monturas: lejos no se dibuja y la pose se
      // congela (el caballo montaño sigue pastando, solo que gratis).
      const hd2 = (h.pos.x - playerPos.x) ** 2 + (h.pos.z - playerPos.z) ** 2;
      const farAnim = !ridden && hd2 > 70 * 70;
      if (!ridden) h.model.root.visible = hd2 < 300 * 300;

      if (ridden && controlsActive) {
        hud = this.updateRiding(dt, input, h, waterHeightAt);
      } else if (h.ai === 'coming') {
        // Walk toward the player until close, then stop
        const dx = playerPos.x - h.pos.x;
        const dz = playerPos.z - h.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 4) {
          h.ai = 'idle';
          h.speed = 0;
        } else {
          const targetYaw = Math.atan2(dx, dz);
          h.yaw = dampAngle(h.yaw, targetYaw, 4, dt);
          h.speed = damp(h.speed, Math.min(d * 0.6, MountSystem.TROT * 0.6), 4, dt);
          this.integrateHorse(dt, h, waterHeightAt, true);
        }
      } else {
        // Idle herd behaviour: graze, occasional slow wander step
        h.speed = damp(h.speed, 0, 3, dt);
        if (Math.random() < dt * 0.02) {
          h.yaw += (Math.random() - 0.5) * 0.8;
        }
        this.integrateHorse(dt, h, waterHeightAt, true);
      }

      // Model animation
      h.model.root.position.copy(h.pos);
      h.model.root.rotation.y = h.yaw;
      const grazing = !ridden && h.speed < 0.2 && h.ai === 'idle';
      if (!farAnim) h.model.update(dt, h.gait, h.speed, grazing);

      // Hoofbeats: fire when the stride phase wraps
      if (h.gait !== 'idle' && h.speed > 0.5) {
        const strideLen = h.gait === 'gallop' ? 3.4 : h.gait === 'trot' ? 2.2 : 1.5;
        const prev = h.stridePhase;
        h.stridePhase += (h.speed / strideLen) * dt;
        if (Math.floor(h.stridePhase) > Math.floor(prev)) {
          this.hooks.sound('hoof');
          if (h.gait === 'gallop') {
            this.hooks.dust(h.pos.clone(), 0.5);
          }
        }
      } else {
        h.stridePhase = 0;
      }
    }

    // --- Cart trailer physics ---
    if (this.cart) {
      const horse = this.horses.find((h) => h.id === this.cart!.hitchedTo);
      if (horse) {
        // Desired hitch point behind the horse
        const hx = horse.pos.x - Math.sin(horse.yaw) * 2.55;
        const hz = horse.pos.z - Math.cos(horse.yaw) * 2.55;
        const dx = hx - this.cart.pos.x;
        const dz = hz - this.cart.pos.z;
        const d = Math.hypot(dx, dz);
        // Trailer follows the trail: heading points at the hitch point
        if (d > 0.02) {
          this.cart.heading = dampAngle(this.cart.heading, Math.atan2(dx, dz), 6, dt);
          const move = Math.min(d, horse.speed * dt * 1.4 + d * dt * 4);
          this.cart.pos.x += Math.sin(this.cart.heading) * move;
          this.cart.pos.z += Math.cos(this.cart.heading) * move;
          this.cart.distance += move;
        }
        // Terrain adaptation: sample front & back for pitch, sides for roll
        const fx = this.cart.pos.x + Math.sin(this.cart.heading) * 1.1;
        const fz = this.cart.pos.z + Math.cos(this.cart.heading) * 1.1;
        const bx = this.cart.pos.x - Math.sin(this.cart.heading) * 1.1;
        const bz = this.cart.pos.z - Math.cos(this.cart.heading) * 1.1;
        const hF = this.terrain.height(fx, fz);
        const hB = this.terrain.height(bx, bz);
        this.cart.pos.y = damp(this.cart.pos.y, (hF + hB) / 2, 10, dt);
        this.cart.model.root.rotation.x = damp(
          this.cart.model.root.rotation.x,
          Math.atan2(hB - hF, 2.2),
          8,
          dt,
        );
      } else {
        this.cart.pos.y = damp(this.cart.pos.y, this.terrain.height(this.cart.pos.x, this.cart.pos.z), 10, dt);
      }
      this.cart.model.root.position.copy(this.cart.pos);
      this.cart.model.root.rotation.y = this.cart.heading;
      this.cart.model.update(this.cart.distance);
      if (hud) hud = { ...hud, cart: !!this.cart.hitchedTo };
    }

    return hud;
  }

  /** Mounted riding controls for one horse. */
  private updateRiding(dt: number, input: Input, h: HorseUnit, waterHeightAt?: (x: number, z: number) => number): { gait: HorseGait; speed: number; cart: boolean } {
    const hitched = this.cart?.hitchedTo === h.id;
    let forward = 0;
    if (input.isDown('forward')) forward = 1;
    else if (input.isDown('back')) forward = -0.45;

    const wantGallop = input.isDown('sprint') && !hitched;
    // Speed target: walk pulses → trot when holding → gallop with Shift
    let target = 0;
    if (forward > 0) {
      target = wantGallop ? MountSystem.GALLOP : MountSystem.TROT;
      // A fresh tap of W starts at a walk (damp makes the ramp natural)
      if (h.speed < MountSystem.WALK * 0.8) target = Math.min(target, MountSystem.WALK + dt * 9);
    } else if (forward < 0) {
      target = -2.0;
    }
    const accel = target > h.speed ? 2.6 : 4.5; // horses brake faster than they sprint
    h.speed = damp(h.speed, target, accel, dt);

    // Turning — wide at speed, tight at walk
    let steer = 0;
    if (input.isDown('left')) steer += 1;
    if (input.isDown('right')) steer -= 1;
    const turnRate = clamp(2.6 - Math.abs(h.speed) * 0.12, 0.75, 2.6);
    h.yaw += steer * turnRate * dt * (h.speed < -0.1 ? -1 : 1);

    // Jump (logs, fences, small rocks)
    if (input.pressed('jump') && h.grounded && h.jumpT <= 0 && Math.abs(h.speed) > 2.5) {
      h.verticalVel = 6.4;
      h.grounded = false;
      h.jumpT = 0.9;
      this.hooks.sound('horse_neigh');
    }
    if (h.jumpT > 0) h.jumpT -= dt;

    this.integrateHorse(dt, h, waterHeightAt, false);

    // Gait classification
    if (!h.grounded) h.gait = 'jump';
    else if (Math.abs(h.speed) < 0.4) h.gait = 'idle';
    else if (Math.abs(h.speed) < 5.2) h.gait = 'walk';
    else if (Math.abs(h.speed) < 10.5) h.gait = 'trot';
    else h.gait = 'gallop';

    return { gait: h.gait, speed: Math.abs(h.speed), cart: hitched };
  }

  /** Shared physics integration for a horse. */
  private integrateHorse(dt: number, h: HorseUnit, waterHeightAt?: (x: number, z: number) => number, allowPush = true): void {
    void allowPush;
    // Horizontal move along facing
    const nx = h.pos.x + Math.sin(h.yaw) * h.speed * dt;
    const nz = h.pos.z + Math.cos(h.yaw) * h.speed * dt;

    // Horses refuse to swim: block deep water
    const groundThere = this.terrain.height(nx, nz);
    const surface = waterHeightAt ? waterHeightAt(nx, nz) : 0;
    const depth = surface - groundThere;
    if (depth > 0.9 && groundThere < h.pos.y - 1.4) {
      h.speed = Math.min(h.speed, 0.4);
    } else {
      h.pos.x = nx;
      h.pos.z = nz;
    }

    // Steep slopes slow the mount drastically
    const slope = this.terrain.slope(h.pos.x, h.pos.z);
    if (slope > 0.9 && h.speed > 1) h.speed *= 0.965;

    // Collision push-out (big cylinder)
    const r = 0.85;
    for (const c of this.colliders.query(h.pos.x, h.pos.z, 3)) {
      if (c.kind === 'cylinder') {
        if (c.maxY <= h.pos.y + 0.5 || c.minY >= h.pos.y + 1.9) continue;
        const dx = h.pos.x - c.x;
        const dz = h.pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const minD = c.r + r;
        if (d < minD && d > 0.001) {
          h.pos.x += (dx / d) * (minD - d);
          h.pos.z += (dz / d) * (minD - d);
          h.speed *= 0.94;
        }
      } else {
        if (c.maxY - c.minY <= 0.5) continue; // walkable platform
        if (c.maxY <= h.pos.y + 0.5 || c.minY >= h.pos.y + 1.9) continue;
        const px = clamp(h.pos.x, c.minX, c.maxX);
        const pz = clamp(h.pos.z, c.minZ, c.maxZ);
        const dx = h.pos.x - px;
        const dz = h.pos.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            h.pos.x += (dx / d) * (r - d);
            h.pos.z += (dz / d) * (r - d);
          } else {
            h.pos.x = c.maxX + r;
          }
          h.speed *= 0.9;
        }
      }
    }

    // Vertical: gravity → terrain landing
    if (!h.grounded) {
      h.verticalVel -= 19 * dt;
      h.pos.y += h.verticalVel * dt;
      const groundY = this.terrain.height(h.pos.x, h.pos.z);
      if (h.pos.y <= groundY) {
        h.pos.y = groundY;
        h.verticalVel = 0;
        h.grounded = true;
        this.hooks.dust(h.pos.clone(), 0.8);
      }
    } else {
      h.pos.y = this.terrain.height(h.pos.x, h.pos.z);
    }
  }

  // ------------------------------------------------------------- save/load

  serialize(): {
    horses: Array<{ id: string; x: number; z: number; yaw: number; owned: boolean; name?: string; coat?: string; price?: number }>;
    cart: { x: number; z: number; heading: number; hitchedTo: string | null } | null;
    riding: string | null;
  } {
    return {
      horses: this.horses.map((h) => ({
        id: h.id, x: Math.round(h.pos.x * 10) / 10, z: Math.round(h.pos.z * 10) / 10,
        yaw: Math.round(h.yaw * 100) / 100, owned: h.owned,
        // Fase 16 — enough to REBUILD the horse on a fresh session (admin
        // horses used to vanish on load: the save had them but the herd
        // only ever spawned the three predefined mounts).
        name: h.name, coat: h.coat, price: h.price,
      })),
      cart: this.cart
        ? {
            x: Math.round(this.cart.pos.x * 10) / 10,
            z: Math.round(this.cart.pos.z * 10) / 10,
            heading: Math.round(this.cart.heading * 100) / 100,
            hitchedTo: this.cart.hitchedTo,
          }
        : null,
      riding: this.ridingId,
    };
  }

  deserialize(d: ReturnType<MountSystem['serialize']> | undefined): void {
    if (!d) return;
    for (const hs of d.horses ?? []) {
      let h = this.horses.find((x) => x.id === hs.id);
      if (!h) {
        // Fase 16 — a saved horse the current herd doesn't have (an admin
        // mount after a page reload): rebuild it right where it was saved.
        if (!hs.owned) continue; // never respawn shop horses the player never bought
        this.spawnHorse(
          hs.id, hs.name ?? 'Steed', (hs.coat ?? 'bay') as keyof typeof HORSE_PALETTES,
          hs.x, hs.z, hs.owned, hs.price ?? 0,
        );
        h = this.horses.find((x) => x.id === hs.id);
        if (!h) continue;
      }
      h.pos.set(hs.x, this.terrain.height(hs.x, hs.z), hs.z);
      h.yaw = hs.yaw;
      h.owned = hs.owned;
      h.speed = 0;
      h.ai = 'idle';
      h.gait = 'idle';
    }
    if (this.cart && d.cart) {
      this.cart.pos.set(d.cart.x, this.terrain.height(d.cart.x, d.cart.z), d.cart.z);
      this.cart.heading = d.cart.heading;
      this.cart.hitchedTo = d.cart.hitchedTo;
    }
    // Riding is restored by the Game layer (it also restores the player)
    this.ridingId = null;
  }

  /** Restore being mounted (after the horse herd is deserialized). */
  restoreRiding(id: string | null): void {
    if (id && this.horses.some((h) => h.id === id && h.owned)) {
      this.ridingId = id;
    }
  }

  dispose(): void {
    for (const h of this.horses) {
      this.scene.remove(h.model.root);
      h.model.dispose();
    }
    this.horses = [];
    if (this.cart) {
      this.scene.remove(this.cart.model.root);
      this.cart = null;
    }
  }
}
