import * as THREE from 'three';
import { SeaSerpent, type SerpentContext } from '../entities/SeaSerpent';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { WaterSystem } from '../world/WaterSystem';
import type { GameState } from './GameState';
import type { VfxSystem } from './VfxSystem';
import type { Ship } from '../naval/Ship';

/** Audio events the system can ask for. */
type SoundKind = Parameters<import('./AudioSystem').AudioSystem['playEvent']>[0];

export interface SeaBeastHooks {
  notify(kind: 'info' | 'quest' | 'item', title: string, body?: string): void;
  sound(kind: SoundKind): void;
  /** Music intensity 0..1 + boss drum layer. */
  music(intensity: number, boss: boolean): void;
  bossHud(state: { name: string; title: string; hp: number; maxHp: number; phase: number } | null): void;
  shipDamage(dmg: number): void;
  playerDamage(dmg: number, fromX: number, fromZ: number, reason: string): number;
  cameraShake(intensity: number): void;
}

/** Where the Sea King lives (El Ombligo del Mar). */
export const NAVAL_ISLAND = { x: 476, z: 476, arenaR: 300 };

/** Ink / foam sprite pool (serpent feedback). */
class InkPool {
  private sprites: THREE.Sprite[] = [];
  private active: Array<{ sp: THREE.Sprite; t: number; dur: number; grow: number }> = [];

  constructor(scene: THREE.Scene, count: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(18,44,48,0.85)');
    grad.addColorStop(1, 'rgba(18,44,48,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    for (let i = 0; i < count; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0,
      }));
      sp.visible = false;
      scene.add(sp);
      this.sprites.push(sp);
    }
  }

  spawn(pos: THREE.Vector3, scale: number): void {
    const sp = this.sprites.find((s) => !s.visible);
    if (!sp) return;
    sp.position.copy(pos);
    sp.scale.setScalar(scale);
    sp.material.opacity = 0.75;
    sp.visible = true;
    this.active.push({ sp, t: 0, dur: 0.9, grow: 1.8 });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += dt;
      const k = a.t / a.dur;
      if (k >= 1) {
        a.sp.visible = false;
        this.active.splice(i, 1);
        continue;
      }
      a.sp.material.opacity = 0.75 * (1 - k);
      a.sp.scale.multiplyScalar(1 + a.grow * dt);
    }
  }
}

/**
 * Fase 15 — SEA BEASTS + THE SEA KING.
 *
 * Common serpents ("Serpes de la Marea") spawn ONLY while the player is
 * actively sailing, attack the ship, and drop trade goods + rare materials
 * (sell / trade / craft). "El Rey del Mar" — the biggest, meanest monster
 * in the game — is summoned at the Horn Altar on the navel island and pays
 * out the Espada Soberana (10%) and the Corazón de la Bestia (5%).
 */
export class SeaBeastSystem {
  beasts: SeaSerpent[] = [];
  private king: SeaSerpent | null = null;
  private kingActive = false;
  private ink: InkPool;
  private t = 0;
  /** Seconds until the next common-beast spawn check. */
  private spawnCd: number;
  /** Seconds the player has been NOT actively sailing (grace to despawn). */
  private notSailingT = 0;
  private hitScratch: Array<{ center: THREE.Vector3; radius: number }> = [];
  private lastBossHudKey = '';
  private ctxBundle: SerpentContext | null = null;
  /** External blockers (pirate ambush running, etc.). */
  blockCommonSpawns = false;

  constructor(
    private scene: THREE.Scene,
    private terrain: TerrainHeight,
    private water: WaterSystem,
    private state: GameState,
    private vfx: VfxSystem,
    private hooks: SeaBeastHooks,
  ) {
    this.ink = new InkPool(scene, 30);
    this.spawnCd = 30 + Math.random() * 20;
  }

  // ------------------------------------------------------------ king fight

  get kingFightActive(): boolean {
    return this.kingActive;
  }

