export type SelectedEntityTarget =
  | { readonly kind: 'player'; readonly id: string }
  | { readonly kind: 'npc'; readonly id: bigint };

export interface TargetableWorldEntity {
  readonly target: SelectedEntityTarget;
  /** Authored foot anchor in world pixels. */
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly height: number;
}

/** Chooses the closest visible sprite under the pointer. Distance is measured
 * from the sprite's visual centre, then the front-most foot anchor breaks ties. */
export function entityTargetAtWorldPoint(
  worldX: number,
  worldY: number,
  entities: readonly TargetableWorldEntity[],
): SelectedEntityTarget | null {
  let best: { readonly entity: TargetableWorldEntity; readonly distance: number } | null = null;
  for (const entity of entities) {
    if (worldX < entity.x - entity.halfWidth || worldX > entity.x + entity.halfWidth
      || worldY < entity.y - entity.height || worldY > entity.y + 3) continue;
    const centreY = entity.y - entity.height / 2;
    const distance = (worldX - entity.x) ** 2 + (worldY - centreY) ** 2;
    if (best === null || distance < best.distance
      || (distance === best.distance && entity.y > best.entity.y)) best = { entity, distance };
  }
  return best?.entity.target ?? null;
}

export function targetKey(target: SelectedEntityTarget): string {
  return `${target.kind}:${target.id.toString()}`;
}

export function sameEntityTarget(left: SelectedEntityTarget, right: SelectedEntityTarget): boolean {
  return left.kind === right.kind && left.id === right.id;
}
