import type { PixelUi } from '../../render/pixel-ui.js';
import { drawButton } from '../button.js';
import { containsPoint, insetRect, type UiInsets, type UiPoint, type UiRect, type UiSize } from '../geometry.js';
import { drawNineSlice } from '../nine-slice.js';
import { drawUiSkinAsset, uiAssetFrame, type UiSkin } from '../skin.js';
import { drawFantasyButton } from './fantasy-controls.js';
import { layoutUiFlex, type UiFlexDirection, type UiFlexItem, type UiItemAlignment } from './layout.js';

export type UiFrameStyle = 'wood' | 'parchment' | 'wood_parchment' | 'thin' | 'book' | 'unframed';
export type UiResizeCorner = 'north_west' | 'north_east' | 'south_west' | 'south_east';

export interface UiFrameMetrics {
  readonly chromeInsets: UiInsets;
  readonly defaultPadding: number;
  readonly minimumSize: UiSize;
  readonly resizable: boolean;
}

/** Insets describe writable visual chrome, which can differ from an asset's
 * repeat boundary. Composite frames consume the wood 10px visual post and the
 * parchment 8px border before adding content breathing room. */
export const UI_FRAME_METRICS: Readonly<Record<UiFrameStyle, UiFrameMetrics>> = {
  wood: {
    chromeInsets: { left: 10, top: 10, right: 10, bottom: 10 },
    defaultPadding: 8,
    minimumSize: { width: 28, height: 28 },
    resizable: true,
  },
  parchment: {
    chromeInsets: { left: 8, top: 8, right: 8, bottom: 8 },
    defaultPadding: 4,
    minimumSize: { width: 24, height: 24 },
    resizable: true,
  },
  wood_parchment: {
    chromeInsets: { left: 18, top: 18, right: 18, bottom: 18 },
    defaultPadding: 3,
    minimumSize: { width: 44, height: 44 },
    resizable: true,
  },
  thin: {
    chromeInsets: { left: 6, top: 6, right: 6, bottom: 7 },
    defaultPadding: 2,
    minimumSize: { width: 18, height: 19 },
    resizable: true,
  },
  book: {
    chromeInsets: { left: 14, top: 14, right: 14, bottom: 14 },
    defaultPadding: 2,
    minimumSize: { width: 224, height: 133 },
    // The original artwork is 224×133. Resizable spreads split it into two
    // independently tiled leaves, preserving native page and gutter pixels.
    resizable: true,
  },
  unframed: {
    chromeInsets: { left: 0, top: 0, right: 0, bottom: 0 },
    defaultPadding: 0,
    minimumSize: { width: 1, height: 1 },
    resizable: true,
  },
};

export interface UiFrameSlotSpec extends UiFlexItem {
  readonly id: string;
}

export interface UiFrameSlotLayout {
  readonly frame: UiRect;
  readonly content: UiRect;
  readonly slots: Readonly<Record<string, UiRect>>;
}

export interface UiFrameControlLayout {
  readonly close: UiRect;
  readonly firstPage?: UiRect;
  readonly previousPage?: UiRect;
  readonly nextPage?: UiRect;
  readonly lastPage?: UiRect;
}

export interface DrawUiFrameControlsOptions {
  readonly bookNavigation?: boolean;
  readonly spreadIndex?: number;
  readonly spreadCount?: number;
}

const CLOSE_BUTTON_SIZE = { width: 24, height: 16 } as const;

/** Each leaf's ornamental corner work reaches beyond the writable 14px inset.
 * Keeping a 24px authored corner means only undecorated edge and page-face
 * pixels enter the repeat bands when a book is resized. */
export const UI_BOOK_PAGE_REPEAT_SLICE = [24, 24, 24, 24] as const;

/** One close action is reused everywhere for recognition and accessibility.
 * Each frame style only changes its mount point so the control sits on chrome,
 * never in the writable content rectangle. */
export function uiFrameControlLayout(
  frame: UiRect,
  style: UiFrameStyle,
  bookNavigation = style === 'book',
): UiFrameControlLayout {
  const mount = style === 'wood'
    ? { right: 5, top: 2 }
    : style === 'parchment'
      ? { right: 3, top: -6 }
      : style === 'wood_parchment'
        ? { right: 6, top: 4 }
        : style === 'thin'
          ? { right: 1, top: -8 }
          : style === 'book'
            ? { right: 4, top: -5 }
            : { right: 0, top: -20 };
  const close = {
    x: frame.x + frame.width - CLOSE_BUTTON_SIZE.width - mount.right,
    y: frame.y + mount.top,
    ...CLOSE_BUTTON_SIZE,
  };
  if (!bookNavigation || style !== 'book') return { close };
  const buttonWidth = 24;
  const buttonHeight = 16;
  // Page-turning controls live below the authored book face. This protects the
  // page-number baseline and keeps navigation stable as page content changes.
  const buttonY = frame.y + frame.height + 4;
  return {
    close,
    firstPage: { x: frame.x + 8, y: buttonY, width: buttonWidth, height: buttonHeight },
    previousPage: { x: frame.x + 36, y: buttonY, width: buttonWidth, height: buttonHeight },
    nextPage: { x: frame.x + frame.width - 60, y: buttonY, width: buttonWidth, height: buttonHeight },
    lastPage: { x: frame.x + frame.width - 32, y: buttonY, width: buttonWidth, height: buttonHeight },
  };
}

