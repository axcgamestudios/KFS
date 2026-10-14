import * as THREE from 'three';
import type { TerrainHeight } from '../world/TerrainHeight';
import type { GameState } from './GameState';
import type { NavalSystem, EnemyBrain } from '../naval/NavalSystem';
import type { Ship } from '../naval/Ship';
import { ITEMS } from '../data/items';

/** The toll the pirates demand in gold (option B — fixed amount). */
export const PIRATE_TOLL_COINS = 150;

/** One ambush event in flight. */
export interface AmbushState {
  /** What triggered the negotiation (null while the fight is on). */
  negotiation: 'death' | 'ship' | null;
}

export interface PirateAmbushHooks {
  notify(kind: 'info' | 'quest' | 'item', title: string, body?: string): void;
  sound(kind: 'splash' | 'cannon' | 'grapple' | 'anchor'): void;
  music(intensity: number): void;
  /** Push/clear the negotiation UI (store). */
  negotiation(state: {
    reason: 'death' | 'ship';
    coins: number;
    canAfford: boolean;
    hasItems: boolean;
  } | null): void;
}

/**
 * Fase 15 — PIRATE AMBUSH (random deep-sea event).
 *
 * Every 5 minutes of CONTINUOUS sailing a check fires with a 1-in-5
 * chance — only on the high seas, never near land. A pirate ship with
 * working cannons hunts the player's vessel. If the pirates kill the
 * player OR sink the ship, there is no permanent death: a negotiation
 * UI deploys with two options —
 *   A) hand over ONE random inventory item
 *   B) hand over a fixed amount of gold coins.
 */
export class PirateAmbushSystem {
  /** Seconds of continuous sailing accumulated toward the next check. */
  private sailTimer = 0;
  /** Seconds until the next 5-minute check. */
  private nextCheckAt = 300;
  ambushActive = false;
  private brain: EnemyBrain | null = null;
  private state: AmbushState = { negotiation: null };
  private rollCount = 0;

  constructor(
    private terrain: TerrainHeight,
    private gameState: GameState,
    private naval: NavalSystem,
    private hooks: PirateAmbushHooks,
  ) {}

  // ------------------------------------------------------------- trigger

  /**
   * @param activelySailing player at the helm and underway
   * @param ship the ship being sailed
   */
  update(dt: number, activelySailing: boolean, ship: Ship | null): void {
    if (this.ambushActive) {
      this.watchEvent(ship);
      return;
    }

    if (activelySailing && ship && Math.abs(ship.speed) > 1.5 && !ship.anchored) {
      this.sailTimer += dt;
      // Continuous sailing: a long stop bleeds the counter back down.
    } else {
      this.sailTimer = Math.max(0, this.sailTimer - dt * 2.2);
    }

    if (this.sailTimer >= this.nextCheckAt) {
      this.nextCheckAt += 300; // next 5-minute mark
      this.rollCount++;
      // Deep ocean only — never near land or coast.
      const deep = ship ? this.terrain.height(ship.pos.x, ship.pos.z) < -8 : false;
      const awayFromNavel = ship
        ? Math.hypot(ship.pos.x - 476, ship.pos.z - 476) > 220
        : true;
      if (deep && awayFromNavel && Math.random() < 0.2) {
        this.spawnAmbush(ship!);
      }
    }
  }

  private spawnAmbush(ship: Ship): void {
    // Spawn ahead-ish of the ship, far enough to be a sighting. Probe a few
    // bearings: the open sea is littered with reefs and the event must not
    // silently die on one.
    let sx = 0;
    let sz = 0;
    let found = false;
    for (let tries = 0; tries < 8 && !found; tries++) {
      const a = ship.heading + (Math.random() - 0.5) * 2.4;
      const r = 130 + Math.random() * 40;
      const x = THREE.MathUtils.clamp(ship.pos.x + Math.sin(a) * r, -700, 700);
      const z = THREE.MathUtils.clamp(ship.pos.z + Math.cos(a) * r, -700, 700);
      if (this.terrain.height(x, z) < -3) {
        sx = x;
        sz = z;
        found = true;
      }
    }
    if (!found) return; // surrounded by shallows — the sea spares you today

    this.brain = this.naval.spawnAmbushPirate(sx, sz, 'Black Siren');
    this.ambushActive = true;
    this.state.negotiation = null;
    this.hooks.notify('quest', 'PIRATE AMBUSH!',
      'Black sail sighted! The Black Siren bears down on the Hummingbird with cannons run out. Sink her, board her… or pray you have something to bargain with.');
    this.hooks.music(0.9);
    this.hooks.sound('cannon');
  }

  /** Event resolution watch: victory (pirates cleared) cleans the state. */
  private watchEvent(ship: Ship | null): void {
    if (!this.brain) return;
    const gone = this.naval.isBrainGone(this.brain);
    const boardedAndCleared =
      this.brain.questBoarded && !this.naval.boardingActive;
    if (gone || boardedAndCleared) {
      // Victory: sunk or boarded — no negotiation needed
      if (!gone && boardedAndCleared) {
        // The boarding flow already sank her (finishBoardingSuccess)
      }
      this.endEvent(true);
    } else if (ship) {
      // Pirates lose track if the player docks for very long
      const d = Math.hypot(this.brain.ship.pos.x - ship.pos.x, this.brain.ship.pos.z - ship.pos.z);
      if (d > 460) {
        this.hooks.notify('info', 'The pirates lose your trail',
          'The Black Siren falls behind, cursing in the mist.');
        this.naval.fleeAmbushPirate(this.brain);
        this.endEvent(false);
      }
    }
  }

