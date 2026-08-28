import { describe, expect, it } from 'vitest';
import { measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import { fitRibbonLabel, ribbonTextFace, ribbonWidth } from './ribbon.js';

const fonts = {} as PixelUi;

describe('bounded ribbon text', () => {
  it('grows an unconstrained ribbon to retain the complete label', () => {
    expect(ribbonWidth('MENU', fonts)).toBe(78);
    expect(ribbonWidth('AN EXTREMELY LONG WINDOW TITLE', fonts))
      .toBe(measurePixelText('AN EXTREMELY LONG WINDOW TITLE') + 64);
  });

  it('ellipsizes fixed ribbon labels inside the folded-tail safe face', () => {
    const rect = { x: 10, y: 20, width: 120, height: 21 };
    expect(ribbonTextFace(rect)).toEqual({ x: 37, y: 23, width: 66, height: 10 });
    const fitted = fitRibbonLabel('A TITLE THAT CANNOT LEAVE ITS RIBBON', rect.width, fonts);
    expect(fitted).toMatch(/\.\.\.$/u);
    expect(measurePixelText(fitted)).toBeLessThanOrEqual(ribbonTextFace(rect).width);
  });

  it('returns no glyphs when a ribbon has no writable middle face', () => {
    expect(fitRibbonLabel('TITLE', 30, fonts)).toBe('');
    expect(ribbonTextFace({ x: 0, y: 0, width: 30, height: 7 }).width).toBe(0);
  });
});
