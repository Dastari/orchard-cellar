import { describe, expect, it } from 'vitest';
import type { StudioOutlinerNode } from '../../shell/outliners.js';
import {
  applyMapOutlinerTreeKey,
  createMapOutlinerTreeState,
  mapOutlinerTreeRows,
  parseMapOutlinerTreeState,
  restoreMapOutlinerTreeState,
  serializeMapOutlinerTreeState,
  setMapOutlinerQuery,
} from './outliner-tree.js';

function tree(): readonly StudioOutlinerNode[] {
  return [{
    id: 'space:0', label: 'Live Island', kind: 'space', children: [{
      id: 'space:0:layer:objects', label: 'World Objects', kind: 'group', children: [
        { id: 'map-object:apple-tree', label: 'Apple Tree', kind: 'entity', children: [] },
        { id: 'map-object:fruit-press', label: 'Fruit Press', kind: 'entity', children: [] },
      ],
    }, {
      id: 'space:0:layer:anchors', label: 'Anchors and Zones', kind: 'group', children: [
        { id: 'map-anchor:ferry', label: 'Ferry Dock', kind: 'entity', children: [] },
      ],
    }],
  }];
}

describe('Map Outliner tree interactions', () => {
  it('filters labels and ids while retaining matching ancestor paths', () => {
    const state = createMapOutlinerTreeState(tree());
    const filtered = setMapOutlinerQuery(tree(), state, 'fruit press');
    expect(mapOutlinerTreeRows(tree(), filtered).map((row) => ({
      id: row.node.id, depth: row.depth, forced: row.forcedExpanded, matched: row.matched,
    }))).toEqual([
      { id: 'space:0', depth: 0, forced: true, matched: false },
      { id: 'space:0:layer:objects', depth: 1, forced: true, matched: false },
      { id: 'map-object:fruit-press', depth: 2, forced: false, matched: true },
    ]);
    expect(filtered.expandedIds).toEqual([]);
  });

  it('keeps every descendant when a branch label matches', () => {
    const filtered = setMapOutlinerQuery(tree(), createMapOutlinerTreeState(tree()), 'world objects');
    expect(mapOutlinerTreeRows(tree(), filtered).map(({ node }) => node.id)).toEqual([
      'space:0', 'space:0:layer:objects', 'map-object:apple-tree', 'map-object:fruit-press',
    ]);
  });

  it('navigates, expands and collapses the same deterministic visible rows', () => {
    let state = createMapOutlinerTreeState(tree());
    expect(state.focusedId).toBe('space:0');
    state = applyMapOutlinerTreeKey(tree(), state, 'ArrowRight').state;
    expect(state.expandedIds).toEqual(['space:0']);
    state = applyMapOutlinerTreeKey(tree(), state, 'ArrowRight').state;
    expect(state.focusedId).toBe('space:0:layer:objects');
    state = applyMapOutlinerTreeKey(tree(), state, 'ArrowRight').state;
    state = applyMapOutlinerTreeKey(tree(), state, 'End').state;
    expect(state.focusedId).toBe('space:0:layer:anchors');
    state = applyMapOutlinerTreeKey(tree(), state, 'ArrowLeft').state;
    expect(state.focusedId).toBe('space:0');
    state = applyMapOutlinerTreeKey(tree(), state, 'ArrowLeft').state;
    expect(state.expandedIds).toEqual(['space:0:layer:objects']);
  });

  it('activates leaves without conflating focus and selection', () => {
    const state = createMapOutlinerTreeState(tree(), {
      expandedIds: ['space:0', 'space:0:layer:objects'],
      focusedId: 'map-object:apple-tree',
      selectedId: null,
    });
    const moved = applyMapOutlinerTreeKey(tree(), state, 'ArrowDown');
    expect(moved.state.focusedId).toBe('map-object:fruit-press');
    expect(moved.state.selectedId).toBeNull();
    const activated = applyMapOutlinerTreeKey(tree(), moved.state, 'Enter');
    expect(activated).toMatchObject({ effect: 'activate', activatedId: 'map-object:fruit-press' });
    expect(activated.state.selectedId).toBe('map-object:fruit-press');
  });

  it('keeps search-forced branches open without overwriting stored expansion', () => {
    const state = setMapOutlinerQuery(tree(), createMapOutlinerTreeState(tree()), 'ferry');
    const right = applyMapOutlinerTreeKey(tree(), state, 'ArrowRight');
    const left = applyMapOutlinerTreeKey(tree(), right.state, 'ArrowLeft');
    expect(right.state.expandedIds).toEqual([]);
    expect(left.state.expandedIds).toEqual([]);
  });

  it('restores only valid, ordered authored ids and fails soft on corrupt state', () => {
    const restored = restoreMapOutlinerTreeState(tree(), JSON.stringify({
      version: 1,
      query: '',
      expandedIds: ['missing', 'space:0:layer:objects', 'space:0'],
      focusedId: 'map-object:apple-tree',
      selectedId: 'map-object:apple-tree',
    }));
    expect(restored.expandedIds).toEqual(['space:0', 'space:0:layer:objects']);
    expect(restored.focusedId).toBe('map-object:apple-tree');
    expect(restoreMapOutlinerTreeState(tree(), '{broken')).toEqual(
      createMapOutlinerTreeState(tree()),
    );
    expect(restoreMapOutlinerTreeState(tree(), JSON.stringify({
      version: 2, query: '', expandedIds: [], focusedId: null, selectedId: null,
    }))).toEqual(createMapOutlinerTreeState(tree()));
    expect(restoreMapOutlinerTreeState(tree(), serializeMapOutlinerTreeState(restored))).toEqual(restored);
  });

  it('serializes expansion in tree order regardless of interaction order', () => {
    const childOnly = createMapOutlinerTreeState(tree(), {
      expandedIds: ['space:0:layer:objects'], focusedId: 'space:0',
    });
    const opened = applyMapOutlinerTreeKey(tree(), childOnly, 'ArrowRight').state;
    expect(opened.expandedIds).toEqual(['space:0', 'space:0:layer:objects']);
  });

  it('bounds hostile search/session input and terminates cyclic object graphs', () => {
    const cyclic = { id: 'cycle', label: 'Cycle', kind: 'group', children: [] } as unknown as {
      id: string; label: string; kind: 'group'; children: StudioOutlinerNode[];
    };
    cyclic.children.push(cyclic);
    const nodes: readonly StudioOutlinerNode[] = [cyclic];
    const state = createMapOutlinerTreeState(nodes, { query: ` ${'x'.repeat(100)} ` });
    expect(state.query).toHaveLength(80);
    expect(mapOutlinerTreeRows(nodes, createMapOutlinerTreeState(nodes, {
      expandedIds: ['cycle'],
    })).map(({ node }) => node.id)).toEqual(['cycle']);
    expect(parseMapOutlinerTreeState({
      version: 1, query: '', expandedIds: [], focusedId: 'x'.repeat(161), selectedId: null,
    })).toBeNull();
    expect(parseMapOutlinerTreeState({
      version: 1, query: '  Fruit   Press  ', expandedIds: ['space:0'],
      focusedId: 'space:0', selectedId: null,
    })).toEqual({
      version: 1, query: 'Fruit Press', expandedIds: ['space:0'],
      focusedId: 'space:0', selectedId: null,
    });
  });
});
