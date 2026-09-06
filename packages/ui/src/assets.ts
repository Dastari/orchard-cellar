import { parseBakedShadow, type BuiltBakedShadow } from './baked-shadow.js';
import type { AtlasFrame, AtlasMetadata } from './sprite.js';
import { assetRequestQueue } from './asset-request-queue.js';
import { loadHtmlImage } from './html-image.js';

export interface BuiltAssetRecord {
  readonly bakedShadow?: BuiltBakedShadow;
  readonly emissiveFrames?: Readonly<Record<string, readonly (readonly number[])[]>>;
  readonly assetId: number;
  readonly category: string;
  readonly anchor: readonly [number, number];
  readonly collision: readonly (readonly [number, number, number, number])[];
  readonly animations: Readonly<Record<string, readonly AtlasFrame[]>>;
  readonly animationMeta: Readonly<Record<string, { readonly fps: number; readonly loop: boolean }>>;
  readonly variants: Readonly<Record<string, readonly AtlasFrame[]>>;
  readonly variantMeta: Readonly<Record<string, { readonly topology?: 'blob47' }>>;
  readonly states: Readonly<Record<string, AtlasFrame>>;
  readonly font?: {
    readonly charset: string;
    readonly glyphSize: readonly [number, number];
    readonly cellSize: readonly [number, number];
    readonly columns: number;
  };
  readonly slice?: readonly [number, number, number, number];
  readonly uiSizing?: 'fixed' | 'nine_slice' | 'corners' | 'segmented';
  readonly uiRequiredStates?: readonly string[];
  readonly markerLayers?: Readonly<Record<string, readonly (readonly MarkerPixel[])[]>>;
  readonly tags: readonly string[];
  readonly placement: {
    readonly layer: 'ground' | 'object' | 'canopy' | 'ui';
    readonly footprint: readonly [number, number];
    readonly blocksMovement: boolean;
    readonly builderAvailable: boolean;
  };
}

interface MarkerPixel { readonly x: number; readonly y: number; readonly marker: string; readonly shade: number }

interface AtlasMarkerManifest {
  readonly schemaVersion: number;
  readonly revision: string;
  readonly assets: Readonly<Record<string, Readonly<Record<string, readonly (readonly MarkerPixel[])[]>>>>;
}

export interface BuiltAtlasManifest {
  readonly schemaVersion: number;
  readonly revision: string;
  readonly revisionId: number;
  readonly placeholderAssetId: number;
  readonly atlases: Readonly<Record<string, string>>;
  /** Present on legacy monolithic manifests and in test fixtures. */
  readonly assets?: Readonly<Record<string, BuiltAssetRecord>>;
  readonly assetCategories?: Readonly<Record<string, string>>;
  readonly assetsById: Readonly<Record<string, string>>;
}

interface BuiltAtlasCategoryManifest {
  readonly schemaVersion: number;
  readonly revision: string;
  readonly category: string;
  readonly assets: Readonly<Record<string, BuiltAssetRecord>>;
}

export interface LoadedAsset {
  readonly bakedShadow?: BuiltBakedShadow;
  readonly emissiveFrames?: Readonly<Record<string, readonly (readonly number[])[]>>;
  readonly assetId: number;
  readonly name: string;
  readonly image: CanvasImageSource;
  readonly anchor: readonly [number, number];
  readonly collision: readonly (readonly [number, number, number, number])[];
  readonly tags: readonly string[];
  readonly placement: BuiltAssetRecord['placement'];
  readonly font?: BuiltAssetRecord['font'];
  readonly slice?: BuiltAssetRecord['slice'];
  readonly uiSizing?: BuiltAssetRecord['uiSizing'];
  readonly uiRequiredStates?: BuiltAssetRecord['uiRequiredStates'];
  readonly atlasRevision: number;
  readonly metadata: AtlasMetadata;
}

