import { placeableObjectDefinition, type ContentRegistry, type PlaceableContentReference,
  type ObjectContentDefinition, type StateValue } from '@orchard/sim';

/** Optional contextual input must have both a subscribed authority row and an
 * active authored callback. This is metadata selection, not callback execution:
 * actor conditions, reach and all effects remain server decisions. */
export function objectSecondaryTarget<T>(
  target: T | null | undefined,
  definition: ObjectContentDefinition | null | undefined,
  state: Readonly<Record<string, StateValue>>,
): T | null {
  if (target == null || definition == null || definition.retired === true) return null;
  return definition.components.interactions?.some((interaction) => (
    interaction.verb === 'secondary'
    && interaction.conditions.every((condition) => !('state' in condition)
      || state[condition.state] === condition.equals)
  )) === true ? target : null;
}

/** Code-free use metadata. Target state selects the authored branch; reach,
 * actor permissions, inventory and effect execution remain server decisions. */
export function objectUsePrompt(
  registry: Pick<ContentRegistry, 'objects'>,
  reference: PlaceableContentReference,
  state: Readonly<Record<string, StateValue>>,
): string | null {
  const definition = placeableObjectDefinition(registry, reference);
  const interaction = [...definition?.components.interactions ?? []]
    .filter((candidate) => candidate.verb === 'use'
      && candidate.conditions.every((condition) => !('state' in condition)
        || state[condition.state] === condition.equals))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0)
      || left.id.localeCompare(right.id))[0];
  if (interaction === undefined) return null;
  if (typeof interaction.prompt === 'string') return interaction.prompt;
  if (interaction.prompt !== undefined) {
    for (const [key, value] of Object.entries(state)) {
      if (value === true && interaction.prompt[key] !== undefined) return interaction.prompt[key]!;
    }
    if (interaction.prompt.default !== undefined) return interaction.prompt.default;
  }
  return `USE ${definition!.displayName.toUpperCase()}`;
}
