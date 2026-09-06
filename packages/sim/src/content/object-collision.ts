import type { StateValue } from '../behaviour/effects.js';
import type { ObjectContentDefinition } from './object-definition.js';

/** Collision depends on the authored component, never on a container lid alone. */
export function resolveObjectCollision(
  definition: ObjectContentDefinition,
  state: Readonly<Record<string, StateValue>>,
): { readonly blocksMovement: boolean; readonly occludesLight: boolean } {
  const collision = definition.components.collision;
  return {
    blocksMovement: collision?.blocksMovement === true
      && (collision.when === undefined || state[collision.when.state] === collision.when.equals),
    occludesLight: collision?.occludesLight ?? false,
  };
}
