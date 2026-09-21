import {expect,it,vi} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiStatistics} from './statistics.js';
it('paginates lifetime totals, preserves the page on updates and exposes progression navigation',()=>{
  const navigate=vi.fn(), close=vi.fn(), root=new UiRoot({scale:1});root.resize(640,480);
  const statistics=Array.from({length:12},(_,index)=>({statisticKind:'items_obtained',subjectKind:`item_${index}`,value:12345678901234567890n}));
  const frame=uiStatistics({model:{statistics},onNavigate:navigate,onClose:close});root.mount(frame);root.arrange();
  const nodes=()=>root.entries().map(e=>e.element);
  expect(nodes().some(n=>n.label==='12,345,678,901,234,567,890')).toBe(true);
  const next=nodes().find(n=>n.label==='Next')!; expect(next).toBeDefined();root.focus.set(next,'keyboard');root.key({key:'Enter'});root.arrange();
  const table=nodes().find(n=>n.kind==='table')!;expect((table.props['state'] as {page:number}).page).toBe(1);
  frame.updateStatistics({statistics:statistics.map(row=>({...row,value:row.value+1n}))});root.arrange();
  expect((nodes().find(n=>n.kind==='table')!.props['state'] as {page:number}).page).toBe(1);
  const skills=nodes().find(n=>n.label==='SKILLS')!;root.focus.set(skills,'keyboard');root.key({key:'Enter'});expect(navigate).toHaveBeenCalledWith('skills');root.dispose();
});
