import {EQUIPMENT_SLOTS,bootstrapContentRegistry,runtimePlayerAppearanceCatalog} from '@orchard/sim';
import {expect,it,vi} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiCharacter} from './character.js';
import type {CharacterScreenModel} from '../../character-screen.js';
const model:CharacterScreenModel={appearanceCatalog:runtimePlayerAppearanceCatalog(bootstrapContentRegistry())!,playerId:'mara',displayName:'Mara',appearance:{hairKind:'hair_1_brown',shirtKind:'farmer_green',pantsKind:'farmer_white_brown',shoesKind:'brown'},baseAttributes:{str:10,dex:10,con:10,int:10,wis:10,cha:10},resolvedAttributes:{str:12,dex:10,con:10,int:10,wis:10,cha:10},health:8000,maxHealth:10000,mana:5000,maxMana:10000,vigour:9000,maxVigour:10000,tracks:[],effects:['Rested'],equipment:[{slot:2,itemKind:'watch',quantity:1}]};
it('keeps appearance preview across authority updates, displays all equipment and exposes navigation',()=>{
 const root=new UiRoot({scale:1});root.resize(640,600);const change=vi.fn(),navigate=vi.fn();const frame=uiCharacter({model,onAppearance:change,onNavigate:navigate});root.mount(frame);root.arrange();
 const nodes=()=>root.entries().map(e=>e.element);
 expect(nodes().filter(n=>n.kind==='slot')).toHaveLength(EQUIPMENT_SLOTS.length);expect(nodes().some(n=>n.label==='Strength 10 base, +2 from equipment')).toBe(true);
 const next=nodes().find(n=>n.label==='Next HAIR')!;expect(next).toBeDefined();root.focus.set(next,'keyboard');root.key({key:'Enter'});expect(change).toHaveBeenCalledWith({...model.appearance,hairKind:'hair_2_black'});
 frame.updateCharacter({...model,health:9000});root.arrange();expect(nodes().some(n=>n.label==='BLACK')).toBe(true);expect(root.focus.current).toBe(next);
 const stats=nodes().find(n=>n.id==='book.tab.statistics')!;root.focus.set(stats,'keyboard');root.key({key:'Enter'});expect(navigate).toHaveBeenCalledWith('statistics');root.dispose();
});

it('renders live authored progression instead of a fixed level fifty cap',async()=>{
 const {BOOTSTRAP_PROGRESSION}=await import('@orchard/sim');
 const root=new UiRoot({scale:1});root.resize(640,600);
 const frame=uiCharacter({model:{...model,progression:{...BOOTSTRAP_PROGRESSION,levelCap:3,xpCurve:{scale:10,exponent:1}},tracks:[{track:'farming',experience:30n}]},onAppearance:vi.fn()});
 root.mount(frame);root.arrange();
 expect(root.entries().some(entry=>entry.element.label==='Farming Lv 3 Max')).toBe(true);
 root.dispose();
});
