import { describe, expect, it } from 'vitest';
import { assertLegacyFarmRetiredSource } from './legacy-farm-retirement-source.js';

const candidate = `
const player_survival = table({ name: 'player_survival' }, {
  identity: t.identity().primaryKey(), selectedSlot: t.u8(), hungerCenti: t.u16(),
});
const player_survival_migration = table({ name: 'player_survival_migration' }, {});
export const adminLegacyFarmRetirementStatus = procedure(() => ({
  phase: 'schema_removal_candidate', privateInventoryCount: '0',
  playerSurvivalCompatibilityCount: '0', farmParcelCount: '0', cropPatchCount: '0',
  farmActivityCount: '0', remainingCount: '0',
}));`;

describe('legacy farm retirement source candidate', () => {
  it('accepts the retained survival table and read-only terminal receipt', () => {
    expect(() => assertLegacyFarmRetiredSource(candidate)).not.toThrow();
  });

  it('rejects legacy tables, compatibility columns, mutations, and inferred nonzero status', () => {
    expect(() => assertLegacyFarmRetiredSource(`${candidate}\nconst farm_parcel = table({});`))
      .toThrow('legacy_farm_source_still_present:farm_parcel');
    expect(() => assertLegacyFarmRetiredSource(candidate.replace('selectedSlot:', 'wood:')))
      .toThrow('legacy_player_survival_source_column_present:wood');
    expect(() => assertLegacyFarmRetiredSource(`${candidate}\nadminDrainLegacyFarmRetirement();`))
      .toThrow('legacy_farm_retirement_mutation_still_present:adminDrainLegacyFarmRetirement');
    expect(() => assertLegacyFarmRetiredSource(candidate.replace("remainingCount: '0'", 'remainingCount: count()')))
      .toThrow('legacy_farm_terminal_zero_missing:remainingCount');
  });
});
