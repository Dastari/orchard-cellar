import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRows,
  contentDefinitionRowsHash,
} from '@orchard/sim';
import { verifiedStudioLiveContent } from './live-content-registry.js';

function view(rows = bootstrapContentRows()) {
  return {
    connected: true, synchronizing: false, error: null,
    contentHead: {
      packId: 'live', revision: 7n, contentHash: contentDefinitionRowsHash(rows),
      definitionCount: rows.length,
    },
    contentDefinitions: rows.map((row) => ({ ...row, revision: 7n })),
  };
}

describe('verified Studio live content', () => {
  it('builds a registry only for the complete synchronized hashed head', () => {
    const ready = verifiedStudioLiveContent(view() as never);
    expect(ready?.registry.objects.size).toBeGreaterThan(0);
    expect(ready?.key).toContain('live:7:');
  });

  it('fails closed for partial, mismatched, invalid, and synchronizing data', () => {
    const ready = view();
    expect(verifiedStudioLiveContent({ ...ready, synchronizing: true } as never)).toBeNull();
    expect(verifiedStudioLiveContent({ ...ready, contentDefinitions: ready.contentDefinitions.slice(1) } as never)).toBeNull();
    expect(verifiedStudioLiveContent({ ...ready, contentHead: { ...ready.contentHead, contentHash: 'wrong' } } as never)).toBeNull();
  });
});
