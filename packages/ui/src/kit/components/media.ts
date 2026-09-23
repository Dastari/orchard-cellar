import { FANTASY_ICON_FAMILIES } from '../../design-system/fantasy-controls.js';
import type { UiTone } from '../tokens.js';
import { uiElementTextContrast, paintUiMissingArt } from './art.js';
import type { LoadedAsset } from '../../assets.js';
import { atlasFrames, selectAtlasFrame } from '../../sprite.js';
import type { UiIconName } from '../../skin.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UI_ICON_BY_NAME, type UiFantasyIconName } from '../skin/icon-catalog.js';
import { uiButton, type UiButtonOptions } from './button.js';
import { uiInventorySelectorRect } from '../../design-system/inventory.js';
export interface UiImageOptions {
  readonly id?: string; readonly label: string; readonly layout?: UiStyle;
  readonly integerScale?: number | boolean; readonly fit?: 'contain' | 'cover' | 'none' | 'tile';
  readonly quarterTurns?: 0 | 1 | 2 | 3; readonly flipX?: boolean;
}
export function uiImage(image: CanvasImageSource, dimensions: { readonly width: number; readonly height: number; readonly x?: number; readonly y?: number }, options: UiImageOptions): UiElement {
  if (!(dimensions.width > 0 && dimensions.height > 0 && Number.isFinite(dimensions.width + dimensions.height))) throw new Error('Image source dimensions must be finite and positive');
  const baseScale = typeof options.integerScale === 'number' ? Math.max(1, Math.floor(options.integerScale)) : 1;
  const turns = options.quarterTurns ?? 0;
  const visualWidth = turns % 2 ? dimensions.height : dimensions.width;
  const visualHeight = turns % 2 ? dimensions.width : dimensions.height;
  return new UiElement({ id: options.id, kind: 'image', label: options.label,
    style: { width: uiFixed(visualWidth * baseScale), height: uiFixed(visualHeight * baseScale), ...options.layout },
    paint(element, { context }) {
      const r = element.rect, fit = options.fit ?? 'none';
      let scale = baseScale;
      if (fit === 'contain' || fit === 'cover') {
        scale = (fit === 'contain' ? Math.min : Math.max)(r.width / visualWidth, r.height / visualHeight);
        if (options.integerScale) scale = Math.max(1, fit === 'cover' ? Math.ceil(scale) : Math.floor(scale));
      }
      const width = Math.round(visualWidth * scale), height = Math.round(visualHeight * scale);
      if (!width || !height) return;
      context.imageSmoothingEnabled = false;
      const draw = (x: number, y: number) => {
        if (turns || options.flipX) {
          context.save(); context.translate(x + width / 2, y + height / 2); context.rotate(turns * Math.PI / 2);
          if (options.flipX) context.scale(-1, 1);
          const sourceWidth = dimensions.width * scale, sourceHeight = dimensions.height * scale;
          context.drawImage(image, dimensions.x ?? 0, dimensions.y ?? 0, dimensions.width, dimensions.height, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
          context.restore();
        } else context.drawImage(image, dimensions.x ?? 0, dimensions.y ?? 0, dimensions.width, dimensions.height, x, y, width, height);
      };
      if (fit === 'tile') {
        for (let y = r.y; y < r.y + r.height; y += height) for (let x = r.x; x < r.x + r.width; x += width) draw(x, y);
      } else draw(r.x + Math.floor((r.width - width) / 2), r.y + Math.floor((r.height - height) / 2));
    },
  });
}
export interface UiSpriteOptions extends Omit<UiImageOptions, 'quarterTurns' | 'flipX'> { readonly animation: string; readonly playing?: boolean; readonly loop?: boolean; readonly startTime?: number }
export function uiSprite(asset: LoadedAsset, options: UiSpriteOptions): UiElement {
  const frames = atlasFrames(asset.metadata, options.animation), first = frames[0];
  let startedAt: number | undefined; let finished = false;
  const scale = Math.max(1, Math.floor(typeof options.integerScale === 'number' ? options.integerScale : 1));
  return new UiElement({ id: options.id, kind: 'sprite', label: options.label, get animated() { return options.playing !== false && frames.length > 1 && !finished; },
    props: { animation: options.animation, asset: asset.name },
    style: { width: uiFixed((first?.width ?? 16) * scale), height: uiFixed((first?.height ?? 16) * scale), ...options.layout },
    paint(element, { context, now, reducedMotion }) {
      const fps = asset.metadata.animationMeta?.[options.animation]?.fps ?? 12;
      const loop = options.loop ?? asset.metadata.animationMeta?.[options.animation]?.loop ?? true;
      startedAt ??= now;
      const tick = options.playing === false || reducedMotion ? 0 : Math.floor(Math.max(0, now - (options.startTime ?? startedAt)) * fps / 1000);
      finished = !loop && tick >= frames.length - 1;
      const source = frames[loop ? tick % Math.max(1, frames.length) : Math.min(frames.length - 1, tick)];
      if (!source) return;
      const r = element.rect, width = source.width * scale, height = source.height * scale;
      context.drawImage(asset.image, source.x, source.y, source.width, source.height,
        r.x + Math.floor((r.width - width) / 2), r.y + Math.floor((r.height - height) / 2), width, height);
    },
  });
}
export type UiFantasyIconFamily = 'heart' | 'star' | 'coin' | 'lightning' | 'shield' | 'chat' | 'sword' | 'gear' | 'wrench' | 'crown' | 'trophy' | 'gift' | 'save' | 'book' | 'mail' | 'backpack' | 'music' | 'sound';
export type UiIconSource = { readonly fantasy: UiFantasyIconName } | { readonly cf: UiFantasyIconFamily; readonly level?: number } | { readonly lucide: UiIconName };
const tintedIcons = new WeakMap<object, Map<string, CanvasImageSource>>();
function tintIcon(image: CanvasImageSource, size: number, ink: string): CanvasImageSource {
  let variants = tintedIcons.get(image); if (!variants) { variants = new Map(); tintedIcons.set(image, variants); }
  const key = `${size}:${ink}`, cached = variants.get(key); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = ink; ctx.fillRect(0, 0, size, size); if (variants.size >= 8) variants.clear(); variants.set(key, canvas); return canvas;
}
export function uiIcon(source: UiIconSource, options: Omit<UiImageOptions, 'label'> & { readonly label?: string; readonly tone?: UiTone; readonly hoverOutline?: boolean } = {}): UiElement {
  const size = 16 * Math.max(1, Math.floor(typeof options.integerScale === 'number' ? options.integerScale : 1));
  const family = FANTASY_ICON_FAMILIES.find(def => 'cf' in source ? def.id === source.cf : 'fantasy' in source && def.frames.includes(UI_ICON_BY_NAME.get(source.fantasy)!.index));
  return new UiElement({ id: options.id, kind: 'icon', props: { tone: options.tone }, label: options.label ?? ('fantasy' in source ? source.fantasy : 'cf' in source ? source.cf : source.lucide),
    style: { width: uiFixed(size), height: uiFixed(size), ...options.layout },
    paint(element, { context, art, hovered }) {
      if (!art) return;
      if (art.missingArt) { paintUiMissingArt(context, element.rect, art); return; }
      const r = element.rect, x = r.x + Math.floor((r.width - size) / 2), y = r.y + Math.floor((r.height - size) / 2);
      if ('lucide' in source) {
        const transform = context.getTransform(), resolution = Math.max(1, Math.ceil(size * Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d))));
        context.save(); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.drawImage(tintIcon(art.icons[source.lucide].image, resolution, uiElementTextContrast(element).color), x, y, size, size); context.restore();
      }
      else {
        const entry = art.skin.icon['icon_catalog.catalog.0']!;
        const index = 'fantasy' in source ? UI_ICON_BY_NAME.get(source.fantasy)!.index : family!.frames[Math.max(0, Math.floor(source.level ?? 0)) % family!.frames.length]!;
        if (hovered && options.hoverOutline !== false && family?.outline !== undefined) {
          const outline = selectAtlasFrame(entry.asset.metadata, 'catalog', family.outline)!;
          context.drawImage(entry.asset.image, outline.x, outline.y, outline.width, outline.height, x, y, size, size);
        }
        const frame = selectAtlasFrame(entry.asset.metadata, 'catalog', index);
        if (frame) context.drawImage(entry.asset.image, frame.x, frame.y, frame.width, frame.height, x, y, size, size);
      }
    },
  });
}
export function uiIconButton(source: UiIconSource, options: UiButtonOptions): UiElement {
  const button = uiButton({ ...options, label: '', layout: { width: uiFixed(24), ...options.layout }, children: [uiIcon(source, { layout: { width: 'grow', height: 'grow' } })] });
  button.label = options.label; return button;
}
export interface UiDeferredImageSource {
  readonly image: CanvasImageSource;
  readonly frame: { readonly width: number; readonly height: number; readonly x?: number; readonly y?: number };
}
export interface UiDeferredImageOptions extends UiImageOptions {
  /** Painted until the source resolves. Defaults to the Cute Fantasy gift
   * symbol; `null` leaves the cell empty until the pixels arrive. */
  readonly fallback?: UiIconSource | null;
}
/** An image whose pixels arrive after the tree is built. The resolver runs at
 * paint time, so a completed load repaints without rebuilding the host tree,
 * losing scroll position or dismissing an open popover. */
