import { containsPoint, type UiRect } from '../../geometry.js';
import { drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import { selectAtlasFrame } from '../../sprite.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiLoadedSkinFamily } from '../skin/load.js';
import { paintUiMissingArt, paintUiSkin, uiSkinFrame } from './art.js';
import { uiFlex } from './layout.js';

/** Game window chrome: wood posts and top board around parchment, the centred title
 * ribbon straddling the top board and a wooden close plaque on the top-right post.
 * Windows size to their content. */
export interface UiWindowOptions {
  readonly id?: string; readonly title: string;
  readonly onClose?: () => void; readonly closeLabel?: string;
  /** Body layout; windows default to a column that fits its children. */
  readonly layout?: UiStyle; readonly children?: readonly UiElement[];
  /** Content below a carved divider, such as the hotbar row. */
  readonly footer?: UiElement;
  /** Visual accent for station windows. */
  readonly accent?: UiWindowAccent;
  /** Frame timber: posts-and-board `wood` (default) or boards-and-posts `crate` for storage. */
  readonly frame?: 'wood' | 'crate';
}
export type UiWindowAccent = 'none' | 'ember' | 'hearth' | 'orchard' | 'cellar' | 'brine' | 'forge';
/** Transparent space above the wood that the ribbon and close button overhang. */
export const UI_WINDOW_OVERHANG = 6;
const PARCHMENT = { wood: { left: 10, top: 13, right: 10, bottom: 10 }, crate: { left: 12, top: 12, right: 12, bottom: 13 } } as const;
const WINDOW_PADDING = { left: 24, right: 24, top: 32, bottom: 16 } as const;
const RIBBON_MIN = 78, RIBBON_TAILS = 54, RIBBON_FACE_TOP = 5;

export function uiWindowRibbon(title: string, options: { readonly id?: string } = {}): UiElement {
  return new UiElement({ id: options.id, kind: 'window-ribbon', label: title, props: { text: title },
    style: { height: uiFixed(21), shrink: 0 },
    measure(element) {
      const text = String(element.props['text']);
      const width = Math.max(RIBBON_MIN, text.length * 6 - 1 + RIBBON_TAILS);
      return { min: { width: RIBBON_MIN, height: 21 }, preferred: { width, height: 21 } };
    },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect; if (art.missingArt) { paintUiMissingArt(context, r, art); return; }
      paintRibbon(context, art.skin.feedback, r);
      const text = fitPixelText(String(element.props['text']), Math.max(0, r.width - RIBBON_TAILS + 6), 1, art.pixel.font);
      drawPixelText(context, art.pixel, text, r.x + Math.floor((r.width - measurePixelText(text, 1, art.pixel.font)) / 2), r.y + RIBBON_FACE_TOP, { color: '#3f2832' });
    },
  });
}

/** The banner's curved crest repeats one clean centre column, as the legacy ribbon did. */
function paintRibbon(context: CanvasRenderingContext2D, family: UiLoadedSkinFamily, r: UiRect): void {
  const entry = family['banner.base.0']; const source = entry && uiSkinFrame(entry);
  if (!entry || !source) return;
  const left = Math.floor(source.width / 2), right = source.width - left - 1, middle = Math.max(0, r.width - left - right);
  const image = entry.asset.image;
  context.drawImage(image, source.x, source.y, left, source.height, r.x, r.y, left, source.height);
  if (middle > 0) context.drawImage(image, source.x + left, source.y, 1, source.height, r.x + left, r.y, middle, source.height);
  context.drawImage(image, source.x + left + 1, source.y, right, source.height, r.x + left + middle, r.y, right, source.height);
}

/** Station emblem: the machine's own art on a slot-faced plate, used inside the station header. */
export function uiWindowEmblem(child: UiElement): UiElement {
  return new UiElement({ kind: 'window-emblem', style: { width: uiFixed(28), height: uiFixed(31), display: 'stack', padding: { left: 2, right: 2, top: 4, bottom: 6 }, shrink: 0 },
    children: [child.setStyle({ width: 'grow', height: 'grow' })],
    paint(element, { context, art }) {
      if (!art || art.missingArt) return;
      paintUiSkin(context, art.skin.slot, 'slot.idle.0', element.rect);
    },
  });
}

