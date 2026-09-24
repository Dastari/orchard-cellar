import { Raster } from './raster.js';

export const CELL = 64;
export type Facing = 'down' | 'right' | 'up';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Per-frame attachment points measured from the modular base body and hands sheets. */
export interface FrameAnchors {
  readonly row: number;
  readonly frame: number;
  /** Top-left of the head box (Kenmi's worn helmets sit two pixels above it). */
  readonly head: Point;
  /** Centre of the hand that holds a main-hand weapon, when visible. */
  readonly mainHand: Point | null;
  /** Centre of the other hand, when visible. */
  readonly offHand: Point | null;
  /** Screen-left and screen-right arm/hand blobs, when visible. */
  readonly leftHand: Box | null;
  readonly rightHand: Box | null;
}

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

interface Component {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly size: number;
}

function components(image: Raster): Component[] {
  const seen = new Uint8Array(image.width * image.height);
  const found: Component[] = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (seen[y * image.width + x] || !image.alpha(x, y)) continue;
      let x0 = x;
      let y0 = y;
      let x1 = x;
      let y1 = y;
      let size = 0;
      const stack = [[x, y] as const];
      seen[y * image.width + x] = 1;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        size += 1;
        x0 = Math.min(x0, cx);
        y0 = Math.min(y0, cy);
        x1 = Math.max(x1, cx);
        y1 = Math.max(y1, cy);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
          if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
          if (seen[ny * image.width + nx] || !image.alpha(nx, ny)) continue;
          seen[ny * image.width + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      if (size >= 4) found.push({ x0, y0, x1, y1, size });
    }
  }
  return found;
}

const centre = (component: Component): Point => ({
  x: Math.floor((component.x0 + component.x1) / 2),
  y: Math.floor((component.y0 + component.y1) / 2),
});

/**
 * Measure anchors for one 64×64 cell. The head box is the bounding box of the
 * body's top ten rows; the main hand is the character's right hand (screen-left
 * when facing down, the rear hand when facing right, screen-right facing up).
 */
export function measureFrame(base: Raster, hands: Raster, row: number, frame: number, facing: Facing): FrameAnchors | null {
  const body = base.crop(frame * CELL, row * CELL, CELL, CELL);
  const whole = body.bounds();
  if (!whole) return null;
  const head = body.crop(0, whole.y, CELL, 10).bounds()!;
  const handParts = components(hands.crop(frame * CELL, row * CELL, CELL, CELL));
  const middle = head.x + head.width / 2;
  const left = handParts.filter((part) => centre(part).x < middle).sort((a, b) => b.size - a.size)[0];
  const right = handParts.filter((part) => centre(part).x >= middle).sort((a, b) => b.size - a.size)[0];
  const [main, off] = facing === 'up' ? [right, left] : [left, right];
  return {
    row,
    frame,
    head: { x: head.x, y: whole.y },
    mainHand: main ? centre(main) : null,
    offHand: off ? centre(off) : null,
    leftHand: left ?? null,
    rightHand: right ?? null,
  };
}
