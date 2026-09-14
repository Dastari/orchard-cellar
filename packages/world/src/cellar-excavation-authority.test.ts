import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function sourceBetween(startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('cellar excavation authority', () => {
  it('persists sparse public excavations while keeping partial damage private', () => {
    const schema = sourceBetween('const cellar_excavation = table(', 'const world_resource = table(');
    expect(schema).toContain("name: 'cellar_excavation'");
    expect(schema).toContain('public: true');
    expect(schema).toContain("accessor: 'by_chunk'");
    expect(schema).toContain("name: 'cellar_dig_progress'");
    expect(schema).not.toMatch(/name: 'cellar_dig_progress'[\s\S]*public: true/);
  });

  it('requires an exposed cellar wall and a usable pickaxe on every strike', () => {
    const reducer = sourceBetween('function applyDigCellarTileLifecycle(', 'function applyHarvestResourceLifecycle(');
    expect(reducer).toContain("definition?.generator !== 'cellar'");
    expect(reducer).toContain('requireWorldModificationAuthorized(ctx, position)');
    expect(reducer).toContain("runtimeToolSpecialization(registry, slot.itemKind) !== 'mining'");
    expect(reducer).toContain('const registry = contentRegistry(ctx)');
    expect(reducer).toContain('cellarTileIsDug(ctx, position.spaceId');
    expect(reducer).toContain('CELLAR_WALL_TOOL_WEAR');
  });

  it('opens terrain, drops a stone heap, and reveals only the excavated ore tile', () => {
    const reducer = sourceBetween('function applyDigCellarTileLifecycle(', 'function applyHarvestResourceLifecycle(');
    expect(reducer).toContain('ctx.db.cellar_excavation.insert');
    expect(reducer).toContain('cellarWallHitsRequired');
    expect(reducer).toContain('cellarWallStoneQuantity');
    expect(reducer).toContain('runtimeItemKindForUniqueTag(registry, CELLAR_WALL_OUTPUT_ITEM_TAG)');
    expect(reducer).toContain('itemKind: wallOutputKind!');
    expect(reducer).not.toContain("itemKind: 'pebble'");
    expect(reducer).toContain('cellarOreKindAt(seed, position.spaceId, tileX, tileY)');
    expect(reducer).toContain('ctx.db.world_resource.insert');
    expect(source).toContain('cellarExcavationAnchorsAffectingTile(');
  });
});
