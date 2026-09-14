import type { UiPoint, UiRect } from './geometry.js';
import { containsPoint } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

const MINIMUM_THUMB_HEIGHT = 8;
const TOUCH_SWIPE_START_DISTANCE = 4;

export function scrollMaximum(totalRows: number, visibleRows: number): number {
  return Math.max(0, Math.floor(totalRows) - Math.max(1, Math.floor(visibleRows)));
}

export function scrollThumbRect(
  bounds: UiRect,
  totalRows: number,
  visibleRows: number,
  position: number,
  maximumHeight = Number.POSITIVE_INFINITY,
): UiRect {
  const maximum = scrollMaximum(totalRows, visibleRows);
  const height = maximum === 0
    ? bounds.height
    : Math.min(
      bounds.height,
      maximumHeight,
      Math.max(MINIMUM_THUMB_HEIGHT, Math.round(bounds.height * visibleRows / totalRows)),
    );
  const travel = Math.max(0, bounds.height - height);
  return {
    x: bounds.x,
    y: bounds.y + (maximum === 0 ? 0 : Math.round(travel * Math.max(0, Math.min(maximum, position)) / maximum)),
    width: bounds.width,
    height,
  };
}

/** Shared chat/shop scrollbar renderer. Continuous-content callers may cap
 * the grip height while retaining the same green track and parchment art. */
export function drawScrollBarChrome(
  context: CanvasRenderingContext2D,
  skin: UiSkin,
  bounds: UiRect,
  totalRows: number,
  visibleRows: number,
  position: number,
  maximumThumbHeight = Number.POSITIVE_INFINITY,
  showWhenDisabled = false,
): void {
  if ((!showWhenDisabled && scrollMaximum(totalRows, visibleRows) === 0) || bounds.height <= 0) return;
  const track = {
    x: bounds.x + Math.floor((bounds.width - 6) / 2),
    y: bounds.y,
    width: 6,
    height: bounds.height,
  };
  drawUiSkinAsset(context, skin.sliderTrackVertical, track, 'base', 2);
  const thumb = scrollThumbRect(
    bounds,
    totalRows,
    visibleRows,
    position,
    maximumThumbHeight,
  );
  // sliderHandle has named orientation frames and no base/idle fallback. The
  // old renderer therefore painted only the green rail. Give the thumb a
  // proportional, high-contrast body and use the authored vertical grip at
  // its centre so every shared list has an unmistakable draggable handle.
  context.save();
  context.fillStyle = '#3f2832';
  context.fillRect(thumb.x, thumb.y, thumb.width, thumb.height);
  context.fillStyle = '#e4a672';
  context.fillRect(
    thumb.x + 2,
    thumb.y + 2,
    Math.max(1, thumb.width - 4),
    Math.max(1, thumb.height - 4),
  );
  if (thumb.height >= 12) {
    const gripSize = Math.min(16, thumb.width, thumb.height);
    drawUiSkinAsset(context, skin.sliderHandle, {
      x: thumb.x + Math.floor((thumb.width - gripSize) / 2),
      y: thumb.y + Math.floor((thumb.height - gripSize) / 2),
      width: gripSize,
      height: gripSize,
    }, 'vertical');
  }
  context.restore();
}

export interface ScrollBarOptions {
  /** Draw a full-height disabled thumb so a permanent list gutter still reads
   * as a scrollbar when all rows currently fit. */
  readonly showWhenDisabled?: boolean;
  /** `jump` positions the thumb beneath a track click and immediately permits
   * dragging. `page` retains traditional page-at-a-time track clicks. */
  readonly trackClick?: 'page' | 'jump';
}

/** Shared top-origin scrollbar for framed, row-based content. */
export class ScrollBar {
  private boundsValue: UiRect = { x: 0, y: 0, width: 14, height: 0 };
  private totalRowsValue = 0;
  private visibleRowsValue = 1;
  private positionValue = 0;
  private dragging = false;
  private dragOffset = 0;
  private swipeStartY: number | null = null;
  private swipeLastY = 0;
  private swipeRemainder = 0;
  private swiping = false;

  constructor(
    private readonly skin: UiSkin,
    private readonly options: ScrollBarOptions = {},
  ) {}

  get position(): number { return this.positionValue; }
  get maximum(): number { return scrollMaximum(this.totalRowsValue, this.visibleRowsValue); }
  get atEnd(): boolean { return this.positionValue >= this.maximum; }
  get visible(): boolean { return this.maximum > 0 && this.boundsValue.height > 0; }
  get bounds(): UiRect { return this.boundsValue; }

  setBounds(bounds: UiRect): void { this.boundsValue = bounds; }

  setPosition(position: number): void {
    this.positionValue = Math.max(0, Math.min(this.maximum, Math.round(position)));
  }

