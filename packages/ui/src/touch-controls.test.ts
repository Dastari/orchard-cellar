import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TouchControls, prefersTouchControls, touchControlLayout, touchDirectionFromDelta, normalizeTouchControlPreferences,
  type TouchControlAction, type TouchControlPreferences } from './touch-controls.js';
import { GameUiRuntime } from './game-host/runtime.js';
import { UiRoot } from './kit/runtime/root.js';
import { UiElement } from './kit/runtime/element.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiPoint, UiRect } from './geometry.js';
let art: UiKitArt;
const cleanup: (()=>void)[]=[];
beforeAll(async()=>{art=await uiTestArt();});afterEach(()=>{cleanup.splice(0).forEach(fn=>fn());vi.unstubAllGlobals();});
function fixture(enabled=true,width=844,height=390,onAction=vi.fn<(action:Exclude<TouchControlAction,'movement'>)=>void>()) {
 const controls=new TouchControls(art,onAction,enabled),runtime=new GameUiRuntime();controls.setBounds(width,height);
 runtime.register({id:'touch',root:controls.root,priority:10,active:()=>controls.visible,blocking:()=>false});
 cleanup.push(()=>{runtime.dispose();controls.dispose();});
 const pointer=(type:'down'|'move'|'up'|'cancel',point:UiPoint,pointerId=1,isPrimary=pointerId===1)=>runtime.pointer({type,point,pointerId,pointerType:'touch',isPrimary,button:0},{hostId:'touch'});
 return{controls,runtime,onAction,pointer};
}
const center=(rect:UiRect)=>({x:rect.x+rect.width/2,y:rect.y+rect.height/2});
const actionNames=['interact','secondary','jump','dodge','block'] as const;

