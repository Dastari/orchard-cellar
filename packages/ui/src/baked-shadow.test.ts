import { describe, expect, it } from 'vitest';
import { parseBakedShadow } from './baked-shadow.js';
import { parseAtlasCategoryManifest } from './assets.js';

const frame = { x: 100, y: 200, width: 4, height: 2, durationTicks: 0 };
const metadata = { animations: { move: [frame, frame] }, variants: { facing: [frame] }, states: { base: frame } };
const empty = { width: 4, height: 2, pixelCount: 0, spans: [] };
const selected = { ...empty, pixelCount: 3, spans: [0, 1, 2, 1, 0, 1] };
const valid = { color: '#0000002A', frames: { move: [selected, empty], facing: [selected], base: [selected] } };

describe('baked shadow metadata loading', () => {
  it('accepts frame-local spans with empty frames and normalizes RGBA', () => {
    expect(parseBakedShadow(valid, metadata)).toEqual({ ...valid, color: '#0000002a' });
    expect(parseBakedShadow(undefined, metadata)).toBeUndefined();
  });

  it.each([
    { spans: [0, 0] }, { spans: [0, 0, -1] }, { spans: [0, 0, 0] },
    { spans: [0, 3, 2] }, { spans: [2, 0, 1] }, { spans: [-1, 0, 1] },
    { spans: [0, 0.5, 1] }, { spans: [0, 0, Number.NaN] },
    { spans: [0, 0, 2, 0, 1, 1] }, { spans: [1, 0, 1, 0, 0, 2] },
    { spans: [0, 0, '3'] }, { pixelCount: 4 }, { width: 5 }, { height: 3 },
  ])('rejects malformed spans/dimensions/counts %j', (patch) => {
    expect(() => parseBakedShadow({ ...valid, frames: { ...valid.frames, base: [{ ...selected, ...patch }] } }, metadata)).toThrow();
  });

  it('rejects missing, extra and misaligned groups and entirely empty declarations', () => {
    for (const frames of [{ ...valid.frames, base: [] }, { move: valid.frames.move },
      { ...valid.frames, extra: [selected] }, { move: [empty, empty], facing: [empty], base: [empty] }]) {
      expect(() => parseBakedShadow({ ...valid, frames }, metadata)).toThrow();
    }
    for (const color of ['#000000', '#00000000', '#000000ff']) expect(() => parseBakedShadow({ ...valid, color }, metadata)).toThrow();
  });

  it('accepts category v1/v2, rejects unknown schemas and cross-revision metadata', () => {
    const category = { schemaVersion: 1, category: 'trees', revision: 'expected', assets: {
      tree: { category: 'trees', ...metadata },
    } };
    expect(parseAtlasCategoryManifest(category, 'trees', 'expected').assets['tree']?.bakedShadow).toBeUndefined();
    const next = { ...category, schemaVersion: 2, assets: { tree: { category: 'trees', ...metadata, bakedShadow: valid } } };
    expect(parseAtlasCategoryManifest(next, 'trees', 'expected').assets['tree']?.bakedShadow?.color).toBe('#0000002a');
    expect(() => parseAtlasCategoryManifest({ ...next, schemaVersion: 99 }, 'trees', 'expected')).toThrow('schema');
    expect(() => parseAtlasCategoryManifest(next, 'trees', 'old')).toThrow('revision');
    expect(() => parseAtlasCategoryManifest(next, 'props', 'expected')).toThrow('revision');
    expect(() => parseAtlasCategoryManifest({ ...next, assets: { tree: { category: 'trees', ...metadata,
      bakedShadow: { ...valid, frames: {} } } } }, 'trees', 'expected')).toThrow('tree:');
  });
});