export interface GeneratedAssetRegistry {
  readonly schemaVersion: number;
  readonly revision: string;
  readonly revisionId: number;
  readonly placeholderAssetId: number;
  readonly assetsById: Readonly<Record<string, string>>;
}

/** Read-only authoring catalog. Frame rectangles are rendering metadata only;
 * editor documents continue to persist semantic asset/group/index references. */
export interface GeneratedAssetCatalog extends GeneratedAssetRegistry {
  readonly assets: Readonly<Record<string, BuiltAssetRecord>>;
}

let manifestPromise: Promise<BuiltAtlasManifest> | null = null;
let markerManifestPromise: Promise<AtlasMarkerManifest> | null = null;
const categoryManifestPromises = new Map<string, Promise<BuiltAtlasCategoryManifest>>();
const imagePromises = new Map<string, Promise<HTMLImageElement>>();
const warnedMissingAssets = new Set<string>();

async function loadManifest(): Promise<BuiltAtlasManifest> {
  manifestPromise ??= assetRequestQueue.run(async () => {
    const response = await fetch('/generated/atlas.meta.json');
    if (!response.ok) throw new Error(`Unable to load generated atlas metadata: ${response.status}`);
    const manifest = await response.json() as BuiltAtlasManifest;
    if (manifest.assets !== undefined) {
      return { ...manifest, assets: validatedShadowRecords(manifest.assets) };
    }
    return manifest;
  });
  try {
    return await manifestPromise;
  } catch (error) {
    manifestPromise = null;
    throw error;
  }
}

async function loadMarkerManifest(revision: string): Promise<AtlasMarkerManifest> {
  markerManifestPromise ??= assetRequestQueue.run(async () => {
      const response = await fetch(`/generated/atlas.markers.json?rev=${encodeURIComponent(revision)}`);
      if (!response.ok) throw new Error(`Unable to load generated atlas markers: ${response.status}`);
      return await response.json() as AtlasMarkerManifest;
    });
  let manifest: AtlasMarkerManifest;
  try {
    manifest = await markerManifestPromise;
  } catch (error) {
    markerManifestPromise = null;
    throw error;
  }
  if (manifest.revision !== revision) throw new Error('Generated atlas marker revision does not match metadata');
  return manifest;
}

