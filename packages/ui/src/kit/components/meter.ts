import { clampProgress } from '../../progress-bar.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { UI_TONE_FACES } from '../skin/contrast.js';
import { paintUiSkin } from './art.js';
export interface UiMeterOptions { readonly id?: string; readonly label: string; readonly value: number | (() => number); readonly tone?: UiTone; readonly reversed?: boolean; readonly variant?: 'pill' | 'thin' | 'segmented' | 'vitals' | 'resource'; readonly layout?: UiStyle }
export function uiMeter(options: UiMeterOptions): UiElement {
  const variant = options.variant ?? 'pill', tone = options.tone ?? 'success';
  return new UiElement({ id: options.id, kind: 'meter', label: options.label, props: { value: options.value, tone, variant },
    style: { width: variant === 'vitals' ? uiFixed(48) : 'grow', height: uiFixed(variant === 'vitals' ? 24 : variant === 'thin' ? 6 : 8), shrink: 0, ...options.layout },
    paint(element, { context, art }) {
      if (!art) return; const tone = element.props['tone'] as UiTone; const r = element.rect, source = element.props['value'], value = clampProgress(typeof source === 'function' ? source() : Number(source));
      if (variant === 'resource') {
        const color = tone === 'danger' ? 'red' : tone === 'info' ? 'blue' : tone === 'warning' ? 'gold' : 'green';
        const width = Math.floor(r.width * value), left = options.reversed ? r.x + r.width - width : r.x;
        context.save(); context.beginPath(); context.rect(left, r.y, width, r.height); context.clip();
        if (options.reversed) { context.translate(r.x * 2 + r.width, 0); context.scale(-1, 1); }
        paintUiSkin(context, art.skin.feedback, `bar_fill_${color}.base.0`, r); context.restore(); return;
      }
      if (variant === 'vitals') {
        paintUiSkin(context, art.skin.meter, 'kit_vitals_compact.idle.0', r);
        const color = tone === 'danger' ? 'red' : tone === 'info' ? 'blue' : tone === 'warning' ? 'gold' : 'green';
        context.save(); context.beginPath(); context.rect(r.x + 16, r.y + 5, Math.round(30 * value), 5); context.clip();
        paintUiSkin(context, art.skin.feedback, `bar_fill_${color}.base.0`, { x: r.x + 16, y: r.y + 5, width: 30, height: 5 }); context.restore(); return;
      }
      const track = variant === 'thin' ? { ...r, height: 6 } : { ...r, height: 8 };
      if (variant === 'thin') paintUiSkin(context, art.skin.slider, 'slider_track.base.5', track);
      else paintUiSkin(context, art.skin.meter, 'meter_track_dark.idle', track);
      const inset = variant === 'thin' ? 2 : 3, width = Math.floor(Math.max(0, r.width - inset * 2) * value);
      const left = options.reversed ? r.x + r.width - inset - width : r.x + inset;
      context.fillStyle = UI_TONE_FACES[tone].frame.face;
      if (variant === 'segmented') for (let x = 0; x < width; x += 6) context.fillRect(left + x, r.y + inset, Math.min(4, width - x), track.height - inset * 2);
      else context.fillRect(left, r.y + inset, width, track.height - inset * 2);
    },
  });
}
export const uiProgressBar = uiMeter;
