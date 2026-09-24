import { containsPoint } from '../../geometry.js';
import { drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_ITEM_INKS } from '../tokens.js';
import { paintUiSkin } from './art.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiItemFrame } from './inventory.js';
import { uiText } from './text.js';
import { uiWindow, type UiWindowElement } from './window.js';

const PLUM = '#3f2832', GOLD = '#feae34', GOLD_LIGHT = '#fee761', SHADOW = '#5c322d';
type PaintArt = NonNullable<Parameters<NonNullable<UiElement['hooks']['paint']>>[1]['art']>;

/** Draws text in the reading font at `scale` with a one-pixel plum outline, a drop shadow and a two-tone gold face. */
function paintTitle(context: CanvasRenderingContext2D, art: PaintArt, text: string, x: number, y: number, scale: number): void {
  const font = { font: 'header' as const, scale };
  for (const [dx, dy] of [[0, scale + 1], [1, scale + 1]] as const) drawPixelText(context, art.pixel, text, x + dx, y + dy, { ...font, color: SHADOW });
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) drawPixelText(context, art.pixel, text, x + dx, y + dy, { ...font, color: PLUM });
  drawPixelText(context, art.pixel, text, x, y, { ...font, color: GOLD });
  // Upper half of each glyph lit a step warmer, the pack's highlight idiom.
  context.save(); context.beginPath(); context.rect(x - 2, y - 2, measurePixelText(text, scale, art.pixel.headerFont) + 4, Math.floor(6 * scale)); context.clip();
  drawPixelText(context, art.pixel, text, x, y, { ...font, color: GOLD_LIGHT }); context.restore();
}

/** Logo sign sizes: `large` on desktop, `compact` on phones, `small` (1x lettering) only where nothing larger fits. */
export type UiGameLogoSize = 'large' | 'compact' | 'small';
const LOGO_TITLE = 'Orchard & Cellar';
const LOGO_SPECS: Readonly<Record<UiGameLogoSize, { readonly scale: number; readonly ends: number; readonly board: number; readonly apple: number; readonly inset: number; readonly rope: number }>> = {
  large: { scale: 2, ends: 128, board: 64, apple: 36, inset: 16, rope: 14 },
  compact: { scale: 2, ends: 92, board: 52, apple: 24, inset: 8, rope: 14 },
  small: { scale: 1, ends: 72, board: 32, apple: 24, inset: 6, rope: 10 },
};
/** Outer size of the logo sign, ropes included. */
export function uiGameLogoSize(size: UiGameLogoSize): { readonly width: number; readonly height: number } {
  const spec = LOGO_SPECS[size];
  return { width: LOGO_TITLE.length * 9 * spec.scale - spec.scale + spec.ends, height: spec.board + spec.rope };
}

/** Draws one centred frame of a sprite, scaled to fit `size` by whole pixels. */
function paintAssetIcon(context: CanvasRenderingContext2D, asset: LoadedAsset, x: number, y: number, size: number, mirror = false): void {
  const frame = uiItemFrame(asset, 'closed'); if (!frame) return;
  const scale = Math.max(1, Math.floor(size / Math.max(frame.width, frame.height))), w = frame.width * scale, h = frame.height * scale;
  const dx = x + Math.floor((size - w) / 2), dy = y + Math.floor((size - h) / 2);
  if (!mirror) { context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, dx, dy, w, h); return; }
  context.save(); context.translate(dx + w, dy); context.scale(-1, 1);
  context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, 0, 0, w, h); context.restore();
}

/** The Orchard & Cellar sign: a hanging timber board with the title in gold, the apple at one end and a cellar
 * barrel at the other. `apple` stands in when the skin's icon family is not loaded (startup), and without a
 * `cask` the apple is mirrored so the sign stays balanced. */
