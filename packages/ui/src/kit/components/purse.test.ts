import { describe, expect, it, vi } from 'vitest';
import { uiPurse, uiPurseCoins, uiPurseFace, uiPurseLabel, uiPurseWidth } from './purse.js';
import { UiRoot } from '../runtime/root.js';
import { uiButton } from './button.js';

describe('purse', () => {
  it('formats canonical amounts without losing bigint precision', () => {
    expect(uiPurseLabel(-1n)).toBe('0g 0s 0b');
    expect(uiPurseLabel(123456n)).toBe('12g 34s 56b');
    expect(uiPurseLabel(123456789012345678901234n)).toBe('12345678901234567890g 12s 34b');
  });
  it('shows every coin whole at its preferred width and shortens instead of cutting a number off', () => {
    // The live purse once read "3g 39..." (owner report, 2026-09-25): the plate must fit every coin.
    const text = (balance: bigint, width: number) => uiPurseCoins(balance, width).map(([coin, value]) => `${value}${coin[0]}`).join(' ');
    for (const balance of [33_912n, 123_456n, 99_999_999n]) expect(text(balance, uiPurseWidth(balance) - 29)).toBe(uiPurseLabel(balance));
    // Short of room the purse switches to compact text (1234g56s78b) before any coin drops away.
    expect(uiPurseFace(123_456_78n, 70).mode).toBe('text'); expect(text(123_456_78n, 70)).toBe('1234g 56s 78b');
    expect(text(33_912n, 32)).toBe('3g 39s');
    expect(text(123_456_789_012n, 20)).toBe('12Mg');
  });
  it('retains the focused inventory action while the balance changes', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(112,24); const open = vi.fn();
    const purse = root.mount(uiPurse({ balance: 0n, onOpen: open })); root.arrange(); root.key({ key: 'Tab' });
    const button = root.focus.current!; purse.setProps({ balance: 12345n }); root.arrange();
    expect(root.focus.current).toBe(button); expect(button.label).toBe('Inventory · 1g 23s 45b');
    expect(button.rect).toEqual(button.clip); root.key({ key: 'Enter' }); expect(open).toHaveBeenCalledOnce(); root.dispose();
  });
  it('cancels capture when a pointer-down action hides its button', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(112,24);
    const button = root.mount(uiButton({ label: 'Open', activateOn: 'down', onPress: () => button.setStyle({ visible: false }) }));
    root.arrange(); const cancel = vi.fn(); const original = button.hooks.onPointer!;
    Object.assign(button.hooks, { onPointer: (event: Parameters<typeof original>[0], element: Parameters<typeof original>[1]) => { if (event.type === 'cancel') cancel(); return original(event, element); } });
    root.pointer({ type: 'down', point: { x: 4, y: 4 }, button: 0, pointerId: 1 });
    root.pointer({ type: 'up', point: { x: 4, y: 4 }, button: 0, pointerId: 1 });
    expect(cancel).toHaveBeenCalledOnce(); root.dispose();
  });
});
