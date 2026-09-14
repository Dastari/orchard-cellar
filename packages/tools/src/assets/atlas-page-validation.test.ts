import { describe, expect, it } from 'vitest';
import { stableAssetId } from './asset-id.js';
import { validateAtlasPages } from './atlas-page-validation.js';
import type { BuiltPageAsset } from './types.js';

const page = { width: 512, height: 16, decodedBytes: 512 * 16 * 4 };
const frame = { x: 0, y: 0, width: 16, height: 16, durationTicks: 0 };
const asset: BuiltPageAsset = {
  assetId: stableAssetId('test'), category: 'tiles', pageId: 'tiles:p000',
  animations: {}, variants: {}, states: { idle: frame },
};
const atlases = { 'tiles:p000:summer': 'atlas_tiles_p000_summer.png' };
function check(record: BuiltPageAsset = asset, descriptor = page, images = atlases): void {
  validateAtlasPages({ 'tiles:p000': descriptor }, { test: record }, images, ['summer']);
}

describe('page manifest validation', () => {
  it('accepts valid page-local frames and the stable placeholder ID', () => {
    expect(() => check()).not.toThrow();
    expect(() => validateAtlasPages({ 'tiles:p000': page }, {
      system_missing_asset: { ...asset, assetId: 0 },
    }, atlases, ['summer'])).not.toThrow();
  });
  it('rejects missing pages, seasonal images and invalid identity', () => {
    expect(() => check({ ...asset, pageId: 'tiles:p001' })).toThrow(/missing page/);
    expect(() => check(asset, page, {} as typeof atlases)).toThrow(/missing summer/);
    expect(() => check({ ...asset, category: 'props' })).toThrow(/invalid page identity/);
    expect(() => check({ ...asset, assetId: 7 })).toThrow(/unstable asset ID/);
  });
  it('rejects oversized pages and incorrect decoded-byte estimates', () => {
    expect(() => check(asset, { width: 513, height: 16, decodedBytes: 513 * 16 * 4 })).toThrow(/dimensions/);
    expect(() => check(asset, { width: 512, height: 2049, decodedBytes: 512 * 2049 * 4 })).toThrow(/dimensions/);
    expect(() => check(asset, { ...page, decodedBytes: 1 })).toThrow(/decoded-byte/);
    expect(() => check(asset, { ...page, height: 0 })).toThrow(/dimensions/);
  });
  it('rejects overlapping, empty or out-of-bounds frames', () => {
    expect(() => check({ ...asset, variants: { extra: [frame] } })).toThrow(/overlapping/);
    expect(() => check({ ...asset, states: {} })).toThrow(/no packed frames/);
    expect(() => check({ ...asset, states: { idle: { ...frame, x: 510 } } })).toThrow(/outside page/);
    expect(() => check({ ...asset, states: { idle: { ...frame, y: -1 } } })).toThrow(/outside page/);
  });
});
