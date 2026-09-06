import { describe, expect, it } from 'vitest';
import {
  applyMapDocumentV3Edit,
  createEmptyMapDocument,
  createMapPrefabDocument,
  generateMapScatter,
  migrateMapDocumentV2,
} from './index.js';

function fixture() {
  let document = migrateMapDocumentV2(createEmptyMapDocument({
    id: 'scatter', title: 'Scatter', width: 20, height: 20,
  }));
  document = applyMapDocumentV3Edit(document, {
    kind: 'embed_prefab', prefab: createMapPrefabDocument({ id: 'oak-tree', title: 'Oak Tree' }),
  }).document;
  return document;
}

describe('map procedural scatter', () => {
  it('is deterministic, biome-aware, spaced, and commits as one revision', () => {
    const document = applyMapDocumentV3Edit(fixture(), {
      kind: 'paint_biome',
      biome: 'forest',
      points: Array.from({ length: 100 }, (_, index) => ({ tileX: index % 10, tileY: Math.floor(index / 10) })),
    }).document;
    const request = {
      seed: 42,
      points: Array.from({ length: 400 }, (_, index) => ({ tileX: index % 20, tileY: Math.floor(index / 20) })),
      palette: [{ prefabId: 'oak-tree', weight: 1 }],
      density: 10_000,
      minimumSpacing: 2,
      allowedBiomes: ['forest'] as const,
      allowedSurfaces: ['grass'] as const,
      layer: 'objects' as const,
      randomFlipX: true,
    };
    const first = generateMapScatter(document, request);
    expect(generateMapScatter(document, request)).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((object) => object.tileX < 10 && object.tileY < 10)).toBe(true);
    const edited = applyMapDocumentV3Edit(document, { kind: 'place_objects', objects: first }).document;
    expect(edited.revision).toBe(document.revision + 1);
    expect(edited.objects).toHaveLength(first.length);
  });

  it('rejects missing prefabs before producing a partial result', () => {
    expect(() => generateMapScatter(fixture(), {
      seed: 9,
      points: [{ tileX: 1, tileY: 1 }],
      palette: [{ prefabId: 'missing', weight: 1 }],
      density: 10_000,
      minimumSpacing: 0,
      layer: 'objects',
    })).toThrow('prefab is unavailable');
  });
});
