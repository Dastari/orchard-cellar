import type { UiPoint } from '../../geometry.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { measureUiElement } from '../layout/measure.js';
import { uiFrame } from './frame.js';
import { uiText } from './text.js';

export interface UiHudTooltipOptions {
  readonly text: string | null;
  readonly anchor: UiPoint;
}
/** Compact contextual label above a HUD anchor. Long labels wrap within the
 * viewport; its tonal frame supplies both padding and text contrast. */
export function uiHudTooltip(options: UiHudTooltipOptions) {
  let model = options;
  const text = uiText('', { id: 'hud.tooltip.text', wrap: true, align: 'center', layout: { width: 'fit' } });
  const frame = uiFrame({ id: 'hud.tooltip.frame', style: 'thin', tone: 'primary',
    layout: { position: 'absolute', height: 'fit' }, children: [text] });
  const element = new UiElement({ id: 'hud.tooltip', kind: 'hud-tooltip', children: [frame],
    style: { position: 'fixed', display: 'stack', width: 'grow', height: 'grow', zLayer: 'toast' },
    measure(_element, available) {
      const value = model.text; frame.setStyle({ visible: Boolean(value) });
      if (value) {
        text.setProps({ text: value });
        const maximum = Math.max(0, available.width - 16);
        const measured = measureUiElement(text, { width: Math.max(0, maximum - 16), height: available.height }).preferred;
        const width = Math.min(maximum, Math.max(104, measured.width + 16));
        frame.setStyle({ width: uiFixed(width), height: 'fit' });
        const height = Math.min(available.height, measureUiElement(frame, { width, height: available.height }).preferred.height);
        const anchor = model.anchor;
        frame.setStyle({ height: uiFixed(height), inset: {
          left: uiFixed(Math.max(0, Math.min(available.width - width, anchor.x - width / 2))),
          top: uiFixed(Math.max(0, Math.min(available.height - height, anchor.y - height))),
        } });
      }
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
  return Object.assign(element, { updateHudTooltip(next: UiHudTooltipOptions) {
    if (model.text === next.text && model.anchor.x === next.anchor.x && model.anchor.y === next.anchor.y) return;
    model = next; element.invalidate();
  } });
}
