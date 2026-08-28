export interface CaveFloorAutotilePlan {
  /** Raw row-major frame in Cave_Floor_1's 3×5 sheet. Null uses plain middle. */
  readonly transitionFrame: number | null;
  readonly insetFrames: readonly number[];
}

/** Resolves the normal-floor side of a rocky-floor boundary. Re-run this for
 * the edited cell and its eight neighbours whenever the rocky mask changes. */
export function caveFloorAutotilePlan(
  rockyAt: (offsetX: number, offsetY: number) => boolean,
): CaveFloorAutotilePlan {
  if (rockyAt(0, 0)) return { transitionFrame: 10, insetFrames: [] };
  const north = rockyAt(0, -1);
  const east = rockyAt(1, 0);
  const south = rockyAt(0, 1);
  const west = rockyAt(-1, 0);
  let transitionFrame: number | null = null;
  if (north && west) transitionFrame = 14;
  else if (north && east) transitionFrame = 12;
  else if (south && west) transitionFrame = 8;
  else if (south && east) transitionFrame = 6;
  else if (north) transitionFrame = 13;
  else if (east) transitionFrame = 9;
  else if (south) transitionFrame = 7;
  else if (west) transitionFrame = 11;

  const insetFrames: number[] = [];
  if (!north && !west && rockyAt(-1, -1)) insetFrames.push(4);
  if (!north && !east && rockyAt(1, -1)) insetFrames.push(3);
  if (!south && !west && rockyAt(-1, 1)) insetFrames.push(1);
  if (!south && !east && rockyAt(1, 1)) insetFrames.push(0);
  return { transitionFrame, insetFrames };
}
