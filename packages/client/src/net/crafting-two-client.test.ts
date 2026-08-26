import { describe, expect, it } from 'vitest';
import { craftingStationWithinReach } from '@orchard/sim';
import { placeablePointLight } from '../render/light-sources.js';

interface PlaceableFixture {
  readonly id: bigint;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly spaceId: number;
}

function visible(rows: readonly PlaceableFixture[], spaceId: number, centerChunk: number): readonly PlaceableFixture[] {
  return rows.filter((row) => row.spaceId === spaceId && Math.abs(row.chunkX - centerChunk) <= 1);
}

describe('28§14 deterministic two-client crafting fixture', () => {
  it('lets B craft at A’s workbench, then rejects the same craft after B picks it up', () => {
    let rows: readonly PlaceableFixture[] = [{ id: 1n, kind: 'workbench', tileX: 11, tileY: 10, chunkX: 0, chunkY: 0, spaceId: 0 }];
    const player = { spaceId: 0, tileX: 10, tileY: 10 };
    const canCraft = () => visible(rows, 0, 0).some((row) => row.kind === 'workbench'
      && craftingStationWithinReach(player, row, 2));
    expect(canCraft()).toBe(true);
    rows = rows.filter((row) => row.id !== 1n);
    expect(canCraft()).toBe(false);
  });

  it('delivers one placed torch to both neighborhood clients and derives identical light', () => {
    const torch: PlaceableFixture = { id: 2n, kind: 'standing_torch', tileX: 12, tileY: 10, chunkX: 0, chunkY: 0, spaceId: 0 };
    const alice = visible([torch], 0, 0)[0];
    const bob = visible([torch], 0, 0)[0];
    expect(alice).toEqual(torch);
    expect(bob).toEqual(torch);
    expect(placeablePointLight(alice!, 500n)).toEqual(placeablePointLight(bob!, 500n));
    expect(visible([torch], 65_534, 0)).toEqual([]);
  });
});
