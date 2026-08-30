import { loadGeneratedAsset, type LoadedAsset } from './assets.js';
import {
  CUTE_FANTASY_ACTOR_CATALOG,
  type CuteFantasyActorCatalogEntry,
  type CuteFantasyActorKind,
} from './cute-fantasy-actor-catalog.generated.js';

export {
  CUTE_FANTASY_ACTOR_CATALOG,
  type CuteFantasyActorCatalogEntry,
  type CuteFantasyActorKind,
};

const actorById: ReadonlyMap<string, CuteFantasyActorCatalogEntry> = new Map(
  CUTE_FANTASY_ACTOR_CATALOG.map((entry) => [entry.id, entry]),
);

/** Stable gameplay-facing lookup. UI Lab and future world systems share these IDs. */
export function cuteFantasyActor(id: string): CuteFantasyActorCatalogEntry | undefined {
  return actorById.get(id);
}

export function cuteFantasyActors(kind?: CuteFantasyActorKind): readonly CuteFantasyActorCatalogEntry[] {
  return kind === undefined
    ? CUTE_FANTASY_ACTOR_CATALOG
    : CUTE_FANTASY_ACTOR_CATALOG.filter((entry) => entry.kind === kind);
}

/** Load an imported actor, projectile, or companion directly from the generated atlas. */
export async function loadCuteFantasyActor(id: string, season = 'summer'): Promise<LoadedAsset> {
  const entry = cuteFantasyActor(id);
  if (entry === undefined) throw new Error(`Unknown Cute Fantasy actor: ${id}`);
  return await loadGeneratedAsset(entry.asset, season);
}
