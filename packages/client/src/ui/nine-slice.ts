import type { UiRect } from './geometry.js';

export interface NineSlicePatch {
  readonly source: UiRect;
  readonly destination: UiRect;
}

function fitInsets(total: number, before: number, after: number): readonly [number, number] {
  const sum = before + after;
  if (sum <= total || sum === 0) return [before, after];
  const fittedBefore = Math.floor(total * before / sum);
  return [fittedBefore, total - fittedBefore];
}

export function nineSlicePatches(
  source: UiRect,
  destination: UiRect,
  slice: readonly [left: number, top: number, right: number, bottom: number],
): NineSlicePatch[] {
  const [sourceLeft, sourceTop, sourceRight, sourceBottom] = slice;
  const [destLeft, destRight] = fitInsets(destination.width, sourceLeft, sourceRight);
  const [destTop, destBottom] = fitInsets(destination.height, sourceTop, sourceBottom);
  const sourceWidths = [sourceLeft, Math.max(0, source.width - sourceLeft - sourceRight), sourceRight];
  const sourceHeights = [sourceTop, Math.max(0, source.height - sourceTop - sourceBottom), sourceBottom];
  const destWidths = [destLeft, Math.max(0, destination.width - destLeft - destRight), destRight];
  const destHeights = [destTop, Math.max(0, destination.height - destTop - destBottom), destBottom];
  const patches: NineSlicePatch[] = [];
  let sourceY = source.y;
  let destY = destination.y;
  for (let row = 0; row < 3; row += 1) {
    let sourceX = source.x;
    let destX = destination.x;
    for (let column = 0; column < 3; column += 1) {
      const sourceRect = { x: sourceX, y: sourceY, width: sourceWidths[column]!, height: sourceHeights[row]! };
      const destRect = { x: destX, y: destY, width: destWidths[column]!, height: destHeights[row]! };
      if (sourceRect.width > 0 && sourceRect.height > 0 && destRect.width > 0 && destRect.height > 0) {
        patches.push({ source: sourceRect, destination: destRect });
      }
      sourceX += sourceRect.width;
      destX += destRect.width;
    }
    sourceY += sourceHeights[row]!;
    destY += destHeights[row]!;
  }
  return patches;
}

export function drawNineSlice(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  source: UiRect,
  destination: UiRect,
  slice: readonly [number, number, number, number],
): void {
  context.imageSmoothingEnabled = false;
  for (const patch of nineSlicePatches(source, destination, slice)) {
    const s = patch.source; const d = patch.destination;
    context.drawImage(image, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height);
  }
}
