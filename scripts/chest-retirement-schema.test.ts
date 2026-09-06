import { describe, expect, it } from 'vitest';
import { LEGACY_CHEST_SCHEMA_NAMES, assertRetiredChestSchema } from './chest-retirement-schema.js';

describe('retired chest schema receipt', () => {
  it('rejects every legacy storage, mapping, session, and caller-view name', () => {
    for (const name of LEGACY_CHEST_SCHEMA_NAMES) {
      expect(() => assertRetiredChestSchema({ entities: [{ name }] })).toThrow(`legacy_chest_schema_still_present:${name}`);
    }
  });

  it('accepts the generic-only placeable schema', () => {
    expect(() => assertRetiredChestSchema({ tables: [
      { name: 'world_placeable' }, { name: 'placeable_slot' }, { name: 'world_placeable_damage' },
    ], views: [{ name: 'own_active_placeable' }, { name: 'own_open_placeable_slots' }] })).not.toThrow();
  });
});
