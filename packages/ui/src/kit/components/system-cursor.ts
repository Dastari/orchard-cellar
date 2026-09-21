import { UiElement } from '../runtime/element.js';
import type { UiPoint } from '../../geometry.js';
import { paintUiSkin } from './art.js';

export interface UiSystemCursorOptions {
  readonly point: () => UiPoint;
  readonly clickedAt: () => number;
}
/** The hotspot remains at the pointer even at viewport edges; root clipping
 * trims art rather than shifting it away from its input position. */
export function uiSystemCursor(options: UiSystemCursorOptions): UiElement {
  let point = { x: 0, y: 0 };
  return new UiElement({ id: 'hud.system-cursor', kind: 'system-cursor',
    style: { position: 'fixed', width: 'grow', height: 'grow', zLayer: 'cursor' },
    onPlace(element) {
      const next = options.point(); point = { x: Math.round(next.x), y: Math.round(next.y) };
      element.setProps({ hotspot: point }, false);
    },
    paint(_element, { context, art, now, reducedMotion }) {
      if (!art) return;
      paintUiSkin(context, art.skin.cursor, 'cursor.idle.0', { ...point, width: 16, height: 16 });
      const elapsed = now - options.clickedAt();
      if (elapsed >= 0 && elapsed < 280) paintUiSkin(context, art.skin.cursor,
        `cursor_click.click.${reducedMotion ? 0 : Math.min(3, Math.floor(elapsed / 70))}`,
        { x: point.x - 8, y: point.y - 8, width: 16, height: 16 });
    },
  });
}
