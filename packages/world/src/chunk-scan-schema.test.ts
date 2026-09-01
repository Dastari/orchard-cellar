import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyTickUpdateCounters, recordTickRowTouch } from './scalability.js';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('docs/53 T5 chunk-bounded action scans', () => {
  it('uses exact world-item chunk keys for merge and multi-pickup candidates', () => {
    const helper = sourceBetween(
      'function worldItemsInChunkNeighborhood(',
      'function dropWorldItemStack(',
    );
    expect(helper).toContain('world_item.by_chunk.filter([spaceId, chunkX, chunkY])');

    const drop = sourceBetween('function dropWorldItemStack(', 'function isEffectKind(');
    expect(drop).toContain('worldItemsInChunkNeighborhood(ctx, drop.spaceId, drop.x, drop.y)');
    expect(drop).not.toContain('world_item.iter()');

    const pickup = sourceBetween('export const pickupWorldItem =', 'export const beginBowCharge =');
    expect(pickup).toContain(
      'worldItemsInChunkNeighborhood(ctx, position.spaceId, position.x, position.y)',
    );
    expect(pickup).not.toContain('world_item.iter()');
  });

  it('uses exact player-position chunk keys and native identity equality for overlaps', () => {
    const overlaps = sourceBetween('function tileOverlapsAnyPlayer(', 'function requireChestPlacementTile(');
    expect(overlaps.match(/player_position\.by_chunk\.filter\(\[spaceId, chunkX, chunkY\]\)/g))
      .toHaveLength(2);
    expect(overlaps).toContain('!player.identity.isEqual(identity)');
    expect(overlaps).not.toContain('player_position.iter()');
    expect(overlaps).not.toContain('toHexString()');

    const gate = sourceBetween('export const toggleHomesteadGate =', 'export const setHomesteadMemberRole =');
    expect(gate).toContain('home.owner.isEqual(ctx.sender)');
    expect(gate).not.toContain('toHexString()');
  });

  it('reduces representative action candidates from 120,000 row touches to 432', () => {
    const before = emptyTickUpdateCounters();
    recordTickRowTouch(before, undefined, 2 * 50_000 + 2 * 10_000);
    const after = emptyTickUpdateCounters();
    // 2,500 populated chunks: 20 items and 4 players per chunk, nine exact keys per action.
    recordTickRowTouch(after, undefined, 2 * 9 * 20 + 2 * 9 * 4);
    expect(before.rowsTouched).toBe(120_000);
    expect(after.rowsTouched).toBe(432);
  });
});
