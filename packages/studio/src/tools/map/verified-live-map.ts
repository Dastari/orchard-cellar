import { parseMapDocumentV3, type MapDocumentV3 } from '@orchard/sim';
import type { StudioMapHead } from '../../shell/studio-connection.js';

/** Check the published representation before parsing can hydrate landmark roles
 * from a newer bundled catalog. Transport removes whitespace only; the authority
 * hash is FNV-1a over the pretty-printed canonical document plus its newline. */
export function parseVerifiedStudioMapHead(head: StudioMapHead, mapId: string): MapDocumentV3 {
  const value: unknown = JSON.parse(head.documentJson);
  const canonical = `${JSON.stringify(value, null, 2)}\n`;
  let hash = 2_166_136_261;
  for (const character of canonical) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  if (head.mapId !== mapId || hash.toString(16).padStart(8, '0') !== head.contentHash) {
    throw new TypeError('unverified_live_map_head');
  }
  const document = parseMapDocumentV3(head.documentJson);
  if (document.id !== mapId || document.revision !== head.revision) {
    throw new TypeError('unverified_live_map_head');
  }
  return document;
}
