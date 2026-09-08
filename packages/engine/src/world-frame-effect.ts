/** Effects replace an enclosing effect, matching the former Canvas filter scope. */
export type WorldFrameEffect = 'dim' | 'enemy-hit' | 'wildlife-hit' | 'placement-valid' | 'placement-invalid';
const effects = new WeakMap<CanvasRenderingContext2D, WorldFrameEffect>();
export function worldFrameEffect(context: CanvasRenderingContext2D): WorldFrameEffect | undefined { return effects.get(context); }
export function withWorldFrameEffect(context: CanvasRenderingContext2D, effect: WorldFrameEffect | undefined, draw: () => void): void {
  const previous = effects.get(context);
  if (effect !== undefined) effects.set(context, effect);
  try { draw(); } finally {
    if (previous === undefined) effects.delete(context); else effects.set(context, previous);
  }
}
export function worldFrameEffectId(effect: WorldFrameEffect | undefined): number {
  switch (effect) {
    case 'dim': return 1;
    case 'enemy-hit': return 2;
    case 'wildlife-hit': return 3;
    case 'placement-valid': return 4;
    case 'placement-invalid': return 5;
    case undefined: return 0;
  }
}
