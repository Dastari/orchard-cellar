import { describe, expect, it } from 'vitest';
import {
  createReadOnlySnapshot,
  createHandlerRegistry,
  registerPlaceableHandlers,
  type BehaviourItemSnapshot,
  type BehaviourObjectSnapshot,
} from '@orchard/sim';
import { AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS } from '@orchard/lifecycle-authoring/generated';

import type { WorldReducerContext } from '../index.js';
import { applyBehaviourEffects, type BehaviourEffectWriter } from './applier.js';
import type { ResolvedBehaviourTarget } from './interact-entity.js';
import { useSelectedBehaviour, type UseSelectedAuthority } from './use-selected.js';

const ctx = {} as WorldReducerContext;
const tile = { spaceId: '0', x: 2, y: 3, tags: [] } as const;

function item(kind: string, tags: readonly string[], overrides = {}): BehaviourItemSnapshot {
  return {
    kind, definitionId: `item:${kind}`, tags, count: 1,
    containerId: 'hotbar', slot: 0, ...overrides,
  };
}

function snapshot(selectedItem: BehaviourItemSnapshot, overrides = {}) {
  return createReadOnlySnapshot({
    tick: 5n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'b2', definitions: {} },
    space: { id: '0', kind: 'overworld', tags: [] },
    calendar: { minuteOfDay: 360, season: 'spring' },
    actor: {
      entityType: 'player', id: 'actor', tags: [], tile, bronze: 100n,
      vitals: { hunger: 5000, vigour: 5000 }, inventory: [], worldRoles: [],
      homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
    },
    selectedItem,
    nearbyObjects: [],
    ...overrides,
  });
}

function authority(
  log: string[],
  selectedItem: BehaviourItemSnapshot,
  target?: ResolvedBehaviourTarget,
): UseSelectedAuthority {
  return {
    reject: (message) => { throw new Error(message); },
    authorize: () => { log.push('authorize'); },
    resolveTarget: () => target ?? null,
    assertTargetReach: () => { log.push('target-reach'); },
    actorRef: () => ({ entityType: 'player', id: 'actor' }),
    selectedItem: () => ({
      ref: { kind: selectedItem.kind, containerId: 'hotbar', slot: 0 },
      snapshot: selectedItem,
    }),
    equipmentItem: () => null,
    snapshot: (_ctx, resolved) => snapshot(selectedItem, {
      ...(resolved === undefined ? {} : { target: resolved }),
    }),
    handlers: () => registerPlaceableHandlers(
      createHandlerRegistry(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS),
    ),
    apply: (_ctx, effects) => applyBehaviourEffects(effects, {
      validate: (kind) => { log.push(`validate:${kind}`); },
      apply: (kind) => { log.push(`write:${kind}`); },
    }),
    tileTarget: () => ({ ref: tile, snapshot: tile }),
    assertTileReach: () => { log.push('tile-reach'); },
    carriedObject: () => null,
  };
}

