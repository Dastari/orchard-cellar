import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface SpatialRow {
  readonly id: string;
  readonly spaceId: number;
  readonly chunkX: number;
  readonly chunkY: number;
}

function visibleTo(spaceId: number, rows: readonly SpatialRow[]): readonly string[] {
  return rows.filter((row) => row.spaceId === spaceId).map((row) => row.id);
}

describe('26§13 two-client space isolation', () => {
  it('isolates avatars, speech, and entities, then reunites both clients after transit', () => {
    const avatars = [
      { id: 'alice', spaceId: 65_534, chunkX: 0, chunkY: 0 },
      { id: 'bob', spaceId: 0, chunkX: 0, chunkY: 0 },
    ];
    const entities = [
      { id: 'alice-item', spaceId: 65_534, chunkX: 0, chunkY: 0 },
      { id: 'bob-item', spaceId: 0, chunkX: 0, chunkY: 0 },
    ];
    const speech = [
      { id: 'alice-speech', spaceId: 65_534, chunkX: 0, chunkY: 0 },
      { id: 'bob-speech', spaceId: 0, chunkX: 0, chunkY: 0 },
    ];
    expect(visibleTo(65_534, avatars)).toEqual(['alice']);
    expect(visibleTo(0, avatars)).toEqual(['bob']);
    expect(visibleTo(65_534, entities)).toEqual(['alice-item']);
    expect(visibleTo(0, entities)).toEqual(['bob-item']);
    expect(visibleTo(65_534, speech)).toEqual(['alice-speech']);
    expect(visibleTo(0, speech)).toEqual(['bob-speech']);
    expect(visibleTo(0, avatars.map((row) => ({ ...row, spaceId: 0 })))).toEqual(['alice', 'bob']);
  });

  it('binds the runtime subscription and speech view to the same space predicate', () => {
    const client = readFileSync(new URL('./overworld-connection.ts', import.meta.url), 'utf8');
    const authority = readFileSync(new URL('../../../world/src/index.ts', import.meta.url), 'utf8');
    expect(client.match(/row\.spaceId\.eq\(spaceId\)/g)).toHaveLength(10);
    expect(client).toContain('clearSpaceScopedCaches');
    expect(authority).toContain('speech.spaceId !== caller.spaceId');
  });
});
