import {
  LIVE_ISLAND_MAP_ID,
  STREETLAMP_DEFINITION,
  isMaterializedStreetlampId,
  mapStreetlampPlans,
  runtimeLandmarkPlaceablePlans,
  type ContentRegistry,
  type MapDocumentV3,
} from '@orchard/sim';

/** Who controls a live placeable/chest row. World rows are inserted by the
 * module under its own database identity (town lamps, landmark fixtures);
 * everything else was placed by, and stays in the custody of, a player. */
export type MapEditorLiveOwnership = 'world' | 'player';

export interface LiveOwnedRow {
  readonly id: bigint;
  readonly definitionId?: string;
  /** Hex `placedBy` identity. Absent on compatibility fixtures. */
  readonly ownerIdentity?: string;
}

export interface LiveOwnershipClassification {
  readonly ownership: MapEditorLiveOwnership;
  /** The live row is derived from an authored map object (town lamps). Its
   * position follows that object on map publication, so the authored copy is
   * the editable representation. */
  readonly mapMaterialized: boolean;
}

type LandmarkRegistry = Pick<ContentRegistry, 'objects'> & Partial<Pick<ContentRegistry, 'spaces'>>;

const landmarkPlanCache = new WeakMap<object, ReadonlyMap<bigint, string>>();

function landmarkPlaceableDefinitions(registry: LandmarkRegistry | null): ReadonlyMap<bigint, string> {
  if (registry === null || registry.spaces === undefined) return new Map();
  const cached = landmarkPlanCache.get(registry);
  if (cached !== undefined) return cached;
  let plans: ReadonlyMap<bigint, string>;
  try {
    plans = new Map(runtimeLandmarkPlaceablePlans(registry as ContentRegistry)
      .map((plan) => [plan.runtimeId, plan.objectDefinitionId] as const));
  } catch {
    plans = new Map();
  }
  landmarkPlanCache.set(registry, plans);
  return plans;
}

/** Classifies live rows by their actual owner rather than by table. Rows at
 * reserved world identities (materialized town lamps, landmark placeables)
 * are world-owned by construction; their `placedBy` reveals the module's
 * authority identity, which then classifies any other world-inserted row.
 * Rows that cannot be proven world-owned stay player-owned (fail closed). */
export function classifyLiveOwnership(
  rows: readonly LiveOwnedRow[],
  registry: LandmarkRegistry | null,
): (row: LiveOwnedRow) => LiveOwnershipClassification {
  const landmarks = landmarkPlaceableDefinitions(registry);
  const streetlamp = (row: LiveOwnedRow): boolean => row.definitionId === STREETLAMP_DEFINITION
    && isMaterializedStreetlampId(row.id);
  const reserved = (row: LiveOwnedRow): boolean => streetlamp(row)
    || (row.definitionId !== undefined && landmarks.get(row.id) === row.definitionId);
  const authorityOwners = new Set<string>();
  for (const row of rows) {
    if (row.ownerIdentity !== undefined && row.ownerIdentity !== '' && reserved(row)) {
      authorityOwners.add(row.ownerIdentity);
    }
  }
  return (row) => {
    const world = reserved(row)
      || (row.ownerIdentity !== undefined && authorityOwners.has(row.ownerIdentity));
    return Object.freeze({ ownership: world ? 'world' : 'player', mapMaterialized: streetlamp(row) });
  };
}

const streetlampBindingCache = new WeakMap<MapDocumentV3, ReadonlyMap<string, string>>();

/** Live streetlamp id → authored map object id, from the same plan the world
 * module uses to materialize lamps. Invalid or non-live documents bind nothing. */
export function mapStreetlampLiveBindings(document: MapDocumentV3): ReadonlyMap<string, string> {
  const cached = streetlampBindingCache.get(document);
  if (cached !== undefined) return cached;
  let bindings: ReadonlyMap<string, string> = new Map();
  if (document.id === LIVE_ISLAND_MAP_ID) {
    try {
      bindings = new Map(mapStreetlampPlans(document)
        .map((plan) => [plan.id.toString(), plan.objectId] as const));
    } catch {
      bindings = new Map();
    }
  }
  streetlampBindingCache.set(document, bindings);
  return bindings;
}
