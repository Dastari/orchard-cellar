import { describe, expect, it } from 'vitest';
import {
  createReadOnlySnapshot,
  bootstrapContentRows,
  buildContentRegistry,
  TILE_SIZE_FIXED,
  tileTargetWithinFixedReach,
  registerPlaceableHandlers,
  registerObjectDataGraphs,
  type BehaviourObjectSnapshot,
} from '@orchard/sim';

import type { WorldReducerContext } from '../index.js';
import { applyBehaviourEffects, type BehaviourEffectWriter } from './applier.js';
import {
  interactEntityBehaviour,
  placeableTargetMatchesFacingTile,
  type BehaviourActionAuthority,
} from './interact-entity.js';

const ctx = {} as WorldReducerContext;
const target: BehaviourObjectSnapshot = {
  entityType: 'object',
  id: '7',
  definitionId: 'object:fence_gate',
  tags: ['build.fence'],
  tile: { spaceId: '0', x: 2, y: 3, tags: [] },
  state: { open: false },
};

function snapshot() {
  return createReadOnlySnapshot({
    tick: 5n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'b1', definitions: {} },
    space: { id: '0', kind: 'homestead', tags: [] },
    calendar: { minuteOfDay: 360, season: 'spring' },
    actor: {
      entityType: 'player', id: 'actor', tags: [],
      tile: { spaceId: '0', x: 1, y: 3, tags: [] }, bronze: 0n,
      vitals: { hunger: 1, vigour: 1 }, inventory: [], worldRoles: [],
      homesteadRoles: { '0': 'owner' }, questStates: {}, statistics: {}, skillRanks: {},
    },
    target,
    nearbyObjects: [],
  });
}

function authority(log: string[]): BehaviourActionAuthority {
  const content = buildContentRegistry(bootstrapContentRows()).registry;
  return {
    reject: (message) => { throw new Error(message); },
    authorize: () => { log.push('authorize'); },
    resolveTarget: () => {
      log.push('resolve');
      return {
        kind: 'placeable',
        ref: { entityType: 'object', id: '7', definitionId: 'object:fence_gate' },
        snapshot: target,
      };
    },
    assertTargetReach: () => { log.push('reach'); },
    actorRef: () => ({ entityType: 'player', id: 'actor' }),
    selectedItem: () => null,
    snapshot: () => snapshot(),
    handlers: () => registerObjectDataGraphs(
      registerPlaceableHandlers(),
      [...content.objects.values()],
      1,
    ),
    apply: (_ctx, effects) => {
      applyBehaviourEffects(effects, {
        validate: () => undefined,
        apply: (kind) => { log.push(`write:${kind}`); },
      });
    },
  };
}

describe('placeable authority integration', () => {
  it('accepts an exact diagonal faced-tile station that a one-tile radius rejects', () => {
    const position = {
      x: 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: 20 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      facing: 'downRight' as const,
      spaceId: '0',
    };
    const stationTile = { spaceId: '0', x: 11, y: 21 };

    expect(placeableTargetMatchesFacingTile(position, stationTile)).toBe(true);
    expect(tileTargetWithinFixedReach(
      position.x,
      position.y,
      { tileX: stationTile.x, tileY: stationTile.y },
      TILE_SIZE_FIXED,
    )).toBe(false);
    expect(placeableTargetMatchesFacingTile(position, { ...stationTile, spaceId: '1' })).toBe(false);
  });

  it('authorizes and checks reach before applying the golden gate writes', () => {
    const log: string[] = [];
    interactEntityBehaviour(
      ctx,
      { targetKind: 'placeable', entityId: 7n, verb: 'use' },
      authority(log),
    );
    expect(log).toEqual([
      'authorize', 'resolve', 'reach', 'write:toggleState', 'write:setCollision',
    ]);
  });

  it('performs no resolution or writes after authorization or reach rejection', () => {
    const unauthorizedLog: string[] = [];
    expect(() => interactEntityBehaviour(ctx, {
      targetKind: 'placeable', entityId: 7n, verb: 'use',
    }, {
      ...authority(unauthorizedLog),
      authorize: () => { throw new Error('unauthorized'); },
    })).toThrow('unauthorized');
    expect(unauthorizedLog).toEqual([]);

    const reachLog: string[] = [];
    expect(() => interactEntityBehaviour(ctx, {
      targetKind: 'placeable', entityId: 7n, verb: 'use',
    }, {
      ...authority(reachLog),
      assertTargetReach: () => { throw new Error('out_of_range'); },
    })).toThrow('out_of_range');
    expect(reachLog).toEqual(['authorize', 'resolve']);
  });

  it('constructs pickup but leaves selected-tool chest break to the item callback', () => {
    const log: string[] = [];
    const chestTarget: BehaviourObjectSnapshot = {
      ...target,
      definitionId: 'object:chest',
      tags: ['container', 'damageable'],
      state: { hits: 2, hasContents: true },
    };
    const chestAuthority: BehaviourActionAuthority = {
      ...authority(log),
      resolveTarget: () => ({
        kind: 'chest',
        ref: { entityType: 'object', id: '7', definitionId: 'object:chest' },
        snapshot: chestTarget,
      }),
      selectedItem: () => ({
        ref: { kind: 'axe', containerId: 'hotbar', slot: 0 },
        snapshot: {
          kind: 'axe', tags: ['item.tool'], count: 1, durability: 10,
          containerId: 'hotbar', slot: 0,
        },
      }),
      snapshot: (_ctx, resolved, selected) => createReadOnlySnapshot({
        ...snapshot(),
        ...(resolved === undefined ? {} : { target: resolved }),
        ...(selected === undefined ? {} : { selectedItem: selected }),
      }),
    };
    interactEntityBehaviour(
      ctx,
      { targetKind: 'chest', entityId: 7n, verb: 'pickup' },
      chestAuthority,
    );
    interactEntityBehaviour(
      ctx,
      { targetKind: 'chest', entityId: 7n, verb: 'break' },
      chestAuthority,
    );
    expect(log.filter((entry) => entry.startsWith('write:'))).toEqual(['write:carry']);
  });

  it('preflights a placeable spawn batch before its first row write', () => {
    const writes: string[] = [];
    const writer: BehaviourEffectWriter = {
      validate: (kind) => {
        if (kind === 'consumeSelected') throw new Error('selected_item_changed');
      },
      apply: (kind) => { writes.push(kind); },
    };
    expect(() => applyBehaviourEffects([
      { spawnObject: { definitionId: 'object:workbench', at: { spaceId: '0', x: 2, y: 3 } } },
      { consumeSelected: 1 },
    ], writer)).toThrow('selected_item_changed');
    expect(writes).toEqual([]);
  });
});
