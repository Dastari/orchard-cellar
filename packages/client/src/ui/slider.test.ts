import { describe, expect, it, vi } from 'vitest';
import type { UiSkin } from './skin.js';
import { clampSliderValue, Slider, sliderValueAtPoint } from './slider.js';

describe('Slider', () => {
  it('clamps values and maps pointer positions across its bounds', () => {
    const bounds = { x: 10, y: 4, width: 100, height: 14 };
    expect(clampSliderValue(-0.1)).toBe(0);
    expect(clampSliderValue(1.1)).toBe(1);
    expect(sliderValueAtPoint(bounds, 10)).toBe(0);
    expect(sliderValueAtPoint(bounds, 60)).toBe(0.5);
    expect(sliderValueAtPoint(bounds, 110)).toBe(1);
  });

  it('shares pointer drag and wheel behavior through its widget node', () => {
    const onChange = vi.fn();
    const slider = new Slider({ id: 'volume', skin: {} as UiSkin, value: 0.5, onChange });
    slider.setBounds({ x: 10, y: 4, width: 100, height: 14 });

    expect(slider.node.onPointer?.({ kind: 'pointer_down', point: { x: 35, y: 10 }, button: 0 }, slider.node)).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(0.25);
    expect(slider.pointerMove({ x: 85, y: 10 })).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(0.75);
    expect(slider.pointerUp({ x: 110, y: 10 })).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(1);

    slider.node.onWheel?.({ point: { x: 50, y: 10 }, deltaX: 0, deltaY: 1 }, slider.node);
    expect(onChange).toHaveBeenLastCalledWith(0.95);
  });
});
