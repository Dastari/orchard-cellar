import type { UiPoint, UiRect } from '../../geometry.js';
export const UI_LAB_WORLD = { x: 0, y: 0, width: 14900, height: 14000 } as const;
export class UiLabCamera {
  x = 0; y = 0; zoom = 1;
  viewport: UiRect = { x: 0, y: 0, width: 1, height: 1 };
  worldPoint(point: UiPoint): UiPoint { return { x: (point.x - this.viewport.x) / this.zoom + this.x, y: (point.y - this.viewport.y) / this.zoom + this.y }; }
  screenPoint(point: UiPoint): UiPoint { return { x: (point.x - this.x) * this.zoom + this.viewport.x, y: (point.y - this.y) * this.zoom + this.viewport.y }; }
  zoomAt(point: UiPoint, zoom: number): void {
    const before = this.worldPoint(point); this.zoom = Math.max(0.2, Math.min(3, zoom));
    const after = this.worldPoint(point); this.x += before.x - after.x; this.y += before.y - after.y; this.clamp();
  }
  pan(dx: number, dy: number): void { this.x -= dx / this.zoom; this.y -= dy / this.zoom; this.clamp(); }
  fit(rect: UiRect): void {
    this.zoom = Math.max(0.2, Math.min(3, Math.min(this.viewport.width / rect.width, this.viewport.height / rect.height) * 0.9));
    this.x = rect.x - (this.viewport.width / this.zoom - rect.width) / 2;
    this.y = rect.y - (this.viewport.height / this.zoom - rect.height) / 2; this.clamp();
  }
  clamp(): void {
    this.x = Math.max(0, Math.min(Math.max(0, UI_LAB_WORLD.width - this.viewport.width / this.zoom), this.x));
    this.y = Math.max(0, Math.min(Math.max(0, UI_LAB_WORLD.height - this.viewport.height / this.zoom), this.y));
  }
  visible(rect: UiRect): boolean {
    return rect.x + rect.width > this.x && rect.y + rect.height > this.y
      && rect.x < this.x + this.viewport.width / this.zoom && rect.y < this.y + this.viewport.height / this.zoom;
  }
}