export function drawUiFrameControls(
  context: CanvasRenderingContext2D,
  skin: UiSkin,
  fonts: PixelUi,
  frame: UiRect,
  style: UiFrameStyle,
  options: DrawUiFrameControlsOptions = {},
): UiFrameControlLayout {
  const layout = uiFrameControlLayout(frame, style, options.bookNavigation);
  drawFantasyButton(context, skin, fonts, layout.close, {
    tone: 'red', shape: 'chamfered', size: 'wide', glyph: 'cross',
  });
  if (layout.firstPage === undefined || layout.previousPage === undefined
    || layout.nextPage === undefined || layout.lastPage === undefined) return layout;
  const spreadIndex = Math.max(0, options.spreadIndex ?? 0);
  const spreadCount = Math.max(1, options.spreadCount ?? 1);
  const atStart = spreadIndex === 0;
  const atEnd = spreadIndex >= spreadCount - 1;
  drawButton(context, skin, fonts, layout.firstPage, {
    label: '|<', size: 'compact', state: atStart ? 'disabled' : 'idle',
  });
  drawButton(context, skin, fonts, layout.previousPage, {
    label: '<', size: 'compact', state: atStart ? 'disabled' : 'idle',
  });
  drawButton(context, skin, fonts, layout.nextPage, {
    label: '>', size: 'compact', state: atEnd ? 'disabled' : 'idle',
  });
  drawButton(context, skin, fonts, layout.lastPage, {
    label: '>|', size: 'compact', state: atEnd ? 'disabled' : 'idle',
  });
  return layout;
}

function paddingInsets(padding: number | Partial<UiInsets>): UiInsets {
  if (typeof padding === 'number') {
    const value = Math.max(0, padding);
    return { left: value, top: value, right: value, bottom: value };
  }
  return {
    left: Math.max(0, padding.left ?? 0),
    top: Math.max(0, padding.top ?? 0),
    right: Math.max(0, padding.right ?? 0),
    bottom: Math.max(0, padding.bottom ?? 0),
  };
}

export function uiFrameContentRect(
  frame: UiRect,
  style: UiFrameStyle,
  padding: number | Partial<UiInsets> = UI_FRAME_METRICS[style].defaultPadding,
): UiRect {
  const metrics = UI_FRAME_METRICS[style];
  const extra = paddingInsets(padding);
  return insetRect(frame, {
    left: metrics.chromeInsets.left + extra.left,
    top: metrics.chromeInsets.top + extra.top,
    right: metrics.chromeInsets.right + extra.right,
    bottom: metrics.chromeInsets.bottom + extra.bottom,
  });
}

/** The open-book sprite has a non-writable gutter; callers receive two page slots. */
export function uiBookPageRects(
  frame: UiRect,
  padding = 2,
  innerPagePadding = 8,
): readonly [UiRect, UiRect] {
  const content = uiFrameContentRect(frame, 'book', padding);
  const gutter = 16;
  const pageWidth = Math.max(0, Math.floor((content.width - gutter) / 2) - innerPagePadding);
  return [
    { x: content.x, y: content.y, width: pageWidth, height: content.height },
    { x: content.x + content.width - pageWidth, y: content.y, width: pageWidth, height: content.height },
  ];
}

export function drawUiFrame(
  context: CanvasRenderingContext2D,
  skin: UiSkin,
  frame: UiRect,
  style: UiFrameStyle,
): void {
  if (style === 'unframed') return;
  if (style === 'wood' || style === 'wood_parchment') {
    drawUiSkinAsset(context, skin.panelWood, frame);
  }
  if (style === 'parchment') drawUiSkinAsset(context, skin.panelParchment, frame);
  if (style === 'thin') drawUiSkinAsset(context, skin.frameThin, frame);
  if (style === 'book') {
    const source = uiAssetFrame(skin.bookOpen);
    if (source !== null) {
      const sourceLeftWidth = Math.floor(source.width / 2);
      const destinationLeftWidth = Math.floor(frame.width / 2);
      drawNineSlice(context, skin.bookOpen.image, {
        x: source.x,
        y: source.y,
        width: sourceLeftWidth,
        height: source.height,
      }, {
        x: frame.x,
        y: frame.y,
        width: destinationLeftWidth,
        height: frame.height,
      }, UI_BOOK_PAGE_REPEAT_SLICE);
      drawNineSlice(context, skin.bookOpen.image, {
        x: source.x + sourceLeftWidth,
        y: source.y,
        width: source.width - sourceLeftWidth,
        height: source.height,
      }, {
        x: frame.x + destinationLeftWidth,
        y: frame.y,
        width: frame.width - destinationLeftWidth,
        height: frame.height,
      }, UI_BOOK_PAGE_REPEAT_SLICE);
    }
  }
  if (style === 'wood_parchment') {
    drawUiSkinAsset(context, skin.panelParchment, insetRect(frame, {
      left: 10, top: 10, right: 10, bottom: 10,
    }));
  }
}

