import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiSwitch, uiSlider } from './forms.js';
import { uiSelect } from './select.js';
import { uiTabs } from './collections.js';

export const UI_SETTINGS_TABS = ['gameplay', 'controls', 'video', 'audio', 'interface', 'accessibility'] as const;
export type UiSettingsTab = (typeof UI_SETTINGS_TABS)[number];
export type UiAudioBus = 'master' | 'music' | 'sfx';
export interface UiSettingsModel {
  readonly audioVolumes: Readonly<Record<UiAudioBus, number>>;
  readonly audioBackground?: { readonly music: boolean; readonly sounds: boolean };
  readonly nameplatesVisible?: boolean;
  readonly fullscreen?: boolean;
  readonly lightingModel?: 'classic' | 'unified';
}
export interface UiSettingsOptions {
  readonly model: UiSettingsModel; readonly tab?: UiSettingsTab; readonly layout?: UiStyle;
  readonly onTab?: (tab: UiSettingsTab) => void;
  readonly onVolume: (bus: UiAudioBus, value: number) => void;
  readonly onMute: (bus: UiAudioBus) => void;
  readonly onBackground: (bus: 'music' | 'sounds', value: boolean) => void;
  readonly onNameplates: (visible: boolean) => void;
  readonly onLighting: (value: 'classic' | 'unified') => void;
  readonly onBack: () => void;
}
export interface UiSettingsElement extends UiElement {
  updateSettings(model: UiSettingsModel): void;
  toggleNameplates(): void;
  selectSettingsTab(tab: UiSettingsTab): void;
  readonly selectedTab: UiSettingsTab;
}

/** Working settings commit immediately; reserved preferences remain disabled. */
export function uiSettings(options: UiSettingsOptions): UiSettingsElement {
  let selected = options.tab ?? 'gameplay';
  const volumes = new Map<UiAudioBus, { slider: UiElement; mute: UiElement; value: UiElement }>();
  const audio = (['master', 'music', 'sfx'] as const).map(bus => {
    const label = bus === 'sfx' ? 'EFFECTS' : bus.toUpperCase();
    const slider = uiSlider({ id: `settings.volume.${bus}`, label: `${label} VOLUME`, min: 0, max: 1, step: .01,
      tone: bus === 'master' ? 'warning' : bus === 'music' ? 'success' : 'primary', onChange: value => options.onVolume(bus, value) });
    const value = uiText('');
    const mute = uiButton({ id: `settings.mute.${bus}`, label: 'MUTE', size: 'sm', onPress: () => options.onMute(bus) });
    volumes.set(bus, {slider,mute,value});
    return uiFlex({width:'grow',gap:2,shrink:0},[uiFlex({direction:'row',width:'grow',gap:4,align:'center'},[uiText(label,{layout:{width:'grow'}}),value,mute]),slider]);
  });
  const music = uiSwitch({id:'settings.background.music',label:'MUSIC IN BACKGROUND',layout:{width:'grow',shrink:0},onChange:value=>options.onBackground('music',value)});
  const sounds = uiSwitch({id:'settings.background.sounds',label:'SOUNDS IN BACKGROUND',layout:{width:'grow',shrink:0},onChange:value=>options.onBackground('sounds',value)});
  const nameplates = uiSwitch({id:'settings.nameplates',label:'PLAYER NAMEPLATES',layout:{width:'grow',shrink:0},onChange:options.onNameplates});
  const display = uiText('');
  const lighting = uiSelect({id:'settings.lighting',label:'Lighting model',options:[{value:'classic',label:'CLASSIC'},{value:'unified',label:'UNIFIED V2'}],onChange:value=>{if(value==='classic'||value==='unified')options.onLighting(value);}});
  const reserved = (rows: readonly (readonly [string,string])[]) => rows.map(([label,value])=>uiFlex({direction:'row',wrap:true,width:'grow',gap:4,shrink:0},[
    uiText(label,{layout:{width:'grow',basis:uiFixed(130)}}),uiButton({label:value,disabled:true,size:'sm',layout:{width:'grow',basis:uiFixed(120)}}),
  ]));
  const page = (children: readonly UiElement[]) => uiScrollArea({gap:8},children);
  const pages: Record<UiSettingsTab,UiElement> = {
    gameplay:page([nameplates,uiText('N toggles nameplates.',{wrap:true}),...([['SHOW TUTORIAL HINTS',true],['CONFIRM RARE ITEM DROPS',true],['AUTO-SORT PICKUPS',false],['HOLD TO HARVEST',false]]as const).map(([label,value])=>uiSwitch({label,value,disabled:true,layout:{width:'grow',shrink:0}}))]),
    controls:page(reserved([['MOVE','WASD / STICK'],['INTERACT','E / SOUTH'],['INVENTORY','I / WEST'],['NAMEPLATES','N'],['CHAT','ENTER'],['PAUSE','ESC / START']])),
    video:page([display,...reserved([['PIXEL SCALING','INTEGER'],['WORLD ZOOM','AUTO'],['UI SCALE','AUTO']]),uiText('LIGHTING MODEL'),lighting,...reserved([['WEATHER DETAIL','HIGH']])]),
    audio:page([...audio,music,sounds]),
    interface:page(reserved([['HUD VISIBILITY','FULL'],['MINIMAP','EXPANDED'],['CHAT TIMESTAMPS','OFF'],['TOOLTIP DELAY','SHORT'],['ITEM LABELS','ON'],['UI SAFE AREA','AUTO']])),
    accessibility:page(reserved([['REDUCED MOTION','OFF'],['FLASH REDUCTION','OFF'],['HIGH CONTRAST','OFF'],['CHAT TEXT SIZE','NORMAL'],['COLOUR FILTER','NONE'],['HOLD ASSIST','OFF']])),
  };
  const tabs = uiTabs({id:'settings.pages',label:'Settings pages',value:selected,tabs:UI_SETTINGS_TABS.map(id=>({id,label:id.toUpperCase(),content:pages[id]})),onChange:id=>{selected=id as UiSettingsTab;options.onTab?.(selected);}});
  const frame=uiFrame({id:'game.settings',header:{title:'SETTINGS',closable:true,onClose:options.onBack},layout:{width:'grow',height:'grow',...options.layout},children:[tabs,uiButton({label:'BACK',size:'sm',onPress:options.onBack,layout:{shrink:0}})]});
  const updateSettings=(model:UiSettingsModel)=>{
    for(const [bus,control] of volumes){const value=model.audioVolumes[bus];control.slider.setProps({value},false);control.value.setProps({text:`${Math.round(value*100)}%`});control.mute.setProps({label:value<=.001?'UNMUTE':'MUTE',tone:value<=.001?'danger':'success'});}
    music.setProps({value:model.audioBackground?.music??false},false);sounds.setProps({value:model.audioBackground?.sounds??false},false);nameplates.setProps({value:model.nameplatesVisible??true},false);
    display.setProps({text:`DISPLAY MODE: ${model.fullscreen?'FULLSCREEN':'WINDOWED'}`});
    const value=model.lightingModel??'classic';lighting.children[0]!.setProps({value,label:value==='classic'?'CLASSIC':'UNIFIED V2'});
  };
  updateSettings(options.model);
  return Object.defineProperty(Object.assign(frame,{updateSettings,toggleNameplates(){nameplates.hooks.onKey?.({key:'Enter'},nameplates);},selectSettingsTab(tab:UiSettingsTab){tabs.selectTab(tab);}}),'selectedTab',{get:()=>selected}) as UiSettingsElement;
}
