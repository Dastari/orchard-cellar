import {expect,it,vi} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiGateway,type UiGatewayModel} from './gateway.js';
it('keeps account entry actions separate from local profiles and blocks busy submissions',()=>{
 const onAction=vi.fn(),onSelectProfile=vi.fn(),root=new UiRoot({scale:1});root.resize(480,400);
 const model:UiGatewayModel={localPreview:false,signedIn:false,profiles:['Mara','Toby'],selected:0,message:'Sign in',busy:false,allowLocalPreview:true};
 const gateway=uiGateway({model,onAction,onSelectProfile});root.mount(gateway);root.arrange();
 const control=(id:string)=>root.entries().find(e=>e.element.id===`gateway.${id}`)?.element;
 const press=(id:string)=>{const node=control(id)!;expect(node).toBeDefined();root.focus.set(node,'keyboard');root.key({key:'Enter'});};
 for(const id of ['sign-in','register','recover'])press(id);
 expect(onAction.mock.calls.map(call=>call[0])).toEqual(['sign-in','register','recover']);expect(control('enter-world')).toBeUndefined();
 gateway.updateGateway({...model,signedIn:true,displayName:'Mara'});root.arrange();press('enter-world');press('sign-out');expect(control('sign-in')).toBeUndefined();
 gateway.updateGateway({...model,localPreview:true});root.arrange();gateway.editor.setValue('New Farmer');gateway.submit();expect(onAction).toHaveBeenLastCalledWith('continue-local','New Farmer');
 gateway.selectAdjacentProfile(-1);expect(onSelectProfile).toHaveBeenCalledWith(1);expect(gateway.editor.snapshot().value).toBe('');
 const input=control('name');gateway.focusName();root.arrange();expect(root.focus.current).toBe(input);
 gateway.editor.setValue('Still Editing');gateway.updateGateway({...model,localPreview:true,message:'Waiting'});root.arrange();expect(control('name')).toBe(input);expect(gateway.editor.snapshot().value).toBe('Still Editing');
 gateway.updateGateway({...model,localPreview:true,busy:true});root.arrange();onAction.mockClear();onSelectProfile.mockClear();gateway.submit();gateway.selectAdjacentProfile(1);expect(onAction).not.toHaveBeenCalled();expect(onSelectProfile).not.toHaveBeenCalled();expect(input?.disabled).toBe(true);
 root.dispose();
});
