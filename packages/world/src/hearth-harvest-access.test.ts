import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { resourceHarvestResult } from './world-rules.js';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const registry = sim.bootstrapContentRegistry();
const names = ['hearthResourceSiteEnabled', 'requireHearthResourceHarvestAccess'];
const code = ts.transpileModule(names.map(name => {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(name);
  return node.getText(source);
}).join('\n') + '\nreturn requireHearthResourceHarvestAccess;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(index = 0) {
  const site = sim.HEARTH_RESOURCE_SITES[index]!;
  const resource = { ...site, spawnSiteId: BigInt(site.id), chunkX: Math.floor(site.tileX / 16), chunkY: Math.floor(site.tileY / 16),
    spaceId: 0, growthStage: 3, depleted: false };
  const player = { x: (site.tileX + .5) * sim.TILE_SIZE_FIXED, y: (site.tileY + 2) * sim.TILE_SIZE_FIXED, spaceId: 0 };
  const collision = { width: 832, height: 832, blocked: new Uint8Array(832 * 832),
    elevations: new Uint8Array(832 * 832).fill(site.elevation), obstacles: [] as sim.CollisionObstacle[] } satisfies sim.CollisionMap;
  const exclusions: bigint[] = [];
  const switches = { enabled: true, conflict: '', suppressed: false };
  let currentRegistry = registry;
  const ctx = { db: { outdoor_encounter: { id: { find: () => ({ conflict: switches.conflict }) } } } };
  const deps = { ...sim, contentRegistry: () => currentRegistry, TOPSIDE_SPACE_ID: 0, SenderError: Error,
    compiledLiveIslandRuntime: () => ({ combatPolicy: { allowsHostileDamage: () => switches.enabled } }),
    liveMapGeneratedResourceSuppressed: () => switches.suppressed, outdoorCollisionMap: (_ctx: unknown, id: bigint) => { exclusions.push(id); return collision; } };
  const check = new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { site, resource, player, collision, exclusions, switches, setRegistry: (next: typeof registry) => { currentRegistry = next; }, check: (row = resource, actor = player) => check(ctx, actor, row) };
}
it('admits each exact site with its matching tool and excludes only its own collision body', () => {
  for (const [index, site] of sim.HEARTH_RESOURCE_SITES.entries()) {
    const f = fixture(index); expect(() => f.check()).not.toThrow(); expect(f.exclusions).toEqual([site.id]);
    const tool = site.kind === 'tree_ashwood' ? 'axe' : 'pickaxe';
    const wrong = site.kind === 'tree_ashwood' ? 'pickaxe' : 'axe';
    expect(resourceHarvestResult(
      f.player.x, f.player.y, tool, f.resource, sim.runtimeToolDefinition(registry, tool), registry,
    )).toBe('ok');
    expect(resourceHarvestResult(
      f.player.x, f.player.y, wrong, f.resource, sim.runtimeToolDefinition(registry, wrong), registry,
    )).toBe('wrong_tool');
    expect(resourceHarvestResult(
      f.player.x, f.player.y, tool, { ...f.resource, depleted: true },
      sim.runtimeToolDefinition(registry, tool), registry,
    )).toBe('depleted');
  }
});
it('rejects wrong-plane players, thin fences on a swing and blocked player footprints', () => {
  const f = fixture(4);
  f.collision.elevations![Math.floor(f.player.y / sim.TILE_SIZE_FIXED) * 832 + f.site.tileX] = 0;
  expect(() => f.check()).toThrow('target_out_of_reach');
  const thin = fixture();
  const origin = sim.playerInteractionOrigin(thin.player);
  const target = sim.survivalResourceTargetPoint(origin.x, origin.y, thin.site.kind, thin.site.tileX, thin.site.tileY);
  const y = Math.floor((origin.y + target.y) / 2);
  thin.collision.obstacles.splice(0, thin.collision.obstacles.length, { left: origin.x - 20, right: origin.x + 20, top: y, bottom: y + 1 });
  expect(() => thin.check()).toThrow('target_out_of_reach');
  thin.collision.obstacles.splice(0, thin.collision.obstacles.length, { left: thin.player.x - 100, right: thin.player.x + 100, top: origin.y - 100, bottom: origin.y + 100 });
  expect(() => thin.check()).toThrow('target_out_of_reach');
});
it('rejects immature ashwood and conflicting site identity before building collision', () => {
  const f = fixture(2);
  expect(() => f.check({ ...f.resource, growthStage: 2 })).toThrow('resource_not_mature');
  expect(() => f.check({ ...f.resource, spawnSiteId: 0n })).toThrow('target_not_ready');
  expect(() => f.check(f.resource, { ...f.player, spaceId: 3 })).toThrow('target_not_ready');
  expect(f.exclusions).toEqual([]);
});

it('suspends harvest immediately when policy is removed, a camp conflicts or the resource is suppressed', () => {
  for (const changes of [{ enabled: false }, { conflict: 'combat_policy_removed' }, { suppressed: true }]) {
    const f = fixture(); Object.assign(f.switches, changes);
    expect(() => f.check()).toThrow('target_not_ready'); expect(f.exclusions).toEqual([]);
  }
});

it('suspends before collision/tool work when current content is retired and resumes without changing the resource', () => {
  const f = fixture(), before = structuredClone(f.resource);
  f.check(); f.exclusions.length = 0;
  const items = new Map(registry.items), material = items.get('item:basalt')!;
  items.set(material.id, { ...material, retired: true });
  f.setRegistry({ ...registry, items });
  expect(() => f.check()).toThrow('target_not_ready'); expect(f.exclusions).toEqual([]);
  expect(f.resource).toEqual(before);
  f.setRegistry(registry); expect(() => f.check()).not.toThrow(); expect(f.resource).toEqual(before);
});
