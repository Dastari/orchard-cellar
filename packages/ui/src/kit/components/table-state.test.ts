import { expect, it } from 'vitest';
import { ui, type UiTableState } from './index.js';
import { UiRoot } from '../runtime/root.js';
import { scrollUiElement } from '../layout/scroll.js';
it('restores virtual table scrolling, active row and sort after a host model refresh', () => {
  let state: UiTableState|undefined;
  const rows=Array.from({length:2000},(_,i)=>({id:String(i),value:i})), root=new UiRoot({scale:1});root.resize(400,240);
  const create=()=>ui.table({id:'records',label:'Records',rows,key:row=>row.id,columns:[{id:'value',label:'Value',value:row=>row.value}],state,onStateChange:next=>{state=next;}});
  let table=root.mount(create());root.arrange();
  let list=root.entries().find(({element})=>element.id==='records:rows')!.element;
  root.focus.set(list);root.key({key:'End'});root.arrange();const offset=list.scroll.y;expect(offset).toBeGreaterThan(0);expect(state?.active).toBe(1999);
  table.dispose();table=root.mount(create());root.arrange();list=root.entries().find(({element})=>element.id==='records:rows')!.element;
  expect(list.scroll.y).toBe(offset);expect(list.props['active']).toBe(1999);expect(root.entries().filter(({element})=>element.kind==='list-row').length).toBeLessThan(20);
  scrollUiElement(list,0,1200);expect(state?.scrollY).toBe(1200);
  root.focus.set(root.entries().find(({element})=>element.id==='records:sort:value')!.element);root.key({key:'Enter'});root.arrange();expect(state?.sort).toEqual([{column:'value',direction:'asc'}]);
  table.dispose();root.mount(create());root.arrange();expect(root.entries().find(({element})=>element.id==='records')!.element.props['sort']).toEqual(state?.sort);root.dispose();
});
