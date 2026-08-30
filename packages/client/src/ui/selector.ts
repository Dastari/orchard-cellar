import type { LoadedAsset } from '../render/assets.js';
import type { UiRect } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

export const AUTHORED_SELECTOR_COLUMNS = 4;
export const AUTHORED_SELECTOR_ROWS = 20;
export const AUTHORED_SELECTOR_COUNT = AUTHORED_SELECTOR_COLUMNS * AUTHORED_SELECTOR_ROWS;

export interface AuthoredSelectorCell {
  readonly column: number;
  readonly row: number;
}

export function authoredSelectorCellIndex(cell: AuthoredSelectorCell): number {
  const column = Math.max(0, Math.min(AUTHORED_SELECTOR_COLUMNS - 1, Math.floor(cell.column)));
  const row = Math.max(0, Math.min(AUTHORED_SELECTOR_ROWS - 1, Math.floor(cell.row)));
  return row * AUTHORED_SELECTOR_COLUMNS + column;
}

export function drawAuthoredSelectorCell(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  rect: UiRect,
  cell: AuthoredSelectorCell | number,
  opacity = 1,
): void {
  const frame = typeof cell === 'number'
    ? Math.max(0, Math.min(AUTHORED_SELECTOR_COUNT - 1, Math.floor(cell)))
    : authoredSelectorCellIndex(cell);
  context.save();
  context.globalAlpha *= opacity;
  drawUiSkinAsset(context, asset, rect, 'catalog', frame);
  context.restore();
}

export type SemanticSelectorTone = 'neutral' | 'confirm' | 'deny';

/** Draws the stable semantic selector used by slots and menu focus. The full
 * 80-cell source catalog remains available through `drawAuthoredSelectorCell`. */
export function drawSemanticSelector(
  context: CanvasRenderingContext2D,
  skin: Pick<UiSkin, 'selectorNeutral' | 'selectorConfirm' | 'selectorDeny'>,
  rect: UiRect,
  tone: SemanticSelectorTone = 'neutral',
  opacity = 1,
): void {
  const asset = tone === 'confirm' ? skin.selectorConfirm
    : tone === 'deny' ? skin.selectorDeny : skin.selectorNeutral;
  context.save();
  context.globalAlpha *= opacity;
  drawUiSkinAsset(context, asset, rect, 'idle');
  context.restore();
}
