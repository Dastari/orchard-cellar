import type { LoadedAsset } from '@orchard/ui';
import type { LightingReviewAsset } from './lighting-review.js';
import type { WorldAssetPages } from './world-asset-presentation.js';

/** Fixture inputs carry builder-produced PNG variants. Review code performs
 * no runtime pixel removal and cannot silently regenerate a missing variant. */
export class ReviewAtlasPages implements WorldAssetPages {
  private readonly images = new Map<string, HTMLImageElement>();
  revision = 0;
  constructor(private readonly inputs: readonly LightingReviewAsset[]) {}
  async prepare(): Promise<void> {
    for (const input of this.inputs) {
      if (input.record.bakedShadow === undefined || this.images.has(input.name)) continue;
      if (input.omitPng === undefined) throw new Error(`Missing built review omit PNG: ${input.name}`);
      const image = new Image(); image.src = input.omitPng; await image.decode();
      this.images.set(input.name, image);
    }
    this.revision++;
  }
  source(asset: LoadedAsset): CanvasImageSource {
    if (asset.bakedShadow === undefined) return asset.image;
    const image = this.images.get(asset.name);
    if (image === undefined) throw new Error(`Unprepared review omit page: ${asset.name}`);
    return image;
  }
  get bytes(): number {
    let bytes = 0; for (const image of this.images.values()) bytes += image.naturalWidth * image.naturalHeight * 4;
    return bytes;
  }
  reset(): void { this.images.clear(); this.revision++; }
}
