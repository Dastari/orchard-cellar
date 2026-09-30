import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  LIVE_ISLAND_MAP_ID, TOPSIDE_SPACE_ID, activeSurvivalLandmarks, bootstrapContentRegistry, buildContentRegistry, createLiveIslandMapDocument,
  parseMapDocumentV3, serializeMapDocumentV3, type ContentDefinitionRow,
} from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { worldChunkHash } from '@orchard/sim/world-chunk';
import { materializeWorldChunksFromRows } from '../packages/studio/src/world-chunks/materialize.js';

/** The materializer is browser-safe and lives with Studio (static world S7b); this is its Node CLI. */
export * from '../packages/studio/src/world-chunks/materialize.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const input = value('--input');
  const output = value('--output');
  if (!output || (!input && !args.includes('--bootstrap'))) throw new Error('Usage: tsx scripts/materialize-world-chunks.ts (--input map.json | --bootstrap) --output directory [--content-rows rows.json] [--atlas-index index.json] [--audit] [--authored-document]');
  const contentRowsPath = value('--content-rows');
  const contentRows = contentRowsPath ? JSON.parse(await readFile(contentRowsPath, 'utf8')) as ContentDefinitionRow[] : null;
  const atlasIndexPath = value('--atlas-index');
  const atlasIndexSource = atlasIndexPath ? await readFile(atlasIndexPath, 'utf8') : null;
  const assetRevisionFlag = value('--asset-revision');
  const source: unknown = input ? JSON.parse(await readFile(input, 'utf8')) : null;
  const row = typeof source === 'object' && source !== null && 'documentJson' in source ? source as LiveMapDocumentRow : (() => {
    const registry = contentRows === null ? bootstrapContentRegistry() : buildContentRegistry(contentRows).registry;
    const landmarks = activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID);
    const document = parseMapDocumentV3(JSON.stringify(source ?? createLiveIslandMapDocument({ landmarks })), landmarks);
    const documentJson = serializeMapDocumentV3(document);
    return { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, documentJson, contentHash: worldChunkHash(new TextEncoder().encode(documentJson)) };
  })();
  const { result, manifestJson, registryContentHash, assetRevision, atlasPacksResolved } = materializeWorldChunksFromRows({
    row, contentRows, atlasIndexSource, audit: args.includes('--audit'), authoredDocument: args.includes('--authored-document'), ...(assetRevisionFlag === undefined ? {} : { assetRevision: assetRevisionFlag }) });
  await mkdir(output, { recursive: true });
  const sizes: { cx: number; cy: number; raw: number; gzip: number; brotli: number }[] = [];
  for (let index = 0; index < result.blobs.length; index++) {
    const head = result.manifest.chunks[index]!;
    const bytes = result.blobs[index]!;
    const gzip = gzipSync(bytes, { level: 9 });
    const brotli = brotliCompressSync(bytes, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } });
    await writeFile(resolve(output, `${head.contentHash}.bin`), bytes);
    await writeFile(resolve(output, `${head.contentHash}.bin.gz`), gzip);
    await writeFile(resolve(output, `${head.contentHash}.bin.br`), brotli);
    sizes.push({ cx: head.cx, cy: head.cy, raw: bytes.length, gzip: gzip.length, brotli: brotli.length });
  }
  const manifestBytes = new TextEncoder().encode(manifestJson);
  await writeFile(resolve(output, 'manifest.json'), manifestBytes);
  const totals = sizes.reduce((total, size) => ({ raw: total.raw + size.raw, gzip: total.gzip + size.gzip, brotli: total.brotli + size.brotli }), { raw: 0, gzip: 0, brotli: 0 });
  await writeFile(resolve(output, 'sizes.json'), JSON.stringify({ includesServerOracle: args.includes('--audit'), compression: { gzipLevel: 9, brotliQuality: 5 }, totals, manifestBytes: manifestBytes.length, chunks: sizes }, null, 2) + '\n');
  console.log(JSON.stringify({ chunks: result.blobs.length, totals, manifestBytes: manifestBytes.length, sourceHash: row.contentHash, contentHash: registryContentHash, assetRevision, atlasPacksResolved, parity: 'passed' }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