export function uiDeferredImage(resolve: () => UiDeferredImageSource | undefined, options: UiDeferredImageOptions): UiElement {
  const fallback = options.fallback === null ? undefined : uiIcon(options.fallback ?? { cf: 'gift' }, { layout: { width: 'grow', height: 'grow' } });
  const { layout, id, label, integerScale, fit, quarterTurns, flipX } = options;
  const imageOptions = { label, integerScale, fit, quarterTurns, flipX };
  let previous: UiDeferredImageSource | undefined, picture: UiElement | undefined;
  resolve(); // Start loading as soon as the node exists.
  return new UiElement({ id, kind: 'deferred-image', label: options.label, style: { width: 'grow', height: 'grow', ...layout },
    paint(element, paint) {
      const ready = resolve();
      if (ready === undefined) { fallback?.hooks.paint?.(element, paint); return; }
      if (picture === undefined || ready.image !== previous?.image || ready.frame !== previous?.frame) {
        picture?.dispose();
        picture = uiImage(ready.image, ready.frame, { ...imageOptions, fit: fit ?? 'contain' });
        previous = ready;
      }
      picture.hooks.paint?.(element, paint);
    },
    onDispose() { fallback?.dispose(); picture?.dispose(); },
  });
}
const urlImages = new Map<string, HTMLImageElement>();
/** A standalone bitmap (for example a reviewed PNG tool icon under `public/`).
 * The kit owns loading and caching; hosts never create `Image` objects. */
