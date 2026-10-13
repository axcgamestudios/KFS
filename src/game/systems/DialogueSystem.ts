import { DIALOGUES, type DialogueTree, type DialogueActionSingle } from '../data/dialogues';
import type { GameState } from './GameState';
import { useGameStore } from '../../store/gameStore';

/**
 * Runs dialogue trees: picks the first tree matching the world state,
 * streams nodes to the UI store and applies actions on choices.
 */
export class DialogueSystem {
  private current: { npcId: string; name: string; tree: DialogueTree; nodeId: string } | null = null;

  constructor(private state: GameState) {}

  get isActive(): boolean {
    return this.current !== null;
  }

  /** Find the first tree whose conditions match. */
  private pickTree(npcId: string): DialogueTree | null {
    const def = DIALOGUES[npcId];
    if (!def) return null;
    for (const tree of def.trees) {
      if (tree.cond && !this.state.hasFlag(tree.cond)) continue;
      if (tree.notCond && this.state.hasFlag(tree.notCond)) continue;
      if (tree.requireItem && !this.state.hasItem(tree.requireItem.id, tree.requireItem.count)) continue;
      // Fase 16 — level-gated trees (the smiths)
      if (tree.minLevel !== undefined && this.state.level < tree.minLevel) continue;
      if (tree.maxLevel !== undefined && this.state.level > tree.maxLevel) continue;
      return tree;
    }
    return null;
  }

  start(npcId: string): boolean {
    const tree = this.pickTree(npcId);
    const def = DIALOGUES[npcId];
    if (!tree || !def) return false;
    this.current = { npcId, name: def.name, tree, nodeId: tree.start };
    this.pushNode();
    return true;
  }

  /** Start a narrator-style lore interaction. */
  startLore(title: string, paragraphs: string[]): void {
    // Lore uses the dialogue UI with a single “continue” option.
    let idx = 0;
    const show = () => {
      useGameStore.getState().setDialogue({
        npcName: title,
        text: paragraphs[idx],
        isNarrator: true,
        options: [
          idx < paragraphs.length - 1
            ? { text: 'Keep reading…', index: 0 }
            : { text: 'Look away', index: 0 },
        ],
      });
    };
    show();
    this.loreAdvance = () => {
      idx++;
      if (idx >= paragraphs.length) {
        this.close();
      } else {
        show();
      }
    };
  }

  private loreAdvance: (() => void) | null = null;

  /** UI picked option at index. */
  choose(optionIndex: number): void {
    if (this.loreAdvance) {
      this.loreAdvance();
      return;
    }
    if (!this.current) return;
    const node = this.current.tree.nodes[this.current.nodeId];
    if (!node) {
      this.close();
      return;
    }
    const option = node.options[optionIndex];
    if (!option) {
      this.close();
      return;
    }
    const actions: DialogueActionSingle[] = Array.isArray(option.action)
      ? option.action
      : option.action
        ? [option.action]
        : [];
    let close = false;
    for (const a of actions) {
      switch (a.t) {
        case 'flag': this.state.setFlag(a.flag); break;
        case 'item': this.state.addItem(a.id, a.count); break;
        case 'takeItem':
          if (this.state.removeItem(a.id, a.count)) {
            // Record collection history so collect-objectives resolve even if
            // items were handed in before the quest formally started.
            this.state.setFlag(`collected_${a.id}`);
          }
          break;
        case 'quest': this.state.startQuest(a.id); break;
        case 'xp': this.state.giveXp(a.amount); break;
        case 'talk': this.state.talkMilestone(a.target); break;
        case 'shop':
          // Fase 16 — hand over to the merchant panel
          useGameStore.getState().setShop({ vendor: a.vendor });
          close = true;
          break;
        case 'close': close = true; break;
      }
    }
    if (close || !option.next) {
      this.close();
    } else {
      this.current.nodeId = option.next;
      this.pushNode();
    }
  }

  private pushNode(): void {
    if (!this.current) return;
    const node = this.current.tree.nodes[this.current.nodeId];
    if (!node) {
      this.close();
      return;
    }
    // Fase 15 — options with unmet `requires` (sea-trade goods, forge
    // materials) are hidden, but the ORIGINAL index is preserved so
    // choose() still resolves against the unfiltered node.options.
    const visible = node.options
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => !o.requires || o.requires.every((r) => this.state.hasItem(r.id, r.count)));
    useGameStore.getState().setDialogue({
      npcName: this.current.name,
      text: node.text,
      options: visible.map(({ o, i }) => ({
        text: o.text,
        index: i,
      })),
    });
  }

  close(): void {
    this.current = null;
    this.loreAdvance = null;
    useGameStore.getState().setDialogue(null);
  }
}