/** Wooden close plaque carved into the top-right post: it shares the frame's wood ramp,
 * lights its cross on hover and sinks when pressed. The hit area extends past the plaque for touch. */
export function uiWindowClose(options: { readonly label?: string; readonly onPress: () => void; readonly id?: string }): UiElement {
  let pressed = false;
  return new UiElement({ id: options.id, kind: 'button', label: options.label ?? 'Close', focusable: true, pointerMode: 'capture',
    props: { tone: 'primary', buttonSurface: true },
    style: { width: uiFixed(24), height: uiFixed(24), shrink: 0 },
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); element.invalidateRoot?.(false); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); element.invalidateRoot?.(false);
        if (containsPoint(element.clip, event.point)) options.onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event) { if (event.key === 'Enter' || event.key === ' ') { options.onPress(); return true; } return false; },
    paint(element, { context, art, hovered, focused }) {
      if (!art || art.missingArt) return;
      const r = element.rect, plaque = { x: r.x + r.width - 16, y: r.y + 3, width: 14, height: 15 };
      paintUiSkin(context, art.skin.icon, `close_wood.${pressed ? 'pressed' : hovered || focused ? 'hover' : 'idle'}`, plaque);
      if (focused) { context.fillStyle = '#fff6e0'; context.fillRect(plaque.x + 2, plaque.y + plaque.height + 1, plaque.width - 4, 1); }
    },
  });
}

export function uiWindow(options: UiWindowOptions): UiElement {
  const ribbon = uiWindowRibbon(options.title, { id: options.id ? `${options.id}.title` : undefined });
  // Titles always centre on the top board; the ribbon grows with its label.
  const header = uiFlex({ direction: 'row', align: 'center', justify: 'center', height: uiFixed(24),
    position: 'absolute', inset: { left: 24, right: 24, top: 0 } }, [ribbon]);
  const close = options.onClose ? uiWindowClose({ id: options.id ? `${options.id}.close` : undefined, label: options.closeLabel ?? `Close ${options.title}`, onPress: options.onClose }) : null;
  close?.setStyle({ position: 'absolute', inset: { right: 0, top: 0 } });
  const body = uiFlex({ direction: 'column', gap: 8, ...options.layout }, options.children ?? []);
  // The divider spans the window; the hotbar row centres beneath it.
  const footer = options.footer ? uiFlex({ direction: 'column', gap: 4, shrink: 0, align: 'center' }, [uiWindowDivider(), options.footer]) : null;
  const content = uiFlex({ direction: 'column', gap: 8, padding: WINDOW_PADDING }, [body, ...(footer ? [footer] : [])]);
  return new UiElement({ id: options.id, kind: 'window', label: options.title, props: { tone: 'primary', surface: 'wood_parchment', accent: options.accent ?? 'none' },
    style: { display: 'stack', overflow: 'clip' },
    // Reading order: title, body, footer, then the close button last in tab order.
    children: [content, header, ...(close ? [close] : [])],
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect, wood = { x: r.x, y: r.y + UI_WINDOW_OVERHANG, width: r.width, height: Math.max(0, r.height - UI_WINDOW_OVERHANG) };
      if (art.missingArt) { paintUiMissingArt(context, wood, art); return; }
      const timber = options.frame ?? 'wood', inset = PARCHMENT[timber];
      paintUiSkin(context, art.skin.frame, timber, wood);
      paintUiSkin(context, art.skin.frame, 'parchment', { x: wood.x + inset.left, y: wood.y + inset.top,
        width: Math.max(0, wood.width - inset.left - inset.right), height: Math.max(0, wood.height - inset.top - inset.bottom) });
    },
  });
}

/** One authored 16px glyph from the skin icon family. */
export function uiGlyph(key: string, options: { readonly label?: string } = {}): UiElement {
  return new UiElement({ kind: 'glyph', label: options.label ?? key, style: { width: uiFixed(16), height: uiFixed(16), shrink: 0 },
    paint(element, { context, art }) { if (art && !art.missingArt) paintUiSkin(context, art.skin.icon, key, element.rect); } });
}

