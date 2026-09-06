import { describe, expect, it } from 'vitest';
import type { MapContentLayerId } from '@orchard/sim';
import {
  applyMapLayerSelectionGesture,
  planMapLayerBulkLock,
  planMapLayerBulkVisibility,
  reconcileMapLayerSelection,
  type MapLayerSelectionState,
} from './layer-selection.js';

const LAYERS: readonly MapContentLayerId[] = Object.freeze([
  'anchors', 'canopy', 'player_owned', 'gameplay', 'objects', 'ground', 'terrain', 'generated_base',
]);

const initial = (active: MapContentLayerId): MapLayerSelectionState => ({
  active,
  anchor: active,
  selected: [active],
});

describe('map layer selection', () => {
  it('keeps an ordinary row activation singular with an explicit active target', () => {
    expect(applyMapLayerSelectionGesture(LAYERS, initial('terrain'), 'objects', {
      range: false,
      additive: false,
    })).toEqual({ active: 'objects', anchor: 'objects', selected: ['objects'] });
  });

  it('Ctrl/Meta-style activation adds and removes rows without losing the active target', () => {
    const added = applyMapLayerSelectionGesture(LAYERS, initial('terrain'), 'objects', {
      range: false,
      additive: true,
    });
    expect(added).toEqual({ active: 'objects', anchor: 'objects', selected: ['objects', 'terrain'] });

    const removed = applyMapLayerSelectionGesture(LAYERS, added, 'objects', {
      range: false,
      additive: true,
    });
    expect(removed).toEqual({ active: 'terrain', anchor: 'objects', selected: ['terrain'] });

    expect(applyMapLayerSelectionGesture(LAYERS, removed, 'terrain', {
      range: false,
      additive: true,
    })).toEqual({ active: 'terrain', anchor: 'terrain', selected: ['terrain'] });
  });

  it('Shift selects a contiguous topmost-first range and Shift+Ctrl adds it', () => {
    const range = applyMapLayerSelectionGesture(LAYERS, initial('objects'), 'terrain', {
      range: true,
      additive: false,
    });
    expect(range).toEqual({
      active: 'terrain',
      anchor: 'objects',
      selected: ['objects', 'ground', 'terrain'],
    });
    expect(applyMapLayerSelectionGesture(LAYERS, initial('anchors'), 'ground', {
      range: true,
      additive: true,
    })).toEqual({
      active: 'ground',
      anchor: 'anchors',
      selected: ['anchors', 'canopy', 'player_owned', 'gameplay', 'objects', 'ground'],
    });
  });

  it('resets only row selection when canvas picking changes the active layer', () => {
    const current: MapLayerSelectionState = {
      active: 'objects',
      anchor: 'ground',
      selected: ['objects', 'ground', 'terrain'],
    };
    expect(reconcileMapLayerSelection(LAYERS, current, 'canopy')).toEqual({
      active: 'canopy',
      anchor: 'canopy',
      selected: ['canopy'],
    });
    expect(reconcileMapLayerSelection(LAYERS, current, 'objects')).toEqual(current);
  });

  it('plans a consistent bulk eye target', () => {
    const visible = new Set<MapContentLayerId>(['objects', 'ground']);
    expect(planMapLayerBulkVisibility(['objects', 'ground'], (layer) => visible.has(layer)))
      .toEqual({ layers: ['objects', 'ground'], value: false });
    expect(planMapLayerBulkVisibility(['objects', 'terrain'], (layer) => visible.has(layer)))
      .toEqual({ layers: ['objects', 'terrain'], value: true });
    expect(planMapLayerBulkVisibility(['objects'], () => true)).toBeNull();
  });

  it('excludes immutable system rows from every bulk lock plan', () => {
    const system = new Set<MapContentLayerId>(['generated_base', 'player_owned']);
    const locked = new Set<MapContentLayerId>(['objects']);
    expect(planMapLayerBulkLock(
      ['generated_base', 'objects', 'ground'],
      (layer) => !system.has(layer),
      (layer) => locked.has(layer),
    )).toEqual({ layers: ['objects', 'ground'], value: true });
    expect(planMapLayerBulkLock(
      ['generated_base', 'objects'],
      (layer) => !system.has(layer),
      (layer) => locked.has(layer),
    )).toEqual({ layers: ['objects'], value: false });
    expect(planMapLayerBulkLock(
      ['generated_base', 'player_owned'],
      (layer) => !system.has(layer),
      () => false,
    )).toBeNull();
  });
});
