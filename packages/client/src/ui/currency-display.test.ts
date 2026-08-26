import { describe, expect, it } from 'vitest';
import type { PixelUi } from '../render/pixel-ui.js';
import { CurrencyDisplay } from './currency-display.js';
import type { UiSkin } from './skin.js';

describe('currency display', () => {
  const fonts = { font: { font: { cellSize: [6, 8], glyphSize: [5, 7], columns: 16 } } } as unknown as PixelUi;

  it('supports compact costs and all-denomination wallet displays at several sizes', () => {
    const display = new CurrencyDisplay({} as UiSkin, fonts);
    const compact = display.measure(450n, { size: 'small', includeZero: false });
    const wallet = display.measure(10_450n, { size: 'small', includeZero: true });
    const large = display.measure(10_450n, { size: 'large', includeZero: true });
    expect(compact.width).toBeLessThan(wallet.width);
    expect(large.width).toBeGreaterThan(wallet.width);
    expect(large.height).toBe(16);
  });
});
