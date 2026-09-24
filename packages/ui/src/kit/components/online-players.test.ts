import { describe, expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiOnlinePlayers } from './online-players.js';
import { uiButton } from './button.js';

describe('online-player roster', () => {
  it('retains rows, focus and scroll while player labels and permissions update', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(300, 200);
    const players = Array.from({ length: 40 }, (_, id) => ({ id: String(id), label: `Player ${id}`, manageable: true }));
    const roster = root.mount(uiOnlinePlayers({ players, onClose: vi.fn() })); root.arrange();
    const button = root.entries().find(entry => entry.element.id === `${roster.id}:player:30`)!.element;
    root.focus.set(button, 'keyboard'); root.arrange();
    const list = root.entries().find(entry => entry.element.kind === 'scroll-area')!.element;
    const offset = list.scroll.y; expect(offset).toBeGreaterThan(0);
    roster.setProps({ players: players.map(player => ({ ...player, label: `${player.label} [WORKER]`, manageable: false })) }); root.arrange();
    expect(root.focus.current).toBe(button); expect(list.scroll.y).toBe(offset);
    expect(button.label).toContain('[WORKER]'); expect(button.rect).toEqual(button.clip);
    expect(root.entries().some(entry => entry.element.id === `${roster.id}:remove:30`)).toBe(false);
    root.dispose();
  });
  it('cycles roles and removes only manageable players using pointer or keyboard', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(300, 200);
    const cycle = vi.fn(), remove = vi.fn();
    const roster = root.mount(uiOnlinePlayers({ players: [{ id: 'self', label: 'You' }, { id: 'guest', label: 'Guest', manageable: true }],
      onClose: vi.fn(), onCycleRole: cycle, onRemove: remove })); root.arrange();
    const button = root.entries().find(entry => entry.element.id === `${roster.id}:player:guest`)!.element;
    root.focus.set(button, 'keyboard'); root.key({ key: 'Enter' }); expect(cycle).toHaveBeenCalledWith('guest');
    root.pointer({ type: 'down', point: { x: button.rect.x + 5, y: button.rect.y + 5 }, button: 2, pointerId: 1 });
    expect(remove).toHaveBeenCalledWith('guest');
    const removeButton = root.entries().find(entry => entry.element.id === `${roster.id}:remove:guest`)!.element;
    root.focus.set(removeButton, 'keyboard'); root.key({ key: ' ' }); expect(remove).toHaveBeenCalledTimes(2);
    const self = root.entries().find(entry => entry.element.id === `${roster.id}:player:self`)!.element;
    root.focus.set(self, 'keyboard'); root.key({ key: 'Enter' }); expect(cycle).toHaveBeenCalledTimes(1); root.dispose();
  });
  it('scrolls a dragged row without changing its role', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(300, 200); const cycle = vi.fn();
    const roster = root.mount(uiOnlinePlayers({ players: Array.from({ length: 20 }, (_, id) => ({ id: String(id), label: `Player ${id}`, manageable: true })),
      onClose: vi.fn(), onCycleRole: cycle })); root.arrange();
    const button = root.entries().find(entry => entry.element.id === `${roster.id}:player:1`)!.element;
    const point = { x: button.rect.x + 5, y: button.rect.y + 10 };
    root.pointer({ type: 'down', point, button: 0, pointerId: 5 });
    const end = { x: point.x, y: point.y - 40 };
    root.pointer({ type: 'move', point: end, button: 0, pointerId: 5 });
    root.pointer({ type: 'up', point: end, button: 0, pointerId: 5 });
    const list = root.entries().find(entry => entry.element.kind === 'scroll-area')!.element;
    expect(list.scroll.y).toBe(40); expect(cycle).not.toHaveBeenCalled();
    root.dispose();
  });
  it('traps focus, blocks the background and restores the opener after closing', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(320, 240); const press = vi.fn();
    const opener = root.mount(uiButton({ label: 'Players', onPress: press })); root.arrange(); root.focus.set(opener, 'keyboard');
    const roster = root.mount(uiOnlinePlayers({ players: [], layout: { zLayer: 'modal' }, onClose: () => roster.setStyle({ visible: false }) }));
    root.arrange(); expect(root.focus.current?.isDescendantOf(roster)).toBe(true);
    root.pointer({ type: 'down', point: { x: 319, y: 239 }, button: 0, pointerId: 1 }); expect(press).not.toHaveBeenCalled();
    root.key({ key: 'Escape' }); root.arrange(); expect(root.focus.current).toBe(opener); root.dispose();
  });
});

it('uses one primary touch owner for remove-button scrolling without a removal or role command', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(300, 200);
  const cycle = vi.fn(), remove = vi.fn();
  const roster = root.mount(uiOnlinePlayers({ id: 'roster', players: Array.from({ length: 20 }, (_, id) => ({ id: String(id), label: `Farmer ${id}`, manageable: true })),
    onClose: vi.fn(), onCycleRole: cycle, onRemove: remove })); root.arrange();
  const button = root.entries().find(entry => entry.element.id === `${roster.id}:remove:1`)!.element;
  const point = { x: button.rect.x + 5, y: button.rect.y + 10 };
  const send = (type: 'down'|'move'|'up', dy: number, pointerId = 1, isPrimary = true) => root.pointer({ type, point: { x: point.x, y: point.y - dy }, pointerType: 'touch', button: 0, pointerId, isPrimary });
  send('down', 0); const focused = root.focus.current;
  send('down', 2, 2, false); expect(root.focus.current).toBe(focused);
  send('move', 4); send('move', 24); send('up', 24); send('up', 2, 2, false);
  const list = root.entries().find(entry => entry.element.kind === 'scroll-area')!.element;
  expect(list.scroll.y).toBe(24); expect(remove).not.toHaveBeenCalled(); expect(cycle).not.toHaveBeenCalled(); root.dispose();
});
