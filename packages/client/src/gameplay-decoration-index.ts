import type { VisibleWorldBounds } from '@orchard/engine/camera';
import type { RuntimeSurvivalDecoration } from './gameplay-painter-inputs.js';

const CELL = 256;
const numericOrder = (left: number, right: number): number => left - right;
/** An immutable decoration cohort is indexed once. The numeric query retains
 * original producer order and includes both artwork and carried-light bounds.
 * Exact point visibility and mutable campfire state remain producer decisions. */
export class GameplayDecorationIndex {
  private readonly columns = new Map<number, Map<number, number[]>>();
  private readonly selected: number[] = [];
  private left = Infinity;
  private right = Infinity;
  private top = Infinity;
  private bottom = Infinity;
  readonly diagnostics = { indexed: 0, queries: 0, queryReuses: 0 };

  constructor(readonly decorations: readonly RuntimeSurvivalDecoration[], suppressions: readonly string[]) {
    const hidden = new Set(suppressions);
    for (let index = 0; index < decorations.length; index++) {
      const decoration = decorations[index]!;
      if (hidden.has(String(decoration.id)) || hidden.has(`decoration-${decoration.id}`)
        || hidden.has(`decoration:${decoration.id}`)) continue;
      const x = Math.floor((decoration.tileX * 16 + 8) / CELL);
      const y = Math.floor(((decoration.tileY + 1) * 16) / CELL);
      let column = this.columns.get(x);
      if (column === undefined) { column = new Map(); this.columns.set(x, column); }
      let cell = column.get(y);
      if (cell === undefined) { cell = []; column.set(y, cell); }
      cell.push(index); this.diagnostics.indexed++;
    }
  }

  query(visible: VisibleWorldBounds, lightVisible?: VisibleWorldBounds): readonly number[] {
    const left = Math.floor(Math.min(visible.left, lightVisible?.left ?? visible.left) / CELL);
    const right = Math.floor(Math.max(visible.right, lightVisible?.right ?? visible.right) / CELL);
    const top = Math.floor(Math.min(visible.top, lightVisible?.top ?? visible.top) / CELL);
    const bottom = Math.floor(Math.max(visible.bottom, lightVisible?.bottom ?? visible.bottom) / CELL);
    if (left === this.left && right === this.right && top === this.top && bottom === this.bottom) {
      this.diagnostics.queryReuses++; return this.selected;
    }
    this.left = left; this.right = right; this.top = top; this.bottom = bottom;
    this.selected.length = 0; this.diagnostics.queries++;
    for (let x = left; x <= right; x++) {
      const column = this.columns.get(x);
      if (column === undefined) continue;
      for (let y = top; y <= bottom; y++) {
        const cell = column.get(y);
        if (cell !== undefined) for (const index of cell) this.selected.push(index);
      }
    }
    this.selected.sort(numericOrder);
    return this.selected;
  }
}
