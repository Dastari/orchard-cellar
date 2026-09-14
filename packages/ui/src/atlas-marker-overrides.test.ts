import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BuiltAssetRecord } from './assets.js';
import { applyMarkerOverrides } from './atlas-marker-overrides.js';

const record: BuiltAssetRecord = { assetId: 1, category: 'props', pageId: 'props:p000', anchor: [0, 0], collision: [], tags: [],
  animations: {}, animationMeta: {}, variants: {}, variantMeta: {}, states: { base: { x: 0, y: 0, width: 2, height: 2, durationTicks: 1 } },
  placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
  bakedShadow: { color: '#00000066', frames: { base: [{ width: 2, height: 2, pixelCount: 1, spans: [1, 0, 1] }] } } };

describe('immutable marker overrides on prebuilt omit pages', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('preserves every non-marker pixel and leaves declared pixels cleared without readback', () => {
    const original = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255, 0, 0, 0, 0, 7, 8, 9, 255]);
    const actual = new Uint8Array(16);
    const context = { fillStyle: '', drawImage: () => actual.set(original), fillRect(x: number, y: number) {
      const rgb = this.fillStyle.slice(1).match(/../g)!.map((value) => Number.parseInt(value, 16));
      actual.set([...rgb, 255], (y * 2 + x) * 4);
    } };
    const canvas = { width: 0, height: 0, getContext: () => context };
    vi.stubGlobal('document', { createElement: () => canvas });
    const image = { naturalWidth: 2, naturalHeight: 2 } as HTMLImageElement;
    const layers = { base: [[{ x: 1, y: 0, marker: 'cloth', shade: 0 }, { x: 0, y: 1, marker: 'cloth', shade: 0 }]] };
    expect(applyMarkerOverrides(image, layers, { cloth: ['#aabbcc'] }, record)).toBe(canvas);
    expect([...actual]).toEqual([1, 2, 3, 255, 170, 187, 204, 255, 0, 0, 0, 0, 7, 8, 9, 255]);
    expect([...original]).toEqual([1, 2, 3, 255, 4, 5, 6, 255, 0, 0, 0, 0, 7, 8, 9, 255]);
  });
  it('retains the original UI fallback but fails an unavailable required variant recolour surface', () => {
    const canvas = { width: 0, height: 0, getContext: () => null };
    vi.stubGlobal('document', { createElement: () => canvas });
    const image = { naturalWidth: 2, naturalHeight: 2 } as HTMLImageElement;
    expect(applyMarkerOverrides(image, {}, {})).toBe(image);
    expect(() => applyMarkerOverrides(image, {}, {}, record)).toThrow('surface unavailable');
    expect(canvas.width * canvas.height).toBe(0);
  });
});
