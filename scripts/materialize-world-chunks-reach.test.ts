import { expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, createMapPrefabDocument, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { topsideAuthoredFixture, topsideFixtureRow } from '../packages/client/src/topside-map-records.fixture.js';
import { assertMapRecordsReach } from './materialize-world-chunks.js';

// Static world S4e: the publish pipeline (S5b plan and publish) refuses a map whose
// prefabs and lights could reach past the client's chunk window margin.
it('refuses to materialize a map whose content could reach past the chunk window margin', () => {
  const registry = bootstrapContentRegistry();
  const base = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
  expect(() => assertMapRecordsReach(topsideFixtureRow(base, 'reach-bootstrap'), registry)).not.toThrow();
  expect(() => assertMapRecordsReach(topsideFixtureRow(topsideAuthoredFixture(registry), 'reach-authored'), registry)).not.toThrow();
  const hall = { ...createMapPrefabDocument({ id: 'hall', title: 'Hall', width: 24, height: 2 }), pivot: { tileX: 0, tileY: 0 },
    cells: [{ id: 'far', tileX: 23, tileY: 0, elevation: 0, collisionMask: 1 }] };
  expect(() => assertMapRecordsReach(topsideFixtureRow({ ...base, prefabs: [hall] }, 'reach-hall'), registry))
    .toThrow(/^Map records reach exceeds the chunk window margin: prefab 47 \+ light \d+ \+ view \d+ > 32 tiles$/u);
}, 60_000);
