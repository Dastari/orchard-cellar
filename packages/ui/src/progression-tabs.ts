import type { UiRect } from './geometry.js';

export const PROGRESSION_TABS = ['character', 'skills', 'statistics'] as const;
export type ProgressionTab = (typeof PROGRESSION_TABS)[number];

export interface ProgressionTabsLayout {
  readonly tabs: Readonly<Record<ProgressionTab, UiRect>>;
  readonly content: UiRect;
}

/** Shared geometry for the Character frame's three top-level pages. */
export function progressionTabsLayout(rect: UiRect): ProgressionTabsLayout {
  const gap = 4;
  const horizontalInset = Math.max(14, Math.min(28, Math.floor(rect.width * 0.06)));
  const availableWidth = Math.max(1, rect.width - horizontalInset * 2 - gap * 2);
  const tabWidth = Math.floor(availableWidth / PROGRESSION_TABS.length);
  const tabs = Object.fromEntries(PROGRESSION_TABS.map((tab, index) => [tab, {
    x: rect.x + horizontalInset + index * (tabWidth + gap),
    y: rect.y + 25,
    width: tabWidth,
    height: 22,
  }])) as unknown as Readonly<Record<ProgressionTab, UiRect>>;
  return {
    tabs,
    content: {
      x: rect.x + 12,
      y: rect.y + 51,
      width: Math.max(1, rect.width - 24),
      height: Math.max(1, rect.height - 66),
    },
  };
}
