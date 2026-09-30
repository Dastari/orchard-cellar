import { activeSurvivalLandmarks, bootstrapContentRegistry, buildContentRegistry, liveMapHeadSource, parseMapDocumentV3, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { materializeLiveRows, readLiveRows, refreshLiveMapBase, type WorldConnection } from './chunk-authority-live-rows.js';

/** Disposable harness publications use the same atomic map/chunk reducer as Studio. */
export async function publishFixtureMap(world: WorldConnection, documentJson: string, expectedRevision: number,
  workDir: string, options: { readonly atlasIndex?: string; readonly assetRevision?: string } = {}): Promise<void> {
  await refreshLiveMapBase(world);
  const rows = readLiveRows(world);
  const registry = rows.contentRows === null ? bootstrapContentRegistry() : buildContentRegistry([...rows.contentRows]).registry;
  const source = liveMapHeadSource(parseMapDocumentV3(documentJson, activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID)), expectedRevision + 1);
  const mapRow = { mapId: 'live-island', revision: expectedRevision + 1, contentHash: source.contentHash, documentJson: source.documentJson };
  const candidate = await materializeLiveRows({ mapRow, contentRows: rows.contentRows }, workDir, options);
  for (const blob of candidate.blobs) await world.connection.reducers.stageWorldChunkBlob({ bytes: blob.bytes });
  const flags = world.connection.db.spaceAdminFlag.spaceId.find(0)?.flagsJson;
  const mode = flags === undefined ? 'off' : String((JSON.parse(flags) as { chunkAuthority?: string }).chunkAuthority ?? 'off');
  try {
    if (mode !== 'on') await world.connection.reducers.setChunkAuthority({ mode: 'on' });
    await world.connection.reducers.publishLiveMapWithChunks({ mapId: 'live-island', expectedRevision, documentJson: source.documentJson,
      clientMutationId: `fixture-map-${Date.now()}`, manifestJson: candidate.manifestJson, contentHash: String(candidate.summary.contentHash),
      expectedChunkRevision: rows.published.shadow?.revision ?? 0 });
  } finally { if (mode !== 'on') await world.connection.reducers.setChunkAuthority({ mode }); }
  await refreshLiveMapBase(world);
}