describe('item authority integration', () => {
  it('authorizes and checks tile reach before founding or consuming a deed', () => {
    const log: string[] = [];
    const deed = item('homestead_deed', ['item.document', 'item.homestead_deed']);
    useSelectedBehaviour(ctx, {
      verb: 'place', targetKind: '', entityId: 0n, tileX: 2, tileY: 3,
    }, authority(log, deed));
    expect(log).toEqual([
      'authorize', 'tile-reach',
      'validate:foundHomestead', 'validate:consumeSelected',
      'write:foundHomestead', 'write:consumeSelected',
    ]);
  });

  it('does not resolve or write after authorization or reach rejection', () => {
    const deed = item('homestead_deed', ['item.document', 'item.homestead_deed']);
    const unauthorized: string[] = [];
    expect(() => useSelectedBehaviour(ctx, {
      verb: 'place', targetKind: '', entityId: 0n, tileX: 2, tileY: 3,
    }, {
      ...authority(unauthorized, deed),
      authorize: () => { throw new Error('unauthorized'); },
    })).toThrow('unauthorized');
    expect(unauthorized).toEqual([]);

    const unreachable: string[] = [];
    expect(() => useSelectedBehaviour(ctx, {
      verb: 'place', targetKind: '', entityId: 0n, tileX: 2, tileY: 3,
    }, {
      ...authority(unreachable, deed),
      assertTileReach: () => { throw new Error('out_of_range'); },
    })).toThrow('out_of_range');
    expect(unreachable).toEqual(['authorize']);
  });

  it('uses the explicit placeable namespace for anvil repair', () => {
    const log: string[] = [];
    const axe = item('axe', ['item.tool'], { durability: 100, state: {
      repairMaximum: 200, repairMaterial: 'wood', repairCostBronze: 5,
    } });
    const anvil: BehaviourObjectSnapshot = {
      entityType: 'object', id: '9', definitionId: 'object:anvil', tags: ['station.anvil'],
      tile, state: {},
    };
    useSelectedBehaviour(ctx, {
      verb: 'use_with', targetKind: 'placeable', entityId: 9n, tileX: 0, tileY: 0,
    }, authority(log, axe, {
      kind: 'placeable',
      ref: { entityType: 'object', id: '9', definitionId: 'object:anvil' },
      snapshot: anvil,
    }));
    expect(log).toEqual([
      'authorize', 'target-reach',
      'validate:consumeItem', 'validate:chargeBronze', 'validate:applyEffect',
      'write:consumeItem', 'write:chargeBronze', 'write:applyEffect',
    ]);
  });

  it('uses the explicit combat namespace for authored sword swings and targets', () => {
    const sword = item('sword', ['item.weapon', 'item.melee_weapon'], {
      durability: 250,
      state: { repairMaximum: 250, repairMaterial: 'stone', repairCostBronze: 5 },
    });
    const whiffLog: string[] = [];
    useSelectedBehaviour(ctx, {
      verb: 'secondary', targetKind: '', entityId: 0n, tileX: 0, tileY: 0,
    }, authority(whiffLog, sword));
    expect(whiffLog).toEqual(['authorize', 'validate:meleeAttack', 'write:meleeAttack']);

    const target: BehaviourObjectSnapshot = {
      entityType: 'object', id: '9', definitionId: 'object:archery_target',
      tags: ['damageable'], tile, state: { health: 10_000 },
    };
    const targetLog: string[] = [];
    useSelectedBehaviour(ctx, {
      verb: 'secondary', targetKind: 'combat_target', entityId: 9n, tileX: 0, tileY: 0,
    }, authority(targetLog, sword, {
      kind: 'combat_target',
      ref: { entityType: 'object', id: '9', definitionId: 'object:archery_target' },
      snapshot: target,
    }));
    expect(targetLog).toEqual([
      'authorize', 'target-reach', 'validate:meleeAttack', 'write:meleeAttack',
    ]);
  });

  it('keeps carried-object placement ahead of selected deed consumption', () => {
    const log: string[] = [];
    const deed = item('homestead_deed', ['item.document', 'item.homestead_deed']);
    useSelectedBehaviour(ctx, {
      verb: 'place', targetKind: '', entityId: 0n, tileX: 2, tileY: 3,
    }, {
      ...authority(log, deed),
      carriedObject: () => ({ entityType: 'object', id: '7', definitionId: 'object:chest' }),
      snapshot: () => snapshot(deed, {
        actor: { ...snapshot(deed).actor!, carriedEntityId: '7' },
      }),
    });
    expect(log.filter((entry) => entry.startsWith('write:'))).toEqual(['write:placeCarried']);
  });

  it('preflights the whole repair batch before consuming material', () => {
    const writes: string[] = [];
    const writer: BehaviourEffectWriter = {
      validate: (kind) => {
        if (kind === 'chargeBronze') throw new Error('anvil_copper_missing');
      },
      apply: (kind) => { writes.push(kind); },
    };
    expect(() => applyBehaviourEffects([
      { consumeItem: { kind: 'wood', count: 1 } },
      { chargeBronze: 5 },
      { applyEffect: { effectId: 'repair_selected' } },
    ], writer)).toThrow('anvil_copper_missing');
    expect(writes).toEqual([]);
  });
});
