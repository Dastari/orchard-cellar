import { drawOutlinedPixelText, measurePixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { paintUiSkin } from './art.js';

/** Pixel disc: stepped circle rows, the same way the pack's round buttons are drawn. */
function disc(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, fill: string, edge?: string): void {
  for (let y = -radius; y <= radius; y++) {
    const half = Math.floor(Math.sqrt(radius * radius - y * y));
    if (edge) { context.fillStyle = edge; context.fillRect(cx - half, cy + y, half * 2 + 1, 1); }
    const inner = edge ? Math.floor(Math.sqrt(Math.max(0, (radius - 1) * (radius - 1) - y * y))) : half;
    if (!edge || Math.abs(y) < radius) { context.fillStyle = fill; context.fillRect(cx - inner, cy + y, inner * 2 + 1, 1); }
  }
}

/** Movement pad: a translucent parchment well with a peach knob, drawn at the thumb's rest position. */
export function uiTouchPad(options: { readonly size?: number; readonly knob?: { readonly x: number; readonly y: number } }): UiElement {
  const size = options.size ?? 72;
  return new UiElement({ kind: 'touch-pad', label: 'Movement pad', style: { width: uiFixed(size), height: uiFixed(size), shrink: 0 },
    paint(element, { context }) {
      const r = element.rect, c = { x: r.x + size / 2, y: r.y + size / 2 }, radius = Math.floor(size / 2) - 1;
      context.save(); context.globalAlpha *= .55; disc(context, c.x, c.y, radius, '#f6ca9f', '#3f2832'); context.restore();
      disc(context, c.x, c.y, radius - 10, 'rgba(184, 111, 80, 0.35)');
      const knob = { x: c.x + (options.knob?.x ?? 0) * (radius - 14), y: c.y + (options.knob?.y ?? 0) * (radius - 14) };
      disc(context, knob.x, knob.y + 1, 13, '#743f39'); disc(context, knob.x, knob.y, 13, '#e4a672', '#3f2832'); disc(context, knob.x - 3, knob.y - 3, 4, '#f6ca9f');
    } });
}

/** A round thumb action: tone face, a symbol and its keyboard letter; cooldown sweeps a dark wedge. */
export function uiTouchAction(options: { readonly label: string; readonly key?: string; readonly icon?: string; readonly tone?: 'primary' | 'success' | 'info' | 'danger'; readonly size?: number; readonly cooldown?: number }): UiElement {
  const size = options.size ?? 36;
  const faces = { primary: ['#e4a672', '#b86f50'], success: ['#63c74d', '#3e8948'], info: ['#2ce8f5', '#0095e9'], danger: ['#f6757a', '#e43b44'] } as const;
  return new UiElement({ kind: 'button', label: options.key ? `${options.label} (${options.key})` : options.label, focusable: true, style: { width: uiFixed(size), height: uiFixed(size), shrink: 0 },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect, c = { x: r.x + size / 2, y: r.y + size / 2 }, radius = Math.floor(size / 2) - 1, [face, shade] = faces[options.tone ?? 'primary'];
      disc(context, c.x, c.y + 2, radius, '#3f2832'); disc(context, c.x, c.y + 1, radius, shade, '#3f2832'); disc(context, c.x, c.y, radius - 1, face);
      if (options.cooldown) { context.fillStyle = 'rgba(63, 40, 50, 0.55)'; for (let y = -radius; y <= radius; y++) { const half = Math.floor(Math.sqrt(radius * radius - y * y)); const cut = y + radius < options.cooldown * radius * 2 ? half * 2 + 1 : 0; context.fillRect(c.x - half, c.y + y, cut, 1); } }
      if (options.icon) paintUiSkin(context, art.skin.icon, options.icon, { x: c.x - 8, y: c.y - 10, width: 16, height: 16 });
      const key = options.key ?? options.label, w = measurePixelText(key, 1, art.pixel.font);
      drawOutlinedPixelText(context, art.pixel, key, c.x - Math.floor(w / 2), options.icon ? c.y + 5 : c.y - 4, { color: '#fff6e0', outlineColor: '#3f2832' });
    } });
}
