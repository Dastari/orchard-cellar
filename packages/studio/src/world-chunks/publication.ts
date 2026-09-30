/**
 * Static world S7b-3: Studio publishes a topside map edit together with its chunk publication.
 *
 *   1. Predict the head the server commits (`predictLiveMapHead`): the same delta application and
 *      parse as `publishLiveMapDocument`, then `liveMapHeadSource` at `expectedRevision + 1`.
 *   2. Materialise the chunks for that head and verify them against the server reference
 *      (`materializeLiveMapPublication`, in a worker: tens of seconds for the whole island).
 *   3. Stage the blobs the current publication does not already reference (content addressed, so an
 *      edit uploads only the chunks it changed).
 *   4. Commit map and chunks in one transaction (`publishLiveMapWithChunks`). A wrong prediction, a
 *      lost race or an unservable publication is refused there and nothing changes.
 */
import type { ContentDefinitionRow } from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';

export const LIVE_ISLAND_PUBLICATION_MAP_ID = 'live-island';

/** What a publication is built from: the verified live head, the edit as a delta, and the live content. */
export interface LiveMapPublicationInput {
  readonly head: { readonly revision: number; readonly documentJson: string };
  readonly deltaJson: string;
  readonly expectedRevision: number;
  readonly clientMutationId: string;
  /** The live content definitions; null when the world has no content head (the bootstrap registry). */
  readonly contentRows: readonly ContentDefinitionRow[] | null;
  /** The game origin's `generated/atlas.packs.json` text (its hash is the chunks' asset revision). */
  readonly atlasIndexSource: string;
}

export interface MaterializedLiveMapPublication {
  /** The head row the server commits for this publication. */
  readonly row: LiveMapDocumentRow;
  readonly manifestJson: string;
  /** The parsed registry hash the server compares (`contentRegistry(ctx).contentHash`). */
  readonly registryContentHash: string;
  readonly blobs: readonly { readonly contentHash: string; readonly bytes: Uint8Array }[];
}

export type LiveMapPublicationPhase = 'predicting' | 'materialising' | 'verifying' | 'uploading' | 'committing';
export interface LiveMapPublicationProgress {
  readonly phase: LiveMapPublicationPhase;
  /** Uploading only: blobs staged so far and to stage. */
  readonly done?: number;
  readonly total?: number;
}

/** The world as the publication sees it, and the calls it makes. */
export interface LiveMapPublicationPort {
  /** The current topside chunk publication: its revision (0 when none), the blobs its heads reference and
   * its asset revision (null when none). */
  publishedChunks(): Promise<{ readonly revision: number; readonly contentHashes: ReadonlySet<string>; readonly assetRevision: string | null }>;
  /** The asset revision of an atlas index (`worldChunkHash` of its bytes). */
  assetRevisionOf(atlasIndexSource: string): string;
  atlasIndex(): Promise<string>;
  materialize(input: LiveMapPublicationInput, onPhase: (phase: LiveMapPublicationPhase) => void): Promise<MaterializedLiveMapPublication>;
  stageBlob(bytes: Uint8Array): Promise<void>;
  commit(input: {
    readonly mapId: string; readonly expectedRevision: number; readonly documentJson: string; readonly clientMutationId: string;
    readonly manifestJson: string; readonly contentHash: string; readonly expectedChunkRevision: number;
  }): Promise<void>;
}

/** Publish one topside map edit with its chunks (see the module comment). */
export async function publishLiveMapWithChunks(
  request: Omit<LiveMapPublicationInput, 'atlasIndexSource'>,
  port: LiveMapPublicationPort,
  onProgress: (progress: LiveMapPublicationProgress) => void = () => undefined,
): Promise<void> {
  onProgress({ phase: 'predicting' });
  const [published, atlasIndexSource] = await Promise.all([port.publishedChunks(), port.atlasIndex()]);
  // A Studio publication keeps the live publication's asset revision (the server refuses anything else):
  // when the served art moved on, the release lane republishes the chunks with it first.
  if (published.assetRevision !== null && port.assetRevisionOf(atlasIndexSource) !== published.assetRevision) {
    throw new Error('chunk_asset_revision_changed');
  }
  const publication = await port.materialize({ ...request, atlasIndexSource }, phase => onProgress({ phase }));
  // Once per blob the current publication does not reference (the same chunk can repeat).
  const known = new Set(published.contentHashes);
  const uploads = publication.blobs.filter(blob => {
    if (known.has(blob.contentHash)) return false;
    known.add(blob.contentHash);
    return true;
  });
  onProgress({ phase: 'uploading', done: 0, total: uploads.length });
  let done = 0;
  for (const blob of uploads) {
    await port.stageBlob(blob.bytes);
    done += 1;
    onProgress({ phase: 'uploading', done, total: uploads.length });
  }
  onProgress({ phase: 'committing' });
  await port.commit({
    mapId: LIVE_ISLAND_PUBLICATION_MAP_ID,
    expectedRevision: request.expectedRevision,
    documentJson: request.deltaJson,
    clientMutationId: request.clientMutationId,
    manifestJson: publication.manifestJson,
    contentHash: publication.registryContentHash,
    expectedChunkRevision: published.revision,
  });
}
