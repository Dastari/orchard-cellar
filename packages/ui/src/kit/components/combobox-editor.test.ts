import { expect, it } from 'vitest';
import { ui } from './index.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { UiRoot } from '../runtime/root.js';
it('filters from an external editor and commits the selected suggestion into that editor', async () => {
  const editor=new CanvasTextEditor(), queries:string[]=[];let selected='';
  const options={id:'search',label:'Search',editor,options:[{value:'water',label:'Water'},{value:'grass',label:'Grass'}],onQueryChange:(value:string)=>queries.push(value),onChange:(value:string)=>{selected=value;}};
  const root=new UiRoot({scale:1});root.resize(300,240);const combo=root.mount(ui.combobox(options));root.arrange();
  root.focus.set(root.entries().find(({element})=>element.id==='search')!.element);
  root.text('wat');await Promise.resolve();root.arrange();expect(queries).toEqual(['wat']);expect(editor.snapshot().value).toBe('wat');
  root.key({key:'Enter'});root.arrange();expect(selected).toBe('water');expect(editor.snapshot().value).toBe('Water');
  combo.dispose();root.mount(ui.combobox(options));root.arrange();
  const field=root.entries().find(({element})=>element.id==='search')!.element;expect(field.props['value']).toBe('Water');
  root.focus.set(field);root.key({key:'ArrowDown'});await Promise.resolve();root.arrange();
  expect(queries.at(-1)).toBe('Water');expect(root.entries().some(({element})=>element.kind==='list-row'&&element.label==='water')).toBe(true);
  root.dispose();
});

it('restores an open suggestion list when a spatial host rebuilds during editing', async () => {
  const editor=new CanvasTextEditor();let open=false,selected='';
  const create=()=>ui.combobox({id:'search',label:'Search',editor,open,onOpenChange:value=>{open=value;},
    options:[{value:'water',label:'Water'}],onChange:value=>{selected=value;}});
  const root=new UiRoot({scale:1});root.resize(300,240);const combo=root.mount(create());root.arrange();
  root.focus.set(root.entries().find(({element})=>element.id==='search')!.element);root.text('wat');
  await Promise.resolve();expect(open).toBe(true);
  combo.dispose();root.mount(create());root.arrange();
  root.focus.set(root.entries().find(({element})=>element.id==='search')!.element);await Promise.resolve();root.arrange();
  root.key({key:'Enter'});expect(selected).toBe('water');expect(open).toBe(false);root.dispose();
});
