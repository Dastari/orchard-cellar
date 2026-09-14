import { describe, expect, it, vi } from 'vitest';
import { CanvasFocusManager, type CanvasFocusTarget } from './canvas-focus.js';

function targets(activate = vi.fn()): readonly CanvasFocusTarget[] {
  return [
    { id: 'browser', label: 'Content browser', role: 'tab' },
    { id: 'hidden', label: 'Unavailable action', role: 'button', disabled: true },
    { id: 'name', label: 'Definition name', role: 'textbox' },
    { id: 'publish', label: 'Publish', role: 'button', activate },
  ];
}

describe('CanvasFocusManager', () => {
  it('keeps stable semantic focus snapshots and skips disabled targets', () => {
    const manager = new CanvasFocusManager();
    manager.setTargets(targets());
    expect(manager.snapshot()).toEqual({
      focusedId: 'browser',
      focusedLabel: 'Content browser',
      focusedRole: 'tab',
      label: 'Content browser',
      role: 'tab',
    });
    expect(Object.isFrozen(manager.snapshot())).toBe(true);
    expect(manager.focus('hidden')).toBe(false);
    expect(manager.focus('name')).toBe(true);
    expect(manager.snapshot().focusedId).toBe('name');
  });

  it('supports Tab, reverse Tab, roving arrows, Home, and End with wrapping', () => {
    const manager = new CanvasFocusManager();
    manager.setTargets(targets());
    expect(manager.handleKeyDown({ key: 'Tab' })).toBe(true);
    expect(manager.snapshot().focusedId).toBe('name');
    expect(manager.handleKeyDown({ key: 'ArrowRight' })).toBe(true);
    expect(manager.snapshot().focusedId).toBe('publish');
    expect(manager.handleKeyDown({ key: 'ArrowDown' })).toBe(true);
    expect(manager.snapshot().focusedId).toBe('browser');
    expect(manager.handleKeyDown({ key: 'Tab', shiftKey: true })).toBe(true);
    expect(manager.snapshot().focusedId).toBe('publish');
    expect(manager.handleKeyDown({ key: 'Home' })).toBe(true);
    expect(manager.snapshot().focusedId).toBe('browser');
    expect(manager.handleKeyDown({ key: 'End' })).toBe(true);
    expect(manager.snapshot().focusedId).toBe('publish');
    expect(manager.handleKeyDown({ key: 'ArrowUp' })).toBe(true);
    expect(manager.snapshot().focusedId).toBe('name');
  });

  it('activates only the enabled focused callback', () => {
    const activate = vi.fn();
    const manager = new CanvasFocusManager();
    manager.setTargets(targets(activate));
    manager.focus('publish');
    expect(manager.handleKeyDown({ key: 'Enter' })).toBe(true);
    expect(manager.handleKeyDown({ key: ' ' })).toBe(true);
    expect(activate).toHaveBeenCalledTimes(2);
    manager.focus('name');
    expect(manager.activate()).toBe(false);
  });

  it('preserves a still-enabled id across retained-tree updates', () => {
    const manager = new CanvasFocusManager();
    manager.setTargets(targets());
    manager.focus('name');
    manager.setTargets([...targets(), { id: 'history', label: 'History', role: 'listbox' }]);
    expect(manager.snapshot().focusedId).toBe('name');
    manager.setTargets(targets().map((target) => target.id === 'name' ? { ...target, disabled: true } : target));
    expect(manager.snapshot().focusedId).toBe('browser');
  });

  it('fails closed for duplicate or malformed target contracts', () => {
    const manager = new CanvasFocusManager();
    manager.setTargets(targets());
    expect(() => manager.setTargets([
      { id: 'same', label: 'One', role: 'button' },
      { id: 'same', label: 'Two', role: 'button' },
    ])).toThrow('canvas_focus_target_invalid:same');
    expect(manager.snapshot().focusedId).toBeNull();
    expect(() => manager.setTargets([
      { id: '', label: 'No id', role: 'button' },
    ])).toThrow('canvas_focus_target_invalid:');
    expect(manager.handleKeyDown({ key: 'Tab', ctrlKey: true })).toBe(false);
  });
});
