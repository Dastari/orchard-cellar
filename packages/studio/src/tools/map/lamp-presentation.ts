import { LIVE_ISLAND_MAP_ID, mapStreetlampPlans, type MapDocumentV3, type MapObjectInstance, type StreetlampPlan } from '@orchard/sim';
import type { MapEditorLiveMarker } from './editor-controller.js';
import { mapStreetlampLiveBindings } from './live-ownership.js';

const draftPlans = new WeakMap<MapDocumentV3, ReadonlyMap<string, StreetlampPlan>>();

/** Validate each candidate independently: an unfinished prefab edit must not
 * disconnect every other lamp from its published identity. Include disabled
 * lamps only to recognize their single authoritative fallback representation. */
function lampPlans(document: MapDocumentV3): ReadonlyMap<string, StreetlampPlan> {
  const cached = draftPlans.get(document);
  if (cached !== undefined) return cached;
  const prefabs = new Map(document.prefabs.map(prefab => [prefab.id, prefab]));
  const plans = new Map<string, StreetlampPlan>();
  for (const object of document.objects) {
    const prefab = prefabs.get(object.prefabId);
    if (!prefab?.placements.some(placement => placement.assetName === 'prop_cf_hearth_streetlamp')) continue;
    try {
      const plan = mapStreetlampPlans({ ...document, prefabs: [prefab], objects: [{ ...object, enabled: true }] })[0];
      if (plan !== undefined) plans.set(object.id, plan);
    } catch { /* Unsupported draft transforms remain separate, visible records. */ }
  }
  draftPlans.set(document, plans);
  return plans;
}

type AuthoredLampMarker = MapEditorLiveMarker & Pick<MapObjectInstance, 'layer'>;
export interface MapLampPresentation {
  /** Enabled authored lamp ID → authoritative appearance at its draft position. */
  readonly replacements: ReadonlyMap<string, AuthoredLampMarker>;
  /** Live rows without an enabled authored replacement, at authority positions. */
  readonly liveMarkers: readonly MapEditorLiveMarker[];
  /** Disabled authored lamps represented by their still-live authority row. */
  readonly disabledAuthoredIds: ReadonlySet<string>;
}

/** Bind by the verified published map, never the editable draft's coordinates.
 * No rows are deleted or changed. Only a proven materialized lamp receives a
 * presentation projection, retaining its authoritative state and identity. */
export function resolveMapLampPresentation(
  draft: MapDocumentV3,
  published: MapDocumentV3 | null,
  markers: readonly MapEditorLiveMarker[],
): MapLampPresentation {
  const replacements = new Map<string, AuthoredLampMarker>();
  const disabledAuthoredIds = new Set<string>();
  if (published === null || published.id !== LIVE_ISLAND_MAP_ID || draft.id !== published.id) {
    return { replacements, liveMarkers: markers, disabledAuthoredIds };
  }
  const bindings = mapStreetlampLiveBindings(published);
  const objects = new Map(draft.objects.map(object => [object.id, object]));
  const plans = lampPlans(draft);
  const liveMarkers: MapEditorLiveMarker[] = [];
  for (const marker of markers) {
    const objectId = marker.mapMaterialized === true ? bindings.get(marker.id) : undefined;
    const object = objectId === undefined ? undefined : objects.get(objectId);
    const plan = objectId === undefined ? undefined : plans.get(objectId);
    if (object === undefined || plan === undefined || replacements.has(object.id)) {
      liveMarkers.push(marker);
      continue;
    }
    if (!object.enabled) {
      disabledAuthoredIds.add(object.id);
      liveMarkers.push(marker);
      continue;
    }
    replacements.set(object.id, {
      ...marker, tileX: plan.tileX, tileY: plan.tileY,
      worldX: plan.tileX * 16 + 8, worldY: (plan.tileY + 1) * 16,
      elevation: object.elevation, layer: object.layer,
    });
  }
  return { replacements, liveMarkers, disabledAuthoredIds };
}
