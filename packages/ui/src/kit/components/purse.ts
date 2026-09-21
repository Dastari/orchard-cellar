import { coinPurseFromBronze } from '@orchard/sim';
import { UiElement } from '../runtime/element.js';
import type { UiStyle } from '../layout/box.js';
import { uiButton } from './button.js';
import { uiIcon } from './media.js';
import { uiTooltip } from './tooltip.js';
export interface UiPurseOptions {
  readonly id?: string;
  readonly balance: bigint;
  readonly onOpen: () => void;
  readonly layout?: UiStyle;
}
export function uiPurseLabel(balance: bigint): string {
  const purse = coinPurseFromBronze(balance);
  return `${purse.gold}g ${purse.silver}s ${purse.bronze}b`;
}
/** Canonical bronze remains bigint; denominations are presentation only. */
export function uiPurse(options: UiPurseOptions): UiElement {
  let label = uiPurseLabel(options.balance);
  const button = uiButton({ id: options.id ? `${options.id}:button` : undefined, label, ariaLabel: `Inventory · ${label}`,
    tone: 'primary', trailing: uiIcon({ cf: 'backpack' }), activateOn: 'down', onPress: options.onOpen,
    layout: { width: 'grow', height: 'grow' },
  });
  const tooltip = uiTooltip(() => `Inventory · ${label}`, button, { width: 'grow', height: 'grow' });
  return new UiElement({ id: options.id, kind: 'purse', props: { balance: options.balance },
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout }, children: [tooltip],
    measure(element) {
      const next = uiPurseLabel(element.props['balance'] as bigint);
      if (next !== label) { label = next; button.setProps({ label }, false); button.label = `Inventory · ${label}`; tooltip.invalidate(); }
      return { min: { width: 0, height: 0 }, preferred: { width: 112, height: 24 } };
    },
  });
}