  setMetrics(totalRows: number, visibleRows: number, stickToEnd = false): void {
    this.totalRowsValue = Math.max(0, Math.floor(totalRows));
    this.visibleRowsValue = Math.max(1, Math.floor(visibleRows));
    this.positionValue = stickToEnd ? this.maximum : Math.max(0, Math.min(this.maximum, this.positionValue));
    if (!this.visible) this.dragging = false;
  }

  scrollToEnd(): void { this.positionValue = this.maximum; }

  scrollBy(rows: number): boolean {
    if (this.maximum === 0 || rows === 0) return false;
    const previous = this.positionValue;
    this.positionValue = Math.max(0, Math.min(this.maximum, previous + Math.trunc(rows)));
    return this.positionValue !== previous;
  }

  wheel(deltaY: number, rows = 2): boolean {
    if (!this.visible || deltaY === 0) return false;
    this.scrollBy(deltaY < 0 ? -rows : rows);
    return true;
  }

  handleKey(key: string): boolean {
    if (!this.visible) return false;
    if (key === 'ArrowUp') { this.scrollBy(-1); return true; }
    if (key === 'ArrowDown') { this.scrollBy(1); return true; }
    if (key === 'PageUp') { this.scrollBy(-this.visibleRowsValue); return true; }
    if (key === 'PageDown') { this.scrollBy(this.visibleRowsValue); return true; }
    if (key === 'Home') { this.positionValue = 0; return true; }
    if (key === 'End') { this.positionValue = this.maximum; return true; }
    return false;
  }

  pointerDown(point: UiPoint): boolean {
    if (!this.visible || !containsPoint(this.boundsValue, point)) return false;
    const thumb = scrollThumbRect(
      this.boundsValue, this.totalRowsValue, this.visibleRowsValue, this.positionValue,
    );
    if (containsPoint(thumb, point)) {
      this.dragging = true;
      this.dragOffset = point.y - thumb.y;
    } else if (this.options.trackClick === 'jump') {
      const travel = Math.max(1, this.boundsValue.height - thumb.height);
      const thumbY = Math.max(this.boundsValue.y, Math.min(
        this.boundsValue.y + travel,
        point.y - thumb.height / 2,
      ));
      this.positionValue = Math.round((thumbY - this.boundsValue.y) / travel * this.maximum);
      this.dragging = true;
      this.dragOffset = thumb.height / 2;
    } else {
      this.scrollBy(point.y < thumb.y ? -this.visibleRowsValue : this.visibleRowsValue);
    }
    return true;
  }

  pointerMove(point: UiPoint): boolean {
    if (!this.dragging) return false;
    const thumb = scrollThumbRect(
      this.boundsValue, this.totalRowsValue, this.visibleRowsValue, this.positionValue,
    );
    const travel = Math.max(1, this.boundsValue.height - thumb.height);
    const thumbY = Math.max(this.boundsValue.y, Math.min(
      this.boundsValue.y + travel,
      point.y - this.dragOffset,
    ));
    this.positionValue = Math.round((thumbY - this.boundsValue.y) / travel * this.maximum);
    return true;
  }

  pointerUp(): boolean {
    if (!this.dragging) return false;
    this.dragging = false;
    return true;
  }

  /** Arms natural touch scrolling over the content viewport rather than only
   * over the narrow scrollbar. It deliberately does not consume a tap; the
   * owning list can retain ordinary tap behavior until movement crosses the
   * gesture threshold. */
  beginSwipe(point: UiPoint, contentBounds: UiRect, pointerType?: string): boolean {
    if (pointerType !== 'touch' || this.maximum === 0 || !containsPoint(contentBounds, point)) return false;
    this.swipeStartY = point.y;
    this.swipeLastY = point.y;
    this.swipeRemainder = 0;
    this.swiping = false;
    return true;
  }

  swipeMove(point: UiPoint, pixelsPerRow = 12): boolean {
    if (this.swipeStartY === null) return false;
    if (!this.swiping && Math.abs(point.y - this.swipeStartY) < TOUCH_SWIPE_START_DISTANCE) return false;
    this.swiping = true;
    this.swipeRemainder += this.swipeLastY - point.y;
    this.swipeLastY = point.y;
    const step = Math.max(1, pixelsPerRow);
    const rows = Math.trunc(this.swipeRemainder / step);
    if (rows !== 0) {
      this.scrollBy(rows);
      this.swipeRemainder -= rows * step;
    }
    return true;
  }

  endSwipe(): boolean {
    const consumed = this.swiping;
    this.cancelSwipe();
    return consumed;
  }

  cancelSwipe(): void {
    this.swipeStartY = null;
    this.swipeRemainder = 0;
    this.swiping = false;
  }

  pointerLeave(): void { this.dragging = false; this.cancelSwipe(); }

  draw(context: CanvasRenderingContext2D): void {
    drawScrollBarChrome(
      context,
      this.skin,
      this.boundsValue,
      this.totalRowsValue,
      this.visibleRowsValue,
      this.positionValue,
      Number.POSITIVE_INFINITY,
      this.options.showWhenDisabled === true,
    );
  }
}