export function uiGameLogo(options: { readonly cask?: LoadedAsset; readonly apple?: LoadedAsset; readonly compact?: boolean; readonly size?: UiGameLogoSize; readonly layout?: UiStyle }): UiElement {
  const size = options.size ?? (options.compact ? 'compact' : 'large'), spec = LOGO_SPECS[size], outer = uiGameLogoSize(size);
  const textWidth = LOGO_TITLE.length * 9 * spec.scale - spec.scale;
  return new UiElement({ kind: 'game-logo', label: LOGO_TITLE, style: { width: uiFixed(outer.width), height: uiFixed(outer.height), shrink: 0, ...options.layout },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect, board = { x: r.x, y: r.y + spec.rope, width: r.width, height: spec.board };
      // Two ropes run up from the board's shoulders to the top of the frame.
      for (const x of [board.x + 24, board.x + board.width - 26]) { context.fillStyle = '#743f39'; context.fillRect(x, r.y, 2, spec.rope + 2); context.fillStyle = '#b86f50'; context.fillRect(x, r.y, 1, spec.rope + 2); }
      paintUiSkin(context, art.skin.frame, 'crate', board);
      const textX = board.x + Math.floor((board.width - textWidth) / 2), textY = board.y + Math.floor((board.height - 12 * spec.scale) / 2) - 1;
      paintTitle(context, art, LOGO_TITLE, textX, textY, spec.scale);
      // The brand apple (from the app icon) at one end, the cellar's barrel at the other.
      const iconY = board.y + Math.floor((board.height - spec.apple) / 2), left = board.x + spec.inset, right = board.x + board.width - spec.inset - spec.apple;
      const skinApple = art.skin.icon['logo.apple'] !== undefined;
      if (skinApple) paintUiSkin(context, art.skin.icon, 'logo.apple', { x: left, y: iconY, width: spec.apple, height: spec.apple });
      else if (options.apple) paintAssetIcon(context, options.apple, left, iconY, spec.apple);
      const cask = options.cask, frame = cask && uiItemFrame(cask, 'closed');
      if (cask && frame) {
        const scale = spec.scale, w = frame.width * scale, h = frame.height * scale;
        context.drawImage(cask.image, frame.x, frame.y, frame.width, frame.height, board.x + board.width - spec.inset - w, board.y + Math.floor((board.height - h) / 2), w, h);
      } else if (skinApple) {
        context.save(); context.translate(right + spec.apple, iconY); context.scale(-1, 1);
        paintUiSkin(context, art.skin.icon, 'logo.apple', { x: 0, y: 0, width: spec.apple, height: spec.apple }); context.restore();
      } else if (options.apple) paintAssetIcon(context, options.apple, right, iconY, spec.apple, true);
    } });
}

/** Wide wood-edged progress bar with a gold fill and a centred percentage. The value comes from `progress`
 * when supplied, otherwise from the element's `value` prop (0..1); `tone: 'danger'` fills it red. */
export function uiLoadingBar(options: { readonly id?: string; readonly progress?: () => number; readonly width?: number; readonly layout?: UiStyle }): UiElement {
  const width = options.width ?? 200;
  return new UiElement({ id: options.id, kind: 'progress', label: 'Loading', props: { value: 0, tone: 'success' }, style: { width: uiFixed(width), height: uiFixed(14), shrink: 0, ...options.layout },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, raw = options.progress ? options.progress() : Number(element.props['value']);
      const value = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0, danger = element.props['tone'] === 'danger';
      context.fillStyle = PLUM; context.fillRect(r.x + 1, r.y, r.width - 2, r.height); context.fillRect(r.x, r.y + 1, r.width, r.height - 2);
      context.fillStyle = '#743f39'; context.fillRect(r.x + 2, r.y + 2, r.width - 4, r.height - 4);
      const fill = Math.round((r.width - 4) * value);
      context.fillStyle = danger ? '#9e2835' : '#f77622'; context.fillRect(r.x + 2, r.y + 2, fill, r.height - 4);
      context.fillStyle = danger ? '#e43b44' : GOLD; context.fillRect(r.x + 2, r.y + 2, fill, r.height - 7);
      context.fillStyle = danger ? '#f5555d' : GOLD_LIGHT; context.fillRect(r.x + 2, r.y + 3, fill, 1);
      const text = `${Math.round(value * 100)}%`, w = measurePixelText(text, 1, art.pixel.font);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) drawPixelText(context, art.pixel, text, r.x + Math.floor((r.width - w) / 2) + dx, r.y + 4 + dy, { color: PLUM });
      drawPixelText(context, art.pixel, text, r.x + Math.floor((r.width - w) / 2), r.y + 4, { color: '#fff6e0' });
    } });
}

/** Press-on-release pointer handling shared by the title controls: capture on down, fire only when released
 * inside, and drop the press on cancel so a host can cancel gestures across state changes. */
