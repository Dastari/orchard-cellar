import { expect, it, vi } from 'vitest';
import { ui } from '@orchard/ui';
import { studioSelectionEditor } from './selection-editor.js';
import { chooseKit } from '../tools/kit-test-driver.js';

it('makes every mode keyboard reachable in a drawer and retains inactive editor state',()=>{
  const changed=vi.fn();
  const details=ui.text('Properties'),json=ui.text('Draft'),lifecycle=ui.text('Callbacks');
  const build=(value:string)=>studioSelectionEditor({id:'selection',label:'Editor mode',value,onChange:changed,tabs:[
    {id:'fields',label:'Details',content:details},{id:'json',label:'JSON',content:json},{id:'lifecycle',label:'Lifecycle',content:lifecycle},
  ]});
  const initial=build('fields');
  expect(details.visible).toBe(true);expect(json.visible).toBe(false);
  chooseKit({kit:{inspector:initial}},'selection:mode','Lifecycle');expect(changed).toHaveBeenCalledWith('lifecycle');
  const next=build('lifecycle');expect(next.children).toContain(json);expect(lifecycle.visible).toBe(true);expect(details.visible).toBe(false);
});
