import { describe, expect, it } from 'vitest';
import { fontMetrics, measurePixelText, panelSlice } from './pixel-ui.js';

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
});
