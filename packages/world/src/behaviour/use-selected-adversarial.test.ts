import { readFileSync } from 'node:fs';
import {
  createHandlerRegistry,
  createReadOnlySnapshot,
  effectsResult,
  registerHandler,
  type BehaviourItemSnapshot,
  type BehaviourObjectSnapshot,
  type Effect,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import type { WorldReducerContext } from '../index.js';
import type { ResolvedBehaviourTarget } from './interact-entity.js';
import { useSelectedBehaviour, type UseSelectedAuthority } from './use-selected.js';

const ctx = {} as WorldReducerContext;
const tile = { spaceId: '7', x: 4, y: 5, tags: [] } as const;
const dispatchSource = readFileSync(new URL('./use-selected.ts', import.meta.url), 'utf8');

function item(kind = 'axe'): BehaviourItemSnapshot {
  return {
    kind,
    definitionId: `item:${kind}`,
    tags: ['item.tool'],
    count: 1,
    containerId: 'hotbar',
    slot: 0,
  };
}

function snapshot(selected: BehaviourItemSnapshot, target?: BehaviourObjectSnapshot) {
  return createReadOnlySnapshot({
    tick: 10n,
    registry: { engineVersion: 1, revision: 1n, contentHash: 'red-team', definitions: {} },
    space: { id: tile.spaceId, kind: 'overworld', tags: [] },
    calendar: { minuteOfDay: 600, season: 'spring' },
    actor: {
      entityType: 'player', id: 'actor', tags: [], tile, bronze: 0n,
      vitals: { hunger: 5_000, vigour: 5_000 }, inventory: [], worldRoles: [],
      homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
    },
    selectedItem: selected,
    nearbyObjects: [],
    ...(target === undefined ? {} : { target }),
  });
}

function authority(options: {
  readonly selected?: BehaviourItemSnapshot | null;
  readonly resolve?: (kind: string, id: bigint) => ResolvedBehaviourTarget | null;
  readonly handlers?: UseSelectedAuthority['handlers'];
  readonly log?: string[];
  readonly applied?: Effect[][];
} = {}): UseSelectedAuthority {
  const selected = options.selected === undefined ? item() : options.selected;
  const log = options.log ?? [];
  return {
    reject: (message) => { throw new Error(message); },
    authorize: () => { log.push('authorize'); },
    resolveTarget: (_ctx, kind, id) => {
      log.push(`resolve:${kind}:${id}`);
      return options.resolve?.(kind, id) ?? null;
    },
    assertTargetReach: (_ctx, target) => { log.push(`reach:${target.kind}`); },
    actorRef: () => ({ entityType: 'player', id: 'actor' }),
    selectedItem: () => selected === null ? null : {
      ref: { kind: selected.kind, containerId: 'hotbar', slot: 0 },
      snapshot: selected,
    },
    equipmentItem: () => null,
    snapshot: (_ctx, resolvedTarget) => snapshot(
      selected ?? item('empty'),
      resolvedTarget !== undefined && 'entityType' in resolvedTarget
        ? resolvedTarget as BehaviourObjectSnapshot
        : undefined,
    ),
    handlers: options.handlers ?? (() => createHandlerRegistry()),
    apply: (_ctx, effects) => {
      log.push(`apply:${effects.length}`);
      options.applied?.push([...effects]);
    },
    tileTarget: (_ctx, x, y) => ({
      ref: { spaceId: tile.spaceId, x, y },
      snapshot: { spaceId: tile.spaceId, x, y, tags: [] },
    }),
    assertTileReach: () => { log.push('tile-reach'); },
    carriedObject: () => null,
  };
}

describe('generic selected-item authority adversarial inputs', () => {
  it('selects item handlers only through the authoritative item ref and compiled registry', () => {
    for (const itemKind of [
      'axe', 'pickaxe', 'sword', 'bow', 'fishing_rod', 'hoe', 'watering_can', 'lantern', 'torch',
    ]) expect(dispatchSource).not.toContain(`'${itemKind}'`);
    expect(dispatchSource).toContain('const selected = authority.selectedItem(ctx);');
    expect(dispatchSource).toContain('selectedItem: selected.ref');
    expect(dispatchSource).toContain('raiseEvent(authority.handlers(ctx)');
  });

  it('carries the resolved lifecycle owner through every item-owned apply boundary', () => {
    expect(dispatchSource).toContain(
      'authority.apply(ctx, result.effects, undefined, equipment.ref);',
    );
    expect(dispatchSource).toContain(
      'authority.apply(ctx, result.effects, target, selected?.ref);',
    );
    expect(dispatchSource).toContain(
      'authority.apply(ctx, result.effects, target, selected.ref);',
    );
    expect(dispatchSource.match(
      /authority\.apply\(ctx, result\.effects, undefined, selected\.ref\);/gu,
    )).toHaveLength(2);
    expect(dispatchSource).toContain(
      'authority.apply(ctx, result.effects, undefined, carried === null ? selected?.ref : undefined);',
    );
  });

  it('rejects forged verbs before resolution or writes', () => {
    const log: string[] = [];
    expect(() => useSelectedBehaviour(ctx, {
      verb: '__admin_use', targetKind: 'placeable', entityId: 1n, tileX: 0, tileY: 0,
    }, authority({ log }))).toThrow('behaviour_verb_invalid');
    expect(log).toEqual(['authorize']);
  });

  it('rejects retired processor-operation verbs instead of exposing a second dispatcher', () => {
    for (const verb of ['process_start', 'process_collect', 'process_cancel']) {
      const log: string[] = [];
      expect(() => useSelectedBehaviour(ctx, {
        verb, targetKind: '', entityId: 0n, tileX: 0, tileY: 0,
      }, authority({ log }))).toThrow('behaviour_verb_invalid');
      expect(log, verb).toEqual(['authorize']);
    }
  });

  it('rejects missing, guessed, and cross-lane target namespaces without applying effects', () => {
    for (const request of [
      { verb: 'use_with', targetKind: '', entityId: 9n },
      { verb: 'use_with', targetKind: 'resource_or_placeable', entityId: 9n },
      { verb: 'use_at', targetKind: 'resource', entityId: 9n },
      { verb: 'aimed_use', targetKind: '', entityId: 9n, phase: 'fire' },
    ] as const) {
      const log: string[] = [];
      expect(() => useSelectedBehaviour(ctx, {
        ...request, tileX: 4, tileY: 5,
      }, authority({ log })), `${request.verb}:${request.targetKind}`).toThrow(/behaviour_/u);
      expect(log.some((entry) => entry.startsWith('apply:')), `${request.verb}:${request.targetKind}`)
        .toBe(false);
    }
  });

  it('rejects absent or target-spoofed equipment rows without invoking handlers', () => {
    for (const request of [
      { targetKind: '', entityId: 0n, equipmentSlot: 34 },
      { targetKind: 'placeable', entityId: 9n, equipmentSlot: 35 },
    ] as const) {
      const log: string[] = [];
      expect(() => useSelectedBehaviour(ctx, {
        verb: 'equipment_use', tileX: 0, tileY: 0, ...request,
      }, authority({ log }))).toThrow(/behaviour_equipment_/u);
      expect(log.some((entry) => entry.startsWith('apply:'))).toBe(false);
    }
  });

  it('keeps identical numeric ids distinct across explicit namespaces', () => {
    const selected = item('axe');
    const applied: Effect[][] = [];
    const resolvedKinds: string[] = [];
    const handlers = () => registerHandler(createHandlerRegistry(), {
      id: 'red-team.namespace',
      eventType: 'useWith',
      source: 'selectedItem',
      match: { kind: 'definition', definitionId: 'item:axe' },
      handler: (_event, view) => effectsResult([{
        sfx: view.target !== undefined && 'entityType' in view.target
          ? view.target.definitionId
          : 'missing',
      }]),
    });
    const resolve = (kind: string, id: bigint): ResolvedBehaviourTarget => {
      resolvedKinds.push(kind);
      const definitionId = kind === 'resource' ? 'resource:oak' : 'object:campfire';
      const target: BehaviourObjectSnapshot = {
        entityType: 'object', id: id.toString(), definitionId, tags: [], tile, state: {},
      };
      return {
        kind: kind as ResolvedBehaviourTarget['kind'],
        ref: { entityType: 'object', id: id.toString(), definitionId },
        snapshot: target,
      };
    };
    for (const targetKind of ['resource', 'placeable'] as const) {
      useSelectedBehaviour(ctx, {
        verb: 'use_with', targetKind, entityId: 9n, tileX: 0, tileY: 0,
      }, authority({ selected, resolve, handlers, applied }));
    }
    expect(resolvedKinds).toEqual(['resource', 'placeable']);
    expect(applied).toEqual([
      [{ sfx: 'resource:oak' }],
      [{ sfx: 'object:campfire' }],
    ]);
  });

  it('does not turn a spoofed actionId into a capability', () => {
    const selected = item('fishing_rod');
    const applied: Effect[][] = [];
    const handlers = () => registerHandler(createHandlerRegistry(), {
      id: 'red-team.use-at',
      eventType: 'useAt',
      source: 'selectedItem',
      match: { kind: 'definition', definitionId: 'item:fishing_rod' },
      handler: (event) => event.actionId === 'cast'
        ? effectsResult([{ sfx: 'cast' }])
        : effectsResult([], { continue: true }),
    });
    useSelectedBehaviour(ctx, {
      verb: 'use_at', targetKind: '', entityId: 99n, tileX: 4, tileY: 5,
      actionId: '__grant_fish',
    }, authority({ selected, handlers, applied }));
    expect(applied).toEqual([[]]);
  });

  it('resolves authored tile capability before applying the coarse transport reach bound', () => {
    const log: string[] = [];
    const handlers = () => registerHandler(createHandlerRegistry(), {
      id: 'red-team.tile-order',
      eventType: 'useAt',
      source: 'selectedItem',
      match: { kind: 'definition', definitionId: 'item:pickaxe' },
      handler: () => {
        log.push('handler');
        return effectsResult([{ worldTool: { action: 'digCellar', at: tile } }]);
      },
    });
    expect(() => useSelectedBehaviour(ctx, {
      verb: 'use_at', targetKind: '', entityId: 0n, tileX: tile.x, tileY: tile.y,
      actionId: 'dig_cellar',
    }, {
      ...authority({ selected: item('pickaxe'), handlers, log }),
      assertTileReach: () => {
        log.push('tile-reach');
        throw new Error('behaviour_target_out_of_range');
      },
    })).toThrow('behaviour_target_out_of_range');
    expect(log).toEqual(['authorize', 'handler', 'tile-reach']);
    expect(log.some((entry) => entry.startsWith('apply:'))).toBe(false);
  });

  it('forwards the resolved reel primitive so reach authority can preserve cancellation', () => {
    const applied: Effect[][] = [];
    let observedEffects: readonly Effect[] | undefined;
    const handlers = () => registerHandler(createHandlerRegistry(), {
      id: 'red-team.reel',
      eventType: 'useAt',
      source: 'selectedItem',
      match: { kind: 'definition', definitionId: 'item:fishing_rod' },
      handler: () => effectsResult([{ fishing: { action: 'reel' } }]),
    });
    useSelectedBehaviour(ctx, {
      verb: 'use_at', targetKind: '', entityId: 0n, tileX: tile.x, tileY: tile.y,
      actionId: 'reel',
    }, {
      ...authority({ selected: item('fishing_rod'), handlers, applied }),
      assertTileReach: (_ctx, _tile, _item, _action, effects) => { observedEffects = effects; },
    });
    expect(observedEffects).toEqual([{ fishing: { action: 'reel' } }]);
    expect(applied).toEqual([[{ fishing: { action: 'reel' } }]]);
  });

  it('rejects malformed aimed-use phases without invoking authored handlers', () => {
    const log: string[] = [];
    let handled = false;
    const handlers = () => registerHandler(createHandlerRegistry(), {
      id: 'red-team.aimed-use',
      eventType: 'aimedUse',
      source: 'selectedItem',
      match: { kind: 'definition', definitionId: 'item:bow' },
      handler: () => {
        handled = true;
        return effectsResult([]);
      },
    });
    expect(() => useSelectedBehaviour(ctx, {
      verb: 'aimed_use', targetKind: '', entityId: 0n, tileX: 0, tileY: 0,
      phase: 'instant-kill', aimX: 1, aimY: 1, chargeMs: 65_535,
    }, authority({ selected: item('bow'), handlers, log }))).toThrow('behaviour_aimed_use_phase_invalid');
    expect(handled).toBe(false);
    expect(log.some((entry) => entry.startsWith('apply:'))).toBe(false);
  });

  it('forwards only the typed bounded payload for every aimed-use phase', () => {
    const observed: unknown[] = [];
    const applied: Effect[][] = [];
    const handlers = () => registerHandler(createHandlerRegistry(), {
      id: 'red-team.bow-phases',
      eventType: 'aimedUse',
      source: 'selectedItem',
      match: { kind: 'definition', definitionId: 'item:bow' },
      handler: (event) => {
        observed.push(event);
        return effectsResult([{ bowAction: event.phase === 'begin'
          ? { phase: 'begin' }
          : event.phase === 'cancel'
            ? { phase: 'cancel', chargeMs: event.chargeMs }
            : {
                phase: 'fire', aimX: event.aimX, aimY: event.aimY,
                chargeMs: event.chargeMs,
              } }]);
      },
    });
    for (const request of [
      { phase: 'begin' as const },
      { phase: 'cancel' as const, chargeMs: 720 },
      { phase: 'fire' as const, aimX: 120, aimY: -32, chargeMs: 1_240 },
    ]) useSelectedBehaviour(ctx, {
      verb: 'aimed_use', targetKind: '', entityId: 0n, tileX: 0, tileY: 0, ...request,
    }, authority({ selected: item('bow'), handlers, applied }));

    expect(observed).toEqual([
      expect.objectContaining({ type: 'aimedUse', phase: 'begin' }),
      expect.objectContaining({ type: 'aimedUse', phase: 'cancel', chargeMs: 720 }),
      expect.objectContaining({
        type: 'aimedUse', phase: 'fire', aimX: 120, aimY: -32, chargeMs: 1_240,
      }),
    ]);
    expect(applied).toEqual([
      [{ bowAction: { phase: 'begin' } }],
      [{ bowAction: { phase: 'cancel', chargeMs: 720 } }],
      [{ bowAction: { phase: 'fire', aimX: 120, aimY: -32, chargeMs: 1_240 } }],
    ]);
  });
});
