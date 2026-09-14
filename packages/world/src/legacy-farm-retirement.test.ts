import { describe, expect, it } from 'vitest';
import {
  inspectLegacyFarmRetirement,
  planLegacyFarmRetirementDrain,
  planLegacyFarmRetirementTransition,
  verifyLegacyFarmRetirement,
  type LegacyFarmRetirementSource,
} from './legacy-farm-retirement.js';

function source(): LegacyFarmRetirementSource {
  return {
    migrationVersion: 1,
    privateInventory: [
      { identity: 'b', fruit: 12n, bottles: 3n, knowledge: 9 },
      { identity: 'a', fruit: 2n, bottles: 1n, knowledge: 4 },
    ],
    playerSurvivalCompatibility: [
      { identity: 'd', wood: 0, stone: 0 },
      { identity: 'c', wood: 20, stone: 7 },
    ],
    farmParcels: [{ id: 2n, owner: 'a', name: 'old plot', originX: -2, originY: 8, width: 4, height: 3 }],
    cropPatches: [{ id: 7n, parcelId: 2n, owner: 'a', tileX: -1, tileY: 9, chunkX: -1, chunkY: 0,
      plantedAtTick: 20n, watered: true, wateredAtTick: 21n, spaceId: 0 }],
    farmActivity: [{ identity: 'a', planted: 5, watered: 4, harvested: 3 }],
  };
}

describe('legacy farm/storage retirement', () => {
  it('inspects every drainable compatibility row deterministically and ignores zero survival balances', () => {
    const first = inspectLegacyFarmRetirement(source(), 10);
    const reordered = source();
    expect(inspectLegacyFarmRetirement({ ...reordered,
      privateInventory: [...reordered.privateInventory].reverse() }, 10)).toEqual(first);
    expect(first.counts).toEqual({ privateInventory: 2, playerSurvivalCompatibility: 1,
      farmParcels: 1, cropPatches: 1, farmActivity: 1, total: 6 });
    expect(first.sourceFingerprint).toMatch(/^legacy-farm-source:/u);
    expect(() => inspectLegacyFarmRetirement(source(), 5))
      .toThrow('legacy_farm_retirement_inspection_truncated');
  });

  it('requires the atomic migration marker and an unchanged inspection receipt', () => {
    const inspection = inspectLegacyFarmRetirement(source(), 10);
    expect(verifyLegacyFarmRetirement(source(), 10, inspection.sourceFingerprint)
      .verificationFingerprint).toMatch(/^legacy-farm-verification:/u);
    expect(() => verifyLegacyFarmRetirement({ ...source(), migrationVersion: 0 }, 10,
      inspection.sourceFingerprint)).toThrow('legacy_farm_retirement_migration_incomplete');
    expect(() => verifyLegacyFarmRetirement({ ...source(), farmActivity: [] }, 10,
      inspection.sourceFingerprint)).toThrow('legacy_farm_retirement_inspection_stale');
  });

  it('plans bounded deterministic drains and chains an exact remaining-source receipt', () => {
    const inspection = inspectLegacyFarmRetirement(source(), 10);
    const verification = verifyLegacyFarmRetirement(source(), 10, inspection.sourceFingerprint);
    const first = planLegacyFarmRetirementDrain(source(), { limit: 3,
      expectedRemainingFingerprint: inspection.sourceFingerprint,
      verificationFingerprint: verification.verificationFingerprint, previousDrainFingerprint: '' });
    expect(first).toMatchObject({ privateInventoryIdentities: ['a', 'b'],
      playerSurvivalCompatibilityIdentities: ['c'], rowsDrained: 3 });
    expect(first.remainingCounts.total).toBe(3);
    expect(first.drainFingerprint).toMatch(/^legacy-farm-drain:/u);
    expect(() => planLegacyFarmRetirementDrain(source(), { limit: 3,
      expectedRemainingFingerprint: 'legacy-farm-source:stale',
      verificationFingerprint: verification.verificationFingerprint,
      previousDrainFingerprint: first.drainFingerprint })).toThrow('legacy_farm_retirement_source_drift');
  });

  it('only reaches schema-removal candidate with literal zero and matching receipts', () => {
    const empty = inspectLegacyFarmRetirement({ ...source(), privateInventory: [],
      playerSurvivalCompatibility: [], farmParcels: [], cropPatches: [], farmActivity: [] }, 1);
    const base = { expectedPhase: 'draining', nextPhase: 'schema_removal_candidate',
      verificationFingerprint: 'legacy-farm-verification:ok',
      expectedVerificationFingerprint: 'legacy-farm-verification:ok',
      drainFingerprint: 'legacy-farm-drain:done', expectedDrainFingerprint: 'legacy-farm-drain:done',
      remainingFingerprint: empty.sourceFingerprint, expectedEmptyFingerprint: empty.sourceFingerprint,
      remainingCount: 0 } as const;
    expect(planLegacyFarmRetirementTransition('draining', base)).toBe('schema_removal_candidate');
    expect(() => planLegacyFarmRetirementTransition('draining', { ...base, remainingCount: 1 }))
      .toThrow('legacy_farm_retirement_candidate_not_ready');
    expect(() => planLegacyFarmRetirementTransition('draining', { ...base,
      drainFingerprint: 'legacy-farm-drain:stale' })).toThrow('legacy_farm_retirement_candidate_not_ready');
    expect(() => planLegacyFarmRetirementTransition('parity_verified', base))
      .toThrow('legacy_farm_retirement_phase_stale');
  });
});
