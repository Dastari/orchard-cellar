import { UI_TONE_FACES, resolveUiTextContrast } from '../skin/contrast.js';
import { loadPixelUi, type PixelUi } from '../../pixel-ui.js';
import { selectAtlasFrame } from '../../sprite.js';
import { nineSlicePatches } from '../../nine-slice.js';
import type { UiRect } from '../../geometry.js';
import { loadUiIconSet, UI_ICON_NAMES, type UiIconSet } from '../../skin.js';
import { loadKitSkin, type UiLoadedSkin, type UiLoadedSkinFamily } from '../skin/load.js';
import type { UiElement } from '../runtime/element.js';
import type { UiTone } from '../tokens.js';

export interface UiKitArt {
  readonly missingArt?: boolean;
  readonly pixel: PixelUi;
  readonly skin: UiLoadedSkin<'frame' | 'button' | 'book' | 'icon' | 'slot' | 'meter' | 'cursor' | 'feedback' | 'slider' | 'toggle' | 'selector' | 'equipment'>;
  readonly icons: UiIconSet;
}
export async function loadUiKitArt(options: { readonly families?: readonly (keyof UiKitArt['skin'])[]; readonly icons?: readonly (typeof UI_ICON_NAMES)[number][] } = {}): Promise<UiKitArt> {
  const [pixel, skin, icons] = await Promise.all([loadPixelUi(),
    loadKitSkin(options.families ?? ['frame', 'button', 'book', 'icon', 'slot', 'meter', 'cursor', 'feedback', 'slider', 'toggle', 'selector', 'equipment']), loadUiIconSet(options.icons ?? UI_ICON_NAMES)]);
  const unloaded: UiKitArt['skin'] = { frame:{}, button:{}, book:{}, icon:{}, slot:{}, meter:{}, cursor:{}, feedback:{}, slider:{}, toggle:{}, selector:{}, equipment:{} };
  return { pixel, skin: { ...unloaded, ...skin }, icons };
}
/** Surface inheritance is also used by text nested in layout-only containers. */
/** Game windows and books set `textCase: 'upper'`, so labels, buttons and list rows use the caps font;
 * paragraphs (dialogue, descriptions, hints) opt back out with `'as-authored'`. Studio sets neither. */
export function uiElementUpperCase(element: UiElement): boolean {
  for (let node: UiElement | null = element; node; node = node.parent) {
    const value = node.props['textCase'];
    if (value === 'upper') return true;
    if (value === 'as-authored') return false;
  }
  return false;
}
export function uiElementTone(element: UiElement): UiTone {
  for (let node: UiElement | null = element; node; node = node.parent) {
    if (typeof node.props['tone'] === 'string') return node.props['tone'] as UiTone;
  }
  return 'neutral';
}
/** Text and symbols share the contrast of their nearest painted surface. */
export function uiElementTextContrast(element: UiElement) {
  for (let node: UiElement | null = element; node; node = node.parent) {
    if (node.props['buttonSurface']) return resolveUiTextContrast(node.disabled ? 'muted' : uiElementTone(node), 'label', node.disabled ? 'button_disabled' : node.props['pressed'] ? 'button_pressed' : 'button_idle');
    if (typeof node.props['tone'] === 'string') return resolveUiTextContrast(uiElementTone(node));
  }
  return resolveUiTextContrast('neutral');
}
const surfaceCache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
const skinIds = new WeakMap<object, number>(); let nextSkinId = 0, cachedPixels = 0;
function skinCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
}
export function uiSkinFrame(entry: UiLoadedSkinFamily[string]) {
  const source = selectAtlasFrame(entry.asset.metadata, entry.entry.group, entry.entry.index);
  if (!source || !entry.entry.crop) return source;
  const [x, y, width, height] = entry.entry.crop;
  return { ...source, x: source.x + x, y: source.y + y, width, height };
}

/** Existing nine-slice geometry, with no second device-space rounding. */
export function paintUiSkin(context: CanvasRenderingContext2D, skin: UiLoadedSkinFamily, key: string, rect: UiRect, fill = true): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const entry = skin[key];
  if (!entry) throw new Error(`Unknown UI skin entry: ${key}`);
  const source = uiSkinFrame(entry);
  if (!source) throw new Error(`Missing UI skin frame: ${key}`);
  const slice = entry.entry.slice ?? (entry.entry.sizing === 'segmented' ? [Math.max(1, Math.floor(source.height / 3)), 0, Math.max(1, Math.floor(source.height / 3)), 0] as const : undefined);
  if (slice) {
    const draw = (target: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, bounds: UiRect) => {
      for (const patch of nineSlicePatches(source, bounds, slice)) {
        const s = patch.source, d = patch.destination;
        if (!fill && s.x >= source.x + slice[0] && s.x < source.x + source.width - slice[2]
          && s.y >= source.y + slice[1] && s.y < source.y + source.height - slice[3]) continue;
        target.drawImage(entry.asset.image, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height);
      }
    };
    // Assemble tiled source pixels before device scaling. Separate fractional-DPR
    // draw calls expose hairline seams between otherwise adjacent tile patches.
    let identity = skinIds.get(entry); if (identity === undefined) { identity = ++nextSkinId; skinIds.set(entry, identity); }
    const cacheKey = `${identity}:${rect.width}:${rect.height}:${fill}`;
    let canvas = surfaceCache.get(cacheKey);
    if (!canvas) {
      const created = skinCanvas(rect.width, rect.height);
      const target = created?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!created || !target) { draw(context, rect); return; }
      target.imageSmoothingEnabled = false; draw(target, { ...rect, x: 0, y: 0 }); canvas = created;
      const pixels = rect.width * rect.height;
      if (pixels <= 2_000_000) {
        if (cachedPixels + pixels > 2_000_000) { surfaceCache.clear(); cachedPixels = 0; }
        surfaceCache.set(cacheKey, canvas); cachedPixels += pixels;
      }
    }
    context.drawImage(canvas, rect.x, rect.y);

  } else {
    const scale = Math.max(1, Math.floor(Math.min(rect.width / source.width, rect.height / source.height)));
    const width = source.width * scale, height = source.height * scale;
    context.drawImage(entry.asset.image, source.x, source.y, source.width, source.height,
      rect.x + Math.floor((rect.width - width) / 2), rect.y + Math.floor((rect.height - height) / 2), width, height);
  }
}

/** Visible failure state uses kit tokens and an existing licensed symbol. */
export function paintUiMissingArt(context: CanvasRenderingContext2D, rect: UiRect, art: UiKitArt): void {
  context.fillStyle = UI_TONE_FACES.muted.frame.face; context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeStyle = resolveUiTextContrast('muted').color; context.lineWidth = 1;
  context.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
  if (rect.width >= 16 && rect.height >= 16) context.drawImage(art.icons.box.image, rect.x + Math.floor((rect.width - 16) / 2), rect.y + Math.floor((rect.height - 16) / 2), 16, 16);
}
