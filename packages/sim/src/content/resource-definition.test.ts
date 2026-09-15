import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED } from '../state.js';
import { raiseEvent } from '../behaviour/raise.js';
import { createHandlerRegistry } from '../behaviour/registry.js';
import { registerLootHandlers } from '../behaviour/handlers/loot.js';
import { createReadOnlySnapshot } from '../behaviour/snapshot.js';
import { bootstrapContentRows } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import {
  runtimeResourceDefinition,
  runtimeResourceObstacle,
  runtimeResourceToolAllowed,
} from './runtime.js';

describe('authored resource definitions', () => {
  it('keeps behavior when a definition id is renamed independently of persisted kind', () => {
    const rows = bootstrapContentRows();
    const original = rows.find(({ id }) => id === 'resource:ore_iron')!;
    const payload = JSON.parse(original.json as string) as Record<string, unknown>;
    const renamed = { ...payload, id: 'resource:iron_outcrop_v2', displayName: 'Iron Outcrop' };
    const built = buildContentRegistry([
      ...rows.filter(({ id }) => id !== original.id),
      { id: renamed.id as string, kind: 'resource', slug: 'iron_outcrop_v2', json: renamed },
    ]);
    expect(built.report.errors).toEqual([]);

    const persisted = { kind: 'ore_iron', definitionId: 'resource:iron_outcrop_v2' };
    const definition = runtimeResourceDefinition(built.registry, persisted);
    expect(definition).toMatchObject({
      id: 'resource:iron_outcrop_v2', runtimeKind: 'ore_iron', loot: 'loot:mining_ore_iron',
      visual: { kind: 'ore', asset: 'ore_iron' },
      interaction: { mode: 'mine', tool: { specialization: 'mining', minimumTier: 1 } },
    });
    expect(runtimeResourceDefinition(built.registry, { kind: 'ore_iron' })?.id)
      .toBe('resource:iron_outcrop_v2');
    expect(runtimeResourceToolAllowed(built.registry, persisted, {
      specialization: 'mining', tier: 1, reachTiles: 2,
    })).toBe(true);
    expect(runtimeResourceObstacle(built.registry, persisted, 10, 20)).toEqual({
      left: 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - 6 * FIXED_UNITS_PER_PIXEL,
      right: 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + 5 * FIXED_UNITS_PER_PIXEL,
      top: 21 * TILE_SIZE_FIXED - 8 * FIXED_UNITS_PER_PIXEL,
      bottom: 21 * TILE_SIZE_FIXED - FIXED_UNITS_PER_PIXEL,
    });

    const handlers = registerLootHandlers(createHandlerRegistry(), built.registry.resources.values());
    const tile = { spaceId: '0', x: 10, y: 20, tags: [] } as const;
    const actor = { entityType: 'player' as const, id: 'p1' };
    const target = {
      entityType: 'object' as const,
      id: 'n1',
      definitionId: definition!.id,
      tags: definition!.tags,
      tile,
      state: {},
    };
    const result = raiseEvent(handlers, {
      type: 'break', actor,
      object: { entityType: 'object', id: 'n1', definitionId: definition!.id },
      tool: { kind: 'pickaxe' },
    }, createReadOnlySnapshot({
      tick: 1n,
      registry: { engineVersion: 1, revision: 1n, contentHash: 'resources', definitions: {} },
      space: { id: '0', kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 0, season: 'spring' },
      actor: {
        ...actor, tags: [], tile, bronze: 0n,
        vitals: { hunger: 1, vigour: 1 }, inventory: [], worldRoles: [],
        homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
      },
      target,
      nearbyObjects: [],
    }));
    expect('blocked' in result ? result : result.effects)
      .toEqual([{ rollLoot: { lootId: 'loot:mining_ore_iron' } }]);
  });

  it('rejects duplicate runtime kinds and invalid loot references', () => {
    const rows = bootstrapContentRows();
    const source = JSON.parse(rows.find(({ id }) => id === 'resource:ore_iron')!.json as string) as Record<string, unknown>;
    const built = buildContentRegistry([
      ...rows,
      { id: 'resource:duplicate_iron', kind: 'resource', slug: 'duplicate_iron', json: {
        ...source, id: 'resource:duplicate_iron', loot: 'loot:not_present',
      } },
    ]);
    expect(built.report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_world_definition', path: 'runtimeKind' }),
      expect.objectContaining({ code: 'unresolved_reference', definitionId: 'resource:duplicate_iron', path: 'loot' }),
    ]));
  });

  it('fails neutral for retained rows whose authored definition is retired or absent', () => {
    const rows = bootstrapContentRows();
    const original = rows.find(({ id }) => id === 'resource:tree_ashwood')!;
    const payload = JSON.parse(original.json as string) as Record<string, unknown>;
    const withoutOriginal = rows.filter(({ id }) => id !== original.id);
    const retired = { ...payload, id: 'resource:retired_ashwood', retired: true };
    const retiredRegistry = buildContentRegistry([
      ...withoutOriginal,
      { id: 'resource:retired_ashwood', kind: 'resource', slug: 'retired_ashwood', json: retired },
    ]).registry;
    expect(runtimeResourceDefinition(retiredRegistry, { kind: 'tree_ashwood' })).toBeNull();
    expect(runtimeResourceDefinition(buildContentRegistry(withoutOriginal).registry, { kind: 'tree_ashwood' })).toBeNull();
  });

  it('keeps actor-reserved drop custody when the authored resource id is renamed', () => {
    const rows = bootstrapContentRows();
    const original = rows.find(({ id }) => id === 'resource:tree_ashwood')!;
    const payload = JSON.parse(original.json as string) as Record<string, unknown>;
    const renamed = { ...payload, id: 'resource:moon_ashwood' };
    const registry = buildContentRegistry([
      ...rows.filter(({ id }) => id !== original.id),
      { id: renamed.id, kind: 'resource', slug: 'moon_ashwood', json: renamed },
    ]).registry;
    expect(runtimeResourceDefinition(registry, { kind: 'tree_ashwood' })).toMatchObject({
      id: 'resource:moon_ashwood', lootDelivery: 'actor_reserved',
    });
  });
});

