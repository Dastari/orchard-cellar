import { loadGeneratedAsset, ui, uiFixed, type AtlasFrame, type LoadedAsset, type UiElement } from '@orchard/ui/studio';

/** Route-owned thumbnails: generated art only, retained kit images, no screen renderer. */
export class StudioAssetPreview {
  readonly assets = new Map<string, LoadedAsset>();
  readonly pending = new Set<string>();
  readonly failures = new Map<string, string>();
  disposed = false;
  constructor(private readonly invalidate: () => void) {}

  asset(name: string): LoadedAsset | undefined {
    const asset = this.assets.get(name);
    if (!asset && !this.pending.has(name) && !this.failures.has(name) && typeof window !== 'undefined' && !this.disposed) {
      this.pending.add(name);
      void loadGeneratedAsset(name).then(value => { if (!this.disposed) this.assets.set(name, value); })
        .catch((error: unknown) => { if (!this.disposed) this.failures.set(name, String(error)); })
        .finally(() => { this.pending.delete(name); if (!this.disposed) this.invalidate(); });
    }
    return asset;
  }

  image(name: string, frame: number | AtlasFrame = 0, scale = 2): UiElement {
    const asset = this.asset(name);
    const source = typeof frame === 'object' ? frame : asset && (
      (asset.metadata.variants?.['default'] ?? asset.metadata.animations['default']
        ?? Object.values(asset.metadata.variants ?? {})[0] ?? Object.values(asset.metadata.animations)[0]
        ?? Object.values(asset.metadata.states ?? {}))[frame]);
    return asset && source ? ui.image(asset.image, source, {label:name,integerScale:scale,fit:'contain',layout:{width:'grow',height:'grow'}})
      : ui.text(this.failures.has(name) ? 'Art unavailable' : asset ? 'Missing frame' : 'Loading art', {layout:{width:uiFixed(64)}});
  }

  dispose(): void { this.disposed = true; this.assets.clear(); this.failures.clear(); }
}
