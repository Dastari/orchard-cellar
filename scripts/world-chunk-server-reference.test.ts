import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertServerMirrorFragments, SERVER_MIRRORED_FRAGMENTS, serverMirroredFragments } from './world-chunk-server-reference.js';

/** Cheap guard (no world generation): the oracle hand-mirrors these server
 * fragments, so any edit to them must fail here until reviewed and re-pinned. */
describe('world chunk server oracle mirror guard', () => {
  const source = readFileSync(new URL('../packages/world/src/index.ts', import.meta.url), 'utf8');

  it('pins every hand-mirrored server fragment', () => {
    expect(Object.keys(serverMirroredFragments(source)).sort()).toEqual(Object.keys(SERVER_MIRRORED_FRAGMENTS).sort());
    expect(() => assertServerMirrorFragments(source)).not.toThrow();
  });

  it('fails closed when a mirrored fragment changes or disappears', () => {
    const fragments = serverMirroredFragments(source);
    const edits: readonly (readonly [string, string, string])[] = [
      ['collisionForSpace:ground-composition', "'ground',\n    placeables,", "'ground',\n    [],"],
      ['waterCollisionForSpace:water-composition', "'water', [], instanceForSpace(ctx, spaceId)", "'water', [], null"],
      ['reconcileGeneratedSurvivalResources:desired', 'tileX: placement.tileX, tileY: placement.tileY', 'tileX: placement.originTileX, tileY: placement.tileY'],
      ['reconcileGeneratedSurvivalResources:orphan-keep', 'if (placements.has(existing.id)) continue;', ''],
      ['generatedWorldResourceRow', 'activationOrdinal: resource.activationOrdinal ?? 0,', 'activationOrdinal: resource.activationOrdinal ?? 0, variant: resource.variant,'],
    ];
    for (const [key, from, to] of edits) {
      expect(source.split(from).length, key).toBe(2);
      expect(fragments[key]!.includes(from.replace(/\s+/gu, ' ')), key).toBe(true);
      expect(() => assertServerMirrorFragments(source.replace(from, to)), key).toThrow(new RegExp(`drifted[\\s\\S]*${key}`, 'u'));
    }
    expect(() => assertServerMirrorFragments(source.replace('function generatedWorldResourceRow(', 'function generatedWorldResourceRowV2('))).toThrow(/generatedWorldResourceRow/u);
  });
});