function releaseGesture(onPress: () => void) {
  let pressed = false;
  return {
    get pressed() { return pressed; },
    onPointer(event: Parameters<NonNullable<UiElement['hooks']['onPointer']>>[0], element: UiElement): boolean {
      if (element.disabled) { if (pressed) { pressed = false; event.release(); } return false; }
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); element.invalidateRoot?.(false); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); element.invalidateRoot?.(false); if (containsPoint(element.clip, event.point)) onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); element.invalidateRoot?.(false); return true; }
      return pressed;
    },
    onKey(event: { readonly key: string }, element: UiElement): boolean {
      if (element.disabled || event.key !== 'Enter' && event.key !== ' ') return false; onPress(); return true;
    },
  };
}

/** The big call to action on a title screen: the pack's lg green button with gold hover outline.
 * The label follows the element's `label`, so hosts may retitle it (for example "Saving...") in place. */
export function uiHeroButton(options: { readonly id?: string; readonly label: string; readonly tone?: 'success' | 'primary'; readonly width?: number; readonly layout?: UiStyle; readonly onPress: () => void }): UiElement {
  const tone = options.tone ?? 'success', gesture = releaseGesture(options.onPress);
  return new UiElement({ id: options.id, kind: 'button', label: options.label, focusable: true, pointerMode: 'capture', props: { tone, buttonSurface: true },
    style: { width: uiFixed(options.width ?? 160), height: uiFixed(32), shrink: 0, ...options.layout },
    onPointer: (event, element) => gesture.onPointer(event, element),
    onKey: (event, element) => gesture.onKey(event, element),
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect, disabled = element.disabled, pressed = gesture.pressed && !disabled;
      const state = disabled ? 'disabled' : pressed ? 'pressed' : 'idle', label = element.label, dy = pressed ? 1 : 0;
      paintUiSkin(context, art.skin.button, `${tone}.lg.chamfered.${state}`, r);
      const w = measurePixelText(label, 1, art.pixel.headerFont), ink = disabled ? '#8b6d6d' : tone === 'success' ? '#fff6e0' : PLUM;
      if (tone === 'success' && !disabled) for (const [dx, sy] of [[0, 1], [1, 1]] as const) drawPixelText(context, art.pixel, label, r.x + Math.floor((r.width - w) / 2) + dx, r.y + 9 + sy + dy, { font: 'header', color: '#265c42' });
      drawPixelText(context, art.pixel, label, r.x + Math.floor((r.width - w) / 2), r.y + 9 + dy, { font: 'header', color: ink });
      if ((hovered || focused) && !disabled) paintUiSkin(context, art.skin.button, `outline.lg.chamfered.${state}.${focused ? 'white' : 'gold'}`, r);
    } });
}

/** Understated text link for secondary title actions ("Create account", "Recover"). `light` links sit on the world. */
export function uiTextLink(options: { readonly id?: string; readonly label: string; readonly onPress: () => void; readonly light?: boolean }): UiElement {
  const gesture = releaseGesture(options.onPress);
  return new UiElement({ id: options.id, kind: 'link', label: options.label, focusable: true, pointerMode: 'capture', style: { height: uiFixed(11), shrink: 0 },
    measure(element) { const width = element.label.length * 6 + 1; return { min: { width, height: 11 }, preferred: { width, height: 11 } }; },
    onPointer: (event, element) => gesture.onPointer(event, element),
    onKey: (event, element) => gesture.onKey(event, element),
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect, active = (hovered || focused) && !element.disabled;
      const ink = element.disabled ? (options.light ? '#c9c1b0' : '#a08268') : active ? (options.light ? GOLD_LIGHT : '#9e2835') : options.light ? '#fff6e0' : '#743f39';
      if (options.light) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) drawPixelText(context, art.pixel, element.label, r.x + dx, r.y + dy, { color: PLUM });
      drawPixelText(context, art.pixel, element.label, r.x, r.y, { color: ink });
      if (options.light) { context.fillStyle = PLUM; context.fillRect(r.x - 1, r.y + 8, r.width + 1, 3); }
      context.fillStyle = ink; context.fillRect(r.x, r.y + 9, r.width - 1, 1);
    } });
}

/** Retitleable dark error notice (the approved "Could not reach the island." plate). Its `text` prop carries the
 * message; the red cross is drawn only when the icon family is loaded, so startup screens can show it too. */
