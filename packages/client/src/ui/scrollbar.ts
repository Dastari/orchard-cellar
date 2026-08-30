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

function rotatedAsset(
  context: CanvasRenderingContext2D,
  asset: UiSkin['sliderTrack'],
  destination: UiRect,
): void {
  context.save();
  context.translate(destination.x + destination.width / 2, destination.y + destination.height / 2);
  context.rotate(Math.PI / 2);
  drawUiSkinAsset(context, asset, {
    x: -destination.height / 2,
    y: -destination.width / 2,
    width: destination.height,
    height: destination.width,
  });
  context.restore();
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
): void {
  if (scrollMaximum(totalRows, visibleRows) === 0 || bounds.height <= 0) return;
  const track = {
    x: bounds.x + Math.floor((bounds.width - 6) / 2),
    y: bounds.y,
    width: 6,
    height: bounds.height,
  };
  rotatedAsset(context, skin.sliderTrack, track);
  rotatedAsset(context, skin.sliderHandle, scrollThumbRect(
    bounds,
    totalRows,
    visibleRows,
    position,
    maximumThumbHeight,
  ));
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

  constructor(private readonly skin: UiSkin) {}

  get position(): number { return this.positionValue; }
  get maximum(): number { return scrollMaximum(this.totalRowsValue, this.visibleRowsValue); }
  get atEnd(): boolean { return this.positionValue >= this.maximum; }
  get visible(): boolean { return this.maximum > 0 && this.boundsValue.height > 0; }
  get bounds(): UiRect { return this.boundsValue; }

  setBounds(bounds: UiRect): void { this.boundsValue = bounds; }

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
    );
  }
}
