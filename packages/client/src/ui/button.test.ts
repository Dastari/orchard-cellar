import { describe, expect, it, vi } from 'vitest';
import type { PixelUi } from '../render/pixel-ui.js';
import { BUTTON_HEIGHT, CanvasButton, buttonLabelTop } from './button.js';
import type { UiSkin } from './skin.js';

describe('semantic canvas button', () => {
  const fonts = { font: { font: { glyphSize: [5, 7], cellSize: [6, 8], columns: 16 } } } as unknown as PixelUi;

  it('reserves regular padding and centers labels above the lower bevel', () => {
    expect(BUTTON_HEIGHT.regular).toBe(22);
    expect(buttonLabelTop({ x: 0, y: 10, width: 100, height: 22 }, fonts)).toBe(16);
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
});
