import type { LoadedAsset } from './assets.js';

export interface AtlasVariantSource {
  readonly image: CanvasImageSource;
  readonly page: string;
  readonly surface?: HTMLCanvasElement;
}
interface Entry { readonly asset: WeakRef<LoadedAsset>; readonly source: AtlasVariantSource }
/** An active cohort must not become the owner of streamed/recoloured assets.
 * Weak membership permits retirement; reset still releases every page at once. */
export class AtlasVariantSources {
  private readonly lookup = new WeakMap<LoadedAsset, Entry>();
  private readonly entries = new Set<Entry>();
  constructor(sources: ReadonlyMap<LoadedAsset, AtlasVariantSource>) {
    for (const [asset, source] of sources) this.set(asset, source);
  }
  get size(): number { this.prune(); return this.entries.size; }
  get(asset: LoadedAsset): AtlasVariantSource | undefined { return this.lookup.get(asset)?.source; }
  has(asset: LoadedAsset): boolean { return this.lookup.has(asset); }
  set(asset: LoadedAsset, source: AtlasVariantSource): void {
    const existing = this.lookup.get(asset);
    if (existing !== undefined) this.entries.delete(existing);
    const entry = { asset: new WeakRef(asset), source };
    this.lookup.set(asset, entry); this.entries.add(entry);
  }
  *values(): IterableIterator<AtlasVariantSource> {
    this.prune();
    for (const entry of this.entries) yield entry.source;
  }
  private prune(): void {
    for (const entry of this.entries) if (entry.asset.deref() === undefined) {
      const surface = entry.source.surface;
      if (surface !== undefined) surface.width = surface.height = 0;
      this.entries.delete(entry);
    }
  }
}
