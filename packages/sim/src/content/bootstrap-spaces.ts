import spacesJson from '../../../assets/content/spaces.json' with { type: 'json' };
import {
  parseSpaceContentDefinition,
  type SpaceContentDefinition,
  type SpaceLandmarkDefinition,
} from './world-definition.js';

function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeTree(child);
  }
  return value;
}

/** The immutable generator seed comes directly from the reviewed space pack.
 * This leaf projection must never import the registry: registry validation itself
 * imports simulation algorithms. Live authority supplies its active definitions to
 * the generic landmark algorithms instead of consulting this bootstrap projection.
 */
export const BOOTSTRAP_SPACE_DEFINITIONS: readonly SpaceContentDefinition[] = freezeTree(
  spacesJson.map((value) => parseSpaceContentDefinition(value)),
);

/** Dependency-safe bootstrap projection for algorithms tied to a space
 * generator. Selecting by engine capability keeps simulation code independent
 * from an authored space id while the live authority can inject active space
 * definitions from its registry. */
export function bootstrapLandmarksForGenerator(
  generator: SpaceContentDefinition['generator'],
): readonly SpaceLandmarkDefinition[] {
  return BOOTSTRAP_SPACE_DEFINITIONS.find((space) => space.generator === generator)?.landmarks ?? [];
}
