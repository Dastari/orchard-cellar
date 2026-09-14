import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';
import { runtimeLandmarkPlaceablePlans } from './runtime.js';
import type { ContentRegistry } from './registry.js';
import type { SpaceContentDefinition } from './world-definition.js';

function renamedRegistry(): ContentRegistry {
  const base = bootstrapContentRegistry();
  const original = base.objects.get('object:farmer_jane_memorial')!;
  const renamedObject = { ...original, id: 'object:moonlit_memorial' as const };
  const objects = new Map(base.objects);
  objects.delete(original.id);
  objects.set(renamedObject.id, renamedObject);
  const spaces = new Map(base.spaces);
  const topside = [...spaces.values()].find((space) => space.spaceId === 0)!;
  spaces.set(topside.id, {
    ...topside,
    landmarks: topside.landmarks!.map((landmark) => landmark.id !== 'farmer_bob_farm' ? landmark : {
      ...landmark,
      id: 'renamed_moonlit_orchard',
      decorations: landmark.decorations.map((rule) => rule.kind !== 'point'
        || rule.placeable?.object !== original.id ? rule : {
          ...rule, decorationKind: 'renamed_moon_grave',
          placeable: { ...rule.placeable, object: renamedObject.id },
        }),
    }),
  });
  return { ...base, objects, spaces };
}

describe('authored landmark placeable plans', () => {
  it('binds the memorial to its stable generated row and active object interaction', () => {
    const plans = runtimeLandmarkPlaceablePlans(bootstrapContentRegistry());
    expect(plans.find(({ runtimeId }) => runtimeId === 3100000138n)).toMatchObject({
      landmarkId: 'farmer_bob_farm', objectDefinitionId: 'object:farmer_jane_memorial',
      spaceId: 0, tileX: 390, tileY: 371,
    });
  });

  it('survives renamed landmark, decoration and object identities', () => {
    expect(runtimeLandmarkPlaceablePlans(renamedRegistry()).find(
      ({ runtimeId }) => runtimeId === 3100000138n,
    )).toMatchObject({
      landmarkId: 'renamed_moonlit_orchard', objectDefinitionId: 'object:moonlit_memorial',
      tileX: 390, tileY: 371,
    });
  });

  it('fails neutral for missing, retired, mismatched and multiply claimed authority', () => {
    const renamed = renamedRegistry();
    const target = renamed.objects.get('object:moonlit_memorial')!;
    const missing = { ...renamed, objects: new Map(renamed.objects) };
    missing.objects.delete(target.id);
    expect(runtimeLandmarkPlaceablePlans(missing).some(({ runtimeId }) => runtimeId === 3100000138n)).toBe(false);
    const retired = { ...renamed, objects: new Map(renamed.objects) };
    retired.objects.set(target.id, { ...target, retired: true });
    expect(runtimeLandmarkPlaceablePlans(retired).some(({ runtimeId }) => runtimeId === 3100000138n)).toBe(false);

    const spaces = new Map(renamed.spaces);
    const topside = [...spaces.values()].find((space) => space.spaceId === 0)!;
    spaces.set(topside.id, { ...topside, landmarks: topside.landmarks!.map((landmark) => ({
      ...landmark,
      decorations: landmark.decorations.map((rule) => rule.kind === 'point'
        && rule.placeable?.object === target.id
        ? { ...rule, placeable: { ...rule.placeable, runtimeId: '3100000139' } } : rule),
    })) });
    expect(runtimeLandmarkPlaceablePlans({ ...renamed, spaces })
      .some(({ runtimeId }) => runtimeId === 3100000138n)).toBe(false);

    const duplicateSpace: SpaceContentDefinition = {
      ...topside, id: 'space:renamed_duplicate', spaceId: 99,
    };
    const ambiguousSpaces = new Map(renamed.spaces);
    ambiguousSpaces.set(duplicateSpace.id, duplicateSpace);
    expect(runtimeLandmarkPlaceablePlans({ ...renamed, spaces: ambiguousSpaces })
      .some(({ runtimeId }) => runtimeId === 3100000138n)).toBe(false);
  });
});
