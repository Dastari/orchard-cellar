/** Mutable caller-owned output for synchronous receiver raster sampling. */
export interface ReceiverRgbDestination { r: number; g: number; b: number }

export function blackReceiverRgb(destination?: ReceiverRgbDestination): ReceiverRgbDestination {
  if (destination === undefined) return { r: 0, g: 0, b: 0 };
  destination.r = destination.g = destination.b = 0;
  return destination;
}
function channel(buffer: Uint8ClampedArray, width: number, x0: number, x1: number,
  y0: number, y1: number, fx: number, fy: number, component: number): number {
  // Preserve the reference's operation order, including its final rounding.
  return Math.round(
    (buffer[(y0 * width + x0) * 4 + component]! * (1 - fx) + buffer[(y0 * width + x1) * 4 + component]! * fx) * (1 - fy)
    + (buffer[(y1 * width + x0) * 4 + component]! * (1 - fx) + buffer[(y1 * width + x1) * 4 + component]! * fx) * fy);
}
/** Existing callers get independent objects; raster callers can reuse storage.
 * The result is consumed synchronously and is never retained by this helper. */
export function sampleReceiverRgb(buffer: Uint8ClampedArray, width: number, height: number,
  x: number, y: number, destination?: ReceiverRgbDestination): ReceiverRgbDestination {
  if (x < 0 || y < 0 || x >= width || y >= height) return blackReceiverRgb(destination);
  const result = destination ?? { r: 0, g: 0, b: 0 };
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  result.r = channel(buffer, width, x0, x1, y0, y1, fx, fy, 0);
  result.g = channel(buffer, width, x0, x1, y0, y1, fx, fy, 1);
  result.b = channel(buffer, width, x0, x1, y0, y1, fx, fy, 2);
  return result;
}
