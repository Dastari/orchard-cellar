export type WorldScalePolicy = '1x' | '2x' | 'native';

export function worldPresentLayout(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const factor = Math.max(1, Math.floor(Math.min(width / sourceWidth, height / sourceHeight)));
  const nearestWidth = sourceWidth * factor, nearestHeight = sourceHeight * factor;
  return { factor, nearestWidth, nearestHeight,
    exact: nearestWidth === width && nearestHeight === height };
}

/** Reusable nearest stage. Canvas native keeps its original direct smooth
 * present; exact integer upscales elide the identity second copy. */
export class CanvasWorldPresent {
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  constructor() {
    const context = this.canvas.getContext('2d');
    if (context === null) throw new Error('World present Canvas 2D unavailable');
    this.context = context;
    this.canvas.width = this.canvas.height = 0;
  }
  reserve(width: number, height: number): void {
    if (this.canvas.width < width) this.canvas.width = width;
    if (this.canvas.height < height) this.canvas.height = height;
  }
  get bytes(): number { return this.canvas.width * this.canvas.height * 4; }
  draw(target: CanvasRenderingContext2D, source: HTMLCanvasElement,
    sourceWidth: number, sourceHeight: number, width: number, height: number): void {
    const present = worldPresentLayout(sourceWidth, sourceHeight, width, height);
    if (present.factor === 1 || present.exact) {
      target.imageSmoothingEnabled = !present.exact;
      target.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
      return;
    }
    // Capacity is reserved at resize/policy change, never during an eased zoom.
    if (present.nearestWidth > this.canvas.width || present.nearestHeight > this.canvas.height) {
      throw new Error('world_present_capacity_not_reserved');
    }
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.globalAlpha = 1;
    this.context.globalCompositeOperation = 'copy';
    this.context.imageSmoothingEnabled = false;
    this.context.drawImage(source, 0, 0, sourceWidth, sourceHeight,
      0, 0, present.nearestWidth, present.nearestHeight);
    target.imageSmoothingEnabled = true;
    target.drawImage(this.canvas, 0, 0, present.nearestWidth, present.nearestHeight, 0, 0, width, height);
  }
}
