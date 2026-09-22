import { mapDocumentV3Hash, normalizeMapDocumentV3, type MapDocumentV3 } from './map-document-v3.js';

/** Keys, never array offsets: unrelated objects/terrain are absent from uploads. */
const COLLECTIONS = [
  'cells', 'objects', 'prefabs', 'landmarks', 'layers', 'anchors', 'scenery',
  'transitions', 'stairRuns', 'combatRegions', 'generatedSuppressions', 'resourcePlacements', 'entityStates',
] as const;
type Collection = typeof COLLECTIONS[number];
const METADATA = [
  'title', 'width', 'height', 'tileSize', 'themeId', 'baseElevation', 'baseSurface',
  'defaultCliffFamily', 'defaultSurfaceFamily', 'baseBiome', 'provenance',
] as const;
type Metadata = typeof METADATA[number];

export interface MapDocumentDelta {
  readonly mapDeltaVersion: 1;
  readonly baseHash: string;
  readonly targetHash: string;
  readonly metadata?: Partial<Record<Metadata, unknown>>;
  readonly collections?: Partial<Record<Collection, Readonly<Record<string, unknown>>>>;
}

export function mapDocumentSemanticHash(document: MapDocumentV3): string {
  // The parser hydrates landmark roles from its current content registry. Studio
  // and authority may have different bundled catalogs; those derived roles must
  // not make an otherwise identical base/target fail the publication receipt.
  // Full document validation still assigns the authority's current roles.
  return mapDocumentV3Hash({ ...document, revision: 0, landmarks: document.landmarks.map(landmark => {
    const authored = { ...landmark };
    delete authored.role;
    return authored;
  }) });
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectionKey(collection: Collection, value: unknown): string {
  if (collection === 'generatedSuppressions' && typeof value === 'string') return value;
  if (!record(value)) throw new Error('invalid_live_map_delta_entry');
  // These terrain primitives have no persistent ID; their canonical value is
  // their identity. Changing one removes the old primitive and inserts the new.
  if (collection === 'transitions' || collection === 'stairRuns') {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
  }
  if (typeof value['id'] !== 'string') throw new Error('invalid_live_map_delta_entry');
  return value['id'];
}

function entries(document: MapDocumentV3, collection: Collection): Map<string, unknown> {
  if (collection === 'cells') return new Map(Object.entries(document.cells));
  const values = document[collection] ?? [];
  const result = new Map(values.map(value => [collectionKey(collection, value), value]));
  if (result.size !== values.length) throw new Error('duplicate_live_map_delta_key');
  return result;
}

/** Diff final state, so undo, restored drafts and generated neighbors need no
 * command replay or extra persisted base snapshot. */
export function createMapDocumentDelta(base: MapDocumentV3, target: MapDocumentV3): MapDocumentDelta {
  if (base.id !== target.id || base.schemaVersion !== target.schemaVersion) {
    throw new Error('live_map_delta_identity_mismatch');
  }
  base = normalizeMapDocumentV3(base);
  target = normalizeMapDocumentV3(target);
  // Like snapshot publication, omission must never accidentally clear an
  // existing authority policy. An intentional clear uses an explicit [].
  if (base.combatRegions !== undefined && target.combatRegions === undefined) {
    throw new Error('live_map_delta_policy_requires_explicit_empty_array');
  }
  const metadata = Object.fromEntries(METADATA.flatMap(key => (
    JSON.stringify(base[key]) === JSON.stringify(target[key]) ? [] : [[key, target[key] ?? null]]
  )));
  const collections: Partial<Record<Collection, Record<string, unknown>>> = {};
  for (const collection of COLLECTIONS) {
    const previous = entries(base, collection);
    const next = entries(target, collection);
    const changed = Object.fromEntries([
      ...[...previous.keys()].filter(key => !next.has(key)).map(key => [key, null]),
      ...[...next].filter(([key, value]) => JSON.stringify(previous.get(key)) !== JSON.stringify(value)),
    ]);
    if (Object.keys(changed).length > 0
      || (collection === 'combatRegions' && base.combatRegions === undefined && target.combatRegions !== undefined)) {
      collections[collection] = changed;
    }
  }
  return {
    mapDeltaVersion: 1,
    baseHash: mapDocumentSemanticHash(base), targetHash: mapDocumentSemanticHash(target),
    ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
    ...(Object.keys(collections).length === 0 ? {} : { collections }),
  };
}

/** Envelope validation precedes any reconstruction. Full document/terrain and
 * target-hash validation remains mandatory at the authority boundary. */
export function parseMapDocumentDelta(value: unknown): MapDocumentDelta {
  if (!record(value) || value['mapDeltaVersion'] !== 1
    || Object.keys(value).some(key => !['mapDeltaVersion', 'baseHash', 'targetHash', 'metadata', 'collections'].includes(key))
    || typeof value['baseHash'] !== 'string' || !/^[0-9a-f]{8}$/u.test(value['baseHash'])
    || typeof value['targetHash'] !== 'string' || !/^[0-9a-f]{8}$/u.test(value['targetHash'])) {
    throw new Error('invalid_live_map_delta');
  }
  const metadata = value['metadata'];
  if (metadata !== undefined && (!record(metadata)
    || Object.keys(metadata).some(key => !METADATA.includes(key as Metadata)))) {
    throw new Error('invalid_live_map_delta_metadata');
  }
  const collections = value['collections'];
  if (collections !== undefined) {
    if (!record(collections)) throw new Error('invalid_live_map_delta_collection');
    for (const [name, changes] of Object.entries(collections)) {
      if (!COLLECTIONS.includes(name as Collection) || !record(changes)) {
        throw new Error('invalid_live_map_delta_collection');
      }
      for (const [key, entry] of Object.entries(changes)) {
        if (key.length === 0 || key.length > 512 || ['__proto__', 'prototype', 'constructor'].includes(key)) {
          throw new Error('invalid_live_map_delta_key');
        }
        if (name === 'cells') {
          if (!/^(0|[1-9]\d*),(0|[1-9]\d*)$/u.test(key) || (entry !== null && !record(entry))) {
            throw new Error('invalid_live_map_delta_cell');
          }
        } else if (entry !== null && collectionKey(name as Collection, entry) !== key) {
          throw new Error('live_map_delta_key_mismatch');
        }
      }
    }
  }
  return value as unknown as MapDocumentDelta;
}

/** Returns JSON for the normal document parser, never a trusted typed document. */
export function applyMapDocumentDelta(base: MapDocumentV3, delta: MapDocumentDelta): string {
  delta = parseMapDocumentDelta(delta);
  if (mapDocumentSemanticHash(base) !== delta.baseHash) throw new Error('live_map_delta_base_mismatch');
  const result: Record<string, unknown> = { ...base, ...delta.metadata };
  for (const [name, changes] of Object.entries(delta.collections ?? {})) {
    const collection = name as Collection;
    const values = entries(base, collection);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        if (!values.delete(key)) throw new Error('live_map_delta_missing_key');
      } else values.set(key, value);
    }
    result[collection] = collection === 'cells' ? Object.fromEntries(values) : [...values.values()];
  }
  return JSON.stringify(result);
}
