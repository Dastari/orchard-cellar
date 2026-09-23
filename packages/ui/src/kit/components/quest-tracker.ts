import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
import { uiButton, type UiButtonDrag } from './button.js';
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
  readonly drag?: UiButtonDrag;
}
export interface UiQuestTrackerElement extends UiElement {
  updateQuestTracker(entries: readonly UiQuestTrackerEntry[], collapsed: boolean): void;
}
/** The host persists position/collapse and owns quest authority. Rows are the
 * same clipped, focusable composition in the live HUD and migration gallery. */
export function uiQuestTracker(options: UiQuestTrackerOptions): UiQuestTrackerElement {
  const chevron = { lucide: options.collapsed ? 'chevronRight' as const : 'chevronDown' as const };
  const header = uiButton({ id: 'quest-tracker.header', label: 'QUESTS', size: 'sm', tone: 'primary',
    leading: uiIcon(chevron), onPress: options.onToggle, drag: options.drag,
    layout: { width: 'grow', height: uiFixed(UI_QUEST_TRACKER_METRICS.header), shrink: 0 },
  });
  const list = uiScrollArea({ width: 'grow', height: 'grow', gap: 2 }, []);
  const tracker = uiFlex({ width: uiFixed(UI_QUEST_TRACKER_METRICS.width),
    height: uiFixed(uiQuestTrackerHeight(options.entries, options.collapsed ?? false)),
    gap: 2, ...options.layout }, [header, list]);
  const rows = new Map<string, { button: UiElement; content: UiElement; key: string }>();
  const updateQuestTracker = (entries: readonly UiQuestTrackerEntry[], collapsed: boolean): void => {
    const ids = new Set(entries.map(entry => entry.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.button.dispose(); rows.delete(id); }
    for (const entry of entries) {
      let row = rows.get(entry.id);
      if (!row) {
        const content = uiFlex({ width: 'grow', height: 'grow' }, []);
        const id = entry.id;
        const button = uiButton({ id: `quest-tracker.quest.${id}`, label: '', ariaLabel: entry.title,
          onPress: () => { if (rows.has(id)) options.onOpenQuest?.(id); },
          layout: { width: 'grow', padding: 6, shrink: 0 }, children: [content] });
        row = { button, content, key: '' }; rows.set(id, row);
      }
      const key = JSON.stringify([entry.title, entry.complete, entry.objectives]);
      if (row.key !== key) {
        row.key = key;
        row.button.label = entry.title;
        row.button.setProps({ tone: entry.complete ? 'success' : 'primary' })
          .setStyle({ height: uiFixed(uiQuestTrackerEntryHeight(entry)) });
        for (const child of [...row.content.children]) child.dispose();
        row.content.replaceChildren([uiText(entry.title.toUpperCase(), { overflow: 'ellipsis' }),
          ...(entry.objectives.length ? entry.objectives : ['No objectives']).map(text => uiText(text, { overflow: 'ellipsis' })),
        ]);
      }
    }
    const ordered = entries.map(entry => rows.get(entry.id)!.button);
    if (ordered.some((row, index) => list.children[index] !== row) || ordered.length !== list.children.length) {
      list.replaceChildren(ordered);
    }
    chevron.lucide = collapsed ? 'chevronRight' : 'chevronDown';
    list.setStyle({ visible: !collapsed });
    tracker.setStyle({ height: options.layout?.height ?? uiFixed(uiQuestTrackerHeight(entries, collapsed)),
      padding: options.layout?.padding ?? (collapsed ? 0 : { left: 2, right: 2, bottom: 2 }) });
  };
  updateQuestTracker(options.entries, options.collapsed ?? false);
  return Object.assign(tracker, { updateQuestTracker });
}
