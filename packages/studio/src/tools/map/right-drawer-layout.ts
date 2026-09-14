import type { UiRect } from '@orchard/ui';

export interface MapRightDrawerCards {
  readonly selection: UiRect | null;
  readonly layers: UiRect;
}

function inset(bounds: UiRect, amount: number): UiRect {
  return {
    x: bounds.x + amount,
    y: bounds.y + amount,
    width: Math.max(1, bounds.width - amount * 2),
    height: Math.max(1, bounds.height - amount * 2),
  };
}

/** Deterministic floating-card geometry. The split deliberately avoids a
 * second retained resize interaction inside the already-resizable shell
 * drawer: selection receives up to 430px for composed tiles (320px otherwise).
 * Layers retains a useful share on short viewports. */
export function mapRightDrawerCards(bounds: UiRect, hasSelection: boolean, composition = false): MapRightDrawerCards {
  const content = inset(bounds, 4);
  if (!hasSelection) return Object.freeze({ selection: null, layers: Object.freeze(content) });
  const gap = 8;
  const available = Math.max(2, content.height - gap);
  const layersMinimum = Math.min(170, Math.floor(available * 0.52));
  const selectionHeight = Math.max(1, Math.min(composition ? 430 : 320, available - layersMinimum));
  return Object.freeze({
    selection: Object.freeze({
      x: content.x,
      y: content.y,
      width: content.width,
      height: selectionHeight,
    }),
    layers: Object.freeze({
      x: content.x,
      y: content.y + selectionHeight + gap,
      width: content.width,
      height: Math.max(1, available - selectionHeight),
    }),
  });
}
