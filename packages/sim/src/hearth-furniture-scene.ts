import { hearthFurniturePlacementFromRow, type HearthFurnitureRowReference } from './hearth-furniture-state.js';
import { hearthFurnitureCells, hearthFurniturePresentationAnchor, type HearthFurniturePlacement } from './hearth-furniture-placement.js';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import type {ContentRegistry} from './content/registry.js';

export interface HearthFurnitureSceneEntry {
  readonly placement: HearthFurniturePlacement;
  readonly rootId: string;
  readonly anchor: { readonly x: number; readonly y: number };
  /** All attached art samples the parent's floor plane, not its lifted pixels. */
  readonly contact: { readonly x: number; readonly y: number };
}

/** Presentation uses the persisted support graph and the same native anchors as
 * placement previews. Orphan/cross-space/out-of-surface attachments are withheld. */
type HearthFurnitureSceneRow=HearthFurnitureRowReference & {
  readonly id: bigint | string; readonly spaceId: number; readonly tileX: number; readonly tileY: number;
  readonly stateJson: string; readonly carriedBy?: unknown;
};
export function hearthFurnitureScene(rows:Iterable<HearthFurnitureSceneRow>):ReadonlyMap<string,HearthFurnitureSceneEntry>;
export function hearthFurnitureScene(registry:ContentRegistry,rows:Iterable<HearthFurnitureSceneRow>):ReadonlyMap<string,HearthFurnitureSceneEntry>;
export function hearthFurnitureScene(registryOrRows:ContentRegistry|Iterable<HearthFurnitureSceneRow>,maybeRows?:Iterable<HearthFurnitureSceneRow>): ReadonlyMap<string, HearthFurnitureSceneEntry> {
  const registry=maybeRows===undefined?bootstrapContentRegistry():registryOrRows as ContentRegistry;
  const rows=maybeRows??registryOrRows as Iterable<HearthFurnitureSceneRow>;
  const placements = new Map<string, { placement: HearthFurniturePlacement; spaceId: number }>();
  for (const row of rows) {
    const placement = hearthFurniturePlacementFromRow(registry,row);
    if (placement !== null) placements.set(placement.id, { placement, spaceId: row.spaceId });
  }
  const result = new Map<string, HearthFurnitureSceneEntry>();
  for (const { placement, spaceId } of placements.values()) {
    if (placement.shape.layer === 'tabletop') {
      const support = placements.get(placement.supportId ?? '');
      const surface = support?.placement.shape.tabletopSurface;
      if (!support || support.spaceId !== spaceId || support.placement.shape.layer !== 'standing' || !surface) continue;
      const parent = support.placement;
      const left = parent.tileX - Math.floor((parent.shape.width - 1) / 2) + surface.insetLeft;
      const top = parent.tileY - parent.shape.height + 1 + surface.insetTop;
      if (hearthFurnitureCells(placement).some(cell => cell.tileX < left || cell.tileX >= left + surface.width
        || cell.tileY < top || cell.tileY >= top + surface.height)) continue;
      const anchor = hearthFurniturePresentationAnchor(placement, [parent]);
      const contact = hearthFurniturePresentationAnchor(parent, [])!;
      if (anchor !== null) result.set(placement.id, { placement, rootId: parent.id, anchor, contact });
    } else {
      const anchor = hearthFurniturePresentationAnchor(placement, [])!;
      result.set(placement.id, { placement, rootId: placement.id, anchor, contact: anchor });
    }
  }
  return result;
}

/** Parent first, then attachments in a stable order: no lifted foot sort can
 * put the lamp behind its own table. Other actors sort against the parent base. */
export function hearthFurnitureDrawGroup(scene: ReadonlyMap<string, HearthFurnitureSceneEntry>, rootId: string): readonly HearthFurnitureSceneEntry[] {
  const root = scene.get(rootId);
  if (!root || root.rootId !== rootId) return [];
  const attachments = [...scene.values()].filter(entry => entry.rootId === rootId && entry.placement.id !== rootId)
    .sort((a, b) => a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x || a.placement.id.localeCompare(b.placement.id));
  return [root, ...attachments];
}
