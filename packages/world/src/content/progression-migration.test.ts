import { describe, expect, it } from 'vitest';
import {
  bootstrapContentDefinitions, balanceFieldsTuple, contentDefinitionRowsHash, serializeContentDefinitionForTransport,
  runtimeActivityExperience, runtimeCharacterCombatBalance, runtimeWorldPolicyBalance,
} from '@orchard/sim';
import { contentRegistryForRows, invalidateContentRegistryCache } from './cache.js';

describe('pre-F2 durable content compatibility', () => {
  it('accepts the original tuple snapshot and durable hash before progression backfill', () => {
    const rows=bootstrapContentDefinitions().filter(row=>row.kind!=='progression').map(row=>{
      if(row.kind!=='balance'||!('profile' in row))return {id:row.id,kind:row.kind,json:serializeContentDefinitionForTransport(row)};
      const {fields,...legacy}=row;
      return {id:row.id,kind:row.kind,json:JSON.stringify({...legacy,values:balanceFieldsTuple(row.profile,fields)})};
    });
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
});
