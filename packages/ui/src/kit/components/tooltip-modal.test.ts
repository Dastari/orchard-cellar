import {expect,it,vi} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiTopModal} from '../runtime/layers.js';
import {uiFrame} from './frame.js';
import {uiButton} from './button.js';
import {uiTooltip} from './tooltip.js';
it('paints a wrapped modal tooltip above its frame without replacing the modal focus boundary',()=>{
 vi.useFakeTimers();const root=new UiRoot({scale:1});root.resize(400,300);const button=uiButton({label:'Reward'}),tip=uiTooltip('REWARDS: 1 GOLD / 100 EXPLORER XP / A VERY IMPORTANT BOOK',button);const frame=uiFrame({layout:{zLayer:'modal',width:'grow',height:'grow'},children:[tip]});root.mount(frame);root.arrange();root.focus.set(button,'keyboard');vi.runAllTimers();root.arrange();const popup=root.entries().find(e=>e.element.kind==='tooltip-popup')!;expect(popup.element.visible).toBe(true);expect(popup.layer).toBe('toast');expect(uiTopModal(root.entries())).toBe(frame);expect(popup.element.rect.height).toBeGreaterThan(20);root.dispose();vi.useRealTimers();
});

it('keeps stationary hover and tooltip dwell across replacement controls',()=>{
 vi.useFakeTimers();const root=new UiRoot({scale:1});root.resize(400,300);
 const make=()=>uiTooltip('Paint grass',uiButton({id:'paint-grass',label:'Grass'}));
 let tip=make();root.mount(tip);root.arrange();
 const button=root.entries().find(e=>e.element.id==='paint-grass')!.element;
 root.pointer({type:'move',point:{x:button.rect.x+5,y:button.rect.y+5},pointerId:1,button:0});
 vi.advanceTimersByTime(200);tip.dispose();tip=make();root.mount(tip);root.arrange();
 expect(root.input.hovered?.isDescendantOf(tip)).toBe(true);
 vi.advanceTimersByTime(350);root.arrange();
 expect(root.entries().some(e=>e.element.kind==='tooltip-popup'&&e.element.visible)).toBe(true);
 root.input.clearHover();root.arrange();
 expect(root.entries().some(e=>e.element.kind==='tooltip-popup'&&e.element.visible)).toBe(false);
 root.dispose();vi.useRealTimers();
});
