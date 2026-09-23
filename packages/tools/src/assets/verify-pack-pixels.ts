import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodePng } from './png.js';
import type { BuiltFrame } from './types.js';

interface RecordData { pageId: string; animations: Record<string, BuiltFrame[]>; variants: Record<string, BuiltFrame[]>; states: Record<string, BuiltFrame> }
interface Index { packs?: Record<string, string>; atlases: Record<string, string>; omitAtlases?: Record<string, string> }
const seasons = ['spring', 'summer', 'autumn', 'winter'];

async function frameDigests(root: string): Promise<Map<string, string>> {
  const files = await readdir(root);
  const index = JSON.parse(await readFile(join(root, files.includes('atlas.packs-review.json') ? 'atlas.packs-review.json' : 'atlas.meta.json'), 'utf8')) as Index;
  const records = Object.assign({}, ...await Promise.all((index.packs ? Object.values(index.packs) : files.filter(f => /^atlas_[a-z]+\.meta\.json$/.test(f))).map(async f => JSON.parse(await readFile(join(root, f), 'utf8')).assets))) as Record<string, RecordData>;
  const byPage = new Map<string, [string, RecordData][]>();
  for (const entry of Object.entries(records)) byPage.set(entry[1].pageId, [...byPage.get(entry[1].pageId) ?? [], entry]);
  const digests = new Map<string, string>();
  for (const [pageId, assets] of byPage) for (const season of seasons) for (const variant of ['original', 'omit']) {
    const key = `${pageId}:${season}`;
    const filename = (variant === 'omit' ? index.omitAtlases?.[key] : undefined) ?? index.atlases[key]!;
    const image = decodePng(await readFile(join(root, filename)));
    for (const [name, record] of assets) {
      const groups = { ...record.animations, ...record.variants, ...Object.fromEntries(Object.entries(record.states).map(([group, frame]) => [group, [frame]])) };
      for (const [group, frames] of Object.entries(groups)) for (const [i, frame] of frames.entries()) {
        const hash = createHash('sha256');
        hash.update(JSON.stringify([frame.width, frame.height, frame.durationTicks]));
        for (let y = frame.y; y < frame.y + frame.height; y++) hash.update(image.rgba.subarray((y * image.width + frame.x) * 4, (y * image.width + frame.x + frame.width) * 4));
        digests.set(`${name}:${group}:${i}:${season}:${variant}`, hash.digest('hex'));
      }
    }
  }
  return digests;
}

/** Full-catalog golden comparison against a retained pre-migration build. */
export async function verifyPackPixels(before: string, after: string): Promise<number> {
  const expected = await frameDigests(before);
  const actual = await frameDigests(after);
  if (expected.size !== actual.size) throw new Error(`Frame count changed: ${expected.size} -> ${actual.size}`);
  for (const [key, hash] of expected) if (actual.get(key) !== hash) throw new Error(`Pixel/frame mismatch: ${key}`);
  return expected.size;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: verify-pack-pixels.ts <baseline-generated-dir> <new-generated-dir>');
  console.log(`Verified ${await verifyPackPixels(process.argv[2], process.argv[3])} frame/season/omit pixel hashes.`);
}
