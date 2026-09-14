import type {
  MapEditorOverviewPixels,
  MapOverviewLayer,
} from './editor-terrain-derivatives.js';

const MATERIALIZATION_ORDER: readonly MapOverviewLayer[] = [
  'combined',
  'generated_base',
  'terrain',
];

type Schedule = (task: () => void) => unknown;
type Cancel = (handle: unknown) => void;

/** Materializes at most one transferred overview layer per browser task.
 * Identity checks make stale terrain completions harmless; dispose cancels the
 * next task and releases every already-created backing surface. */
export class IncrementalMapOverviewCache<Image> {
  #identity: object | null = null;
  #pixels: MapEditorOverviewPixels | null = null;
  #images: Partial<Record<MapOverviewLayer, Image>> = {};
  #nextLayer = 0;
  #scheduled: unknown | null = null;
  #disposed = false;

  constructor(
    private readonly createImage: (
      width: number,
      height: number,
      pixels: Uint8ClampedArray,
    ) => Image,
    private readonly disposeImage: (image: Image) => void,
    private readonly invalidate: () => void,
    private readonly schedule: Schedule = (task) => setTimeout(task, 0),
    private readonly cancel: Cancel = (handle) => clearTimeout(handle as number),
  ) {}

  accept(identity: object, pixels: MapEditorOverviewPixels): void {
    if (this.#disposed) return;
    this.clear();
    this.#identity = identity;
    this.#pixels = pixels;
    this.#nextLayer = 0;
    this.scheduleNext(identity);
  }

  image(identity: object, layer: MapOverviewLayer): Image | null {
    if (this.#disposed || this.#identity !== identity) return null;
    return this.#images[layer] ?? null;
  }

  clear(): void {
    if (this.#scheduled !== null) {
      this.cancel(this.#scheduled);
      this.#scheduled = null;
    }
    for (const image of Object.values(this.#images) as Image[]) this.disposeImage(image);
    this.#images = {};
    this.#identity = null;
    this.#pixels = null;
    this.#nextLayer = 0;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.clear();
    this.#disposed = true;
  }

  private scheduleNext(identity: object): void {
    if (this.#disposed || this.#identity !== identity || this.#pixels === null
      || this.#nextLayer >= MATERIALIZATION_ORDER.length) return;
    this.#scheduled = this.schedule(() => {
      this.#scheduled = null;
      if (this.#disposed || this.#identity !== identity || this.#pixels === null) return;
      const layer = MATERIALIZATION_ORDER[this.#nextLayer]!;
      this.#nextLayer += 1;
      this.#images[layer] = this.createImage(
        this.#pixels.width,
        this.#pixels.height,
        this.#pixels.layers[layer],
      );
      this.invalidate();
      if (this.#nextLayer >= MATERIALIZATION_ORDER.length) this.#pixels = null;
      this.scheduleNext(identity);
    });
  }
}
