import { afterEach, describe, expect, it, vi } from 'vitest';
import { uiList } from '../components/collections.js';
import { uiText } from '../components/text.js';
import { uiFixed } from '../layout/box.js';
import { uiScrollThumb } from '../layout/scroll.js';
import { UiRoot } from './root.js';
import { UiElement } from './element.js';
import type { UiRootPointer } from './input.js';

const roots: UiRoot[] = [];
afterEach(() => roots.splice(0).forEach(root => root.dispose()));
function fixture() {
  const selected = vi.fn(), root = new UiRoot({ scale: 1 }); roots.push(root);
  const items = Array.from({ length: 20 }, (_, index) => `quest-${index}`);
  const list = uiList({ items, label: 'Quests', key: id => id, render: id => uiText(id),
    rowHeight: uiFixed(28), onSelect: (_keys, id) => selected(id) });
  root.resize(240, 140); root.mount(list); root.arrange();
  const row = (id: string) => root.entries().find(entry => entry.element.kind === 'list-row' && entry.element.label === id)!.element;
  const point = (node: UiElement) => ({ x: node.clip.x + 8, y: node.clip.y + 8 });
  const pointer = (type: UiRootPointer['type'], at = point(row('quest-1')), pointerId = 1, extra: Partial<UiRootPointer> = {}) =>
    root.pointer({ type, point: at, pointerId, button: 0, ...extra });
  const reorder = () => { list.setProps({ items: [items[0]!, items[2]!, items[1]!, ...items.slice(3)] }); root.arrange(); };
  return { root, list, row, point, pointer, reorder, selected };
}

