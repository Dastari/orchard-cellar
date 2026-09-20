import { describe, expect, it } from 'vitest';

import type { MiningYieldState } from '../../mining.js';
import { bootstrapContentRows } from '../../content/bootstrap-registry.js';
import { buildContentRegistry } from '../../content/registry.js';
import type { LifecycleEvent } from '../events.js';
import { raiseEvent } from '../raise.js';
import { createHandlerRegistry } from '../registry.js';
import { createReadOnlySnapshot } from '../snapshot.js';
import {
  LOOT_HANDLER_REGISTRATIONS,
  registerLootHandlers,
  resolveFishingLoot,
  resolveMiningLoot,
  resolveResourceHitLoot,
  resolveWildlifeLoot,
  rollLoot,
} from './loot.js';

const build = buildContentRegistry(bootstrapContentRows());
if (!build.report.valid) throw new Error(JSON.stringify(build.report.errors));
const loots = build.registry.loots;
const miningOreResources = [...build.registry.resources.values()]
  .flatMap((definition) => definition.tags.flatMap((tag) => {
    const prefix = 'generator.island.ore.';
    if (!tag.startsWith(prefix)) return [];
    return [{ ordinal: Number(tag.slice(prefix.length)), kind: definition.runtimeKind }];
  }))
  .sort((left, right) => left.ordinal - right.ordinal)
  .map(({ kind }) => kind);
