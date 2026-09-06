import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Handler, ReadOnlySnapshot } from '@orchard/sim';
import {
  AUTHORED_ITEM_LIFECYCLE_METADATA,
  AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS,
} from '../generated/item-lifecycles.js';
import { parseLifecycleSourceBundle } from './contract.js';

const source = parseLifecycleSourceBundle(JSON.parse(readFileSync(
  new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as unknown);

function snapshot(kind: 'lantern' | 'torch', lit: boolean): ReadOnlySnapshot {
  return {
    tick: 1n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'test', definitions: {} },
    space: { id: '0', kind: 'overworld', tags: [] },
    calendar: { minuteOfDay: 0, season: 'spring' },
    actor: {
      entityType: 'player', id: 'player', tags: [],
      tile: { spaceId: '0', x: 0, y: 0, tags: [] }, bronze: 0n,
      vitals: { hunger: 5_000, vigour: 10_000 }, inventory: [], worldRoles: [],
      homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
    },
    selectedItem: {
      kind, definitionId: `item:${kind}`, tags: ['item.equipment', 'emits.light'], count: 1,
      containerId: 'equipment', slot: 35, state: { lit },
    },
    nearbyObjects: [],
  };
}

describe('authored portable-light lifecycle migration', () => {
  it.each([
    ['lantern', 'LANTERN'],
    ['torch', 'TORCH'],
  ] as const)('owns %s equipped and ground use in one database-free item callback', (kind, label) => {
    const itemId = `item:${kind}`;
    const handlerId = `${itemId}.equipment_use`;
    const handlers = source.handlers.filter((handler) => handler.itemId === itemId);
    expect(handlers).toEqual([expect.objectContaining({
      id: handlerId,
      prompt: `TOGGLE ${label}`,
      triggers: ['equipmentUse', 'worldItemUse'],
    })]);
    expect(handlers[0]?.source).not.toMatch(/ctx\.|\.db\./u);
    expect(AUTHORED_ITEM_LIFECYCLE_METADATA.filter((handler) => handler.itemId === itemId))
      .toEqual([expect.objectContaining({
        id: handlerId, triggers: ['equipmentUse', 'worldItemUse'],
      })]);
  });

  it.each(['lantern', 'torch'] as const)(
    'emits the same exact state/light pair for a ground %s invocation',
    (kind) => {
    const registration = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find(
      ({ id }) => id === `item:${kind}.equipment_use.worldItemUse`,
    );
    expect(registration).toBeDefined();
    const event = {
      type: 'worldItemUse', actor: { entityType: 'player', id: 'player' },
      worldItem: { kind, containerId: 'world', instanceId: '17' },
      target: { entityType: 'object', id: '17', definitionId: `item:${kind}` },
    } as const;
    expect((registration!.handler as Handler)(event, snapshot(kind, true))).toEqual({ effects: [
      { toggleState: 'lit' }, { setLight: { enabled: false } },
    ] });
  });

  it.each(['lantern', 'torch'] as const)(
    'emits the exact atomic state and light pair for both equipped %s states',
    (kind) => {
    const registration = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find(
      ({ id }) => id === `item:${kind}.equipment_use.equipmentUse`,
    );
    expect(registration).toBeDefined();
    const event = {
      type: 'equipmentUse', actor: { entityType: 'player', id: 'player' },
      equipmentItem: { kind, containerId: 'equipment', slot: 35 },
      equipmentSlot: 35,
    } as const;
    expect((registration!.handler as Handler)(event, snapshot(kind, true))).toEqual({ effects: [
      { toggleState: 'lit' }, { setLight: { enabled: false } },
    ] });
    expect((registration!.handler as Handler)(event, snapshot(kind, false))).toEqual({ effects: [
      { toggleState: 'lit' }, { setLight: { enabled: true } },
    ] });
  });
});
