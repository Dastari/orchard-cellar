import { sortWorldDepthItems, worldDepthY, type WorldDepthItem } from './renderer.js';

/** Interleaves an impact-depth layer (weather today) around every world drawable. */
export function drawWorldDepthQueue(
  items: readonly WorldDepthItem[],
  cameraY: number,
  scale: number,
  drawDepthRange: (minimumDepth: number, maximumDepth: number) => number,
): number {
  return drawSortedWorldDepthQueue(sortWorldDepthItems(items), cameraY, scale, drawDepthRange);
}

/** Draws an already sorted queue so instrumentation can own sort and draw as
 * disjoint stages without adding a second ordering implementation. */
export function drawSortedWorldDepthQueue(
  sortedItems: readonly WorldDepthItem[],
  cameraY: number,
  scale: number,
  drawDepthRange: (minimumDepth: number, maximumDepth: number) => number,
): number {
  let draws = 0;
  let previousDepth = Number.NEGATIVE_INFINITY;
  for (const item of sortedItems) {
    const depth = (worldDepthY(item) - cameraY) * scale;
    if (depth >= previousDepth) {
      draws += drawDepthRange(previousDepth, depth);
      previousDepth = depth;
    }
    item.draw();
  }
  return draws + drawDepthRange(previousDepth, Number.POSITIVE_INFINITY);
}

