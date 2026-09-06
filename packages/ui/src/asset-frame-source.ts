export { renderProtocolAction } from './render-protocol-action.js';
import { renderOperationCounters } from './render-operation-counters.js';
export * from './render-operation-counters.js';
import type { LoadedAsset } from './assets.js';
import type { BuiltBakedShadowFrame } from './baked-shadow.js';
import type { AtlasFrame } from './sprite.js';

export type AssetPresentation = 'original' | 'omit-baked-shadow';
export interface AssetFrameSource {
  readonly image: CanvasImageSource;
  readonly emissiveSpans?: readonly number[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface AssetFrameRequest { readonly asset: LoadedAsset; readonly frame: AtlasFrame }
export type FramePreparation = 'ready' | 'cancelled' | 'budget-exceeded' | 'surface-unavailable';
interface Entry {
  readonly original: AssetFrameSource;
  readonly selection: BuiltBakedShadowFrame | undefined;
  filtered?: AssetFrameSource;
  surface?: HTMLCanvasElement;
  used: number;
}

/** Resolve by rectangle so animation/state aliases share the same selection. */
export function bakedShadowSelection(asset: LoadedAsset, frame: AtlasFrame): BuiltBakedShadowFrame | undefined {
  if (asset.bakedShadow === undefined) return undefined;
  for (const [group, selections] of Object.entries(asset.bakedShadow.frames)) {
    const originals = asset.metadata.animations[group] ?? asset.metadata.variants?.[group]
      ?? (asset.metadata.states?.[group] ? [asset.metadata.states[group]!] : []);
    for (let i = 0; i < originals.length; i++) {
      const candidate = originals[i]!;
      if (candidate.x === frame.x && candidate.y === frame.y
        && candidate.width === frame.width && candidate.height === frame.height) return selections[i];
    }
  }
  return undefined;
}

/** Resolve emission through rectangle aliases, like baked-shadow selections. */
export function emissiveFrameSpans(asset: LoadedAsset, frame: AtlasFrame): readonly number[] | undefined {
  if (asset.emissiveFrames === undefined) return undefined;
  for (const [name, spans] of Object.entries(asset.emissiveFrames)) {
    const originals = asset.metadata.animations[name] ?? asset.metadata.variants?.[name]
      ?? (asset.metadata.states?.[name] ? [asset.metadata.states[name]!] : []);
    const index = originals.findIndex((f) => f.x === frame.x && f.y === frame.y && f.width === frame.width && f.height === frame.height);
    if (index >= 0) return spans[index];
  }
  return undefined;
}

/** Renderer-owned cache. World draws filter only missing frames and pin them
 * until the next frame. Previews may prepare a complete set asynchronously. */
export class AssetFrameSourceCache {
  private generationValue = 0;
  private revisionValue = 0;
  private sequence = 0;
  private identities = new WeakMap<object, number>();
  private handles = new WeakMap<LoadedAsset, WeakMap<AtlasFrame, Entry>>();
  private entries = new Map<string, Entry>();
  private pinned = new Set<Entry>();
  private resident = new Map<Entry, true>();
  private bytesValue = 0;
  private buildsValue = 0;
  private evictionsValue = 0;
  private clock = 0;

  constructor(
    readonly budgetBytes = 8 * 1024 * 1024,
    private readonly createSurface: () => HTMLCanvasElement = () => document.createElement('canvas'),
    private readonly yieldBatch: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
    private readonly drawSurfaceLimit = 512,
  ) {
    if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0) throw new Error('Invalid filtered-frame budget');
    if (!Number.isSafeInteger(drawSurfaceLimit) || drawSurfaceLimit < 1) throw new Error('Invalid filtered-frame surface limit');
  }

  get generation(): number { return this.generationValue; }
  /** Presentation invalidation is independent of background preparation jobs. */
  get revision(): number { return this.revisionValue; }
  get bytes(): number { return this.bytesValue; }
  get builds(): number { return this.buildsValue; }
  get evictions(): number { return this.evictionsValue; }
  get surfaces(): number { return this.resident.size; }

  private identity(value: object): number {
    let id = this.identities.get(value);
    if (id === undefined) { id = ++this.sequence; this.identities.set(value, id); }
    return id;
  }

  private entry(asset: LoadedAsset, frame: AtlasFrame): Entry {
    let handles = this.handles.get(asset);
    if (handles === undefined) { handles = new WeakMap(); this.handles.set(asset, handles); }
    const handle = handles.get(frame);
    if (handle !== undefined) return handle;
    const key = `${this.identity(asset.image)}:${asset.atlasRevision}:${asset.bakedShadow ? this.identity(asset.bakedShadow) : 0}:${frame.x}:${frame.y}:${frame.width}:${frame.height}`;
    let entry = this.entries.get(key);
    if (entry === undefined) {
      entry = { original: { image: asset.image, x: frame.x, y: frame.y, width: frame.width, height: frame.height, emissiveSpans: emissiveFrameSpans(asset, frame) },
        selection: bakedShadowSelection(asset, frame), used: 0 };
      this.entries.set(key, entry);
    }
    handles.set(frame, entry);
    return entry;
  }

  /** Null means the caller must retain its previous complete presentation. */
  source(asset: LoadedAsset, frame: AtlasFrame, presentation: AssetPresentation): AssetFrameSource | null {
    const entry = this.entry(asset, frame);
    this.touch(entry);
    return presentation === 'original' || !entry.selection?.pixelCount ? entry.original : entry.filtered ?? null;
  }

  private touch(entry: Entry): void {
    entry.used = ++this.clock;
    if (this.resident.delete(entry)) this.resident.set(entry, true);
  }

  private release(entry: Entry): void {
    if (entry.surface === undefined) return;
    this.bytesValue -= entry.original.width * entry.original.height * 4;
    entry.surface.width = entry.surface.height = 0;
    this.resident.delete(entry);
    entry.surface = undefined;
    entry.filtered = undefined;
  }

  /** Start a world frame. Only frames consumed by this draw are protected from
   * eviction; unused animation poses must never block rendering new content. */
  beginFrame(): void {
    this.generationValue++;
    this.pinned.clear();
  }

  /** A cache miss strips precomputed spans from this one frame immediately.
   * No pixel readback, animation scan or lighting-mode transition is needed. */
  sourceForDraw(asset: LoadedAsset, frame: AtlasFrame, presentation: AssetPresentation): AssetFrameSource {
    const entry = this.entry(asset, frame);
    this.touch(entry);
    if (presentation === 'original' || !entry.selection?.pixelCount) return entry.original;
    this.pinned.add(entry);
    if (entry.filtered !== undefined) return entry.filtered;
    const bytes = entry.original.width * entry.original.height * 4;
    if (bytes > this.budgetBytes) throw new Error('world_asset_frame_budget_exceeded');
    // Resident order is LRU; do not scan all historical animation descriptors.
    if (this.bytesValue + bytes > this.budgetBytes || this.resident.size >= this.drawSurfaceLimit) {
      for (const victim of this.resident.keys()) {
        if (this.pinned.has(victim)) continue;
        this.release(victim); this.evictionsValue++;
        if (this.bytesValue + bytes <= this.budgetBytes && this.resident.size < this.drawSurfaceLimit) break;
      }
    }
    if (this.bytesValue + bytes > this.budgetBytes || this.resident.size >= this.drawSurfaceLimit) {
      throw new Error('world_asset_frame_budget_exceeded');
    }
    if (this.build(entry) !== 'ready') throw new Error('world_asset_frame_surface_unavailable');
    return entry.filtered!;
  }

  private build(entry: Entry): 'ready' | 'surface-unavailable' {
    let surface: HTMLCanvasElement | undefined;
    try {
      surface = this.createSurface();
      surface.width = entry.original.width; surface.height = entry.original.height;
      const context = surface.getContext('2d');
      if (context === null) throw new Error('Canvas unavailable');
      context.imageSmoothingEnabled = false;
      context.drawImage(entry.original.image, entry.original.x, entry.original.y,
        surface.width, surface.height, 0, 0, surface.width, surface.height);
      const spans = entry.selection!.spans;
      for (let i = 0; i < spans.length; i += 3) context.clearRect(spans[i + 1]!, spans[i]!, spans[i + 2]!, 1);
      entry.surface = surface;
      this.resident.set(entry, true);
      entry.filtered = { ...entry.original, image: surface, x: 0, y: 0, width: surface.width, height: surface.height };
      this.bytesValue += entry.original.width * entry.original.height * 4; this.buildsValue++; renderOperationCounters.filteredFrameBuilds++;
    } catch {
      if (surface !== undefined) surface.width = surface.height = 0;
      return 'surface-unavailable';
    }
    return 'ready';
  }

  /** Each request supersedes any pending preparation. No stale job may publish
   * a filtered surface after a space/revision/quality transition. */
  async prepareVisible(requests: readonly AssetFrameRequest[]): Promise<FramePreparation> {
    const generation = ++this.generationValue;
    const visible = new Set(requests.map(({ asset, frame }) => this.entry(asset, frame)));
    this.pinned = visible;
    let required = 0;
    for (const entry of visible) if (entry.selection?.pixelCount) required += entry.original.width * entry.original.height * 4;
    if (required > this.budgetBytes) return 'budget-exceeded';
    const disposable = [...this.entries.values()].filter((entry) => entry.surface !== undefined && !visible.has(entry))
      .sort((a, b) => a.used - b.used);
    let batch = 0;
    let batchStart = performance.now();
    for (const entry of visible) {
      if (generation !== this.generationValue) return 'cancelled';
      if (!entry.selection?.pixelCount || entry.filtered !== undefined) continue;
      const bytes = entry.original.width * entry.original.height * 4;
      while (this.bytesValue + bytes > this.budgetBytes) {
        const victim = disposable.shift();
        if (victim === undefined || this.pinned.has(victim)) return 'budget-exceeded';
        this.release(victim); this.evictionsValue++;
      }
      if (this.build(entry) !== 'ready') return 'surface-unavailable';
      this.touch(entry);
      if (++batch >= 8 || performance.now() - batchStart >= 4) {
        await this.yieldBatch(); batch = 0; batchStart = performance.now();
      }
    }
    return generation === this.generationValue ? 'ready' : 'cancelled';
  }

  /** Basic startup needs no surfaces; entering Basic/another space releases all. */
  reset(): void {
    this.generationValue++;
    this.revisionValue++;
    for (const entry of this.entries.values()) this.release(entry);
    this.entries.clear(); this.pinned.clear();
    this.handles = new WeakMap(); this.identities = new WeakMap();
    this.sequence = 0; this.buildsValue = 0; this.evictionsValue = 0;
  }
}
