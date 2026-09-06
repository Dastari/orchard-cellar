import { describe, expect, it } from 'vitest';
import {
  compareDurableWorldSnapshots,
  DURABLE_WORLD_SNAPSHOT_VERSION,
  parseDurableWorldSnapshot,
  type DurableWorldSnapshot,
} from './world-state-parity.js';

function snapshot(tables: DurableWorldSnapshot['tables'], database = 'orchard-cellar-world'): DurableWorldSnapshot {
  return {
    formatVersion: DURABLE_WORLD_SNAPSHOT_VERSION,
    database,
    capturedAt: '2026-09-03T00:00:00.000Z',
    tables,
  };
}

describe('durable world state parity', () => {
  it('ignores capture metadata and row/key order while preserving exact values', () => {
    const before = snapshot({
      inventory_slot: [{ identity: 'a', slot: 0, item: { kind: 'axe', quantity: 1 } }],
      world_placeable: [{ id: 7, state: { lit: true, fuel: 3 } }],
    });
    const after: DurableWorldSnapshot = {
      ...snapshot({
        world_placeable: [{ state: { fuel: 3, lit: true }, id: 7 }],
        inventory_slot: [{ slot: 0, item: { quantity: 1, kind: 'axe' }, identity: 'a' }],
      }),
      capturedAt: '2026-09-04T00:00:00.000Z',
    };
    expect(compareDurableWorldSnapshots(before, after)).toEqual([]);
  });

  it('reports missing tables, row counts, value changes, and database changes', () => {
    const issues = compareDurableWorldSnapshots(
      snapshot({ inventory_slot: [{ slot: 0 }], player_wallet: [{ balance: 8 }] }),
      snapshot({ inventory_slot: [{ slot: 0 }, { slot: 1 }], player_position: [{ x: 4 }] }, 'replacement'),
    );
    expect(issues.map((issue) => issue.code)).toEqual([
      'database_mismatch',
      'row_count_mismatch',
      'table_missing_before',
      'table_missing_after',
    ]);

    expect(compareDurableWorldSnapshots(
      snapshot({ player_wallet: [{ balance: 8 }] }),
      snapshot({ player_wallet: [{ balance: 9 }] }),
    )).toEqual([expect.objectContaining({ code: 'row_mismatch', table: 'player_wallet' })]);
  });

  it('rejects malformed snapshots instead of accepting partial evidence', () => {
    expect(() => parseDurableWorldSnapshot({
      formatVersion: 1,
      database: 'orchard-cellar-world',
      capturedAt: 'now',
      tables: { inventory_slot: {} },
    })).toThrow('invalid_durable_world_snapshot_table');
  });
});
