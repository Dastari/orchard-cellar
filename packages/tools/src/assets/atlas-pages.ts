/** Deterministic shelf packing: every frame of an asset belongs to one page. */
export const ATLAS_PAGE_WIDTH = 512;
export const ATLAS_PAGE_HEIGHT = 2048;
export const ATLAS_PAGE_MAX_BYTES = 4 * 1024 * 1024;

export interface AtlasPackAsset {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
}
export interface AtlasFramePosition { readonly x: number; readonly y: number }
export interface AtlasPackedAsset {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly AtlasFramePosition[];
}
export interface AtlasPage {
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly assets: readonly AtlasPackedAsset[];
}
interface Cursor { x: number; y: number; rowHeight: number }

function place(asset: AtlasPackAsset, cursor: Cursor): AtlasFramePosition[] | undefined {
  const frames: AtlasFramePosition[] = [];
  for (let index = 0; index < asset.frameCount; index += 1) {
    if (cursor.x + asset.width > ATLAS_PAGE_WIDTH) {
      cursor.x = 0;
      cursor.y += cursor.rowHeight;
      cursor.rowHeight = 0;
    }
    if (cursor.y + asset.height > ATLAS_PAGE_HEIGHT) return undefined;
    frames.push({ x: cursor.x, y: cursor.y });
    cursor.x += asset.width;
    cursor.rowHeight = Math.max(cursor.rowHeight, asset.height);
  }
  return frames;
}

export function packAtlasPages(category: string, assets: readonly AtlasPackAsset[]): AtlasPage[] {
  const pages: AtlasPage[] = [];
  let packed: AtlasPackedAsset[] = [];
  let cursor: Cursor = { x: 0, y: 0, rowHeight: 0 };
  const names = new Set<string>();
  const finish = (): void => {
    if (packed.length === 0) return;
    pages.push({
      pageId: `${category}:p${String(pages.length).padStart(3, '0')}`,
      width: ATLAS_PAGE_WIDTH,
      height: cursor.y + cursor.rowHeight,
      assets: packed,
    });
    packed = [];
    cursor = { x: 0, y: 0, rowHeight: 0 };
  };
  for (const asset of assets) {
    if (names.has(asset.name)) throw new Error(`Duplicate atlas asset: ${asset.name}`);
    names.add(asset.name);
    if (![asset.width, asset.height, asset.frameCount].every((value) => Number.isSafeInteger(value) && value > 0)) {
      throw new Error(`${asset.name}: dimensions and frame count must be positive integers`);
    }
    if (asset.width > ATLAS_PAGE_WIDTH || asset.height > ATLAS_PAGE_HEIGHT) {
      throw new Error(`${asset.name}: ${asset.width}×${asset.height} frame exceeds the 512×2048 atlas page; split the source asset`);
    }
    let next = { ...cursor };
    let frames = place(asset, next);
    if (!frames) {
      finish();
      next = { ...cursor };
      frames = place(asset, next);
    }
    if (!frames) throw new Error(`${asset.name}: all ${asset.frameCount} frames cannot fit one 512×2048 / 4 MiB atlas page; split the source asset`);
    packed.push({ name: asset.name, width: asset.width, height: asset.height, frames });
    cursor = next;
  }
  finish();
  return pages;
}
