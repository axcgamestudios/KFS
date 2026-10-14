import { QUESTS, MAIN_QUEST_ORDER, SIDE_QUESTS } from '../data/quests';
import { ITEMS } from '../data/items';

/** Skill definitions — every skill has a REAL mechanical effect. */
export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  tree: 'combate' | 'supervivencia' | 'navegacion';
  requires?: string[];
  locked?: boolean;
}

export const SKILLS: SkillDef[] = [
  { id: 'comb_vigor', name: 'Endurance I', desc: 'Maximum stamina +20.', tree: 'combate' },
  { id: 'comb_vigor2', name: 'Endurance II', desc: 'Maximum stamina +20 more.', tree: 'combate', requires: ['comb_vigor'] },
  { id: 'comb_piel', name: 'Iron Skin', desc: 'Maximum health +20.', tree: 'combate' },
  { id: 'comb_aliento', name: 'Second Wind', desc: 'You recover stamina 40% faster.', tree: 'combate', requires: ['comb_vigor'] },
  { id: 'comb_maestria', name: 'Mastery of Steel', desc: 'Melee damage +15%.', tree: 'combate', requires: ['comb_piel'] },
  { id: 'comb_punteria', name: 'Archer’s Eye', desc: 'Bow damage +30% and faster drawing.', tree: 'combate', requires: ['comb_aliento'] },
  { id: 'sup_botanico', name: 'Botanist', desc: 'Every ivory petal picked counts double.', tree: 'supervivencia' },
  { id: 'sup_zancada', name: 'Explorer’s Stride', desc: 'Walking and sprinting speed +8%.', tree: 'supervivencia' },
  { id: 'sup_corazon', name: 'Heart of Oak', desc: 'Maximum health +25 and slow, constant regeneration.', tree: 'supervivencia' },
  { id: 'nav_marino', name: 'Seamanship', desc: 'The Sea Hummingbird’s top speed +20%.', tree: 'navegacion', locked: true },
  { id: 'nav_viento', name: 'Fair Winds', desc: 'Headwinds barely slow your ship.', tree: 'navegacion', locked: true, requires: ['nav_marino'] },
  { id: 'nav_bordo', name: 'Broadside Fire', desc: 'Cannons reload 35% faster.', tree: 'navegacion', locked: true, requires: ['nav_marino'] },
];

export type QuestStatus = 'active' | 'completed';

export interface JournalEntry {
  id: string;
  kind: 'quest' | 'discovery' | 'story';
  title: string;
  text: string;
}

export type GameStateEvent =
  | 'inventory' | 'flags' | 'quests' | 'progression' | 'journal' | 'equipped';

export const xpForLevel = (level: number): number => 100 + (level - 1) * 60;

/**
 * Authoritative game state: flags, inventory, quests, XP, skills, journal.
 * Everything serializable lives here; the UI mirrors it via events.
 */
export class GameState {
  flags = new Set<string>();
  inventory = new Map<string, number>();
  equippedWeapon: string | null = null;
  xp = 0;
  level = 1;
  skillPoints = 0;
  learnedSkills = new Set<string>();
  questStates = new Map<string, { status: QuestStatus; objectives: Set<string> }>();
  journal: JournalEntry[] = [];
  discoveredPOIs = new Set<string>();
  openedChests = new Set<string>();
  pickedHerbs = new Set<string>();
  exploredMap: boolean[] = [];
  playtimeSeconds = 0;
  /** Fase 10 — Bram's forge upgrades for the equipped sword (0–3).
   *  Applies a damage multiplier + blade glow to ANY sword carried. */
  swordTier = 0;
  private evaluatingQuests = false;

  onChange?: (e: GameStateEvent) => void;

  private emit(e: GameStateEvent): void {
    this.onChange?.(e);
  }

  // ---------------- Inventory ----------------

