import { describe, expect, it } from 'vitest';
import {
  fitPixelText,
  fontMetrics,
  layoutPixelTextInRect,
  measurePixelText,
  panelSlice,
  type PixelUi,
} from './pixel-ui.js';

describe('pixel UI authored metadata', () => {
  it('uses propagated glyph dimensions instead of the body-font constants', () => {
    const asset = {
      font: {
        charset: ' AB',
        glyphSize: [8, 12] as const,
        cellSize: [9, 13] as const,
        columns: 16,
      },
    };
    expect(fontMetrics(asset)).toMatchObject({ glyphWidth: 8, glyphHeight: 12, cellWidth: 9, cellHeight: 13 });
    expect(measurePixelText('AB', 1, asset)).toBe(17);
  });

  it('uses the authored asymmetric 9-slice inset', () => {
    expect(panelSlice({ slice: [2, 3, 4, 5] })).toEqual([2, 3, 4, 5]);
    expect(panelSlice()).toEqual([4, 4, 4, 4]);
  });

  it('ellipsizes to the exact bitmap width, including extremely narrow faces', () => {
    expect(fitPixelText('A VERY LONG LABEL', 41)).toBe('A VE...');
    expect(measurePixelText(fitPixelText('A VERY LONG LABEL', 41))).toBeLessThanOrEqual(41);
    expect(fitPixelText('LONG', 11)).toBe('..');
    expect(fitPixelText('LONG', 5)).toBe('.');
    expect(fitPixelText('LONG', 0)).toBe('');
  });

  it('aligns fitted text inside a padded face rather than its outer chrome', () => {
    const layout = layoutPixelTextInRect({} as PixelUi, 'TOO LONG FOR HERE', {
      x: 10, y: 20, width: 80, height: 22,
    }, { align: 'center', verticalAlign: 'center', paddingX: 6, paddingY: 2 });
    expect(layout.content).toEqual({ x: 16, y: 22, width: 68, height: 18 });
    expect(layout.x).toBe(50);
    expect(layout.y).toBe(27);
    expect(layout.overflowed).toBe(true);
    expect(layout.renderedWidth).toBe(measurePixelText(layout.text));
    expect(measurePixelText(layout.text)).toBeLessThanOrEqual(layout.content.width);
  });
});
