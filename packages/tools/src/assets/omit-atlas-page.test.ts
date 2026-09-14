import { describe, expect, it } from 'vitest';
import { clearDeclaredPagePixels, pageShadowSelections, type DeclaredPageAsset, type PageShadowSelection } from './omit-atlas-page.js';

const frame = { x: 2, y: 1, width: 5, height: 2, durationTicks: 0 };
const selection: PageShadowSelection = {
  name: 'declared:base[0]', color: '#00000028', frame,
  selection: { width: 5, height: 2, pixelCount: 3, spans: [0, 0, 2, 1, 4, 1] },
};
function page(): Uint8Array {
  const pixels = Uint8Array.from({ length: 10 * 4 * 4 }, (_, index) => (index * 37 + 19) % 256);
  for (const pixel of [12, 13, 26]) pixels.set([0, 0, 0, 40], pixel * 4);
  // An adjacent undeclared asset has exactly the same reserved source RGBA.
  pixels.set([0, 0, 0, 40], 14 * 4);
  pixels.set([0, 0, 0, 41], 15 * 4);
  pixels.set([0, 0, 1, 40], 16 * 4);
  return pixels;
}

describe('declared atlas page omission', () => {
  it('clears only translated spans, preserving all adjacent/undeclared RGBA bytes', () => {
    const pixels = page(), before = pixels.slice();
    expect(clearDeclaredPagePixels(pixels, 10, 4, [selection])).toEqual({ clearedPixels: 3, unchangedBytes: 148 });
    for (let pixel = 0; pixel < 40; pixel += 1) {
      expect([...pixels.subarray(pixel * 4, pixel * 4 + 4)]).toEqual([12, 13, 26].includes(pixel)
        ? [0, 0, 0, 0] : [...before.subarray(pixel * 4, pixel * 4 + 4)]);
    }
    const unchanged = page();
    clearDeclaredPagePixels(unchanged, 10, 4, []);
    expect(unchanged).toEqual(before);
  });

  it('rejects malformed geometry, overlapping declarations and source-colour mismatches before mutation', () => {
    const invalid = [
      { ...selection, frame: { ...frame, x: -1 } },
      { ...selection, selection: { ...selection.selection, width: 4 } },
      { ...selection, selection: { ...selection.selection, spans: [0, 0] } },
      { ...selection, selection: { ...selection.selection, spans: [0, 4, 2] } },
      { ...selection, selection: { ...selection.selection, pixelCount: 1 } },
      { ...selection, color: '#00000029' },
      { ...selection, color: '#000000ff' },
    ];
    for (const candidate of invalid) {
      const pixels = page(), before = pixels.slice();
      expect(() => clearDeclaredPagePixels(pixels, 10, 4, [candidate])).toThrow(/invalid omit selection/);
      expect(pixels).toEqual(before);
    }
    expect(() => clearDeclaredPagePixels(page(), 10, 4, [selection, selection])).toThrow(/overlapping/);
    expect(() => clearDeclaredPagePixels(page(), 513, 4, [])).toThrow(/dimensions/);
  });

  it('matches states, variants and animation groups while omitting empty selections', () => {
    const record: DeclaredPageAsset = {
      assetId: 1, category: 'props', pageId: 'props:p000',
      animations: { walk: [frame, frame] }, variants: { base: [frame] }, states: { idle: frame },
      bakedShadow: { color: '#00000028', frames: {
        walk: [selection.selection, { ...selection.selection, pixelCount: 0, spans: [] }],
        base: [selection.selection], idle: [selection.selection],
      } },
    };
    expect(pageShadowSelections({ declared: record }).map((entry) => entry.name))
      .toEqual(['declared:walk[0]', 'declared:base[0]', 'declared:idle[0]']);
    const undeclared = { ...record };
    delete undeclared.bakedShadow;
    expect(pageShadowSelections({ undeclared })).toEqual([]);
    expect(() => pageShadowSelections({ bad: { ...record, animations: {} } })).toThrow(/frame count mismatch/);
  });
});
