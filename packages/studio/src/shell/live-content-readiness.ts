import {
  contentDefinitionRowsHash,
  buildContentRegistry,
  type SupportedContentDefinition,
} from '@orchard/sim';
import { ui } from '@orchard/ui/studio';
import type { StudioCanvasToolSurface } from './canvas-tool.js';
import type { StudioLiveAdapter } from './studio-connection.js';

export type StudioLiveContentMode = 'offline' | 'loading' | 'unavailable' | 'ready';

export interface StudioLiveContentSnapshot {
  readonly mode: StudioLiveContentMode;
  readonly contentKey: string;
  readonly definitions: readonly SupportedContentDefinition[] | null;
  readonly message: string;
}

/** Bootstrap content is intentionally not returned here. Callers may select it
 * only for `offline`; every adapter-backed state remains fail-closed. */
export function studioLiveContentSnapshot(adapter: StudioLiveAdapter | null): StudioLiveContentSnapshot {
  if (adapter === null) return {
    mode: 'offline', contentKey: 'offline:bootstrap', definitions: null,
    message: 'OFFLINE SANDBOX CONTENT',
  };
  const view = adapter.view();
  const head = view.contentHead;
  const rows = view.contentDefinitions;
  if (view.error !== null || (!view.connected && !view.synchronizing)) return {
    mode: 'unavailable', contentKey: `unavailable:${view.contentRevision ?? 'none'}`,
    definitions: null, message: view.error ?? 'LIVE CONTENT UNAVAILABLE',
  };
  if (view.synchronizing || !view.connected || head === undefined || rows === undefined) return {
    mode: 'loading', contentKey: `loading:${view.contentRevision ?? 'none'}`,
    definitions: null, message: 'LOADING VERIFIED LIVE CONTENT',
  };
  if (head === null || rows.length === 0) return {
    mode: 'unavailable', contentKey: `unavailable:${view.contentRevision ?? 'none'}:empty`,
    definitions: null, message: 'LIVE CONTENT HEAD IS UNAVAILABLE',
  };
  if (rows.length !== head.definitionCount) return {
    mode: 'loading', contentKey: `loading:${head.revision}:${rows.length}/${head.definitionCount}`,
    definitions: null, message: 'WAITING FOR COMPLETE LIVE CONTENT',
  };
  try {
    const sourceRows = rows.map(({ id, kind, slug, json }) => ({ id, kind, slug, json }));
    if (contentDefinitionRowsHash(sourceRows) !== head.contentHash) throw new Error('content_hash_mismatch');
    const built = buildContentRegistry(sourceRows);
    if (!built.report.valid) throw new Error('content_registry_invalid');
    return {
      mode: 'ready', contentKey: `${head.revision}:${head.contentHash}`,
      definitions: Object.freeze([...built.registry.definitions.values()]),
      message: 'LIVE CONTENT READY',
    };
  } catch {
    return {
      mode: 'unavailable', contentKey: `unavailable:${head.revision}:${head.contentHash}`,
      definitions: null, message: 'LIVE CONTENT FAILED VERIFICATION',
    };
  }
}

export function studioLiveContentStatusSurface(
  snapshot: StudioLiveContentSnapshot,
): StudioCanvasToolSurface {
  const status = (region: string) => ui.flex({ width: 'grow', height: 'grow', gap: 8, align: 'center', justify: 'center' }, [
    ui.icon({ lucide: snapshot.mode === 'loading' ? 'load' : 'collision' }),
    ui.text(snapshot.message, { id: `live-content-${snapshot.mode}-${region}`, role: 'header', align: 'center' }),
    ui.text('Connected tools do not substitute bundled content while the live registry is incomplete.', {
      id: `live-content-boundary-${region}`, align: 'center', wrap: true,
    }),
  ]);
  return { kit: { controls: status('controls'), workspace: status('workspace') } };
}
