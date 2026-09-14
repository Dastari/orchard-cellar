import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ATLAS_PAGE_HEIGHT, ATLAS_PAGE_MAX_BYTES, ATLAS_PAGE_WIDTH } from './assets/atlas-pages.js';
import { workspaceRoot } from './assets/load.js';
import { decodePng, encodePng } from './assets/png.js';

interface BackdropPage {
  readonly filename: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface BackdropManifest {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly width: number;
  readonly height: number;
  readonly pages: readonly BackdropPage[];
}

/** The original is also a Keycloak/PWA input; only generated tiles are written. */
export async function buildBackdropPages(
  sourceUrl = new URL('packages/client/public/ui/island-background.png', workspaceRoot),
  outputUrl = new URL('packages/assets/generated/', workspaceRoot),
): Promise<BackdropManifest> {
  const sourceBytes = await readFile(sourceUrl);
  const source = decodePng(sourceBytes);
  const pages: BackdropPage[] = [];
  await mkdir(outputUrl, { recursive: true });
  for (let y = 0; y < source.height; y += ATLAS_PAGE_HEIGHT) {
    for (let x = 0; x < source.width; x += ATLAS_PAGE_WIDTH) {
      const width = Math.min(ATLAS_PAGE_WIDTH, source.width - x);
      const height = Math.min(ATLAS_PAGE_HEIGHT, source.height - y);
      const rgba = new Uint8Array(width * height * 4);
      if (rgba.byteLength > ATLAS_PAGE_MAX_BYTES) throw new Error('Backdrop tile exceeds 4 MiB decoded');
      for (let row = 0; row < height; row += 1) {
        const offset = ((y + row) * source.width + x) * 4;
        rgba.set(source.rgba.subarray(offset, offset + width * 4), row * width * 4);
      }
      const filename = `backdrop_p${String(pages.length).padStart(3, '0')}.png`;
      await writeFile(new URL(filename, outputUrl), encodePng(width, height, rgba));
      pages.push({ filename, x, y, width, height });
    }
  }
  const manifest: BackdropManifest = {
    schemaVersion: 1,
    revision: createHash('sha256').update(sourceBytes).digest('hex').slice(0, 20),
    width: source.width,
    height: source.height,
    pages,
  };
  await writeFile(new URL('backdrop.meta.json', outputUrl), JSON.stringify(manifest));
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildBackdropPages();
