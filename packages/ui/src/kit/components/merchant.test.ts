import {expect,it,vi} from 'vitest';
import {uiMerchant,type UiMerchantModel} from './merchant.js';
import {UiRoot} from '../runtime/root.js';
it('retains quantity controls and filter focus while enforcing bounds and pending locks',()=>{
 const root=new UiRoot({scale:1});root.resize(800,480);let model:UiMerchantModel={speaker:'Marlow',tab:'buy',rows:[{itemKind:'apple',name:'Apple',unitPrice:3,maximumQuantity:25,quantity:0}],balanceBronze:99999999999999999n,totalBronze:0n,pending:false,canCommit:false,filter:''};
 const commit=vi.fn(),quantity=vi.fn((id:string,value:number)=>{model={...model,rows:model.rows.map(row=>row.itemKind===id?{...row,quantity:value}:row),totalBronze:BigInt(value*3),canCommit:value>0};frame.updateMerchant(model);});
 const frame=uiMerchant({model,onTab:vi.fn(),onFilter:vi.fn(),onQuantity:quantity,onCommit:commit,onBack:vi.fn(),onClose:vi.fn()});root.mount(frame);root.arrange();
 const plus=root.entries().find(e=>e.element.label==='Increase Apple')!.element;root.focus.set(plus,'keyboard');root.key({key:'Enter',shiftKey:true});root.arrange();expect(quantity).toHaveBeenLastCalledWith('apple',10);expect(root.focus.current).toBe(plus);root.key({key:'Enter',ctrlKey:true});root.arrange();expect(quantity).toHaveBeenLastCalledWith('apple',25);expect(plus.disabled).toBe(true);
 const input=root.entries().find(e=>e.element.kind==='input')!.element;root.focus.set(input,'keyboard');frame.filterEditor.setValue('app');frame.filterEditor.setSelection(1,2);frame.updateMerchant({...model,filter:'app',pending:true});root.arrange();expect(root.focus.current).toBe(input);expect(frame.filterEditor.snapshot().value).toBe('app');
 const purchase=root.entries().find(e=>e.element.kind==='button'&&e.element.props['label']==='PROCESSING')!.element;expect(purchase.disabled).toBe(true);root.focus.set(purchase,'keyboard');root.key({key:'Enter'});expect(commit).not.toHaveBeenCalled();root.dispose();
});
