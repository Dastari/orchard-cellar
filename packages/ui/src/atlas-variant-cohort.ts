import type { LoadedAsset } from './assets.js';
import type { AtlasPageDescriptor } from './atlas-page-format.js';
import { atlasImageUrl } from './atlas-page-loader.js';
import { requestVariantPage, type VariantPageRequest } from './atlas-variant-page.js';
import { AtlasVariantSources, type AtlasVariantSource as Source } from './atlas-variant-sources.js';

export class AtlasVariantLoadError extends Error {}
export interface AtlasVariantBinding {
  readonly filename: string | undefined;
  readonly revision: string;
  readonly descriptor: AtlasPageDescriptor | undefined;
  readonly recolor?: (image: HTMLImageElement) => HTMLCanvasElement;
}
interface Candidate {
  readonly generation: number; readonly assets: Set<LoadedAsset>; readonly sources: Map<LoadedAsset, Source>;
  readonly jobs: Map<LoadedAsset, Promise<Source | null>>;
  readonly promise: Promise<boolean>; readonly settle: (ready: boolean) => void;
  pending: number; failure: string | null;
}
interface Page { readonly request: VariantPageRequest; readonly descriptor: AtlasPageDescriptor; loaded: boolean }

/** Frame-boundary commit selects a complete page cohort. Published artwork is
 * immutable, and source() never substitutes original art for a missing variant. */
