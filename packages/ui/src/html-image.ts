export const HTML_IMAGE_LOAD_TIMEOUT_MS = 15_000;

/**
 * Load a browser image with a deterministic completion boundary. Browsers do
 * not guarantee that a stalled request, decoder, or service-worker response
 * will eventually emit `load` or `error`, so callers must not retain a queue
 * slot forever while waiting for those events.
 */
export function loadHtmlImage(
  url: string,
  description: string,
  timeoutMs = HTML_IMAGE_LOAD_TIMEOUT_MS,
): Promise<HTMLImageElement> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('html_image_timeout_must_be_positive');
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      // Best-effort abort. This also prevents a late event from reviving a
      // request whose cached promise has already been evicted by its caller.
      image.src = '';
      reject(new Error(`${description} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (error === undefined) resolve(image);
      else reject(error);
    };
    image.onload = () => settle();
    image.onerror = () => settle(new Error(`Unable to load ${description}`));
    image.src = url;
    // A memory/disk-cached image may already be complete before the task that
    // dispatches `load` runs. Resolve it without depending on that later task.
    if (image.complete) queueMicrotask(() => {
      if (image.naturalWidth > 0) settle();
      else settle(new Error(`Unable to load ${description}`));
    });
  });
}
