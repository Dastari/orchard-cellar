import { describe, expect, it } from 'vitest';
import { WORLD_CHUNK_MEDIA } from '@orchard/sim/world-chunk';
import { worldChunkCellMedium } from './world-chunk-medium.js';

describe('offline cell medium classification', () => {
  it('distinguishes ocean, inland water, falls, lava and dry terrain', () => {
    expect(worldChunkCellMedium({ biome: 'water' })).toBe('deep_water');
    for (const biome of ['freshwater', 'oasis_water', 'waterfall'] as const) expect(worldChunkCellMedium({ biome })).toBe('shallow_water');
    expect(worldChunkCellMedium({ biome: 'lava' })).toBe('lava');
    for (const biome of ['beach', 'forest', 'ridge', 'coastal_cliff'] as const) expect(worldChunkCellMedium({ biome })).toBe('land');
    expect(worldChunkCellMedium({ biome: 'plains', surface: 'water' })).toBe('shallow_water');
    expect(worldChunkCellMedium({ biome: 'plains', feature: 'river' })).toBe('shallow_water');
  });
  it.each(WORLD_CHUNK_MEDIA)('prefers explicit role %s to biome/surface classification', ruleMedium => {
    expect(worldChunkCellMedium({ biome: 'water', surface: 'water', ruleMedium })).toBe(ruleMedium);
  });
});
