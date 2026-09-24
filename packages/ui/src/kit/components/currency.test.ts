import { describe, expect, it } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { UI_SKIN_MANIFEST } from '../skin/manifest.js';
import { UI_COIN_SIZE, uiCurrency, uiCurrencyLabel, uiCurrencyParts } from './currency.js';
import { ui } from './index.js';

const parts = (bronze: bigint | number) => uiCurrencyParts(bronze).map(part => [part.unit, part.value]);

describe('currency', () => {
  it('splits canonical bronze into gold, silver and bronze', () => {
    expect(parts(30625n)).toEqual([['gold', 3n], ['silver', 6n], ['bronze', 25n]]);
    expect(parts(30625)).toEqual([['gold', 3n], ['silver', 6n], ['bronze', 25n]]);
    expect(uiCurrencyLabel(30625n)).toBe('3g 6s 25b');
  });
  it('omits zero units so prices read 5 gold rather than 5 gold 0 silver 0 bronze', () => {
    expect(parts(250n)).toEqual([['silver', 2n], ['bronze', 50n]]);
    expect(parts(7n)).toEqual([['bronze', 7n]]);
    expect(parts(10005n)).toEqual([['gold', 1n], ['bronze', 5n]]);
    expect(parts(20000n)).toEqual([['gold', 2n]]);
    expect(uiCurrencyLabel(250)).toBe('2s 50b');
  });
  it('shows zero, negative and non-finite amounts as a single zero bronze', () => {
    for (const value of [0n, 0, -5n, Number.NaN]) expect(parts(value)).toEqual([['bronze', 0n]]);
    expect(uiCurrencyLabel(0n)).toBe('0b');
  });
  it('keeps large bigint balances exact', () => {
    expect(parts(123456789012345678901234n)[0]).toEqual(['gold', 12345678901234567890n]);
  });
  it('measures number-then-coin groups and grows with the shown units', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(200, 40);
    const measure = (bronze: bigint) => { const node = root.mount(uiCurrency({ bronze })); root.arrange(); const size = { width: node.rect.width, height: node.rect.height }; root.unmount(node); return size; };
    const zero = measure(0n), silver = measure(250n), gold = measure(30625n);
    // "0" (5) + 2 + coin.
    expect(zero).toEqual({ width: 5 + 2 + UI_COIN_SIZE, height: UI_COIN_SIZE });
    // "2" + coin + 5 + "50" + coin.
    expect(silver.width).toBe(5 + 2 + UI_COIN_SIZE + 5 + 11 + 2 + UI_COIN_SIZE);
    expect(gold.width).toBeGreaterThan(silver.width);
    root.dispose();
  });
  it('is registered as ui.currency and uses cropped coin skin entries', () => {
    expect(ui.currency).toBe(uiCurrency);
    for (const unit of ['gold', 'silver', 'bronze'] as const) {
      const entry = UI_SKIN_MANIFEST.icon[`coin.${unit}`];
      expect(entry.asset).toBe(`ui_cf_coin_${unit}`);
      expect(entry.crop).toEqual([1, 1, UI_COIN_SIZE, UI_COIN_SIZE]);
    }
  });
});