/** Named content slots are laid out strictly inside the frame's authored safe area. */
export function layoutUiFrameSlots(
  frame: UiRect,
  style: UiFrameStyle,
  slots: readonly UiFrameSlotSpec[],
  options: {
    readonly direction?: UiFlexDirection;
    readonly gap?: number;
    readonly align?: UiItemAlignment;
    readonly padding?: number | Partial<UiInsets>;
  } = {},
): UiFrameSlotLayout {
  const content = uiFrameContentRect(
    frame,
    style,
    options.padding ?? UI_FRAME_METRICS[style].defaultPadding,
  );
  const rects = layoutUiFlex(content, slots, {
    direction: options.direction ?? 'column',
    gap: options.gap ?? 4,
    align: options.align ?? 'stretch',
  });
  return {
    frame,
    content,
    slots: Object.fromEntries(slots.map((slot, index) => [slot.id, rects[index]!])),
  };
}

export function uiFrameResizeHandles(frame: UiRect, size = 12): Readonly<Record<UiResizeCorner, UiRect>> {
  const safeSize = Math.max(6, Math.round(size));
  const half = Math.floor(safeSize / 2);
  return {
    north_west: { x: frame.x - half, y: frame.y - half, width: safeSize, height: safeSize },
    north_east: { x: frame.x + frame.width - half, y: frame.y - half, width: safeSize, height: safeSize },
    south_west: { x: frame.x - half, y: frame.y + frame.height - half, width: safeSize, height: safeSize },
    south_east: { x: frame.x + frame.width - half, y: frame.y + frame.height - half, width: safeSize, height: safeSize },
  };
}

interface ActiveFrameResize {
  readonly corner: UiResizeCorner;
  readonly pointer: UiPoint;
  readonly frame: UiRect;
  readonly minimum: UiSize;
  readonly maximum?: Partial<UiSize>;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Reusable corner resizing for any frame. Its opposite corner remains anchored. */
export class UiFrameResizeController {
  private activeResize: ActiveFrameResize | null = null;

  get active(): boolean { return this.activeResize !== null; }

  pointerDown(
    point: UiPoint,
    button: number,
    frame: UiRect,
    minimum: UiSize,
    maximum?: Partial<UiSize>,
  ): boolean {
    if (button !== 0) return false;
    const hit = (Object.entries(uiFrameResizeHandles(frame)) as [UiResizeCorner, UiRect][])
      .find(([, handle]) => containsPoint(handle, point));
    if (hit === undefined) return false;
    this.activeResize = { corner: hit[0], pointer: point, frame, minimum, maximum };
    return true;
  }

  pointerMove(point: UiPoint, bounds: UiRect): UiRect | null {
    const active = this.activeResize;
    if (active === null) return null;
    const deltaX = point.x - active.pointer.x;
    const deltaY = point.y - active.pointer.y;
    const left = active.frame.x;
    const top = active.frame.y;
    const right = active.frame.x + active.frame.width;
    const bottom = active.frame.y + active.frame.height;
    const west = active.corner === 'north_west' || active.corner === 'south_west';
    const north = active.corner === 'north_west' || active.corner === 'north_east';
    const maximumWidth = Math.max(active.minimum.width, active.maximum?.width ?? bounds.width);
    const maximumHeight = Math.max(active.minimum.height, active.maximum?.height ?? bounds.height);
    const movingX = west
      ? clamp(left + deltaX, Math.max(bounds.x, right - maximumWidth), right - active.minimum.width)
      : clamp(right + deltaX, left + active.minimum.width, Math.min(bounds.x + bounds.width, left + maximumWidth));
    const movingY = north
      ? clamp(top + deltaY, Math.max(bounds.y, bottom - maximumHeight), bottom - active.minimum.height)
      : clamp(bottom + deltaY, top + active.minimum.height, Math.min(bounds.y + bounds.height, top + maximumHeight));
    return {
      x: west ? movingX : left,
      y: north ? movingY : top,
      width: west ? right - movingX : movingX - left,
      height: north ? bottom - movingY : movingY - top,
    };
  }

  pointerUp(): boolean {
    if (this.activeResize === null) return false;
    this.activeResize = null;
    return true;
  }

  cancel(): void { this.activeResize = null; }
}

export function drawUiFrameResizeHandles(
  context: CanvasRenderingContext2D,
  frame: UiRect,
  active = false,
): void {
  context.save();
  context.fillStyle = active ? '#63c74d' : '#f5d494';
  context.strokeStyle = '#3f2832';
  context.lineWidth = 1;
  for (const handle of Object.values(uiFrameResizeHandles(frame))) {
    context.fillRect(handle.x + 3, handle.y + 3, handle.width - 6, handle.height - 6);
    context.strokeRect(handle.x + 2.5, handle.y + 2.5, handle.width - 5, handle.height - 5);
  }
  context.restore();
}
