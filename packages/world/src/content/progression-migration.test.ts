import { describe, expect, it } from 'vitest';
import {
  bootstrapContentDefinitions, balanceFieldsTuple, contentDefinitionRowsHash, serializeContentDefinitionForTransport,
  runtimeActivityExperience, runtimeCharacterCombatBalance, runtimeWorldPolicyBalance,
} from '@orchard/sim';
import historicalRows from './fixtures/pre-f2-content-rows.json';
import { contentRegistryForRows, invalidateContentRegistryCache } from './cache.js';

describe('pre-F2 durable content compatibility', () => {
  it('accepts the original tuple snapshot and durable hash before progression backfill', () => {
    // Captured from immutable PR76 head 6148b89f; never rebuild from current content.
    const rows = historicalRows;
    const hash=contentDefinitionRowsHash(rows);
    expect(hash).toBe('0f06c798');
    invalidateContentRegistryCache();
    const loaded=contentRegistryForRows({packId:'live',revision:77n,contentHash:hash},rows);
    expect(loaded.contentHash).toBe(hash);
    expect(loaded.registry.progressions.size).toBe(0);
    expect(runtimeActivityExperience(loaded.registry,'crop_harvest',4)).toBe(12n);
    expect(runtimeCharacterCombatBalance(loaded.registry)?.bowBaseDamageCenti).toBe(1400);
    expect(runtimeWorldPolicyBalance(loaded.registry)?.craftingStationReachTiles).toBe(2);
    invalidateContentRegistryCache();
  });
  it('also accepts legacy tuples for the current authored pack', () => {
    const rows=bootstrapContentDefinitions().filter(row=>row.kind!=='progression').map(row=>{
      if(row.kind!=='balance'||!('profile' in row))return {id:row.id,kind:row.kind,json:serializeContentDefinitionForTransport(row)};
      const {fields,...legacy}=row;
      return {id:row.id,kind:row.kind,json:JSON.stringify({...legacy,values:balanceFieldsTuple(row.profile,fields)})};
    });
    const hash = contentDefinitionRowsHash(rows);
    invalidateContentRegistryCache();
    const loaded = contentRegistryForRows({ packId: 'live', revision: 78n, contentHash: hash }, rows);
    expect(loaded.contentHash).toBe(hash);
    expect(loaded.registry.progressions.size).toBe(0);
    expect(runtimeActivityExperience(loaded.registry, 'crop_harvest', 4)).toBe(12n);
    invalidateContentRegistryCache();
  });

});
