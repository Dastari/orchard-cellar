import type { MapDocumentV3, MapPrefabDocumentV2 } from '@orchard/sim';
import type { StudioPropertyInput } from '@orchard/ui/studio';
import type { StudioLiveRows } from '../../shell/outliners.js';
import type { StudioSelection } from '../../shell/selection.js';

export const MAP_PREFAB_DEFINITION_KIND = 'map-prefab';
export const MAP_RESOURCE_PREFAB_DEFINITION_KIND = 'map-resource-prefab';

export interface MapOutlinerDefinitionEntry {
  readonly id: string;
  readonly label: string;
  readonly definitionKind:
    | typeof MAP_PREFAB_DEFINITION_KIND
    | typeof MAP_RESOURCE_PREFAB_DEFINITION_KIND;
}

export interface MapOutlinerDefinitionGroup {
  readonly id: 'resources' | 'prefabs';
  readonly label: string;
  readonly definitions: readonly MapOutlinerDefinitionEntry[];
}

function isResourcePrefab(prefab: MapPrefabDocumentV2): boolean {
  return prefab.behaviors.some(({ kind }) => kind === 'resource');
}

function definitionKind(prefab: MapPrefabDocumentV2): MapOutlinerDefinitionEntry['definitionKind'] {
  return isResourcePrefab(prefab)
    ? MAP_RESOURCE_PREFAB_DEFINITION_KIND
    : MAP_PREFAB_DEFINITION_KIND;
}

function definitionEntry(prefab: MapPrefabDocumentV2): MapOutlinerDefinitionEntry {
  const resource = isResourcePrefab(prefab);
  return Object.freeze({
    id: prefab.id,
    label: `${prefab.title} · ${resource ? 'RESOURCE' : 'PREFAB'}`,
    definitionKind: definitionKind(prefab),
  });
}

/** Projects embedded definitions separately from their placed instances. The
 * returned rows contain no mutation metadata: choosing one is a definition
 * selection, never a runtime-entity selection or an authority command. */
export function mapOutlinerPrefabResourceGroups(
  document: MapDocumentV3,
): readonly MapOutlinerDefinitionGroup[] {
  const sorted = [...document.prefabs].sort((left, right) => (
    left.title.localeCompare(right.title, 'en') || left.id.localeCompare(right.id)
  ));
  const resources = sorted.filter(isResourcePrefab).map(definitionEntry);
  const prefabs = sorted.filter((prefab) => !isResourcePrefab(prefab)).map(definitionEntry);
  return Object.freeze([
    ...(resources.length === 0 ? [] : [Object.freeze({
      id: 'resources' as const,
      label: `RESOURCE DEFINITIONS · ${resources.length}`,
      definitions: Object.freeze(resources),
    })]),
    ...(prefabs.length === 0 ? [] : [Object.freeze({
      id: 'prefabs' as const,
      label: `PREFAB DEFINITIONS · ${prefabs.length}`,
      definitions: Object.freeze(prefabs),
    })]),
  ]);
}

function contentDefinitionId(prefab: MapPrefabDocumentV2): string | null {
  if (!prefab.tags.includes('content.object')) return null;
  return prefab.tags.find((tag) => /^object:[a-z0-9][a-z0-9._-]*$/u.test(tag)) ?? null;
}

function exactRuntimeReferenceCount(
  prefab: MapPrefabDocumentV2,
  rows: StudioLiveRows | null,
): number {
  if (rows === null) return 0;
  const contentId = contentDefinitionId(prefab);
  const definitionBacked = contentId === null ? 0
    : rows.placeables.filter(({ definitionId }) => definitionId === contentId).length
      + (rows.chests ?? []).filter(({ definitionId }) => definitionId === contentId).length;
  const resourceArchetypes = new Set(prefab.behaviors.flatMap((behavior) => (
    behavior.kind === 'resource' && behavior.archetype !== undefined ? [behavior.archetype] : []
  )));
  const resourceBacked = (rows.resources ?? [])
    .filter(({ kind }) => resourceArchetypes.has(kind)).length;
  return definitionBacked + resourceBacked;
}

