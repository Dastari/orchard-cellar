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

type UiTouchArt = NonNullable<Parameters<NonNullable<UiElement['hooks']['paint']>>[1]['art']>;
export type UiTouchTone = 'primary' | 'success' | 'info' | 'danger';
const TOUCH_FACES = { primary: ['#e4a672', '#b86f50'], success: ['#63c74d', '#3e8948'], info: ['#2ce8f5', '#0095e9'], danger: ['#f6757a', '#e43b44'] } as const;

/** The movement pad well: a translucent parchment disc filling `r`. */
export function paintUiTouchPad(context: CanvasRenderingContext2D, r: { x: number; y: number; width: number; height: number }): void {
  const size = Math.min(r.width, r.height), c = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }, radius = Math.floor(size / 2) - 1;
  context.save(); context.globalAlpha *= .55; disc(context, c.x, c.y, radius, '#f6ca9f', '#3f2832'); context.restore();
  disc(context, c.x, c.y, Math.max(0, radius - 10), 'rgba(184, 111, 80, 0.35)');
}
/** The pad's peach knob centred at (x, y). */
export function paintUiTouchKnob(context: CanvasRenderingContext2D, x: number, y: number, radius = 13): void {
  x = Math.round(x); y = Math.round(y);
  disc(context, x, y + 1, radius, '#743f39'); disc(context, x, y, radius, '#e4a672', '#3f2832'); disc(context, x - 3, y - 3, Math.max(1, Math.floor(radius / 3)), '#f6ca9f');
}
/** A round thumb action centred in `r`: tone face, symbol and keyboard letter; `cooldown` sweeps a dark wedge. */
export function paintUiTouchDisc(context: CanvasRenderingContext2D, art: UiTouchArt, r: { x: number; y: number; width: number; height: number },
  options: { readonly tone?: UiTouchTone; readonly icon?: string; readonly key?: string; readonly pressed?: boolean; readonly lit?: boolean; readonly cooldown?: number }): void {
  const size = Math.min(r.width, r.height), c = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) + (options.pressed ? 1 : 0) }, radius = Math.floor(size / 2) - 2;
  const [face, shade] = TOUCH_FACES[options.tone ?? 'primary'];
  if (!options.pressed) disc(context, c.x, c.y + 2, radius, '#3f2832');
  disc(context, c.x, c.y + 1, radius, shade, '#3f2832'); disc(context, c.x, c.y, radius - 1, face);
  if (options.lit) { context.fillStyle = '#fff6e0'; context.fillRect(c.x - 3, c.y - radius, 7, 1); }
  if (options.cooldown) {
    context.fillStyle = 'rgba(63, 40, 50, 0.55)';
    for (let y = -radius; y <= radius; y++) { const half = Math.floor(Math.sqrt(radius * radius - y * y)); if (y + radius < options.cooldown * radius * 2) context.fillRect(c.x - half, c.y + y, half * 2 + 1, 1); }
  }
  const small = size < 36;
  if (options.icon) paintUiSkin(context, art.skin.icon, options.icon, { x: c.x - 8, y: c.y - (small ? 11 : 10), width: 16, height: 16 });
  const key = options.key; if (!key) return;
  const w = measurePixelText(key, 1, art.pixel.font);
  drawOutlinedPixelText(context, art.pixel, key, c.x - Math.floor(w / 2), options.icon ? c.y + (small ? 4 : 5) : c.y - 4, { color: '#fff6e0', outlineColor: '#3f2832' });
}

/** Movement pad: a translucent parchment well with a peach knob, drawn at the thumb's rest position. */
export function uiTouchPad(options: { readonly size?: number; readonly knob?: { readonly x: number; readonly y: number } }): UiElement {
  const size = options.size ?? 72;
  return new UiElement({ kind: 'touch-pad', label: 'Movement pad', style: { width: uiFixed(size), height: uiFixed(size), shrink: 0 },
    paint(element, { context }) {
      const r = element.rect, radius = Math.floor(size / 2) - 1;
      paintUiTouchPad(context, r);
      paintUiTouchKnob(context, r.x + size / 2 + (options.knob?.x ?? 0) * (radius - 14), r.y + size / 2 + (options.knob?.y ?? 0) * (radius - 14));
    } });
}

/** A round thumb action: tone face, a symbol and its keyboard letter; cooldown sweeps a dark wedge. */
export function uiTouchAction(options: { readonly label: string; readonly key?: string; readonly icon?: string; readonly tone?: UiTouchTone; readonly size?: number; readonly cooldown?: number }): UiElement {
  const size = options.size ?? 36;
  return new UiElement({ kind: 'button', label: options.key ? `${options.label} (${options.key})` : options.label, focusable: true, style: { width: uiFixed(size), height: uiFixed(size), shrink: 0 },
    paint(element, { context, art }) {
      if (art) paintUiTouchDisc(context, art, element.rect, { tone: options.tone, icon: options.icon, key: options.key ?? options.label, cooldown: options.cooldown });
    } });
}
