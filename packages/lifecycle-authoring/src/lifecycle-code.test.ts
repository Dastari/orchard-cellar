import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Handler, ReadOnlySnapshot, SecondaryEvent } from '@orchard/sim';
import {
  AUTHORED_ITEM_LIFECYCLE_METADATA,
  AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS,
  AUTHORED_LIFECYCLE_BUNDLE_SHA256,
} from '../generated/item-lifecycles.js';
import {
  LIFECYCLE_SOURCE_FORMAT,
  compileLifecycleBundle,
  lifecycleBundleSha256,
  parseLifecycleSourceBundle,
  validateLifecycleSourceBundleAst,
  type LifecycleSourceBundle,
} from './index.js';

function sourceFixture(
  source: string,
  triggers?: readonly ('secondary' | 'equipmentUse' | 'worldItemUse' | 'useWith' | 'useAt' | 'aimedUse' | 'place')[],
) {
  const bundle = parseLifecycleSourceBundle({
    format: LIFECYCLE_SOURCE_FORMAT,
    bundleId: 'recipe-books',
    revision: 1,
    engineApiVersion: 1,
    handlers: [{
      itemId: 'item:wooden_recipe_book',
      id: 'item.wooden_recipe_book.on_use',
      event: 'onUse',
      prompt: 'READ RECIPE BOOK',
      ...(triggers === undefined ? {} : { triggers }),
      source,
    }],
  });
  const bundleSha256 = lifecycleBundleSha256(bundle);
  return { bundle, bundleSha256 };
}

