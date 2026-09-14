import resourcesJson from '../../../assets/content/resources.json' with { type: 'json' };
import {
  parseResourceDefinition,
  type ResourceContentDefinition,
} from './resource-definition.js';

function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeTree(child);
  }
  return value;
}

/** Dependency-safe fallback for deterministic generators. Live authority and
 * clients inject their active registry instead of consulting this projection. */
export const BOOTSTRAP_RESOURCE_DEFINITIONS: readonly ResourceContentDefinition[] = freezeTree(
  resourcesJson.map((value) => parseResourceDefinition(value)),
);

export const BOOTSTRAP_RESOURCE_REGISTRY: Readonly<{
  resources: ReadonlyMap<string, ResourceContentDefinition>;
}> = Object.freeze({
  resources: new Map(BOOTSTRAP_RESOURCE_DEFINITIONS.map((definition) => [definition.id, definition])),
});
