import { describe, expect, it, vi } from 'vitest';
import { uiPurse, uiPurseLabel } from './purse.js';
import { UiRoot } from '../runtime/root.js';
import { uiButton } from './button.js';

describe('purse', () => {
  it('formats canonical amounts without losing bigint precision', () => {
    expect(uiPurseLabel(-1n)).toBe('0g 0s 0b');
    expect(uiPurseLabel(123456n)).toBe('12g 34s 56b');
    expect(uiPurseLabel(123456789012345678901234n)).toBe('12345678901234567890g 12s 34b');
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
