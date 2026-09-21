import {it,expect,vi} from 'vitest';
import {VillageOrderFlow,type VillageOrderOffer} from './village-order-flow.js';
const offer:VillageOrderOffer={id:'market_carrots',title:'Carrots',npcId:1n,itemKind:'carrot',quantity:20,saleValueBronze:180n,bonusBronze:350n,totalBronze:530n,revision:0n,contentHash:'a'};
const setup=()=>{const flow=new VillageOrderFlow();flow.update('sessionA',1n,[offer]);return flow;};
it('requires review and sends frozen quotes once while awaiting authoritative revision',async()=>{
  const flow=setup(),send=vi.fn(async()=>{});
  expect(await flow.deliver(send)).toBe(false);expect(flow.select(offer.id)).toBe(true);
  await flow.deliver(send);expect(send).toHaveBeenCalledExactlyOnceWith(offer);expect(flow.pending).toBe(true);
  expect(flow.cancel()).toBe(false);expect(flow.select(offer.id)).toBe(false);expect(await flow.deliver(send)).toBe(false);
  flow.update('sessionA',1n,[{...offer,revision:1n}]);expect(flow.pending).toBe(false);expect(flow.review).toBeNull();
  expect(flow.notice).toBe('Orders updated. Review again.');expect(await flow.deliver(send)).toBe(false);
});
it('invalidates changed quotes without automatically selecting the new price or contents',()=>{
  for(const changed of [{...offer,totalBronze:531n},{...offer,quantity:21},{...offer,contentHash:'b'}, {...offer,revision:1n}]){
    const flow=setup();flow.select(offer.id);flow.update('sessionA',1n,[changed]);expect(flow.review).toBeNull();
    expect(flow.offers[0]).toEqual(changed);
  }
});
it('isolates late failures across NPC/session changes and requires new review after current failure',async()=>{
  const flow=setup();flow.select(offer.id);let reject!:(reason:Error)=>void;
  const old=flow.deliver(()=>new Promise<void>((_resolve,no)=>{reject=no;}));
  flow.update(null,null,[]);flow.update('sessionB',1n,[offer]);flow.select(offer.id);
  await flow.deliver(async()=>{});reject(new Error('old failure'));await old;
  expect(flow.pending).toBe(true);expect(flow.notice).toBe('Waiting for updated orders...');
  flow.update('sessionC',1n,[offer]);flow.select(offer.id);await flow.deliver(async()=>{throw new Error('inventory changed');});
  expect(flow.pending).toBe(false);expect(flow.review).toBeNull();expect(flow.notice).toBe('Delivery failed. Review again.');
});
it('filters by admitted NPC and invalidates withdrawn offers',()=>{
  const flow=setup();flow.update('sessionA',2n,[offer]);expect(flow.offers).toEqual([]);expect(flow.select(offer.id)).toBe(false);
  flow.update('sessionA',1n,[offer]);flow.select(offer.id);flow.update('sessionA',1n,[]);expect(flow.review).toBeNull();
});
it('announces newly learned meals from authoritative state without inferring delivery success',()=>{
  const flow=new VillageOrderFlow();
  flow.update('a',1n,[{...offer,learnedMeals:[],milestoneTitle:'PANTRY LUNCH',milestoneProgress:'Distinct raw 1/2  Preserved 0/1'}]);
  expect(flow.milestone?.milestoneTitle).toBe('PANTRY LUNCH');
  flow.select(offer.id);
  flow.update('a',1n,[{...offer,revision:1n,learnedMeals:['pantry_lunch'],milestoneTitle:'CELLAR SUPPER',milestoneProgress:'Distinct raw 2/2  Preserved 1/2  Bottle 0/1'}]);
  expect(flow.notice).toBe('Learned: Pantry Lunch');expect(flow.review).toBeNull();
  flow.update('b',1n,[{...offer,learnedMeals:['pantry_lunch','cellar_supper']}]);
  expect(flow.notice).toBe('');
});
