import { describe, expect, it, vi } from 'vitest';
import type { PixelUi } from '../render/pixel-ui.js';
import { measurePixelText } from '../render/pixel-ui.js';
import {
  BUTTON_HEIGHT,
  CanvasButton,
  buttonLabelTop,
  buttonTextFace,
  fitButtonLabel,
  smallButtonIconRect,
} from './button.js';
import type { UiSkin } from './skin.js';

describe('semantic canvas button', () => {
  const fonts = { font: { font: { glyphSize: [5, 7], cellSize: [6, 8], columns: 16 } } } as unknown as PixelUi;

  it('reserves regular padding and centers labels above the lower bevel', () => {
    expect(BUTTON_HEIGHT.regular).toBe(22);
    expect(buttonLabelTop({ x: 0, y: 10, width: 100, height: 22 }, fonts)).toBe(16);
    expect(buttonLabelTop({ x: 0, y: 10, width: 100, height: 22 }, fonts, 'regular', 'pressed')).toBe(17);
    expect(buttonLabelTop({ x: 0, y: 10, width: 100, height: 22 }, fonts, 'regular', 'disabled')).toBe(18);
    expect(buttonTextFace({ x: 0, y: 10, width: 100, height: 22 }, 'disabled'))
      .toEqual({ x: 8, y: 15, width: 84, height: 13 });
  });

  it('owns a retained action node with the semantic minimum height', () => {
    const onPress = vi.fn();
    const button = new CanvasButton({
      id: 'test.danger', skin: {} as UiSkin, fonts, label: 'RESET', tone: 'danger', onPress,
    });
    expect(button.node.minSize.height).toBe(BUTTON_HEIGHT.regular);
    button.setBounds({ x: 2, y: 3, width: 80, height: BUTTON_HEIGHT.regular });
    expect(button.node.onPointer?.({ kind: 'pointer_down', point: { x: 5, y: 5 }, button: 0 }, button.node)).toBe(true);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('keeps labels inside the usable button width', () => {
    expect(fitButtonLabel('RESET TREE 0C', { x: 0, y: 0, width: 100, height: 22 }, fonts))
      .toBe('RESET TREE 0C');
    expect(fitButtonLabel('A VERY LONG BUTTON LABEL', { x: 0, y: 0, width: 60, height: 22 }, fonts))
      .toMatch(/\.\.\.$/);
    const tiny = fitButtonLabel('LONG', { x: 0, y: 0, width: 18, height: 22 }, fonts);
    expect(measurePixelText(tiny, 1, fonts.font)).toBeLessThanOrEqual(6);
  });

  it('keeps editor icons small and centred in the authored round face', () => {
    expect(smallButtonIconRect({ x: 10, y: 20, width: 32, height: 32 }))
      .toEqual({ x: 19, y: 29, width: 14, height: 14 });
    expect(smallButtonIconRect({ x: 10, y: 20, width: 32, height: 32 }, 'pressed').y).toBe(30);
  });
});
