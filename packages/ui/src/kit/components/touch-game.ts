import { drawOutlinedPixelText, measurePixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { paintUiSkin } from './art.js';

/** Pixel disc: stepped circle rows, the same way the pack's round buttons are drawn. Half-pixel radii keep
 * the poles flat instead of ending in one-pixel spikes. */
function disc(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, fill: string, edge?: string): void {
  const span = (r: number, y: number) => Math.floor(Math.sqrt(Math.max(0, (r + .5) * (r + .5) - y * y)));
  for (let y = -radius; y <= radius; y++) {
    const half = span(radius, y);
    if (edge) { context.fillStyle = edge; context.fillRect(cx - half, cy + y, half * 2 + 1, 1); }
    const inner = edge ? span(radius - 1, y) : half;
    if (!edge || Math.abs(y) < radius) { context.fillStyle = fill; context.fillRect(cx - inner, cy + y, inner * 2 + 1, 1); }
  }
}

type UiTouchArt = NonNullable<Parameters<NonNullable<UiElement['hooks']['paint']>>[1]['art']>;
export type UiTouchTone = 'primary' | 'success' | 'info' | 'danger';
/** Per tone: bevel light, face, bevel shade and the deep lip under the cap. */
const TOUCH_FACES = {
  primary: ['#f6ca9f', '#e4a672', '#b86f50', '#743f39'], success: ['#a8e06c', '#63c74d', '#3e8948', '#265c42'],
  info: ['#b4f4fa', '#2ce8f5', '#0095e9', '#124e89'], danger: ['#ffb3b5', '#f6757a', '#e43b44', '#a22633'],
} as const;
const INK = '#3f2832';

/** A raised round cap at (cx, cy): outlined, a light bevel along its top edge and a shaded one along its foot. */
function bevelledCap(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number, light: string, face: string, shade: string, sunk = false): void {
  disc(context, cx, cy, radius, sunk ? light : shade, INK);
  disc(context, cx, cy + (sunk ? 1 : -1), radius - 2, sunk ? shade : light);
  disc(context, cx, cy, radius - 3, face);
}

/** The movement pad: a dark recessed ring with a bevelled wooden rim and four direction notches. */
export function paintUiTouchPad(context: CanvasRenderingContext2D, r: { x: number; y: number; width: number; height: number }): void {
  const size = Math.min(r.width, r.height), cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2), radius = Math.floor(size / 2) - 1;
  context.save(); context.globalAlpha *= .85;
  disc(context, cx, cy + 2, radius, 'rgba(24, 20, 37, 0.35)');
  disc(context, cx, cy, radius, '#b86f50', INK);
  disc(context, cx, cy - 1, radius - 2, '#e4a672');
  disc(context, cx, cy, radius - 3, '#743f39');
  // The well: dark and translucent so the world shows through, shadowed under its top rim.
  disc(context, cx, cy, radius - 4, 'rgba(24, 20, 37, 0.7)');
  disc(context, cx, cy + 2, radius - 6, 'rgba(63, 40, 50, 0.55)');
  context.restore();
  context.fillStyle = 'rgba(246, 202, 159, 0.8)';
  const reach = radius - 9;
  for (let i = 0; i < 4; i++) {
    const ox = [0, reach, 0, -reach][i]!, oy = [-reach, 0, reach, 0][i]!;
    for (let step = 0; step < 3; step++) {
      const span = step * 2 + 1, along = 2 - step;
      if (ox === 0) context.fillRect(cx - step, cy + oy + (oy < 0 ? -along : along), span, 1);
      else context.fillRect(cx + ox + (ox < 0 ? -along : along), cy - step, 1, span);
    }
  }
}
/** The thumb stick: a shadowed stem under a domed peach cap with a grip ring and a highlight. */
export function paintUiTouchKnob(context: CanvasRenderingContext2D, x: number, y: number, radius = 13): void {
  x = Math.round(x); y = Math.round(y);
  disc(context, x, y + 4, radius, 'rgba(24, 20, 37, 0.45)');
  disc(context, x, y + 2, radius, '#743f39', INK);
  bevelledCap(context, x, y, radius, '#f6ca9f', '#e4a672', '#b86f50');
  disc(context, x, y, Math.max(1, radius - 6), '#b86f50');
  disc(context, x, y - 1, Math.max(1, radius - 7), '#e4a672');
  disc(context, x - Math.floor(radius / 2), y - Math.floor(radius / 2), Math.max(1, Math.floor(radius / 5)), '#fff6e0');
}
/** A round thumb button centred in `r`, drawn like a physical button: a raised bevelled cap on a dark lip that
 * sinks when pressed, a gloss spot, its symbol and keyboard letter; `cooldown` sweeps a dark wedge over the cap. */
export function paintUiTouchDisc(context: CanvasRenderingContext2D, art: UiTouchArt, r: { x: number; y: number; width: number; height: number },
  options: { readonly tone?: UiTouchTone; readonly icon?: string; readonly key?: string; readonly pressed?: boolean; readonly lit?: boolean; readonly cooldown?: number }): void {
  const size = Math.min(r.width, r.height), radius = Math.max(6, Math.floor(size / 2) - 1), cx = Math.round(r.x + r.width / 2);
  const base = Math.round(r.y + r.height / 2) - 1, depth = options.pressed ? 1 : 3, cy = base + (options.pressed ? 2 : 0);
  const [light, face, shade, deep] = TOUCH_FACES[options.tone ?? 'primary'];
  disc(context, cx, base + 5, radius, 'rgba(24, 20, 37, 0.35)');
  disc(context, cx, cy + depth, radius, deep, INK);
  bevelledCap(context, cx, cy, radius, light, face, shade, options.pressed);
  if (!options.pressed) disc(context, cx - Math.floor(radius / 2), cy - Math.floor(radius / 2), Math.max(1, Math.floor(radius / 6)), '#fff6e0');
  if (options.lit) { context.fillStyle = '#fff6e0'; context.fillRect(cx - 3, cy - radius - 2, 7, 1); }
  if (options.cooldown) {
    context.fillStyle = 'rgba(63, 40, 50, 0.55)';
    for (let y = -radius + 1; y <= radius - 1; y++) { const half = Math.floor(Math.sqrt((radius - 1) * (radius - 1) - y * y)); if (y + radius < options.cooldown * radius * 2) context.fillRect(cx - half, cy + y, half * 2 + 1, 1); }
  }
  const key = options.key, keyWidth = key ? measurePixelText(key, 1, art.pixel.font) : 0;
  if (options.icon) paintUiSkin(context, art.skin.icon, options.icon, { x: cx - 8, y: cy - (key ? 11 : 8), width: 16, height: 16 });
  if (key) drawOutlinedPixelText(context, art.pixel, key, cx - Math.floor(keyWidth / 2), options.icon ? cy + 4 : cy - 4, { color: '#fff6e0', outlineColor: INK });
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
