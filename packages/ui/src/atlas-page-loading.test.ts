import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let height = 2048;
class PageImage {
  static readonly instances: PageImage[] = [];
  readonly naturalWidth = 512;
  readonly naturalHeight = height;
  readonly complete = true;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() { PageImage.instances.push(this); }
}
const record = { assetId: 0, category: 'characters', pageId: 'characters:p000', anchor: [0, 0], collision: [],
  animations: {}, animationMeta: {}, variants: {}, variantMeta: {},
  states: { base: { x: 16, y: 32, width: 16, height: 32 } }, tags: [],
  placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false } };
const index = { schemaVersion: 4, revision: 'pages', revisionId: 42, placeholderAssetId: 0,
  atlases: { 'characters:p000:summer': 'atlas_characters_p000_summer.png' },
  pages: { 'characters:p000': { width: 512, height: 2048, decodedBytes: 4194304 } },
  assetCategories: { avatar: 'characters' }, assetsById: { '0': 'avatar' } };
function stubFetch(markerPage = 'characters:p000') {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () =>
    url.includes('atlas.markers') ? { schemaVersion: 2, revision: 'pages', assetPages: { avatar: markerPage }, assets: { avatar: {} } }
      : url.includes('atlas_characters.meta') ? { schemaVersion: 3, revision: 'pages', category: 'characters', assets: { avatar: record } }
        : index,
  })));
}
describe('page-aware asset loading', () => {
  beforeEach(() => { vi.resetModules(); height = 2048; PageImage.instances.length = 0; vi.stubGlobal('Image', PageImage); stubFetch(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('loads the new page identity once and preserves frame rectangles', async () => {
    const { loadGeneratedAssetById, atlasPageDiagnostics } = await import('./assets.js');
    const [first, second] = await Promise.all([loadGeneratedAssetById(0), loadGeneratedAssetById(0)]);
    expect(first.image).toBe(second.image);
    expect(PageImage.instances).toHaveLength(1);
    expect(PageImage.instances[0]!.src).toContain('atlas_characters_p000_summer.png?rev=pages');
    expect(first).toMatchObject({ pageId: 'characters:p000', metadata: { states: record.states } });
    expect(atlasPageDiagnostics()).toMatchObject({ pageCount: 1, decodedBytes: 4194304, largestDecodedBytes: 4194304 });
  });
  it('evicts an invalid oversized response and retries the same page cleanly', async () => {
    const { loadGeneratedAssetById } = await import('./assets.js');
    height = 52032;
    await expect(loadGeneratedAssetById(0)).rejects.toThrow('4 MiB');
    height = 2048;
    await expect(loadGeneratedAssetById(0)).resolves.toMatchObject({ pageId: 'characters:p000' });
    expect(PageImage.instances).toHaveLength(2);
  });
  it('validates cached legacy images against a new bounded-page declaration', async () => {
    const { loadAtlasPage } = await import('./atlas-page-loader.js');
    height = 52032;
    await loadAtlasPage('shared.png', 'pages');
    await expect(loadAtlasPage('shared.png', 'pages', index.pages['characters:p000'])).rejects.toThrow('4 MiB');
    expect(PageImage.instances).toHaveLength(1);
  });
  it('validates dimensions when two declarations share an already cached URL', async () => {
    const { loadAtlasPage } = await import('./atlas-page-loader.js');
    await loadAtlasPage('shared.png', 'pages', index.pages['characters:p000']);
    await expect(loadAtlasPage('shared.png', 'pages', { width: 512, height: 1024, decodedBytes: 2097152 }))
      .rejects.toThrow('dimensions disagree');
    expect(PageImage.instances).toHaveLength(1);
  });
  it.each([1, 2])('recolours marker schema %i at the declared page-local coordinates', async (schemaVersion) => {
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const context = { fillRect, drawImage, fillStyle: '' };
    const canvas = { width: 0, height: 0, getContext: () => context };
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () =>
      url.includes('atlas.markers') ? { schemaVersion, revision: 'pages',
        assetPages: schemaVersion === 2 ? { avatar: 'characters:p000' } : undefined,
        assets: { avatar: { base: [[{ x: 17, y: 33, marker: 'shirt', shade: 0 }]] } } }
        : url.includes('atlas_characters.meta') ? { schemaVersion: 3, revision: 'pages', category: 'characters', assets: { avatar: record } }
          : index,
    })));
    const { loadGeneratedAssetById } = await import('./assets.js');
    const asset = await loadGeneratedAssetById(0, 'summer', { shirt: ['#ff0000'] });
    expect(asset.image).toBe(canvas);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(context.fillStyle).toBe('#ff0000');
    expect(fillRect).toHaveBeenCalledExactlyOnceWith(17, 33, 1, 1);
  });
  it('rejects marker metadata for a different page before recoloring any pixels', async () => {
    stubFetch('characters:p001');
    const { loadGeneratedAssetById } = await import('./assets.js');
    await expect(loadGeneratedAssetById(0, 'summer', { shirt: ['#ff0000'] })).rejects.toThrow('marker page identity mismatch');
  });
});
