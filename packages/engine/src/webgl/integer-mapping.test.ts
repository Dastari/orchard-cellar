import { describe, expect, it } from 'vitest';
import { mapping } from './integer-mapping.js';

const rect = [10, 20, 32, 16], source = [97, 139, 16, 32], identity = [1, 0, 0, 1, 0, 0];
describe('A-14a integer sampling domain', () => {
  it('retains crop, screen origin and independent source-axis quotients', () => {
    expect(mapping(rect, source, identity, false)).toEqual([97, 139, 16, 32, 10, 20, 1, 2, 2, 1, 1, 2]);
  });
  it('preserves signed source axes through a quarter turn and reflection', () => {
    expect(mapping(rect, source, [0, -1, -1, 0, 200, 300], false))
      .toEqual([97, 139, 16, 32, 180, 290, 1, 2, 2, 1, -2, -1]);
  });
  it('retains texture sampling for smooth, raw-plane and unsupported domains', () => {
    for (const result of [mapping(rect, source, identity, true), mapping(rect, undefined, identity, false),
      mapping(rect, [97.5, 139, 16, 32], identity, false), mapping(rect, [97, 139, 37, 37], identity, false),
      mapping(rect, source, [1, .1, 0, 1, 0, 0], false), mapping(rect, source, [0, 0, 0, 0, 0, 0], false)]) {
      expect(result.slice(10)).toEqual([0, 0]);
    }
  });
});
