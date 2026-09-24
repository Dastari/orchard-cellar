import type { QuestLogEntry, QuestLogCallbacks } from '../../quest-log.js';
import { insetRect } from '../../geometry.js';
import { UiElement } from '../runtime/element.js';
import { uiPaddingInsets, type UiStyle } from '../layout/box.js';
import { measureUiElement } from '../layout/measure.js';
import { scrollUiElement } from '../layout/scroll.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText, uiTextLines } from './text.js';
import { UI_TEXT_METRICS } from '../tokens.js';
import { drawPixelText, measurePixelText } from '../../pixel-ui.js';
import { uiButton } from './button.js';
import type { UiBookWindowElement } from './book-window.js';
import { uiGameBook, uiGameBookPage, uiPageHeading, uiPageLabel, uiPageRow, type UiGameBookChapter } from './character-book.js';

/** Gutter kept free for the 16px wooden rail (drawn 1px inside the edge) when a page overflows. */
const PAGE_RAIL = 16;

/** A scrolling page region with the wooden rail. The rail's gutter is reserved only when the
 * content overflows, so short pages keep the full leaf width like the approved spreads. */
export function uiPageScroll(options: { readonly id?: string; readonly label?: string }, content: UiElement): UiElement {
  const area = uiScrollArea({ id: options.id, label: options.label, scrollStyle: 'wood', padding: 0, width: 'grow', height: 'grow',
    onArrange(element) {
      // Measuring at the full width is enough: a narrower column only wraps taller, so the choice is stable.
      const overflow = measureUiElement(content, { width: element.rect.width, height: element.rect.height }).preferred.height > element.rect.height;
      const right = overflow ? PAGE_RAIL : 0;
      if (uiPaddingInsets(element.style.padding).right === right) return;
      element.setStyle({ padding: { right } });
      element.contentRect = insetRect(element.rect, uiPaddingInsets(element.style.padding));
    } }, [content]);
  return area.setProps({ scrollbarWidth: PAGE_RAIL }, false);
}

/** A page row whose highlight follows live selection, so selecting never recreates (and unfocuses) rows. */
export function uiSelectablePageRow(options: Omit<Parameters<typeof uiPageRow>[0], 'selected'> & { readonly selected: () => boolean; readonly onFocus?: (focused: boolean) => void }): UiElement {
  const { onFocus, ...row } = options, element = uiPageRow(row);
  if (onFocus) Object.assign(element.hooks, { onFocus: (focused: boolean) => onFocus(focused) });
  return element;
}

/** Book inks, matching the character book's page helpers. */
const INK = '#3f2832', MUTED = '#9e5f45', GOOD = '#265c42', RULE = '#e4a672';
const HEADING_LINE = 14, BODY_CELL = UI_TEXT_METRICS.body.glyphWidth + 1;

/** `uiPageHeading` for authored titles of any length: a title wider than the leaf wraps onto further
 * centred lines in the reading font instead of being clipped at the page edges. */
export function uiWrappedPageHeading(title: string, caption?: string): UiElement {
  const lines = (width: number) => uiTextLines(title, Math.max(0, width - 4), 'special-heading');
  const height = (count: number) => (count - 1) * HEADING_LINE + (caption ? 30 : 20);
  return new UiElement({ kind: 'page-heading', label: title, style: { shrink: 0, alignSelf: 'stretch' },
    measure: (_element, available) => ({ min: { width: 0, height: height(1) }, preferred: { width: available.width, height: height(lines(available.width).length) } }),
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, rows = lines(r.width);
      rows.forEach((line, index) => { const width = measurePixelText(line, 1, art.pixel.headerFont); drawPixelText(context, art.pixel, line, r.x + Math.floor((r.width - width) / 2), r.y + index * HEADING_LINE, { font: 'header', color: INK }); });
      if (caption) { const w = measurePixelText(caption, 1, art.pixel.font); drawPixelText(context, art.pixel, caption, r.x + Math.floor((r.width - w) / 2), r.y + (rows.length - 1) * HEADING_LINE + 17, { color: MUTED }); }
      context.fillStyle = RULE; context.fillRect(r.x + 8, r.y + r.height - 2, r.width - 16, 1);
    } });
}

