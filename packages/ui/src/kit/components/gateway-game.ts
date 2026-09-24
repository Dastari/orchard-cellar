import { containsPoint } from '../../geometry.js';
import { drawPixelText, measurePixelText } from '../../pixel-ui.js';
import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { paintUiSkin } from './art.js';
import { uiFlex } from './layout.js';
import { uiItemFrame } from './inventory.js';

const PLUM = '#3f2832', GOLD = '#feae34', GOLD_LIGHT = '#fee761', SHADOW = '#5c322d';

/** Draws text in the reading font at `scale` with a one-pixel plum outline, a drop shadow and a two-tone gold face. */
function paintTitle(context: CanvasRenderingContext2D, art: NonNullable<Parameters<NonNullable<UiElement['hooks']['paint']>>[1]['art']>, text: string, x: number, y: number, scale: number): void {
  const font = { font: 'header' as const, scale };
  for (const [dx, dy] of [[0, scale + 1], [1, scale + 1]] as const) drawPixelText(context, art.pixel, text, x + dx, y + dy, { ...font, color: SHADOW });
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) drawPixelText(context, art.pixel, text, x + dx, y + dy, { ...font, color: PLUM });
  drawPixelText(context, art.pixel, text, x, y, { ...font, color: GOLD });
  // Upper half of each glyph lit a step warmer, the pack's highlight idiom.
  context.save(); context.beginPath(); context.rect(x - 2, y - 2, measurePixelText(text, scale, art.pixel.headerFont) + 4, Math.floor(6 * scale)); context.clip();
  drawPixelText(context, art.pixel, text, x, y, { ...font, color: GOLD_LIGHT }); context.restore();
}

/** The Orchard & Cellar sign: a hanging timber board with the title in gold, the apple at one end and a cellar bottle at the other. */
export function uiGameLogo(options: { readonly cask?: LoadedAsset; readonly compact?: boolean; readonly layout?: UiStyle }): UiElement {
  const scale = 2, title = 'Orchard & Cellar';
  // Phones keep the full-size lettering and tighten the ends: a 2x apple and barrel with 8px insets.
  const textWidth = title.length * 9 * scale - scale, width = textWidth + (options.compact ? 92 : 128), height = options.compact ? 52 : 64;
  return new UiElement({ kind: 'game-logo', label: title, style: { width: uiFixed(width), height: uiFixed(height + 14), shrink: 0, ...options.layout },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect, board = { x: r.x, y: r.y + 14, width: r.width, height };
      // Two ropes run up from the board's shoulders to the top of the frame.
      context.fillStyle = '#743f39'; for (const x of [board.x + 24, board.x + board.width - 26]) { context.fillRect(x, r.y, 2, 16); context.fillStyle = '#b86f50'; context.fillRect(x, r.y, 1, 16); context.fillStyle = '#743f39'; }
      paintUiSkin(context, art.skin.frame, 'crate', board);
      const textX = board.x + Math.floor((board.width - textWidth) / 2), textY = board.y + Math.floor((board.height - 12 * scale) / 2) - 1;
      paintTitle(context, art, title, textX, textY, scale);
      // The brand apple (from the app icon) at one end, the cellar's barrel at the other.
      const apple = 12 * (options.compact ? 2 : 3), inset = options.compact ? 8 : 16;
      paintUiSkin(context, art.skin.icon, 'logo.apple', { x: board.x + inset, y: board.y + Math.floor((board.height - apple) / 2), width: apple, height: apple });
      const cask = options.cask, frame = cask && uiItemFrame(cask, 'closed');
      if (cask && frame) { const w = frame.width * 2, h = frame.height * 2; context.drawImage(cask.image, frame.x, frame.y, frame.width, frame.height, board.x + board.width - inset - w, board.y + Math.floor((board.height - h) / 2), w, h); }
    } });
}

/** Wide wood-edged progress bar with a gold fill and a centred percentage. */
export function uiLoadingBar(options: { readonly progress: () => number; readonly width?: number }): UiElement {
  const width = options.width ?? 200;
  return new UiElement({ kind: 'progress', label: 'Loading', style: { width: uiFixed(width), height: uiFixed(14), shrink: 0 },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, value = Math.max(0, Math.min(1, options.progress()));
      context.fillStyle = PLUM; context.fillRect(r.x + 1, r.y, r.width - 2, r.height); context.fillRect(r.x, r.y + 1, r.width, r.height - 2);
      context.fillStyle = '#743f39'; context.fillRect(r.x + 2, r.y + 2, r.width - 4, r.height - 4);
      const fill = Math.round((r.width - 4) * value);
      context.fillStyle = '#f77622'; context.fillRect(r.x + 2, r.y + 2, fill, r.height - 4);
      context.fillStyle = GOLD; context.fillRect(r.x + 2, r.y + 2, fill, r.height - 7);
      context.fillStyle = GOLD_LIGHT; context.fillRect(r.x + 2, r.y + 3, fill, 1);
      const text = `${Math.round(value * 100)}%`, w = measurePixelText(text, 1, art.pixel.font);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) drawPixelText(context, art.pixel, text, r.x + Math.floor((r.width - w) / 2) + dx, r.y + 4 + dy, { color: PLUM });
      drawPixelText(context, art.pixel, text, r.x + Math.floor((r.width - w) / 2), r.y + 4, { color: '#fff6e0' });
    } });
}

