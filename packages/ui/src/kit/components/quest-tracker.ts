import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
import { uiButton } from './button.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiIcon } from './media.js';
export interface UiQuestTrackerEntry {
  readonly id: string; readonly title: string; readonly complete: boolean; readonly objectives: readonly string[];
}
export const UI_QUEST_TRACKER_METRICS = Object.freeze({ width: 170, header: 16, line: 10, gap: 2, padding: 2, rowPadding: 6 });
export function uiQuestTrackerEntryHeight(entry: UiQuestTrackerEntry): number {
  return (1 + Math.max(1, entry.objectives.length)) * UI_QUEST_TRACKER_METRICS.line + UI_QUEST_TRACKER_METRICS.rowPadding * 2;
}
export function uiQuestTrackerHeight(entries: readonly UiQuestTrackerEntry[], collapsed: boolean): number {
  const m = UI_QUEST_TRACKER_METRICS;
  return collapsed ? m.header : m.header + m.padding + entries.reduce((height, entry) => height + uiQuestTrackerEntryHeight(entry) + m.gap, 0);
}
export interface UiQuestTrackerOptions {
  readonly entries: readonly UiQuestTrackerEntry[]; readonly collapsed?: boolean;
  readonly onToggle?: () => void; readonly onOpenQuest?: (id: string) => void; readonly layout?: UiStyle;
}
/** The host persists position/collapse and owns quest authority. Rows are the
 * same clipped, focusable composition in the live HUD and migration gallery. */
export function uiQuestTracker(options: UiQuestTrackerOptions): UiElement {
  const header = uiButton({ id: 'quest-tracker.header', label: 'QUESTS', size: 'sm', tone: 'primary',
    leading: uiIcon({ lucide: options.collapsed ? 'chevronRight' : 'chevronDown' }), onPress: options.onToggle,
    layout: { width: 'grow', height: uiFixed(UI_QUEST_TRACKER_METRICS.header), shrink: 0 },
  });
  return uiFlex({ width: uiFixed(UI_QUEST_TRACKER_METRICS.width), height: uiFixed(uiQuestTrackerHeight(options.entries, options.collapsed ?? false)),
    gap: 2, padding: options.collapsed ? 0 : { left: 2, right: 2, bottom: 2 }, ...options.layout }, [header,
    ...(!options.collapsed ? [uiScrollArea({ width: 'grow', height: 'grow', gap: 2 }, options.entries.map(entry => uiButton({
      id: `quest-tracker.quest.${entry.id}`, label: '', ariaLabel: entry.title, tone: entry.complete ? 'success' : 'primary',
      onPress: () => options.onOpenQuest?.(entry.id),
      layout: { width: 'grow', height: uiFixed(uiQuestTrackerEntryHeight(entry)), padding: 6, shrink: 0 },
      children: [uiFlex({ width: 'grow', height: 'grow' }, [uiText(entry.title.toUpperCase(), { overflow: 'ellipsis' }),
        ...(entry.objectives.length ? entry.objectives : ['No objectives']).map(text => uiText(text, { overflow: 'ellipsis' })),
      ])],
    })))] : []),
  ]);
}
