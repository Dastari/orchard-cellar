import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STUDIO_MAP_PATH, STUDIO_TERRAIN_LAB_PATH, studioMapId, studioObjectId } from './routes.js';

const mapModel = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
const mapCanvas = readFileSync(new URL('./canvas.ts', import.meta.url), 'utf8');
const mapController = readFileSync(new URL('./editor-controller.ts', import.meta.url), 'utf8');
const mapRenderer = readFileSync(new URL('./editor-renderer.ts', import.meta.url), 'utf8');
const objectModel = readFileSync(new URL('../object/model.ts', import.meta.url), 'utf8');
const objectCanvas = readFileSync(new URL('../object/canvas.ts', import.meta.url), 'utf8');
const shellConnection = readFileSync(new URL('../../shell/studio-connection.ts', import.meta.url), 'utf8');

describe('doc42 verification log in Orchard Studio', () => {
  it('maps canonical live-island, terrain-lab, procedural, and object routes', () => {
    expect(STUDIO_MAP_PATH).toBe('/build/map');
    expect(STUDIO_TERRAIN_LAB_PATH).toBe('/build/map/terrain-lab');
    expect(studioMapId('/build/map')).toBe('live-island');
    expect(studioMapId('/build/map/procedural-world')).toBe('procedural-world');
    expect(studioObjectId('/build/object/raven-sign')).toBe('raven-sign');
  });

  it('keeps the four Map workspaces, independent layers, generated suppression, scatter, history, and inspector seams', () => {
    expect(mapModel).toContain("['terrain', 'objects', 'biomes', 'scatter']");
    expect(mapModel).toContain('toggleLayer(');
    expect(mapModel).toContain('suppress_generated_object');
    expect(mapModel).toContain('generateMapScatter');
    expect(mapModel).toContain('undo(): void');
    expect(mapModel).toContain('this.services.inspector.inspect');
  });

  it('uses bounded retained actions, a clipped and culled canvas draw layer, and shell selection', () => {
    expect(mapCanvas).toContain('kit: parts.kit');
    expect(mapRenderer).toContain('visibleMapTileRange(document, viewport, camera)');
    expect(mapRenderer).toContain('drawTileRaster(context, overview, range, viewport, camera)');
    expect(mapController).toContain('this.model.selectObject(object.id)');
    expect(mapModel).toContain("entityKind: 'map-object'");
  });

  it('keeps Object Studio selection, marquee, collection, grouping, pivot, transform, layers, collision, and prefab export seams', () => {
    for (const token of ['marquee(', 'upsertTileObjectCollection', 'groupTileObject', 'setTileObjectPivot', 'transformTileObject', 'tileObjectToMapPrefab', 'upsertTileObjectCell']) {
      expect(objectModel).toContain(token);
    }
    expect(objectCanvas).toContain('model.select(piece.id)');
    expect(objectCanvas).toContain('model.group(');
    expect(objectCanvas).toContain('OBJECT_STUDIO_LAYERS');
  });

  it('uses one shell connection for CAS map publish and audited homestead movement', () => {
    expect(shellConnection).toContain('publishLiveMapDocument');
    expect(shellConnection).toContain('expectedRevision');
    expect(shellConnection).toContain('adminMoveHomestead');
    expect(shellConnection).toContain("row.definitionId === 'object:chest'");
    expect(shellConnection).not.toContain('tables.worldChest');
    expect(shellConnection).toContain('tables.worldCombatTarget');
    expect(shellConnection).toContain('tables.worldResource');
    expect(shellConnection).toContain('tables.worldSurface');
    expect(mapModel).toContain('live_map_conflict');
  });

  it('keeps active tools free of client, auth, binding, and independent connection imports', () => {
    for (const source of [mapModel, mapCanvas, objectModel, objectCanvas]) {
      expect(source).not.toMatch(/@orchard\/(?:client|auth|world-bindings)|legacy-map-live-connection/iu);
    }
  });
});