/** Compact glyph button: the peach square face, or bare ink for inline field controls. */
export function uiGlyphButton(options: { readonly glyph: string; readonly label: string; readonly onPress: () => void; readonly chrome?: 'square' | 'none'; readonly id?: string; readonly disabled?: boolean; readonly hideWhenDisabled?: boolean }): UiElement {
  let pressed = false;
  const chrome = options.chrome ?? 'square';
  return new UiElement({ id: options.id, kind: 'button', label: options.label, focusable: true, disabled: options.disabled, pointerMode: 'capture',
    props: { tone: 'primary', buttonSurface: chrome !== 'none' },
    style: { width: uiFixed(chrome === 'none' ? 16 : 24), height: uiFixed(chrome === 'none' ? 16 : 24), shrink: 0 },
    onPointer(event, element) {
      if (element.disabled) return false;
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); element.invalidateRoot?.(false); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); element.invalidateRoot?.(false); if (containsPoint(element.clip, event.point)) options.onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event, element) { if (!element.disabled && (event.key === 'Enter' || event.key === ' ')) { options.onPress(); return true; } return false; },
    paint(element, { context, art, hovered, focused }) {
      if (!art || art.missingArt || (element.disabled && options.hideWhenDisabled)) return;
      const r = element.rect, state = element.disabled ? 'disabled' : pressed ? 'pressed' : 'idle';
      const face = chrome === 'none' ? r : { x: r.x + 4, y: r.y + 4, width: 16, height: 16 };
      context.save(); if (element.disabled) context.globalAlpha *= .5;
      if (chrome !== 'none') paintUiSkin(context, art.skin.button, `primary.sm.square.${state}`, face);
      paintUiSkin(context, art.skin.icon, options.glyph, { ...face, y: face.y + (pressed ? 1 : 0) });
      if ((hovered || focused) && !element.disabled) {
        if (chrome !== 'none') paintUiSkin(context, art.skin.button, `outline.sm.square.${state}.${focused ? 'white' : 'gold'}`, face);
        else { context.fillStyle = focused ? '#fff6e0' : '#feae34'; context.fillRect(face.x + 3, face.y + face.height - 1, face.width - 6, 1); }
      }
      context.restore();
    },
  });
}

/** Carved line separating a window's working area from its hotbar or actions. */
export function uiWindowDivider(): UiElement {
  // No intrinsic width: the divider stretches across its column without widening a fitted window.
  return new UiElement({ kind: 'window-divider', style: { height: uiFixed(3), alignSelf: 'stretch', shrink: 0 },
    paint(element, { context }) {
      const r = element.rect;
      context.fillStyle = '#b86f50'; context.fillRect(r.x, r.y, r.width, 1);
      context.fillStyle = '#fff6e0'; context.fillRect(r.x, r.y + 1, r.width, 1);
    },
  });
}

/** Authored corner selector hugging a rect: confirm (green), neutral (white) or deny (red). */
export function paintUiSelector(context: CanvasRenderingContext2D, family: UiLoadedSkinFamily, kind: 'confirm' | 'neutral' | 'deny', r: UiRect, animate = 0): void {
  const entry = family[`selector_${kind}.idle.0`]; if (!entry) return;
  const frame = selectAtlasFrame(entry.asset.metadata, entry.entry.group, entry.entry.index); if (!frame) return;
  // Opaque bounds of the 48px cell are 11..36 × 10..37; each corner is a 10px bracket.
  const bx = frame.x + 11, by = frame.y + 10, bw = 26, bh = 28, c = 10, out = 2 + animate;
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
  for (const [cx, cy] of corners) {
    const sx = bx + cx * (bw - c), sy = by + cy * (bh - c);
    const dx = cx ? r.x + r.width + out - c : r.x - out, dy = cy ? r.y + r.height + out - c : r.y - out;
    context.drawImage(entry.asset.image, sx, sy, c, c, dx, dy, c, c);
  }
}
