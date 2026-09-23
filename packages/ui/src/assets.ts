import { assertAtlasSchema, atlasPageKey, type AtlasPageDescriptor } from './atlas-page-format.js';
export { atlasPageKey, parseCompactAssetRegistry } from './atlas-page-format.js';
import { parseBakedShadow, type BuiltBakedShadow } from './baked-shadow.js';
import type { AtlasFrame, AtlasMetadata } from './sprite.js';
import { assetRequestQueue } from './asset-request-queue.js';
import { loadAtlasPage } from './atlas-page-loader.js';
import { applyMarkerOverrides, type MarkerPixel } from './atlas-marker-overrides.js';
import { AtlasVariantLoadError, worldAtlasVariants } from './atlas-variant-cohort.js';
export { AtlasVariantCohort, AtlasVariantLoadError, worldAtlasVariants } from './atlas-variant-cohort.js';
export { atlasImageUrl, atlasPageDiagnostics } from './atlas-page-loader.js';

export interface BuiltAssetRecord {
  readonly bakedShadow?: BuiltBakedShadow;
  readonly emissiveFrames?: Readonly<Record<string, readonly (readonly number[])[]>>;
  readonly assetId: number;
  readonly category: string;
  /** Absent on legacy category/season atlases. */
  readonly pageId?: string;
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

interface AtlasMarkerManifest {
  readonly assetPages?: Readonly<Record<string, string>>;
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
  readonly omitAtlases?: Readonly<Record<string, string>>;
  readonly pages?: Readonly<Record<string, AtlasPageDescriptor>>;
  /** Present on legacy monolithic manifests and in test fixtures. */
  readonly assets?: Readonly<Record<string, BuiltAssetRecord>>;
  readonly assetCategories?: Readonly<Record<string, string>>;
  readonly assetsById: Readonly<Record<string, string>>;
  readonly assetPacks?: Readonly<Record<string, string>>;
  readonly packs?: Readonly<Record<string, string>>;
}

interface BuiltAtlasCategoryManifest {
  readonly schemaVersion: number;
  readonly revision: string;
  readonly category: string;
  readonly assets: Readonly<Record<string, BuiltAssetRecord>>;
}

interface BuiltAtlasPackManifest {
  readonly schemaVersion: 1;
  readonly packId: string;
  readonly assets: Readonly<Record<string, BuiltAssetRecord>>;
  readonly pages: Readonly<Record<string, AtlasPageDescriptor>>;
  readonly atlases: Readonly<Record<string, string>>;
  readonly omitAtlases: Readonly<Record<string, string>>;
}
const packPromises = new Map<string, Promise<BuiltAtlasPackManifest>>();

async function loadPackManifest(index: BuiltAtlasManifest, packId: string): Promise<BuiltAtlasPackManifest> {
  const filename = index.packs?.[packId];
  if (!filename || !/^pack-[a-f0-9]{64}\.json$/.test(filename)) throw new Error(`Unknown atlas pack: ${packId}`);
  let pending = packPromises.get(filename);
  if (!pending) {
    pending = assetRequestQueue.run(async () => {
      const response = await fetch(`/generated/${filename}`);
      if (!response.ok) throw new Error(`Unable to load atlas pack ${packId}: ${response.status}`);
      const pack = await response.json() as BuiltAtlasPackManifest;
      if (pack.schemaVersion !== 1 || pack.packId !== packId || !pack.assets || !pack.pages || !pack.atlases || !pack.omitAtlases) {
        throw new Error(`Invalid atlas pack: ${packId}`);
      }
      for (const [name, record] of Object.entries(pack.assets)) {
        if (index.assetPacks?.[name] !== packId || !record.pageId || !pack.pages[record.pageId]
          || index.assetsById[String(record.assetId)] !== name) throw new Error(`Atlas pack asset mismatch: ${name}`);
        atlasPageKey(record, 'summer');
      }
      for (const file of [...Object.values(pack.atlases), ...Object.values(pack.omitAtlases)]) {
        if (!/^atlas-[a-f0-9]{64}\.png$/.test(file)) throw new Error(`Invalid immutable atlas URL: ${file}`);
      }
      return { ...pack, assets: validatedShadowRecords(pack.assets) };
    });
    packPromises.set(filename, pending);
  }
  try { return await pending; }
  catch (error) { packPromises.delete(filename); throw error; }
}

/** Stable semantic IDs for authored chunk manifests. Missing assets fail closed. */
export async function atlasPackIdsForAssets(names: readonly string[]): Promise<readonly string[]> {
  const index = await loadPackIndex();
  return [...new Set(names.map((name) => {
    const packId = index.assetPacks?.[name];
    if (!packId) throw new Error(`No atlas pack for asset: ${name}`);
    return packId;
  }))].sort();
}

/** Pin/ring chunk hook. Fetch only these packs and this season, with normal queue deduplication. */
export async function loadAtlasPacks(ids: readonly string[], season = 'summer'): Promise<void> {
  const index = await loadPackIndex();
  await Promise.all([...new Set(ids)].map(async (id) => {
    const pack = await loadPackManifest(index, id);
    await Promise.all(Object.entries(pack.pages).map(async ([pageId, page]) => {
      const file = pack.atlases[`${pageId}:${season}`];
      if (!file) throw new Error(`Atlas pack season unavailable: ${id}:${season}`);
      await loadAtlasPage(file, index.revision, page);
    }));
  }));
}

export interface LoadedAsset {
  readonly bakedShadow?: BuiltBakedShadow;
  readonly emissiveFrames?: Readonly<Record<string, readonly (readonly number[])[]>>;
  readonly assetId: number;
  readonly name: string;
  readonly pageId?: string;
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
let packIndexPromise: Promise<BuiltAtlasManifest> | null = null;
let manifestUsesPacks: boolean | undefined;
/** Rollout remains opt-in until visible dependency ownership replaces the
 * eager gameplay art factory. Studio and existing game startup stay consolidated. */
function packDeliveryEnabled(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('atlasPacks') === '1';
}
async function loadPackIndex(): Promise<BuiltAtlasManifest> {
  packIndexPromise ??= assetRequestQueue.run(async () => {
    const response = await fetch('/generated/atlas.packs.json');
    if (!response.ok) throw new Error(`Unable to load atlas pack index: ${response.status}`);
    const index = await response.json() as BuiltAtlasManifest;
    if (index.schemaVersion !== 5 || !index.assetPacks || !index.packs) throw new Error('Invalid atlas pack index');
    return index;
  });
  try { return await packIndexPromise; }
  catch (error) { packIndexPromise = null; throw error; }
}
let markerManifestPromise: Promise<AtlasMarkerManifest> | null = null;
const categoryManifestPromises = new Map<string, Promise<BuiltAtlasCategoryManifest>>();
const warnedMissingAssets = new Set<string>();

async function loadManifest(): Promise<BuiltAtlasManifest> {
  manifestUsesPacks ??= packDeliveryEnabled();
  if (manifestUsesPacks) return await loadPackIndex();
  manifestPromise ??= assetRequestQueue.run(async () => {
    const response = await fetch('/generated/atlas.meta.json');
    if (!response.ok) throw new Error(`Unable to load generated atlas metadata: ${response.status}`);
    const manifest = await response.json() as BuiltAtlasManifest;
    assertAtlasSchema('index', manifest.schemaVersion);
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
      const manifest = await response.json() as AtlasMarkerManifest;
      assertAtlasSchema('markers', manifest.schemaVersion);
      return manifest;
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
  assertAtlasSchema('category', manifest.schemaVersion);
  if (manifest.revision !== revision || manifest.category !== category) {
    throw new Error(`Generated ${category} atlas metadata revision does not match index`);
  }
  if (typeof manifest.assets !== 'object' || manifest.assets === null || Array.isArray(manifest.assets)) {
    throw new Error('Invalid atlas category assets');
  }
  for (const [name, record] of Object.entries(manifest.assets)) {
    if (manifest.schemaVersion >= 3 && record.pageId === undefined) throw new Error(`${name}: missing atlas page identity`);
    atlasPageKey(record, 'summer');
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
  const packId = manifest.assetPacks?.[name];
  if (packId !== undefined) return (await loadPackManifest(manifest, packId)).assets[name];
  const category = manifest.assetCategories?.[name];
  if (category === undefined) return undefined;
  return (await loadCategoryManifest(category, manifest.revision)).assets[name];
}

export function resolveGeneratedAssetName(manifest: BuiltAtlasManifest, assetId: number): string {
  const requested = manifest.assetsById[String(assetId)];
  const fallback = manifest.assetsById[String(manifest.placeholderAssetId)];
  if (!fallback) throw new Error(`Generated asset placeholder ${manifest.placeholderAssetId} is missing`);
  return requested ?? fallback;
}

export function resolveGeneratedAssetRequestName(manifest: BuiltAtlasManifest, requestedName: string): string {
  if (manifest.assets?.[requestedName] !== undefined
    || manifest.assetPacks?.[requestedName] !== undefined
    || manifest.assetCategories?.[requestedName] !== undefined) return requestedName;
  return resolveGeneratedAssetName(manifest, manifest.placeholderAssetId);
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
    if (error instanceof AtlasVariantLoadError) throw error;
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
  const packId = manifest.assetPacks?.[resolveGeneratedAssetName(manifest, record.assetId)];
  if (packId !== undefined) {
    const pack = await loadPackManifest(manifest, packId);
    manifest = { ...manifest, atlases: pack.atlases, omitAtlases: pack.omitAtlases, pages: pack.pages };
  }
  const key = atlasPageKey(record, season);
  const filename = manifest.atlases[key];
  if (!filename) throw new Error(`Atlas not found for ${key}`);
  const descriptor = record.pageId === undefined ? undefined : manifest.pages?.[record.pageId];
  if (record.pageId !== undefined && descriptor === undefined) throw new Error(`Missing atlas page descriptor: ${record.pageId}`);
  const image = await loadAtlasPage(filename, manifest.revision, descriptor);
  const resolvedName = resolveGeneratedAssetName(manifest, record.assetId);
  const markerManifest = Object.keys(markerOverrides).length === 0 || record.markerLayers !== undefined
    ? undefined : await loadMarkerManifest(manifest.revision);
  if (markerManifest?.schemaVersion === 2 && markerManifest.assetPages?.[resolvedName] !== record.pageId) {
    throw new Error(`Atlas marker page identity mismatch: ${resolvedName}`);
  }
  const markerLayers = Object.keys(markerOverrides).length === 0 ? undefined
    : record.markerLayers ?? markerManifest?.assets[resolvedName] ?? {};
  const asset: LoadedAsset = {
    assetId: record.assetId,
    pageId: record.pageId,
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
  const omitFilename = manifest.omitAtlases?.[key];
  if (omitFilename !== undefined || asset.bakedShadow !== undefined) {
    await worldAtlasVariants.register(asset, { filename: omitFilename, revision: manifest.revision, descriptor,
      ...(markerLayers === undefined ? {} : { recolor: (variant: HTMLImageElement) => applyMarkerOverrides(variant, markerLayers, markerOverrides, record) }),
    });
  }
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
      manifest.packs ? Object.keys(manifest.packs).map(async (id) => (await loadPackManifest(manifest, id)).assets)
        : [...new Set(Object.values(manifest.assetCategories ?? {}))]
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
