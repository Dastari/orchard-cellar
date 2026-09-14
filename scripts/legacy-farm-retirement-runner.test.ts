import { describe, expect, it } from 'vitest';
import {
  assertLegacyFarmSchemaRemovalCandidate,
  parseLegacyFarmRetirementStatus,
  runLegacyFarmRetirement,
  type LegacyFarmRetirementConnection,
  type LegacyFarmRetirementStatus,
} from './legacy-farm-retirement-runner.js';

function status(overrides: Partial<LegacyFarmRetirementStatus> = {}): LegacyFarmRetirementStatus {
  return {
    schemaVersion: 1, phase: 'inspect', migrationVersion: 1,
    inspectionFingerprint: '', verificationFingerprint: '', remainingFingerprint: '', drainFingerprint: '',
    inspectedPrivateInventoryCount: '1', inspectedPlayerSurvivalCompatibilityCount: '1',
    inspectedFarmParcelCount: '1', inspectedCropPatchCount: '1', inspectedFarmActivityCount: '1',
    privateInventoryCount: '1', playerSurvivalCompatibilityCount: '1', farmParcelCount: '1',
    cropPatchCount: '1', farmActivityCount: '1', remainingCount: '5', ...overrides,
  };
}

describe('legacy farm retirement runner', () => {
  it('strictly parses status counts and phases', () => {
    expect(parseLegacyFarmRetirementStatus(JSON.stringify(status()))).toEqual(status());
    expect(() => parseLegacyFarmRetirementStatus(JSON.stringify({ ...status(), remainingCount: '-1' })))
      .toThrow('legacy_farm_retirement_status_invalid:remainingCount');
    expect(() => parseLegacyFarmRetirementStatus(JSON.stringify({ ...status(), phase: 'drop_now' })))
      .toThrow('legacy_farm_retirement_status_invalid:phase');
  });

  it('stops safely after inspect/parity unless drain is explicitly enabled', async () => {
    let current = status();
    const calls: string[] = [];
    const connection: LegacyFarmRetirementConnection = {
      procedures: { adminLegacyFarmRetirementStatus: async () => JSON.stringify(current) },
      reducers: {
        adminInspectLegacyFarmRetirement: async () => { calls.push('inspect'); current = status({
          inspectionFingerprint: 'legacy-farm-source:a', remainingFingerprint: 'legacy-farm-source:a',
        }); },
        adminVerifyLegacyFarmRetirement: async () => { calls.push('verify'); current = {
          ...current, verificationFingerprint: 'legacy-farm-verification:b',
        }; },
        adminSetLegacyFarmRetirementPhase: async ({ nextPhase }) => {
          calls.push(`phase:${nextPhase}`); current = { ...current, phase: nextPhase as typeof current.phase };
        },
        adminDrainLegacyFarmRetirement: async () => { calls.push('drain'); },
      },
    };
    expect((await runLegacyFarmRetirement(connection)).phase).toBe('parity_verified');
    expect(calls).toEqual(['inspect', 'verify', 'phase:parity_verified']);
  });

  it('drains in bounded calls and only accepts literal-zero candidate status', async () => {
    let current = status({ phase: 'parity_verified', inspectionFingerprint: 'legacy-farm-source:a',
      verificationFingerprint: 'legacy-farm-verification:b', remainingFingerprint: 'legacy-farm-source:a' });
    const calls: string[] = [];
    const connection: LegacyFarmRetirementConnection = {
      procedures: { adminLegacyFarmRetirementStatus: async () => JSON.stringify(current) },
      reducers: {
        adminInspectLegacyFarmRetirement: async () => {}, adminVerifyLegacyFarmRetirement: async () => {},
        adminSetLegacyFarmRetirementPhase: async ({ nextPhase }) => {
          calls.push(`phase:${nextPhase}`); current = { ...current, phase: nextPhase as typeof current.phase };
        },
        adminDrainLegacyFarmRetirement: async () => {
          calls.push('drain'); current = status({ ...current, privateInventoryCount: '0',
            playerSurvivalCompatibilityCount: '0', farmParcelCount: '0', cropPatchCount: '0',
            farmActivityCount: '0', remainingCount: '0', remainingFingerprint: 'legacy-farm-source:empty',
            drainFingerprint: 'legacy-farm-drain:done' });
        },
      },
    };
    const result = await runLegacyFarmRetirement(connection, { allowDrain: true });
    expect(calls).toEqual(['phase:draining', 'drain', 'phase:schema_removal_candidate']);
    expect(() => assertLegacyFarmSchemaRemovalCandidate({ ...result, farmParcelCount: '1' }))
      .toThrow('legacy_farm_retirement_candidate_not_ready');
  });
});
