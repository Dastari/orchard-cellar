import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GATEWAY_HANDOFF_KEY, GATEWAY_HANDOFF_MAX_CHARS, clearGatewayHandoff, encodeGatewayHandoff, gatewayFrameStarted,
  gatewayHandoffSize, markGatewayFrameStarted, saveGatewayHandoff,
} from './gateway-handoff.js';

const WEBP = 'data:image/webp;base64,UklGRg==';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQ';
const PNG = 'data:image/png;base64,iVBORw0K';

function snapshotCanvas(toDataURL: (type?: string) => string) {
  const drawImage = vi.fn();
  return { width: 0, height: 0, toDataURL: vi.fn(toDataURL), getContext: () => ({ drawImage, imageSmoothingEnabled: false }), drawImage };
}
const source = { width: 1920, height: 1080 } as HTMLCanvasElement;

afterEach(() => vi.unstubAllGlobals());

describe('gateway handoff save (owner UI item 5)', () => {
  it('downscales the snapshot so its long edge is at most 1280', () => {
    expect(gatewayHandoffSize(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(gatewayHandoffSize(1170, 2532)).toEqual({ width: 591, height: 1280 });
    expect(gatewayHandoffSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('encodes WebP, falls back to JPEG where WebP encoding is unsupported, and rejects the rest', () => {
    expect(encodeGatewayHandoff({ toDataURL: () => WEBP })).toBe(WEBP);
    // Safari silently returns a lossless PNG for image/webp.
    const safari = vi.fn((type?: string) => type === 'image/jpeg' ? JPEG : PNG);
    expect(encodeGatewayHandoff({ toDataURL: safari })).toBe(JPEG);
    expect(safari).toHaveBeenCalledWith('image/jpeg', 0.7);
    expect(encodeGatewayHandoff({ toDataURL: () => `data:image/jpeg;base64,${'A'.repeat(GATEWAY_HANDOFF_MAX_CHARS)}` })).toBeNull();
    expect(encodeGatewayHandoff({ toDataURL: () => 'data:image/svg+xml;base64,PHN2Zz4=' })).toBeNull();
  });

  it('stores only the data and timestamp, at the downscaled size', () => {
    const setItem = vi.fn(), scaled = snapshotCanvas(() => WEBP);
    saveGatewayHandoff(source, { setItem }, 1234, () => scaled as unknown as HTMLCanvasElement);
    expect([scaled.width, scaled.height]).toEqual([1280, 720]);
    expect(scaled.drawImage).toHaveBeenCalledWith(source, 0, 0, 1280, 720);
    expect(setItem).toHaveBeenCalledExactlyOnceWith(GATEWAY_HANDOFF_KEY, JSON.stringify({ data: WEBP, savedAt: 1234 }));
  });

  it('fails silently on a full quota, a tainted canvas or missing storage', () => {
    const quota = vi.fn(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(() => saveGatewayHandoff(source, { setItem: quota }, 0, () => snapshotCanvas(() => WEBP) as unknown as HTMLCanvasElement)).not.toThrow();
    expect(quota).toHaveBeenCalledOnce();
    const setItem = vi.fn();
    const tainted = snapshotCanvas(() => { throw new DOMException('tainted', 'SecurityError'); });
    expect(() => saveGatewayHandoff(source, { setItem }, 0, () => tainted as unknown as HTMLCanvasElement)).not.toThrow();
    expect(setItem).not.toHaveBeenCalled();
    expect(() => saveGatewayHandoff(source, undefined)).not.toThrow();
  });

  it('marks the frame as started on the document and clears only a painted handoff', () => {
    const attributes = new Map<string, string>();
    vi.stubGlobal('document', { documentElement: { setAttribute: (k: string, v: string) => attributes.set(k, v), hasAttribute: (k: string) => attributes.has(k) } });
    expect(gatewayFrameStarted()).toBe(false);
    markGatewayFrameStarted();
    expect(gatewayFrameStarted()).toBe(true);

    const clearRect = vi.fn(), canvasAttributes = new Map<string, string>([['data-gateway-handoff', 'painted']]);
    const canvas = { width: 10, height: 5, getAttribute: (k: string) => canvasAttributes.get(k) ?? null,
      removeAttribute: (k: string) => canvasAttributes.delete(k), getContext: () => ({ clearRect }) } as unknown as HTMLCanvasElement;
    clearGatewayHandoff(canvas);
    expect(clearRect).toHaveBeenCalledExactlyOnceWith(0, 0, 10, 5);
    clearGatewayHandoff(canvas);
    expect(clearRect).toHaveBeenCalledOnce();
  });
});