  /** Prerequisites for sounding the horn (checked by the altar prompt). */
  summonPrereq(): { ok: boolean; reason?: string } {
    if (this.kingActive) return { ok: false, reason: 'fight' };
    if (!this.state.hasItem('cuerno_marea')) return { ok: false, reason: 'horn' };
    if (this.state.level < 6) return { ok: false, reason: 'level' };
    return { ok: true };
  }

  /**
   * Sound the horn: consumes the Cuerno de la Marea and wakes the King
   * in the summon ring around the island.
   */
  summonKing(): boolean {
    const pre = this.summonPrereq();
    if (!pre.ok) return false;
    if (!this.state.removeItem('cuerno_marea', 1)) return false;

    const ang = Math.random() * Math.PI * 2;
    const r = NAVAL_ISLAND.arenaR * 0.32; // ~96 m from the altar
    const kx = NAVAL_ISLAND.x + Math.cos(ang) * r;
    const kz = NAVAL_ISLAND.z + Math.sin(ang) * r;
    const king = new SeaSerpent({ x: kx, z: kz, king: true, hp: 1400, facing: ang + Math.PI });
    king.onKingPhase2 = (k) => {
      this.hooks.notify('quest', 'THE KING OF THE SEA — PHASE 2',
        'The King roars and calls his brood! Tide serpents join the hunt.');
      this.hooks.sound('roar_big');
      this.hooks.cameraShake(0.7);
      this.spawnAdd(k);
      this.spawnAdd(k);
    };
    this.scene.add(king.group);
    this.beasts.push(king);
    this.king = king;
    this.kingActive = true;
    this.state.setFlag('rey_del_mar_seen');

    this.hooks.sound('roar_big');
    this.hooks.cameraShake(1.0);
    this.hooks.music(1, true);
    this.hooks.notify('quest', 'THE KING OF THE SEA — LORD OF THE FORGOTTEN SEAS',
      'The ocean splits open: the greatest beast ever seen rises before the Hummingbird. Aim your broadsides when it circles, and mend your course when it dives!');
    return true;
  }

  private spawnAdd(king: SeaSerpent): void {
    const ang = Math.random() * Math.PI * 2;
    const sx = king.pos.x + Math.cos(ang) * 55;
    const sz = king.pos.z + Math.sin(ang) * 55;
    const add = new SeaSerpent({ x: sx, z: sz, hp: 130 });
    this.scene.add(add.group);
    this.beasts.push(add);
  }

  /** Player died / left the arena: the fight resets (the King heals). */
  resetCombat(): void {
    for (const b of this.beasts) {
      if (b.alive) b.disengage();
    }
    if (this.kingActive) {
      this.kingActive = false;
      this.king = null;
      this.hooks.notify('info', 'The King of the Sea sinks into the deep',
        'The beast heals its wounds in the abyss. You will need another Tide Horn to call it again.');
      this.hooks.music(0.25, false);
    }
    this.hooks.bossHud(null);
    this.lastBossHudKey = '';
    this.spawnCd = Math.max(this.spawnCd, 45);
  }

  // ------------------------------------------------------------- hit tests

  /**
   * Swept sphere test for cannonballs (and arrows) against SURFACED beasts.
   * Returns the serpent that was hit, or null.
   */
  projectileHitTest(pos: THREE.Vector3, radius: number, prev?: THREE.Vector3): SeaSerpent | null {
    for (const b of this.beasts) {
      if (!b.alive || !b.surfaced) continue;
      b.getHitSpheres(this.hitScratch);
      for (const s of this.hitScratch) {
        if (prev ? this.segSphere(prev, pos, s.center, s.radius + radius)
                 : s.center.distanceTo(pos) <= s.radius + radius) {
          return b;
        }
      }
    }
    return null;
  }

  private segSphere(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, r: number): boolean {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
    const ab2 = abx * abx + aby * aby + abz * abz;
    let t = ab2 > 0 ? (acx * abx + acy * aby + acz * abz) / ab2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = acx - abx * t;
    const dy = acy - aby * t;
    const dz = acz - abz * t;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }

