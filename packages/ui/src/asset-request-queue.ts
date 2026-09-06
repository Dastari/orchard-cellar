export class BoundedAssetRequestQueue {
  #active = 0;
  readonly #pending: Array<() => void> = [];
  #nextStartAt = 0;
  #startTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly concurrency = 6,
    /** Space request starts so small metadata/SVG responses cannot refill the
     * browser's connection pool fast enough to trip the edge request rate. */
    readonly minimumStartIntervalMs = 40,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError('asset_request_concurrency_must_be_positive');
    }
    if (!Number.isFinite(minimumStartIntervalMs) || minimumStartIntervalMs < 0) {
      throw new RangeError('asset_request_interval_must_be_non_negative');
    }
  }

  get active(): number { return this.#active; }
  get queued(): number { return this.#pending.length; }

  run<T>(request: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = (): void => {
        this.#active += 1;
        void request().then(resolve, reject).finally(() => {
          this.#active -= 1;
          this.#pump();
        });
      };
      this.#pending.push(start);
      this.#pump();
    });
  }

  #pump(): void {
    if (this.#startTimer !== null || this.#active >= this.concurrency
      || this.#pending.length === 0) return;
    const now = Date.now();
    const delay = Math.max(0, this.#nextStartAt - now);
    if (delay > 0) {
      this.#startTimer = setTimeout(() => {
        this.#startTimer = null;
        this.#pump();
      }, delay);
      return;
    }
    const start = this.#pending.shift();
    if (start === undefined) return;
    this.#nextStartAt = now + this.minimumStartIntervalMs;
    start();
    this.#pump();
  }
}

/** One origin-wide budget shared by generated atlases and browser icon art.
 * Six slow transfers may overlap, but new requests start at no more than 25/s,
 * below Orchard Studio's 30 request/second edge rate. */
export const assetRequestQueue = new BoundedAssetRequestQueue(6);
