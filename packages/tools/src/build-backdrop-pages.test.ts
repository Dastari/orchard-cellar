import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { buildBackdropPages } from './build-backdrop-pages.js';
import { workspaceRoot } from './assets/load.js';
import { decodePng } from './assets/png.js';

it('reassembles the actual backdrop byte-exactly from bounded pages without changing its original', async () => {
  const sourceUrl = new URL('packages/client/public/ui/island-background.png', workspaceRoot);
  const original = await readFile(sourceUrl);
  const source = decodePng(original);
  const directory = await mkdtemp(join(tmpdir(), 'orchard-backdrop-pages-'));
  const output = pathToFileURL(`${directory}/`);
  try {
    const manifest = await buildBackdropPages(sourceUrl, output);
    expect(manifest).toMatchObject({
      schemaVersion: 1, width: 1536, height: 1024,
      revision: createHash('sha256').update(original).digest('hex').slice(0, 20),
      pages: [
        { filename: 'backdrop_p000.png', x: 0, y: 0, width: 512, height: 1024 },
        { filename: 'backdrop_p001.png', x: 512, y: 0, width: 512, height: 1024 },
        { filename: 'backdrop_p002.png', x: 1024, y: 0, width: 512, height: 1024 },
      ],
    });
    expect(JSON.parse(await readFile(new URL('backdrop.meta.json', output), 'utf8'))).toEqual(manifest);
    const assembled = new Uint8Array(source.rgba.length);
    for (const descriptor of manifest.pages) {
      const page = decodePng(await readFile(new URL(descriptor.filename, output)));
      expect([page.width, page.height]).toEqual([descriptor.width, descriptor.height]);
      expect(page.width).toBeLessThanOrEqual(512);
      expect(page.height).toBeLessThanOrEqual(2048);
      expect(page.rgba.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
      for (let row = 0; row < page.height; row += 1) {
        assembled.set(page.rgba.subarray(row * page.width * 4, (row + 1) * page.width * 4),
          ((descriptor.y + row) * source.width + descriptor.x) * 4);
      }
    }
    expect(Buffer.from(assembled).equals(Buffer.from(source.rgba))).toBe(true);
    expect((await readFile(sourceUrl)).equals(original)).toBe(true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
