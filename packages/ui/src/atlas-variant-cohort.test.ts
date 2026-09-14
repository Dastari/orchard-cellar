import { describe, expect, it } from 'vitest';
import type { LoadedAsset } from './assets.js';
import { AtlasVariantCohort, type AtlasVariantBinding } from './atlas-variant-cohort.js';
import type { VariantPageRequest } from './atlas-variant-page.js';

const descriptor = { width: 512, height: 64, decodedBytes: 131072 };
const asset = (name: string): LoadedAsset => ({ name, assetId: 1, image: { src: name } as HTMLImageElement, anchor: [0, 0], collision: [], tags: [],
  placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false }, atlasRevision: 1,
  metadata: { image: name, animations: {} } });
const binding = (filename: string): AtlasVariantBinding => ({ filename, revision: 'r1', descriptor });
function loader() {
  const loads: { filename: string; image: HTMLImageElement; resolve: () => void; reject: () => void; disposed: boolean }[] = [];
  const load = (filename: string): VariantPageRequest => {
    const image = { src: filename } as HTMLImageElement;
    let resolve!: (image: HTMLImageElement) => void, reject!: (error: Error) => void;
    const promise = new Promise<HTMLImageElement>((yes, no) => { resolve = yes; reject = no; });
    const entry = { filename, image, resolve: () => resolve(image), reject: () => reject(new Error('decode failed')), disposed: false };
    loads.push(entry);
    return { promise, image, dispose() { entry.disposed = true; image.src = ''; reject(new Error('cancelled')); } };
  };
  return { loads, load };
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('atomic world omit-page cohorts', () => {
  it('registers Basic/Classic assets without requesting pages and commits all Dynamic pages together', async () => {
    const { loads, load } = loader(), cohort = new AtlasVariantCohort(load);
    const first = asset('first'), second = asset('second');
    await cohort.register(first, binding('first.omit.png')); await cohort.register(second, binding('second.omit.png'));
    expect(loads).toHaveLength(0); expect(cohort.source(first)).toBe(first.image);
    const ready = cohort.prepare([first, second]);
    expect(loads).toHaveLength(2); expect(cohort.commit()).toBe(false);
    loads[0]!.resolve(); await tick();
    expect(cohort.source(first)).toBe(first.image); expect(cohort.commit()).toBe(false);
    loads[1]!.resolve(); expect(await ready).toBe(true);
    expect(cohort.source(first)).toBe(first.image);
    expect(cohort.commit()).toBe(true);
    expect(cohort.source(first)).toBe(loads[0]!.image); expect(cohort.source(second)).toBe(loads[1]!.image);
    expect(first.image).toEqual({ src: 'first' }); expect(second.image).toEqual({ src: 'second' });
    expect(cohort.diagnostics()).toMatchObject({ pageCount: 2, decodedPageBytes: 262144, recoloredSurfaceBytes: 0 });
  });

  it('deduplicates affected-page neighbors and keeps the prior cohort while a late asset waits', async () => {
    const { loads, load } = loader(), cohort = new AtlasVariantCohort(load);
    const first = asset('first'), neighbor = asset('neighbor');
    await cohort.register(first, binding('shared.omit.png')); await cohort.register(neighbor, binding('shared.omit.png'));
    const ready = cohort.prepare([first]); loads[0]!.resolve(); await ready; cohort.commit();
    expect(loads).toHaveLength(1); expect(cohort.source(neighbor)).toBe(cohort.source(first));
    const revision = cohort.revision, late = asset('late');
    let published = false;
    const publishing = cohort.register(late, binding('late.omit.png')).then(() => { published = true; });
    await tick(); expect(published).toBe(false); expect(cohort.source(first)).toBe(loads[0]!.image);
    expect(() => cohort.source(late)).toThrow('Uncommitted');
    loads[1]!.resolve(); await publishing;
    expect(cohort.source(late)).toBe(loads[1]!.image); expect(cohort.revision).toBe(revision + 1);
  });

  it('cancels pending work and releases every page and recoloured surface on Basic/reset', async () => {
    const { loads, load } = loader(), cohort = new AtlasVariantCohort(load);
    const first = asset('first'), surface = { width: 512, height: 64 } as HTMLCanvasElement;
    await cohort.register(first, { ...binding('first.omit.png'), recolor: () => surface });
    const ready = cohort.prepare(); loads[0]!.resolve(); await ready; cohort.commit();
    expect(cohort.diagnostics().recoloredSurfaceBytes).toBe(131072);
    const late = asset('late');
    const publishing = cohort.register(late, binding('late.omit.png'));
    cohort.reset(); await publishing;
    expect(loads.every((load) => load.disposed)).toBe(true); expect(surface.width * surface.height).toBe(0);
    expect(cohort.source(first)).toBe(first.image); expect(cohort.source(late)).toBe(late.image);
    expect(cohort.diagnostics()).toMatchObject({ active: false, pageCount: 0, decodedPageBytes: 0, recoloredSurfaceBytes: 0, inFlightPages: 0 });
  });

  it('fails required missing/decode pages without publishing originals and retries after reset', async () => {
    const { loads, load } = loader(), cohort = new AtlasVariantCohort(load), first = asset('first');
    await cohort.register(first, binding('first.omit.png'));
    const failed = cohort.prepare(); loads[0]!.reject();
    expect(await failed).toBe(false); expect(cohort.failure).toContain('decode failed'); expect(cohort.commit()).toBe(false);
    expect(cohort.diagnostics().decodedPageBytes).toBe(0);
    cohort.reset(); const retry = cohort.prepare(); loads[1]!.resolve(); expect(await retry).toBe(true); expect(cohort.commit()).toBe(true);
    const late = asset('missing');
    await expect(cohort.register(late, { revision: 'r1', filename: undefined, descriptor })).rejects.toThrow('Missing declared omit page');
    expect(() => cohort.source(late)).toThrow('Uncommitted');
  });

  it('ignores a cancelled generation and restarts with a complete new cohort', async () => {
    const { loads, load } = loader(), cohort = new AtlasVariantCohort(load), first = asset('first');
    await cohort.register(first, binding('first.omit.png'));
    const pending = cohort.prepare(); cohort.reset();
    expect(await pending).toBe(false);
    loads[0]!.resolve(); await tick(); expect(cohort.diagnostics().pageCount).toBe(0);
    const next = cohort.prepare(); loads[1]!.resolve(); expect(await next).toBe(true); cohort.commit();
    expect(cohort.source(first)).toBe(loads[1]!.image);
  });

  it('uses preloaded page sources for 600 walking frames without building filtered surfaces', async () => {
    const { loads, load } = loader(), cohort = new AtlasVariantCohort(load), first = asset('first');
    let surfaces = 0;
    await cohort.register(first, { ...binding('first.omit.png'), recolor: () => { surfaces++; return { width: 512, height: 64 } as HTMLCanvasElement; } });
    const ready = cohort.prepare(); loads[0]!.resolve(); await ready; cohort.commit();
    const source = cohort.source(first), revision = cohort.revision, warmSurfaces = surfaces;
    for (let frame = 0; frame < 600; frame++) expect(cohort.source(first)).toBe(source);
    expect(loads).toHaveLength(1); expect(surfaces - warmSurfaces).toBe(0); expect(cohort.revision).toBe(revision);
    cohort.reset(); expect(cohort.diagnostics().decodedPageBytes + cohort.diagnostics().recoloredSurfaceBytes).toBe(0);
  });

  it('rejects an unregistered declared asset instead of silently treating it as an unaffected page', async () => {
    const { load } = loader(), cohort = new AtlasVariantCohort(load);
    const declared = { ...asset('declared'), bakedShadow: { color: '#00000066', frames: {} } };
    expect(await cohort.prepare([declared])).toBe(false);
    expect(cohort.failure).toContain('Missing declared omit page'); expect(cohort.commit()).toBe(false);
  });


  it('disposes a resolved late recolour when reset wins the publication microtask', async () => {
    const { loads, load } = loader(), cohort = new AtlasVariantCohort(load), late = asset('late');
    await cohort.prepare(); cohort.commit();
    const surface = { width: 512, height: 64 } as HTMLCanvasElement;
    let created = false, resetAfterCreation = false;
    const publishing = cohort.register(late, { ...binding('late.omit.png'), recolor: () => {
      created = true;
      queueMicrotask(() => { resetAfterCreation = created; cohort.reset(); });
      return surface;
    } });
    loads[0]!.resolve(); await publishing;
    expect(resetAfterCreation).toBe(true);
    expect(cohort.source(late)).toBe(late.image);
    expect(surface.width * surface.height).toBe(0);
    expect(cohort.diagnostics()).toMatchObject({ active: false, decodedPageBytes: 0, recoloredSurfaceBytes: 0 });
  });


  it('preserves a stale result backing already adopted by a newer candidate or active cohort', async () => {
    const { loads, load } = loader(), cohort = new AtlasVariantCohort(load), late = asset('late');
    await cohort.prepare(); cohort.commit();
    const surface = { width: 512, height: 64 } as HTMLCanvasElement;
    let builds = 0, replacement: Promise<boolean> | undefined;
    const publishing = cohort.register(late, { ...binding('late.omit.png'), recolor: () => {
      if (++builds === 1) queueMicrotask(() => { replacement = cohort.prepare(); });
      return surface;
    } });
    loads[0]!.resolve(); await publishing;
    expect(await replacement).toBe(true); expect(cohort.commit()).toBe(true);
    expect(builds).toBe(2); expect(cohort.source(late)).toBe(surface);
    expect(surface.width).toBe(512); expect(surface.height).toBe(64);
    cohort.reset(); expect(surface.width * surface.height).toBe(0);
  });

});
