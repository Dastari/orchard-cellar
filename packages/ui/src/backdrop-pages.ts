import { assertAtlasPageImage } from './atlas-page-format.js';
import { loadAtlasPage } from './atlas-page-loader.js';

export interface BackdropPage {
  readonly filename: string;
  readonly x: number; readonly y: number;
  readonly width: number; readonly height: number;
}
export interface BackdropManifest {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly width: number; readonly height: number;
  readonly pages: readonly BackdropPage[];
}
export interface BackdropPages extends BackdropManifest {
  readonly images: readonly CanvasImageSource[];
}
export function parseBackdropManifest(value: unknown): BackdropManifest {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid backdrop manifest');
  const manifest = value as BackdropManifest;
  if (manifest.schemaVersion !== 1 || typeof manifest.revision !== 'string'
    || ![manifest.width, manifest.height].every((n) => Number.isSafeInteger(n) && n > 0)
    || manifest.width > 4096 || manifest.height > 4096 || manifest.width * manifest.height > 4_194_304
    || !Array.isArray(manifest.pages) || !manifest.pages.length || manifest.pages.length > 64) {
    throw new Error('Invalid backdrop page geometry');
  }
  for (const page of manifest.pages) {
    assertAtlasPageImage({ naturalWidth: page.width, naturalHeight: page.height });
    if (!/^backdrop_p\d{3,}\.png$/.test(page.filename)
      || ![page.x, page.y].every((n) => Number.isSafeInteger(n) && n >= 0)
      || page.x + page.width > manifest.width || page.y + page.height > manifest.height) {
      throw new Error('Invalid backdrop page placement');
    }
  }
  return manifest;
}
export async function loadBackdropPages(): Promise<BackdropPages> {
  const response = await fetch('/generated/backdrop.meta.json');
  if (!response.ok) throw new Error('Unable to load backdrop metadata');
  const manifest = parseBackdropManifest(await response.json());
  const images = await Promise.all(manifest.pages.map((page) => loadAtlasPage(page.filename, manifest.revision,
    { width: page.width, height: page.height, decodedBytes: page.width * page.height * 4 })));
  return { ...manifest, images };
}
/** Reconstruct only while building the retained UI viewport cache. Separate
 * nearest-scaled tile draws can select different edge pixels at fractional
 * scales. This temporary Canvas surface preserves the old single-image crop;
 * decoded images remain bounded and the scratch backing is released here. */
export function drawBackdropPages(context: CanvasRenderingContext2D, backdrop: BackdropPages,
  x: number, y: number, width: number, height: number): void {
  const scratch = document.createElement('canvas');
  scratch.width = backdrop.width; scratch.height = backdrop.height;
  try {
    const paint = scratch.getContext('2d');
    if (paint === null) throw new Error('Backdrop reconstruction surface unavailable');
    paint.imageSmoothingEnabled = false;
    for (let i = 0; i < backdrop.pages.length; i++) {
      const page = backdrop.pages[i]!;
      paint.drawImage(backdrop.images[i]!, page.x, page.y);
    }
    context.drawImage(scratch, x, y, width, height);
  } finally { scratch.width = scratch.height = 0; }
}
