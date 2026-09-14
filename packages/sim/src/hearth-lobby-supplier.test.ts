import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {runtimeMerchantOffers} from './content/runtime.js';
import {planMerchantPurchase} from './merchant-cart.js';
import type {ContainerSnapshot} from './item-containers.js';

describe('Delve supply counter',()=>{
  const registry=bootstrapContentRegistry(),offers=runtimeMerchantOffers(registry,'delve_supplies');
  it('offers existing essentials at existing prices through the normal cart planner',()=>{
    expect(offers).toEqual(['arrow','torch','apple']);
    const before:Record<string,ContainerSnapshot>={hotbar:{id:'hotbar',capacity:3,slots:[null,null,null]},backpack:{id:'backpack',capacity:0,slots:[]}};
    const result=planMerchantPurchase(before,[{itemKind:'arrow',quantity:10},{itemKind:'torch',quantity:1},{itemKind:'apple',quantity:1}],offers);
    expect(result.ok).toBe(true);if(!result.ok)return;
    expect(result.totalBronze).toBe(132n);
    expect(before.hotbar!.slots).toEqual([null,null,null]);
    expect(result.containers.hotbar!.slots.map(s=>s?.itemKind)).toEqual(['arrow','torch','apple']);
  });
  it('keeps a full inventory intact and rejects unoffered equipment',()=>{
    const before:Record<string,ContainerSnapshot>={hotbar:{id:'hotbar',capacity:1,slots:[{itemKind:'stone',quantity:99}]},backpack:{id:'backpack',capacity:0,slots:[]}};
    expect(planMerchantPurchase(before,[{itemKind:'arrow',quantity:1}],offers)).toEqual({ok:false,code:'inventory_full'});
    expect(planMerchantPurchase(before,[{itemKind:'bow',quantity:1}],offers)).toEqual({ok:false,code:'merchant_offer_not_found'});
    expect(before.hotbar!.slots).toEqual([{itemKind:'stone',quantity:99}]);
  });
});
