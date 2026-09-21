import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import { paintUiSkin } from './art.js';
/** Compact progress primitive used by the original acceptance composition. */
export function uiProgress(options: { readonly id?: string; readonly tone?: UiTone; readonly value: number; readonly layout?: UiStyle }): UiElement {
  const tone = options.tone ?? 'primary';
  return new UiElement({ id: options.id, kind: 'progress', label: 'Progress', props: { tone, value: options.value },
    style: { width: 'grow', height: uiFixed(8), shrink: 0, ...options.layout },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect, value = Math.max(0, Math.min(1, Number(element.props['value']) || 0));
      paintUiSkin(context, art.skin.meter, 'meter_track_dark.idle', r);
      context.fillStyle = UI_TONE_FACES[tone].frame.face; context.fillRect(r.x + 3, r.y + 3, Math.floor(Math.max(0, r.width - 6) * value), Math.max(0, r.height - 6));
    },
  });
}
