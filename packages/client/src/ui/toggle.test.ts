import { describe, expect, it, vi } from 'vitest';
import type { PixelUi } from '../render/pixel-ui.js';
import type { UiSkin } from './skin.js';
import { Toggle } from './toggle.js';

describe('Toggle', () => {
  it('toggles once for each enabled pointer press', () => {
    const onChange = vi.fn();
    const toggle = new Toggle({
      id: 'test.toggle', skin: {} as UiSkin, fonts: {} as PixelUi, onChange,
    });
    toggle.setBounds({ x: 10, y: 10, width: 40, height: 18 });
    expect(toggle.value).toBe(false);
    expect(toggle.node.onPointer?.({ kind: 'pointer_down', point: { x: 20, y: 15 }, button: 0 }, toggle.node)).toBe(true);
    expect(toggle.value).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
    toggle.enabled = false;
    expect(toggle.node.onPointer?.({ kind: 'pointer_down', point: { x: 20, y: 15 }, button: 0 }, toggle.node)).toBe(false);
    expect(toggle.value).toBe(true);
  });
});
