import { describe, expect, it } from 'vitest';
import { createLiveIslandMapDocument, mapDocumentV3Hash, serializeMapDocumentV3ForTransport } from '@orchard/sim';
import { parseVerifiedStudioMapHead } from './verified-live-map.js';

function legacyHead() {
  const current = createLiveIslandMapDocument();
  const document = { ...current, revision: 5, landmarks: current.landmarks.map((landmark) => { const legacy = { ...landmark }; delete legacy.role; return legacy; }) };
  return { mapId: document.id, revision: document.revision, contentHash: mapDocumentV3Hash(document), documentJson: serializeMapDocumentV3ForTransport(document) };
}

describe('published map verification before catalog hydration', () => {
  it('accepts the published hash even when newer landmark roles change the hydrated hash', () => {
    const head = legacyHead();
    const parsed = parseVerifiedStudioMapHead(head, head.mapId);
    expect(parsed.revision).toBe(5);
    expect(parsed.landmarks.some(landmark => landmark.role === 'soil.watered')).toBe(true);
    expect(mapDocumentV3Hash(parsed)).not.toBe(head.contentHash);
  });
  it('rejects tampering and mismatched revision or map identity', () => {
    const head = legacyHead();
    const changed = { ...JSON.parse(head.documentJson), title: 'Tampered' };
    expect(() => parseVerifiedStudioMapHead({ ...head, documentJson: JSON.stringify(changed) }, head.mapId)).toThrow('unverified_live_map_head');
    expect(() => parseVerifiedStudioMapHead({ ...head, revision: 6 }, head.mapId)).toThrow('unverified_live_map_head');
    expect(() => parseVerifiedStudioMapHead(head, 'another-map')).toThrow('unverified_live_map_head');
  });
});