  /** Fase 12 — combat kill counters for bounty/hunt objectives. */
  killCounters: Record<string, number> = {};
  registerKill(kind: string): void {
    this.killCounters[kind] = (this.killCounters[kind] ?? 0) + 1;
    this.emit('quests');
    this.evaluateQuests();
  }

  /** Fase 12 — ambush hook: fires when the player gains an item (Game wires
   *  surprise bandit attacks on collection objectives). */
  onItemGained?: (id: string, count: number) => void;

  addItem(id: string, count = 1): void {
    this.inventory.set(id, (this.inventory.get(id) ?? 0) + count);
    this.emit('inventory');
    this.onItemGained?.(id, count);
    // Live objective check so collect goals tick as items arrive
    this.evaluateQuests();
  }

  removeItem(id: string, count = 1): boolean {
    const have = this.inventory.get(id) ?? 0;
    if (have < count) return false;
    if (have - count <= 0) this.inventory.delete(id);
    else this.inventory.set(id, have - count);
    this.emit('inventory');
    return true;
  }

  countItem(id: string): number {
    return this.inventory.get(id) ?? 0;
  }

  hasItem(id: string, count = 1): boolean {
    return this.countItem(id) >= count;
  }

  equip(id: string): void {
    if (!ITEMS[id]?.equipable) return;
    // Fase 22 — THE FORGE level gate: gear from the forge bands requires its
    // level (Common 1, Rare 11, Epic 26, Legendary 30). Legacy items have no
    // level and pass untouched.
    const req = ITEMS[id].level ?? 0;
    if (req > 0 && this.level < req) return;
    // Fase 16 — route by item kind: weapons keep the classic slot, armor and
    // wings get their own (a cuero chest does not replace your sword).
    const kind = ITEMS[id]?.kind;
    if (kind === 'armor') {
      this.equippedArmor = id;
    } else if (kind === 'wings') {
      this.equippedWings = id;
    } else {
      this.equippedWeapon = id;
    }
    this.emit('equipped');
  }

  unequip(): void {
    this.equippedWeapon = null;
    this.emit('equipped');
  }

  /** Fase 16 — dedicated armor/wings slots (null = bare chest / no wings). */
  equippedArmor: string | null = null;
  equippedWings: string | null = null;

  unequipArmor(): void {
    this.equippedArmor = null;
    this.emit('equipped');
  }

  unequipWings(): void {
    this.equippedWings = null;
    this.emit('equipped');
  }

  // ---------------- Flags ----------------

  setFlag(flag: string): void {
    if (this.flags.has(flag)) return;
    this.flags.add(flag);
    this.emit('flags');
    this.evaluateQuests();
  }

  hasFlag(flag: string): boolean {
    return this.flags.has(flag);
  }

  // ---------------- XP / levels / skills ----------------

  giveXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      this.skillPoints++;
    }
    this.emit('progression');
  }

  canLearn(skillId: string): boolean {
    const def = SKILLS.find((s) => s.id === skillId);
    if (!def) return false;
    // Navigation skills unlock with the story: once the Colibrí is repaired
    if (def.locked && !this.hasFlag('ship_repaired')) return false;
    if (this.learnedSkills.has(skillId)) return false;
    if (this.skillPoints < 1) return false;
    if (def.requires?.some((r) => !this.learnedSkills.has(r))) return false;
    return true;
  }

  learnSkill(skillId: string): boolean {
    if (!this.canLearn(skillId)) return false;
    this.learnedSkills.add(skillId);
    this.skillPoints--;
    this.emit('progression');
    return true;
  }

  // ---------------- Quests ----------------

  startQuest(id: string): boolean {
    if (!QUESTS[id] || this.questStates.has(id)) return false;
    this.questStates.set(id, { status: 'active', objectives: new Set() });
    this.addJournal({
      id: `quest_${id}`,
      kind: 'quest',
      title: QUESTS[id].title,
      text: QUESTS[id].journal,
    });
    this.evaluateQuests();
    this.emit('quests');
    return true;
  }

  isQuestActive(id: string): boolean {
    return this.questStates.get(id)?.status === 'active';
  }

  isQuestCompleted(id: string): boolean {
    return this.questStates.get(id)?.status === 'completed';
  }

  /** Resolve 'talk' milestones coming from dialogues. */
  talkMilestone(target: string): void {
    // Fase 4: remember the milestone — quests started LATER can still
    // resolve out-of-order talk objectives (same pattern as collect).
    if (!this.flags.has(`talked_${target}`)) {
      this.flags.add(`talked_${target}`);
    }
    this.evaluateQuests(target);
  }

  /** Resolve 'interact' milestones (chests, crates, …). */
  interactMilestone(target: string): void {
    if (!this.flags.has(`interacted_${target}`)) {
      this.flags.add(`interacted_${target}`);
    }
    this.evaluateQuests(undefined, target);
  }

  /** Check all active quests' objectives & complete quests when done. */
  evaluateQuests(talkTarget?: string, interactTarget?: string): void {
    if (this.evaluatingQuests) return; // reentrancy guard (rewards add items)
    this.evaluatingQuests = true;
    try {
      for (const [questId, state] of this.questStates) {
      if (state.status !== 'active') continue;
      const def = QUESTS[questId];
      if (!def) continue;
      for (const obj of def.objectives) {
        if (state.objectives.has(obj.id)) continue;
        let done = false;
        switch (obj.type) {
          case 'talk':
            done =
              (talkTarget !== undefined && talkTarget === obj.target) ||
              this.flags.has(`talked_${obj.target}`) ||
              (obj.target === 'aldric' && this.flags.has('talked_aldric')) ||
              (obj.target === 'maren' && this.flags.has('maren_met')) ||
              (obj.target === 'aldric_ship' && this.flags.has('aldric_ship_talked')) ||
              (obj.target === 'rosa_return' && this.flags.has('rosa_return_talked')) ||
              (obj.target === 'aldric_dragons' && this.flags.has('aldric_dragons_talked')) ||
              (obj.target === 'aldric_report' && this.flags.has('aldric_report_talked'));
            break;
          case 'collect':
            done =
              this.countItem(obj.target) >= (obj.count ?? 1) ||
              this.flags.has(`collected_${obj.target}`);
            break;
          case 'interact':
            done =
              (interactTarget !== undefined && interactTarget === obj.target) ||
              this.flags.has(`interacted_${obj.target}`) ||
              (obj.target === 'chest_eirik' && this.flags.has('chest_opened')) ||
              (obj.target === 'crate_rosa' && this.flags.has('rosa_crate_found'));
            break;
          case 'flag':
            done = this.flags.has(obj.target);
            break;
          case 'kill':
            done = (this.killCounters[obj.target] ?? 0) >= (obj.count ?? 1);
            break;
        }
        if (done) state.objectives.add(obj.id);
      }
      // All objectives complete → complete the quest
      if (def.objectives.every((o) => state.objectives.has(o.id))) {
        state.status = 'completed';
        // Turn-in items for q2 (petals are consumed by Maren dialogue, safety net)
        if (questId === 'q2_herbs') {
          if (this.countItem('petalo') > 0) this.removeItem('petalo', this.countItem('petalo'));
        }
        this.giveXp(def.rewards.xp);
        def.rewards.items?.forEach((it) => this.addItem(it.id, it.count));
        if (def.completionJournal) {
          this.addJournal({
            id: `quest_done_${questId}`,
            kind: 'story',
            title: `${def.title} — Completed`,
            text: def.completionJournal,
          });
        }
        if (def.nextQuest) {
          const next = def.nextQuest;
          setTimeout(() => this.startQuest(next), 50);
        }
      }
    }
    } finally {
      this.evaluatingQuests = false;
    }
    this.emit('quests');
  }

  /** Current main-quest tracker info for the HUD. */
  currentTracker(): { title: string; objectives: Array<{ text: string; done: boolean }> } | null {
    for (const qid of [...MAIN_QUEST_ORDER, ...SIDE_QUESTS]) {
      const st = this.questStates.get(qid);
      if (st?.status === 'active') {
        const def = QUESTS[qid];
        return {
          title: def.title,
          objectives: def.objectives.map((o) => {
            const done = st.objectives.has(o.id);
            let text = o.text;
            if (o.type === 'collect') {
              const have = Math.min(this.countItem(o.target), o.count ?? 1);
              text = o.text.replace(/\(\d+\/\d+\)/, `(${have}/${o.count ?? 1})`);
            }
            return { text, done };
          }),
        };
      }
    }
    return null;
  }

  // ---------------- Journal ----------------

  addJournal(entry: JournalEntry): void {
    if (this.journal.some((e) => e.id === entry.id)) return;
    this.journal.unshift(entry);
    this.emit('journal');
  }

  // ---------------- Serialization ----------------

  serialize() {
    return {
      flags: [...this.flags],
      inventory: [...this.inventory.entries()],
      equippedWeapon: this.equippedWeapon,
      // Fase 16 — the smith's armor & wings survive saves/loads
      equippedArmor: this.equippedArmor,
      equippedWings: this.equippedWings,
      swordTier: this.swordTier,
      xp: this.xp,
      level: this.level,
      skillPoints: this.skillPoints,
      learnedSkills: [...this.learnedSkills],
      questStates: [...this.questStates.entries()].map(([id, s]) => ({
        id, status: s.status, objectives: [...s.objectives],
      })),
      journal: this.journal,
      discoveredPOIs: [...this.discoveredPOIs],
      openedChests: [...this.openedChests],
      pickedHerbs: [...this.pickedHerbs],
      exploredMap: this.exploredMap,
      playtimeSeconds: Math.floor(this.playtimeSeconds),
    };
  }

  deserialize(data: ReturnType<GameState['serialize']>): void {
    this.flags = new Set(data.flags);
    this.inventory = new Map(data.inventory);
    this.equippedWeapon = data.equippedWeapon;
    this.equippedArmor = (data as { equippedArmor?: string | null }).equippedArmor ?? null;
    this.equippedWings = (data as { equippedWings?: string | null }).equippedWings ?? null;
    this.swordTier = data.swordTier ?? 0;
    this.xp = data.xp;
    this.level = data.level;
    this.skillPoints = data.skillPoints;
    this.learnedSkills = new Set(data.learnedSkills);
    this.questStates = new Map(
      data.questStates.map((q) => [q.id, { status: q.status, objectives: new Set(q.objectives) }]),
    );
    this.journal = data.journal ?? [];
    this.discoveredPOIs = new Set(data.discoveredPOIs);
    this.openedChests = new Set(data.openedChests);
    this.pickedHerbs = new Set(data.pickedHerbs);
    this.exploredMap = data.exploredMap ?? [];
    this.playtimeSeconds = data.playtimeSeconds ?? 0;
    this.emit('inventory');
    this.emit('quests');
    this.emit('progression');
    this.emit('journal');
  }

  resetForNewGame(): void {
    this.flags.clear();
    this.inventory.clear();
    this.equippedWeapon = null;
    this.equippedArmor = null;
    this.equippedWings = null;
    this.swordTier = 0;
    this.xp = 0;
    this.level = 1;
    this.skillPoints = 0;
    this.learnedSkills.clear();
    this.questStates.clear();
    this.journal = [];
    this.discoveredPOIs.clear();
    this.openedChests.clear();
    this.pickedHerbs.clear();
    this.exploredMap = new Array(128 * 128).fill(false);
    this.playtimeSeconds = 0;
    this.emit('inventory');
    this.emit('quests');
    this.emit('progression');
    this.emit('journal');
  }
}
