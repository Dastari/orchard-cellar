import { describe, expect, it } from 'vitest';
import { frameKind, variantTopology } from './frame-kind.js';
import type { AssetSource, PixelGrid } from './types.js';

const grid: PixelGrid = ['.'];
const source = (overrides: Partial<AssetSource>): AssetSource => ({
  name: 'test', category: 'tiles', size: [1, 1], anchor: [0, 0], frames: { base: [grid] }, ...overrides,
});

describe('frame group classification', () => {
  it('separates states, timed animations, and untimed variants', () => {
    expect(frameKind(source({}), 'base', [grid])).toBe('state');
    expect(frameKind(source({ fps: 8 }), 'walk', [grid, grid])).toBe('animation');
    expect(frameKind(source({}), 'base', [grid, grid])).toBe('variant');
  });

  it('allows reviewed metadata to override inference', () => {
    expect(frameKind(source({ fps: 8, frameKinds: { base: 'variant' } }), 'base', [grid, grid])).toBe('variant');
  });

  it('recognizes canonical 47-way tile topology', () => {
    expect(variantTopology(source({}), 'base', Array.from({ length: 47 }, () => grid))).toBe('blob47');
  });
});