  /** Direct damage (cannonballs / debug). */
  damage(beast: SeaSerpent, amount: number): void {
    if (!beast.alive) return;
    beast.hp = Math.max(0, beast.hp - amount);
    this.ink.spawn(beast.pos.clone().setY(Math.max(beast.pos.y + beast.hpFrac * 2, 0.3)), 1.4 + beast.hpFrac * 2);
    this.hooks.sound('hit_hull');
    if (beast.hp <= 0) this.onBeastDeath(beast);
    else if (beast.state === 'lurk' || beast.state === 'retreat') {
      // poked from its slumber: back to the hunt
      beast.state = 'circle';
      beast.stateT = 0;
    }
  }

  private onBeastDeath(beast: SeaSerpent): void {
    beast.kill();
    this.hooks.sound(beast.isKing ? 'boss_die' : 'sink');
    this.hooks.cameraShake(beast.isKing ? 1.0 : 0.35);

    if (beast.isKing) {
      // ---- THE SEA KING LOOT TABLE (per spec) ----
      const drops: string[] = [];
      const gotSword = Math.random() < 0.10; // Espada Soberana: 1 in 10
      const gotHeart = Math.random() < 0.05; // Corazón de la Bestia: rarer
      if (gotSword) {
        this.state.addItem('espada_soberana', 1);
        drops.push('Sovereign Sword');
      }
      if (gotHeart) {
        this.state.addItem('corazon_bestia', 1);
        drops.push('Heart of the Beast');
      }
      this.state.addItem('escama_abismo', 3);
      this.state.addItem('perla_negra', 1);
      this.state.addItem('coin', 600);
      // Fase 22 — THE FORGE: the King's hide + living tide for the forge
      this.state.addItem('cuero_bestia', 3);
      this.state.addItem('esencia_agua', 2);
      this.state.giveXp(1000);
      this.state.registerKill('rey_del_mar');
      if (!this.state.hasFlag('rey_del_mar_dead')) {
        this.state.setFlag('rey_del_mar_dead');
        this.state.addJournal({
          id: 'story_rey_del_mar',
          kind: 'story',
          title: 'The King of the Sea has fallen',
          text: 'At the ocean\'s exact navel, the lord of the forgotten seas sank for the last time. The sea fell silent… and something of his was left in my hand.',
        });
      }
      this.hooks.notify('quest', 'THE KING OF THE SEA HAS FALLEN!',
        `Loot: abyssal scales ×3, black pearl, beast leather ×3, water essence ×2, 600 coins${gotSword ? ', SOVEREIGN SWORD!' : ''}${gotHeart ? ', HEART OF THE BEAST!' : ''}. +1000 XP`);
      if (!gotSword) {
        this.hooks.notify('info', 'The Sovereign Sword remains in the abyss',
          'They say it drops 1 in every 10 times the King is defeated. Another horn, another chance.');
      }
      this.hooks.music(0.3, false);
      this.kingActive = false;
      this.king = null;
      this.hooks.bossHud(null);
      this.lastBossHudKey = '';
      this.spawnCd = 60;
    } else {
      // ---- Common serpent loot (trade goods + rare materials) ----
      const drops: string[] = [];
      const tent = 1 + (Math.random() < 0.5 ? 1 : 0);
      this.state.addItem('tentaculo', tent);
      drops.push(`serpent tentacle ×${tent}`);
      if (Math.random() < 0.8) { this.state.addItem('carne_bestia', 1); drops.push('sea-beast meat'); }
      // Fase 22 — THE FORGE: serpent hide for the Shadow Dō + a chance of
      // the living tide the Tide-Steel Saber is quenched in
      if (Math.random() < 0.75) { this.state.addItem('cuero_bestia', 1); drops.push('beast leather'); }
      if (Math.random() < 0.30) { this.state.addItem('esencia_agua', 1); drops.push('water essence'); }
      if (Math.random() < 0.35) { this.state.addItem('escama_abismo', 1); drops.push('abyssal scale'); }
      if (Math.random() < 0.18) {
        this.state.addItem('perla_negra', 1);
        drops.push('BLACK PEARL');
        this.hooks.notify('item', 'Rare loot: Black Pearl!',
          'Sell it high (130), trade it with Erica, or forge with it at the smithy.');
      }
      if (Math.random() < 0.10) {
        this.state.addItem('cuerno_marea', 1);
        drops.push('TIDE HORN');
        this.hooks.notify('item', 'A Tide Horn!',
          'The crowned serpents keep it inside. Sound it at the altar of the Navel of the Sea (level 6).');
      }
      const coins = Math.random() < 0.6 ? 10 + Math.floor(Math.random() * 16) : 0;
      if (coins > 0) { this.state.addItem('coin', coins); drops.push(`${coins} coins`); }
      this.state.giveXp(45);
      this.state.registerKill('serpe');
      this.hooks.notify('item', 'Tide Serpent slain', `Loot: ${drops.join(', ')}. +45 XP`);
    }
  }

