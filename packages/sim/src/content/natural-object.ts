import type { ObjectContentDefinition } from './object-definition.js';
import type { ObjectStateOverride } from './object-archetype.js';
import type { ResourceContentDefinition } from './resource-definition.js';
import type { CropContentDefinition } from './world-definition.js';

const compatibilityObjects = new WeakSet<ObjectContentDefinition>();
function compatibilityObject(definition: ObjectContentDefinition): ObjectContentDefinition {
  compatibilityObjects.add(definition);
  return definition;
}
/** Runtime-only projections must not compete in legacy authored furniture
 * catalogues. An explicitly authored replacement is never marked compatible. */
export function isNaturalObjectProjection(definition: ObjectContentDefinition): boolean {
  return compatibilityObjects.has(definition);
}

/** Stable dual-read alias. Source rows and their original definition ids remain
 * durable until a separately verified retirement migration. */
export function naturalObjectId(id: `resource:${string}` | `crop:${string}`): `object:${string}` {
  return `object:${id.slice(id.indexOf(':') + 1)}`;
}

export function resourceObjectDefinition(resource: ResourceContentDefinition): ObjectContentDefinition {
  const variants = resource.visual.states;
  const overrides: ObjectStateOverride[] = [];
  for (const [stage, visual] of Object.entries({
    small: variants?.small, medium: variants?.medium, depleted: variants?.depleted,
    depleted_small: variants?.depletedSmall ?? variants?.depleted,
    depleted_medium: variants?.depletedMedium ?? variants?.depleted,
  })) if (visual !== undefined) overrides.push({ when: { stage }, sprite: { asset: visual[0], scale: visual[1] / 1000 } });
  // This legacy compatibility is authored into the projection once, not inferred
  // by the painter. Newly authored objects declare their own fruitless state.
  if (resource.visual.kind === 'tree' && ['tree_apple', 'tree_pear', 'tree_peach', 'tree_cherry'].includes(resource.visual.asset)) {
    overrides.push({ when: { stage: 'fruitless' }, sprite: { asset: 'tree_cf_fruit_mature' } });
  }
  return compatibilityObject({ id: naturalObjectId(resource.id), kind: 'object', schemaVersion: 1,
    displayName: resource.displayName, ...(resource.retired === undefined ? {} : { retired: resource.retired }),
    components: {
      identity: { tags: resource.tags },
      sprite: { asset: resource.visual.asset },
      states: { stage: { type: 'enum', default: 'mature', values: ['small', 'medium', 'mature', 'fruitless', 'depleted', 'depleted_small', 'depleted_medium'] } },
      overrides,
      collision: { footprint: [[15]], blocksMovement: resource.collision.blocksMovement, occludesLight: resource.collision.blocksMovement },
      target: { rect: resource.target.footprint },
      lighting: { receivesGlobal: true, castsShadow: resource.visual.kind === 'tree' ? 'column' : 'silhouette', occludesLight: resource.collision.blocksMovement },
    } });
}

export function cropObjectDefinition(crop: CropContentDefinition): ObjectContentDefinition {
  return compatibilityObject({ id: naturalObjectId(crop.id), kind: 'object', schemaVersion: 1,
    displayName: crop.displayName, ...(crop.retired === undefined ? {} : { retired: crop.retired }),
    components: {
      sprite: { asset: crop.asset },
      states: { stage: { type: 'counter', default: 0, min: 0, max: 3 }, watered: { type: 'bool', default: false } },
      collision: { footprint: [[0]], blocksMovement: false, occludesLight: false },
      lighting: { receivesGlobal: true, castsShadow: 'none', occludesLight: false },
    } });
}

/** Explicit object content always wins. Reject resource/crop alias collisions;
 * choosing by array order would silently redirect a persisted identity. */
export function naturalObjectProjections(
  resources: readonly ResourceContentDefinition[], crops: readonly CropContentDefinition[],
  authored: readonly ObjectContentDefinition[],
): readonly ObjectContentDefinition[] {
  const authoredIds = new Set(authored.map(d => d.id));
  const projected = new Map<string, ObjectContentDefinition>();
  for (const object of [...resources.map(resourceObjectDefinition), ...crops.map(cropObjectDefinition)]) {
    if (authoredIds.has(object.id)) continue;
    if (projected.has(object.id)) throw new Error(`natural_object_alias_collision:${object.id}`);
    projected.set(object.id, object);
  }
  return [...projected.values(), ...authored];
}

/** Legacy visual ids predate native atlas ids. Kept only in the compatibility
 * adapter so generic map shadows can bind the canonical object projection. */
export const NATURAL_OBJECT_ASSET_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  tree_oak: 'tree_cf_oak_mature', tree_birch: 'tree_cf_birch_mature', tree_spruce: 'tree_cf_spruce_mature',
  tree_acacia: 'tree_cf_acacia_mature', tree_palm: 'tree_cf_palm_mature', cactus: 'resource_cf_cactus',
  tree_apple: 'tree_cf_apple_fruiting', tree_pear: 'tree_cf_pear_fruiting',
  tree_peach: 'tree_cf_peach_fruiting', tree_cherry: 'tree_cf_cherry_fruiting',
  tree_sapling: 'tree_cf_fruit_small', tree_young: 'tree_cf_fruit_medium',
  tree_oak_sapling: 'tree_cf_oak_sapling', tree_oak_young: 'tree_cf_oak_young',
  tree_birch_sapling: 'tree_cf_birch_sapling', tree_birch_young: 'tree_cf_birch_young',
  tree_spruce_sapling: 'tree_cf_spruce_sapling', tree_spruce_young: 'tree_cf_spruce_young',
  tree_stump_small: 'tree_cf_oak_stump_small', tree_stump_medium: 'tree_cf_oak_stump_medium', tree_stump: 'tree_cf_oak_stump',
  tree_birch_stump_small: 'tree_cf_birch_stump_small', tree_birch_stump_medium: 'tree_cf_birch_stump_medium', tree_birch_stump: 'tree_cf_birch_stump',
  tree_spruce_stump_small: 'tree_cf_spruce_stump_small', tree_spruce_stump_medium: 'tree_cf_spruce_stump_medium', tree_spruce_stump: 'tree_cf_spruce_stump',
  tree_fruit_stump_small: 'tree_cf_fruit_stump_small', tree_fruit_stump_medium: 'tree_cf_fruit_stump_medium', tree_fruit_stump: 'tree_cf_fruit_stump',
  tree_acacia_stump: 'tree_cf_acacia_stump', tree_palm_stump: 'tree_cf_palm_stump',
});
