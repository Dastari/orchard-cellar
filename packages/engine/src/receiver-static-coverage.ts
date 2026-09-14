import { blitReceiverCoverage, createReceiverCoverage, type PreparedCaster,
  type ReceiverCoverageBounds, type ReceiverCoverageChannels } from './receiver-coverage.js';
import { StaticMaskSamples } from './receiver-static-mask-samples.js';

interface StaticField extends ReceiverCoverageBounds { readonly channels: ReceiverCoverageChannels }
const ALIGNMENT = 64, PADDING = 128;

/** Static mask texels survive small camera-window changes. The viewport working
 * field remains separate, so moving casters never modify a padded static field. */
export class PaddedStaticCoverage {
  private readonly fields: StaticField[] = [];
  private retainedBytes = 0;
  private readonly samples: StaticMaskSamples;
  builds = 0;
  constructor(readonly budgetBytes = 2 * 1024 * 1024) { this.samples = new StaticMaskSamples(Math.floor(budgetBytes / 2)); }
  get bytes(): number { return this.retainedBytes + this.samples.bytes; }

  /** Returns false for grids that cannot be copied exactly, or oversized fields.
   * Such callers retain the original direct mask blit, without resampling. */
  copyInto(target: ReceiverCoverageChannels, bounds: ReceiverCoverageBounds,
    casters: readonly PreparedCaster[]): boolean {
    const { left, top, width, height, step, receiverHeight } = bounds;
    if (!Number.isInteger(ALIGNMENT / step) || !Number.isInteger(left / step)
      || !Number.isInteger(top / step)) return false;
    const right = left + width * step, bottom = top + height * step;
    const bucketLeft = Math.floor(left / ALIGNMENT) * ALIGNMENT;
    const bucketTop = Math.floor(top / ALIGNMENT) * ALIGNMENT;
    // Reserve the entire camera bucket. Refresh at its 64px boundary rather
    // than four pixels after the previous field's last supported viewport.
    const bucketRight = bucketLeft + ALIGNMENT - step + width * step;
    const bucketBottom = bucketTop + ALIGNMENT - step + height * step;
    let field: StaticField | undefined;
    for (const candidate of this.fields) {
      if (candidate.step === step && candidate.receiverHeight === receiverHeight
        && bucketLeft >= candidate.left && bucketTop >= candidate.top
        && bucketRight <= candidate.left + candidate.width * step
        && bucketBottom <= candidate.top + candidate.height * step) { field = candidate; break; }
    }
    if (field === undefined) {
      const paddedLeft = Math.floor(left / ALIGNMENT) * ALIGNMENT - PADDING;
      const paddedTop = Math.floor(top / ALIGNMENT) * ALIGNMENT - PADDING;
      const paddedWidth = (Math.ceil(right / ALIGNMENT) * ALIGNMENT + PADDING - paddedLeft) / step;
      const paddedHeight = (Math.ceil(bottom / ALIGNMENT) * ALIGNMENT + PADDING - paddedTop) / step;
      const bytes = paddedWidth * paddedHeight * 3;
      const fieldBudget = this.budgetBytes - this.samples.budgetBytes;
      if (bytes > fieldBudget) return false;
      while (this.retainedBytes + bytes > fieldBudget || this.fields.length >= 64) {
        const oldest = this.fields.shift()!;
        this.retainedBytes -= oldest.width * oldest.height * 3;
      }
      field = { left: paddedLeft, top: paddedTop, width: paddedWidth, height: paddedHeight,
        step, receiverHeight, channels: createReceiverCoverage(paddedWidth * paddedHeight) };
      blitReceiverCoverage(field.channels, casters, field, this.samples);
      this.fields.push(field); this.retainedBytes += bytes; this.builds++;
    }
    const offsetX = (left - field.left) / step, offsetY = (top - field.top) / step;
    const source = field.channels;
    // Copy retained bytes without allocating row views or changing sample centres.
    for (let y = 0; y < height; y++) {
      let from = (offsetY + y) * field.width + offsetX, to = y * width;
      const end = to + width;
      for (; to < end; from++, to++) {
        target.sun[to] = source.sun[from]!;
        target.moon[to] = source.moon[from]!;
        target.contact[to] = source.contact[from]!;
      }
    }
    return true;
  }
  clearFields(): void { this.fields.length = 0; this.retainedBytes = 0; this.builds = 0; }
  reset(): void { this.clearFields(); this.samples.reset(); }
}
