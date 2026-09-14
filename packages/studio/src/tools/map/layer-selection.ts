import type { MapContentLayerId } from '@orchard/sim';

export interface MapLayerSelectionState {
  /** The single layer which receives placement/authoring commands. */
  readonly active: MapContentLayerId;
  /** Stable endpoint for a later Shift range gesture. */
  readonly anchor: MapContentLayerId;
  /** Selected rows in the drawer's current topmost-first order. */
  readonly selected: readonly MapContentLayerId[];
}

export interface MapLayerSelectionGesture {
  readonly range: boolean;
  readonly additive: boolean;
}

export interface MapLayerBulkBooleanPlan {
  readonly layers: readonly MapContentLayerId[];
  readonly value: boolean;
}

function orderedUnique(
  orderedLayers: readonly MapContentLayerId[],
  selected: Iterable<MapContentLayerId>,
): readonly MapContentLayerId[] {
  const requested = new Set(selected);
  return Object.freeze(orderedLayers.filter((layer) => requested.has(layer)));
}

function nearestSelected(
  orderedLayers: readonly MapContentLayerId[],
  target: MapContentLayerId,
  selected: ReadonlySet<MapContentLayerId>,
): MapContentLayerId | null {
  const targetIndex = orderedLayers.indexOf(target);
  for (let distance = 1; distance < orderedLayers.length; distance += 1) {
    const after = orderedLayers[targetIndex + distance];
    if (after !== undefined && selected.has(after)) return after;
    const before = orderedLayers[targetIndex - distance];
    if (before !== undefined && selected.has(before)) return before;
  }
  return null;
}

/** Photoshop-style layer-row selection. This state is intentionally separate
 * from StudioSelection: selected map entities remain singular, while only the
 * eye/lock drawer commands operate on this row set. */
export function applyMapLayerSelectionGesture(
  orderedLayers: readonly MapContentLayerId[],
  current: MapLayerSelectionState,
  target: MapContentLayerId,
  gesture: MapLayerSelectionGesture,
): MapLayerSelectionState {
  if (!orderedLayers.includes(target)) return current;
  const validSelected = orderedUnique(orderedLayers, current.selected);
  const selected = new Set(validSelected.length > 0 ? validSelected : [current.active]);
  const anchor = orderedLayers.includes(current.anchor) ? current.anchor : current.active;

  if (gesture.range) {
    const anchorIndex = Math.max(0, orderedLayers.indexOf(anchor));
    const targetIndex = orderedLayers.indexOf(target);
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    const next = gesture.additive ? selected : new Set<MapContentLayerId>();
    for (const layer of orderedLayers.slice(start, end + 1)) next.add(layer);
    return Object.freeze({
      active: target,
      anchor,
      selected: orderedUnique(orderedLayers, next),
    });
  }

  if (gesture.additive) {
    if (selected.has(target) && selected.size > 1) {
      selected.delete(target);
      const active = current.active === target || !selected.has(current.active)
        ? nearestSelected(orderedLayers, target, selected) ?? target
        : current.active;
      return Object.freeze({ active, anchor: target, selected: orderedUnique(orderedLayers, selected) });
    }
    selected.add(target);
    return Object.freeze({ active: target, anchor: target, selected: orderedUnique(orderedLayers, selected) });
  }

  return Object.freeze({ active: target, anchor: target, selected: Object.freeze([target]) });
}

/** Reconciles document replacement and active-layer changes originating from
 * canvas picking without allowing layer multi-selection to select an entity. */
export function reconcileMapLayerSelection(
  orderedLayers: readonly MapContentLayerId[],
  current: MapLayerSelectionState | null,
  active: MapContentLayerId,
): MapLayerSelectionState {
  const fallback = orderedLayers.includes(active) ? active : orderedLayers[0] ?? active;
  if (current === null || current.active !== fallback) {
    return Object.freeze({ active: fallback, anchor: fallback, selected: Object.freeze([fallback]) });
  }
  const selected = orderedUnique(orderedLayers, current.selected);
  if (selected.includes(fallback)) {
    return Object.freeze({
      active: fallback,
      anchor: orderedLayers.includes(current.anchor) ? current.anchor : fallback,
      selected,
    });
  }
  return Object.freeze({ active: fallback, anchor: fallback, selected: Object.freeze([fallback]) });
}

/** If every selected eye is on, the bulk eye hides them; otherwise it shows
 * every selected row. Visibility is session state, so system layers are safe. */
export function planMapLayerBulkVisibility(
  selected: readonly MapContentLayerId[],
  isVisible: (layer: MapContentLayerId) => boolean,
): MapLayerBulkBooleanPlan | null {
  if (selected.length < 2) return null;
  return Object.freeze({ layers: Object.freeze([...selected]), value: !selected.every(isVisible) });
}

/** System-locked layers are never included in a lock plan. A mixed selection
 * may lock/unlock mutable rows while immutable rows remain locked. */
export function planMapLayerBulkLock(
  selected: readonly MapContentLayerId[],
  canToggle: (layer: MapContentLayerId) => boolean,
  isUserLocked: (layer: MapContentLayerId) => boolean,
): MapLayerBulkBooleanPlan | null {
  if (selected.length < 2) return null;
  const mutable = selected.filter(canToggle);
  if (mutable.length === 0) return null;
  return Object.freeze({
    layers: Object.freeze(mutable),
    value: !mutable.every(isUserLocked),
  });
}