function readonlyField(
  id: string,
  label: string,
  component: string,
  value: StudioPropertyInput['value'],
  why: string,
): StudioPropertyInput {
  return Object.freeze({ id, label, component, kind: 'readonly', value, why, readOnly: true });
}

/** Builds a truthful definition Inspector. Runtime counts use exact definition
 * id or exact resource-archetype equality only; fuzzy asset/tag matches would
 * incorrectly imply that an embedded visual owns live authority. */
export function mapOutlinerPrefabResourceInspectorFields(
  document: MapDocumentV3,
  selection: StudioSelection,
  rows: StudioLiveRows | null,
): readonly StudioPropertyInput[] | null {
  if (selection.kind !== 'definition'
    || (selection.definitionKind !== MAP_PREFAB_DEFINITION_KIND
      && selection.definitionKind !== MAP_RESOURCE_PREFAB_DEFINITION_KIND)) return null;
  const prefab = document.prefabs.find(({ id }) => id === selection.id);
  if (prefab === undefined || definitionKind(prefab) !== selection.definitionKind) return null;

  const instances = document.objects.filter(({ prefabId }) => prefabId === prefab.id);
  const currentInstances = instances.filter(({ prefabRevision }) => prefabRevision === prefab.revision).length;
  const behaviors = prefab.behaviors.map(({ kind, archetype }) => (
    archetype === undefined ? kind : `${kind}:${archetype}`
  )).join(', ');
  const collection = prefab.collection?.label ?? 'Uncollected';
  const contentId = contentDefinitionId(prefab);
  const runtimeReferences = exactRuntimeReferenceCount(prefab, rows);
  const resource = isResourcePrefab(prefab);

  return Object.freeze([
    readonlyField('prefab_id', resource ? 'Resource prefab' : 'Prefab', 'definition', prefab.id,
      'Stable id of the MapDocumentV3 embedded definition.'),
    readonlyField('prefab_title', 'Title', 'definition', prefab.title,
      'Display title stored in the embedded prefab definition.'),
    readonlyField('prefab_revision', 'Revision', 'definition', prefab.revision,
      'Revision embedded by this map; it is not a live content-head revision.'),
    readonlyField('prefab_collection', 'Collection', 'definition', collection,
      'Optional authored collection metadata from the embedded definition.'),
    readonlyField('prefab_size', 'Footprint', 'definition', `${prefab.width} × ${prefab.height}`,
      'Authored tile footprint before an instance transform is applied.'),
    readonlyField('prefab_behaviors', 'Behaviours', 'resource_metadata', behaviors,
      'Allowlisted semantic behaviours stored by the embedded definition.'),
    readonlyField('prefab_instances', 'Authored instances', 'resource_metadata', instances.length,
      'Exact count of MapDocumentV3 object instances which reference this prefab id.'),
    readonlyField('prefab_current_instances', 'Current revision instances', 'resource_metadata', currentInstances,
      'Exact count whose stored prefab revision matches this embedded revision.'),
    readonlyField('prefab_stale_instances', 'Other revision instances', 'resource_metadata',
      instances.length - currentInstances,
      'Instances with another stored prefab revision remain explicit; they are not silently upgraded.'),
    readonlyField('prefab_content_definition', 'Content definition', 'runtime_reference',
      contentId ?? 'NONE', contentId === null
        ? 'No exact object definition id is declared by this embedded prefab.'
        : 'Exact object definition id retained in the prefab tags by the subscribed content adapter.'),
    readonlyField('prefab_runtime_references', 'Exact live references', 'runtime_reference', runtimeReferences,
      rows === null
        ? 'No live subscription is available; this definition remains an authored map resource only.'
        : 'Read-only count using exact definition-id or resource-archetype equality; inspect instances in Live Outliner.'),
    readonlyField('prefab_authority', 'Authority', 'runtime_reference', 'READ ONLY',
      'Selecting an embedded definition never creates or mutates a live runtime entity.'),
  ]);
}
