import type { UiRect } from './geometry.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiGameBookPage, type UiGameBookChapter } from './kit/components/character-book.js';
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
  /** Who gave the quest, shown beneath its title as "From <giver>" when known. */
  readonly giver?: string;
}

export interface QuestLogCallbacks {
  readonly setPinned: (questId: string, pinned: boolean) => void;
  readonly drop: (questId: string) => void;
}

/** Outer size of the player's book for one leaf size: two leaves, spine and cover, plus the tab row. */
export function gameBookSize(page: { readonly width: number; readonly height: number }): { readonly width: number; readonly height: number } {
  return { width: page.width * 2 + 24 + 32, height: page.height + 32 + 24 };
}

/** Centre a book of the given size on the host's bounds, keeping it inside the viewport where it fits. */
export function centreGameBook(frame: UiRect, size: { readonly width: number; readonly height: number }, viewportWidth: number, viewportHeight: number): UiRect {
  const clamp = (value: number, extent: number, viewport: number) => Math.max(0, Math.min(Math.max(0, viewport - extent), value));
  return { x: clamp(Math.floor(frame.x + (frame.width - size.width) / 2), size.width, viewportWidth),
    y: clamp(Math.floor(frame.y + (frame.height - size.height) / 2), size.height, viewportHeight), ...size };
}

/** Production adapter: the Quests chapter of the player's book. Quest state and commands remain owned by the game host. */
export class QuestLog {
  readonly root: UiRoot;
  private placed: UiRect | undefined;
  private page: { readonly width: number; readonly height: number } | undefined;
  private readonly view: UiQuestLogElement;

  constructor(art: UiKitArt, callbacks: QuestLogCallbacks, onClose?: () => void, onNavigate?: (chapter: UiGameBookChapter) => void) {
    this.root = new UiRoot({ art, scale: 1, label: 'Quest log' });
    this.view = uiQuestLog({ entries: [], ...callbacks, onClose, onNavigate });
    this.root.mount(this.view);
  }

  update(entries: readonly QuestLogEntry[]): void { this.view.updateQuests(entries); }
  select(questId: string): boolean { return this.view.select(questId); }
  get selectedQuest(): string | null { return this.view.selectedQuest; }

  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void {
    this.root.resize(viewportWidth, viewportHeight);
    const page = uiGameBookPage(viewportWidth, viewportHeight);
    if (!this.page || this.page.width !== page.width || this.page.height !== page.height) { this.page = page; this.view.setBookPage(page); }
    const placed = centreGameBook(frame, gameBookSize(page), viewportWidth, viewportHeight);
    if (!this.placed || this.placed.x !== placed.x || this.placed.y !== placed.y || this.placed.width !== placed.width || this.placed.height !== placed.height) {
      this.placed = placed;
      this.view.setStyle({ position: 'absolute', inset: { left: uiFixed(placed.x), top: uiFixed(placed.y) },
        width: uiFixed(placed.width), height: uiFixed(placed.height) });
    }
    this.root.arrange();
  }

  focus(): void { this.view.setStyle({ visible: true }); this.view.focusQuests(); this.root.arrange(); }
  draw(context: CanvasRenderingContext2D): void { this.root.drawInContext(context); }
  dispose(): void { this.root.dispose(); }
}
