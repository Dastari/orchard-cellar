import { describe, expect, it } from 'vitest';
import { RETIRED_LEGACY_FARM_TABLES, assertLegacyFarmRetiredSchema } from './legacy-farm-retirement-schema.js';

describe('legacy farm retirement schema receipt', () => {
  it('rejects every retired compatibility table', () => {
    for (const name of RETIRED_LEGACY_FARM_TABLES) {
      expect(() => assertLegacyFarmRetiredSchema({ tables: [
        { name: 'player_survival', columns: [{ name: 'identity' }] }, { name },
      ] })).toThrow(`legacy_farm_schema_still_present:${name}`);
    }
  });

  it('requires player_survival while rejecting only its retired wood/stone columns', () => {
    expect(() => assertLegacyFarmRetiredSchema({ tables: [] })).toThrow('player_survival_schema_missing');
    for (const name of ['wood', 'stone']) {
      expect(() => assertLegacyFarmRetiredSchema({ tables: [
        { name: 'player_survival', columns: [{ name: 'identity' }, { name }] },
      ] })).toThrow(`legacy_player_survival_columns_still_present:${name}`);
    }
    expect(() => assertLegacyFarmRetiredSchema({ tables: [{ name: 'player_survival', columns: [
      { name: 'identity' }, { name: 'selectedSlot' }, { name: 'hungerCenti' },
    ] }] })).not.toThrow();
  });
});
