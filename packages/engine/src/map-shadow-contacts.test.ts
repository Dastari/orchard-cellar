import {expect,it} from 'vitest';
import {FIXED_UNITS_PER_PIXEL as U} from '@orchard/sim';
import {mapShadowContacts,type MapShadowPlacement} from './map-shadow-contacts.js';
const placement=(id:string,footX=8):MapShadowPlacement=>({id,tie:id,footX,footY:16,elevation:0,left:0,right:32});
it('retains the native tree 8 by 8 column footprint',()=>{
  const contact=mapShadowContacts([{tileX:0,tileY:0,elevation:0,collisionMask:0x0660}],[placement('tree')]).get('tree')!;
  expect(contact.rectangularBase).toEqual({left:4*U,top:4*U,right:12*U-1,bottom:12*U-1});
  expect(contact.contact).toEqual({left:4*U,top:8*U,right:12*U-1,bottom:12*U-1});
});
it('keeps translated negative-world contact and multi-row foundations exact',()=>{
  const cells=[{tileX:-2,tileY:-3,elevation:2,collisionMask:0xffff},
    {tileX:-1,tileY:-3,elevation:2,collisionMask:0xffff}];
  const contact=mapShadowContacts(cells,[{...placement('facade'),footX:-16,footY:-32,elevation:2,left:-40,right:8}]).get('facade')!;
  expect(contact.rectangularBase).toEqual({left:-32*U,top:-48*U,right:-1,bottom:-32*U-1});
  expect(contact.contact).toEqual({left:-32*U,top:-36*U,right:-1,bottom:-32*U-1});
});
it('never bridges a gap and assigns compound bits once independent of visual enumeration',()=>{
  const cells=[{tileX:0,tileY:0,elevation:0,collisionMask:0x9000}];
  const a=placement('a',2),b=placement('b',14);
  const split=mapShadowContacts(cells,[b,a]);
  expect([...mapShadowContacts(cells,[a,b])].sort()).toEqual([...split].sort());
  expect(split.get('a')!.contact).toEqual({left:0,top:12*U,right:4*U-1,bottom:16*U-1});
  expect(split.get('b')!.contact.left).toBe(12*U);
  const whole=mapShadowContacts(cells,[placement('single')]).get('single')!;
  expect(whole.rectangularBase).toBeNull();
  expect(whole.contact.right-whole.contact.left+1).toBe(4*U);
});
it('uses deterministic ties, rejects other planes/outside visual spans and deduplicates repeated cells',()=>{
  const cell={tileX:0,tileY:0,elevation:0,collisionMask:0xffff};
  const a=placement('a'),b=placement('b');
  const contacts=mapShadowContacts([cell,cell],[b,a,{...placement('other'),elevation:1},{...placement('outside'),left:40,right:60}]);
  expect([...contacts.keys()]).toEqual(['a']);
  expect(contacts.get('a')!.rectangularBase).toEqual({left:0,top:0,right:16*U-1,bottom:16*U-1});
});
