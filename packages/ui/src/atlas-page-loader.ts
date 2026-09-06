import { assetRequestQueue } from './asset-request-queue.js';
import { loadHtmlImage } from './html-image.js';
import { assertAtlasPageDescriptor, assertAtlasPageImage, type AtlasPageDescriptor } from './atlas-page-format.js';

const imagePromises = new Map<string, Promise<HTMLImageElement>>();
const pages = new Map<string, { readonly width: number; readonly height: number; readonly readyMs: number }>();
export function atlasImageUrl(filename: string, revision: string): string {
  return `/generated/${filename}?rev=${encodeURIComponent(revision)}`;
}
export function atlasPageDiagnostics() {
  const loaded = [...pages].map(([url, value]) => ({ url, ...value, decodedBytes: value.width * value.height * 4 }));
  return { pageCount: loaded.length,
    decodedBytes: loaded.reduce((sum, page) => sum + page.decodedBytes, 0),
    largestDecodedBytes: loaded.reduce((maximum, page) => Math.max(maximum, page.decodedBytes), 0),
    summedReadyMs: loaded.reduce((sum, page) => sum + page.readyMs, 0),
    timingScope: 'Image request through onload readiness; overlapping loads are summed. Not decoder-only CPU time.',
    pages: loaded };
}
function validatePageImage(image: HTMLImageElement, filename: string, page?: AtlasPageDescriptor): HTMLImageElement {
  if (page !== undefined) {
    assertAtlasPageImage(image);
    if (image.naturalWidth !== page.width || image.naturalHeight !== page.height) {
      throw new Error(`Atlas page dimensions disagree with manifest: ${filename}`);
    }
  }
  return image;
}
export async function loadAtlasPage(filename: string, revision: string, page?: AtlasPageDescriptor): Promise<HTMLImageElement> {
  if (page !== undefined) assertAtlasPageDescriptor(page);
  const url = atlasImageUrl(filename, revision);
  const existing = imagePromises.get(url);
  if (existing !== undefined) return validatePageImage(await existing, filename, page);
  const promise = assetRequestQueue.run(async () => {
    const started = performance.now();
    const image = await loadHtmlImage(url, `atlas image ${filename}`);
    validatePageImage(image, filename, page);
    pages.set(url, { width: image.naturalWidth, height: image.naturalHeight, readyMs: performance.now() - started });
    return image;
  });
  imagePromises.set(url, promise);
  try { return await promise; }
  catch (error) { imagePromises.delete(url); throw error; }
}