/** `uiObjective` whose label wraps beneath its tick box instead of truncating on narrow leaves. */
export function uiWrappedObjective(label: string, progress: string, complete: boolean): UiElement {
  const layout = (width: number) => {
    const progressWidth = progress ? progress.length * BODY_CELL - 1 + 4 : 0;
    const first = uiTextLines(label, Math.max(BODY_CELL, width - 12 - progressWidth), 'body')[0] ?? '';
    const rest = label.slice(first.length).trimStart();
    return [first, ...(rest ? uiTextLines(rest, Math.max(BODY_CELL, width - 12), 'body') : [])];
  };
  return new UiElement({ kind: 'objective', label: `${label} ${progress}`.trim(), style: { shrink: 0, alignSelf: 'stretch' },
    measure: (_element, available) => ({ min: { width: 0, height: 12 }, preferred: { width: available.width, height: 12 + (layout(available.width).length - 1) * 10 } }),
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      context.fillStyle = INK; context.fillRect(r.x, r.y + 1, 8, 8); context.fillStyle = '#f6ca9f'; context.fillRect(r.x + 1, r.y + 2, 6, 6);
      if (complete) { context.fillStyle = GOOD; for (const [x, y] of [[1, 4], [2, 5], [3, 6], [4, 5], [5, 4], [6, 3], [7, 2]] as const) context.fillRect(r.x + x, r.y + y, 1, 2); }
      layout(r.width).forEach((line, index) => drawPixelText(context, art.pixel, line, r.x + 12, r.y + 2 + index * 10, { color: complete ? MUTED : INK }));
      if (progress) drawPixelText(context, art.pixel, progress, r.x + r.width - measurePixelText(progress, 1, art.pixel.font), r.y + 2, { color: complete ? GOOD : MUTED });
    } });
}

export interface UiQuestLogOptions extends QuestLogCallbacks {
  readonly entries: readonly QuestLogEntry[]; readonly selected?: string | null;
  readonly onClose?: () => void; readonly layout?: UiStyle;
  /** Other chapter tabs of the player's book ask the host to open that chapter. */
  readonly onNavigate?: (chapter: UiGameBookChapter) => void;
  /** Leaf size; defaults to the approved desktop spread. */
  readonly page?: { readonly width: number; readonly height: number };
}
export interface UiQuestLogElement extends UiElement {
  select(id: string): boolean; updateQuests(entries: readonly QuestLogEntry[]): void;
  focusQuests(): void; setBookPage(page: { readonly width: number; readonly height: number }): void;
  readonly selectedQuest: string | null;
}

const progressOf = (quest: QuestLogEntry) => `${quest.objectives.filter(objective => objective.complete).length}/${quest.objectives.length}`;

