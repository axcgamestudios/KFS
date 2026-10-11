import * as THREE from 'three';
import { KnightModelGLB } from '../entities/KnightModelGLB';
import type { AssetSystem } from '../world/AssetSystem';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { KitSystem } from '../world/KitSystem';
import { damp, dampAngle } from '../core/MathUtils';

/**
 * Fase 10 — BanditSystem: RED KNIGHT bandits roaming set zones of the map.
 *
 * The Order's discipline gone rotten: deserters and road-wolves wearing
 * oxidised crimson plate. Every camp is 3 swords + 1 captain (taller, cloaked,
 * more health). They patrol their camp, spot the player at ~16 m, chase and
 * swing real melee attacks (dodgeable, blockable, parryable through the
 * player's own takeHit), and drop coins/potions. Camps respawn slowly so the
 * roads stay dangerous without ever becoming a grind.
 *
 * Combat integration (wired by Game):
 *  · banditMelee(origin, yaw, reach, arc) → the player's swings hit bandits
 *  · projectileHitTest(pos, r)             → arrows clip them too
 *  · damage(bandit, amount, heavy)         → HP, stagger, death + loot
 */

export interface BanditHooks {
  playerDamage: (dmg: number, fromX?: number, fromZ?: number, reason?: string) => void;
  sound: (kind: 'swing' | 'damage' | 'hit_scale' | 'block') => void;
  notify: (kind: 'info' | 'item' | 'quest', title: string, body?: string) => void;
  giveXp: (xp: number) => void;
  addCoins: (n: number) => void;
  weaponImpact: (pos: THREE.Vector3) => void;
  cameraShake: (i: number) => void;
}

interface CampDef {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

/** Four hand-placed camps guarding roads and POI approaches. */
const CAMPS: CampDef[] = [
  { id: 'camp_camino', name: 'Emboscada del Camino Real', x: 62, z: 58, radius: 10 },
  { id: 'camp_vaelthara', name: 'Lobos de Vaelthara', x: -206, z: -112, radius: 11 },
  { id: 'camp_vigilias', name: 'La Peña del Cuervo Rojo', x: -118, z: -232, radius: 10 },
  { id: 'camp_costa', name: 'Corsarios de la Costa Oeste', x: -286, z: 170, radius: 11 },
];

type BanditState = 'patrol' | 'chase' | 'attack' | 'stagger' | 'dead';

class Bandit {
  readonly group = new THREE.Group();
  model: KnightModelGLB | null = null;
  state: BanditState = 'patrol';
  hp: number;
  maxHp: number;
  readonly captain: boolean;
  readonly camp: CampDef;
  private campIndex: number;
  private angle = Math.random() * Math.PI * 2;
  private anchor = new THREE.Vector3();
  private target = new THREE.Vector3();
  private yaw = Math.random() * Math.PI * 2;
  private speedSm = 0;
  private phase = Math.random() * 8;
  private attackT = 0;
  private attackKind: 'light1' | 'light2' | 'heavy' = 'light1';
  private attackDur = 0.75;
  private attackCooldown = 0;
  private hitDone = false;
  private staggerT = 0;
  private deathT = 0;
  respawnT = 0;
  private moving = false;
  private aggro = false;
  private idlePause = 2 + Math.random() * 3;
  readonly pos = new THREE.Vector3();

  constructor(campIndex: number, camp: CampDef, captain: boolean, seed: number) {
    this.camp = camp;
    this.captain = captain;
    this.campIndex = campIndex;
    this.maxHp = captain ? 130 : 65;
    this.hp = this.maxHp;
    this.aggroRadius = captain ? 20 : 16;
    this.damage = captain ? 20 : 12;
    this.anchor.set(camp.x, 0, camp.z);
    void seed;
    this.pickPatrolTarget();
  }

  readonly aggroRadius: number;
  readonly damage: number;

  private pickPatrolTarget(): void {
    this.angle += 0.6 + Math.random() * 1.4;
    const r = 2.5 + Math.random() * (this.camp.radius - 2);
    this.target.set(
      this.camp.x + Math.cos(this.angle) * r,
      0,
      this.camp.z + Math.sin(this.angle) * r,
    );
  }

