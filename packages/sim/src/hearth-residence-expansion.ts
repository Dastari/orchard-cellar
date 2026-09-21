import { RESIDENCE_EXPANSION_COSTS_BRONZE } from './balance.js';
import {planHearthSeating} from './hearth-seating.js';
import type {Vec2Fixed} from './state.js';
import {hearthFurnitureLayoutFailure, type HearthFurniturePlacementContext} from './hearth-furniture-placement.js';
import {RESIDENCE_EXIT_TILE, residenceEnvelopeSize, residenceReservedTiles} from './spaces.js';

/** Authority supplies the next terrain with persisted architectural obstacles.
 * Invalid/stale ranks fail rather than charging for a repeated or skipped room. */
export function hearthResidenceExpansionFailure(
  currentRank: number,
  requestedRank: number,
  nextLayout: Omit<HearthFurniturePlacementContext, 'reserved' | 'exit'>,
  seatedOccupants: readonly {readonly seatId: string; readonly position: Vec2Fixed}[] = [],
): string | null {
  if (!Number.isInteger(currentRank) || currentRank < 0 || currentRank > 1
    || requestedRank !== currentRank + 1) return 'invalid_expansion_rank';
  const size = residenceEnvelopeSize(requestedRank);
  if (nextLayout.collision.width !== size || nextLayout.collision.height !== size
    || nextLayout.collision.blocked.length !== size * size) return 'invalid_expansion_layout';
  const seatIds = new Set(seatedOccupants.map(occupant => occupant.seatId));
  if (seatIds.size !== seatedOccupants.length) return 'invalid_seat_custody';
  // Authority must partition persisted occupants into standing and seated rows.
  // We validate virtual stand destinations, never mutate actors or seat custody.
  const standing = [...nextLayout.occupants];
  for (const occupant of seatedOccupants) {
    const seat = nextLayout.existing.find(item => item.id === occupant.seatId);
    if (!seat) return 'invalid_seat_custody';
    const plan = planHearthSeating({seat, furniture: nextLayout.existing, collision: nextLayout.collision,
      actor: occupant.position, seatOccupied: false, occupants: [
        ...nextLayout.occupants, ...seatedOccupants.filter(other => other !== occupant).map(other => other.position),
      ]});
    if (plan.failure !== null) return plan.failure;
    if (plan.seated.x !== occupant.position.x || plan.seated.y !== occupant.position.y) return 'invalid_seat_custody';
    standing.push(plan.stand);
  }
  const required = residenceReservedTiles(requestedRank);
  return hearthFurnitureLayoutFailure({...nextLayout, occupants: standing, reserved: required, exit: RESIDENCE_EXIT_TILE}, [
    ...residenceReservedTiles(0), {tileX: 14, tileY: 9}, {tileX: 16, tileY: 9},
    ...(requestedRank === 2 ? [{tileX: 21, tileY: 14}, {tileX: 21, tileY: 16}] : []),
  ]);
}


/** Doc 06 permanent housing prices preserve bottle income and create repeated-production goals.
 * Sequential ranks keep quotes and authority charges identical. */
export function hearthResidenceExpansionQuote(currentRank: number): {rank: 1 | 2; costBronze: bigint; name: string} | null {
  if (currentRank === 0) return {rank: 1, costBronze: RESIDENCE_EXPANSION_COSTS_BRONZE[0], name: 'East room'};
  if (currentRank === 1) return {rank: 2, costBronze: RESIDENCE_EXPANSION_COSTS_BRONZE[1], name: 'South room'};
  return null;
}
