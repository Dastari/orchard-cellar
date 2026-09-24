import { coinPurseFromBronze } from '@orchard/sim';
import { drawPixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_ITEM_INKS, UI_TEXT_METRICS } from '../tokens.js';
import { paintUiSkin, uiElementTextContrast } from './art.js';

export const UI_COIN_UNITS = ['gold', 'silver', 'bronze'] as const;
export type UiCoinUnit = typeof UI_COIN_UNITS[number];
export interface UiCurrencyPart { readonly unit: UiCoinUnit; readonly value: bigint }
export interface UiCurrencyOptions {
  readonly id?: string;
  /** Canonical amount in bronze. 100 bronze = 1 silver; 100 silver = 1 gold. */
  readonly bronze: bigint | number;
  readonly layout?: UiStyle;
}
/** Coin icons are 14×14 (`icon.coin.<unit>` crops the 16×16 source cell). */
export const UI_COIN_SIZE = 14;
const NUMBER_GAP = 2, GROUP_GAP = 5;
const glyph = UI_TEXT_METRICS.body;
const textWidth = (text: string) => Math.max(0, text.length * (glyph.glyphWidth + 1) - 1);

function canonicalBronze(value: bigint | number): bigint {
  if (typeof value === 'bigint') return value;
  return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
}
/** Gold, silver and bronze from the first nonzero unit. Inner zeros stay
 * (1g 0s 5b); zero or negative amounts are a single `0` bronze group. */
export function uiCurrencyParts(bronze: bigint | number): readonly UiCurrencyPart[] {
  const purse = coinPurseFromBronze(canonicalBronze(bronze));
  const all: UiCurrencyPart[] = [{ unit: 'gold', value: purse.gold }, { unit: 'silver', value: BigInt(purse.silver) }, { unit: 'bronze', value: BigInt(purse.bronze) }];
  const first = all.findIndex(part => part.value > 0n);
  return first < 0 ? [all[2]!] : all.slice(first);
}
/** Accessible text for a currency amount, for example `3g 6s 25b`. */
export function uiCurrencyLabel(bronze: bigint | number): string {
  return uiCurrencyParts(bronze).map(part => `${part.value}${part.unit[0]}`).join(' ');
}
function measureParts(parts: readonly UiCurrencyPart[]): number {
  return parts.reduce((sum, part, index) => sum + textWidth(String(part.value)) + NUMBER_GAP + UI_COIN_SIZE + (index < parts.length - 1 ? GROUP_GAP : 0), 0);
}
/** Text ink for amounts. On the dark item tooltip surface this is the item body
 * ink; elsewhere it is the nearest tonal surface's contrast ink (kit rule D5). */
function currencyInk(element: UiElement): string {
  for (let node: UiElement | null = element; node; node = node.parent) if (node.props['itemInks'] === true) return UI_ITEM_INKS.body;
  return uiElementTextContrast(element).color;
}
/** An amount shown as number-then-coin groups, omitting leading zero units. */
export function uiCurrency(options: UiCurrencyOptions): UiElement {
  return new UiElement({ id: options.id, kind: 'currency', label: uiCurrencyLabel(options.bronze), props: { bronze: canonicalBronze(options.bronze) },
    style: { height: uiFixed(UI_COIN_SIZE), shrink: 0, ...options.layout },
    measure(element) {
      const parts = uiCurrencyParts(element.props['bronze'] as bigint);
      element.label = uiCurrencyLabel(element.props['bronze'] as bigint);
      const width = measureParts(parts);
      return { min: { width, height: UI_COIN_SIZE }, preferred: { width, height: UI_COIN_SIZE } };
    },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect, color = currencyInk(element), textY = r.y + Math.floor((UI_COIN_SIZE - glyph.glyphHeight) / 2);
      let x = r.x;
      for (const part of uiCurrencyParts(element.props['bronze'] as bigint)) {
        const label = String(part.value);
        drawPixelText(context, art.pixel, label, x, textY, { color });
        x += textWidth(label) + NUMBER_GAP;
        const key = `coin.${part.unit}`;
        if (!art.missingArt && art.skin.icon[key]) paintUiSkin(context, art.skin.icon, key, { x, y: r.y, width: UI_COIN_SIZE, height: UI_COIN_SIZE });
        x += UI_COIN_SIZE + GROUP_GAP;
      }
    },
  });
}