export function uiTitleNotice(options: { readonly id?: string; readonly text?: string; readonly layout?: UiStyle } = {}): UiElement & { setText(text: string): void } {
  const text = uiText(options.text ?? '', { wrap: true, layout: { shrink: 1 } }); text.setProps({ ink: UI_ITEM_INKS.unmet });
  const glyph = new UiElement({ kind: 'glyph', style: { width: uiFixed(16), height: uiFixed(16), shrink: 0 },
    paint(element, { context, art }) { if (art?.skin.icon['glyph.cross.red']) paintUiSkin(context, art.skin.icon, 'glyph.cross.red', element.rect); } });
  const notice = new UiElement({ id: options.id, kind: 'notice', label: options.text ?? '', props: { itemInks: true, text: options.text ?? '' },
    style: { display: 'flex', direction: 'row', gap: 4, align: 'center', padding: { left: 4, right: 8, top: 2, bottom: 4 }, shrink: 0, ...options.layout },
    children: [glyph, text],
    paint(element, { context, art }) { if (art?.skin.frame['tooltip_dark.poor']) paintUiSkin(context, art.skin.frame, 'tooltip_dark.poor', element.rect); } });
  return Object.assign(notice, { setText(value: string) { if (notice.props['text'] === value) return; notice.setProps({ text: value, label: value }); text.setProps({ text: value }); } });
}

/** A slim dark plate carrying a live name, as other players will see it above the character's head.
 * It spans its container and centres (and if need be shortens) the name within it. */