describe('BUG-019 invalidated captured pointer tails', () => {
  it.each([false, true])('does not select a replacement row after reorder (intermediate move: %s)', move => {
    const f = fixture(), at = f.point(f.row('quest-1'));
    const cancelled = vi.spyOn(f.row('quest-1').hooks, 'onPointer');
    f.pointer('down', at); f.reorder();
    if (move) { expect(f.pointer('move', at)).toBe(true); expect(f.pointer('move', at)).toBe(true); }
    expect(f.pointer('up', at)).toBe(true);
    expect(f.selected).not.toHaveBeenCalled();
    expect(cancelled.mock.calls.filter(([event]) => event.type === 'cancel')).toHaveLength(1);
    f.pointer('down', at); f.pointer('up', at);
    expect(f.selected).toHaveBeenCalledExactlyOnceWith('quest-2');
  });

  it('isolates suppressed tails by pointer ID while another captured row remains usable', () => {
    const f = fixture(), at = f.point(f.row('quest-1'));
    f.pointer('down', at); f.reorder(); f.pointer('move', at);
    const other = f.point(f.row('quest-3'));
    f.pointer('down', other, 2); f.pointer('up', at, 1); f.pointer('up', other, 2);
    expect(f.selected).toHaveBeenCalledExactlyOnceWith('quest-3');
  });

  it('allows a fresh down to reuse an invalidated ID when its previous release was lost', () => {
    const f = fixture(), at = f.point(f.row('quest-1'));
    f.pointer('down', at); f.reorder(); f.pointer('move', at);
    f.pointer('down', at); f.pointer('up', at);
    expect(f.selected).toHaveBeenCalledExactlyOnceWith('quest-2');
  });

  it('does not deliver invalidated tail events to replacement observers', () => {
    const f = fixture(), at = f.point(f.row('quest-1')), observed = vi.fn();
    f.root.mount(new UiElement({ onPointerObserved: observed,
      style: { position: 'absolute', width: uiFixed(1), height: uiFixed(1) } }));
    f.pointer('down', at); observed.mockClear(); f.reorder();
    f.pointer('move', at); f.pointer('move', at); f.pointer('up', at);
    expect(observed).not.toHaveBeenCalled();
    f.pointer('down', at); expect(observed).toHaveBeenCalledOnce();
  });

  it.each([false, true])('retains cancellation through explicit scope replacement (intermediate move: %s)', move => {
    const f = fixture(), at = f.point(f.row('quest-1'));
    const cancelled = vi.spyOn(f.row('quest-1').hooks, 'onPointer');
    f.pointer('down', at); f.root.input.cancelPointers(); f.reorder();
    f.root.input.cancelPointers();
    if (move) f.pointer('move', at);
    f.pointer('up', at); expect(f.selected).not.toHaveBeenCalled();
    expect(cancelled.mock.calls.filter(([event]) => event.type === 'cancel')).toHaveLength(1);
    f.pointer('down', at); f.pointer('up', at);
    expect(f.selected).toHaveBeenCalledExactlyOnceWith('quest-2');
  });

  it('retains explicit cancellation after touch scrolling released its row capture', () => {
    const f = fixture(); f.list.setProps({ touchScroll: true });
    const at = f.point(f.row('quest-1')), touch = { pointerType: 'touch', isPrimary: true };
    f.pointer('down', at, 1, touch); f.pointer('move', { x: at.x, y: at.y - 10 }, 1, touch);
    f.root.input.cancelPointers(); f.reorder();
    f.pointer('up', at, 1, touch); expect(f.selected).not.toHaveBeenCalled();
  });

  it('cancels the previous owner but accepts a fresh down even before invalidation was observed', () => {
    const f = fixture(), at = f.point(f.row('quest-1'));
    const cancelled = vi.spyOn(f.row('quest-1').hooks, 'onPointer');
    f.pointer('down', at); f.reorder(); f.pointer('down', at); f.pointer('up', at);
    expect(cancelled.mock.calls.filter(([event]) => event.type === 'cancel')).toHaveLength(1);
    expect(f.selected).toHaveBeenCalledExactlyOnceWith('quest-2');
  });

  it.each(['hidden', 'disabled'] as const)('consumes the tail when its captured row becomes %s', state => {
    const f = fixture(), row = f.row('quest-1'), at = f.point(row), cancelled = vi.spyOn(row.hooks, 'onPointer');
    f.pointer('down', at);
    if (state === 'hidden') row.setStyle({ visible: false }); else row.setDisabled(true);
    f.root.arrange(); f.pointer('move', at); f.pointer('cancel', at);
    expect(f.selected).not.toHaveBeenCalled();
    expect(cancelled.mock.calls.filter(([event]) => event.type === 'cancel')).toHaveLength(1);
    row.setStyle({ visible: true }); row.setDisabled(false); f.root.arrange();
    f.pointer('down', at); f.pointer('up', at); expect(f.selected).toHaveBeenCalledExactlyOnceWith('quest-1');
  });

  it('keeps a valid scrollbar capture through a list reorder and releases without selecting', () => {
    const f = fixture(), thumb = uiScrollThumb(f.list, 'y')!.thumb;
    const at = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 };
    f.pointer('down', at); f.reorder(); f.pointer('move', { x: at.x, y: at.y + 30 });
    expect(f.list.scroll.y).toBeGreaterThan(0); f.pointer('up', { x: at.x, y: at.y + 30 });
    expect(f.selected).not.toHaveBeenCalled();
  });

  it('keeps touch-scroll ownership after scrolling disposes the original row', () => {
    const f = fixture(); f.list.setProps({ touchScroll: true });
    const at = f.point(f.row('quest-1')), touch = { pointerType: 'touch', isPrimary: true };
    f.pointer('down', at, 1, touch); f.pointer('move', { x: at.x, y: at.y - 100 }, 1, touch);
    f.root.arrange(); expect(f.list.scroll.y).toBeGreaterThan(0);
    f.pointer('up', { x: at.x, y: at.y - 100 }, 1, touch); expect(f.selected).not.toHaveBeenCalled();
  });

  it('cancels a removed scrollbar owner without retargeting release to the new list', () => {
    const f = fixture(), thumb = uiScrollThumb(f.list, 'y')!.thumb;
    const at = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 };
    f.pointer('down', at);
    f.list.dispose();
    const replacement = uiList({ label: 'Replacement', items: ['replacement'], key: id => id,
      render: id => uiText(id), rowHeight: uiFixed(28), onSelect: (_keys, id) => f.selected(id) });
    f.root.mount(replacement); f.root.arrange();
    const row = f.root.entries().find(entry => entry.element.kind === 'list-row')!.element;
    const release = f.point(row);
    f.pointer('move', release); f.pointer('up', release); expect(f.selected).not.toHaveBeenCalled();
    f.pointer('down', release); f.pointer('up', release);
    expect(f.selected).toHaveBeenCalledExactlyOnceWith('replacement');
  });
});
