import { hearthFurnitureCells, hearthFurniturePlacementFailure, hearthFurnitureDefinition,
  hearthFurnitureHasAttachments,
  combatSegmentObstructed, TILE_SIZE_FIXED,
  type ContentRegistry, type HearthFurniturePlacement, type HearthFurniturePlacementContext, type Vec2Fixed,
} from '@orchard/sim';

export function furniturePickupFailure(item: HearthFurniturePlacement, items: readonly HearthFurniturePlacement[],
  position: Vec2Fixed, collision: HearthFurniturePlacementContext['collision'], inUse: boolean): string | null {
  if (hearthFurnitureHasAttachments(item.id, items)) return 'Pick up the attached items first';
  if (inUse) return 'Close the furniture before picking it up';
  const dx = position.x - (item.tileX + .5) * TILE_SIZE_FIXED, dy = position.y - (item.tileY + .5) * TILE_SIZE_FIXED;
  const target = { x: (item.tileX + .5) * TILE_SIZE_FIXED, y: (item.tileY + (item.shape.layer === 'wall' ? 1.5 : .5)) * TILE_SIZE_FIXED };
  if (dx * dx + dy * dy > (4 * TILE_SIZE_FIXED) ** 2 || combatSegmentObstructed(position, target, collision)) return 'Move closer with a clear approach';
  return null;
}

/** Topmost logical layer wins so a lamp can be picked up before its table. */
export function furnitureAtTile(items: readonly HearthFurniturePlacement[], tileX: number, tileY: number): HearthFurniturePlacement | null {
  const priority = { tabletop: 3, wall: 2, standing: 1, floor: 0 };
  return items.filter(item => hearthFurnitureCells(item).some(cell => cell.tileX === tileX && cell.tileY === tileY))
    .sort((a, b) => priority[b.shape.layer] - priority[a.shape.layer] || a.id.localeCompare(b.id))[0] ?? null;
}

export function furnishingPreview(registry: ContentRegistry, context: HearthFurniturePlacementContext,
  position: Vec2Fixed, itemKind: string, tileX: number, tileY: number, quantity: number, movingId?: string) {
  const eligible = hearthFurnitureDefinition(registry, itemKind);
  if (!eligible) return { candidate: null, failure: 'Choose an available furniture item' };
  const { shape } = eligible;
  if (movingId !== undefined && hearthFurnitureHasAttachments(movingId, context.existing)) {
    return { candidate: null, failure: 'Move the attached items first' };
  }
  context = { ...context, existing: context.existing.filter(item => item.id !== movingId) };
  let candidate: HearthFurniturePlacement = { id: movingId ?? 'preview', shape, tileX, tileY };
  if (shape.layer === 'tabletop') {
    const support = context.existing.find(item => {
      const surface = item.shape.tabletopSurface;
      if (!surface || item.shape.layer !== 'standing') return false;
      const left = item.tileX - Math.floor((item.shape.width - 1) / 2) + surface.insetLeft;
      const top = item.tileY - item.shape.height + 1 + surface.insetTop;
      return hearthFurnitureCells(candidate).every(cell => cell.tileX >= left && cell.tileX < left + surface.width
        && cell.tileY >= top && cell.tileY < top + surface.height);
    });
    if (support) candidate = { ...candidate, supportId: support.id };
  }
  if (quantity < 1) return { candidate, failure: 'You need this furniture in your bag' };
  const dx = position.x - (tileX + .5) * TILE_SIZE_FIXED, dy = position.y - (tileY + .5) * TILE_SIZE_FIXED;
  const target = { x: (tileX + .5) * TILE_SIZE_FIXED, y: (tileY + (shape.layer === 'wall' ? 1.5 : .5)) * TILE_SIZE_FIXED };
  if (dx * dx + dy * dy > (4 * TILE_SIZE_FIXED) ** 2 || combatSegmentObstructed(position, target, context.collision)) {
    return { candidate, failure: 'Move closer with a clear approach' };
  }
  const failure = hearthFurniturePlacementFailure(context, candidate);
  const labels = { builder_required: 'Builder access required', invalid_placement: 'Cannot place here', outside_residence: 'Choose indoor floor',
    reserved_approach: 'Keep the doorway clear', furniture_overlap: 'Furniture overlaps', wall_required: 'Choose a front-facing wall',
    tabletop_support_required: 'Choose a tabletop', occupant_blocked: 'Someone is standing here', escape_blocked: 'Keep an escape route open' };
  return { candidate, failure: failure === null ? null : labels[failure] };
}
