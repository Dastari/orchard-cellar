import balanceGroupsJson from '../../../assets/content/balance-groups.json' with { type: 'json' };
import balanceJson from '../../../assets/content/balance.json' with { type: 'json' };
import creaturesJson from '../../../assets/content/creatures.json' with { type: 'json' };
import cropsJson from '../../../assets/content/crops.json' with { type: 'json' };
import dialoguesJson from '../../../assets/content/dialogues.json' with { type: 'json' };
import effectsJson from '../../../assets/content/effects.json' with { type: 'json' };
import enemiesJson from '../../../assets/content/enemies.json' with { type: 'json' };
import encountersJson from '../../../assets/content/encounters.json' with { type: 'json' };
import framesJson from '../../../assets/content/frames.json' with { type: 'json' };
import itemsJson from '../../../assets/content/items.json' with { type: 'json' };
import lootJson from '../../../assets/content/loot.json' with { type: 'json' };
import loadoutsJson from '../../../assets/content/loadouts.json' with { type: 'json' };
import npcsJson from '../../../assets/content/npcs.json' with { type: 'json' };
import objectsJson from '../../../assets/content/objects.json' with { type: 'json' };
import processesJson from '../../../assets/content/processes.json' with { type: 'json' };
import questsJson from '../../../assets/content/quests.json' with { type: 'json' };
import recipesJson from '../../../assets/content/recipes.json' with { type: 'json' };
import resourcesJson from '../../../assets/content/resources.json' with { type: 'json' };
import shopsJson from '../../../assets/content/shops.json' with { type: 'json' };
import skillTreesJson from '../../../assets/content/skill-trees.json' with { type: 'json' };
import spacesJson from '../../../assets/content/spaces.json' with { type: 'json' };
import spawnsJson from '../../../assets/content/spawns.json' with { type: 'json' };
import statisticsJson from '../../../assets/content/statistics.json' with { type: 'json' };
import tilesetsJson from '../../../assets/content/tilesets.json' with { type: 'json' };
import upgradesJson from '../../../assets/content/upgrades.json' with { type: 'json' };

import {
  parseContentDefinition,
  type SupportedContentDefinition,
  type SupportedContentKind,
} from './definitions.js';

const BOOTSTRAP_PACK_FILES: readonly unknown[] = Object.freeze([
  balanceGroupsJson, balanceJson, creaturesJson, cropsJson, dialoguesJson,
  effectsJson, enemiesJson, encountersJson, framesJson, itemsJson, lootJson, loadoutsJson, npcsJson, processesJson,
  objectsJson,
  questsJson, recipesJson, resourcesJson, shopsJson, skillTreesJson, spacesJson, spawnsJson,
  statisticsJson, tilesetsJson, upgradesJson,
]);

let cachedDefinitions: readonly SupportedContentDefinition[] | undefined;

function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeTree(child);
  }
  return value;
}

/**
 * Loads the committed bootstrap pack that is also reviewed and published by
 * the authoring pipeline. This is the sole authored-content seed; legacy
 * compatibility projections must derive from these parsed definitions.
 */
export function loadBootstrapPackDefinitions(): readonly SupportedContentDefinition[] {
  if (cachedDefinitions !== undefined) return cachedDefinitions;
  const definitions = BOOTSTRAP_PACK_FILES.flatMap((values) => {
    if (!Array.isArray(values)) throw new Error('bootstrap_content_file_invalid');
    return values.map((value) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('bootstrap_content_definition_invalid');
      }
      const kind = (value as { readonly kind?: unknown }).kind;
      if (typeof kind !== 'string') throw new Error('bootstrap_content_kind_missing');
      return parseContentDefinition(kind as SupportedContentKind, value);
    });
  }).sort((left, right) => left.id.localeCompare(right.id));
  const duplicate = definitions.find((definition, index) => (
    index > 0 && definitions[index - 1]?.id === definition.id
  ));
  if (duplicate !== undefined) throw new Error(`bootstrap_content_duplicate:${duplicate.id}`);
  cachedDefinitions = freezeTree(definitions);
  return cachedDefinitions;
}

export function bootstrapDefinitionsOfKind<K extends SupportedContentKind>(kind: K) {
  return loadBootstrapPackDefinitions().filter(
    (definition): definition is Extract<SupportedContentDefinition, { readonly kind: K }> => (
      definition.kind === kind
    ),
  );
}