export class AtlasVariantCohort {
  private readonly bindings = new WeakMap<LoadedAsset, AtlasVariantBinding>();
  private readonly registered = new Set<WeakRef<LoadedAsset>>();
  private readonly pages = new Map<string, Page>();
  private activeSources: AtlasVariantSources | null = null;
  private candidate: Candidate | null = null;
  private generation = 0;
  private revisionValue = 0;
  private requested = false;
  private liveFailure: string | null = null;
  private readonly liveJobs = new Map<LoadedAsset, Promise<Source | null>>();
  constructor(private readonly loadPage = requestVariantPage) {}
  get revision(): number { return this.revisionValue; }
  get active(): boolean { return this.activeSources !== null; }
  get ready(): boolean { return this.candidate === null ? this.active : this.candidate.pending === 0 && this.candidate.failure === null; }
  get pending(): boolean { return (this.candidate?.pending ?? 0) > 0 || this.liveJobs.size > 0; }
  get failure(): string | null { return this.candidate?.failure ?? this.liveFailure; }
  /** Loader-only publication barrier; Basic/Classic registers metadata only. */
  async register(asset: LoadedAsset, binding: AtlasVariantBinding): Promise<void> {
    const previous = this.bindings.get(asset);
    if (previous !== undefined && previous !== binding) throw new AtlasVariantLoadError(`Atlas variant binding is immutable: ${asset.name}`);
    this.bindings.set(asset, binding);
    if (previous === undefined) this.registered.add(new WeakRef(asset));
    while (this.requested) {
      const generation = this.generation;
      try {
        const candidate = this.candidate;
        const source = candidate === null ? await this.liveSource(asset, generation) : await this.enqueue(candidate, asset);
        if (generation !== this.generation) { this.disposeUnownedSource(source); continue; }
        if (source === null) throw new AtlasVariantLoadError(this.failure ?? 'Atlas variant source unavailable');
        if (this.activeSources !== null && !this.activeSources.has(asset)) {
          this.activeSources.set(asset, source); this.revisionValue++;
          if (this.candidate === null && this.liveJobs.size === 0) this.prunePages();
        }
        return;
      } catch (error) {
        if (generation !== this.generation) continue;
        this.liveFailure = error instanceof Error ? error.message : String(error);
        throw new AtlasVariantLoadError(this.liveFailure, { cause: error });
      }
    }
  }
  /** Includes weakly registered affected-page assets so unmarked neighbors use
   * the same page source and can never be published outside the atomic cohort. */
  prepare(assets: readonly LoadedAsset[] = []): Promise<boolean> {
    for (const asset of assets) if (asset.bakedShadow !== undefined && !this.bindings.has(asset)) {
      this.bindings.set(asset, { filename: undefined, revision: String(asset.atlasRevision), descriptor: undefined });
      this.registered.add(new WeakRef(asset));
    }
    const cohort = new Set(assets.filter((asset) => this.bindings.has(asset)));
    for (const reference of this.registered) {
      const asset = reference.deref();
      if (asset === undefined) this.registered.delete(reference); else cohort.add(asset);
    }
    this.requested = true;
    const existing = this.candidate;
    if (existing !== null && cohort.size === existing.assets.size && [...cohort].every((asset) => existing.assets.has(asset))) return existing.promise;
    if (existing === null && this.activeSources !== null && cohort.size === this.activeSources.size && [...cohort].every((asset) => this.activeSources!.has(asset))) return Promise.resolve(true);
    existing?.settle(false);
    this.disposeSurfaces(existing?.sources ?? null, this.activeSources ?? undefined);
    const generation = ++this.generation;
    this.liveFailure = null;
    let settle!: (ready: boolean) => void;
    const promise = new Promise<boolean>((resolve) => { settle = resolve; });
    const candidate: Candidate = { generation, assets: new Set(), sources: new Map(), jobs: new Map(), promise, settle, pending: 0, failure: null };
    this.candidate = candidate;
    for (const asset of cohort) void this.enqueue(candidate, asset);
    if (candidate.pending === 0) settle(true);
    return promise;
  }
  private enqueue(candidate: Candidate, asset: LoadedAsset): Promise<Source | null> {
    const existing = candidate.jobs.get(asset);
    if (existing !== undefined) return existing;
    candidate.assets.add(asset); candidate.pending++;
    const job = this.resolveSource(asset, candidate.generation).then((source) => {
      if (candidate !== this.candidate || candidate.generation !== this.generation) {
        this.disposeUnownedSource(source);
        return null;
      }
      candidate.sources.set(asset, source); return source;
    }).catch((error: unknown) => {
      if (candidate === this.candidate) candidate.failure = error instanceof Error ? error.message : String(error);
      return null;
    }).finally(() => {
      candidate.pending--;
      if (candidate.pending === 0) candidate.settle(candidate === this.candidate && candidate.failure === null);
    });
    candidate.jobs.set(asset, job); return job;
  }
  private liveSource(asset: LoadedAsset, generation: number): Promise<Source | null> {
    const existing = this.liveJobs.get(asset);
    if (existing !== undefined) return existing;
    const job = this.resolveSource(asset, generation).finally(() => { if (this.liveJobs.get(asset) === job) this.liveJobs.delete(asset); });
    this.liveJobs.set(asset, job); return job;
  }
  private async resolveSource(asset: LoadedAsset, generation: number): Promise<Source> {
    const active = this.activeSources?.get(asset);
    if (active !== undefined) return active;
    const binding = this.bindings.get(asset)!;
    if (binding.filename === undefined || binding.descriptor === undefined) throw new AtlasVariantLoadError(`Missing declared omit page: ${asset.name}`);
    const url = atlasImageUrl(binding.filename, binding.revision);
    let page = this.pages.get(url);
    if (page === undefined) {
      page = { request: this.loadPage(binding.filename, binding.revision, binding.descriptor), descriptor: binding.descriptor, loaded: false };
      this.pages.set(url, page);
    }
    if (page.descriptor.width !== binding.descriptor.width || page.descriptor.height !== binding.descriptor.height
      || page.descriptor.decodedBytes !== binding.descriptor.decodedBytes) throw new AtlasVariantLoadError(`Conflicting omit page descriptor: ${asset.name}`);
    let image: HTMLImageElement;
    try { image = await page.request.promise; }
    catch (error) { if (this.pages.get(url) === page) { this.pages.delete(url); page.request.dispose(); } throw error; }
    page.loaded = true;
    if (generation !== this.generation || !this.requested) throw new AtlasVariantLoadError('atlas_variant_cancelled');
    const surface = binding.recolor?.(image);
    return { image: surface ?? image, page: url, ...(surface === undefined ? {} : { surface }) };
  }
  commit(): boolean {
    const candidate = this.candidate;
    if (candidate === null) return this.active;
    if (!this.ready) return false;
    this.disposeSurfaces(this.activeSources, candidate.sources);
    this.activeSources = new AtlasVariantSources(candidate.sources); this.candidate = null; this.revisionValue++;
    this.prunePages();
    return true;
  }
  source(asset: LoadedAsset): CanvasImageSource {
    if (!this.active) return asset.image;
    if (!this.bindings.has(asset) && asset.bakedShadow === undefined) return asset.image;
    const source = this.activeSources!.get(asset);
    if (source === undefined) throw new AtlasVariantLoadError(`Uncommitted atlas variant source: ${asset.name}`);
    return source.image;
  }
  /** A resolved job owns its surface until publication. Cancellation can occur
   * between resolution and an awaiting register/enqueue continuation. A newer
   * cohort may already own the same backing, so compare surfaces as well as
   * source objects before disposing a stale result. */
  private disposeUnownedSource(source: Source | null): void {
    const surface = source?.surface;
    if (surface === undefined) return;
    for (const owned of this.activeSources?.values() ?? []) if (owned.surface === surface) return;
    for (const owned of this.candidate?.sources.values() ?? []) if (owned.surface === surface) return;
    surface.width = surface.height = 0;
  }
  private disposeSurfaces(sources: { values(): Iterable<Source> } | null, retained?: { values(): Iterable<Source> }): void {
    if (sources === null) return;
    const keep = new Set(retained?.values());
    for (const source of sources.values()) if (source.surface !== undefined && !keep.has(source)) source.surface.width = source.surface.height = 0;
  }
  private prunePages(): void {
    const used = new Set([...this.activeSources?.values() ?? []].map((source) => source.page));
    for (const [url, page] of this.pages) if (!used.has(url)) { page.request.dispose(); this.pages.delete(url); }
  }
  diagnostics() {
    if (this.activeSources !== null && this.candidate === null && this.liveJobs.size === 0) this.prunePages();
    const surfaces = new Set<HTMLCanvasElement>();
    for (const source of this.activeSources?.values() ?? []) if (source.surface !== undefined) surfaces.add(source.surface);
    for (const source of this.candidate?.sources.values() ?? []) if (source.surface !== undefined) surfaces.add(source.surface);
    const pages = [...this.pages.entries()].filter(([, page]) => page.loaded);
    return { active: this.active, ready: this.ready, pending: this.pending, failure: this.failure, revision: this.revision,
      pageCount: pages.length, decodedPageBytes: pages.reduce((sum, [, page]) => sum + page.descriptor.decodedBytes, 0),
      recoloredSurfaceCount: surfaces.size, recoloredSurfaceBytes: [...surfaces].reduce((sum, surface) => sum + surface.width * surface.height * 4, 0),
      inFlightPages: this.pages.size - pages.length, pages: pages.map(([url, page]) => ({ url, ...page.descriptor })) };
  }
  reset(): void {
    this.generation++; this.revisionValue++; this.requested = false; this.candidate?.settle(false);
    this.disposeSurfaces(this.activeSources); this.disposeSurfaces(this.candidate?.sources ?? null);
    this.activeSources = null; this.candidate = null; this.liveJobs.clear(); this.liveFailure = null;
    for (const page of this.pages.values()) page.request.dispose();
    this.pages.clear();
  }
}
export const worldAtlasVariants = new AtlasVariantCohort();
