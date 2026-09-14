import {
  buildContentRegistry,
  contentDefinitionRowsHash,
  type ContentRegistry,
} from '@orchard/sim';
import type { StudioConnectionView } from '../../shell/studio-connection.js';

export interface VerifiedStudioLiveContent {
  readonly key: string;
  readonly registry: ContentRegistry;
}

/** Builds presentation authority only from a complete, synchronized live head.
 * A partial subscription, invalid pack, or hash mismatch stays unavailable so
 * the map renderer cannot resurrect bootstrap art for retired definitions. */
export function verifiedStudioLiveContent(
  view: Pick<StudioConnectionView,
    'connected' | 'synchronizing' | 'error' | 'contentHead' | 'contentDefinitions'> | null | undefined,
): VerifiedStudioLiveContent | null {
  if (view === null || view === undefined || !view.connected || view.synchronizing || view.error !== null) {
    return null;
  }
  const head = view.contentHead;
  const definitions = view.contentDefinitions;
  if (head === undefined || head === null || definitions === undefined
    || definitions.length !== head.definitionCount) return null;
  const rows = definitions.map(({ id, kind, slug, json }) => ({ id, kind, slug, json }));
  if (contentDefinitionRowsHash(rows) !== head.contentHash) return null;
  const built = buildContentRegistry(rows);
  if (!built.report.valid) return null;
  return Object.freeze({
    key: `${head.packId}:${head.revision}:${head.contentHash}`,
    registry: built.registry,
  });
}