/** The Quests chapter of the player's book: quest list on the left leaf, the selected quest on the right. */
export function uiQuestLog(options: UiQuestLogOptions): UiQuestLogElement {
  let entries = options.entries, selected: string | null = options.selected ?? null;
  let listKey = '', detailKey = '', actionId: string | null | undefined, focusedRow: string | null = null;
  let pin: UiElement | undefined, drop: UiElement | undefined;
  const ordered = () => [...entries.filter(entry => entry.state !== 'complete'), ...entries.filter(entry => entry.state === 'complete')];
  const current = () => entries.find(entry => entry.id === selected);
  const rows = new Map<string, { readonly key: string; readonly element: UiElement }>();
  const activeLabel = uiPageLabel('ACTIVE'), completedLabel = uiPageLabel('COMPLETED');
  const empty = uiText('No active quests', { wrap: true, layout: { alignSelf: 'stretch' } });

  const move = (step: number | 'first' | 'last') => {
    const list = ordered(); if (!list.length) return false;
    const index = list.findIndex(entry => entry.id === selected);
    const next = step === 'first' ? 0 : step === 'last' ? list.length - 1 : Math.max(0, Math.min(list.length - 1, index + step));
    activate(list[next]!.id); rows.get(list[next]!.id)?.element.requestFocus(); return true;
  };
  const listColumn = new UiElement({ kind: 'flex', style: { display: 'flex', direction: 'column', gap: 2, alignSelf: 'stretch' },
    onKey(event) {
      const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : event.key === 'Home' ? 'first' as const : event.key === 'End' ? 'last' as const : undefined;
      return step !== undefined && move(step);
    } });
  const list = uiPageScroll({ id: 'quests.list', label: 'Quests' }, listColumn);
  const detailColumn = uiFlex({ direction: 'column', gap: 4, alignSelf: 'stretch' });
  const details = uiPageScroll({ id: 'quests.details', label: 'Quest details' }, detailColumn);
  const headingHost = uiFlex({ direction: 'column', alignSelf: 'stretch', shrink: 0 });
  const actions = uiFlex({ direction: 'row', gap: 4, justify: 'end', alignSelf: 'stretch', shrink: 0 });
  const left = uiFlex({ direction: 'column', gap: 2, width: 'grow', height: 'grow' }, [uiPageHeading('Quests'), list]);
  const right = uiFlex({ direction: 'column', gap: 4, width: 'grow', height: 'grow' }, [headingHost, details, actions]);

  const renderList = () => {
    const list = ordered(), nextKey = JSON.stringify(list.map(entry => [entry.id, entry.title, progressOf(entry), entry.state]));
    if (nextKey === listKey) return; listKey = nextKey;
    const children: UiElement[] = [activeLabel];
    const active = list.filter(entry => entry.state !== 'complete'), complete = list.filter(entry => entry.state === 'complete');
    if (!active.length) children.push(empty);
    for (const entry of list) {
      if (entry === complete[0]) children.push(completedLabel);
      const muted = entry.state === 'complete', key = JSON.stringify([entry.title, muted ? '' : progressOf(entry), muted]);
      let row = rows.get(entry.id);
      if (!row || row.key !== key) {
        const refocus = focusedRow === entry.id; row?.element.dispose();
        const id = entry.id;
        row = { key, element: uiSelectablePageRow({ id: `quests.row.${id}`, label: entry.title, note: muted ? undefined : progressOf(entry), glyph: muted ? undefined : 'chapter.quests', muted,
          selected: () => selected === id, onPress: () => activate(id),
          onFocus: focused => { if (focused) focusedRow = id; else if (focusedRow === id) focusedRow = null; } }) };
        rows.set(id, row); if (refocus) row.element.requestFocus();
      }
      children.push(row.element);
    }
    for (const [id, row] of rows) if (!list.some(entry => entry.id === id)) { row.element.dispose(); rows.delete(id); if (focusedRow === id) focusedRow = null; }
    listColumn.replaceChildren(children);
  };

  const renderDetails = () => {
    const quest = current();
    // A press captured for a removed/previous quest must never command its successor.
    if (actionId !== selected || !pin || !drop) {
      actionId = selected;
      for (const child of [...actions.children]) child.dispose();
      pin = uiButton({ id: 'quests.pin', label: 'Pin', tone: 'primary', size: 'sm', onPress: () => { const quest = current(); if (quest) options.setPinned(quest.id, !quest.pinned); } });
      drop = uiButton({ id: 'quests.drop', label: 'Abandon', tone: 'danger', size: 'sm', onPress: () => { const quest = current(); if (quest) options.drop(quest.id); } });
      actions.append(pin).append(drop);
    }
    pin.setDisabled(!quest); drop.setDisabled(!quest); pin.setProps({ label: quest?.pinned ? 'Unpin' : 'Pin' });
    const nextKey = JSON.stringify(quest ?? null);
    if (detailKey === nextKey) return; detailKey = nextKey;
    for (const child of [...headingHost.children, ...detailColumn.children]) child.dispose();
    if (!quest) { detailColumn.append(uiText('Quests you accept are written here.', { wrap: true, layout: { alignSelf: 'stretch' } })); return; }
    headingHost.append(uiWrappedPageHeading(quest.title, quest.giver ? `From ${quest.giver}` : undefined));
    detailColumn.append(uiText(quest.summary, { wrap: true, layout: { alignSelf: 'stretch' } }));
    if (quest.state === 'complete') detailColumn.append(uiPageLabel('READY TO TURN IN'));
    if (quest.objectives.length) detailColumn.append(uiPageLabel('OBJECTIVES'));
    for (const objective of quest.objectives) {
      const progress = objective.progress ?? '';
      // Multi-item progress ("1/3 Apple, 0/2 Pear") gets its own wrapped line instead of crushing the label.
      if (progress.length <= 7) { detailColumn.append(uiWrappedObjective(objective.label, progress, objective.complete)); continue; }
      detailColumn.append(uiWrappedObjective(objective.label, '', objective.complete))
        .append(uiText(progress, { role: 'caption', wrap: true, layout: { alignSelf: 'stretch', padding: { left: 12 } } }));
    }
    if (quest.rewards.length) {
      detailColumn.append(uiPageLabel('REWARDS'));
      for (const reward of quest.rewards) detailColumn.append(uiText(reward, { wrap: true, layout: { alignSelf: 'stretch' } }));
    }
  };

  const activate = (id: string | null) => {
    if (selected === id) return;
    selected = id; list.setProps({ selected: id ? [id] : [] }, false);
    for (const row of rows.values()) row.element.invalidateRoot?.(false);
    scrollUiElement(details, 0, 0); renderDetails();
  };
  const select = (id: string) => {
    if (!entries.some(entry => entry.id === id)) return false;
    activate(id); return true;
  };
  const updateQuests = (next: readonly QuestLogEntry[]) => {
    entries = next;
    if (!current()) { selected = ordered()[0]?.id ?? null; scrollUiElement(details, 0, 0); }
    list.setProps({ selected: selected ? [selected] : [] }, false);
    renderList(); renderDetails();
  };

  const book: UiBookWindowElement = uiGameBook({ id: 'quests.book', active: 'quests', left, right, page: options.page ?? uiGameBookPage(640, 400),
    onNavigate: options.onNavigate, onClose: options.onClose });
  const host = new UiElement({ id: 'game.quests', kind: 'quest-log', label: 'Quests',
    style: { display: 'flex', direction: 'column', justify: 'center', align: 'center', ...options.layout }, children: [book],
    pointerMode: 'capture', onPointer: () => true, onWheel: () => true,
    onDismiss: () => options.onClose?.() });
  updateQuests(entries);
  const focusQuests = () => { const row = selected ? rows.get(selected)?.element : undefined; (row ?? pin)?.requestFocus(); };
  return Object.defineProperty(Object.assign(host, { select, updateQuests, focusQuests, setBookPage: book.setBookPage }),
    'selectedQuest', { get: () => selected }) as UiQuestLogElement;
}
