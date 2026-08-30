import { describe, expect, it, vi } from 'vitest';
import type { PixelUi } from '../render/pixel-ui.js';
import type { UiSkin } from './skin.js';
import { TOGGLE_ANIMATION_DURATION_MS, Toggle, toggleFrameIndex, toggleSwitchRect } from './toggle.js';

describe('Toggle', () => {
  it('uses all four authored transition frames in either direction', () => {
    expect(toggleFrameIndex(true, 0)).toBe(0);
    expect(toggleFrameIndex(true, TOGGLE_ANIMATION_DURATION_MS / 2)).toBe(2);
    expect(toggleFrameIndex(true, TOGGLE_ANIMATION_DURATION_MS)).toBe(3);
    expect(toggleFrameIndex(false, 0)).toBe(3);
    expect(toggleFrameIndex(false, TOGGLE_ANIMATION_DURATION_MS)).toBe(0);
    expect(toggleSwitchRect({ x: 10, y: 20, width: 52, height: 18 }))
      .toEqual({ x: 21, y: 22, width: 30, height: 14 });
  });

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