it('validates orchard seed references and rejects ambiguous or non-growing trees', () => {
  const rows = bootstrapContentRows();
  const original = rows.find(({ id }) => id === 'resource:tree_apple')!;
  const apple = JSON.parse(original.json as string) as Record<string, unknown>;
  const build = (patch: Record<string, unknown>) => buildContentRegistry(rows.map(row => row.id === original.id
    ? { ...row, json: { ...apple, ...patch } } : row));
  expect(build({ seedItem: 'item:apple_seed' }).report.errors).toEqual([]);
  for (const patch of [
    { seedItem: 'item:missing_seed' }, { seedItem: 'item:wood' },
    { seedItem: 'item:pear_seed' }, { regrowth: undefined },
    { tags: ['world.resource', 'resource.tree'] },
  ]) {
    expect(build(patch).report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ definitionId: original.id, path: 'seedItem' }),
    ]));
  }
  expect(build({ seedItem: 'not_an_item_reference' }).report.errors.length).toBeGreaterThan(0);
});


it('lets a replacement tree inherit the seed mapping of a retired definition', () => {
  const rows = bootstrapContentRows();
  const original = rows.find(({ id }) => id === 'resource:tree_apple')!;
  const apple = JSON.parse(original.json as string) as Record<string, unknown>;
  const replacement = { ...apple, id: 'resource:new_apple', runtimeKind: 'new_apple' };
  const result = buildContentRegistry([
    ...rows.map(row => row.id === original.id ? { ...row, json: { ...apple, retired: true, replacement: replacement.id } } : row),
    { id: replacement.id, kind: 'resource', slug: 'new_apple', json: replacement },
  ]);
  expect(result.report.errors).toEqual([]);
});
