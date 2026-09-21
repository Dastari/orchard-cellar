import {expect,it,vi} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiTopModal} from '../runtime/layers.js';
import {uiFrame} from './frame.js';
import {uiButton} from './button.js';
import {uiTooltip} from './tooltip.js';
it('paints a wrapped modal tooltip above its frame without replacing the modal focus boundary',()=>{
 vi.useFakeTimers();const root=new UiRoot({scale:1});root.resize(400,300);const button=uiButton({label:'Reward'}),tip=uiTooltip('REWARDS: 1 GOLD / 100 EXPLORER XP / A VERY IMPORTANT BOOK',button);const frame=uiFrame({layout:{zLayer:'modal',width:'grow',height:'grow'},children:[tip]});root.mount(frame);root.arrange();root.focus.set(button,'keyboard');vi.runAllTimers();root.arrange();const popup=root.entries().find(e=>e.element.kind==='tooltip-popup')!;expect(popup.element.visible).toBe(true);expect(popup.layer).toBe('toast');expect(uiTopModal(root.entries())).toBe(frame);expect(popup.element.rect.height).toBeGreaterThan(20);root.dispose();vi.useRealTimers();
});
