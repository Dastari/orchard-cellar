export interface BoundedStepperModifiers {
  readonly shift?: boolean;
  readonly control?: boolean;
}

export type StepperDirection = -1 | 1;

/**
 * Applies the shared input rules for bounded +/- controls.
 * A regular click moves one, Shift-click moves ten, and Control-click moves
 * directly to the relevant limit.
 */
export function boundedStepperValue(
  current: number,
  direction: StepperDirection,
  minimum: number,
  maximum: number,
  modifiers: BoundedStepperModifiers = {},
): number {
  if (modifiers.control) return direction > 0 ? maximum : minimum;
  const delta = direction * (modifiers.shift ? 10 : 1);
  return Math.max(minimum, Math.min(maximum, current + delta));
}
