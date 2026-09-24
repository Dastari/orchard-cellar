import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiElement } from '../runtime/element.js';
import { uiButton, type UiButtonDrag } from './button.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { drawOutlinedPixelText, fitPixelText } from '../../pixel-ui.js';
import { paintUiSkin } from './art.js';
/** The tracker's inks: yellow text with a black outline, paler for objectives and darker once done. */
export const UI_QUEST_INK = Object.freeze({ outline: '#000000', header: '#ffe36e', title: '#ffe36e', objective: '#fff3a0', done: '#d9bd5c', lit: '#fffbe0' });
export interface UiQuestTrackerEntry {
  readonly id: string; readonly title: string; readonly complete: boolean; readonly objectives: readonly string[];
}
export const UI_QUEST_TRACKER_METRICS = Object.freeze({ width: 170, header: 16, line: 11, gap: 4, padding: 2, rowPadding: 1 });
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
 * same clipped, focusable composition in the live HUD and migration gallery.
 * Everything is yellow pixel text with a black outline straight on the world, left-aligned like the
 * classic tracker: the collapse chevron left of QUESTS, quest titles, then "- objective" lines. */
export function uiQuestTracker(options: UiQuestTrackerOptions): UiQuestTrackerElement {
  let collapsedNow = options.collapsed ?? false;
  const header = uiButton({ id: 'quest-tracker.header', label: 'QUESTS', size: 'sm', tone: 'primary', onPress: options.onToggle, drag: options.drag,
    layout: { width: 'grow', height: uiFixed(UI_QUEST_TRACKER_METRICS.header), shrink: 0, padding: 0 },
    face: (element, { context, art, hovered, focused }) => {
      const r = element.rect;
      paintUiSkin(context, art.skin.feedback, collapsedNow ? 'quest_chevron.collapsed' : 'quest_chevron.expanded', { x: r.x - 1, y: r.y, width: 16, height: 16 });
      drawOutlinedPixelText(context, art.pixel, 'QUESTS', r.x + 15, r.y + 5, { color: hovered || focused ? UI_QUEST_INK.lit : UI_QUEST_INK.header, outlineColor: UI_QUEST_INK.outline });
    },
  });
  const list = uiScrollArea({ width: 'grow', height: 'grow', gap: 2 }, []);
  const tracker = uiFlex({ width: uiFixed(UI_QUEST_TRACKER_METRICS.width),
    height: uiFixed(uiQuestTrackerHeight(options.entries, options.collapsed ?? false)),
    gap: 2, ...options.layout }, [header, list]);
  const rows = new Map<string, { button: UiElement; content: UiElement; key: string; current: { entry: UiQuestTrackerEntry } }>();
  const updateQuestTracker = (entries: readonly UiQuestTrackerEntry[], collapsed: boolean): void => {
    const ids = new Set(entries.map(entry => entry.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.button.dispose(); rows.delete(id); }
    for (const entry of entries) {
      let row = rows.get(entry.id);
      if (!row) {
        const content = uiFlex({ width: 'grow', height: 'grow' }, []);
        const id = entry.id, current = { entry };
        const button = uiButton({ id: `quest-tracker.quest.${id}`, label: '', ariaLabel: entry.title,
          onPress: () => { if (rows.has(id)) options.onOpenQuest?.(id); },
          layout: { width: 'grow', padding: 0, shrink: 0 }, children: [content],
          face: (element, { context, art, hovered, focused }) => {
            const r = element.rect, font = art.pixel.font, line = UI_QUEST_TRACKER_METRICS.line, lit = hovered || focused;
            const quest = current.entry, objectives = quest.objectives.length ? quest.objectives : ['No objectives'];
            let y = r.y + UI_QUEST_TRACKER_METRICS.rowPadding + 2;
            drawOutlinedPixelText(context, art.pixel, fitPixelText(quest.title.toUpperCase(), r.width - 4, 1, font), r.x + 2, y, { color: lit ? UI_QUEST_INK.lit : UI_QUEST_INK.title, outlineColor: UI_QUEST_INK.outline });
            for (const text of objectives) { y += line; drawOutlinedPixelText(context, art.pixel, fitPixelText(`- ${text}`, r.width - 8, 1, font), r.x + 6, y, { color: quest.complete ? UI_QUEST_INK.done : UI_QUEST_INK.objective, outlineColor: UI_QUEST_INK.outline }); }
          } });
        row = { button, content, key: '', current }; rows.set(id, row);
      }
      const key = JSON.stringify([entry.title, entry.complete, entry.objectives]);
      row.current.entry = entry;
      if (row.key !== key) {
        row.key = key;
        row.button.label = entry.title;
        row.button.setProps({ tone: entry.complete ? 'success' : 'primary' })
          .setStyle({ height: uiFixed(uiQuestTrackerEntryHeight(entry)) });
        row.button.invalidate();
      }
    }
    const ordered = entries.map(entry => rows.get(entry.id)!.button);
    if (ordered.some((row, index) => list.children[index] !== row) || ordered.length !== list.children.length) {
      list.replaceChildren(ordered);
    }
    collapsedNow = collapsed; header.invalidate();
    list.setStyle({ visible: !collapsed });
    tracker.setStyle({ height: options.layout?.height ?? uiFixed(uiQuestTrackerHeight(entries, collapsed)),
      padding: options.layout?.padding ?? (collapsed ? 0 : { left: 2, right: 2, bottom: 2 }) });
  };
  updateQuestTracker(options.entries, options.collapsed ?? false);
  return Object.assign(tracker, { updateQuestTracker });
}
