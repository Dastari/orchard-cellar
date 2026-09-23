import { stableAssetId } from './asset-id.js';
import { ATLAS_PAGE_HEIGHT, ATLAS_PAGE_MAX_BYTES, ATLAS_PAGE_WIDTH } from './atlas-pages.js';
import type { BuiltPageAsset, BuiltPageDescriptor } from './types.js';

/** Validate page-local geometry before publishing any index that names it. */
export function validateAtlasPages(
  pages: Readonly<Record<string, BuiltPageDescriptor>>,
  assets: Readonly<Record<string, BuiltPageAsset>>,
  atlases: Readonly<Record<string, string>>,
  seasons: readonly string[],
): void {
  const owners = new Map<number, string>();
  for (const [name, asset] of Object.entries(assets)) {
    if (!pages[asset.pageId]) throw new Error(`${name}: missing page ${asset.pageId}`);
    if (!asset.pageId.startsWith(`${asset.category}:`) || !/^(?:[a-z0-9-]+:)?p\d{3,}$/.test(asset.pageId.slice(asset.category.length + 1))) {
      throw new Error(`${name}: invalid page identity ${asset.pageId}`);
    }
    const expectedId = name === 'system_missing_asset' ? 0 : stableAssetId(name);
    if (asset.assetId !== expectedId) throw new Error(`${name}: unstable asset ID ${asset.assetId}, expected ${expectedId}`);
    const owner = owners.get(asset.assetId);
    if (owner) throw new Error(`Stable asset ID collision: ${owner} and ${name}`);
    owners.set(asset.assetId, name);
  }
  for (const [pageId, page] of Object.entries(pages)) {
    if (![page.width, page.height].every((value) => Number.isSafeInteger(value) && value > 0)
      || page.width > ATLAS_PAGE_WIDTH || page.height > ATLAS_PAGE_HEIGHT
      || page.decodedBytes !== page.width * page.height * 4 || page.decodedBytes > ATLAS_PAGE_MAX_BYTES) {
      throw new Error(`${pageId}: invalid dimensions or decoded-byte estimate`);
    }
    for (const season of seasons) {
      const filename = atlases[`${pageId}:${season}`];
      if (!filename) throw new Error(`${pageId}: missing ${season} image reference`);
      // Content-addressed identical seasons/pages deliberately share one image.
    }
    // Only one page's occupancy buffer is retained during validation.
    const occupied = new Uint8Array(page.width * page.height);
    for (const [name, asset] of Object.entries(assets)) {
      if (asset.pageId !== pageId) continue;
      const frames = [...Object.values(asset.animations).flat(), ...Object.values(asset.variants).flat(), ...Object.values(asset.states)];
      if (frames.length === 0) throw new Error(`${name}: no packed frames`);
      for (const frame of frames) {
        if (![frame.x, frame.y, frame.width, frame.height].every(Number.isSafeInteger)
          || frame.x < 0 || frame.y < 0 || frame.width < 1 || frame.height < 1
          || frame.x + frame.width > page.width || frame.y + frame.height > page.height) {
          throw new Error(`${name}: frame outside page ${pageId}`);
        }
        for (let y = frame.y; y < frame.y + frame.height; y += 1) {
          const start = y * page.width + frame.x;
          if (occupied.subarray(start, start + frame.width).some(Boolean)) throw new Error(`${name}: overlapping frame on ${pageId}`);
          occupied.fill(1, start, start + frame.width);
        }
      }
    }
  }
}
