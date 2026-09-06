import type { StudioAccess } from '../../shell/access.js';
import type { StudioConnectionView, StudioLiveAdapter } from '../../shell/studio-connection.js';
import type {
  ContentRevisionRecord,
  ItemsContentHeadSnapshot,
  ItemsPublishAdapter,
  ItemsToolAccess,
} from './contracts.js';
import { verifyItemsContentHeadSnapshot } from './model.js';

export function itemsAccessForConnection(
  routeAccess: StudioAccess, adapter: StudioLiveAdapter | null,
): ItemsToolAccess {
  if (adapter === null || !adapter.view().connected) return 'anonymous';
  return routeAccess === 'write' ? 'write' : 'read_only';
}

export function itemsHeadFromConnection(view: StudioConnectionView): ItemsContentHeadSnapshot | null {
  const head = view.contentHead;
  if (head === null || head === undefined || head.packId !== 'live') return null;
  const sourceRows = Object.freeze((view.contentDefinitions ?? []).map(({ id, kind, slug, json }) =>
    Object.freeze({ id, kind, slug, json })));
  if (sourceRows.length !== head.definitionCount) throw new Error('items_content_head_count_mismatch');
  return verifyItemsContentHeadSnapshot({
    packId: 'live', revision: head.revision, contentHash: head.contentHash,
    engineVersion: head.engineVersion, definitions: [], sourceRows,
  });
}

export function itemsHistoryFromConnection(view: StudioConnectionView): readonly ContentRevisionRecord[] {
  return Object.freeze((view.contentRevisions ?? []).filter(({ packId }) => packId === 'live').map((row) => ({
    revision: row.revision,
    parentRevision: row.parentRevision,
    contentHash: row.hash,
    changeSetJson: row.changeSetJson,
    inverseChangeSetJson: row.inverseChangeSetJson,
    actor: row.actor.toHexString(),
    occurredAt: row.timestamp.toISOString(),
    note: row.note,
  })));
}

export function itemsPublishAdapterFromConnection(adapter: StudioLiveAdapter): ItemsPublishAdapter | null {
  if (adapter.publishContentChangeSet === undefined || adapter.restoreContentRevision === undefined) return null;
  return Object.freeze({
    publishContentChangeSet: (request: Parameters<ItemsPublishAdapter['publishContentChangeSet']>[0]) => adapter.publishContentChangeSet!(request),
    restoreContentRevision: (request: Parameters<ItemsPublishAdapter['restoreContentRevision']>[0]) => adapter.restoreContentRevision!(request),
  });
}
