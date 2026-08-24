import type { AtlasFrame, AtlasMetadata } from './sprite.js';

interface BuiltAssetRecord {
  readonly category: string;
  readonly anchor: readonly [number, number];
  readonly animations: Readonly<Record<string, readonly AtlasFrame[]>>;
  readonly markerLayers?: Readonly<Record<string, readonly (readonly MarkerPixel[])[]>>;
}

interface MarkerPixel { readonly x: number; readonly y: number; readonly marker: string; readonly shade: number }

interface BuiltAtlasManifest {
  readonly atlases: Readonly<Record<string, string>>;
  readonly assets: Readonly<Record<string, BuiltAssetRecord>>;
}

export interface LoadedAsset {
  readonly name: string;
  readonly image: CanvasImageSource;
  readonly anchor: readonly [number, number];
  readonly metadata: AtlasMetadata;
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
  const filename = manifest.atlases[`${record.category}:${season}`];
  if (!filename) throw new Error(`Atlas not found for ${record.category}:${season}`);
  const image = await loadImage(filename);
  return {
    name,
    image: Object.keys(markerOverrides).length > 0 ? applyMarkerOverrides(image, record, markerOverrides) : image,
    anchor: record.anchor,
    metadata: { image: filename, animations: record.animations },
  };
}
