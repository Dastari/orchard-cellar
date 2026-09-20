export type InteractionTargetKind =
  | 'portal'
  | 'placeable'
  | 'chest'
  | 'campfire'
  | 'merchant'
  | 'player'
  | 'horse'
  | 'boat'
  | 'gatherable'
  | 'orchard'
  | 'crop'
  | 'quest_item'
  | 'embedded_arrow'
  | 'hearth_stash'
  | 'hearth_supply_cache'
  | 'ferry'
  | 'outdoor_encounter'
  | 'rogue_entrance'
  | 'rogue_door'
  | 'world_item';

export interface InteractionCandidate {
  readonly kind: InteractionTargetKind;
  /** Interaction point in the same fixed-point coordinate space as the player. */
  readonly x: number;
  readonly y: number;
  /** Stable row/tile identity used only after distance and kind are tied. */
  readonly stableId: string;
}

const TIE_PRIORITY: Readonly<Record<InteractionTargetKind, number>> = {
  portal: 0,
  placeable: 1,
  chest: 2,
  hearth_stash:2,
  hearth_supply_cache:2,
  campfire: 3,
  merchant: 4,
  player: 5,
  horse: 6,
  boat: 7,
  gatherable: 8,
  crop: 9,
  orchard: 9,
  quest_item: 10,
  embedded_arrow: 11,
  rogue_entrance: 12,
  rogue_door: 13,
  world_item: 14,
  outdoor_encounter: 15,
  ferry:16,
};

/** Resolves the one target represented by the interaction prompt and E key.
 * Type priority is deliberately only a tie-breaker: a closer target of any
 * kind always wins. */
export function nearestInteractionCandidate<T extends InteractionCandidate>(
  playerX: number,
  playerY: number,
  candidates: Iterable<T>,
): T | null {
  let nearest: T | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dx = candidate.x - playerX;
    const dy = candidate.y - playerY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < nearestDistanceSquared) {
      nearest = candidate;
      nearestDistanceSquared = distanceSquared;
      continue;
    }
    if (distanceSquared !== nearestDistanceSquared || nearest === null) continue;
    const priority = TIE_PRIORITY[candidate.kind] - TIE_PRIORITY[nearest.kind];
    if (priority < 0 || (priority === 0 && candidate.stableId < nearest.stableId)) nearest = candidate;
  }
  return nearest;
}
