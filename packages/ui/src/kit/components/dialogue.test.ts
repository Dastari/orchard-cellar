import {expect,it,vi} from 'vitest';
import {uiDialogue} from './dialogue.js';
import {UiRoot} from '../runtime/root.js';
it('uses current choices for numbered and focused activation and preserves close behavior',()=>{
 const choose=vi.fn(),close=vi.fn(),root=new UiRoot({scale:1});root.resize(600,400);const model={id:'greeting',speaker:'Marlow',body:'Welcome to the orchard.',choices:[{id:'shop',label:'Show me your shop'},{id:'leave',label:'Goodbye'}]};const frame=uiDialogue({model,choose,onClose:close});root.mount(frame);root.arrange();frame.handleDialogueKey('Digit1');expect(choose).toHaveBeenCalledWith('shop');
 frame.updateDialogue({...model,id:'quest',choices:[{id:'accept',label:'Accept quest'}]});root.arrange();frame.handleDialogueKey('Digit2');expect(choose).toHaveBeenCalledTimes(1);const button=root.entries().find(e=>e.element.id==='dialogue:accept')!.element;root.focus.set(button,'keyboard');root.key({key:'Enter'});expect(choose).toHaveBeenLastCalledWith('accept');frame.handleDialogueKey('Escape');expect(close).toHaveBeenCalledOnce();root.dispose();
});