  // --------------------------------------------------------------- update

  /**
   * @param activelySailing true while the player is AT THE HELM and underway
   * @param ship the ship being sailed (the beasts' target)
   */
  update(dt: number, activelySailing: boolean, ship: Ship | null): void {
    this.t += dt;
    this.ink.update(dt);

    // ---- Common beast spawning (ONLY while actively sailing) ----
    if (activelySailing && ship && !this.kingActive && !this.blockCommonSpawns) {
      this.notSailingT = 0;
      const underway = Math.abs(ship.speed) > 1.2 && !ship.anchored;
      const deepWater = this.terrain.height(ship.pos.x, ship.pos.z) < -6;
      const nearNavel = Math.hypot(ship.pos.x - NAVAL_ISLAND.x, ship.pos.z - NAVAL_ISLAND.z) < 150;
      const alive = this.beasts.filter((b) => b.alive).length;
      if (underway && deepWater && alive < 2 && !nearNavel) {
        this.spawnCd -= dt;
        if (this.spawnCd <= 0) {
          const pack = Math.random() < 0.35 ? 2 : 1;
          let spawned = 0;
          for (let i = 0; i < pack; i++) {
            const p = this.findSpawnPoint(ship);
            if (!p) break;
            const beast = new SeaSerpent({ x: p.x, z: p.z });
            this.scene.add(beast.group);
            this.beasts.push(beast);
            spawned++;
          }
          if (spawned > 0) {
            this.hooks.notify('quest', spawned > 1 ? 'Tide Serpents stalking!' : 'A Tide Serpent stalks!',
              'The water boils under the keel: it circles, hunting your hull. Broadside it when it surfaces!');
            this.hooks.music(0.7, false);
            this.hooks.sound('splash');
          }
          this.spawnCd = 55 + Math.random() * 40;
        }
      }
    } else if (!activelySailing) {
      this.notSailingT += dt;
    }

    // Beasts lose interest when the player stays ashore — but the KING
    // waits in his arena: the horn is sounded at the summit altar, and the
    // player still has to run down and board (Fase 17 fix — the boss used
    // to flee the instant the summoner stepped off the ship).
    if (this.notSailingT > 10) {
      for (const b of this.beasts) {
        if (b.alive && !b.isKing && b.state !== 'flee') b.disengage();
      }
    }

    // Fase 15 FIX — the King can leave through a generic disengage (player
    // went ashore / ship sank mid-fight): the fight state MUST follow, or
    // the altar would refuse every future summon with "ya ha despertado".
    if (this.kingActive && this.king && !this.king.alive) {
      this.resetCombat();
    }

    // ---- Update every serpent ----
    const ctx = this.ctx();
    for (let i = this.beasts.length - 1; i >= 0; i--) {
      const b = this.beasts[i];
      // target: the ship while the player sails it
      ctx.ship = activelySailing && ship
        ? { pos: ship.pos, heading: ship.heading, speed: ship.speed, length: ship.length }
        : null;
      b.update(dt, ctx);

      // cleanup rules
      const distToShip = ship ? Math.hypot(b.pos.x - ship.pos.x, b.pos.z - ship.pos.z) : 9999;
      if (b.state === 'gone' || b.group.parent === null) {
        this.beasts.splice(i, 1);
        continue;
      }
      if (b.state === 'sink' && b.stateT > 3.2) {
        b.dispose();
        this.beasts.splice(i, 1);
        continue;
      }
      if (b.state === 'flee' && (b.stateT > 6 || distToShip > 260)) {
        b.dispose();
        this.beasts.splice(i, 1);
        continue;
      }
      if (b.alive && !b.isKing && distToShip > 300) {
        // lost interest (or the ship ran) — the KING ignores this rule:
        // his arena leash (distToIsle > arenaR) already governs his fight,
        // and the summoner will legitimately be ashore at the altar.
        b.disengage();
      }
    }

    // ---- King arena leash ----
    if (this.kingActive && this.king && ship) {
      const distToIsle = Math.hypot(ship.pos.x - NAVAL_ISLAND.x, ship.pos.z - NAVAL_ISLAND.z);
      if (distToIsle > NAVAL_ISLAND.arenaR) {
        this.resetCombat();
      } else {
        // Boss HUD (king only)
        const key = `rey|${this.king.phase}|${Math.round(this.king.hp)}`;
        if (key !== this.lastBossHudKey) {
          this.lastBossHudKey = key;
          this.hooks.bossHud({
            name: 'The King of the Sea',
            title: 'Lord of the Forgotten Seas',
            hp: this.king.hp,
            maxHp: this.king.maxHp,
            phase: this.king.phase,
          });
        }
      }
    }
  }

