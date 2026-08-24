import type { AtlasFrame, AtlasMetadata } from './sprite.js';

export interface BuiltAssetRecord {
  readonly assetId: number;
  readonly category: string;
  readonly anchor: readonly [number, number];
  readonly collision: readonly (readonly [number, number, number, number])[];
  readonly animations: Readonly<Record<string, readonly AtlasFrame[]>>;
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

export interface BuiltAtlasManifest {
  readonly schemaVersion: number;
  readonly revision: string;
  readonly revisionId: number;
  readonly placeholderAssetId: number;
  readonly atlases: Readonly<Record<string, string>>;
  readonly assets: Readonly<Record<string, BuiltAssetRecord>>;
  readonly assetsById: Readonly<Record<string, string>>;
}

export interface LoadedAsset {
  readonly assetId: number;
  readonly name: string;
  readonly image: CanvasImageSource;
  readonly anchor: readonly [number, number];
  readonly collision: readonly (readonly [number, number, number, number])[];
  readonly tags: readonly string[];
  readonly placement: BuiltAssetRecord['placement'];
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

let manifestPromise: Promise<BuiltAtlasManifest> | null = null;
const imagePromises = new Map<string, Promise<HTMLImageElement>>();

async function loadManifest(): Promise<BuiltAtlasManifest> {
  manifestPromise ??= fetch('/generated/atlas.meta.json').then(async (response) => {
    if (!response.ok) throw new Error(`Unable to load generated atlas metadata: ${response.status}`);
    return await response.json() as BuiltAtlasManifest;
  });
  return await manifestPromise;
}

async function loadImage(filename: string): Promise<HTMLImageElement> {
  const existing = imagePromises.get(filename);
  if (existing) return await existing;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load atlas image ${filename}`));
    image.src = `/generated/${filename}`;
  });
  imagePromises.set(filename, promise);
  return await promise;
}

export function resolveGeneratedAssetName(manifest: BuiltAtlasManifest, assetId: number): string {
  const requested = manifest.assetsById[String(assetId)];
  const fallback = manifest.assetsById[String(manifest.placeholderAssetId)];
  if (!fallback) throw new Error(`Generated asset placeholder ${manifest.placeholderAssetId} is missing`);
  return requested ?? fallback;
}

function applyMarkerOverrides(
  image: HTMLImageElement,
  record: BuiltAssetRecord,
  overrides: Readonly<Record<string, readonly string[]>>,
): CanvasImageSource {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) return image;
  context.drawImage(image, 0, 0);
  for (const animationLayers of Object.values(record.markerLayers ?? {})) {
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
  const record = manifest.assets[name];
  if (!record) throw new Error(`Generated asset not found: ${name}`);
  return await loadRecord(manifest, name, record, season, markerOverrides);
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
  const image = await loadImage(filename);
  return {
    assetId: record.assetId,
    name,
    image: Object.keys(markerOverrides).length > 0 ? applyMarkerOverrides(image, record, markerOverrides) : image,
    anchor: record.anchor,
    collision: record.collision,
    tags: record.tags,
    placement: record.placement,
    atlasRevision: manifest.revisionId,
    metadata: { image: filename, animations: record.animations },
  };
}

/** Resolve server-authored ids safely. Unknown/newer ids visibly use asset id 0. */
export async function loadGeneratedAssetById(
  assetId: number,
  season = 'summer',
  markerOverrides: Readonly<Record<string, readonly string[]>> = {},
): Promise<LoadedAsset> {
  const manifest = await loadManifest();
  const name = resolveGeneratedAssetName(manifest, assetId);
  const record = manifest.assets[name];
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
