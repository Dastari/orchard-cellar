import {describe,expect,it} from 'vitest';
import {parseHearthArchitectureEdits,parseHearthArchitectureState,serializeHearthArchitectureState} from './hearth-architecture-state.js';
describe('persisted construction state boundary',()=>{
  it('round trips paid components and exact u64 revision without number conversion',()=>{
    const state={recipeVersion:1 as const,revision:0xffffffffffffffffn,cells:[{tileX:6,tileY:8,floor:'townhouse' as const,partition:'wall' as const,window:true}]};
    expect(parseHearthArchitectureState(serializeHearthArchitectureState(state))).toEqual(state);
  });
  it('rejects unsupported versions, malformed revisions and malformed paid components',()=>{
    const base={recipeVersion:1,revision:'0',cells:[]};
    for(const change of [{recipeVersion:2},{revision:1},{revision:'01'},{revision:'-1'},{revision:'18446744073709551616'},
      {cells:[{tileX:6,tileY:8,floor:'gold'}]},{cells:[{tileX:6,tileY:8,materialRefund:999}]},
      {cells:[{tileX:6,tileY:8,window:'yes'}]},{cells:[{tileX:6.5,tileY:8,floor:'rustic'}]}]) {
      expect(parseHearthArchitectureState(JSON.stringify({...base,...change}))).toBeNull();
    }
    expect(parseHearthArchitectureState('{')).toBeNull();expect(parseHearthArchitectureState('null')).toBeNull();
  });
  it('rejects duplicate persisted cells instead of doubling their refunds',()=>{
    const cell={tileX:6,tileY:8,floor:'rustic' as const};
    expect(()=>serializeHearthArchitectureState({recipeVersion:1,revision:0n,cells:[cell,cell]})).toThrow('invalid_architecture_state');
  });
  it('decodes bounded edit intent without accepting client-authored refunds or mismatched cells',()=>{
    const edit={tileX:6,tileY:8,replacement:{tileX:6,tileY:8,floor:'rustic'}};
    expect(parseHearthArchitectureEdits(JSON.stringify([edit]))).toEqual([edit]);
    expect(parseHearthArchitectureEdits(JSON.stringify([{tileX:6,tileY:8}]))).toEqual([{tileX:6,tileY:8}]);
    for(const value of [[],Array(33).fill(edit),[{...edit,refund:1000}],
      [{...edit,replacement:{...edit.replacement,tileX:7}}],null])expect(parseHearthArchitectureEdits(JSON.stringify(value))).toBeNull();
  });

});
