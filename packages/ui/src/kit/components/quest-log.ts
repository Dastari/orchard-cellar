import type { QuestLogEntry, QuestLogCallbacks } from '../../quest-log.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { scrollUiElement } from '../layout/scroll.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiList } from './collections.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';

export interface UiQuestLogOptions extends QuestLogCallbacks {
  readonly entries: readonly QuestLogEntry[]; readonly selected?: string | null;
  readonly onClose?: () => void; readonly layout?: UiStyle; readonly resizable?: boolean;
}
export interface UiQuestLogElement extends UiElement {
  select(id: string): boolean; updateQuests(entries: readonly QuestLogEntry[]): void;
  focusQuests(): void; readonly selectedQuest: string | null;
}
export function uiQuestLog(options: UiQuestLogOptions): UiQuestLogElement {
  let entries = options.entries, selected = options.selected ?? entries[0]?.id ?? null, key = '', detailKey = '', actionId: string | null | undefined;
  let list: UiElement, pin: UiElement, drop: UiElement;
  const listHost = uiFlex({ width: 'grow', height: 'grow', basis: uiFixed(180), minHeight: uiFixed(56) });
  const details = uiFlex({ width: 'grow', gap: 8 });
  const detailScroll = uiScrollArea({ id: 'quests.details', width: 'grow', height: 'grow', minHeight: uiFixed(28) }, [details]);
  const actions = uiFlex({ direction: 'row', wrap: true, gap: 4, shrink: 0 });
  const detailHost = uiFlex({ width: 'grow', height: 'grow', basis: uiFixed(260), gap: 8 }, [detailScroll, actions]);
  const current = () => entries.find(entry => entry.id === selected);
  const refresh = () => {
    const quest = current();
    // A press captured for a removed/previous quest must never command its successor.
    if (actionId !== selected) {
      actionId = selected;
      for (const child of [...actions.children]) child.dispose();
      pin = uiButton({ id: 'quests.pin', label: 'TRACK', size: 'sm', onPress: () => { const quest = current(); if (quest) options.setPinned(quest.id, !quest.pinned); } });
      drop = uiButton({ id: 'quests.drop', label: 'DROP QUEST', size: 'sm', tone: 'danger', onPress: () => { const quest = current(); if (quest) options.drop(quest.id); } });
      actions.append(pin).append(drop);
    }
    pin.setDisabled(!quest); drop.setDisabled(!quest); pin.setProps({ label: quest?.pinned ? 'UNTRACK' : 'TRACK' });
    const nextKey = JSON.stringify(quest) ?? '';
    if (detailKey === nextKey && details.children.length) return;
    detailKey = nextKey;
    for (const child of [...details.children]) child.dispose();
    if (!quest) { details.append(uiText('NO ACTIVE QUESTS', { wrap: true })); return; }
    details.append(uiText(quest.title.toUpperCase(), { role: 'header', wrap: true }))
      .append(uiText(quest.state === 'complete' ? 'READY TO TURN IN' : 'IN PROGRESS'))
      .append(uiText(quest.summary, { wrap: true })).append(uiText('OBJECTIVES', { role: 'header' }));
    for (const objective of quest.objectives) details.append(uiText(`${objective.complete ? '[X]' : '[ ]'} ${objective.progress ? `${objective.progress} ` : ''}${objective.label}`, { wrap: true }));
    if (quest.rewards.length) { details.append(uiText('REWARDS', { role: 'header' })); for (const reward of quest.rewards) details.append(uiText(`- ${reward}`, { wrap: true })); }
  };
  const activate = (id: string | null) => {
    if (selected === id) return;
    selected = id; list?.setProps({ selected: id ? [id] : [] }, false); scrollUiElement(detailScroll, 0, 0); refresh();
  };
  const rebuild = (reveal = false) => {
    const focused = Boolean(list?.props['focused']), scroll = list?.scroll.y ?? 0;
    list?.dispose();
    const index = Math.max(0, entries.findIndex(entry => entry.id === selected));
    list = uiList({ id: 'quests.list', label: 'Quests', items: entries, key: entry => entry.id, selected: selected ? [selected] : [],
      initialActive: index, initialScrollY: reveal ? index * 28 : scroll, rowHeight: uiFixed(28),
      onArrange: element => { element.scroll.y = Math.min(element.scroll.y, Math.max(0, entries.length * 28 - element.contentRect.height)); },
      render: entry => uiText(`${entry.state === 'complete' ? '!' : entry.pinned ? '*' : '-'} ${entry.title}`),
      onActiveChange: index => activate(entries[index]?.id ?? null), onSelect: (_keys, entry) => activate(entry.id),
    });
    listHost.append(list); if (focused) list.requestFocus(); refresh();
  };
  const select = (id: string) => {
    if (!entries.some(entry => entry.id === id)) return false;
    activate(id); rebuild(true); return true;
  };
  const updateQuests = (next: readonly QuestLogEntry[]) => {
    const nextKey = JSON.stringify(next); if (nextKey === key) return;
    key = nextKey; entries = next;
    const previous = selected;
    if (!current()) selected = entries[0]?.id ?? null;
    if (!list || previous !== selected) { scrollUiElement(detailScroll, 0, 0); rebuild(); }
    else { list.setProps({ items: entries, active: Math.max(0, entries.findIndex(entry => entry.id === selected)) }); refresh(); }
  };
  let arrangement = '';
  const panes = uiFlex({ direction: 'row', wrap: false, width: 'grow', height: 'grow', gap: 8,
    onArrange(element) {
      const next = element.rect.width < 448, rows = element.rect.height < 140 ? 28 : 56;
      const key = `${next}:${rows}`; if (key === arrangement) return; arrangement = key;
      element.setStyle({ direction: next ? 'column' : 'row' });
      listHost.setStyle({ basis: next ? undefined : uiFixed(180), height: next ? uiFixed(rows) : 'grow', minHeight: uiFixed(next ? rows : 56), shrink: next ? 0 : 1 });
      detailHost.setStyle({ basis: next ? undefined : uiFixed(260) });
    },
  }, [listHost, detailHost]);
  const frame = uiFrame({ id: 'game.quests', blockInput: true, header: { title: 'QUEST LOG', closable: true, onClose: options.onClose },
    resizable: options.resizable === false ? undefined : { handles: 'all', min: { width: 240, height: 200 } }, layout: { width: 'grow', height: 'grow', ...options.layout }, children: [panes] });
  updateQuests(entries);
  return Object.defineProperty(Object.assign(frame, { select, updateQuests, focusQuests: (): void => { list.requestFocus(); } }), 'selectedQuest', { get: () => selected }) as UiQuestLogElement;
}
