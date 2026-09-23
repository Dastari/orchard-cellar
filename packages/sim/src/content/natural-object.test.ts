import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';
import { naturalObjectId, naturalObjectProjections, resourceObjectDefinition, cropObjectDefinition } from './natural-object.js';
import { resolveObjectDefinitionAppearance } from './object-archetype.js';
const registry = bootstrapContentRegistry();
describe('natural object dual-read projections', () => {
  it('projects every resource and crop without changing durable content identities', () => {
    for (const source of [...registry.resources.values(), ...registry.crops.values()]) {
      expect(registry.objects.has(naturalObjectId(source.id))).toBe(true);
      expect(registry.definitions.get(source.id)).toBe(source);
    }
  });
  it('preserves stage artwork, scale, target and explicit tree lighting', () => {
    for (const resource of registry.resources.values()) {
      const object = resourceObjectDefinition(resource);
      const mature = resolveObjectDefinitionAppearance(object);
      expect(mature.sprite?.asset).toBe(resource.visual.asset);
      expect(mature.target).toEqual(resource.target.footprint);
      expect(mature.lighting.castsShadow).toBe(resource.visual.kind === 'tree' ? 'column' : 'silhouette');
      for (const stage of ['small', 'medium', 'depleted'] as const) {
        const visual = resource.visual.states?.[stage];
        if (visual === undefined) continue;
        const appearance = resolveObjectDefinitionAppearance(object, { stage });
        expect(appearance.sprite).toMatchObject({ asset: visual[0], scale: visual[1] / 1000 });
      }
    }
  });
  it('keeps crop artwork and authored overrides take precedence', () => {
    const crop = [...registry.crops.values()][0]!;
    const projected = cropObjectDefinition(crop);
    expect(projected.components.sprite?.asset).toBe(crop.asset);
    const authored = { ...projected, displayName: 'Authored replacement' };
    expect(naturalObjectProjections([], [crop], [authored])).toEqual([authored]);
  });
  it('refuses ambiguous natural aliases rather than depending on row order', () => {
    const resource = [...registry.resources.values()][0]!;
    const crop = { ...[...registry.crops.values()][0]!, id: `crop:${resource.id.slice('resource:'.length)}` as const };
    expect(() => naturalObjectProjections([resource], [crop], [])).toThrow('natural_object_alias_collision');
  });
});