  /** Nearest surfaced beast for the sailing HUD. */
  hudBeast(ship: Ship | null): { name: string; hpFrac: number; dist: number } | null {
    if (!ship) return null;
    let best: { name: string; hpFrac: number; dist: number } | null = null;
    for (const b of this.beasts) {
      if (!b.alive || !b.surfaced || b.isKing) continue;
      const d = Math.hypot(b.pos.x - ship.pos.x, b.pos.z - ship.pos.z);
      if (d < 130 && (!best || d < best.dist)) {
        best = { name: b.name, hpFrac: b.hpFrac, dist: d };
      }
    }
    return best;
  }

  // -------------------------------------------------------------- helpers

  private findSpawnPoint(ship: Ship): { x: number; z: number } | null {
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 65 + Math.random() * 25;
      const x = ship.pos.x + Math.cos(a) * r;
      const z = ship.pos.z + Math.sin(a) * r;
      if (this.terrain.height(x, z) < -7) return { x, z };
    }
    return null;
  }

  private ctx(): SerpentContext {
    if (!this.ctxBundle) {
      this.ctxBundle = {
        ship: null,
        water: this.water,
        hullDamage: (dmg, at) => {
          this.hooks.shipDamage(dmg);
          this.hooks.cameraShake(0.3);
          void at;
        },
        playerDamage: (dmg, fx, fz, reason) => this.hooks.playerDamage(dmg, fx, fz, reason),
        splash: (pos, strength) => this.vfx.waterSplash(pos.clone(), strength),
        ink: (pos, strength) => this.ink.spawn(pos, 1 + strength * 2),
        sound: (kind) => this.hooks.sound(kind),
        shake: (i) => this.hooks.cameraShake(i),
        wake: (x, z, force, radius, decay) => this.water.addWake(x, z, force, radius, decay),
      };
    }
    return this.ctxBundle;
  }

  dispose(): void {
    for (const b of this.beasts) b.dispose();
    this.beasts = [];
    this.king = null;
    this.kingActive = false;
  }
}