describe('production shared touch adapter',()=>{
 it('uses local primary modality and leaves unknown pointer types unchanged',()=>{
  expect([prefersTouchControls(5,true,false),prefersTouchControls(5,false,true),prefersTouchControls(5,false,false),prefersTouchControls(0,false,false)]).toEqual([true,false,true,false]);
  const{controls,pointer,runtime}=fixture(false);expect(controls.available).toBe(false);controls.notePointerType('touch');expect(controls.available).toBe(true);
  const layout=touchControlLayout(844,390);pointer('down',layout.joystickCenter);pointer('move',{x:layout.joystickCenter.x+20,y:layout.joystickCenter.y});expect(controls.direction).toBe('right');
  controls.notePointerType('');expect(controls.available).toBe(true);controls.notePointerType('mouse');expect(controls.direction).toBe('idle');expect(controls.visible).toBe(false);
  expect(runtime.tracksPointer(1)).toBe(true);expect(pointer('up',{x:500,y:200})).toBe(true);expect(runtime.tracksPointer(1)).toBe(false);
  controls.notePointerType('touch');controls.notePointerType('pen');expect(controls.available).toBe(false);
 });
 it('preserves the eight-way direction and exact 8px deadzone',()=>{
  expect(touchDirectionFromDelta(7.99,0)).toBe('idle');expect(touchDirectionFromDelta(8,0)).toBe('right');
  expect([[0,0],[20,0],[-20,0],[0,-20],[0,20],[20,-20],[-20,-20],[20,20],[-20,20]].map(([x,y])=>touchDirectionFromDelta(x!,y!)))
   .toEqual(['idle','right','left','up','down','upRight','upLeft','downRight','downLeft']);
 });
 it.each(actionNames)('dispatches %s exactly once on down and never again on move/up/cancel',action=>{
  const{pointer,onAction}=fixture(),p=center(touchControlLayout(844,390)[`${action}Button`]);
  expect(pointer('down',p)).toBe(true);expect(onAction).toHaveBeenCalledExactlyOnceWith(action);
  pointer('move',{x:-20,y:600});pointer('up',{x:-20,y:600});pointer('cancel',p);expect(onAction).toHaveBeenCalledTimes(1);
 });
 it('supports joystick plus action and multiple guard fingers without stealing movement or releasing the remaining guard',()=>{
  const{controls,pointer,onAction}=fixture(),layout=touchControlLayout(844,390),p=layout.joystickCenter;
  pointer('down',p);pointer('move',{x:p.x+30,y:p.y-30});expect(controls.direction).toBe('upRight');
  pointer('down',center(layout.blockButton),2,false);pointer('down',center(layout.blockButton),3,false);expect(controls.blockHeld).toBe(true);
  pointer('down',center(layout.dodgeButton),4,false);pointer('up',center(layout.dodgeButton),4,false);expect(controls.blockHeld).toBe(true);expect(controls.direction).toBe('upRight');
  pointer('cancel',center(layout.blockButton),2,false);expect(controls.blockHeld).toBe(true);pointer('up',center(layout.blockButton),3,false);expect(controls.blockHeld).toBe(false);
  pointer('move',{x:p.x,y:450});expect(controls.direction).toBe('down');pointer('up',{x:p.x,y:450});expect(controls.direction).toBe('idle');
  expect(onAction.mock.calls.map(call=>call[0])).toEqual(['block','block','dodge']);
 });
 it('swallows old tails across modal takeover without a second action or leftover guard',()=>{
  const{controls,pointer,onAction,runtime}=fixture(),layout=touchControlLayout(844,390);
  pointer('down',layout.joystickCenter);pointer('move',{x:layout.joystickCenter.x+20,y:layout.joystickCenter.y});pointer('down',center(layout.blockButton),2,false);
  const modal=new UiRoot({scale:1});modal.resize(844,390);modal.mount(new UiElement({style:{width:'grow',height:'grow',zLayer:'modal'}}));runtime.register({id:'modal',root:modal,priority:100,active:()=>true,blocking:()=>true});cleanup.push(()=>modal.dispose());
  runtime.reconcile();expect(controls.direction).toBe('idle');expect(controls.blockHeld).toBe(false);
  expect(pointer('up',center(layout.interactButton))).toBe(true);expect(pointer('up',center(layout.interactButton),2,false)).toBe(true);expect(onAction).toHaveBeenCalledExactlyOnceWith('block');
 });
 it('handles synchronous action-opened blocking, then releases the captured tail once',()=>{
  const action=vi.fn<(action:Exclude<TouchControlAction,'movement'>)=>void>(()=>controls.setBlocked(true)),f=fixture(true,844,390,action),controls=f.controls;
  const p=center(touchControlLayout(844,390).interactButton);f.pointer('down',p);expect(action).toHaveBeenCalledExactlyOnceWith('interact');expect(controls.visible).toBe(false);
  expect(f.runtime.tracksPointer(1)).toBe(true);expect(f.pointer('move',{x:400,y:200})).toBe(true);expect(f.pointer('up',{x:400,y:200})).toBe(true);expect(f.runtime.tracksPointer(1)).toBe(false);
  controls.setBlocked(false);f.pointer('down',p);expect(action).toHaveBeenCalledTimes(2);
 });
 it('cancels old gestures on preference changes, resize, blur and lost capture, and accepts reused IDs',()=>{
  const{controls,pointer,runtime}=fixture(),layout=touchControlLayout(844,390),start=layout.joystickCenter;
  for(const cancel of [()=>controls.setPreferences({swapped:true,bottomOffset:40}),()=>controls.setBounds(390,844),()=>runtime.cancel(),()=>runtime.cancelPointer(1),()=>controls.reset()]) {
   controls.setPreferences({swapped:false,bottomOffset:0});controls.setBounds(844,390);runtime.beginPointer(1);
   pointer('down',start);pointer('move',{x:start.x+20,y:start.y});expect(controls.direction).toBe('right');cancel();expect(controls.direction).toBe('idle');expect(controls.blockHeld).toBe(false);
   pointer('move',{x:start.x+30,y:start.y});expect(controls.direction).toBe('idle');pointer('up',start);
  }
 });
 it('leaves world keys and circular joystick corners available through actual runtime routing',()=>{
  const{controls,pointer,runtime,onAction}=fixture(),layout=touchControlLayout(844,390),p=layout.joystickCenter;
  expect(pointer('down',{x:p.x-37,y:p.y-37})).toBe(false);expect(runtime.tracksPointer(1)).toBe(false);
  expect(pointer('down',{x:400,y:200},2,false)).toBe(false);expect(pointer('down',{x:p.x-37,y:p.y},3,false)).toBe(true);
  for(const key of ['ArrowUp','ArrowLeft','w','e','f','x',' ','Enter','Tab'])expect(runtime.key({key})).toBe(false);
  expect(onAction).not.toHaveBeenCalled();expect(controls.root.entries().some(entry=>entry.element.focusable)).toBe(false);
  pointer('up',p,3,false);
 });
});

