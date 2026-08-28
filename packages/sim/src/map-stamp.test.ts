import { describe, expect, it } from 'vitest';
import {
  createMapStampDocument,
  parseMapStampDocument,
  removeMapStampPlacement,
  serializeMapStampDocument,
  upsertMapStampPlacement,
  type MapStampPlacement,
} from './map-stamp.js';

const tent: MapStampPlacement = {
  id: 'tent-1',
  assetId: 2_641_585_496,
  assetName: 'prop_cf_camp_tent',
  visual: { kind: 'state', name: 'base', frameIndex: 0 },
  tileX: 12,
  tileY: 9,
  elevation: 0,
  layer: 'object',
  quarterTurns: 0,
  flipX: false,
};

describe('map stamp documents', () => {
  it('round-trips semantic placements without atlas coordinates', () => {
    const document = upsertMapStampPlacement(createMapStampDocument({
      id: 'orchard-camp', title: 'Orchard Camp', assetRegistryRevision: 'atlas-r1',
    }), tent);
    const serialized = serializeMapStampDocument(document);
    expect(serialized).not.toContain('atlasX');
    expect(serialized).not.toContain('sourceRect');
    expect(parseMapStampDocument(serialized)).toEqual(document);
  });

  it('increments revisions only for actual placement changes', () => {
    const empty = createMapStampDocument();
    const placed = upsertMapStampPlacement(empty, tent);
    expect(upsertMapStampPlacement(placed, tent)).toBe(placed);
    expect(removeMapStampPlacement(placed, 'missing')).toBe(placed);
    expect(removeMapStampPlacement(placed, tent.id)).toMatchObject({ revision: 2, placements: [] });
  });

  it('rejects out-of-bounds placements and duplicate instance ids', () => {
    const serialized = serializeMapStampDocument({
      ...createMapStampDocument({ width: 4, height: 4 }),
      placements: [{ ...tent, tileX: 4 }],
    });
    expect(() => parseMapStampDocument(serialized)).toThrow('placement is invalid');

    const duplicate = serializeMapStampDocument({
      ...createMapStampDocument(), placements: [tent, { ...tent }],
    });
    expect(() => parseMapStampDocument(duplicate)).toThrow('ids must be unique');
  });
});
