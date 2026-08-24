import type { Vec2Fixed } from '@orchard/sim';

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
