import {describe,expect,it} from 'vitest';
import {createLiveIslandMapDocument,parseMapDocumentV3,serializeMapDocumentV3ForTransport} from './map-document-v3.js';
import {CombatRegionPolicy} from './combat-regions.js';
import {HEARTH_COMBAT_REGIONS} from './hearth-archipelago.js';
describe('authored map combat policy',()=>{
  it('keeps historical maps peaceful and round-trips new region policy',()=>{
    const base=createLiveIslandMapDocument();
    expect(parseMapDocumentV3(serializeMapDocumentV3ForTransport(base)).combatRegions).toBeUndefined();
    const document=parseMapDocumentV3(serializeMapDocumentV3ForTransport({...base,combatRegions:HEARTH_COMBAT_REGIONS}));
    const policy=new CombatRegionPolicy(document.combatRegions!);
    expect(policy.allowsHostileDamage({spaceId:0,tileX:704,tileY:145})).toBe(true);
    expect(policy.allowsHostileDamage({spaceId:0,tileX:652,tileY:211})).toBe(false);
    expect(policy.allowsHostileDamage({spaceId:0,tileX:400,tileY:400})).toBe(false);
  });
  it.each([null,{},[{}],[{...HEARTH_COMBAT_REGIONS[1],maxX:900}],
    [...HEARTH_COMBAT_REGIONS,{...HEARTH_COMBAT_REGIONS[1],id:'overlap'}],
    [{...HEARTH_COMBAT_REGIONS[1],policy:'lava'}],
  ])('rejects malformed, unbounded or contradictory policy before authority installation',combatRegions=>{
    const source=JSON.stringify({...createLiveIslandMapDocument(),combatRegions});
    expect(()=>parseMapDocumentV3(source)).toThrow();
  });
});