export function uiImageUrl(url: string, options: UiDeferredImageOptions): UiElement {
  const resolve = (): UiDeferredImageSource | undefined => {
    let image = urlImages.get(url);
    if (!image) {
      if (typeof Image === 'undefined') return undefined;
      image = new Image(); urlImages.set(url, image); image.src = url;
    }
    if (image.complete && image.naturalWidth > 0) return { image, frame: { width: image.naturalWidth, height: image.naturalHeight } };
    const pending = image;
    pending.addEventListener('load', () => element.invalidateRoot?.(false), { once: true });
    pending.addEventListener('error', () => { if (urlImages.get(url) === pending) urlImages.delete(url); }, { once: true });
    return undefined;
  };
  const element: UiElement = uiDeferredImage(resolve, options);
  element.setProps({ url }, false);
  return element;
}
/** The authored confirm selector around a picked cell. It never takes input,
 * and it paints only inside its own rectangle. */
export interface UiSelectionReticleOptions {
  readonly id?: string; readonly layout?: UiStyle;
  /** Logical pixels between the reticle rectangle and the selected content. */
  readonly inset?: number;
  /** Logical pixels the selector's visible corners sit outside that content. */
  readonly outset?: number;
}
export function uiSelectionReticle(options: UiSelectionReticleOptions = {}): UiElement {
  const inset = Math.max(0, options.inset ?? 0), outset = options.outset ?? 3;
  return new UiElement({ id: options.id, kind: 'selection-reticle', label: 'Selected', pointerMode: 'passthrough',
    style: { position: 'absolute', inset: { left: 0, right: 0, top: 0, bottom: 0 }, ...options.layout },
    paintOverlay(element, { context, art }) {
      const entry = art?.skin.selector['selector_confirm.idle.0'];
      const source = entry && selectAtlasFrame(entry.asset.metadata, entry.entry.group, entry.entry.index);
      if (!entry || !source || art?.missingArt) return;
      const r = element.rect;
      const target = uiInventorySelectorRect({ x: r.x + inset, y: r.y + inset,
        width: Math.max(0, r.width - inset * 2), height: Math.max(0, r.height - inset * 2) }, outset);
      // Crop the authored cell to the element so no pixels land outside its clip.
      const left = Math.max(target.x, r.x), top = Math.max(target.y, r.y);
      const right = Math.min(target.x + target.width, r.x + r.width), bottom = Math.min(target.y + target.height, r.y + r.height);
      if (right <= left || bottom <= top) return;
      const sx = source.width / target.width, sy = source.height / target.height;
      context.imageSmoothingEnabled = false;
      context.drawImage(entry.asset.image, source.x + (left - target.x) * sx, source.y + (top - target.y) * sy,
        (right - left) * sx, (bottom - top) * sy, left, top, right - left, bottom - top);
    },
  });
}