/** The big call to action on a title screen: the pack's lg green button with gold hover outline. */
export function uiHeroButton(options: { readonly id?: string; readonly label: string; readonly tone?: 'success' | 'primary'; readonly width?: number; readonly onPress: () => void }): UiElement {
  let pressed = false; const tone = options.tone ?? 'success';
  return new UiElement({ id: options.id, kind: 'button', label: options.label, focusable: true, pointerMode: 'capture', props: { tone, buttonSurface: true },
    style: { width: uiFixed(options.width ?? 160), height: uiFixed(32), shrink: 0 },
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); element.invalidateRoot?.(false); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); element.invalidateRoot?.(false); if (containsPoint(element.clip, event.point)) options.onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event) { if (event.key !== 'Enter' && event.key !== ' ') return false; options.onPress(); return true; },
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect, state = pressed ? 'pressed' : 'idle';
      paintUiSkin(context, art.skin.button, `${tone}.lg.chamfered.${state}`, r);
      const w = measurePixelText(options.label, 1, art.pixel.headerFont), ink = tone === 'success' ? '#fff6e0' : PLUM;
      if (tone === 'success') for (const [dx, dy] of [[0, 1], [1, 1]] as const) drawPixelText(context, art.pixel, options.label, r.x + Math.floor((r.width - w) / 2) + dx, r.y + 9 + dy + (pressed ? 1 : 0), { font: 'header', color: '#265c42' });
      drawPixelText(context, art.pixel, options.label, r.x + Math.floor((r.width - w) / 2), r.y + 9 + (pressed ? 1 : 0), { font: 'header', color: ink });
      if (hovered || focused) paintUiSkin(context, art.skin.button, `outline.lg.chamfered.${state}.${focused ? 'white' : 'gold'}`, r);
    } });
}

/** Understated text link for secondary title actions ("Create account", "Recover"). */
export function uiTextLink(options: { readonly id?: string; readonly label: string; readonly onPress: () => void; readonly light?: boolean }): UiElement {
  return new UiElement({ id: options.id, kind: 'link', label: options.label, focusable: true, pointerMode: 'capture', style: { width: uiFixed(options.label.length * 6 + 1), height: uiFixed(11), shrink: 0 },
    onPointer(event) { if (event.type === 'up') { options.onPress(); return true; } return event.type === 'down'; },
    onKey(event) { if (event.key !== 'Enter' && event.key !== ' ') return false; options.onPress(); return true; },
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect, ink = hovered || focused ? (options.light ? GOLD_LIGHT : '#9e2835') : options.light ? '#fff6e0' : '#743f39';
      if (options.light) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) drawPixelText(context, art.pixel, options.label, r.x + dx, r.y + dy, { color: PLUM });
      drawPixelText(context, art.pixel, options.label, r.x, r.y, { color: ink });
      context.fillStyle = ink; context.fillRect(r.x, r.y + 9, r.width - 1, 1);
    } });
}

/** Full-bleed title backdrop: the island render, cover-cropped and dimmed 18% as on the sign-in pages. */
export function uiTitleBackdrop(options: { readonly image?: () => CanvasImageSource & { readonly width: number; readonly height: number } | undefined; readonly children: readonly UiElement[] }): UiElement {
  return new UiElement({ kind: 'title-backdrop', label: 'Orchard & Cellar', style: { display: 'stack', width: 'grow', height: 'grow' }, children: [uiFlex({ width: 'grow', height: 'grow', justify: 'center', align: 'center', direction: 'column', gap: 12 }, options.children)],
    paint(element, { context }) {
      const r = element.rect, image = options.image?.();
      if (image) {
        const scale = Math.max(r.width / image.width, r.height / image.height), w = image.width * scale, h = image.height * scale;
        context.save(); context.imageSmoothingEnabled = false; context.drawImage(image, r.x + (r.width - w) / 2, r.y + (r.height - h) / 2, w, h); context.restore();
      }
      context.fillStyle = 'rgba(16, 24, 19, 0.18)'; context.fillRect(r.x, r.y, r.width, r.height);
    } });
}
