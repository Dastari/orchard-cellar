import type { ContentRegistry, SpaceRegistryEntry } from '@orchard/sim';
import { terrainForSpace, type TerrainArray } from '@orchard/engine/terrain';
import type { StudioLiveAdapter } from '../../shell/studio-connection.js';
import type { AdminEntityQuery } from '../../admin/objects-api.js';
import { studioSpacePath, type StudioSpaceRef } from './routes.js';

/** Read-only generator data for the upcoming World Map canvas; never a publishable document. */
export function studioRuntimeSpaceTerrain(reference: StudioSpaceRef, entry: SpaceRegistryEntry,
  seed: number, version: number, registry: ContentRegistry): Readonly<TerrainArray> {
  if (reference.kind !== 'space' || reference.spaceId !== entry.definition.spaceId) throw new Error('space_reference_mismatch');
  return terrainForSpace(entry.definition, seed, version, registry);
}

/** F5 sources share the shell connection, authorization and server pagination. */
export function studioLivePickerSources(adapter: StudioLiveAdapter) {
  return {
    async spaces() {
      if (adapter.spaceRegistry === undefined) throw new Error('space_registry_unavailable');
      return (await adapter.spaceRegistry()).map((entry) => ({ ...entry,
        value: String(entry.definition.spaceId), path: studioSpacePath(entry.definition.spaceId) }));
    },
    async players(text: string, cursor: string | null) {
      if (adapter.adminApi === undefined) throw new Error('admin_api_unavailable');
      return adapter.adminApi.findPlayers(text, cursor);
    },
    async entities(query: AdminEntityQuery) {
      if (adapter.adminObjects === undefined) throw new Error('admin_api_unavailable');
      return adapter.adminObjects.listEntities(query);
    },
    async container(entityId: string) {
      if (adapter.adminObjects === undefined) throw new Error('admin_api_unavailable');
      return adapter.adminObjects.container(entityId);
    },
  };
}
