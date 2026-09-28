import {describe,expect,it,vi} from 'vitest';
import {createCanvas} from '@napi-rs/canvas';
import {uiTestArt} from '../lab/testing/art.js';
import {paintUiSkin,type UiKitArt} from './art.js';
import {UiRoot} from '../runtime/root.js';
import {uiChat,type UiChatModel} from './chat.js';
import {UiElement} from '../runtime/element.js';
import {uiFixed} from '../layout/box.js';
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

// Owner request 2026-09-28: the HUD chat button is a ghost icon, the speech glyph alone with no plaque or frame, and its
// CHAT hint sits beside it so it never covers the first line of the open log.
describe('the ghost chat icon', () => {
 const model:UiChatModel={open:false,collapsed:false,unread:false,hovered:false,touch:false,blocked:false,lines:[{id:'1',text:'[General] Mara: apples',arrivedAt:0}],suggestions:[],suggestionIndex:0};
 const mount=async(next:UiChatModel=model)=>{const art=await uiTestArt();const chat=uiChat({model:next,onSubmit:vi.fn(),onChange:vi.fn(),onSuggestionIndex:vi.fn(),onToggle:vi.fn(),onComplete:vi.fn(),onMove:vi.fn(),onMoveEnd:vi.fn()});
  const root=new UiRoot({scale:1,art});root.resize(320,200);root.mount(chat);root.arrange();return {root,chat,art};};
 /** The toggle's 28x24 area on a transparent canvas: only what the toggle (and anything over it) paints. */
 const toggleArea=(root:UiRoot,chat:{toggle:{rect:{x:number;y:number;width:number;height:number}}})=>{const c=createCanvas(320,200);root.draw(c.getContext('2d') as unknown as CanvasRenderingContext2D,0);const r=chat.toggle.rect;return c.getContext('2d').getImageData(r.x,r.y,r.width,r.height).data;};
 const oracle=(art:UiKitArt,state:{pressed?:boolean;lit?:boolean},pip=false)=>{const c=createCanvas(28,24),x=c.getContext('2d') as unknown as CanvasRenderingContext2D;
  x.save();if(state.pressed)x.filter='brightness(80%)';else if(state.lit)x.filter='brightness(125%)';paintUiSkin(x,art.skin.icon,'hud.chat',{x:6,y:4+(state.pressed?1:0),width:16,height:16});x.restore();
  if(pip){x.fillStyle='#3f2832';x.fillRect(20,2,6,6);x.fillStyle='#63c74d';x.fillRect(21,3,4,4);}
  return c.getContext('2d').getImageData(0,0,28,24).data;};
 const same=(a:Uint8ClampedArray,b:Uint8ClampedArray)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 it('paints only the glyph at rest, when hovered, pressed, focused by keyboard and with unread messages; the hit area stays 28x24',async()=>{
  const {root,chat,art}=await mount();
  expect(chat.toggle.rect.width).toBe(28);expect(chat.toggle.rect.height).toBe(24);
  expect(same(toggleArea(root,chat),oracle(art,{}))).toBe(true);
  const p={x:chat.toggle.rect.x+14,y:chat.toggle.rect.y+12};
  root.pointer({type:'move',point:p,pointerId:1,button:-1});expect(same(toggleArea(root,chat),oracle(art,{lit:true}))).toBe(true);
  root.pointer({type:'down',point:p,pointerId:1,button:0});expect(same(toggleArea(root,chat),oracle(art,{pressed:true}))).toBe(true);
  root.pointer({type:'up',point:p,pointerId:1,button:0});root.pointer({type:'move',point:{x:300,y:190},pointerId:1,button:-1});
  // Keyboard focus lights the glyph too, and no focus outline or frame is drawn around it.
  root.focus.set(chat.toggle,'keyboard');root.arrange();expect(same(toggleArea(root,chat),oracle(art,{lit:true}))).toBe(true);
  root.dispose();
  const unread=await mount({...model,unread:true});expect(same(toggleArea(unread.root,unread.chat),oracle(unread.art,{},true))).toBe(true);unread.root.dispose();
 });
 it('keeps the toggle a keyboard control and shows the CHAT hint beside it, clear of the open log',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  try{
   const onToggle=vi.fn(),art=await uiTestArt();
   const chat=uiChat({model:{...model,open:true},onSubmit:vi.fn(),onChange:vi.fn(),onSuggestionIndex:vi.fn(),onToggle,onComplete:vi.fn(),onMove:vi.fn(),onMoveEnd:vi.fn()});
   const root=new UiRoot({scale:1,art});root.resize(320,200);root.mount(chat);root.arrange();
   root.focus.set(chat.toggle,'keyboard');root.key({key:'Enter'});expect(onToggle).toHaveBeenCalledOnce();
   root.focus.set(null);root.pointer({type:'move',point:{x:chat.toggle.rect.x+14,y:chat.toggle.rect.y+12},pointerId:1,button:-1});vi.advanceTimersByTime(2000);root.arrange();
   const popup=root.entries().find(entry=>entry.element.kind==='tooltip-popup'&&entry.element.visible)!.element,t=chat.toggle.rect,h=chat.history.rect;
   expect(popup.rect.x).toBe(t.x+t.width+4);
   expect(popup.rect.y+popup.rect.height/2).toBeCloseTo(t.y+t.height/2,0);
   const overlaps=(a:typeof t,b:typeof t)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
   expect(overlaps(popup.rect,h)).toBe(false);expect(overlaps(popup.rect,t)).toBe(false);root.dispose();
  }finally{vi.useRealTimers();}
 });
 it('puts the CHAT hint on the left of the icon when the right has no room',async()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  try{
   const art=await uiTestArt();
   const chat=uiChat({model,onSubmit:vi.fn(),onChange:vi.fn(),onSuggestionIndex:vi.fn(),onToggle:vi.fn(),onComplete:vi.fn(),onMove:vi.fn(),onMoveEnd:vi.fn()});
   // The chat dragged to the right edge: the host places it there.
   const root=new UiRoot({scale:1,art});root.resize(320,200);
   root.mount(new UiElement({style:{width:'grow',height:'grow',display:'flex',direction:'row'},children:[new UiElement({style:{width:uiFixed(292),shrink:0}}),new UiElement({style:{width:uiFixed(28),height:'grow',display:'flex',direction:'column'},children:[chat]})]}));root.arrange();
   const t=chat.toggle.rect;expect(t.x+t.width).toBeGreaterThan(300);
   root.pointer({type:'move',point:{x:t.x+14,y:t.y+12},pointerId:1,button:-1});vi.advanceTimersByTime(2000);root.arrange();
   const popup=root.entries().find(entry=>entry.element.kind==='tooltip-popup'&&entry.element.visible)!.element;
   expect(popup.rect.x+popup.rect.width).toBe(t.x-4);
   expect(popup.rect.y+popup.rect.height/2).toBeCloseTo(t.y+t.height/2,0);root.dispose();
  }finally{vi.useRealTimers();}
 });
});
