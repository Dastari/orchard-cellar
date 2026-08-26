import type { UiPoint, UiRect } from './geometry.js';
import { containsPoint } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

const MINIMUM_THUMB_HEIGHT = 8;

export function scrollMaximum(totalRows: number, visibleRows: number): number {
  return Math.max(0, Math.floor(totalRows) - Math.max(1, Math.floor(visibleRows)));
}

export function scrollThumbRect(
  bounds: UiRect,
  totalRows: number,
  visibleRows: number,
  position: number,
): UiRect {
  const maximum = scrollMaximum(totalRows, visibleRows);
  const height = maximum === 0
    ? bounds.height
    : Math.min(bounds.height, Math.max(MINIMUM_THUMB_HEIGHT, Math.round(bounds.height * visibleRows / totalRows)));
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

/** Shared top-origin scrollbar for framed, row-based content. */
export class ScrollBar {
  private boundsValue: UiRect = { x: 0, y: 0, width: 14, height: 0 };
  private totalRowsValue = 0;
  private visibleRowsValue = 1;
  private positionValue = 0;
  private dragging = false;
  private dragOffset = 0;

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

  pointerLeave(): void { this.dragging = false; }

  draw(context: CanvasRenderingContext2D): void {
    if (!this.visible) return;
    const track = {
      x: this.boundsValue.x + Math.floor((this.boundsValue.width - 6) / 2),
      y: this.boundsValue.y,
      width: 6,
      height: this.boundsValue.height,
    };
    rotatedAsset(context, this.skin.sliderTrack, track);
    const thumb = scrollThumbRect(
      this.boundsValue, this.totalRowsValue, this.visibleRowsValue, this.positionValue,
    );
    rotatedAsset(context, this.skin.sliderHandle, thumb);
  }
}
