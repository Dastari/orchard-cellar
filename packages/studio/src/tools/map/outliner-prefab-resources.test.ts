import { createEmptyMapDocument, createMapPrefabDocument, migrateMapDocumentV2,
  normalizeMapDocumentV3, normalizeMapPrefab, type MapDocumentV3,
  type MapPrefabDocumentV2 } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { buildWorldOutliner } from '../../shell/outliners.js';
import { applyMapOutlinerTreeKey, createMapOutlinerTreeState,
  mapOutlinerTreeRows, setMapOutlinerQuery } from './outliner-tree.js';
import {
  MAP_PREFAB_DEFINITION_KIND,
  MAP_RESOURCE_PREFAB_DEFINITION_KIND,
  mapOutlinerPrefabResourceGroups,
  mapOutlinerPrefabResourceInspectorFields,
} from './outliner-prefab-resources.js';

function prefab(
  id: string,
  title: string,
  behavior: MapPrefabDocumentV2['behaviors'][number],
  tags: readonly string[] = [],
): MapPrefabDocumentV2 {
  return normalizeMapPrefab({
    ...createMapPrefabDocument({ id, title, tags }),
    behaviors: [behavior],
  });
}

function documentWith(prefabs: readonly MapPrefabDocumentV2[]): MapDocumentV3 {
  return normalizeMapDocumentV3({
    ...migrateMapDocumentV2(createEmptyMapDocument({ id: 'outliner-definitions',
      title: 'Outliner definitions', width: 8, height: 8 })),
    prefabs,
  });
}

function outlinerNodes(document: MapDocumentV3) {
  return buildWorldOutliner({ spaces: [{
    id: 0,
    label: document.title,
    layers: [],
    definitionGroups: mapOutlinerPrefabResourceGroups(document),
  }] });
}

describe('Map World Outliner prefab and resource definitions', () => {
  it('projects resource and ordinary prefab definitions into distinct stable groups', () => {
    const tree = prefab('apple-tree', 'Apple Tree', {
      kind: 'resource', archetype: 'resource.tree',
    });
    const bench = prefab('garden-bench', 'Garden Bench', { kind: 'static' });
    const groups = mapOutlinerPrefabResourceGroups(documentWith([bench, tree]));

    expect(groups).toEqual([{
      id: 'resources', label: 'RESOURCE DEFINITIONS · 1', definitions: [{
        id: 'apple-tree', label: 'Apple Tree · RESOURCE',
        definitionKind: MAP_RESOURCE_PREFAB_DEFINITION_KIND,
      }],
    }, {
      id: 'prefabs', label: 'PREFAB DEFINITIONS · 1', definitions: [{
        id: 'garden-bench', label: 'Garden Bench · PREFAB',
        definitionKind: MAP_PREFAB_DEFINITION_KIND,
      }],
    }]);
  });

  it('uses definition selections which cannot be confused with placed instances', () => {
    const document = documentWith([prefab('apple-tree', 'Apple Tree', {
      kind: 'resource', archetype: 'resource.tree',
    })]);
    const nodes = outlinerNodes(document);
    const group = nodes[0]?.children[0];
    const leaf = group?.children[0];

    expect(group).toMatchObject({
      id: 'space:0:definitions:resources', kind: 'group',
    });
    expect(leaf).toMatchObject({
      id: 'definition:map-resource-prefab:apple-tree', kind: 'entity',
      selection: {
        kind: 'definition', definitionKind: MAP_RESOURCE_PREFAB_DEFINITION_KIND, id: 'apple-tree',
      },
    });
    expect(leaf?.selection).not.toMatchObject({ kind: 'entity', entityKind: 'map-object' });
  });

  it('inherits ancestor-preserving search and keyboard navigation from the bounded tree', () => {
    const nodes = outlinerNodes(documentWith([
      prefab('apple-tree', 'Apple Tree', { kind: 'resource', archetype: 'resource.tree' }),
      prefab('garden-bench', 'Garden Bench', { kind: 'static' }),
    ]));
    let state = createMapOutlinerTreeState(nodes);
    state = setMapOutlinerQuery(nodes, state, 'apple');
    expect(mapOutlinerTreeRows(nodes, state).map(({ node }) => node.id)).toEqual([
      'space:0',
      'space:0:definitions:resources',
      'definition:map-resource-prefab:apple-tree',
    ]);
    const result = applyMapOutlinerTreeKey(nodes, state, 'End');
    expect(result.state.focusedId).toBe('definition:map-resource-prefab:apple-tree');
    expect(applyMapOutlinerTreeKey(nodes, result.state, 'Enter')).toMatchObject({
      effect: 'activate', activatedId: 'definition:map-resource-prefab:apple-tree',
      state: { selectedId: 'definition:map-resource-prefab:apple-tree' },
    });
  });

  it('inspects exact authored revision and exact live references without mutation metadata', () => {
    const tree = prefab('apple-tree', 'Apple Tree', {
      kind: 'resource', archetype: 'resource.tree',
    }, ['content.object', 'object:apple-tree']);
    const document = documentWith([tree]);
    const withInstances = {
      ...document,
      objects: [{
        id: 'tree-current', prefabId: tree.id, prefabRevision: tree.revision,
        tileX: 1, tileY: 2, elevation: 0, quarterTurns: 0, flipX: false,
        scale: 1, layer: 'gameplay', enabled: true,
      }, {
        id: 'tree-stale', prefabId: tree.id, prefabRevision: tree.revision + 1,
        tileX: 3, tileY: 4, elevation: 0, quarterTurns: 0, flipX: false,
        scale: 1, layer: 'gameplay', enabled: true,
      }],
    } as MapDocumentV3;
    const fields = mapOutlinerPrefabResourceInspectorFields(withInstances, {
      kind: 'definition', definitionKind: MAP_RESOURCE_PREFAB_DEFINITION_KIND, id: tree.id,
    }, {
      placeables: [{ id: 1n, spaceId: 0, kind: 'tree', definitionId: 'object:apple-tree' }],
      chests: [{ id: 2n, spaceId: 0, definitionId: 'object:apple-tree', tileX: 1, tileY: 1 }],
      resources: [{ id: 3n, spaceId: 0, kind: 'resource.tree', tileX: 2, tileY: 2 },
        { id: 4n, spaceId: 0, kind: 'apple-tree', tileX: 3, tileY: 3 }],
      npcs: [], homesteads: [], players: [],
    });

    expect(fields).not.toBeNull();
    expect(fields?.find(({ id }) => id === 'prefab_instances')?.value).toBe(2);
    expect(fields?.find(({ id }) => id === 'prefab_current_instances')?.value).toBe(1);
    expect(fields?.find(({ id }) => id === 'prefab_stale_instances')?.value).toBe(1);
    expect(fields?.find(({ id }) => id === 'prefab_runtime_references')?.value).toBe(3);
    expect(fields?.every(({ readOnly, action }) => readOnly === true && action === undefined)).toBe(true);
  });

  it('fails closed for a mismatched definition kind or missing prefab id', () => {
    const document = documentWith([prefab('apple-tree', 'Apple Tree', {
      kind: 'resource', archetype: 'resource.tree',
    })]);
    expect(mapOutlinerPrefabResourceInspectorFields(document, {
      kind: 'definition', definitionKind: MAP_PREFAB_DEFINITION_KIND, id: 'apple-tree',
    }, null)).toBeNull();
    expect(mapOutlinerPrefabResourceInspectorFields(document, {
      kind: 'definition', definitionKind: MAP_RESOURCE_PREFAB_DEFINITION_KIND, id: 'missing',
    }, null)).toBeNull();
  });
});
