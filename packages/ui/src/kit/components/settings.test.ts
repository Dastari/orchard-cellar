import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiTopModal } from '../runtime/layers.js';
import { uiSettings } from './settings.js';

it('retains settings controls and routes volume, mute, background and lighting from all six pages',()=>{
  const onVolume=vi.fn(),onMute=vi.fn(),onBackground=vi.fn(),onNameplates=vi.fn(),onLighting=vi.fn();
  const model={audioVolumes:{master:.8,music:.7,sfx:.35},lightingModel:'classic' as const};
  const settings=uiSettings({model,onVolume,onMute,onBackground,onNameplates,onLighting,onBack:vi.fn(),layout:{zLayer:'modal'}});
  const root=new UiRoot({scale:1});root.resize(640,480);root.mount(settings);root.arrange();
  const find=(id:string)=>root.entries().find(e=>e.element.id===id)!.element;
  root.focus.set(find('settings.nameplates'),'keyboard');root.key({key:'Enter'});expect(onNameplates).toHaveBeenCalledWith(false);
  settings.selectSettingsTab('audio');root.arrange();expect(settings.selectedTab).toBe('audio');
  const slider=find('settings.volume.master');root.focus.set(slider,'keyboard');root.key({key:'ArrowRight'});expect(onVolume).toHaveBeenCalledWith('master',.81);
  root.focus.set(find('settings.mute.master'),'keyboard');root.key({key:'Enter'});expect(onMute).toHaveBeenCalledWith('master');
  root.focus.set(find('settings.background.sounds'),'keyboard');root.key({key:'Enter'});expect(onBackground).toHaveBeenCalledWith('sounds',true);
  settings.updateSettings({...model,audioVolumes:{...model.audioVolumes,master:0}});root.arrange();expect(find('settings.volume.master')).toBe(slider);expect(slider.props['value']).toBe(0);expect(find('settings.mute.master').props['label']).toBe('UNMUTE');
  settings.selectSettingsTab('video');root.arrange();const select=find('settings.lighting');root.focus.set(select,'keyboard');root.key({key:'Enter'});root.arrange();
  const popup=root.entries().find(e=>e.element.kind==='popover')!;expect(popup.layer).toBe('toast');expect(uiTopModal(root.entries())).toBe(settings);
  root.focus.set(select,'keyboard');root.key({key:'ArrowDown'});root.key({key:'Enter'});expect(onLighting).toHaveBeenCalledWith('unified');
  for(const tab of ['controls','interface','accessibility']as const){settings.selectSettingsTab(tab);root.arrange();expect(settings.selectedTab).toBe(tab);expect(root.entries().some(e=>e.element.kind==='button'&&e.element.disabled)).toBe(true);}
  root.dispose();
});

it('moves the selection and focus through the tab column with the arrow keys', () => {
  const settings = uiSettings({ model: { audioVolumes: { master: .8, music: .7, sfx: .35 } }, onVolume: vi.fn(), onMute: vi.fn(), onBackground: vi.fn(), onNameplates: vi.fn(), onLighting: vi.fn(), onBack: vi.fn() });
  const root = new UiRoot({ scale: 1 }); root.resize(640, 480); root.mount(settings); root.arrange();
  const tab = (id: string) => root.entries().find(e => e.element.id === `settings.pages:tab:${id}`)!.element;
  const audio = tab('audio'); root.focus.set(audio, 'keyboard'); root.key({ key: 'Enter' }); root.arrange();
  expect(settings.selectedTab).toBe('audio'); expect(root.focus.current).toBe(audio);
  root.key({ key: 'ArrowDown' }); root.arrange();
  expect(settings.selectedTab).toBe('interface'); expect(root.focus.current).toBe(tab('interface')); expect(tab('interface').props['selected']).toBe(true);
  root.key({ key: 'ArrowUp' }); root.key({ key: 'ArrowUp' }); root.arrange();
  expect(settings.selectedTab).toBe('video'); expect(root.focus.current).toBe(tab('video'));
  root.dispose();
});
