import { describe, expect, it } from 'vitest';
import {
  blockedResult,
  createHandlerRegistry,
  effectsResult,
  registerHandler,
  type BehaviourObjectSnapshot,
  type ReadOnlySnapshotInput,
} from '@orchard/sim';

import type { WorldReducerContext } from '../index.js';
import {
  createAuthorityBehaviourSnapshot,
  interactEntityBehaviour,
  type BehaviourActionAuthority,
} from './interact-entity.js';
import { useSelectedBehaviour, type UseSelectedAuthority } from './use-selected.js';
import { entityTimerFireBehaviour, type EntityTimerAuthority } from './entity-timer.js';

const ctx = {} as WorldReducerContext;
const objectSnapshot: BehaviourObjectSnapshot = {
  entityType: 'object',
  id: '7',
  definitionId: 'object:gate',
  tags: ['gate'],
  tile: { spaceId: '0', x: 2, y: 3, tags: [] },
  state: { open: false },
};

function snapshotInput(): ReadOnlySnapshotInput {
  return {
    tick: 5n,
    registry: {
      engineVersion: 1,
      revision: 2n,
      contentHash: 'hash',
      definitions: {
        'object:z': { id: 'object:z', kind: 'object', tags: ['z', 'a'] },
        'object:a': { id: 'object:a', kind: 'object', tags: [] },
      },
    },
    space: { id: '0', kind: 'island', tags: ['world', 'island'] },
    calendar: { minuteOfDay: 360, season: 'spring' },
    actor: {
      entityType: 'player',
      id: 'actor',
      tags: [],
      tile: { spaceId: '0', x: 1, y: 3, tags: ['z', 'a'] },
      bronze: 5n,
      vitals: { hunger: 10, vigour: 10 },
      inventory: [
        { kind: 'z', tags: [], count: 1, containerId: 'hotbar', slot: 2 },
        { kind: 'a', tags: [], count: 1, containerId: 'hotbar', slot: 0 },
      ],
      worldRoles: ['visitor', 'admin'],
      homesteadRoles: { z: 'visitor', a: 'owner' },
      questStates: { z: 'active', a: 'complete' },
      statistics: { z: 1n, a: 2n },
      skillRanks: { z: 1, a: 2 },
    },
    nearbyObjects: [
      { ...objectSnapshot, id: '9' },
      { ...objectSnapshot, id: '1' },
    ],
  };
}

function baseAuthority(log: string[]): BehaviourActionAuthority
  & Pick<UseSelectedAuthority, 'equipmentItem'> {
  return {
    reject: (message) => { throw new Error(message); },
    authorize: () => { log.push('authorize'); },
    resolveTarget: () => {
      log.push('resolve');
      return {
        kind: 'placeable',
        ref: { entityType: 'object', id: '7', definitionId: 'object:gate' },
        snapshot: objectSnapshot,
      };
    },
    assertTargetReach: () => { log.push('reach'); },
    actorRef: () => ({ entityType: 'player', id: 'actor' }),
    selectedItem: () => ({
      ref: { kind: 'axe', containerId: 'hotbar', slot: 0 },
      snapshot: { kind: 'axe', tags: ['item.tool'], count: 1, containerId: 'hotbar', slot: 0 },
    }),
    equipmentItem: () => null,
    snapshot: (_ctx, target, selectedItem) => createAuthorityBehaviourSnapshot({
      ...snapshotInput(),
      ...(target === undefined ? {} : { target }),
      ...(selectedItem === undefined ? {} : { selectedItem }),
    }),
    handlers: () => registerHandler(createHandlerRegistry(), {
      id: 'gate.use',
      eventType: 'use',
      source: 'target',
      match: { kind: 'definition', definitionId: 'object:gate' },
      handler: () => effectsResult([{ toggleState: 'open' }]),
    }),
    apply: (_ctx, effects) => { log.push(`apply:${effects.length}`); },
  };
}

