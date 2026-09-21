import { expect, it, vi } from 'vitest';
import { ui } from './index.js';
import { UiRoot } from '../runtime/root.js';
import { uiFixed } from '../layout/box.js';

it('retains tree expansion, active row and virtual scroll across model rebuilds', () => {
  let expanded: readonly string[] = [], activeId: string | null = 'group', scrollY=0;
  const nodes=[{id:'group',label:'Group',children:Array.from({length:2000},(_,i)=>({id:`item-${i}`,label:`Item ${i}`}))}];
  const create=()=>ui.tree({id:'tree',label:'Assets',nodes,expanded,activeId,initialScrollY:scrollY,
    onExpandedChange:next=>{expanded=next;},onActiveChange:id=>{activeId=id;},onScroll:node=>{scrollY=node.scroll.y;}});
  const root=new UiRoot({scale:1});root.resize(300,240);let tree=root.mount(create());root.arrange();root.focus.set(tree);
  root.key({key:'ArrowRight'});root.arrange();expect(expanded).toEqual(['group']);
  root.key({key:'End'});root.arrange();expect(activeId).toBe('item-1999');expect(scrollY).toBeGreaterThan(0);
  tree.dispose();tree=root.mount(create());root.arrange();
  expect(tree.scroll.y).toBe(scrollY);expect(tree.props['active']).toBe(2000);
  expect(root.entries().filter(({element})=>element.kind==='list-row').length).toBeLessThan(20);
  root.dispose();
});

it('keeps row actions keyboard reachable after virtual rows are rebuilt', () => {
  let acted='', selected='';
  const root=new UiRoot({scale:1});root.resize(280,100);
  root.mount(ui.tree({id:'tree',label:'Assets',nodes:[{id:'one',label:'One'}],onSelect:id=>{selected=id;},
    trailing:node=>ui.button({id:`action-${node.id}`,label:'Move',size:'sm',layout:{width:uiFixed(40)},onPress:()=>{acted=node.id;}})}));
  root.arrange();root.resize(200,100);root.arrange();
  const action=root.entries().find(({element})=>element.id==='action-one')!.element;
  expect(root.focus.set(action)).toBe(true);root.key({key:'Enter'});
  expect(acted).toBe('one');expect(selected).toBe('');root.dispose();
});

it('keeps pointer tooltips hidden after a host refresh while preserving keyboard help', () => {
  vi.useFakeTimers();
  const root=new UiRoot({scale:1});root.resize(200,100);
  try {
    let button=ui.button({id:'refresh',label:'Refresh'});
    let wrapper=root.mount(ui.tooltip('Refresh help',button));root.arrange();root.focus.set(button,'pointer');
    const source=root.focus.inputSource;
    wrapper.dispose();button=ui.button({id:'refresh',label:'Refresh'});
    wrapper=root.mount(ui.tooltip('Refresh help',button));root.arrange();root.focus.set(button,source);
    vi.runAllTimers();
    const popup=()=>root.entries().find(({element})=>element.kind==='tooltip-popup')?.element;
    expect(popup()?.visible??false).toBe(false);
    root.focus.set(button,'keyboard');vi.runAllTimers();expect(popup()?.visible).toBe(true);
  } finally {root.dispose();vi.useRealTimers();}
});

it('retains a row action while focus scrolls its virtual window', () => {
  let selected=-1;
  const root=new UiRoot({scale:1});root.resize(240,120);
  root.mount(ui.list({label:'Actions',items:Array.from({length:30},(_,i)=>i),key:String,rowHeight:uiFixed(60),
    render:index=>ui.button({id:`row-action-${index}`,label:`Action ${index}`,onPress:()=>{selected=index;}})}));
  root.arrange();const action=root.entries().find(({element})=>element.id==='row-action-4')!.element;
  expect(root.focus.set(action)).toBe(true);root.arrange();
  expect(root.focus.current).toBe(action);root.key({key:'Enter'});expect(selected).toBe(4);root.dispose();
});
