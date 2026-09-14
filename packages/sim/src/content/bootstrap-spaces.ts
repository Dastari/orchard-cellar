import spacesJson from '../../../assets/content/spaces.json' with { type: 'json' };
import { parseSpaceContentDefinition, type SpaceContentDefinition } from './world-definition.js';

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
