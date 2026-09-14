import type { UiRect } from './geometry.js';

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