const seed = (value: number) => ['loot-test', value] as const;
function goldenHash(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

describe('authored loot definition parity', () => {
  it('matches every wildlife drop and combat-XP switch', () => {
    expect(Object.fromEntries(['chicken', 'rooster', 'duck', 'goose', 'pig', 'cow', 'sheep'].map((species) => [
      species, resolveWildlifeLoot(loots, build.registry.creatures.get(`creature:${species}`)!, seed(1)),
    ]))).toEqual({
      chicken: { drops: [{ itemKind: 'raw_chicken', quantity: 1 }], flags: [], combatExperience: 14n },
      rooster: { drops: [{ itemKind: 'raw_chicken', quantity: 1 }], flags: [], combatExperience: 14n },
      duck: { drops: [{ itemKind: 'raw_chicken', quantity: 1 }], flags: [], combatExperience: 14n },
      goose: { drops: [{ itemKind: 'raw_chicken', quantity: 2 }], flags: [], combatExperience: 18n },
      pig: { drops: [{ itemKind: 'raw_pork', quantity: 3 }], flags: [], combatExperience: 22n },
      cow: { drops: [{ itemKind: 'raw_beef', quantity: 4 }, { itemKind: 'leather', quantity: 2 }], flags: [], combatExperience: 28n },
      sheep: { drops: [{ itemKind: 'raw_mutton', quantity: 3 }], flags: [], combatExperience: 22n },
    });
  });

  it('matches mining yields for node classes, ranks, pity, and 500 deterministic seeds', () => {
    const states: MiningYieldState[] = [
      ...miningOreResources.flatMap((kind) => [
        { kind, nodeClass: 'mixed' as const, richnessRemaining: 1, maximumRichness: 4, yieldsProduced: 3, producedOre: false },
        { kind, nodeClass: 'mixed' as const, richnessRemaining: 4, maximumRichness: 4, yieldsProduced: 0, producedOre: false },
        { kind, nodeClass: 'pure' as const, richnessRemaining: 5, maximumRichness: 5, yieldsProduced: 0, producedOre: false },
        { kind, nodeClass: 'pristine' as const, richnessRemaining: 6, maximumRichness: 6, yieldsProduced: 0, producedOre: false },
      ]),
      { kind: 'rock_large', nodeClass: 'rock', richnessRemaining: 3, maximumRichness: 3, yieldsProduced: 0, producedOre: false },
    ];
    const corpus = [];
    for (const state of states) {
      for (let value = 0; value < 500; value += 1) {
        for (const ranks of [[0, 0, 0], [3, 2, 1], [99, 99, 99]] as const) {
          const resolved = resolveMiningLoot(loots, state, seed(value), ...ranks);
          // Silver is an independent authored bonus group. Preserve the
          // historical primary-yield corpus; tool-progression tests exercise
          // the additional payout without replacing existing iron drops.
          corpus.push({ ...resolved, drops: resolved.drops.filter(({ itemKind }) => itemKind !== 'silver_ore') });
        }
      }
    }
    expect(goldenHash(corpus)).toBe('dd8564ce');
  });

  it('matches fishing quality, depletion pity, and weighted bonuses for 1,000 seeds', () => {
    const corpus = Array.from({ length: 1_000 }, (_, value) => (
      [0, 4, 9, 20].flatMap((dexterity) => (
        [1, 2, 4].map((richness) => resolveFishingLoot(loots, seed(value), dexterity, richness))
      ))
    ));
    expect(goldenHash(corpus)).toBe('ffbe996b');
  });

  it('matches health/stage resource and gatherable drop chains', () => {
    expect(resolveResourceHitLoot(loots, 'tree_oak', 0, 3)).toEqual([{ itemKind: 'wood', quantity: 3 }]);
    expect(resolveResourceHitLoot(loots, 'tree_oak', 0, 2)).toEqual([{ itemKind: 'wood', quantity: 1 }]);
    expect(resolveResourceHitLoot(loots, 'tree_oak', 0, 1)).toEqual([{ itemKind: 'stick', quantity: 1 }]);
    expect(resolveResourceHitLoot(loots, 'tree_oak', 1, 3)).toEqual([]);
    expect(resolveResourceHitLoot(loots, 'tree_pear', 0, 3)).toEqual([
      { itemKind: 'wood', quantity: 3 },
    ]);
    expect(resolveResourceHitLoot(loots, 'cactus', 0, 3)).toEqual([{ itemKind: 'cactus', quantity: 3 }]);
    expect(resolveResourceHitLoot(loots, 'loose_stone', 0)).toEqual([{ itemKind: 'pebble', quantity: 1 }]);
    expect(resolveResourceHitLoot(loots, 'fallen_branch', 0)).toEqual([{ itemKind: 'wood', quantity: 1 }]);
  });

  it('is deterministic, bounded, and rejects recursive authored tables', () => {
    expect(rollLoot(loots, { lootId: 'loot:fishing_pool', seedParts: seed(42), context: {
      values: { quality: 'rare' },
    } })).toEqual(rollLoot(loots, {
      lootId: 'loot:fishing_pool', seedParts: seed(42), context: { values: { quality: 'rare' } },
    }));
    expect(() => rollLoot(loots, { lootId: 'loot:fishing_pool', seedParts: seed(1), rolls: 33 }))
      .toThrow('loot_roll_count_invalid');
    const recursive = new Map(loots);
    recursive.set('loot:recursive', {
      id: 'loot:recursive', kind: 'loot', schemaVersion: 1,
      groups: [{ id: 'self', entries: [{ id: 'self', weight: 1, target: { loot: 'loot:recursive' } }] }],
    });
    expect(() => rollLoot(recursive, { lootId: 'loot:recursive', seedParts: seed(1) }))
      .toThrow('loot_recursion_limit');
  });
});

describe('compiled loot behaviour handlers', () => {
  const tile = { spaceId: '0', x: 2, y: 3, tags: [] } as const;
  const actor = { entityType: 'player' as const, id: 'player' };

  function effects(
    definitionId: string,
    eventType: 'break' | 'use',
    registry = registerLootHandlers(),
  ) {
    const target = {
      entityType: (definitionId.startsWith('creature:') ? 'npc' : 'object') as 'npc' | 'object',
      id: '7', definitionId, tags: [], tile, state: {},
    };
    const event: LifecycleEvent = eventType === 'break'
      ? { type: 'break', actor, object: { entityType: 'object', id: '7', definitionId }, tool: { kind: 'axe' } }
      : { type: 'use', actor, target };
    const view = createReadOnlySnapshot({
      tick: 1n,
      registry: { engineVersion: 1, revision: 1n, contentHash: 'loot', definitions: {} },
      space: { id: '0', kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 0, season: 'spring' },
      actor: { ...actor, tags: [], tile, bronze: 0n, vitals: { hunger: 1, vigour: 1 }, inventory: [],
        worldRoles: [], homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {} },
      target,
      nearbyObjects: [],
    });
    const result = raiseEvent(registry, event, view);
    if ('blocked' in result) throw new Error(result.blocked);
    return result.effects;
  }

  it('registers deterministically and idempotently', () => {
    const once = registerLootHandlers(createHandlerRegistry());
    const twice = registerLootHandlers(once);
    expect(twice.registrations.map(({ id }) => id)).toEqual(once.registrations.map(({ id }) => id));
    expect(new Set(once.registrations.map(({ id }) => id)).size).toBe(LOOT_HANDLER_REGISTRATIONS.length);
  });

  it('dispatches ashwood break through the compiled resource registry', () => {
    expect(effects('resource:tree_ashwood', 'break')).toEqual([
      { rollLoot: { lootId: 'loot:resource_tree_ashwood' } },
    ]);
  });

  it('matches §11 row 16 wildlife and row 17 resource golden effects', () => {
    expect(effects('creature:cow', 'break')).toEqual([
      { rollLoot: { lootId: 'loot:wildlife_cow' } },
    ]);
    expect(effects('resource:tree_apple', 'break')).toEqual([
      { rollLoot: { lootId: 'loot:resource_tree_apple' } },
    ]);
    expect(effects('resource:loose_stone', 'use')).toEqual([
      { rollLoot: { lootId: 'loot:resource_loose_stone' } },
    ]);
  });

  it('registers renamed active wildlife by definition id and ignores retired originals', () => {
    const moonCow = {
      ...build.registry.creatures.get('creature:cow')!,
      id: 'creature:moon_cow' as const,
      loot: 'loot:wildlife_pig' as const,
      combat: { ...build.registry.creatures.get('creature:cow')!.combat, experience: 31 },
    };
    const registry = registerLootHandlers(
      createHandlerRegistry(),
      [],
      [{ ...build.registry.creatures.get('creature:cow')!, retired: true }, moonCow],
    );
    expect(effects('creature:cow', 'break', registry)).toEqual([]);
    expect(effects('creature:moon_cow', 'break', registry)).toEqual([
      { rollLoot: { lootId: 'loot:wildlife_pig' } },
    ]);
    expect(resolveWildlifeLoot(loots, moonCow, seed(1))).toEqual({
      drops: [{ itemKind: 'raw_pork', quantity: 3 }], flags: [], combatExperience: 31n,
    });
  });
});
