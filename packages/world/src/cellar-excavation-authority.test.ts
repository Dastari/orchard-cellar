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
    const reducer = sourceBetween('export const digCellarTile =', 'export const harvestResource =');
    expect(reducer).toContain("definition?.generator !== 'cellar'");
    expect(reducer).toContain('requireWorldModificationAuthorized(ctx, position)');
    expect(reducer).toContain("slot.itemKind !== 'pickaxe'");
    expect(reducer).toContain('cellarTileIsDug(ctx, position.spaceId');
    expect(reducer).toContain('CELLAR_WALL_TOOL_WEAR');
  });

  it('opens terrain, drops a stone heap, and reveals only the excavated ore tile', () => {
    const reducer = sourceBetween('export const digCellarTile =', 'export const harvestResource =');
    expect(reducer).toContain('ctx.db.cellar_excavation.insert');
    expect(reducer).toContain('cellarWallHitsRequired');
    expect(reducer).toContain('cellarWallStoneQuantity');
    expect(reducer).toContain("itemKind: 'stone'");
    expect(reducer).toContain('cellarOreKindAt(seed, position.spaceId, tileX, tileY)');
    expect(reducer).toContain('ctx.db.world_resource.insert');
  });
});
