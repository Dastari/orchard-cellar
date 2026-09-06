import { describe, expect, it } from 'vitest';
import {
  inspectTerrainAtProjectedPoint,
  squashDuplicateTerrainInspectorLayers,
  terrainInspectionLines,
  terrainInspectionThumbnailHitAt,
  terrainInspectionThumbnailRects,
  terrainInspectionVisualLayout,
} from '@orchard/engine/terrain-inspector';
import type { TerrainArray } from '@orchard/engine/terrain';
import {
  createProceduralEditorPreview,
  generateProceduralEditorChunk,
  proceduralEditorWorldToLocalTile,
  recenterProceduralEditorPreview,
  terrainArrayForProceduralEditorPreview,
} from '@orchard/engine/editor/procedural-editor-preview';

function terrainFixture(): TerrainArray {
  const width = 4;
  const height = 7;
  const elevations = Int16Array.from([
    0, 1, 1, 0,
    0, 1, 1, 1,
    0, 0, 1, 1,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  return {
    spaceId: 0,
    seed: 1,
    version: 1,
    width,
    height,
    generator: 'island',
    biomes: new Uint8Array(width * height).fill(4),
    blocked: Array<boolean>(width * height).fill(false),
    horseJumpableTerrain: Array<boolean>(width * height).fill(false),
    elevations,
    raisedTerrainCollisionClassified: true,
    dirtCliffRoles: new Uint8Array(width * height),
    dirtTerraces: new Uint8Array(width * height),
  };
}

describe('terrain composition inspector', () => {
  it('reverses cliff projection and reports the exact internal draw order', () => {
    const inspection = inspectTerrainAtProjectedPoint(terrainFixture(), 40, 24, 0, true);
    expect(inspection.tileX).toBe(2);
    expect(inspection.layers.some(({ role }) => role.endsWith('_underlay'))).toBe(true);
    const underlay = inspection.layers.findIndex(({ role }) => role.endsWith('_underlay'));
    expect(inspection.layers[underlay + 1]?.asset).toBe('tile_cf_stone_cliff_variants');
    expect(terrainInspectionLines(inspection)).toContain('COMPOSED BACK -> FRONT');
  });

  it('reports collision independently from visual composition', () => {
    const inspection = inspectTerrainAtProjectedPoint(terrainFixture(), 8, 88, 0, false);
    expect(inspection.blocked).toBe(false);
    expect(terrainInspectionLines(inspection)[3]).toContain('OPEN');
  });

  it('reports cave contour frames from the cave wall atlas', () => {
    const terrain = {
      ...terrainFixture(),
      generator: 'cellar' as const,
      defaultCliffFamily: 'cave' as const,
    };
    const inspection = inspectTerrainAtProjectedPoint(terrain, 24, 8, 0, true);
    expect(inspection.layers.some(({ asset }) => asset === 'tile_cf_cave_wall')).toBe(true);
    expect(inspection.layers.every(({ asset }) => (
      asset !== 'tile_cf_stone_cliff_variants'
        && asset !== 'tile_cf_stone_cliff_inverse_overlay'
    ))).toBe(true);
  });

  it('collapses opaque ground coverage and omits an unsupported right-hand seam', () => {
    let preview = recenterProceduralEditorPreview(
      createProceduralEditorPreview({ seed: 2_098_878_576 }),
      -2,
      21,
    );
    preview = generateProceduralEditorChunk(preview, -2, 21);
    const terrain = terrainArrayForProceduralEditorPreview(preview);
    const local = proceduralEditorWorldToLocalTile(preview, -25, 339);
    const inspection = inspectTerrainAtProjectedPoint(
      terrain,
      (local.tileX + 0.5) * 16,
      (local.tileY + 0.5) * 16 - 3 * 16,
      3,
      true,
    );
    expect(inspection.layers.filter(({ asset }) => asset === 'ground_cache')).toHaveLength(1);
    expect(inspection.layers.map(({ role }) => role)).toEqual(['projected_surface']);
    expect(inspection.layers.some(({ role }) => role.endsWith('_underlay'))).toBe(false);
  });

  it('gives every stack tile a separate body and visibility hit target', () => {
    const inspection = inspectTerrainAtProjectedPoint(terrainFixture(), 24, 8, 0, true);
    const rects = terrainInspectionThumbnailRects(inspection, 100, 200);
    expect(rects).toHaveLength(inspection.layers.length);
    expect(rects[0]?.visibilityToggle).toMatchObject({ width: 10, height: 10 });
    expect(rects[1]!.x).toBeGreaterThan(rects[0]!.x + rects[0]!.width);
    expect(terrainInspectionVisualLayout(inspection).width).toBeGreaterThanOrEqual(190);
    const layout = terrainInspectionVisualLayout(inspection);
    const lastRect = rects.at(-1)!;
    expect(200 + layout.height - (lastRect.y + lastRect.height)).toBeGreaterThanOrEqual(12);
    expect(terrainInspectionThumbnailHitAt(
      rects,
      rects[1]!.x + 2,
      rects[1]!.y + 12,
    )).toEqual({ index: 1, target: 'layer' });
    expect(terrainInspectionThumbnailHitAt(
      rects,
      rects[1]!.visibilityToggle.x + 2,
      rects[1]!.visibilityToggle.y + 2,
    )).toEqual({ index: 1, target: 'visibility' });
    expect(terrainInspectionLines(inspection, 1)).toEqual(expect.arrayContaining([
      `SELECTED #2 ${inspection.layers[1]!.asset}`,
      `   FRAME ${inspection.layers[1]!.frame ?? '-'} / ROLE ${inspection.layers[1]!.role}`,
    ]));
  });

  it('expands an open cellar ground-cache tile into its named source layers', () => {
    const width = 16;
    const height = 16;
    const terrain: TerrainArray = {
      ...terrainFixture(),
      spaceId: 30_001,
      seed: 42,
      width,
      height,
      generator: 'cellar',
      defaultCliffFamily: 'cave',
      biomes: new Uint8Array(width * height).fill(4),
      blocked: Array<boolean>(width * height).fill(false),
      horseJumpableTerrain: Array<boolean>(width * height).fill(false),
      elevations: new Int16Array(width * height),
      dirtCliffRoles: new Uint8Array(width * height),
      dirtTerraces: new Uint8Array(width * height),
    };
    const inspection = inspectTerrainAtProjectedPoint(terrain, 8.5 * 16, 8.5 * 16, 0, false);
    expect(inspection.layers[0]).toMatchObject({
      asset: 'tile_cf_cave_floor_middle',
      frame: 0,
      role: 'base_ground',
    });
    expect(inspection.layers.every(({ asset }) => asset !== 'ground_cache')).toBe(true);
    expect(inspection.layers.every(({ asset }) => asset !== 'tile_cf_cave_floor_stalagmite')).toBe(true);
  });

  it('squashes exact same-position tile frames while retaining distinct stack art', () => {
    const inspection = inspectTerrainAtProjectedPoint(terrainFixture(), 24, 8, 0, true);
    const source = inspection.layers[0]!;
    const duplicate = { ...source, role: `${source.role}_duplicate`, contourLevel: 99 };
    const distinct = { ...source, frame: (source.frame ?? 0) + 1, role: 'distinct_frame' };
    expect(squashDuplicateTerrainInspectorLayers([source, distinct, duplicate]))
      .toEqual([distinct, duplicate]);
  });
});