  get alive(): boolean {
    return this.state !== 'dead' || this.respawnT > 0;
  }

  get dead(): boolean {
    return this.state === 'dead';
  }

  /** Centre of the torso for hit tests. */
  center(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.15, this.pos.z);
  }

  takeDamage(amount: number, heavy: boolean): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.aggro = true;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deathT = 0;
      this.respawnT = 360 + Math.random() * 120; // 6–8 min
      this.attackT = 0;
      return true;
    }
    // captains have poise — light hits don't stagger them
    if (heavy || !this.captain) {
      this.state = 'stagger';
      this.staggerT = 0.42;
      this.attackT = 0;
    }
    return false;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    terrain: TerrainHeight,
    playerVulnerable: boolean,
    hooks: BanditHooks,
  ): void {
    const g = this.group;

    if (this.state === 'dead') {
      this.deathT += dt;
      this.respawnT -= dt;
      // fall over, then sink into the ground and free the slot
      if (this.deathT < 0.55) {
        g.rotation.x = -Math.PI / 2 * Math.min(1, this.deathT / 0.55);
        this.model?.update({ dt, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1 });
      } else if (this.deathT > 6) {
        const s = Math.max(0, 1 - (this.deathT - 6) / 2.2);
        g.position.y -= dt * 0.22;
        g.scale.setScalar(Math.max(0.01, s));
        if (this.deathT > 8.5) g.visible = false;
      }
      return;
    }

    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // --- perception ---
    if (!this.aggro && dist < this.aggroRadius && Math.abs(playerPos.y - this.pos.y) < 6) {
      this.aggro = true;
      hooks.sound('swing'); // a bark as they draw steel
    }
    // leash: far from camp or player dead/dialog → back to patrol
    if (this.aggro && (dist > 34 || Math.hypot(this.pos.x - this.camp.x, this.pos.z - this.camp.z) > 46)) {
      this.aggro = false;
      this.pickPatrolTarget();
    }

    // --- state logic ---
    let targetSpeed = 0;
    this.moving = false;

    if (this.state === 'stagger') {
      this.staggerT -= dt;
      if (this.staggerT <= 0) this.state = 'chase';
    } else if (this.state === 'attack') {
      this.attackT += dt / this.attackDur;
      // damage lands mid-swing if the player is still in range
      if (!this.hitDone && this.attackT >= (this.attackKind === 'heavy' ? 0.55 : 0.45)) {
        this.hitDone = true;
        if (playerVulnerable && dist < 2.5) {
          const facing = Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz;
          if (facing > 0) {
            hooks.playerDamage(this.damage, this.pos.x, this.pos.z, 'bandit');
          }
        }
      }
      if (this.attackT >= 1) {
        this.attackT = 0;
        this.state = 'chase';
        this.attackCooldown = this.captain ? 1.0 + Math.random() * 0.6 : 1.3 + Math.random() * 0.8;
      }
    } else if (this.aggro) {
      this.state = 'chase';
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      if (dist < 2.05) {
        this.state = 'attack';
        this.hitDone = false;
        this.attackT = 0.001;
        const roll = Math.random();
        this.attackKind = this.captain && roll < 0.35 ? 'heavy' : roll < 0.55 ? 'light2' : 'light1';
        this.attackDur = this.attackKind === 'heavy' ? 0.95 : 0.7;
        hooks.sound('swing');
        this.yaw = Math.atan2(dx, dz); // square up for the blow
      } else {
        // strafe straight in
        this.target.set(playerPos.x, 0, playerPos.z);
        targetSpeed = this.captain ? 3.9 : 4.3;
        this.moving = true;
      }
    } else {
      // patrol the camp
      this.state = 'patrol';
      const tdx = this.target.x - this.pos.x;
      const tdz = this.target.z - this.pos.z;
      const td = Math.hypot(tdx, tdz);
      if (td < 0.6) {
        this.idlePause -= dt;
        this.moving = false;
        if (this.idlePause <= 0) {
          this.idlePause = 1.5 + Math.random() * 3.5;
          this.pickPatrolTarget();
        }
      } else {
        this.moving = true;
        targetSpeed = 1.25;
      }
    }

    // --- steering + terrain ---
    const tdx = this.target.x - this.pos.x;
    const tdz = this.target.z - this.pos.z;
    const tdl = Math.hypot(tdx, tdz);
    if (this.moving && tdl > 0.01 && this.state !== 'attack') {
      const nx = tdx / tdl;
      const nz = tdz / tdl;
      this.speedSm = damp(this.speedSm, targetSpeed, 6, dt);
      this.pos.x += nx * this.speedSm * dt;
      this.pos.z += nz * this.speedSm * dt;
      this.yaw = dampAngle(this.yaw, Math.atan2(nx, nz), 8, dt);
    } else {
      this.speedSm = damp(this.speedSm, 0, 8, dt);
      if (this.aggro && dist < 6) {
        this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
      }
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -1005, 1005);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -1005, 1005);
    this.pos.y = terrain.height(this.pos.x, this.pos.z);
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    g.rotation.x = damp(g.rotation.x, 0, 10, dt);

    // --- animation ---
    this.phase += dt * (this.speedSm > 3.2 ? 8.6 : 5.4) * (this.moving ? 1 : 0);
    this.model?.update({
      dt,
      speed: this.speedSm,
      moving: this.moving,
      grounded: true,
      swimming: false,
      attackT: this.attackT,
      attackKind: this.attackKind,
      blockT: 0,
      rollT: 0,
      bowDraw: -1,
    });
  }

  respawn(terrain: TerrainHeight): void {
    this.hp = this.maxHp;
    this.state = 'patrol';
    this.aggro = false;
    this.deathT = 0;
    this.attackT = 0;
    this.staggerT = 0;
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.angle = Math.random() * Math.PI * 2;
    this.pickPatrolTarget();
    this.pos.set(this.camp.x, 0, this.camp.z);
    this.pos.y = terrain.height(this.pos.x, this.pos.z);
    this.group.position.copy(this.pos);
  }
}