function validatedShadowRecords(assets: Readonly<Record<string, BuiltAssetRecord>>): Readonly<Record<string, BuiltAssetRecord>> {
  return Object.fromEntries(Object.entries(assets).map(([name, asset]) => {
    if (asset.bakedShadow === undefined) return [name, asset];
    if (asset.category === 'ui' || asset.category === 'fonts') throw new Error(`${name}: baked shadows are unsupported for UI/fonts`);
    try { return [name, { ...asset, bakedShadow: parseBakedShadow(asset.bakedShadow, asset) }]; }
    catch (error) { throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
  }));
}

export function parseAtlasCategoryManifest(value: unknown, category: string, revision: string): BuiltAtlasCategoryManifest {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid atlas category metadata');
  const manifest = value as BuiltAtlasCategoryManifest;
  if (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) throw new Error('Unsupported atlas category schema');
  if (manifest.revision !== revision || manifest.category !== category) {
    throw new Error(`Generated ${category} atlas metadata revision does not match index`);
  }
  if (typeof manifest.assets !== 'object' || manifest.assets === null || Array.isArray(manifest.assets)) {
    throw new Error('Invalid atlas category assets');
  }
  return { ...manifest, assets: validatedShadowRecords(manifest.assets) };
}

async function loadCategoryManifest(
  category: string,
  revision: string,
): Promise<BuiltAtlasCategoryManifest> {
  const key = `${revision}:${category}`;
  const existing = categoryManifestPromises.get(key);
  if (existing !== undefined) return await existing;
  const promise = assetRequestQueue.run(async () => {
    const response = await fetch(
      `/generated/atlas_${encodeURIComponent(category)}.meta.json?rev=${encodeURIComponent(revision)}`,
    );
    if (!response.ok) throw new Error(`Unable to load ${category} atlas metadata: ${response.status}`);
    return parseAtlasCategoryManifest(await response.json(), category, revision);
  });
  categoryManifestPromises.set(key, promise);
  try {
    return await promise;
  } catch (error) {
    categoryManifestPromises.delete(key);
    throw error;
  }
}

async function loadAssetRecord(
  manifest: BuiltAtlasManifest,
  name: string,
): Promise<BuiltAssetRecord | undefined> {
  const legacyRecord = manifest.assets?.[name];
  if (legacyRecord !== undefined) return legacyRecord;
  const category = manifest.assetCategories?.[name];
  if (category === undefined) return undefined;
  return (await loadCategoryManifest(category, manifest.revision)).assets[name];
}

export function atlasImageUrl(filename: string, revision: string): string {
  return `/generated/${filename}?rev=${encodeURIComponent(revision)}`;
}

async function loadImage(filename: string, revision: string): Promise<HTMLImageElement> {
  const url = atlasImageUrl(filename, revision);
  const existing = imagePromises.get(url);
  if (existing) return await existing;
  const promise = assetRequestQueue.run(async () => await loadHtmlImage(
    url,
    `atlas image ${filename}`,
  ));
  imagePromises.set(url, promise);
  try {
    return await promise;
  } catch (error) {
    imagePromises.delete(url);
    throw error;
  }
}

export function resolveGeneratedAssetName(manifest: BuiltAtlasManifest, assetId: number): string {
  const requested = manifest.assetsById[String(assetId)];
  const fallback = manifest.assetsById[String(manifest.placeholderAssetId)];
  if (!fallback) throw new Error(`Generated asset placeholder ${manifest.placeholderAssetId} is missing`);
  return requested ?? fallback;
}

export function resolveGeneratedAssetRequestName(manifest: BuiltAtlasManifest, requestedName: string): string {
  if (manifest.assets?.[requestedName] !== undefined
    || manifest.assetCategories?.[requestedName] !== undefined) return requestedName;
  return resolveGeneratedAssetName(manifest, manifest.placeholderAssetId);
}

function applyMarkerOverrides(
  image: HTMLImageElement,
  markerLayers: Readonly<Record<string, readonly (readonly MarkerPixel[])[]>>,
  overrides: Readonly<Record<string, readonly string[]>>,
): CanvasImageSource {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return image;
  context.drawImage(image, 0, 0);
  for (const animationLayers of Object.values(markerLayers)) {
    for (const framePixels of animationLayers) {
      for (const pixel of framePixels) {
        const ramp = overrides[pixel.marker];
        const color = ramp?.[pixel.shade] ?? ramp?.at(-1);
        if (!color) continue;
        context.fillStyle = color;
        context.fillRect(pixel.x, pixel.y, 1, 1);
      }
    }
  }
  return canvas;
}

export async function loadGeneratedAsset(
  name: string,
  season = 'summer',
  markerOverrides: Readonly<Record<string, readonly string[]>> = {},
): Promise<LoadedAsset> {
  const manifest = await loadManifest();
  const resolvedName = resolveGeneratedAssetRequestName(manifest, name);
  const record = await loadAssetRecord(manifest, resolvedName);
  if (!record) throw new Error(`Generated asset placeholder is missing: ${resolvedName}`);
  if (resolvedName !== name && !warnedMissingAssets.has(name)) {
    warnedMissingAssets.add(name);
    console.warn(`Generated asset not found: ${name}; using ${resolvedName}`);
  }
  try {
    return await loadRecord(manifest, name, record, season, markerOverrides);
  } catch (error: unknown) {
    const placeholderName = resolveGeneratedAssetName(manifest, manifest.placeholderAssetId);
    const placeholder = await loadAssetRecord(manifest, placeholderName);
    if (resolvedName === placeholderName || placeholder === undefined) throw error;
    if (!warnedMissingAssets.has(name)) {
      warnedMissingAssets.add(name);
      console.warn(`Generated asset failed to load: ${name}; using ${placeholderName}`, error);
    }
    return await loadRecord(manifest, name, placeholder, season, {});
  }
}

// Weak references let streamed/recoloured assets retire with their owners.
const shadowAssets = new Set<WeakRef<LoadedAsset>>();
export function loadedShadowAssets(): readonly LoadedAsset[] {
  const result: LoadedAsset[] = [];
  for (const reference of shadowAssets) {
    const asset = reference.deref();
    if (asset === undefined) shadowAssets.delete(reference);
    else result.push(asset);
  }
  return result;
}

async function loadRecord(
  manifest: BuiltAtlasManifest,
  name: string,
  record: BuiltAssetRecord,
  season: string,
  markerOverrides: Readonly<Record<string, readonly string[]>>,
): Promise<LoadedAsset> {
  const filename = manifest.atlases[`${record.category}:${season}`];
  if (!filename) throw new Error(`Atlas not found for ${record.category}:${season}`);
  const image = await loadImage(filename, manifest.revision);
  const resolvedName = resolveGeneratedAssetName(manifest, record.assetId);
  const markerLayers = Object.keys(markerOverrides).length === 0
    ? undefined
    : record.markerLayers ?? (await loadMarkerManifest(manifest.revision)).assets[resolvedName] ?? {};
  const asset: LoadedAsset = {
    assetId: record.assetId,
    name,
    image: markerLayers === undefined ? image : applyMarkerOverrides(image, markerLayers, markerOverrides),
    anchor: record.anchor,
    collision: record.collision,
    tags: record.tags,
    placement: record.placement,
    font: record.font,
    slice: record.slice,
    uiSizing: record.uiSizing,
    uiRequiredStates: record.uiRequiredStates,
    bakedShadow: record.bakedShadow,
    emissiveFrames: record.emissiveFrames,
    atlasRevision: manifest.revisionId,
    metadata: {
      image: filename,
      animations: record.animations,
      animationMeta: record.animationMeta,
      variants: record.variants,
      variantMeta: record.variantMeta,
      states: record.states,
    },
  };
  if (asset.bakedShadow !== undefined) shadowAssets.add(new WeakRef(asset));
  return asset;
}

/** Resolve server-authored ids safely. Unknown/newer ids visibly use asset id 0. */
export async function loadGeneratedAssetById(
  assetId: number,
  season = 'summer',
  markerOverrides: Readonly<Record<string, readonly string[]>> = {},
): Promise<LoadedAsset> {
  const manifest = await loadManifest();
  const name = resolveGeneratedAssetName(manifest, assetId);
  const record = await loadAssetRecord(manifest, name);
  if (!record) throw new Error(`Generated asset manifest is missing record: ${name}`);
  return await loadRecord(manifest, name, record, season, markerOverrides);
}

export async function loadGeneratedAssetRegistry(): Promise<GeneratedAssetRegistry> {
  const manifest = await loadManifest();
  return {
    schemaVersion: manifest.schemaVersion,
    revision: manifest.revision,
    revisionId: manifest.revisionId,
    placeholderAssetId: manifest.placeholderAssetId,
    assetsById: manifest.assetsById,
  };
}

export async function loadGeneratedAssetCatalog(): Promise<GeneratedAssetCatalog> {
  const manifest = await loadManifest();
  const assets = manifest.assets ?? Object.assign(
    {},
    ...await Promise.all(
      [...new Set(Object.values(manifest.assetCategories ?? {}))]
        .map(async (category) => (await loadCategoryManifest(category, manifest.revision)).assets),
    ),
  ) as Readonly<Record<string, BuiltAssetRecord>>;
  return {
    schemaVersion: manifest.schemaVersion,
    revision: manifest.revision,
    revisionId: manifest.revisionId,
    placeholderAssetId: manifest.placeholderAssetId,
    assetsById: manifest.assetsById,
    assets,
  };
}
