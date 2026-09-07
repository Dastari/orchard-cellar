/** CPU raster evidence only. These bytes already exist before Canvas upload;
 * inspecting them never reads a world or lighting surface back from the GPU. */
export interface GroundRunLightPlane {
  readonly canvas: HTMLCanvasElement;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  readonly revision: number;
  readonly left: number; readonly top: number; readonly step: number;
}

export function groundRunStampBytes(width: number, height: number, step: number): number {
  return (Math.ceil(width / step) + 5) * (Math.ceil(height / step) + 5) * 4;
}

/** Retain the texels which can influence this run, including two extra texels
 * on each side of Canvas's bilinear upscale. Outside-image samples carry zero
 * alpha, so moving the raster boundary also invalidates the proof. */
export class GroundRunLightStamp {
  private readonly pixels: Uint8ClampedArray;
  private readonly columns: number;
  private readonly rows: number;
  private initialized = false;
  private identity = -1;
  private revision = -1;
  private left = 0;
  private top = 0;
  private width = 0;
  private height = 0;
  private phaseX = 0;
  private phaseY = 0;

  constructor(width: number, height: number, readonly step: number) {
    this.columns = Math.ceil(width / step) + 5; this.rows = Math.ceil(height / step) + 5;
    this.pixels = new Uint8ClampedArray(this.columns * this.rows * 4);
  }
  get bytes(): number { return this.pixels.byteLength; }

  update(plane: GroundRunLightPlane, identity: number, x: number, y: number): boolean {
    const width = plane.canvas.width, height = plane.canvas.height;
    if (this.initialized && this.identity === identity && this.revision === plane.revision
      && this.left === plane.left && this.top === plane.top && this.width === width && this.height === height) return true;
    const localX = (x - plane.left) / this.step, localY = (y - plane.top) / this.step;
    const floorX = Math.floor(localX), floorY = Math.floor(localY);
    const phaseX = localX - floorX, phaseY = localY - floorY;
    const firstX = floorX - 2, firstY = floorY - 2;
    let same = this.initialized && this.phaseX === phaseX && this.phaseY === phaseY;
    // Always refresh the small retained proof when the plane changes. No new
    // arrays, closures, ImageData or surfaces are created on this path.
    for (let row = 0; row < this.rows; row++) for (let column = 0; column < this.columns; column++) {
      const px = firstX + column, py = firstY + row;
      const inside = px >= 0 && py >= 0 && px < width && py < height;
      const source = (py * width + px) * 4, target = (row * this.columns + column) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const value = inside ? plane.pixels[source + channel]! : 0;
        if (this.pixels[target + channel] !== value) same = false;
        this.pixels[target + channel] = value;
      }
    }
    this.initialized = true; this.identity = identity; this.revision = plane.revision;
    this.left = plane.left; this.top = plane.top; this.width = width; this.height = height;
    this.phaseX = phaseX; this.phaseY = phaseY;
    return same;
  }
}
