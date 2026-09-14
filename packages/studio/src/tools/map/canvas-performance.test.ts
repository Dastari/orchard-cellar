import { createLiveIslandMapDocument } from '@orchard/sim';
import type { TerrainArray } from '@orchard/engine';
import { describe, expect, it } from 'vitest';
import type { MapEditorController } from './editor-controller.js';
import { selectedGeneratedMapDescriptor } from './canvas.js';
import { readFileSync } from 'node:fs';

type LiveMarkers = ReturnType<MapEditorController['liveMarkers']>;

describe('map canvas live-selection performance', () => {
  it('does not re-parse an unchanged authority head on movement redraws', () => {
    const source = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
    expect(source).toContain('if (head === this.#reconciledLiveHead) return');
  });

  it('reuses renderer terrain and never starts canonical compilation on a click', () => {
    const source = readFileSync(new URL('./canvas.ts', import.meta.url), 'utf8');
    expect(source).toContain('state.renderer.inspectionTerrain(state.model.terrainIdentity())');
    expect(source).toContain('renderedTerrain === null) return null');
    expect(source).not.toContain('compileMapDocument');
    expect(source).not.toContain('terrainArrayForMapDocument');
    expect(source).not.toContain('terrainDocumentForMapV3');
  });
  it('does not scan live overlays without a selected live entity', () => {
    const document = createLiveIslandMapDocument();
    let markerReads = 0;
    const forbiddenMarkers = new Proxy([] as unknown as LiveMarkers, {
      get() {
        markerReads += 1;
        throw new Error('live markers must remain untouched');
      },
    });

    expect(selectedGeneratedMapDescriptor(
      document,
      { kind: 'none' },
      forbiddenMarkers,
    )).toBeNull();
    expect(selectedGeneratedMapDescriptor(
      document,
      { kind: 'tile', spaceId: 0, tileX: 400, tileY: 400 },
      forbiddenMarkers,
    )).toBeNull();
    const landmark = document.landmarks[0]!;
    expect(selectedGeneratedMapDescriptor(
      document,
      { kind: 'entity', entityKind: 'map-object', id: landmark.id, spaceId: 0 },
      forbiddenMarkers,
    )).toBeNull();
    expect(markerReads).toBe(0);
  });

  it('resolves only the selected live entity into a semantic inspector descriptor', () => {
    const document = createLiveIslandMapDocument();
    const markers = [{
      id: '41', entityKind: 'resource', kind: 'tree', label: 'tree', spaceId: 0,
      tileX: 399, tileY: 400, elevation: null, layer: 'generated_base',
      worldX: 399 * 16 + 8, worldY: 401 * 16,
      footprint: { width: 1, height: 1 }, color: '#72c77a',
    }, {
      id: '42', entityKind: 'resource', kind: 'tree_apple', label: 'apple tree', spaceId: 0,
      tileX: 400, tileY: 400, elevation: null, layer: 'generated_base',
      worldX: 400 * 16 + 8, worldY: 401 * 16,
      footprint: { width: 1, height: 1 }, color: '#72c77a',
    }] as const satisfies LiveMarkers;

    expect(selectedGeneratedMapDescriptor(
      document,
      { kind: 'entity', entityKind: 'resource', id: '42', spaceId: 0 },
      markers,
    )).toMatchObject({
      entityKind: 'resource', id: '42', name: 'apple tree',
      tileX: 400, tileY: 400, layer: 'generated_base', runtimeKind: 'tree_apple',
      source: 'live-world:resource', provenance: 'live', suppressionId: 'resource-42',
    });
  });

  it('retains live chest state while keeping it unsuppressible and read-only', () => {
    const document = createLiveIslandMapDocument();
    const markers = [{
      id: '91', entityKind: 'chest', kind: 'chest', label: 'Chest', spaceId: 0,
      tileX: 401, tileY: 402, elevation: null, layer: 'player_owned',
      worldX: 401 * 16 + 8, worldY: 403 * 16,
      footprint: { width: 1, height: 1 }, color: '#d7a668', open: true, facing: 'left',
    }] as const satisfies LiveMarkers;
    const elevations = new Int16Array(document.width * document.height);
    elevations[402 * document.width + 401] = 3;
    const terrain = { width: document.width, height: document.height, elevations } as TerrainArray;

    expect(selectedGeneratedMapDescriptor(
      document,
      { kind: 'entity', entityKind: 'chest', id: '91', spaceId: 0 },
      markers,
      terrain,
    )).toMatchObject({
      entityKind: 'chest', runtimeKind: 'chest', layer: 'player_owned',
      elevation: 3, provenance: 'live', suppressionId: null,
      details: [{ label: 'Open', value: 'YES' }, { label: 'Facing', value: 'LEFT' }],
    });
  });
});
