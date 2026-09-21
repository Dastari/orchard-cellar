import { TILE_SIZE_PIXELS } from '@orchard/sim';
import type { UiRect } from '@orchard/ui';
/** Draw a semantic tile raster through the same camera as the terrain compositor.
 * The owning viewport supplies clipping; this helper never paints UI chrome. */
export function drawTileRaster(
  context: CanvasRenderingContext2D, image: CanvasImageSource,
  range: { readonly minimumX: number; readonly minimumY: number; readonly maximumX: number; readonly maximumY: number },
  viewport: UiRect, camera: { readonly x: number; readonly y: number; readonly zoom: number },
): void {
  const width = range.maximumX - range.minimumX, height = range.maximumY - range.minimumY;
  if (width <= 0 || height <= 0) return;
  context.drawImage(image, range.minimumX, range.minimumY, width, height,
    viewport.x + (range.minimumX * TILE_SIZE_PIXELS - camera.x) * camera.zoom,
    viewport.y + (range.minimumY * TILE_SIZE_PIXELS - camera.y) * camera.zoom,
    width * TILE_SIZE_PIXELS * camera.zoom, height * TILE_SIZE_PIXELS * camera.zoom);
}
