import { TILE_SIZE_FIXED, type Direction, type PlayerState, type Vec2Fixed } from '@orchard/sim';

const SNAP_DISTANCE_SQUARED = (TILE_SIZE_FIXED * 2) ** 2;

function settleAxis(current: number, authoritative: number): number {
  const delta = authoritative - current;
  if (delta === 0) return current;
  return current + Math.sign(delta) * Math.max(1, Math.floor(Math.abs(delta) / 3));
}

export function reconcilePredictedPlayer(
  predicted: PlayerState | null,
  authoritative: PlayerState,
  direction: Direction | null,
  inputAcknowledged: boolean,
): PlayerState {
  if (predicted === null) return authoritative;
  const dx = authoritative.position.x - predicted.position.x;
  const dy = authoritative.position.y - predicted.position.y;
  if (dx * dx + dy * dy > SNAP_DISTANCE_SQUARED) return authoritative;
  if (direction !== null || !inputAcknowledged || (dx === 0 && dy === 0)) return predicted;
  return {
    ...predicted,
    position: {
      x: settleAxis(predicted.position.x, authoritative.position.x),
      y: settleAxis(predicted.position.y, authoritative.position.y),
    },
  };
}

export function interpolateFixedPosition(
  previous: Vec2Fixed,
  current: Vec2Fixed,
  alpha: number,
): Vec2Fixed {
  const amount = Math.max(0, Math.min(1, alpha));
  return {
    x: previous.x + (current.x - previous.x) * amount,
    y: previous.y + (current.y - previous.y) * amount,
  };
}