describe('canonical production thumb layout',()=>{
 it('preserves normal portrait/landscape positions and clamps persisted preferences',()=>{
  expect(touchControlLayout(390,844).joystickCenter.y).toBe(765);const portrait=touchControlLayout(390,844);expect(portrait.interactButton.y+portrait.interactButton.height).toBe(793);
  const landscape=touchControlLayout(844,390);expect(landscape.joystickCenter.y).toBe(350);expect(landscape.interactButton).toMatchObject({y:328,height:30});
  expect(normalizeTouchControlPreferences({swapped:true,bottomOffset:150})).toEqual({swapped:true,bottomOffset:120});expect(normalizeTouchControlPreferences({bottomOffset:NaN})).toEqual({swapped:false,bottomOffset:0});
 });
 it.each([[320,180],[390,844],[844,390],[480,270]])('keeps joystick and all five actions reachable and non-overlapping at%s×%s, both swaps and every offset', (width,height)=>{
  for(const swapped of [false,true])for(let bottomOffset=0;bottomOffset<=120;bottomOffset++) {
   const layout=touchControlLayout(width,height,{swapped,bottomOffset}),r=layout.joystickRadius+8;
   const rects=[{x:layout.joystickCenter.x-r,y:layout.joystickCenter.y-r,width:r*2,height:r*2},...actionNames.map(action=>layout[`${action}Button`])];
   for(const rect of rects){expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.y).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width);expect(rect.y+rect.height).toBeLessThanOrEqual(height);}
   for(let i=0;i<rects.length;i++)for(const b of rects.slice(i+1)){const a=rects[i]!;expect(a.x>=b.x+b.width||b.x>=a.x+a.width||a.y>=b.y+b.height||b.y>=a.y+a.height).toBe(true);}
  }
 });
 it('uses exactly those real kit hit targets under compact/wide scales and fractional DPR',()=>{
  vi.stubGlobal('document',{createElement:()=>createCanvas(1,1)});const evidence=process.env['ORCHARD_TOUCH_EVIDENCE'];if(evidence)mkdirSync(evidence,{recursive:true});
  const{controls,pointer,onAction}=fixture();
  for(const[width,height]of[[320,180],[390,844],[844,390]]as const)for(const swapped of[false,true])for(const bottomOffset of[0,40,120]) {
   const preferences:TouchControlPreferences={swapped,bottomOffset};controls.setPreferences(preferences);controls.setBounds(width,height);const layout=touchControlLayout(width,height,preferences);
   for(const action of actionNames){controls.root.arrange();const node=controls.root.entries().find(entry=>entry.element.id===`game.touch-controls:${action}`)!.element;expect(node.rect).toEqual(layout[`${action}Button`]);expect(node.clip).toEqual(node.rect);onAction.mockClear();pointer('down',center(node.rect));pointer('up',center(node.rect));expect(onAction).toHaveBeenCalledExactlyOnceWith(action);}
   for(const scale of[1,2,3]){const canvas=createCanvas(Math.round(width*scale*1.25),Math.round(height*scale*1.25)),ctx=canvas.getContext('2d');ctx.scale(scale*1.25,scale*1.25);controls.draw(ctx as unknown as CanvasRenderingContext2D);expect(ctx.getImageData(0,0,canvas.width,canvas.height).data.some(value=>value!==0)).toBe(true);if(evidence&&bottomOffset===120)writeFileSync(`${evidence}/touch-${width}x${height}-swap${swapped}-scale${scale}-dpr1.25.png`,canvas.toBuffer('image/png'));}
  }
 });
});

// BUG-029: isolated on-screen bounds are insufficient; reserve the real HUD chrome.
describe('compact combined touch reservations', () => {
 it.each([false, true])('keeps full thumb captures between chrome and hotbar when swapped=%s', swapped => {
  for (const [width, height] of [[320, 180], [480, 270]]) for (const bottomOffset of [0, 40, 120]) {
   const layout = touchControlLayout(width!, height!, { swapped, bottomOffset });
   const radius = layout.joystickRadius + 8;
   const boxes = [{ x: layout.joystickCenter.x-radius, y: layout.joystickCenter.y-radius, width: radius*2, height: radius*2 }, ...actionNames.map(name => layout[`${name}Button`])];
   for (const box of boxes) { expect(box.y).toBeGreaterThanOrEqual(40); expect(box.y+box.height).toBeLessThanOrEqual(height!-6-31-4); }
   expect(normalizeTouchControlPreferences({swapped,bottomOffset}).bottomOffset).toBe(bottomOffset);
  }
 });
});
