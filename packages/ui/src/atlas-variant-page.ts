import { assetRequestQueue } from './asset-request-queue.js';
import { atlasImageUrl } from './atlas-page-loader.js';
import { assertAtlasPageDescriptor, assertAtlasPageImage, type AtlasPageDescriptor } from './atlas-page-format.js';
import { HTML_IMAGE_LOAD_TIMEOUT_MS } from './html-image.js';

export interface VariantPageRequest {
  readonly promise: Promise<HTMLImageElement>;
  readonly image: HTMLImageElement | null;
  dispose(): void;
}
/** Omit pages have an explicit cohort lifetime, never the permanent original
 * image promise cache. Reset also cancels queued and in-flight requests. */
export function requestVariantPage(filename: string, revision: string, descriptor: AtlasPageDescriptor): VariantPageRequest {
  assertAtlasPageDescriptor(descriptor);
  let image: HTMLImageElement | null = null, disposed = false;
  let cancel: (() => void) | undefined;
  const queued = assetRequestQueue.run(() => new Promise<HTMLImageElement>((resolve, reject) => {
    if (disposed) { reject(new Error('atlas_variant_cancelled')); return; }
    const current = new Image(); image = current;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); current.onload = null; current.onerror = null; cancel = undefined;
      if (error !== undefined) reject(error); else resolve(current);
    };
    const timeout = setTimeout(() => { finish(new Error(`Atlas variant timed out: ${filename}`)); current.src = ''; }, HTML_IMAGE_LOAD_TIMEOUT_MS);
    cancel = () => finish(new Error('atlas_variant_cancelled'));
    current.onload = () => {
      try {
        assertAtlasPageImage(current);
        if (current.naturalWidth !== descriptor.width || current.naturalHeight !== descriptor.height) throw new Error(`Atlas variant dimensions disagree with manifest: ${filename}`);
        finish();
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    };
    current.onerror = () => finish(new Error(`Unable to load atlas variant: ${filename}`));
    current.src = atlasImageUrl(filename, revision);
    if (current.complete) queueMicrotask(() => {
      if (current.naturalWidth > 0) current.onload?.(new Event('load'));
      else current.onerror?.(new Event('error'));
    });
  }));
  let rejectPending!: (error: Error) => void;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    rejectPending = reject; void queued.then(resolve, reject);
  });
  return { promise, get image() { return image; }, dispose() {
    disposed = true; cancel?.(); rejectPending(new Error('atlas_variant_cancelled'));
    if (image !== null) { image.onload = null; image.onerror = null; image.src = ''; image = null; }
  } };
}
