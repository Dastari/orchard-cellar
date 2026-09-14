import { expect, it, vi } from 'vitest';
import { ChatOverlay,chatFrameBounds,chatLineAlpha,chatHistoryExpanded,chatMessagePresentation,hasUnseenChatMessage,storedChatCollapsed,type ChatOverlayModel } from './chat-overlay.js';
import { uiTestArt } from './kit/lab/testing/art.js';
const base:ChatOverlayModel={width:480,height:270,connected:true,canAdministerWorld:false,onlinePlayerNames:['Mara'],replyPlayerName:'Mara',messages:[]};
it('preserves fade, touch-hover, prefixes and unread semantics',()=>{
 expect(chatLineAlpha(8000,false)).toBe(1);expect(chatLineAlpha(10000,false)).toBe(.5);expect(chatLineAlpha(12000,false)).toBe(0);expect(chatLineAlpha(60000,true)).toBe(1);
 expect(chatHistoryExpanded(true,false,true)).toBe(false);expect(chatHistoryExpanded(false,false,true)).toBe(true);
 for(const [kind,prefix]of [['motd','[MOTD]'],['system','[World]'],['whisper','[From Mara]'],['whisper_outgoing','[To Mara]']])expect(chatMessagePresentation({kind:kind!,channelName:'World',senderDisplayName:'Mara',body:'Hello'}).text).toBe(`${prefix} Hello`);
 expect(hasUnseenChatMessage(new Set([1n]),[{id:2n}])).toBe(true);expect(hasUnseenChatMessage(new Set([1n]),[{id:1n}])).toBe(false);
 expect(storedChatCollapsed('true')).toBe(true);expect(storedChatCollapsed('invalid')).toBe(false);
});
it('clamps the whole composition above touch controls and a software keyboard, including narrow screens',()=>{
 for(const model of [{...base,touchControls:true},{...base,width:390,height:844,touchControls:true,keyboardInset:330},{...base,width:120,height:180}]){
  const frame=chatFrameBounds(model,{x:999,y:999});expect(frame.x+frame.width).toBeLessThanOrEqual(model.width-4);expect(frame.y).toBeGreaterThanOrEqual(4);
  if(model.height===844)expect(frame.y+frame.height).toBeLessThanOrEqual(509);
  if(model.height===270)expect(frame.y+frame.height).toBeLessThanOrEqual(170);
 }
});
it('completes actual commands, sends once, and reports failure without losing the next draft',async()=>{
 const send=vi.fn(async()=>{throw new Error('OFFLINE');}),open=vi.fn(),chat=new ChatOverlay(await uiTestArt(),send,open);chat.update(base);
 chat.handleGlobalKeyDown({key:'/',repeat:false} as KeyboardEvent);chat.chat.editor.setValue('/wh');chat.handleGlobalKeyDown({key:'Tab'} as KeyboardEvent);
 expect(chat.chat.editor.snapshot().value).toBe('/whisper ');
 chat.chat.editor.setValue('/whisper Mara Hello');chat.handleGlobalKeyDown({key:'Enter'} as KeyboardEvent);expect(send).toHaveBeenCalledExactlyOnceWith('/whisper Mara Hello');expect(chat.isOpen).toBe(false);
 await Promise.resolve();chat.handleGlobalKeyDown({key:'Enter'} as KeyboardEvent);chat.chat.editor.setValue('New draft');chat.update(base);expect(chat.chat.editor.snapshot().value).toBe('New draft');
 expect((chat.chat.history.props['items'] as {text:string}[]).some(line=>line.text.includes('OFFLINE'))).toBe(true);
 chat.handleGlobalKeyDown({key:'Escape'} as KeyboardEvent);expect(chat.isOpen).toBe(false);expect(open.mock.calls.map(call=>call[0])).toEqual([true,false,true,false]);chat.dispose();
});
it('uses kit hit bounds for collapsing, unread arrivals, and modal suppression',async()=>{
 const chat=new ChatOverlay(await uiTestArt(),async()=>{},()=>{});chat.update(base);
 const toggle=chat.chat.toggle.rect,point={x:toggle.x+10,y:toggle.y+10};chat.pointerDown(point,0);chat.pointerUp();expect(chat.isCollapsed).toBe(true);
 chat.update({...base,messages:[{id:1n,channelName:'General',senderDisplayName:'Mara',kind:'chat',body:'Hello',itemLinksJson:'[]'}]});expect(chat.hasUnread).toBe(true);
 chat.pointerDown(point,0);chat.pointerUp();expect(chat.hasUnread).toBe(false);expect(chat.isCollapsed).toBe(false);
 const rect=chat.chat.history.rect,p={x:rect.x+4,y:rect.y+4};chat.pointerMove(p);expect(chat.isHovered).toBe(true);
 chat.update({...base,interactionBlocked:true});expect(chat.isHovered).toBe(false);expect(chat.pointerDown(p,0)).toBe(false);expect(chat.wheel(p,10)).toBe(false);expect(chat.handleGlobalKeyDown({key:'Enter'} as KeyboardEvent)).toBe(false);chat.dispose();
});