describe('authored item lifecycle code', () => {
  it('requires full item content ids at the authoring boundary', () => {
    expect(() => parseLifecycleSourceBundle({
      format: LIFECYCLE_SOURCE_FORMAT,
      bundleId: 'bad-item-id', revision: 1, engineApiVersion: 1,
      handlers: [{ itemId: 'apple', id: 'item.apple.on_use', event: 'onUse',
        prompt: 'EAT', source: 'context.item.consume();' }],
    })).toThrow('full item:* content id');
  });

  it('accepts the recipe-book onUse shape and emits server and client artifacts', () => {
    const fixture = sourceFixture(`const recipes = ['wooden_pickaxe', 'wooden_sword'];
for (const recipe of recipes) {
  if (!context.player.findRecipe(recipe)) {
    context.player.giveRecipe(recipe);
  }
}`);
    const digest = fixture.bundleSha256;
    const artifacts = compileLifecycleBundle(fixture.bundle, digest);
    expect(artifacts.serverTypeScript).toContain('defineItemOnUse({');
    expect(artifacts.serverTypeScript).toContain('context.player.giveRecipe(recipe);');
    expect(artifacts.serverTypeScript).toContain('AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS');
    expect(JSON.parse(artifacts.clientMetadataJson)).toMatchObject({
      bundleSha256: fixture.bundleSha256,
      handlers: [{
        itemId: 'item:wooden_recipe_book', event: 'onUse', prompt: 'READ RECIPE BOOK',
        triggers: ['secondary'],
      }],
    });
  });

  it('generates one callback registration lane and client dispatch metadata for every authored trigger', () => {
    const fixture = sourceFixture(`if (context.event.type === 'worldItemUse' && context.target === undefined) context.block('target_required');
if (context.event.type === 'useWith' && context.target === undefined) {
  context.block('target_required');
}
if (context.event.type === 'useAt' && context.tile === undefined) context.block('tile_required');
if (context.event.type === 'aimedUse' && context.event.phase === 'fire' && context.event.chargeMs < 0) context.block('charge_invalid');
if (context.event.type === 'place' && context.tile === undefined) context.block('tile_required');
context.item.damage();`, ['secondary', 'worldItemUse', 'useWith', 'useAt', 'aimedUse', 'place']);
    const digest = fixture.bundleSha256;
    expect(() => validateLifecycleSourceBundleAst(fixture.bundle)).not.toThrow();
    const artifacts = compileLifecycleBundle(fixture.bundle, digest);
    expect(artifacts.serverTypeScript).toContain('...defineItemOnUseHandlers({');
    expect(artifacts.serverTypeScript).toContain('triggers: ["secondary","worldItemUse","useWith","useAt","aimedUse","place"] as const');
    const metadata = JSON.parse(artifacts.clientMetadataJson) as {
      readonly handlers: readonly Record<string, unknown>[];
    };
    expect(metadata.handlers).toEqual([{
      itemId: 'item:wooden_recipe_book', event: 'onUse', id: 'item.wooden_recipe_book.on_use',
      prompt: 'READ RECIPE BOOK', triggers: ['secondary', 'worldItemUse', 'useWith', 'useAt', 'aimedUse', 'place'],
    }]);
    expect(metadata.handlers[0]).not.toHaveProperty('source');
    expect(artifacts.clientMetadataJson).not.toContain('target_required');
  });

  it('rejects non-canonical triggers and every second callback for an item', () => {
    const source = 'context.item.consume();';
    const base = {
      format: LIFECYCLE_SOURCE_FORMAT,
      bundleId: 'trigger-validation', revision: 1, engineApiVersion: 1,
    } as const;
    expect(() => parseLifecycleSourceBundle({ ...base, handlers: [{
      itemId: 'item:book', id: 'item.book.on_use', event: 'onUse', prompt: 'READ', source,
      triggers: ['place', 'secondary'],
    }] })).toThrow('canonical');
    expect(() => parseLifecycleSourceBundle({ ...base, handlers: [{
      itemId: 'item:book', id: 'item.book.on_use', event: 'onUse', prompt: 'READ', source,
      triggers: ['secondary', 'secondary'],
    }] })).toThrow('duplicate');
    expect(() => parseLifecycleSourceBundle({ ...base, handlers: [
      { itemId: 'item:book', id: 'item.book.a', event: 'onUse', prompt: 'READ', source,
        triggers: ['secondary'] },
      { itemId: 'item:book', id: 'item.book.b', event: 'onUse', prompt: 'READ', source,
        triggers: ['place'] },
    ] })).toThrow('duplicate_item_lifecycle:item:book');

    const fixture = sourceFixture(source);
    const compilerBypass = {
      ...fixture.bundle,
      handlers: [
        fixture.bundle.handlers[0]!,
        { ...fixture.bundle.handlers[0]!, id: 'item.wooden_recipe_book.place', triggers: ['place'] },
      ],
    } satisfies LifecycleSourceBundle;
    expect(() => validateLifecycleSourceBundleAst(compilerBypass))
      .toThrow('duplicate_item_lifecycle:item:wooden_recipe_book');
  });

  it.each([
    ['an unbounded loop', 'while (true) { context.player.giveRecipe(\'x\'); }', 'unbounded loops'],
    ['ambient process access', 'context.item.applyEffect(process.env.SECRET);', 'forbidden global'],
    ['network calls', 'fetch(\'https://example.test\');', 'outside the lifecycle capability API'],
    ['arbitrary context mutation', 'context.player.name = \'changed\';', 'context is read-only'],
    ['dynamic construction', 'new Function(\'return 1\')();', 'construction'],
  ])('rejects %s before generated source exists', (_label, source, expected) => {
    const fixture = sourceFixture(source);
    const digest = fixture.bundleSha256;
    expect(() => compileLifecycleBundle(fixture.bundle, digest)).toThrow(expected);
  });

  it('pins deterministic source provenance and rejects a mismatched source digest', () => {
    const fixture = sourceFixture('context.item.consume();');
    const artifacts = compileLifecycleBundle(fixture.bundle);
    expect(JSON.parse(artifacts.provenanceJson)).toEqual({
      format: 'orchard-lifecycle-build-provenance-v1',
      bundleId: fixture.bundle.bundleId,
      revision: fixture.bundle.revision,
      bundleSha256: fixture.bundleSha256,
      handlerCount: 1,
    });
    expect(compileLifecycleBundle(fixture.bundle)).toEqual(artifacts);
    expect(() => compileLifecycleBundle(fixture.bundle, '0'.repeat(64)))
      .toThrow('compiled lifecycle digest does not match');
  });

  it('keeps the repository baseline source, server registrations, and client metadata in parity', () => {
    const bundle = parseLifecycleSourceBundle(JSON.parse(readFileSync(
      new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
      'utf8',
    )) as unknown);
    expect(lifecycleBundleSha256(bundle)).toBe(AUTHORED_LIFECYCLE_BUNDLE_SHA256);
    const sourceIds = [...new Set(bundle.handlers.map(({ itemId }) => itemId))].sort();
    expect([...new Set(AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.map(({ match }) => (
      match.kind === 'definition' ? match.definitionId : null
    )).filter((id): id is string => id !== null))].sort()).toEqual(sourceIds);
    expect([...new Set(AUTHORED_ITEM_LIFECYCLE_METADATA.map(({ itemId }) => itemId))].sort())
      .toEqual(sourceIds);

    const local = compileLifecycleBundle(bundle, AUTHORED_LIFECYCLE_BUNDLE_SHA256);
    expect(JSON.parse(local.provenanceJson)).toMatchObject({ handlerCount: bundle.handlers.length });
  });

  it('executes baseline recipe-book, food, and tea callbacks as bounded effects', () => {
    const snapshot = {
      tick: 1n,
      registry: { engineVersion: 1, revision: 1n, contentHash: 'test', definitions: {} },
      space: { id: 'space:test', kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 0, season: 'spring' },
      actor: {
        entityType: 'player', id: 'player:test', tags: [],
        tile: { spaceId: 'space:test', x: 0, y: 0, tags: [] }, bronze: 0n,
        vitals: { hunger: 5_000, vigour: 10_000 }, inventory: [], worldRoles: [],
        homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
        knownRecipeIds: ['recipe:fishing_rod'],
      },
      selectedItem: {
        kind: 'fishing_handbook', definitionId: 'item:fishing_handbook', tags: [], count: 1,
      },
      nearbyObjects: [],
    } satisfies ReadOnlySnapshot;
    const event = {
      type: 'secondary', actor: { entityType: 'player', id: 'player:test' },
      selectedItem: { kind: 'fishing_handbook' },
    } satisfies SecondaryEvent;
    const run = (id: string, view: ReadOnlySnapshot = snapshot) => {
      const registration = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find((candidate) => candidate.id === id);
      if (registration === undefined) throw new Error(`missing registration ${id}`);
      return (registration.handler as Handler)(event, view);
    };
    expect(run('item:fishing_handbook.on_use')).toEqual({ effects: [
      { learnRecipes: ['process:cook_fish'] }, { consumeSelected: 1 },
    ] });
    expect(run('item:orchard_tea.on_use')).toEqual({ effects: [
      { applyEffect: { effectId: 'orchard_tea' } }, { consumeSelected: 1 },
    ] });
    expect(run('item:apple.on_use', {
      ...snapshot,
      actor: { ...snapshot.actor, vitals: { hunger: 10_000, vigour: 10_000 } },
      selectedItem: { kind: 'apple', definitionId: 'item:apple', tags: ['crop.fruit'], count: 1,
        state: { foodRestoreCenti: 700, fruit: true } },
    })).toEqual({ effects: [
      { consumeSelected: 1 }, { applyEffect: { effectId: 'hunger', stacks: 700 } },
      { applyEffect: { effectId: 'fruitful_energy' } },
    ] });
  });

  it('executes exact authored placement and repair callbacks with legacy-parity effects', () => {
    const base = {
      tick: 1n,
      registry: { engineVersion: 1, revision: 1n, contentHash: 'test', definitions: {} },
      space: { id: 'space:test', kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 0, season: 'spring' },
      actor: {
        entityType: 'player', id: 'player:test', tags: [],
        tile: { spaceId: 'space:test', x: 0, y: 0, tags: [] }, bronze: 100n,
        vitals: { hunger: 5_000, vigour: 10_000 }, inventory: [], worldRoles: [],
        homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
      },
      nearbyObjects: [],
    } satisfies Omit<ReadOnlySnapshot, 'selectedItem' | 'target'>;
    const run = (id: string, event: Parameters<Handler>[0], view: ReadOnlySnapshot) => {
      const registration = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find((candidate) => candidate.id === id);
      if (registration === undefined) throw new Error(`missing registration ${id}`);
      return (registration.handler as Handler)(event, view);
    };
    const place = {
      type: 'place', actor: { entityType: 'player', id: 'player:test' },
      subject: { kind: 'workbench' }, tile: { spaceId: 'space:test', x: 4, y: 5 },
    } as const;
    expect(run('item:workbench.place.place', place, {
      ...base,
      selectedItem: { kind: 'workbench', definitionId: 'item:workbench', tags: ['item.placeable'], count: 1 },
      target: { ...place.tile, tags: [] },
    })).toEqual({ effects: [
      { spawnObject: { definitionId: 'object:workbench', at: place.tile } },
      { consumeSelected: 1 },
    ] });
    expect(run('item:homestead_deed.place.place', {
      ...place, subject: { kind: 'homestead_deed' },
    }, {
      ...base,
      selectedItem: { kind: 'homestead_deed', definitionId: 'item:homestead_deed', tags: [], count: 1 },
      target: { ...place.tile, tags: [] },
    })).toEqual({ effects: [
      { foundHomestead: { at: place.tile } }, { consumeSelected: 1 },
    ] });
    expect(run('item:boat.place.place', {
      ...place, subject: { kind: 'boat' },
    }, {
      ...base,
      selectedItem: { kind: 'boat', definitionId: 'item:boat', tags: [], count: 1 },
      target: { ...place.tile, tags: [] },
    })).toEqual({ effects: [
      { spawnNpc: { definitionId: 'npc:boat', at: place.tile } }, { consumeSelected: 1 },
    ] });

    const anvil = {
      entityType: 'object' as const, id: 'anvil:1', definitionId: 'object:anvil', tags: ['station.anvil'],
      tile: { ...place.tile, tags: [] }, state: {},
    };
    const axe = {
      kind: 'axe', definitionId: 'item:axe', tags: ['item.tool'], count: 1, durability: 100,
      state: { repairMaximum: 200, repairMaterial: 'wood', repairCostBronze: 5 },
    } as const;
    const useWith = {
      type: 'useWith', actor: { entityType: 'player', id: 'player:test' },
      selectedItem: { kind: 'axe' },
      target: { entityType: 'object', id: 'anvil:1', definitionId: 'object:anvil' },
    } as const;
    expect(run('item:axe.world_tool.useWith', useWith, {
      ...base, selectedItem: axe, target: anvil,
    })).toEqual({ effects: [
      { consumeItem: { kind: 'wood', count: 1 } },
      { chargeBronze: 5 },
      { applyEffect: { effectId: 'repair_selected' } },
    ] });
    expect(run('item:axe.world_tool.useWith', {
      ...useWith, target: { entityType: 'object', id: 'chest:1', definitionId: 'object:chest' },
    }, {
      ...base, selectedItem: axe,
      target: { ...anvil, id: 'chest:1', definitionId: 'object:chest' },
    })).toEqual({ effects: [{ worldTool: { action: 'target' } }] });
    expect(run('item:axe.world_tool.useWith', useWith, {
      ...base, selectedItem: { ...axe, durability: 200 }, target: anvil,
    })).toEqual({ blocked: 'tool_not_damaged' });
  });
});
