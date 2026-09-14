import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawBackdropPages, loadBackdropPages, parseBackdropManifest, type BackdropManifest } from './backdrop-pages.js';
import { loadAtlasPage } from './atlas-page-loader.js';
vi.mock('./atlas-page-loader.js', () => ({ loadAtlasPage: vi.fn(async () => ({ naturalWidth: 512, naturalHeight: 1024 })) }));
const manifest: BackdropManifest = { schemaVersion: 1, revision: 'revision', width: 1536, height: 1024,
  pages: [0, 1, 2].map((index) => ({ filename: `backdrop_p00${index}.png`, x: index * 512, y: 0, width: 512, height: 1024 })) };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('bounded client backdrop', () => {
  it('loads only the bounded tiles with revision and decoded-byte declarations', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest })));
    const backdrop = await loadBackdropPages();
    expect(backdrop.images).toHaveLength(3);
    expect(loadAtlasPage).toHaveBeenCalledTimes(3);
    for (const page of manifest.pages) expect(loadAtlasPage).toHaveBeenCalledWith(page.filename, 'revision',
      { width: 512, height: 1024, decodedBytes: 2097152 });
  });
  it('rejects oversized or misplaced pages before image loading', () => {
    expect(() => parseBackdropManifest({ ...manifest, pages: [{ ...manifest.pages[0], width: 1536 }] })).toThrow('4 MiB');
    expect(() => parseBackdropManifest({ ...manifest, pages: [{ ...manifest.pages[0], x: 1536 }] })).toThrow('placement');
    expect(() => parseBackdropManifest({ ...manifest, pages: [] })).toThrow('geometry');
  });
  it('reconstructs one exact crop and releases the temporary backing', () => {
    const drawImage = vi.fn(), sourceDraw = vi.fn();
    const scratch = { width: 0, height: 0, getContext: () => ({ drawImage: sourceDraw }) };
    vi.stubGlobal('document', { createElement: () => scratch });
    const images = [0, 1, 2].map(() => ({} as CanvasImageSource));
    drawBackdropPages({ drawImage } as unknown as CanvasRenderingContext2D, { ...manifest, images }, -17, -3, 1280, 854);
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(scratch, -17, -3, 1280, 854);
    for (let i = 0; i < 3; i++) expect(sourceDraw).toHaveBeenNthCalledWith(i + 1, images[i], i * 512, 0);
    expect([scratch.width, scratch.height]).toEqual([0, 0]);
  });
});
