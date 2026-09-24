import type { UiRect } from './geometry.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiQuestLog, type UiQuestLogElement } from './kit/components/quest-log.js';
import { uiFixed } from './kit/layout/box.js';
import { UiRoot } from './kit/runtime/root.js';

export interface QuestLogObjective {
  readonly label: string;
  readonly complete: boolean;
  readonly progress?: string;
}

export interface QuestLogEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly state: 'active' | 'complete';
  readonly pinned: boolean;
  readonly objectives: readonly QuestLogObjective[];
  readonly rewards: readonly string[];
}

export interface QuestLogCallbacks {
  readonly setPinned: (questId: string, pinned: boolean) => void;
  readonly drop: (questId: string) => void;
}

/** Production adapter. Quest state and commands remain owned by the game host. */
export class QuestLog {
  readonly root: UiRoot;
  private bounds: UiRect | undefined;
  private readonly view: UiQuestLogElement;

  constructor(art: UiKitArt, callbacks: QuestLogCallbacks, onClose?: () => void) {
    this.root = new UiRoot({ art, scale: 1, label: 'Quest log' });
    this.view = uiQuestLog({ entries: [], ...callbacks, onClose, resizable: false });
    this.root.mount(this.view);
  }

  update(entries: readonly QuestLogEntry[]): void { this.view.updateQuests(entries); }
  select(questId: string): boolean { return this.view.select(questId); }
  get selectedQuest(): string | null { return this.view.selectedQuest; }

  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void {
    this.root.resize(viewportWidth, viewportHeight);
    if (!this.bounds || this.bounds.x !== frame.x || this.bounds.y !== frame.y || this.bounds.width !== frame.width || this.bounds.height !== frame.height) {
      this.bounds = { ...frame };
      this.view.setStyle({ position: 'absolute', inset: { left: uiFixed(frame.x), top: uiFixed(frame.y) },
        width: uiFixed(frame.width), height: uiFixed(frame.height) });
    }
    this.root.arrange();
  }

  focus(): void { this.view.setStyle({ visible: true }); this.view.focusQuests(); this.root.arrange(); }
  draw(context: CanvasRenderingContext2D): void { this.root.drawInContext(context); }
  dispose(): void { this.root.dispose(); }
}
