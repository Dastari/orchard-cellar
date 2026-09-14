import type { BuiltAssetRecord } from './assets.js';

export interface MarkerPixel { readonly x: number; readonly y: number; readonly marker: string; readonly shade: number }

function isDeclaredShadowPixel(record: BuiltAssetRecord, x: number, y: number): boolean {
  for (const [name, selections] of Object.entries(record.bakedShadow?.frames ?? {})) {
    const frames = record.animations[name] ?? record.variants[name] ?? (record.states[name] === undefined ? [] : [record.states[name]!]);
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
      const frame = frames[frameIndex]!, spans = selections[frameIndex]?.spans ?? [];
      for (let i = 0; i < spans.length; i += 3) {
        if (y === frame.y + spans[i]! && x >= frame.x + spans[i + 1]! && x < frame.x + spans[i + 1]! + spans[i + 2]!) return true;
      }
    }
  }
  return false;
}
/** Recolour from immutable page pixels. Omit pages already contain their final
 * alpha; metadata guards prevent an override from restoring a declared span. */
export function applyMarkerOverrides(image: HTMLImageElement, markerLayers: Readonly<Record<string, readonly (readonly MarkerPixel[])[]>>, overrides: Readonly<Record<string, readonly string[]>>, omit: BuiltAssetRecord): HTMLCanvasElement;
export function applyMarkerOverrides(image: HTMLImageElement, markerLayers: Readonly<Record<string, readonly (readonly MarkerPixel[])[]>>, overrides: Readonly<Record<string, readonly string[]>>): CanvasImageSource;
export function applyMarkerOverrides(
  image: HTMLImageElement,
  markerLayers: Readonly<Record<string, readonly (readonly MarkerPixel[])[]>>,
  overrides: Readonly<Record<string, readonly string[]>>,
  omit?: BuiltAssetRecord,
): CanvasImageSource {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (context === null) {
    canvas.width = canvas.height = 0;
    if (omit === undefined) return image;
    throw new Error('Atlas marker surface unavailable');
  }
  context.drawImage(image, 0, 0);
  for (const animationLayers of Object.values(markerLayers)) for (const framePixels of animationLayers) for (const pixel of framePixels) {
    const ramp = overrides[pixel.marker];
    const color = ramp?.[pixel.shade] ?? ramp?.at(-1);
    if (!color || (omit !== undefined && isDeclaredShadowPixel(omit, pixel.x, pixel.y))) continue;
    context.fillStyle = color; context.fillRect(pixel.x, pixel.y, 1, 1);
  }
  return canvas;
}
