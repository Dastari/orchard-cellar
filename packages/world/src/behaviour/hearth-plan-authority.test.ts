import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS } from '@orchard/lifecycle-authoring/generated';
import type { WorldReducerContext } from '../index.js';
import { objectGraphRegistryForContent } from '../content/object-runtime.js';
import { applyBehaviourEffects, createBehaviourEffectWriter, rejectingBehaviourEffectAdapters, type BehaviourEffectWriter } from './applier.js';
import { useSelectedBehaviour, type UseSelectedAuthority } from './use-selected.js';

// Exercise the actual production writer without starting a database module.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const writerSource = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'worldBehaviourEffectWriter');
if (!writerSource) throw new Error('missing production effect writer');
const code = ts.transpileModule(`${writerSource.getText(source)}\nreturn worldBehaviourEffectWriter;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const registry = sim.bootstrapContentRegistry();
const plans = [...registry.items.values()].filter(item => item.id.startsWith('item:hearth_') && item.id.endsWith('_plan'));
const base = sim.registerPlaceableHandlers(sim.registerLootHandlers(sim.createHandlerRegistry(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS)));
const handlers = objectGraphRegistryForContent(base, { key: 'hearth-plan-authority', revision: 1n, contentHash: registry.contentHash, registry }, 1);

function fixture(plan: sim.ItemContentDefinition) {
  const sender = { toHexString: () => 'alice' };
  const tile = { spaceId: '0', x: 2, y: 3, tags: [] };
  let row = { id: 'alice:0', identity: sender, slot: 0, itemKind: plan.id.slice(5), quantity: 1, durability: 0, lit: true };
  const known = new Map<string, { id: string; recipeId: string; sourceKind: string; learnedAtTick: bigint }>();
  const writes: string[] = [];
  const statistics: [string, bigint][] = [];
  const ctx = { sender, db: {
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    player_position: { identity: { find: () => tile } },
    world_clock: { id: { find: () => ({ authorityTick: 42n }) } },
    inventory_slot: { id: { find: (id: string) => id === row.id ? row : null } },
    player_known_recipe: { id: { find: (id: string) => known.get(id) ?? null }, insert: (value: typeof known extends Map<string, infer V> ? V : never) => { known.set(value.id, value); writes.push('learn'); } },
  } } as unknown as WorldReducerContext;
  const dependencies = { ...sim, SenderError: Error, createBehaviourEffectWriter, rejectingBehaviourEffectAdapters,
    contentRegistry: () => registry,
    writeInventorySlot: (_ctx: unknown, value: typeof row) => { row = value; writes.push('consume'); },
    updateEquippedForIdentity: () => {},
    recordPlayerStatistic: (_ctx: unknown, _sender: unknown, stat: string, count: bigint) => { statistics.push([stat, count]); },
  };
  const writer = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies)) as (
    ctx: WorldReducerContext, target: undefined, actor: boolean, item: sim.ItemRef,
  ) => BehaviourEffectWriter;
  const item = (): sim.BehaviourItemSnapshot => ({ kind: row.itemKind, definitionId: `item:${row.itemKind}`, instanceId: row.id, count: row.quantity, tags: plan.tags, slot: 0, containerId: 'hotbar' });
  const authority: UseSelectedAuthority = {
    authorize: () => {}, reject: message => { throw new Error(message); },
    actorRef: () => ({ entityType: 'player', id: 'alice' }), resolveTarget: () => null, assertTargetReach: () => {},
    selectedItem: () => row.quantity === 0 ? null : ({ ref: item(), snapshot: item() }), equipmentItem: () => null,
    snapshot: () => sim.createReadOnlySnapshot({ tick: 42n,
      registry: { engineVersion: 1, revision: 1n, contentHash: registry.contentHash, definitions: {} },
      space: { id: '0', kind: 'overworld', tags: [] }, calendar: { minuteOfDay: 360, season: 'spring' },
      actor: { entityType: 'player', id: 'alice', tags: [], tile, bronze: 0n, vitals: { hunger: 5000, vigour: 5000 }, inventory: [], worldRoles: [], homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {} },
      ...(row.quantity > 0 ? { selectedItem: item() } : {}), nearbyObjects: [],
    }),
    handlers: () => handlers,
    apply: (_ctx, effects, _target, subject) => applyBehaviourEffects(effects, writer(ctx, undefined, true, subject!)),
    tileTarget: () => ({ ref: tile, snapshot: tile }), assertTileReach: () => {}, carriedObject: () => null,
  };
  return { known, writes, statistics, row: () => row,
    use: () => useSelectedBehaviour(ctx, { verb: 'secondary', targetKind: '', entityId: 0n, tileX: 0, tileY: 0 }, authority),
    restock: () => { row = { ...row, itemKind: plan.id.slice(5), quantity: 1 }; },
  };
}

describe('purchased Hearth equipment plan authority', () => {
  it('dispatches every plan through production data graphs and learns its bare recipe ID before consuming it', () => {
    expect(plans).toHaveLength(37);
    for (const plan of plans) {
      const f = fixture(plan); f.use();
      const recipeId = plan.id.slice(5, -5);
      expect([...f.known.values()], plan.id).toEqual([{ id: `alice:${recipeId}`, recipeId, sourceKind: plan.id.slice(5), learnedAtTick: 42n, identity: expect.anything() }]);
      expect(f.writes).toEqual(['learn', 'consume']);
      expect(f.row()).toMatchObject({ itemKind: 'empty', quantity: 0 });
      expect(f.statistics).toEqual([['recipe_books_read', 1n], ['recipes_learned', 1n]]);
    }
  });
  it('preserves existing duplicate-book semantics without granting duplicate knowledge', () => {
    const f = fixture(plans[0]!); f.use(); f.restock(); f.use();
    expect(f.known.size).toBe(1);
    expect(f.writes).toEqual(['learn', 'consume', 'consume']);
    expect(f.statistics.slice(-2)).toEqual([['recipe_books_read', 1n], ['recipes_learned', 0n]]);
    expect(f.row().quantity).toBe(0);
  });
});
