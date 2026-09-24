import {expect,it,vi} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiChat,type UiChatModel} from './chat.js';
it('virtualizes wrapped chat, follows arrivals only at the end, and retains native editing state',()=>{
 const model:UiChatModel={open:true,collapsed:false,unread:false,hovered:false,touch:false,blocked:false,lines:Array.from({length:2000},(_,index)=>({id:String(index),text:`[General] Farmer ${index}: apples for sale`,arrivedAt:0})),suggestions:[],suggestionIndex:0};
 const onToggle=vi.fn(),onMove=vi.fn(),onMoveEnd=vi.fn();
 const chat=uiChat({model,onSubmit:vi.fn(),onChange:vi.fn(),onSuggestionIndex:vi.fn(),onToggle,onComplete:vi.fn(),onMove,onMoveEnd});
 const root=new UiRoot({scale:1});root.resize(320,200);root.mount(chat);root.arrange();
 expect(root.entries().filter(entry=>entry.element.kind==='list-row').length).toBeLessThan(30);
 expect(chat.history.scroll.y).toBe(chat.history.scroll.maxY);expect(chat.history.scroll.y).toBeGreaterThan(10000);
 const visibleText=root.entries().find(entry=>entry.element.id.startsWith('chat.message.')&&entry.element.clip.height>=10)!.element;expect(visibleText.clip.height).toBeGreaterThanOrEqual(10);expect(visibleText.clip.width).toBeGreaterThan(280);
 chat.editor.setValue('/whisper Mara ');chat.scrollHistory('Home');root.arrange();expect(chat.history.scroll.y).toBe(0);
 chat.updateChat({...model,lines:[...model.lines,{id:'new',text:'Another message',arrivedAt:1000}]});root.arrange();expect(chat.history.scroll.y).toBe(0);expect(chat.editor.snapshot().value).toBe('/whisper Mara ');
 chat.scrollToEnd();root.arrange();expect(chat.history.scroll.y).toBe(chat.history.scroll.maxY);
 const point={x:chat.toggle.rect.x+10,y:chat.toggle.rect.y+10};root.pointer({type:'down',point,button:0,pointerId:1});root.pointer({type:'move',point:{x:point.x+20,y:point.y},button:0,pointerId:1});root.pointer({type:'up',point:{x:point.x+20,y:point.y},button:0,pointerId:1});
 expect(onMove).toHaveBeenCalledWith({x:20,y:0});expect(onMoveEnd).toHaveBeenCalledOnce();expect(onToggle).not.toHaveBeenCalled();
 root.pointer({type:'down',point,button:0,pointerId:1});root.pointer({type:'up',point,button:0,pointerId:1});expect(onToggle).toHaveBeenCalledOnce();
 chat.updateChat({...model,blocked:true});root.arrange();expect(root.pointer({type:'down',point,button:0,pointerId:1})).toBe(false);root.dispose();
});

it('cancels captured obsolete suggestions and preserves primary touch focus during a secondary gesture', () => {
 const model:UiChatModel={open:true,collapsed:false,unread:false,hovered:false,touch:true,blocked:false,lines:[],suggestions:[{label:'Mara',completion:'/whisper Mara '}],suggestionIndex:0};
 const complete=vi.fn(), toggle=vi.fn();
 const chat=uiChat({model,onSubmit:vi.fn(),onChange:vi.fn(),onSuggestionIndex:vi.fn(),onToggle:toggle,onComplete:complete,onMove:vi.fn(),onMoveEnd:vi.fn()});
 const root=new UiRoot({scale:1});root.resize(320,200);root.mount(chat);root.arrange();
 const button=()=>root.entries().find(row=>row.element.id==='chat.suggestion.0')!.element;
 const point=()=>({x:button().rect.x+10,y:button().rect.y+8});
 root.pointer({type:'down',point:point(),pointerId:1,button:0,pointerType:'touch',isPrimary:true}); const focus=root.focus.current;
 root.pointer({type:'down',point:{x:chat.input.rect.x+10,y:chat.input.rect.y+10},pointerId:2,button:0,pointerType:'touch',isPrimary:false});expect(root.focus.current).toBe(focus);
 chat.updateChat({...model,suggestions:[{label:'Toby',completion:'/whisper Toby '}]});root.arrange();
 root.pointer({type:'up',point:point(),pointerId:1,button:0,pointerType:'touch'});expect(complete).not.toHaveBeenCalled();
 root.pointer({type:'up',point:point(),pointerId:2,button:0,pointerType:'touch'});expect(complete).not.toHaveBeenCalled();
 root.pointer({type:'down',point:point(),pointerId:3,button:0});root.pointer({type:'up',point:point(),pointerId:3,button:0});expect(complete).toHaveBeenCalledExactlyOnceWith(0);root.dispose();
});

it('reveals keyboard-selected suggestions in a compact pane without moving editor focus', () => {
 let model:UiChatModel={open:true,collapsed:false,unread:false,hovered:false,touch:true,blocked:false,lines:[],suggestions:[{label:'Say',completion:'/say '},{label:'Shout',completion:'/shout '},{label:'Whisper',completion:'/whisper '}],suggestionIndex:0};
 const root=new UiRoot({scale:1});root.resize(220,71);
 const chat=uiChat({model,onSubmit:vi.fn(),onChange:vi.fn(),onSuggestionIndex:index=>{model={...model,suggestionIndex:index};chat.updateChat(model);},onToggle:vi.fn(),onComplete:vi.fn(),onMove:vi.fn(),onMoveEnd:vi.fn()});root.mount(chat);chat.editor.setValue('/');chat.focusInput();root.arrange();
 root.key({key:'ArrowDown'});root.key({key:'ArrowDown'});root.arrange();
 const selected=root.entries().find(row=>row.element.id==='chat.suggestion.2')!.element;
 expect(selected.clip).toEqual(selected.rect);expect(root.focus.current).toBe(chat.input);
 const pane=root.entries().find(row=>row.element.id==='chat.suggestions')!.element;
 root.wheel({point:{x:pane.rect.x+5,y:pane.rect.y+5},deltaX:0,deltaY:-100});root.arrange();expect(pane.scroll.y).toBe(0);
 root.dispose();
});
