import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class PageImage {
  static readonly instances: PageImage[] = [];
  readonly naturalWidth = 512; readonly naturalHeight = 64;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  src = '';
  get complete() { return !this.src.includes('.omit.png'); }
  constructor() { PageImage.instances.push(this); }
}
const frame = { x: 16, y: 32, width: 2, height: 2 };
const record = { assetId: 0, category: 'props', pageId: 'props:p000', anchor: [0, 0], collision: [],
  animations: {}, animationMeta: {}, variants: {}, variantMeta: {}, states: { base: frame }, tags: [],
  bakedShadow: { color: '#00000066', frames: { base: [{ width: 2, height: 2, pixelCount: 1, spans: [1, 0, 1] }] } },
  placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false } };
const index = { schemaVersion: 4, revision: 'omit', revisionId: 43, placeholderAssetId: 0,
  atlases: { 'props:p000:summer': 'atlas_props_p000_summer.png' },
  omitAtlases: { 'props:p000:summer': 'atlas_props_p000_summer.omit.png' },
  pages: { 'props:p000': { width: 512, height: 64, decodedBytes: 131072 } },
  assets: { first: record, late: { ...record, assetId: 1 } }, assetsById: { '0': 'first', '1': 'late' } };
const waitForOmit = async () => {
  await vi.waitFor(() => expect(PageImage.instances.some((image) => image.src.includes('.omit.png'))).toBe(true));
  return PageImage.instances.find((image) => image.src.includes('.omit.png'))!;
};

describe('asset loader omit publication barrier', () => {
  beforeEach(() => {
    vi.resetModules(); PageImage.instances.length = 0; vi.stubGlobal('Image', PageImage);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => index })));
  });
  afterEach(async () => { (await import('./assets.js')).worldAtlasVariants.reset(); vi.unstubAllGlobals(); });

  it('never requests omit pages in Basic/Classic and does not mutate original asset images', async () => {
    const { loadGeneratedAssetById, worldAtlasVariants, atlasPageDiagnostics } = await import('./assets.js');
    const first = await loadGeneratedAssetById(0);
    worldAtlasVariants.reset(); // Classic follows the same original-page policy.
    await loadGeneratedAssetById(1);
    expect(PageImage.instances).toHaveLength(1); expect(PageImage.instances[0]!.src).not.toContain('.omit.');
    const ready = worldAtlasVariants.prepare([first]);
    const omit = await waitForOmit(); expect(omit.src).toContain('.omit.png');
    expect(worldAtlasVariants.source(first)).toBe(first.image);
    omit.onload!(new Event('load')); expect(await ready).toBe(true); worldAtlasVariants.commit();
    expect(worldAtlasVariants.source(first)).toBe(omit); expect(first.image).toBe(PageImage.instances[0]);
    expect(atlasPageDiagnostics()).toMatchObject({ pageCount: 1, decodedBytes: 131072 });
    worldAtlasVariants.reset(); expect(omit.src).toBe('');
    expect(worldAtlasVariants.diagnostics()).toMatchObject({ pageCount: 0, decodedPageBytes: 0 });
  });

  it('holds a late affected asset promise until its omit page is decoded and advances revision', async () => {
    const { loadGeneratedAssetById, worldAtlasVariants } = await import('./assets.js');
    // Start Dynamic with no loaded affected pages. The subsequently streamed
    // asset must join before it can be returned to the renderer.
    expect(await worldAtlasVariants.prepare([])).toBe(true); worldAtlasVariants.commit();
    const revision = worldAtlasVariants.revision;
    let published = false;
    const loading = loadGeneratedAssetById(1).then((asset) => { published = true; return asset; });
    const omit = await waitForOmit(); expect(published).toBe(false);
    expect(omit).toBeDefined(); omit.onload!(new Event('load'));
    const late = await loading;
    expect(worldAtlasVariants.source(late)).toBe(omit); expect(worldAtlasVariants.revision).toBe(revision + 1);
  });

  it('propagates late variant failure instead of returning an original placeholder', async () => {
    const { loadGeneratedAsset, worldAtlasVariants } = await import('./assets.js');
    await worldAtlasVariants.prepare([]); worldAtlasVariants.commit();
    const loading = loadGeneratedAsset('late');
    const rejection = expect(loading).rejects.toThrow('Unable to load atlas variant');
    (await waitForOmit()).onerror!(new Event('error'));
    await rejection;
    expect(worldAtlasVariants.diagnostics()).toMatchObject({ pageCount: 0, decodedPageBytes: 0 });
  });

  it('releases a cancelled in-flight request and publishes the immutable original after switching to Basic', async () => {
    const { loadGeneratedAssetById, worldAtlasVariants } = await import('./assets.js');
    await worldAtlasVariants.prepare([]); worldAtlasVariants.commit();
    const loading = loadGeneratedAssetById(1);
    const omit = await waitForOmit();
    worldAtlasVariants.reset(); const late = await loading;
    expect(omit.src).toBe(''); expect(omit.onload).toBeNull(); expect(omit.onerror).toBeNull();
    expect(worldAtlasVariants.source(late)).toBe(late.image);
    expect(worldAtlasVariants.diagnostics()).toMatchObject({ pageCount: 0, decodedPageBytes: 0, inFlightPages: 0 });
  });
});
