import { afterEach, describe, expect, it, vi } from 'vitest';
import { assetRequestQueue } from './asset-request-queue.js';
import { requestVariantPage } from './atlas-variant-page.js';
import { HTML_IMAGE_LOAD_TIMEOUT_MS } from './html-image.js';

class PageImage {
  static latest: PageImage;
  naturalWidth = 512; naturalHeight = 64; complete = false;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  src = '';
  constructor() { PageImage.latest = this; }
}
const descriptor = { width: 512, height: 64, decodedBytes: 131072 };
describe('owned omit page request lifetime', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('cancels queued requests immediately without waiting for a queue slot', async () => {
    vi.spyOn(assetRequestQueue, 'run').mockImplementation(<T>() => new Promise<T>(() => {}));
    const request = requestVariantPage('page.omit.png', 'r1', descriptor);
    request.dispose(); await expect(request.promise).rejects.toThrow('cancelled');
    expect(request.image).toBeNull();
  });
  it('rejects wrong page dimensions and explicitly releases its decoded image', async () => {
    vi.spyOn(assetRequestQueue, 'run').mockImplementation(<T>(run: () => Promise<T>) => run());
    vi.stubGlobal('Image', PageImage);
    const request = requestVariantPage('page.omit.png', 'r1', descriptor);
    PageImage.latest.naturalHeight = 2048; PageImage.latest.onload!(new Event('load'));
    await expect(request.promise).rejects.toThrow('dimensions disagree');
    request.dispose(); expect(PageImage.latest.src).toBe(''); expect(request.image).toBeNull();
  });
  it('times out stalled decoding, clears event handlers, and releases the request', async () => {
    vi.useFakeTimers(); vi.spyOn(assetRequestQueue, 'run').mockImplementation(<T>(run: () => Promise<T>) => run());
    vi.stubGlobal('Image', PageImage);
    const request = requestVariantPage('page.omit.png', 'r1', descriptor);
    const rejection = expect(request.promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(HTML_IMAGE_LOAD_TIMEOUT_MS); await rejection;
    expect(PageImage.latest.src).toBe(''); expect(PageImage.latest.onload).toBeNull(); expect(PageImage.latest.onerror).toBeNull();
    request.dispose(); expect(request.image).toBeNull();
  });
});