export class BanditSystem {
  private bandits: Bandit[] = [];
  private scene: THREE.Scene;
  private terrain: TerrainHeight;
  private assets: AssetSystem;
  private kits: KitSystem | null;
  private hooks: BanditHooks;
  /** Alive bandits near a point (for the melee hook). */
  private tmpV = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    terrain: TerrainHeight,
    assets: AssetSystem,
    kits: KitSystem | null,
    hooks: BanditHooks,
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.assets = assets;
    this.kits = kits;
    this.hooks = hooks;
    this.spawnAll();
  }

  private spawnAll(): void {
    let n = 0;
    for (let c = 0; c < CAMPS.length; c++) {
      const camp = CAMPS[c];
      const crew = 4; // 3 swords + captain
      for (let i = 0; i < crew; i++) {
        const captain = i === 0;
        const bandit = new Bandit(c, camp, captain, c * 31 + i * 7);
        const angle = (i / crew) * Math.PI * 2;
        bandit.pos.set(
          camp.x + Math.cos(angle) * 3.2,
          0,
          camp.z + Math.sin(angle) * 3.2,
        );
        bandit.pos.y = this.terrain.height(bandit.pos.x, bandit.pos.z);
        bandit.group.position.copy(bandit.pos);
        this.scene.add(bandit.group);
        this.bandits.push(bandit);
        this.attachVisual(bandit, captain);
        n++;
      }
    }
    void n;
  }

  private attachVisual(bandit: Bandit, captain: boolean): void {
    this.assets.loadModel('knight_rigged.glb').then((scene) => {
      if (bandit.dead) return; // died before the model arrived
      const model = new KnightModelGLB({
        scene,
        bandit: { seed: bandit.pos.x * 3.1 + bandit.pos.z, captain },
        weaponFactory: (kind) => (this.kits ? this.kits.weapon(kind) : null),
      });
      model.setWeapon('sword');
      model.setShield(false);
      bandit.model = model;
      bandit.group.add(model.root);
    }).catch(() => {
      // GLB unavailable — leave an empty group (bandits simply don't spawn)
      bandit.group.visible = false;
      bandit.takeDamage(99999, true);
    });
  }

  // ------------------------------------------------------------ combat API

  /** Player melee swing: nearest bandit inside reach+arc from origin/yaw. */
  meleeHitCheck(
    origin: THREE.Vector3,
    yaw: number,
    reach: number,
    arc: number,
  ): { bandit: Bandit; point: THREE.Vector3 } | null {
    let best: Bandit | null = null;
    let bestD = Infinity;
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const dx = b.pos.x - origin.x;
      const dz = b.pos.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + 0.55) continue;
      const facing = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      const ang = Math.atan2(dx, dz) - yaw;
      const wrapped = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
      if (facing > 0 && wrapped < arc * 0.5 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (!best) return null;
    const c = best.center();
    return {
      bandit: best,
      point: this.tmpV.set(
        best.pos.x,
        c.y,
        best.pos.z,
      ).clone(),
    };
  }

  /** Arrow/projectile sweep: bandit whose capsule contains the point. */
  projectileHitTest(pos: THREE.Vector3, radius: number): Bandit | null {
    for (const b of this.bandits) {
      if (b.dead || !b.group.visible) continue;
      const dx = pos.x - b.pos.x;
      const dz = pos.z - b.pos.z;
      const dy = pos.y - (b.pos.y + 0.95);
      if (dx * dx + dz * dz < (radius + 0.45) ** 2 && Math.abs(dy) < 1.05) return b;
    }
    return null;
  }

  /** Apply player damage to a bandit; handles loot/XP on death. */
  damage(bandit: unknown, amount: number, heavy: boolean): void {
    const b = bandit as Bandit;
    const died = b.takeDamage(amount, heavy);
    this.hooks.weaponImpact(b.center());
    if (died) {
      const coins = b.captain ? 25 + Math.floor(Math.random() * 35) : 8 + Math.floor(Math.random() * 14);
      this.hooks.addCoins(coins);
      this.hooks.giveXp(b.captain ? 60 : 18);
      this.hooks.sound('hit_scale');
      this.hooks.cameraShake(b.captain ? 0.5 : 0.25);
      this.hooks.notify(
        'item',
        b.captain ? '¡Capitán bandido derrotado!' : 'Bandido abatido',
        `Botín: ${coins} monedas de oro.`,
      );
    } else {
      this.hooks.sound('damage');
    }
  }

  // ------------------------------------------------------------ frame

  update(dt: number, playerPos: THREE.Vector3, playerVulnerable: boolean): void {
    for (const b of this.bandits) {
      if (b.dead && b.respawnT <= 0 && !b.group.visible) continue; // already despawned
      if (b.dead && b.respawnT <= 0) {
        b.respawn(this.terrain);
        this.attachVisual(b, b.captain);
        continue;
      }
      // culling: far camps animate cheap (pose frozen, schedules continue)
      const d2 = (b.pos.x - playerPos.x) ** 2 + (b.pos.z - playerPos.z) ** 2;
      if (d2 > 210 * 210) continue;
      b.update(dt, playerPos, this.terrain, playerVulnerable, this.hooks);
    }
  }

  /** Debug/test surface. */
  stats(): { total: number; alive: number; camps: number } {
    return {
      total: this.bandits.length,
      alive: this.bandits.filter((b) => !b.dead).length,
      camps: CAMPS.length,
    };
  }

  campList(): Array<{ id: string; name: string; x: number; z: number }> {
    return CAMPS.map((c) => ({ id: c.id, name: c.name, x: c.x, z: c.z }));
  }

  dispose(): void {
    for (const b of this.bandits) {
      this.scene.remove(b.group);
      b.model?.dispose();
    }
    this.bandits.length = 0;
  }
}
