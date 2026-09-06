import { describe, expect, it } from 'vitest';

import type { LifecycleEvent } from '../events.js';
import { raiseEvent } from '../raise.js';
import { createReadOnlySnapshot, type ReadOnlySnapshotInput } from '../snapshot.js';
import { createHandlerRegistry } from '../registry.js';
import {
  PLACEABLE_HANDLER_REGISTRATIONS,
  registerPlaceableHandlers,
} from './placeables.js';

const tile = { spaceId: '0', x: 11, y: 10, tags: ['grass'] } as const;

function snapshot(overrides: Partial<ReadOnlySnapshotInput> = {}) {
  return createReadOnlySnapshot({
    tick: 1000n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'b1', definitions: {} },
    space: { id: '0', kind: 'homestead', tags: ['outdoors'] },
    calendar: { minuteOfDay: 720, season: 'spring' },
    actor: {
      entityType: 'player', id: 'player', tags: [], tile,
      bronze: 100n, vitals: { hunger: 5000, vigour: 7500 }, inventory: [],
      worldRoles: ['player'], homesteadRoles: { '0': 'owner' },
      questStates: {}, statistics: {}, skillRanks: {},
    },
    nearbyObjects: [],
    ...overrides,
  });
}

function object(definitionId: string, tags: readonly string[], state = {}) {
  return { entityType: 'object' as const, id: '7', definitionId, tags, tile, state };
}

function effects(event: LifecycleEvent, view: ReturnType<typeof snapshot>) {
  const result = raiseEvent(registerPlaceableHandlers(), event, view);
  if ('blocked' in result) throw new Error(result.blocked);
  return result.effects;
}

describe('compiled placeable behaviour handlers', () => {
  it('registers deterministically and idempotently', () => {
    const once = registerPlaceableHandlers(createHandlerRegistry());
    const twice = registerPlaceableHandlers(once);
    expect(twice.registrations.map(({ id }) => id)).toEqual(
      once.registrations.map(({ id }) => id),
    );
    expect(new Set(twice.registrations.map(({ id }) => id)).size)
      .toBe(PLACEABLE_HANDLER_REGISTRATIONS.length);
  });

  it('matches §11 row 3 carried-object placement and pickup effects', () => {
    expect(effects({
      type: 'place', actor: { entityType: 'player', id: 'player' }, tile,
      subject: { entityType: 'object', id: '7', definitionId: 'object:chest' },
    }, snapshot({ actor: { ...snapshot().actor!, carriedEntityId: '7' } }))).toEqual([
      { placeCarried: { at: { spaceId: '0', x: 11, y: 10 } } },
    ]);
    expect(effects({
      type: 'pickup', actor: { entityType: 'player', id: 'player' }, tile,
      subject: { entityType: 'object', id: '7', definitionId: 'object:chest' },
    }, snapshot({ target: object('object:chest', ['damageable'], { hasContents: true }) }))).toEqual([
      { carry: { objectId: '7' } },
    ]);
    expect(effects({
      type: 'pickup', actor: { entityType: 'player', id: 'player' }, tile,
      subject: { entityType: 'object', id: '7', definitionId: 'object:chest' },
    }, snapshot({ target: object('object:chest', ['damageable'], { hasContents: false }) })))
      .toEqual([{ pickupAsItem: 'chest' }]);
  });

  it('leaves selected inventory placement to exact generated item lifecycles', () => {
    expect(PLACEABLE_HANDLER_REGISTRATIONS.map(({ id }) => id))
      .not.toContain('placeable.place-selected');
  });

  it('matches §11 row 15 light-component state materialisation', () => {
    const target = object('object:standing_torch', ['emits.light'], { lit: true });
    expect(effects({
      type: 'spawn',
      subject: { entityType: 'object', id: '7', definitionId: 'object:standing_torch' },
    }, snapshot({ target }))).toEqual([{ setLight: { enabled: true } }]);
  });

  it('leaves chest open and break capability to authored object/item lifecycles', () => {
    expect(PLACEABLE_HANDLER_REGISTRATIONS.map(({ id }) => id))
      .not.toEqual(expect.arrayContaining(['placeable.chest-open', 'placeable.chest-break']));
  });

});