export function uiLiveNameplate(options: { readonly name: () => string }): UiElement {
  return new UiElement({ kind: 'nameplate', label: 'Name preview', style: { width: 'grow', height: uiFixed(13), shrink: 0 }, props: { itemInks: true },
    paint(element, { context, art }) {
      const raw = options.name(); if (!art || !raw) return;
      const name = fitPixelText(raw, Math.max(0, element.rect.width - 8), 1, art.pixel.font), w = measurePixelText(name, 1, art.pixel.font);
      const r = { ...element.rect, x: element.rect.x + Math.floor((element.rect.width - w - 8) / 2), width: w + 8 };
      context.fillStyle = 'rgba(14, 7, 27, 0.72)'; context.fillRect(r.x + 1, r.y, r.width - 2, r.height); context.fillRect(r.x, r.y + 1, r.width, r.height - 2);
      drawPixelText(context, art.pixel, name, r.x + 4, r.y + 3, { color: UI_ITEM_INKS.body });
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

/** Body sizes of the constant title window (the Keycloak sign-in card): wide, then phone. */
export const UI_TITLE_BODY = Object.freeze({ wide: 272, compact: 250, height: 116 });
const WINDOW_CHROME = { width: 48, height: 48 }, LOGO_GAP = 12, FOOTER_BAND = 22, EDGE = 8;

export interface UiTitleFrameLayout {
  readonly logo: UiGameLogoSize | null;
  readonly body: { readonly width: number; readonly height: number };
  readonly column: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}
/** One constant frame per viewport class: the widest body that fits, the largest logo that fits above it,
 * centred, and kept clear of the version/corner footer. Only a viewport too short for the whole window
 * shortens the body (which then scrolls). */
export function uiTitleFrameLayout(width: number, height: number, reserveFooter = true): UiTitleFrameLayout {
  const bottom = reserveFooter ? FOOTER_BAND : EDGE;
  const bodyWidth = width >= UI_TITLE_BODY.wide + WINDOW_CHROME.width + 120 ? UI_TITLE_BODY.wide
    : Math.max(0, Math.min(UI_TITLE_BODY.compact, width - WINDOW_CHROME.width - EDGE));
  const room = Math.max(0, height - bottom - EDGE);
  const bodyHeight = Math.max(0, Math.min(UI_TITLE_BODY.height, room - WINDOW_CHROME.height));
  const windowWidth = bodyWidth + WINDOW_CHROME.width, windowHeight = bodyHeight + WINDOW_CHROME.height;
  const logo = (['large', 'compact', 'small'] as const).find(size => {
    const outer = uiGameLogoSize(size); return outer.width <= width - EDGE && outer.height + LOGO_GAP + windowHeight <= room;
  }) ?? null;
  const logoSize = logo ? uiGameLogoSize(logo) : null;
  const columnWidth = Math.max(windowWidth, logoSize?.width ?? 0), columnHeight = windowHeight + (logoSize ? logoSize.height + LOGO_GAP : 0);
  const centred = Math.floor((height - columnHeight) / 2);
  const y = Math.max(0, Math.min(centred, height - bottom - columnHeight));
  return { logo, body: { width: bodyWidth, height: bodyHeight }, column: { x: Math.max(0, Math.floor((width - columnWidth) / 2)), y, width: columnWidth, height: columnHeight } };
}

export interface UiTitleFrameOptions {
  readonly id?: string; readonly title: string; readonly body: readonly UiElement[];
  /** Id of the body's scroll area. */
  readonly bodyId?: string;
  readonly apple?: LoadedAsset; readonly cask?: LoadedAsset; readonly version?: string;
  /** Light text link in the bottom-right corner (for example "Local preview"). */
  readonly corner?: UiElement;
  /** Title screens keep a footer band for the version and corner link; in-game prompts do not. */
  readonly reserveFooter?: boolean;
  readonly layout?: UiStyle;
}
export interface UiTitleFrameElement extends UiElement {
  readonly board: UiWindowElement; readonly body: UiElement;
  setTitle(title: string): void; setVersion(version?: string): void;
  /** Body width of the current viewport class, for hosts that size contents to it. */
  bodyWidth(): number;
}
/** The title flow's one constant frame: the logo sign above a fixed-size wood window, centred on the
 * world, with the version bottom-left. States change only the ribbon title and the body's contents. */
export function uiTitleFrame(options: UiTitleFrameOptions): UiTitleFrameElement {
  const reserveFooter = options.reserveFooter ?? true;
  const logos = (['large', 'compact', 'small'] as const).map(size => uiGameLogo({ size, apple: options.apple, cask: options.cask, layout: { visible: false } }));
  const body = uiScrollArea({ id: options.bodyId, gap: 8, align: 'center', justify: 'center', padding: { left: 6, right: 6 },
    width: uiFixed(UI_TITLE_BODY.wide), height: uiFixed(UI_TITLE_BODY.height) }, options.body);
  body.setProps({ touchScroll: true });
  const board = uiWindow({ id: options.id ? `${options.id}.window` : undefined, title: options.title, layout: { padding: 0, gap: 0 }, children: [body] });
  const column = uiFlex({ direction: 'column', align: 'center', gap: LOGO_GAP, position: 'absolute' }, [...logos, board]);
  const version = uiText('', { outline: true }); version.setProps({ ink: '#fff6e0', outlineInk: PLUM });
  version.setStyle({ position: 'absolute', inset: { left: uiFixed(EDGE), bottom: uiFixed(EDGE - 1) } });
  options.corner?.setStyle({ position: 'absolute', inset: { right: uiFixed(EDGE), bottom: uiFixed(EDGE) } });
  let key = '', bodyWidth: number = UI_TITLE_BODY.wide;
  const frame = new UiElement({ id: options.id, kind: 'title-frame', label: options.title, style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout },
    children: [column, version, ...(options.corner ? [options.corner] : [])],
    onArrange(element) {
      const r = element.contentRect, layout = uiTitleFrameLayout(r.width, r.height, reserveFooter);
      const next = JSON.stringify(layout); if (next === key) return; key = next; bodyWidth = layout.body.width;
      logos.forEach((logo, index) => logo.setStyle({ visible: layout.logo === (['large', 'compact', 'small'] as const)[index] }));
      body.setStyle({ width: uiFixed(layout.body.width), height: uiFixed(layout.body.height) });
      column.setStyle({ inset: { left: uiFixed(layout.column.x), top: uiFixed(layout.column.y) }, width: uiFixed(layout.column.width), height: uiFixed(layout.column.height) });
    } });
  const setVersion = (value?: string) => { const text = value ? `Version ${value}` : ''; version.setProps({ text }).setStyle({ visible: text !== '' }); };
  setVersion(options.version);
  return Object.assign(frame, { board, body, setVersion, setTitle(title: string) { board.setWindowTitle(title); frame.label = title; },
    bodyWidth: () => bodyWidth });
}

/** Title copy is sentence case; all-caps host messages are softened, anything else is shown as written. */
export function uiTitleSentence(text: string): string {
  if (!/[A-Z]/.test(text) || /[a-z]/.test(text)) return text;
  const lower = text.toLowerCase(); return lower.charAt(0).toUpperCase() + lower.slice(1);
}
