import { loadBootstrapPackDefinitions } from './bootstrap-pack-loader.js';
import {
  definitionSlug,
  serializeContentDefinitionForTransport,
  type ContentDefinitionRow,
  type SupportedContentDefinition,
} from './definitions.js';
import { buildContentRegistry, type ContentRegistry } from './registry.js';

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (!Object.isFrozen(value)) Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function bootstrapContentDefinitions(): readonly SupportedContentDefinition[] {
  return deepFreeze([...loadBootstrapPackDefinitions()]);
}

let cachedBootstrapRegistry: ContentRegistry | undefined;

/** Registry-derived compatibility source for legacy simulation APIs. New runtime
 * consumers should accept the active registry instead of reading this fallback. */
export function bootstrapContentRegistry(): ContentRegistry {
  if (cachedBootstrapRegistry !== undefined) return cachedBootstrapRegistry;
  const definitions = bootstrapContentDefinitions();
  const built = buildContentRegistry(definitions.map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    slug: definitionSlug(definition.id)!,
    json: definition,
  })));
  if (!built.report.valid) throw new Error('bootstrap_content_registry_invalid');
  cachedBootstrapRegistry = built.registry;
  return cachedBootstrapRegistry;
}

export function bootstrapContentRows(): readonly ContentDefinitionRow[] {
  return bootstrapContentDefinitions().map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    slug: definitionSlug(definition.id)!,
    json: serializeContentDefinitionForTransport(definition),
  }));
}
