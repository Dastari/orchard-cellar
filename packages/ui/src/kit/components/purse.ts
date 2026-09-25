import { coinPurseFromBronze } from '@orchard/sim/commerce';
import { UiElement } from '../runtime/element.js';
import type { UiStyle } from '../layout/box.js';
import { drawPixelText } from '../../pixel-ui.js';
import { uiButton } from './button.js';
import { paintUiSkin } from './art.js';
import { uiTooltip } from './tooltip.js';
export interface UiPurseOptions {
  readonly id?: string;
  readonly balance: bigint;
  readonly onOpen: () => void;
  readonly activateOn?: 'down' | 'up';
  readonly layout?: UiStyle;
}
export function uiPurseLabel(balance: bigint): string {
  const purse = coinPurseFromBronze(balance);
  return `${purse.gold}g ${purse.silver}s ${purse.bronze}b`;
}
type PurseCoin = readonly ['gold' | 'silver' | 'bronze', string];
/** A 14px coin, a 1px gap and its digits, with 2px between denominations. */
const coinWidth = (coins: readonly PurseCoin[]) => coins.reduce((sum, [, text]) => sum + 15 + text.length * 6, 0) + Math.max(0, coins.length - 1) * 2;
/** Width of the coin row for a balance. */
export function uiPurseCoinsWidth(balance: bigint): number {
  const purse = coinPurseFromBronze(balance);
  return coinWidth([['gold', String(purse.gold)], ['silver', String(purse.silver)], ['bronze', String(purse.bronze)]]);
}
/** The plate's fixed parts: 7px before the coins and the 22px pack button after them. */
const PURSE_CHROME = 29;
/** Preferred purse plate width: coins, the pack button and the plate's padding. */
export function uiPurseWidth(balance: bigint): number { return uiPurseCoinsWidth(balance) + PURSE_CHROME; }
const shortCount = (value: bigint): string => {
  for (const [unit, size] of [['B', 1_000_000_000n], ['M', 1_000_000n], ['K', 1_000n]] as const) if (value >= size * 10n) return `${value / size}${unit}`;
  return String(value);
};
/** Compact text form: each count followed by its coin's letter, 2px between denominations. */
const textWidth = (coins: readonly PurseCoin[]) => coins.reduce((sum, [, text]) => sum + (text.length + 1) * 6, 0) + Math.max(0, coins.length - 1) * 2;
/** How a purse of `width` shows a balance: coin icons with every denomination when there is room; otherwise the
 * compact text form (1234g56s78b, each letter in its coin's colour); only then do the lowest denominations drop
 * away and the gold count shorten (12K, 3M), so a narrow purse never cuts a number in half. */
export function uiPurseFace(balance: bigint, width: number): { readonly mode: 'coins' | 'text'; readonly coins: readonly PurseCoin[] } {
  const purse = coinPurseFromBronze(balance);
  let coins: PurseCoin[] = [['gold', String(purse.gold)], ['silver', String(purse.silver)], ['bronze', String(purse.bronze)]];
  if (coinWidth(coins) <= width) return { mode: 'coins', coins };
  while (coins.length > 1 && textWidth(coins) > width) coins = coins.slice(0, -1);
  if (textWidth(coins) > width) coins = [['gold', shortCount(BigInt(purse.gold))]];
  return { mode: 'text', coins };
}
/** The denominations a purse of `width` shows. */
export function uiPurseCoins(balance: bigint, width: number): readonly PurseCoin[] { return uiPurseFace(balance, width).coins; }
const COIN_INKS = { gold: '#c77b12', silver: '#5d6b85', bronze: '#9e5a3a' } as const;
/** Canonical bronze remains bigint; denominations are presentation only.
 * Coins sit on a thin parchment plate beside the pack symbol: the purse is also the inventory shortcut. */
export function uiPurse(options: UiPurseOptions): UiElement {
  let label = uiPurseLabel(options.balance);
  let balance = options.balance;
  const button = uiButton({ id: options.id ? `${options.id}:button` : undefined, label, ariaLabel: `Inventory · ${label}`,
    tone: 'primary', get activateOn() { return options.activateOn ?? 'down'; }, onPress: options.onOpen,
    layout: { width: 'grow', height: 'grow', padding: 0 },
    face: (element, { context, art, hovered, focused, pressed }) => {
      const r = element.rect; paintUiSkin(context, art.skin.frame, 'thin', r);
      const y = r.y + Math.floor((r.height - 14) / 2);
      context.save(); context.beginPath(); context.rect(r.x + 4, r.y, Math.max(0, r.width - 26), r.height); context.clip();
      let x = r.x + 7;
      const face = uiPurseFace(balance, r.width - PURSE_CHROME);
      for (const [coin, text] of face.coins) {
        if (face.mode === 'coins') {
          paintUiSkin(context, art.skin.icon, `coin.${coin}`, { x, y, width: 14, height: 14 });
          drawPixelText(context, art.pixel, text, x + 15, y + 4, { color: '#3f2832' }); x += 15 + text.length * 6 + 2;
        } else {
          drawPixelText(context, art.pixel, text, x, y + 4, { color: '#3f2832' });
          drawPixelText(context, art.pixel, coin[0]!, x + text.length * 6, y + 4, { color: COIN_INKS[coin] }); x += (text.length + 1) * 6 + 2;
        }
      }
      context.restore();
      paintUiSkin(context, art.skin.icon, 'hud.backpack', { x: r.x + r.width - 22, y: r.y + Math.floor((r.height - 16) / 2) + (hovered || focused ? -1 : 0) + (pressed ? 1 : 0), width: 16, height: 16 });
      if (focused || hovered) { context.fillStyle = focused ? '#fff6e0' : '#feae34'; context.fillRect(r.x + r.width - 21, r.y + r.height - 3, 14, 1); }
    },
  });
  const tooltip = uiTooltip(() => `Inventory · ${label}`, button, { width: 'grow', height: 'grow' });
  return new UiElement({ id: options.id, kind: 'purse', props: { balance: options.balance },
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout }, children: [tooltip],
    measure(element) {
      balance = element.props['balance'] as bigint;
      const next = uiPurseLabel(balance);
      if (next !== label) { label = next; button.setProps({ label }, false); button.label = `Inventory · ${label}`; tooltip.invalidate(); }
      return { min: { width: 0, height: 0 }, preferred: { width: uiPurseWidth(balance), height: 24 } };
    },
  });
}
