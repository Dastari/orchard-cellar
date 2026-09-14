import { describe, expect, it } from 'vitest';
import spacesJson from '../../../assets/content/spaces.json' with { type: 'json' };
import type { ContentRegistry } from './registry.js';
import { parseSpaceContentDefinition, type SpaceContentDefinition } from './world-definition.js';
import { runtimeSpaceSurfaceDefinition, runtimeSpaceSurfaceObstacle } from './runtime.js';
import { validateContentDefinitions } from './validate.js';
import { TILE_SIZE_FIXED } from '../state.js';

const rawTent = (spacesJson as readonly Record<string, unknown>[])
  .find((space) => space.id === 'space:marlow_tent')!;
const tent = parseSpaceContentDefinition(rawTent);
const table = tent.surfaces![0]!;
const row = {
  id: BigInt(table.id), kind: table.kind, tileX: table.tileX, tileY: table.tileY,
  capacity: table.capacity, spaceId: tent.spaceId,
};

function registryWith(spaces: readonly SpaceContentDefinition[]): ContentRegistry {
  return { spaces: new Map(spaces.map((space) => [space.id, space])) } as unknown as ContentRegistry;
}

describe('active authored static surface geometry', () => {
  it('preserves the canonical three-by-one Marlow table footprint', () => {
    const registry = registryWith([tent]);
    expect(runtimeSpaceSurfaceDefinition(registry, row)).toEqual(table);
    expect(runtimeSpaceSurfaceObstacle(registry, row)).toEqual({
      left: (table.tileX - 1) * TILE_SIZE_FIXED,
      top: table.tileY * TILE_SIZE_FIXED,
      right: (table.tileX + 2) * TILE_SIZE_FIXED - 1,
      bottom: (table.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
    expect(table.capacity).toBe(4);
  });

  it('retains geometry when the surface kind and space definition id are renamed', () => {
    const renamedSurface = { ...table, kind: 'archivist_workbench' };
    const renamed: SpaceContentDefinition = {
      ...tent,
      id: 'space:canvas_archive',
      surfaces: [renamedSurface],
    };
    const renamedRow = { ...row, kind: renamedSurface.kind };
    expect(runtimeSpaceSurfaceObstacle(registryWith([renamed]), renamedRow))
      .toEqual(runtimeSpaceSurfaceObstacle(registryWith([tent]), row));
  });

  it('fails closed for missing, retired, ambiguous, and stale definitions', () => {
    expect(runtimeSpaceSurfaceDefinition(registryWith([]), row)).toBeNull();
    expect(runtimeSpaceSurfaceDefinition(registryWith([{ ...tent, retired: true }]), row)).toBeNull();
    expect(runtimeSpaceSurfaceDefinition(registryWith([
      tent, { ...tent, id: 'space:duplicate_canvas_room' },
    ]), row)).toBeNull();
    expect(runtimeSpaceSurfaceDefinition(registryWith([tent]), { ...row, kind: 'stale_kind' })).toBeNull();
    expect(runtimeSpaceSurfaceDefinition(registryWith([tent]), { ...row, tileX: row.tileX + 1 })).toBeNull();
    expect(runtimeSpaceSurfaceDefinition(registryWith([tent]), { ...row, capacity: row.capacity + 1 })).toBeNull();
  });

  it('requires a bounded ordered authored footprint', () => {
    const surface = (rawTent.surfaces as readonly Record<string, unknown>[])[0]!;
    const withoutFootprint = { ...surface };
    delete withoutFootprint.footprint;
    expect(() => parseSpaceContentDefinition({ ...rawTent, surfaces: [withoutFootprint] }))
      .toThrow(/footprint/u);
    expect(() => parseSpaceContentDefinition({
      ...rawTent, surfaces: [{ ...surface, footprint: [1, 0, -1, 0] }],
    })).toThrow(/ordered/u);
    expect(validateContentDefinitions([{
      ...tent,
      surfaces: [{ ...table, footprint: [-table.tileX - 1, 0, 1, 0] }],
    }]).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'surfaces[0].footprint' }),
    ]));
  });
});
