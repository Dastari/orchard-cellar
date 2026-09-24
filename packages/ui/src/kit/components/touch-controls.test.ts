import {expect,it,vi}from'vitest';
import{UiRoot}from'../runtime/root.js';
import{uiTouchControls}from'./touch-controls.js';
import{touchControlLayout}from'../../touch-control-layout.js';
it('retains actual button IDs, accessible focus, all five actions and live joystick direction in the lab',()=>{
 const root=new UiRoot({scale:1});root.resize(480,270);const onAction=vi.fn(),onDirection=vi.fn();root.mount(uiTouchControls({id:'test.touch',placement:'hud',onAction,onDirection}));root.arrange();
 for(const action of['interact','secondary','jump','dodge','block']){const node=root.entries().find(entry=>entry.element.id===`test.touch:${action}`)!.element;expect(node.focusable).toBe(true);root.focus.set(node);root.key({key:'Enter'});expect(onAction).toHaveBeenLastCalledWith(action);}
 const joystick=root.entries().find(entry=>entry.element.id==='test.touch:movement')!.element;root.focus.set(joystick);root.key({key:'ArrowUp'});expect(onDirection).toHaveBeenLastCalledWith('up');root.key({key:'Escape'});expect(onDirection).toHaveBeenLastCalledWith('idle');root.dispose();
});
it('keeps simultaneous pointers on one action held until both release, and a second joystick finger cannot steal movement',()=>{
 const root=new UiRoot({scale:1});root.resize(480,270);const onAction=vi.fn(),view=uiTouchControls({id:'touch',placement:'hud',onAction});root.mount(view);root.arrange();const layout=touchControlLayout(480,270),point={x:layout.blockButton.x+3,y:layout.blockButton.y+3};
 const send=(type:'down'|'move'|'up'|'cancel',pointerId:number,p=point)=>root.pointer({type,point:p,pointerId,button:0,pointerType:'touch',isPrimary:pointerId===1});
 send('down',1);send('down',2);expect(view.isHeld('block')).toBe(true);expect(onAction).toHaveBeenCalledTimes(2);send('up',1);expect(view.isHeld('block')).toBe(true);send('cancel',2);expect(view.isHeld('block')).toBe(false);
 send('down',3,layout.joystickCenter);send('move',3,{x:layout.joystickCenter.x+20,y:layout.joystickCenter.y});expect(view.direction).toBe('right');send('down',4,layout.joystickCenter);send('move',4,{x:layout.joystickCenter.x-20,y:layout.joystickCenter.y});expect(view.direction).toBe('right');send('up',3,layout.joystickCenter);expect(view.direction).toBe('idle');root.dispose();
});