  private endEvent(victory: boolean): void {
    this.ambushActive = false;
    this.brain = null;
    this.state.negotiation = null;
    this.sailTimer = 0;
    this.nextCheckAt = 300 + Math.floor(Math.random() * 60);
    this.rollCount = 0;
    if (victory) {
      this.hooks.music(0.5);
      // Fase 22 — THE FORGE: the fleet's working steel rides the flotsam.
      // Pirates carry sea iron as ballast; the rest is what they wore.
      const got: string[] = [];
      if (Math.random() < 0.6) {
        this.gameState.addItem('machete_oxidado', 1);
        got.push('Rusted Boarding Machete');
      }
      if (Math.random() < 0.45) {
        this.gameState.addItem('harapos', 1);
        got.push("High-Seas Sailor's Rags");
      }
      const ingots = 1 + Math.floor(Math.random() * 2);
      this.gameState.addItem('ingote_hierro_mar', ingots);
      got.push(`sea iron ×${ingots}`);
      this.hooks.notify('item', 'From the wreck',
        `Flotsam for the satchel: ${got.join(', ')}. The smiths pay for the iron; the forge can work it.`);
    }
  }

  // -------------------------------------------------------- negotiation

  /** Game calls this when the PLAYER DIES. True if the negotiation opened. */
  notifyPlayerDeath(): boolean {
    if (!this.ambushActive || this.state.negotiation) return false;
    this.beginNegotiation('death');
    return true;
  }

  /** Game calls this when the PLAYER'S SHIP starts sinking. True if it opened. */
  notifyShipSinking(): boolean {
    if (!this.ambushActive || this.state.negotiation) return false;
    this.beginNegotiation('ship');
    return true;
  }

  private beginNegotiation(reason: 'death' | 'ship'): void {
    this.state.negotiation = reason;
    const inv = this.gameState.inventory;
    let hasItems = false;
    for (const [id, count] of inv) {
      if (count > 0 && this.eligibleForToll(id)) { hasItems = true; break; }
    }
    const canAfford = this.gameState.hasItem('coin', PIRATE_TOLL_COINS);
    this.hooks.sound('grapple');
    this.hooks.music(0.45);
    this.hooks.negotiation({
      reason,
      coins: PIRATE_TOLL_COINS,
      canAfford,
      hasItems,
    });
  }

  /**
   * Quest-critical items can never be taken by pirates: keys, readables and
   * the currently equipped weapon stay with the player.
   */
  private eligibleForToll(id: string): boolean {
    if (id === 'coin') return false; // option B covers gold
    const def = ITEMS[id];
    if (!def) return false;
    if (def.kind === 'key' || def.kind === 'readable') return false;
    if (id === this.gameState.equippedWeapon) return false;
    return true;
  }

  /** The UI picked an option ('item' = A, 'coins' = B, 'mercy' = free pass). */
  resolve(option: 'item' | 'coins' | 'mercy'): void {
    if (!this.ambushActive) return;
    if (option === 'item') {
      // Pick ONE random eligible item and hand it over
      const pool: string[] = [];
      for (const [id, count] of this.gameState.inventory) {
        if (count > 0 && this.eligibleForToll(id)) pool.push(id);
      }
      if (pool.length === 0) {
        this.resolve('mercy');
        return;
      }
      const picked = pool[Math.floor(Math.random() * pool.length)];
      this.gameState.removeItem(picked, 1);
      const name = ITEMS[picked]?.name ?? picked;
      this.hooks.notify('quest', 'Deal accepted: the loot',
        `The pirates take your ${name}. "Quarrel settled," growls the captain from the gunwale.`);
    } else if (option === 'coins') {
      this.gameState.removeItem('coin', PIRATE_TOLL_COINS);
      this.hooks.notify('quest', 'Deal accepted: the gold',
        `${PIRATE_TOLL_COINS} coins change hands. The Black Siren comes about and lets you live.`);
    } else {
      this.hooks.notify('quest', 'The pirates mock your poverty',
        '"No gold, no goods… what a beggar of the sea!" They let you live out of pure pity.');
    }
    this.hooks.negotiation(null);
    if (this.brain) this.naval.fleeAmbushPirate(this.brain);
    this.gameState.setFlag('ambush_survived');
    this.endEvent(false);
  }

  /** For the UI: is a negotiation currently on? */
  get pendingNegotiation(): 'death' | 'ship' | null {
    return this.state.negotiation;
  }

  /** Debug/E2E: force the next check to fire on the next update tick. */
  debugForceNextCheck(): void {
    this.nextCheckAt = this.sailTimer + 0.1;
    // and rig the dice: the spawn still needs deep water + the 20% roll,
    // so E2E drives spawnAmbush through the naval API directly instead.
  }
}
