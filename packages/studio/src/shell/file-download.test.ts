import { createEmptyMapDocument, migrateMapDocumentV2 } from '@orchard/sim';
import { describe, expect, it, vi } from 'vitest';
import { createMapDocumentExport } from '../tools/map/document-export.js';
import type { StudioFileDownloadAnchor, StudioFileDownloadRuntime } from './file-download.js';
import { requestStudioFileDownload } from './file-download.js';

function payload() {
  const result = createMapDocumentExport(migrateMapDocumentV2(createEmptyMapDocument({
    id: 'download-fixture', title: 'Download Fixture', width: 4, height: 4,
  })));
  if (!result.ok) throw new Error(result.error.message);
  return result.payload;
}

function harness(click = vi.fn()): {
  readonly anchor: StudioFileDownloadAnchor;
  readonly runtime: StudioFileDownloadRuntime;
} {
  const anchor: StudioFileDownloadAnchor = {
    href: '', download: '', rel: '', click, remove: vi.fn(),
  };
  return {
    anchor,
    runtime: {
      createObjectUrl: vi.fn(() => 'blob:map-export'),
      revokeObjectUrl: vi.fn(),
      createAnchor: vi.fn(() => anchor),
      appendAnchor: vi.fn(),
    },
  };
}

describe('Studio file download bridge', () => {
  it('requests a named download and releases the anchor and object URL', () => {
    const { anchor, runtime } = harness();
    expect(requestStudioFileDownload(payload(), runtime)).toEqual({ ok: true, status: 'requested' });
    expect(anchor).toMatchObject({
      href: 'blob:map-export', download: 'download-fixture-r0.map.json', rel: 'noopener',
    });
    expect(runtime.appendAnchor).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(runtime.revokeObjectUrl).toHaveBeenCalledWith('blob:map-export');
  });

  it('cleans both temporary resources when the browser click fails', () => {
    const { anchor, runtime } = harness(vi.fn(() => { throw new Error('blocked'); }));
    expect(requestStudioFileDownload(payload(), runtime)).toEqual({
      ok: false,
      code: 'failed',
      message: 'The browser rejected the file download request.',
    });
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(runtime.revokeObjectUrl).toHaveBeenCalledWith('blob:map-export');
  });

  it('reports an unavailable bridge instead of claiming a save', () => {
    expect(requestStudioFileDownload(payload(), null)).toEqual({
      ok: false,
      code: 'unavailable',
      message: 'This browser preview does not provide a file-download bridge.',
    });
  });

  it('does not attempt cleanup before a failed object URL allocation', () => {
    const { anchor, runtime } = harness();
    vi.mocked(runtime.createObjectUrl).mockImplementation(() => { throw new Error('unavailable'); });
    expect(requestStudioFileDownload(payload(), runtime)).toMatchObject({ ok: false, code: 'failed' });
    expect(anchor.remove).not.toHaveBeenCalled();
    expect(runtime.revokeObjectUrl).not.toHaveBeenCalled();
  });
});
