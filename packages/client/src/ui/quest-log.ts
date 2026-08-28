import { drawPixelText, type PixelUi } from '../render/pixel-ui.js';
import { drawButton } from './button.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { ScrollBar } from './scrollbar.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

const QUEST_ROW_HEIGHT = 18;
const CONTENT_TOP = 34;
const BUTTON_HEIGHT = 22;

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

export interface QuestLogLayout {
  readonly list: UiRect;
  readonly listScroll: UiRect;
  readonly details: UiRect;
  readonly pinButton: UiRect;
  readonly dropButton: UiRect;
  readonly visibleRows: number;
}

export function questLogLayout(frame: UiRect): QuestLogLayout {
  const contentBottom = frame.y + frame.height - 42;
  const listWidth = Math.min(154, Math.max(112, Math.floor(frame.width * 0.34)));
  const list = {
    x: frame.x + 17,
    y: frame.y + CONTENT_TOP,
    width: listWidth,
    height: Math.max(72, contentBottom - (frame.y + CONTENT_TOP)),
  };
  const details = {
    x: list.x + list.width + 12,
    y: list.y,
    width: Math.max(140, frame.x + frame.width - 17 - (list.x + list.width + 12)),
    height: list.height,
  };
  const actionWidth = Math.min(104, Math.max(78, Math.floor((details.width - 8) / 2)));
  return {
    list,
    listScroll: { x: list.x + list.width - 14, y: list.y + 4, width: 12, height: list.height - 8 },
    details,
    pinButton: { x: details.x, y: frame.y + frame.height - 34, width: actionWidth, height: BUTTON_HEIGHT },
    dropButton: {
      x: details.x + details.width - actionWidth,
      y: frame.y + frame.height - 34,
      width: actionWidth,
      height: BUTTON_HEIGHT,
    },
    visibleRows: Math.max(1, Math.floor((list.height - 8) / QUEST_ROW_HEIGHT)),
  };
}

export function wrapQuestText(text: string, maximumCharacters: number): readonly string[] {
  const width = Math.max(1, Math.floor(maximumCharacters));
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > width) {
      if (line) { lines.push(line); line = ''; }
      for (let offset = 0; offset < word.length; offset += width) lines.push(word.slice(offset, offset + width));
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= width) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Two-pane, WoW-style quest log: quest list on the left, selected quest
 * details on the right, with server-owned tracking and abandonment actions. */
