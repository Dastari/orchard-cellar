import {expect,it,vi} from 'vitest';
import {UiRoot} from '../runtime/root.js';
import {uiDeveloper} from './developer.js';
it('preserves world and rendering controls and rejects stale actions after authority revocation',()=>{
 const onAction=vi.fn(),onTime=vi.fn(),root=new UiRoot({scale:1});root.resize(640,480);
 const model={canAdministerWorld:true,timeFraction:.25,dateLabel:'SPRING 1',timeLabel:'06:00',weatherMode:'auto',raining:false,windDirectionLabel:'SE'};
 const panel=uiDeveloper({model,onAction,onTime,onBack:vi.fn()});root.mount(panel);root.arrange();
 const node=(id:string)=>root.entries().find(e=>e.element.id===`developer.${id}`)!.element;
 const press=(id:string)=>{root.focus.set(node(id),'keyboard');root.key({key:'Enter'});};
 press('previous-day');press('next-day');press('weather');press('wind');expect(onAction.mock.calls.flat()).toEqual(['previous-day','next-day','weather','wind']);
 const time=node('time');root.focus.set(time,'keyboard');root.key({key:'End'});expect(onTime).toHaveBeenCalledWith(1);
 panel.selectDeveloperTab('render');root.arrange();press('lighting-effects');press('ore-preview');expect(panel.selectedTab).toBe('render');
 panel.updateDeveloper({...model,canAdministerWorld:false,cellarOrePreview:true});root.arrange();expect(node('ore-preview').disabled).toBe(true);expect(node('ore-preview').props['value']).toBe(true);
 onAction.mockClear();press('ore-preview');expect(onAction).not.toHaveBeenCalled();
 panel.selectDeveloperTab('world');root.arrange();expect(node('time')).toBe(time);expect(time.disabled).toBe(true);expect(node('wind').props['label']).toBe('WIND AUTO (SE)');
 root.dispose();
});
