import { describe, expect, it, vi } from 'vitest';
import { uiStatusEffects, uiStatusEffectBlinkHidden, uiStatusEffectLabel, type UiStatusEffect } from './status-effects.js';
import { UiRoot } from '../runtime/root.js';
const effect: UiStatusEffect = { id: 'tea', name: 'Orchard tea', icon: { cf: 'heart' }, durationTicks: 1000, remainingTicks: 200 };
describe('status effects', () => {
  it('preserves the final-tenth warning without flashing under reduced motion', () => {
    expect(uiStatusEffectBlinkHidden(effect, false)).toBe(false);
    expect(uiStatusEffectBlinkHidden({ ...effect, remainingTicks: 100 }, false)).toBe(true);
    expect(uiStatusEffectBlinkHidden({ ...effect, remainingTicks: 95 }, false)).toBe(false);
    expect(uiStatusEffectBlinkHidden({ ...effect, remainingTicks: 100 }, true)).toBe(false);
    expect(uiStatusEffectBlinkHidden({ ...effect, durationTicks: 0 }, false)).toBe(false);
    expect(uiStatusEffectLabel({ ...effect, stacks: 2, remainingTicks: 21 }, 20)).toBe('Orchard tea x2 2s');
  });
  it('updates duration tooltips without replacing a focused effect or restarting its timer', () => {
    vi.useFakeTimers();
    try {
      const root = new UiRoot({ scale: 1 }); root.resize(240,100);
      const row = root.mount(uiStatusEffects({ effects: [effect], ticksPerSecond: 20 })); root.arrange();
      const cell = root.entries().find(entry => entry.element.kind === 'status-effect')!.element;
      expect(cell.rect).toEqual(cell.clip); expect(cell.rect.width).toBe(24);
      root.key({ key: 'Tab' }); vi.runAllTimers(); root.arrange();
      row.setProps({ effects: [{ ...effect, remainingTicks: 180 }] }); root.arrange();
      expect(root.focus.current).toBe(cell); expect(cell.label).toBe('Orchard tea 9s');
      expect(root.entries().some(entry => entry.element.kind === 'text' && entry.element.label === 'Orchard tea 9s')).toBe(true);
      row.setProps({ effects: [] }); root.arrange();
      expect(cell.disposed).toBe(true); expect(root.focus.current).toBeNull(); root.dispose();
    } finally { vi.useRealTimers(); }
  });
});

it('keeps effect identity and authored order while custom production artwork replaces generic icons', () => {
  const paint = vi.fn(), root = new UiRoot({ scale: 1 }); root.resize(150, 60);
  const second = { ...effect, id: 'rest', name: 'Rested', icon: undefined };
  const row = root.mount(uiStatusEffects({ id: 'effects', effects: [effect, second], ticksPerSecond: 20, renderIcon: paint })); root.arrange();
  const first = row.children[0], next = row.children[1]; root.focus.set(next!.children[0]!);
  row.setProps({ effects: [second, { ...effect, remainingTicks: 180 }] }); root.arrange();
  expect(row.children).toEqual([next, first]); expect(root.focus.current).toBe(next!.children[0]);
  const context = { fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
  const cell = next!.children[0]!;
  cell.hooks.paint!(cell, { context, now: 0, hovered: false, focused: false, reducedMotion: false });
  expect(paint).toHaveBeenCalledExactlyOnceWith(context, { x: cell.rect.x + 4, y: cell.rect.y + 4, width: 16, height: 16 }, second); root.dispose();
});
