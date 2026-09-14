import { describe, expect, it } from 'vitest';
import { bootstrapContentRows, bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import {
  activeHearthResourceSites,
  runtimeHearthResourceDefinition,
  runtimeHearthResourceRowMatchesSite,
  runtimeHearthResourceSite,
} from './hearth-resource-sites.js';
import { hearthGatheringContentReady } from './hearth-resource-content.js';

const base = bootstrapContentRegistry();

describe('authored Hearth fixed resource sites', () => {
  it('projects all stable site IDs and canonical mechanics from resource content', () => {
    const sites = activeHearthResourceSites(base);
    expect(sites).toHaveLength(6);
    expect(sites.map(({ id }) => id)).toEqual([
      8_600_000_001n, 8_600_000_002n, 8_600_000_003n,
      8_600_000_004n, 8_600_000_005n, 8_600_000_006n,
    ]);
    expect(sites.find(({ id }) => id === 8_600_000_001n)).toMatchObject({
      definitionId: 'resource:rock_basalt', health: 2, richness: 2, nodeClass: 'rock',
      encounterDefinitionId: 'encounter:cinder_ash_shore', encounterId: 'cinder-ash-shore',
    });
    expect(sites.find(({ id }) => id === 8_600_000_003n)).toMatchObject({
      definitionId: 'resource:tree_ashwood', health: 3, richness: 0,
      maturityGrowthStage: 3, regrowthProgress: 24,
    });
  });

  it('keeps stable sites and runtime kinds when the authored resource ID is arbitrarily renamed', () => {
    const rows = bootstrapContentRows();
    const original = rows.find(({ id }) => id === 'resource:tree_ashwood')!;
    const payload = JSON.parse(original.json as string) as Record<string, unknown>;
    const renamed = { ...payload, id: 'resource:moon_ash' };
    const built = buildContentRegistry([
      ...rows.filter(({ id }) => id !== original.id),
      { id: 'resource:moon_ash', kind: 'resource', slug: 'moon_ash', json: renamed },
    ]);
    expect(built.report.errors).toEqual([]);
    const site = runtimeHearthResourceSite(built.registry, 8_600_000_003n)!;
    expect(site).toMatchObject({ definitionId: 'resource:moon_ash', kind: 'tree_ashwood' });
    const row = {
      ...site, definitionId: site.definitionId, spawnSiteId: site.id, spaceId: 0,
      chunkX: Math.floor(site.tileX / 16), chunkY: Math.floor(site.tileY / 16),
    };
    expect(runtimeHearthResourceRowMatchesSite(built.registry, row)).toBe(true);
    expect(runtimeHearthResourceDefinition(built.registry, row)?.id).toBe('resource:moon_ash');
    expect(hearthGatheringContentReady(built.registry)).toBe(true);
  });

  it('fails neutral for retired, missing, conflicting, or encounter-orphaned definitions', () => {
    const ash = base.resources.get('resource:tree_ashwood')!;
    const withoutAsh = new Map(base.resources); withoutAsh.delete(ash.id);
    const missing = { ...base, resources: withoutAsh };
    expect(runtimeHearthResourceSite(missing, 8_600_000_003n)).toBeNull();

    const retiredResources = new Map(base.resources);
    retiredResources.set(ash.id, { ...ash, retired: true });
    const retired = { ...base, resources: retiredResources };
    expect(runtimeHearthResourceSite(retired, 8_600_000_003n)).toBeNull();
    expect(hearthGatheringContentReady(retired)).toBe(false);

    const encounters = new Map(base.encounters);
    const shore = encounters.get('encounter:cinder_ash_shore')!;
    encounters.set(shore.id, { ...shore, retired: true });
    const orphaned = { ...base, encounters };
    expect(activeHearthResourceSites(orphaned)).toHaveLength(4);
    expect(hearthGatheringContentReady(orphaned)).toBe(false);
  });

  it('rejects malformed, duplicate, and unresolved fixed-site authority metadata', () => {
    const rows = bootstrapContentRows();
    const source = rows.find(({ id }) => id === 'resource:ore_cinder')!;
    const payload = JSON.parse(source.json as string) as {
      interaction: { tool: Record<string, unknown> };
      fixedSites: [string, number, number, number, string][];
    } & Record<string, unknown>;
    const replace = (json: unknown) => rows.map((row) => row.id === source.id ? { ...row, json } : row);

    const missingTool = structuredClone(payload);
    delete missingTool.interaction.tool.baselineItem;
    expect(buildContentRegistry(replace(missingTool)).report.errors).toContainEqual(expect.objectContaining({
      definitionId: source.id, path: 'interaction.tool.baselineItem',
    }));

    const malformed = structuredClone(payload);
    malformed.fixedSites[0]![0] = '0';
    expect(buildContentRegistry(replace(malformed)).report.errors).toContainEqual(expect.objectContaining({
      definitionId: source.id, code: 'parse_error',
    }));

    const duplicate = structuredClone(payload);
    duplicate.fixedSites[0]![0] = '8600000001';
    expect(buildContentRegistry(replace(duplicate)).report.errors).toContainEqual(expect.objectContaining({
      path: 'fixedSites[0][0]', message: expect.stringContaining('fixed site 8600000001'),
    }));

    const orphaned = structuredClone(payload);
    orphaned.fixedSites[0]![4] = 'encounter:not_authored';
    expect(buildContentRegistry(replace(orphaned)).report.errors).toContainEqual(expect.objectContaining({
      definitionId: source.id, path: 'fixedSites[0][4]', code: 'unresolved_reference',
    }));
  });
});