describe('generic behaviour authority', () => {
  it('canonicalizes row-derived collection order', () => {
    const snapshot = createAuthorityBehaviourSnapshot(snapshotInput());
    expect(Object.keys(snapshot.registry.definitions)).toEqual(['object:a', 'object:z']);
    expect(snapshot.registry.definitions['object:z']?.tags).toEqual(['a', 'z']);
    expect(snapshot.actor?.inventory.map(({ kind }) => kind)).toEqual(['a', 'z']);
    expect(snapshot.actor?.tile.tags).toEqual(['a', 'z']);
    expect(snapshot.actor?.worldRoles).toEqual(['admin', 'visitor']);
    expect(Object.keys(snapshot.actor?.homesteadRoles ?? {})).toEqual(['a', 'z']);
    expect(Object.keys(snapshot.actor?.questStates ?? {})).toEqual(['a', 'z']);
    expect(Object.keys(snapshot.actor?.statistics ?? {})).toEqual(['a', 'z']);
    expect(Object.keys(snapshot.actor?.skillRanks ?? {})).toEqual(['a', 'z']);
    expect(snapshot.nearbyObjects.map(({ id }) => id)).toEqual(['1', '9']);
  });

  it('authenticates and checks reach before resolving or applying entity effects', () => {
    const log: string[] = [];
    interactEntityBehaviour(
      ctx,
      { targetKind: 'placeable', entityId: 7n, verb: 'use' },
      baseAuthority(log),
    );
    expect(log).toEqual(['authorize', 'resolve', 'reach', 'apply:1']);
  });

  it('dispatches ground world-item use through the item-owned callback, not the selected slot', () => {
    const log: string[] = [];
    let observedItem: string | undefined;
    let observedTarget: string | undefined;
    const groundItem = {
      kind: 'lantern', definitionId: 'item:lantern', instanceId: '17', containerId: 'world',
      tags: ['emits.light'], count: 1, state: { lit: true },
    } as const;
    const authority: BehaviourActionAuthority = {
      ...baseAuthority(log),
      resolveTarget: () => ({
        kind: 'world_item',
        ref: { entityType: 'object', id: '17', definitionId: 'object:lantern' },
        snapshot: { ...objectSnapshot, id: '17', definitionId: 'object:lantern', state: { lit: true } },
        item: {
          ref: { kind: 'lantern', instanceId: '17', containerId: 'world' },
          snapshot: groundItem,
        },
      }),
      selectedItem: () => ({
        ref: { kind: 'axe', containerId: 'hotbar', slot: 0 },
        snapshot: { kind: 'axe', tags: [], count: 1, containerId: 'hotbar', slot: 0 },
      }),
      handlers: () => registerHandler(createHandlerRegistry(), {
        id: 'lantern.world-use', eventType: 'worldItemUse', source: 'selectedItem',
        match: { kind: 'definition', definitionId: 'item:lantern' },
        handler: (event, view) => {
          observedItem = view.selectedItem?.definitionId;
          observedTarget = event.type === 'worldItemUse' ? event.target.id : undefined;
          return effectsResult([{ toggleState: 'lit' }, { setLight: { enabled: false } }]);
        },
      }),
    };
    interactEntityBehaviour(ctx, { targetKind: 'world_item', entityId: 17n, verb: 'use' }, authority);
    expect({ observedItem, observedTarget }).toEqual({
      observedItem: 'item:lantern', observedTarget: '17',
    });
    expect(log).toEqual(['authorize', 'reach', 'apply:2']);
  });

  it('converts blocked handlers and invalid verbs to sender errors without writes', () => {
    const log: string[] = [];
    const authority: BehaviourActionAuthority = {
      ...baseAuthority(log),
      handlers: () => registerHandler(createHandlerRegistry(), {
        id: 'blocked', eventType: 'use', source: 'target',
        match: { kind: 'any' }, handler: () => blockedResult('gate_locked'),
      }),
    };
    expect(() => interactEntityBehaviour(
      ctx,
      { targetKind: 'placeable', entityId: 7n, verb: 'use' },
      authority,
    )).toThrow('gate_locked');
    expect(log).not.toContain('apply:1');
    expect(() => interactEntityBehaviour(
      ctx,
      { targetKind: 'placeable', entityId: 7n, verb: 'invalid' },
      baseAuthority([]),
    )).toThrow('behaviour_verb_invalid');
  });

  it('passes colliding ids through an explicit validated target namespace', () => {
    const kinds: string[] = [];
    const authority: BehaviourActionAuthority = {
      ...baseAuthority([]),
      resolveTarget: (_ctx, targetKind) => {
        kinds.push(targetKind);
        return {
          kind: targetKind,
          ref: { entityType: 'object', id: '7', definitionId: `object:${targetKind}` },
          snapshot: { ...objectSnapshot, definitionId: `object:${targetKind}` },
        };
      },
      handlers: () => createHandlerRegistry(),
    };
    interactEntityBehaviour(
      ctx,
      { targetKind: 'chest', entityId: 7n, verb: 'use' },
      authority,
    );
    interactEntityBehaviour(
      ctx,
      { targetKind: 'placeable', entityId: 7n, verb: 'use' },
      authority,
    );
    expect(kinds).toEqual(['chest', 'placeable']);
    expect(() => interactEntityBehaviour(
      ctx,
      { targetKind: 'guessed', entityId: 7n, verb: 'use' },
      authority,
    )).toThrow('behaviour_target_kind_invalid');
    expect(kinds).toEqual(['chest', 'placeable']);
  });

  it('requires target/tile reach and permits global secondary handlers without a selected item', () => {
    const log: string[] = [];
    const authority: UseSelectedAuthority = {
      ...baseAuthority(log),
      tileTarget: (_ctx, x, y) => ({
        ref: { spaceId: '0', x, y },
        snapshot: { spaceId: '0', x, y, tags: [] },
      }),
      assertTileReach: () => { log.push('tile-reach'); },
      carriedObject: () => null,
    };
    useSelectedBehaviour(ctx, {
      verb: 'secondary', targetKind: 'placeable', entityId: 7n, tileX: 0, tileY: 0,
    }, authority);
    expect(log.slice(0, 3)).toEqual(['authorize', 'resolve', 'reach']);
    expect(() => useSelectedBehaviour(ctx, {
      verb: 'use_with', targetKind: '', entityId: 0n, tileX: 0, tileY: 0,
    }, authority)).toThrow('behaviour_target_required');
    useSelectedBehaviour(ctx, {
      verb: 'secondary', targetKind: '', entityId: 0n, tileX: 0, tileY: 0,
    }, { ...authority, selectedItem: () => null });
    expect(log[log.length - 1]).toBe('apply:0');
  });

  it('allows place for a carried object without inventing a selected inventory item', () => {
    const log: string[] = [];
    const authority: UseSelectedAuthority = {
      ...baseAuthority(log),
      selectedItem: () => null,
      carriedObject: () => ({ entityType: 'object', id: '7', definitionId: 'object:chest' }),
      tileTarget: (_ctx, x, y) => ({
        ref: { spaceId: '0', x, y },
        snapshot: { spaceId: '0', x, y, tags: [] },
      }),
      assertTileReach: () => { log.push('tile-reach'); },
      handlers: () => registerHandler(createHandlerRegistry(), {
        id: 'carried-place', eventType: 'place', source: 'global',
        match: { kind: 'any' }, handler: () => effectsResult([{ placeCarried: {} }]),
      }),
    };
    useSelectedBehaviour(ctx, {
      verb: 'place', targetKind: '', entityId: 0n, tileX: 2, tileY: 3,
    }, authority);
    expect(log).toEqual(['authorize', 'tile-reach', 'apply:1']);
  });

  it('forwards a non-empty selected action id into authored place handlers', () => {
    let observedAction: string | undefined;
    const authority: UseSelectedAuthority = {
      ...baseAuthority([]),
      selectedItem: () => ({
        ref: { kind: 'hoe', containerId: 'hotbar', slot: 0 },
        snapshot: { kind: 'hoe', tags: ['item.tool'], count: 1, containerId: 'hotbar', slot: 0 },
      }),
      carriedObject: () => null,
      tileTarget: (_ctx, x, y) => ({
        ref: { spaceId: '0', x, y },
        snapshot: { spaceId: '0', x, y, tags: [] },
      }),
      assertTileReach: () => undefined,
      handlers: () => registerHandler(createHandlerRegistry(), {
        id: 'farm-tool', eventType: 'place', source: 'selectedItem',
        match: { kind: 'definition', definitionId: 'hoe' }, handler: (event) => {
          observedAction = event.type === 'place' ? event.actionId : undefined;
          return effectsResult([]);
        },
      }),
    };
    useSelectedBehaviour(ctx, {
      verb: 'place', targetKind: '', entityId: 0n, tileX: 2, tileY: 3,
      actionId: 'restore',
    }, authority);
    expect(observedAction).toBe('restore');
  });

  it('preserves the zero pool id and action when dispatching authored useAt fishing', () => {
    let observedAction: string | undefined;
    let observedTargetId: string | undefined;
    let reachAction: string | undefined;
    const authority: UseSelectedAuthority = {
      ...baseAuthority([]),
      selectedItem: () => ({
        ref: { kind: 'fishing_rod', containerId: 'hotbar', slot: 0 },
        snapshot: {
          kind: 'fishing_rod', tags: ['item.tool'], count: 1, containerId: 'hotbar', slot: 0,
        },
      }),
      carriedObject: () => null,
      tileTarget: (_ctx, x, y) => ({
        ref: { spaceId: '0', x, y },
        snapshot: { spaceId: '0', x, y, tags: [] },
      }),
      assertTileReach: (_ctx, _tile, _item, actionId) => { reachAction = actionId; },
      handlers: () => registerHandler(createHandlerRegistry(), {
        id: 'fishing', eventType: 'useAt', source: 'selectedItem',
        match: { kind: 'definition', definitionId: 'fishing_rod' }, handler: (event) => {
          if (event.type === 'useAt') {
            observedAction = event.actionId;
            observedTargetId = event.targetId;
          }
          return effectsResult([]);
        },
      }),
    };
    useSelectedBehaviour(ctx, {
      verb: 'use_at', targetKind: '', entityId: 0n, tileX: 2, tileY: 3,
      actionId: 'cast',
    }, authority);
    expect({ observedAction, observedTargetId, reachAction }).toEqual({
      observedAction: 'cast', observedTargetId: '0', reachAction: 'cast',
    });
  });

  it.each([
    ['lantern', 1],
    ['torch', 8],
  ] as const)('dispatches %s equipmentUse from the concrete equipment row, including stacks', (kind, count) => {
    let observedKind: string | undefined;
    let observedSlot: number | undefined;
    let appliedSubject: unknown;
    const light = {
      kind, definitionId: `item:${kind}`, tags: ['item.equipment', 'emits.light'], count,
      containerId: 'equipment', slot: 35, state: { lit: true },
    } as const;
    const authority: UseSelectedAuthority = {
      ...baseAuthority([]),
      equipmentItem: (_ctx, slot) => slot === 35 ? {
        ref: { kind, instanceId: `actor:${slot}`, containerId: 'equipment', slot }, snapshot: light,
      } : null,
      carriedObject: () => null,
      tileTarget: (_ctx, x, y) => ({
        ref: { spaceId: '0', x, y }, snapshot: { spaceId: '0', x, y, tags: [] },
      }),
      assertTileReach: () => undefined,
      handlers: () => registerHandler(createHandlerRegistry(), {
        id: kind, eventType: 'equipmentUse', source: 'selectedItem',
        match: { kind: 'definition', definitionId: `item:${kind}` }, handler: (event, view) => {
          observedKind = view.selectedItem?.kind;
          observedSlot = event.type === 'equipmentUse' ? event.equipmentSlot : undefined;
          return effectsResult([{ toggleState: 'lit' }, { setLight: { enabled: false } }]);
        },
      }),
      apply: (_ctx, _effects, _target, subjectItem) => { appliedSubject = subjectItem; },
    };
    useSelectedBehaviour(ctx, {
      verb: 'equipment_use', targetKind: '', entityId: 0n, tileX: 0, tileY: 0,
      equipmentSlot: 35,
    }, authority);
    expect({ observedKind, observedSlot, appliedSubject }).toEqual({
      observedKind: kind,
      observedSlot: 35,
      appliedSubject: { kind, instanceId: 'actor:35', containerId: 'equipment', slot: 35 },
    });
  });

  it('fires due timers after arbitrary downtime and bounds invalid messages', () => {
    const writes: string[] = [];
    const reschedules: string[] = [];
    const snapshot = createAuthorityBehaviourSnapshot(snapshotInput());
    const handlers = registerHandler(createHandlerRegistry(), {
      id: 'timer', eventType: 'timer', source: 'target',
      match: { kind: 'any' }, handler: () => effectsResult([{ sfx: 'done' }]),
    });
    const authority: EntityTimerAuthority = {
      reject: (message) => { throw new Error(message); },
      currentTick: () => 10_000n,
      reschedule: (_ctx, message, currentTick) => {
        reschedules.push(`${message.timerId}:${message.expectedTick - currentTick}`);
      },
      resolveObject: () => ({
        ref: { entityType: 'object', id: '7', definitionId: 'object:gate' },
        snapshot: objectSnapshot,
      }),
      snapshot: (_ctx, target) => ({ ...snapshot, target }),
      handlers: () => handlers,
      apply: (_ctx, effects) => { writes.push(`apply:${effects.length}`); },
    };
    entityTimerFireBehaviour(ctx, {
      entityId: 7n, timerId: 'complete', expectedTick: 1n,
    }, authority);
    expect(writes).toEqual(['apply:1']);
    expect(() => entityTimerFireBehaviour(ctx, {
      entityId: 7n, timerId: '', expectedTick: 1n,
    }, authority)).toThrow('behaviour_timer_id_invalid');
    entityTimerFireBehaviour(ctx, {
      entityId: 7n, timerId: 'future', expectedTick: 10_001n,
    }, authority);
    expect(reschedules).toEqual(['future:1']);
    expect(writes).toEqual(['apply:1']);
  });
});
