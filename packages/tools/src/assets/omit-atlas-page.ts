import { type BuiltBakedShadow, type BuiltBakedShadowFrame } from './baked-shadow.js';
import { hexToRgba } from './png.js';
import type { BuiltFrame, BuiltPageAsset } from './types.js';

export const OMIT_ATLAS_FORMAT = 1;
export interface DeclaredPageAsset extends BuiltPageAsset { readonly bakedShadow?: BuiltBakedShadow }
export interface PageShadowSelection {
  readonly name: string;
  readonly color: string;
  readonly frame: BuiltFrame;
  readonly selection: BuiltBakedShadowFrame;
}

export function pageShadowSelections(assets: Readonly<Record<string, DeclaredPageAsset>>): PageShadowSelection[] {
  const result: PageShadowSelection[] = [];
  for (const [name, asset] of Object.entries(assets)) {
    if (!asset.bakedShadow) continue;
    for (const [group, selections] of Object.entries(asset.bakedShadow.frames)) {
      const frames = asset.animations[group] ?? asset.variants[group]
        ?? (asset.states[group] ? [asset.states[group]] : []);
      if (frames.length !== selections.length) throw new Error(`${name}:${group}: shadow frame count mismatch`);
      selections.forEach((selection, index) => {
        if (selection.pixelCount > 0) result.push({ name: `${name}:${group}[${index}]`, color: asset.bakedShadow!.color, frame: frames[index]!, selection });
      });
    }
  }
  return result;
}

/** Mutate the already-encoded normal page. Each row is independently checked
 * against its original bytes, using one row copy rather than a second RGBA page. */
export function clearDeclaredPagePixels(
  rgba: Uint8Array, width: number, height: number, selections: readonly PageShadowSelection[],
): { readonly clearedPixels: number; readonly unchangedBytes: number } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > 512 || height > 2048 || rgba.length !== width * height * 4) throw new Error('Invalid omit page dimensions');
  const selected = new Uint8Array(width * height);
  let clearedPixels = 0;
  for (const { name, color, frame, selection } of selections) {
    const fail = (reason: string): never => { throw new Error(`${name}: invalid omit selection (${reason})`); };
    if (![frame.x, frame.y, frame.width, frame.height].every(Number.isSafeInteger)
      || frame.x < 0 || frame.y < 0 || frame.width < 1 || frame.height < 1
      || frame.x + frame.width > width || frame.y + frame.height > height
      || selection.width !== frame.width || selection.height !== frame.height) fail('frame dimensions');
    if (!/^#[0-9a-f]{8}$/i.test(color)) fail('reserved color');
    const reserved = hexToRgba(color);
    if (reserved[3] === 0 || reserved[3] === 255) fail('reserved alpha');
    const spans = selection.spans;
    if (spans.length % 3 !== 0 || !spans.every(Number.isSafeInteger)) fail('span triples');
    let count = 0, previousY = -1, previousEnd = 0;
    for (let index = 0; index < spans.length; index += 3) {
      const y = spans[index]!, x = spans[index + 1]!, length = spans[index + 2]!;
      if (y < 0 || y >= frame.height || x < 0 || length < 1 || x + length > frame.width
        || y < previousY || (y === previousY && x < previousEnd)) fail('span bounds/order');
      previousY = y; previousEnd = x + length;
      for (let offset = 0; offset < length; offset += 1) {
        const pixel = (frame.y + y) * width + frame.x + x + offset;
        if (selected[pixel]) fail('overlapping selections');
        for (let channel = 0; channel < 4; channel += 1) {
          if (rgba[pixel * 4 + channel] !== reserved[channel]) fail('source RGBA does not match declaration');
        }
        selected[pixel] = 1;
      }
      count += length;
    }
    if (count !== selection.pixelCount) fail('pixel count');
    clearedPixels += count;
  }
  const before = new Uint8Array(width * 4);
  for (let y = 0; y < height; y += 1) {
    const row = rgba.subarray(y * width * 4, (y + 1) * width * 4);
    before.set(row);
    for (let x = 0; x < width; x += 1) {
      if (selected[y * width + x]) row.fill(0, x * 4, x * 4 + 4);
    }
    for (let channel = 0; channel < row.length; channel += 1) {
      const expected = selected[y * width + Math.floor(channel / 4)] ? 0 : before[channel];
      if (row[channel] !== expected) throw new Error(`Omit page changed undeclared RGBA at row ${y}, channel ${channel}`);
    }
  }
  return { clearedPixels, unchangedBytes: rgba.length - clearedPixels * 4 };
}
