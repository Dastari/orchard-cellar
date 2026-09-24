import { coinPurseFromBronze } from '@orchard/sim';
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
/** Width of the coin row for a balance: a 14px coin, its digits and a 4px gap per denomination. */
export function uiPurseCoinsWidth(balance: bigint): number {
  const purse = coinPurseFromBronze(balance);
  return [purse.gold, purse.silver, purse.bronze].reduce((sum: number, value) => sum + 14 + String(value).length * 6 + 4, 0);
}
/** Preferred purse plate width: coins, the pack button and the plate's padding. */
export function uiPurseWidth(balance: bigint): number { return uiPurseCoinsWidth(balance) + 20 + 18; }
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
      const purse = coinPurseFromBronze(balance), y = r.y + Math.floor((r.height - 14) / 2);
      context.save(); context.beginPath(); context.rect(r.x + 4, r.y, Math.max(0, r.width - 28), r.height); context.clip();
      let x = r.x + 7;
      for (const [coin, value] of [['gold', purse.gold], ['silver', purse.silver], ['bronze', purse.bronze]] as const) {
        paintUiSkin(context, art.skin.icon, `coin.${coin}`, { x, y, width: 14, height: 14 });
        drawPixelText(context, art.pixel, String(value), x + 15, y + 4, { color: '#3f2832' }); x += 14 + String(value).length * 6 + 4;
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