export class QuestLog {
  private entries: readonly QuestLogEntry[] = [];
  private selectedId: string | null = null;
  private readonly scrollBar: ScrollBar;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly callbacks: QuestLogCallbacks,
  ) {
    this.scrollBar = new ScrollBar(skin);
  }

  update(entries: readonly QuestLogEntry[]): void {
    this.entries = entries;
    if (this.selectedId === null || !entries.some((entry) => entry.id === this.selectedId)) {
      this.selectedId = entries[0]?.id ?? null;
    }
  }

  pointerMove(point: UiPoint, frame: UiRect): void {
    const layout = questLogLayout(frame);
    this.syncScroll(layout);
    this.scrollBar.pointerMove(point);
  }

  pointerDown(point: UiPoint, button: number, frame: UiRect): boolean {
    if (button !== 0) return containsPoint(frame, point);
    const layout = questLogLayout(frame);
    this.syncScroll(layout);
    if (this.scrollBar.pointerDown(point)) return true;
    const visible = this.visibleEntries(layout);
    if (containsPoint(layout.list, point)) {
      const index = Math.floor((point.y - layout.list.y - 4) / QUEST_ROW_HEIGHT);
      const entry = visible[index];
      if (entry !== undefined) this.selectedId = entry.id;
      return true;
    }
    const selected = this.selectedEntry();
    if (selected !== null && containsPoint(layout.pinButton, point)) {
      this.callbacks.setPinned(selected.id, !selected.pinned);
      return true;
    }
    if (selected !== null && containsPoint(layout.dropButton, point)) {
      this.callbacks.drop(selected.id);
      return true;
    }
    return containsPoint(frame, point);
  }

  pointerUp(): boolean { return this.scrollBar.pointerUp(); }
  pointerLeave(): void { this.scrollBar.pointerLeave(); }

  wheel(point: UiPoint, deltaY: number, frame: UiRect): boolean {
    const layout = questLogLayout(frame);
    this.syncScroll(layout);
    return containsPoint(layout.list, point) && this.scrollBar.wheel(deltaY, 1);
  }

  handleKeyDown(code: string, frame: UiRect): boolean {
    const layout = questLogLayout(frame);
    this.syncScroll(layout);
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      if (this.entries.length === 0) return true;
      const current = Math.max(0, this.entries.findIndex((entry) => entry.id === this.selectedId));
      const next = Math.max(0, Math.min(this.entries.length - 1, current + (code === 'ArrowUp' ? -1 : 1)));
      this.selectedId = this.entries[next]!.id;
      if (next < this.scrollBar.position) this.scrollBar.scrollBy(next - this.scrollBar.position);
      else if (next >= this.scrollBar.position + layout.visibleRows) {
        this.scrollBar.scrollBy(next - (this.scrollBar.position + layout.visibleRows) + 1);
      }
      return true;
    }
    return this.scrollBar.handleKey(code);
  }

  draw(context: CanvasRenderingContext2D, frame: UiRect): void {
    const layout = questLogLayout(frame);
    this.syncScroll(layout);
    drawUiSkinAsset(context, this.skin.frameThin, layout.list);
    drawUiSkinAsset(context, this.skin.frameThin, layout.details);
    const visible = this.visibleEntries(layout);
    visible.forEach((entry, index) => {
      const row = {
        x: layout.list.x + 4,
        y: layout.list.y + 4 + index * QUEST_ROW_HEIGHT,
        width: layout.list.width - 20,
        height: QUEST_ROW_HEIGHT - 2,
      };
      if (entry.id === this.selectedId) {
        context.save();
        context.globalAlpha = 0.28;
        context.fillStyle = '#4f8f42';
        context.fillRect(row.x, row.y, row.width, row.height);
        context.restore();
      }
      drawPixelText(context, this.fonts, entry.state === 'complete' ? '!' : entry.pinned ? '*' : '-', row.x + 2, row.y + 4, {
        color: entry.state === 'complete' ? '#9b731c' : '#6b4428',
      });
      drawPixelText(context, this.fonts, entry.title.slice(0, Math.max(1, Math.floor((row.width - 15) / 6))), row.x + 12, row.y + 4, {
        color: '#4d2e22',
      });
    });
    this.scrollBar.draw(context);

    const selected = this.selectedEntry();
    if (selected === null) {
      drawPixelText(context, this.fonts, 'NO ACTIVE QUESTS', layout.details.x + layout.details.width / 2,
        layout.details.y + 18, { align: 'center', color: '#6b4428' });
      return;
    }
    const textX = layout.details.x + 8;
    const maximumCharacters = Math.max(10, Math.floor((layout.details.width - 16) / 6));
    let y = layout.details.y + 8;
    drawPixelText(context, this.fonts, selected.title.toUpperCase(), textX, y, { color: '#4d2e22' });
    y += 14;
    drawPixelText(context, this.fonts, selected.state === 'complete' ? 'READY TO TURN IN' : 'IN PROGRESS', textX, y, {
      color: selected.state === 'complete' ? '#9b731c' : '#4f7137',
    });
    y += 14;
    for (const line of wrapQuestText(selected.summary, maximumCharacters)) {
      drawPixelText(context, this.fonts, line, textX, y, { color: '#6b4428' });
      y += 9;
    }
    y += 5;
    drawPixelText(context, this.fonts, 'OBJECTIVES', textX, y, { color: '#4d2e22' });
    y += 11;
    for (const objective of selected.objectives) {
      const prefix = objective.complete ? '[X] ' : '[ ] ';
      const lines = wrapQuestText(`${prefix}${objective.progress ? `${objective.progress} ` : ''}${objective.label}`, maximumCharacters);
      for (const line of lines) {
        drawPixelText(context, this.fonts, line, textX, y, {
          color: objective.complete ? '#8a713a' : '#6b4428',
        });
        y += 9;
      }
    }
    if (selected.rewards.length > 0 && y < layout.details.y + layout.details.height - 28) {
      y += 4;
      drawPixelText(context, this.fonts, 'REWARDS', textX, y, { color: '#4d2e22' });
      y += 10;
      for (const reward of selected.rewards.slice(0, 3)) {
        drawPixelText(context, this.fonts, `- ${reward}`.slice(0, maximumCharacters), textX, y, { color: '#8a5f2d' });
        y += 9;
      }
    }
    drawButton(context, this.skin, this.fonts, layout.pinButton, {
      label: selected.pinned ? 'UNTRACK' : 'TRACK',
      tone: selected.pinned ? 'success' : 'neutral',
    });
    drawButton(context, this.skin, this.fonts, layout.dropButton, {
      label: 'DROP QUEST', tone: 'danger',
    });
  }

  private selectedEntry(): QuestLogEntry | null {
    return this.entries.find((entry) => entry.id === this.selectedId) ?? null;
  }

  private syncScroll(layout: QuestLogLayout): void {
    this.scrollBar.setMetrics(this.entries.length, layout.visibleRows);
    this.scrollBar.setBounds(layout.listScroll);
  }

  private visibleEntries(layout: QuestLogLayout): readonly QuestLogEntry[] {
    return this.entries.slice(this.scrollBar.position, this.scrollBar.position + layout.visibleRows);
  }
}
