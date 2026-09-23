import { resolveObjectDefinitionAppearance } from './object-archetype.js';
import type { StateValue } from '../behaviour/effects.js';
import type { ObjectContentDefinition } from './object-definition.js';

/** Collision depends on the authored component, never on a container lid alone. */
export function resolveObjectCollision(
  definition: ObjectContentDefinition,
  state: Readonly<Record<string, StateValue>>,
): { readonly blocksMovement: boolean; readonly occludesLight: boolean } {
  const appearance = resolveObjectDefinitionAppearance(definition, state);
  return {
    blocksMovement: appearance.collision?.blocksMovement ?? false,
    occludesLight: appearance.lighting.occludesLight,
  };
}
