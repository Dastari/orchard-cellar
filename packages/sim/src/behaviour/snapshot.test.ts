import { describe, expect, expectTypeOf, it } from 'vitest';
import paritySnapshotsJson from './fixtures/parity-snapshots.json?raw';
import { isLifecycleEventType } from './events.js';
import {
  createReadOnlySnapshot,
  normalizeSnapshotTick,
  type ReadOnlySnapshot,
  type ReadOnlySnapshotInput,
} from './snapshot.js';

function snapshotInput(tick: bigint | number | string = '9007199254740993'): ReadOnlySnapshotInput {
  return {
    tick,
    registry: {
      engineVersion: 1,
      revision: '42',
      contentHash: 'fixture-hash',
      definitions: {
        'object:oil_lamp': {
          id: 'object:oil_lamp',
          kind: 'object',
          tags: ['light'],
          payload: { states: { lit: false } },
        },
      },
    },
    space: { id: 'space:homestead', kind: 'homestead', tags: ['outdoors'] },
    calendar: { minuteOfDay: 720, season: 'spring' },
    actor: {
      entityType: 'player',
      id: 'player:1',
      tags: [],
      tile: { spaceId: 'space:homestead', x: 4, y: 7, tags: ['grass'] },
      bronze: 25n,
      vitals: { hunger: 8_000, vigour: 9_000 },
      inventory: [],
      worldRoles: ['player'],
      homesteadRoles: { 'homestead:1': 'owner' },
      questStates: {},
      statistics: {},
      skillRanks: {},
    },
    target: {
      entityType: 'object',
      id: 'object-instance:1',
      definitionId: 'object:oil_lamp',
      tags: ['light'],
      tile: { spaceId: 'space:homestead', x: 5, y: 7, tags: ['grass'] },
      state: { lit: false },
    },
    nearbyObjects: [],
  };
}

describe('read-only behaviour snapshot contract', () => {
  it('normalises JSON-safe tick strings without losing precision', () => {
    const snapshot = createReadOnlySnapshot(snapshotInput());
    expect(snapshot.tick).toBe(9_007_199_254_740_993n);
    expect(snapshot.registry.revision).toBe(42n);
    expectTypeOf(snapshot).toMatchTypeOf<ReadOnlySnapshot>();
  });

  it('accepts bigint and safe integer tick inputs', () => {
    expect(normalizeSnapshotTick(0n)).toBe(0n);
    expect(normalizeSnapshotTick(42)).toBe(42n);
    expect(normalizeSnapshotTick('0')).toBe(0n);
  });

  it('rejects negative, fractional, lossy, and malformed ticks', () => {
    expect(() => normalizeSnapshotTick(-1n)).toThrow(/non-negative/u);
    expect(() => normalizeSnapshotTick(1.5)).toThrow(/safe integer/u);
    expect(() => normalizeSnapshotTick(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/u);
    expect(() => normalizeSnapshotTick('-1')).toThrow(/unsigned decimal/u);
    expect(() => normalizeSnapshotTick('1.0')).toThrow(/unsigned decimal/u);
    expect(() => normalizeSnapshotTick('000')).toThrow(/unsigned decimal/u);
    expect(() => normalizeSnapshotTick(' 1')).toThrow(/unsigned decimal/u);
  });

  it('keeps one uniquely named fixture snapshot for every section 11 parity row', () => {
    const fixture = JSON.parse(paritySnapshotsJson) as {
      readonly schemaVersion: unknown;
      readonly baseSnapshot: Record<string, unknown>;
      readonly cases: readonly {
        readonly parityRow: unknown;
        readonly id: unknown;
        readonly eventType: unknown;
        readonly snapshot: Record<string, unknown>;
      }[];
    };
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.cases).toHaveLength(30);
    expect(fixture.cases.map(({ parityRow }) => parityRow)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
    expect(new Set(fixture.cases.map(({ id }) => id)).size).toBe(30);
    expect(fixture.cases.every(({ id }) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(fixture.cases.every(({ eventType }) => isLifecycleEventType(eventType))).toBe(true);
    expect(fixture.cases.every(({ snapshot }) => (
      typeof snapshot === 'object' && snapshot !== null && !Array.isArray(snapshot)
    ))).toBe(true);
    expect(fixture.baseSnapshot).toMatchObject({
      tick: '1000',
      registry: { engineVersion: 1, revision: '1' },
    });
  });
});
