import type { PreparedCaster } from './receiver-coverage.js';

const CELL = 4;
const EMPTY = new Uint32Array(0);
const EMPTY_BOUNDS = new Float64Array(0);

/** Conservative broad phase only. Each cell retains original caster order;
 * the caller still performs the exact per-caster resolve and owner exclusion.
 * Dense CSR storage is bounded and reused for moving cohorts. Oversized or
 * non-finite geometry falls back to the complete ordered cohort. */
export class ReceiverCandidateIndex {
  private items: readonly PreparedCaster[] = [];
  private bounds = EMPTY_BOUNDS;
  private offsets = EMPTY;
  private cursors = EMPTY;
  private entries = EMPTY;
  private left = 0;
  private top = 0;
  private width = 0;
  private height = 0;
  indexed = false;
  start = 0;
  end = 0;

  get bytes(): number { return this.bounds.byteLength + this.offsets.byteLength + this.cursors.byteLength + this.entries.byteLength; }

  private fallback(): void {
    this.bounds = EMPTY_BOUNDS; this.offsets = this.cursors = this.entries = EMPTY;
    this.indexed = false; this.start = 0; this.end = this.items.length;
  }

  rebuild(items: readonly PreparedCaster[], receiverHeight: number, budgetBytes: number): void {
    this.items = items;
    if (items.length * 32 > budgetBytes) { this.fallback(); return; }
    if (this.bounds.length < items.length * 4) this.bounds = new Float64Array(items.length * 4);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, references = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!, caster = item.caster;
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (let channel = 0; channel < 2; channel++) {
        const mask = channel === 0 ? item.sun : item.moon;
        if (mask === null) continue;
        // sampleDirectionalMask integrates a one-pixel square, so a receiver
        // half a pixel outside the mask can still receive nonzero coverage.
        l = Math.min(l, caster.worldX + mask.left - 0.5);
        t = Math.min(t, caster.worldY + mask.top - 0.5);
        r = Math.max(r, caster.worldX + mask.left + mask.width + 0.5);
        b = Math.max(b, caster.worldY + mask.top + mask.height + 0.5);
      }
      if (caster.contact && caster.baseHeightSubunits === receiverHeight) {
        const f = caster.footprint;
        const x = caster.worldX + (f.left + f.right) / 2, y = caster.worldY + (f.top + f.bottom) / 2;
        const rx = Math.max(1, (f.right - f.left) / 2 + 1), ry = Math.max(1, (f.bottom - f.top) / 2 + 1);
        l = Math.min(l, x - rx); t = Math.min(t, y - ry);
        r = Math.max(r, x + rx); b = Math.max(b, y + ry);
      }
      const index = i * 4;
      if (l === Infinity && r === -Infinity) { this.bounds[index] = Infinity; continue; }
      l = Math.floor(l / CELL); t = Math.floor(t / CELL);
      r = Math.floor(r / CELL); b = Math.floor(b / CELL);
      if (!Number.isSafeInteger(l) || !Number.isSafeInteger(t) || !Number.isSafeInteger(r) || !Number.isSafeInteger(b)) { this.fallback(); return; }
      this.bounds[index] = l; this.bounds[index + 1] = t;
      this.bounds[index + 2] = r; this.bounds[index + 3] = b;
      references += (r - l + 1) * (b - t + 1);
      left = Math.min(left, l); top = Math.min(top, t); right = Math.max(right, r); bottom = Math.max(bottom, b);
    }
    const width = right < left ? 0 : right - left + 1, height = bottom < top ? 0 : bottom - top + 1;
    const cells = width * height;
    const bytes = this.bounds.byteLength + Math.max(this.offsets.length, cells + 1) * 4
      + Math.max(this.cursors.length, cells) * 4 + Math.max(this.entries.length, references) * 4;
    if (!Number.isSafeInteger(cells) || !Number.isSafeInteger(references) || bytes > budgetBytes) { this.fallback(); return; }
    this.left = left; this.top = top; this.width = width; this.height = height;
    if (this.offsets.length < cells + 1) this.offsets = new Uint32Array(cells + 1);
    else this.offsets.fill(0, 0, cells + 1);
    if (this.cursors.length < cells) this.cursors = new Uint32Array(cells);
    if (this.entries.length < references) this.entries = new Uint32Array(references);
    for (let i = 0; i < items.length; i++) {
      const p = i * 4, l = this.bounds[p]!;
      if (l === Infinity) continue;
      for (let y = this.bounds[p + 1]!; y <= this.bounds[p + 3]!; y++) {
        for (let x = l; x <= this.bounds[p + 2]!; x++) this.offsets[(y - top) * width + x - left + 1]!++;
      }
    }
    for (let i = 1; i <= cells; i++) this.offsets[i]! += this.offsets[i - 1]!;
    for (let i = 0; i < cells; i++) this.cursors[i] = this.offsets[i]!;
    for (let i = 0; i < items.length; i++) {
      const p = i * 4, l = this.bounds[p]!;
      if (l === Infinity) continue;
      for (let y = this.bounds[p + 1]!; y <= this.bounds[p + 3]!; y++) {
        for (let x = l; x <= this.bounds[p + 2]!; x++) {
          const cell = (y - top) * width + x - left;
          this.entries[this.cursors[cell]!++] = i;
        }
      }
    }
    this.indexed = true;
  }

  query(x: number, y: number): void {
    if (!this.indexed || !Number.isFinite(x) || !Number.isFinite(y)) {
      this.start = 0; this.end = this.items.length;
      // Non-finite receivers must retain the reference loop's NaN behavior.
      this.queryUsesIndex = false; return;
    }
    this.queryUsesIndex = true;
    const column = Math.floor(x / CELL) - this.left, row = Math.floor(y / CELL) - this.top;
    if (column < 0 || row < 0 || column >= this.width || row >= this.height || this.width === 0) {
      this.start = this.end = 0; return;
    }
    const cell = row * this.width + column;
    this.start = this.offsets[cell]!; this.end = this.offsets[cell + 1]!;
  }

  private queryUsesIndex = false;
  at(index: number): PreparedCaster { return this.items[this.queryUsesIndex ? this.entries[index]! : index]!; }
}
