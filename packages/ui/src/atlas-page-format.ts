/** Migration readers land before the bounded-page writers. Keep supplied
 * legacy versions through the separate doc 47 retirement gate. */
export function assertAtlasSchema(kind: 'index' | 'category' | 'markers' | 'registry', version: unknown): void {
  const maximum = kind === 'category' ? 3 : kind === 'markers' ? 2 : kind === 'index' ? 5 : 4;
  if (!Number.isInteger(version) || (version as number) < 1 || (version as number) > maximum) {
    throw new Error(`Unsupported atlas ${kind} schema: ${String(version)}`);
  }
}
export function atlasPageKey(record: { readonly category: string; readonly pageId?: string }, season: string): string {
  if (record.pageId !== undefined) {
    const prefix = `${record.category}:`;
    if (!record.pageId.startsWith(prefix) || !/^(?:[a-z0-9-]+:)?p\d{3,}$/.test(record.pageId.slice(prefix.length))) {
      throw new Error(`Invalid atlas page identity: ${record.pageId}`);
    }
  }
  return `${record.pageId ?? record.category}:${season}`;
}
export function assertAtlasPageImage(image: { readonly naturalWidth: number; readonly naturalHeight: number }): void {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > 512 || height > 2048 || width * height * 4 > 4 * 1024 * 1024) {
    throw new Error(`Atlas page exceeds 512x2048 / 4 MiB: ${width}x${height}`);
  }
}

export interface CompactAssetRegistry {
  readonly schemaVersion: number;
  readonly revision: string;
  readonly assets: readonly { readonly assetId: number; readonly name: string; readonly category: string; readonly pageId?: string }[];
}
/** The compact registry is an authoring artifact; gameplay's registry facade
 * continues to use the index so it does not download a second full catalog. */
export function parseCompactAssetRegistry(value: unknown): CompactAssetRegistry {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid asset registry');
  const registry = value as CompactAssetRegistry;
  assertAtlasSchema('registry', registry.schemaVersion);
  if (typeof registry.revision !== 'string' || !Array.isArray(registry.assets)
    || registry.assets.some((asset) => !asset || !Number.isInteger(asset.assetId)
      || typeof asset.name !== 'string' || typeof asset.category !== 'string')) {
    throw new Error('Invalid compact registry assets');
  }
  for (const asset of registry.assets) {
    if (registry.schemaVersion === 4 && asset.pageId === undefined) throw new Error('Missing registry page identity');
    atlasPageKey(asset, 'summer');
  }
  return registry;
}

export interface AtlasPageDescriptor { readonly width: number; readonly height: number; readonly decodedBytes: number }
export function assertAtlasPageDescriptor(page: AtlasPageDescriptor): void {
  assertAtlasPageImage({ naturalWidth: page.width, naturalHeight: page.height });
  if (page.decodedBytes !== page.width * page.height * 4) throw new Error('Invalid atlas decoded-byte estimate');
}
