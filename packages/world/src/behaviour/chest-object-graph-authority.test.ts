import {
  bootstrapContentRows,
  buildContentRegistry,
  createHandlerRegistry,
  PLACEABLE_HANDLER_REGISTRATIONS,
  registerPlaceableHandlers,
  type BehaviourObjectSnapshot,
  type Effect,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';

import type { CachedContentRegistry } from '../content/cache.js';
import {
  invalidateObjectGraphRegistryCache,
  objectGraphRegistryForContent,
} from '../content/object-runtime.js';
import type { WorldReducerContext } from '../index.js';
import {
  createAuthorityBehaviourSnapshot,
  interactEntityBehaviour,
  type BehaviourActionAuthority,
  type BehaviourTargetKind,
} from './interact-entity.js';

const ctx = {} as WorldReducerContext;
const tile = { spaceId: '0', x: 11, y: 10, tags: [] } as const;

function chestSnapshot(): BehaviourObjectSnapshot {
  return {
    entityType: 'object',
    id: '7',
    definitionId: 'object:chest',
    tags: ['container', 'damageable', 'interface.chest'],
    tile,
    state: { hasContents: true },
    containerId: '7',
    ownerId: 'owner',
  };
}

describe('authored chest object graph authority parity', () => {
  it('opens generic placeable and retained legacy chest targets through the same graph', () => {
    invalidateObjectGraphRegistryCache();
    const built = buildContentRegistry(bootstrapContentRows());
    expect(built.report.valid).toBe(true);
    const content: CachedContentRegistry = {
      key: 'authored-chest-authority-parity',
      revision: 1n,
      contentHash: built.registry.contentHash,
      registry: built.registry,
    };
    const compiledBase = registerPlaceableHandlers(createHandlerRegistry());
    const handlers = objectGraphRegistryForContent(compiledBase, content, 1);
    const chestUseOwners = handlers.registrations.filter((registration) => (
      registration.eventType === 'use'
      && registration.source === 'target'
      && registration.match.kind === 'definition'
      && registration.match.definitionId === 'object:chest'
    ));
    expect(chestUseOwners.map(({ id }) => id)).toEqual(['object:chest.data_graph.open']);
    expect(PLACEABLE_HANDLER_REGISTRATIONS.map(({ id }) => id))
      .not.toContain('placeable.chest-open');

    for (const targetKind of ['placeable', 'chest'] as const satisfies readonly BehaviourTargetKind[]) {
      const applied: Array<{ readonly targetKind: BehaviourTargetKind; readonly effects: readonly Effect[] }> = [];
      const log: string[] = [];
      const target = chestSnapshot();
      const authority: BehaviourActionAuthority = {
        reject: (message) => { throw new Error(message); },
        authorize: () => { log.push('authorize'); },
        resolveTarget: (_ctx, requestedKind, entityId) => {
          log.push(`resolve:${requestedKind}:${entityId}`);
          return {
            kind: targetKind,
            ref: { entityType: 'object', id: target.id, definitionId: target.definitionId },
            snapshot: target,
          };
        },
        assertTargetReach: (_ctx, resolved) => { log.push(`reach:${resolved.kind}`); },
        actorRef: () => ({ entityType: 'player', id: 'owner' }),
        selectedItem: () => null,
        snapshot: (_ctx, resolved) => createAuthorityBehaviourSnapshot({
          tick: 1n,
          registry: {
            engineVersion: 1,
            revision: 1n,
            contentHash: built.registry.contentHash,
            definitions: {
              'object:chest': {
                id: 'object:chest', kind: 'object', tags: ['container', 'damageable', 'interface.chest'],
              },
            },
          },
          space: { id: '0', kind: 'homestead', tags: [] },
          calendar: { minuteOfDay: 720, season: 'spring' },
          actor: {
            entityType: 'player', id: 'owner', tags: [], tile: { ...tile, x: 10 },
            bronze: 0n, vitals: { hunger: 5_000, vigour: 10_000 }, inventory: [],
            worldRoles: ['player'], homesteadRoles: { '0': 'owner' }, questStates: {},
            statistics: {}, skillRanks: {},
          },
          ...(resolved === undefined ? {} : { target: resolved }),
          nearbyObjects: [],
        }),
        handlers: () => handlers,
        apply: (_ctx, effects, resolved) => {
          if (resolved === undefined) throw new Error('missing_target');
          applied.push({ targetKind: resolved.kind, effects });
        },
      };

      interactEntityBehaviour(ctx, { targetKind, entityId: 7n, verb: 'use' }, authority);
      expect(log).toEqual(['authorize', `resolve:${targetKind}:7`, `reach:${targetKind}`]);
      expect(applied).toEqual([{
        targetKind,
        effects: [{ openFrame: 'frame:chest' }],
      }]);
    }
  });
});
