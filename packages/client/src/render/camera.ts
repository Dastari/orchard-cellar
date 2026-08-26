export function cameraAxisOffset(target: number, viewportSize: number, worldSize: number): number {
  if (worldSize <= viewportSize) return (worldSize - viewportSize) / 2;
  return Math.max(0, Math.min(target - viewportSize / 2, worldSize - viewportSize));
}

export interface VisibleWorldBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function visibleWorldBounds(
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  margin = 0,
): VisibleWorldBounds {
  return {
    left: cameraX - margin,
    top: cameraY - margin,
    right: cameraX + canvasWidth / zoom + margin,
    bottom: cameraY + canvasHeight / zoom + margin,
  };
}

export function worldPointVisible(x: number, y: number, bounds: VisibleWorldBounds): boolean {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

export class Camera {
  x = 0;
  y = 0;

  constructor(
    readonly viewportWidth: number,
    readonly viewportHeight: number,
    readonly worldWidth: number,
    readonly worldHeight: number,
  ) {}

  follow(targetX: number, targetY: number): void {
    this.x = cameraAxisOffset(targetX, this.viewportWidth, this.worldWidth);
    this.y = cameraAxisOffset(targetY, this.viewportHeight, this.worldHeight);
  }
}
