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
  readonly lightingMode?: 'basic' | 'classic' | 'dynamic';
  readonly worldScale?: '1x' | '2x' | 'native';
  readonly presentationCap?: 'off' | '30hz';
  readonly experimentalWebGL?: boolean;
  readonly lightingFallbackReason?: string | null;
  readonly touchPreferences?: { readonly swapped: boolean; readonly bottomOffset: number };

}
export interface UiSettingsOptions {
  readonly model: UiSettingsModel; readonly tab?: UiSettingsTab; readonly layout?: UiStyle;
  readonly onTab?: (tab: UiSettingsTab) => void;
  readonly onVolume: (bus: UiAudioBus, value: number) => void;
  readonly onMute: (bus: UiAudioBus) => void;
  readonly onBackground: (bus: 'music' | 'sounds', value: boolean) => void;
  readonly onNameplates: (visible: boolean) => void;
  readonly onLighting: (value: 'classic' | 'unified') => void;
  readonly onLightingMode?: (mode: 'basic' | 'classic' | 'dynamic') => void;
  readonly onWorldScale?: (scale: '1x' | '2x' | 'native') => void;
  readonly onPresentationCap?: (cap: 'off' | '30hz') => void;
  readonly onExperimentalWebGL?: (enabled: boolean) => void;
  readonly onTouchPreferences?: (value: { readonly swapped: boolean; readonly bottomOffset: number }) => void;
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
  let selected = options.tab ?? 'gameplay', currentModel = options.model;
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
  const lightingMode = uiSelect({ id: 'settings.lighting-mode', label: 'Lighting', options: ['basic', 'classic', 'dynamic'].map(value => ({ value, label: value.toUpperCase() })),
    onChange: value => { if (value === 'basic' || value === 'classic' || value === 'dynamic') options.onLightingMode?.(value); } });
  const worldScale = uiSelect({ id: 'settings.world-scale', label: 'World scale', options: ['1x', '2x', 'native'].map(value => ({ value, label: value.toUpperCase() })),
    onChange: value => { if (value === '1x' || value === '2x' || value === 'native') options.onWorldScale?.(value); } });
  const cap = uiSwitch({ id: 'settings.presentation-cap', label: '30 HZ CAP', layout: { width: 'grow', shrink: 0 }, onChange: enabled => options.onPresentationCap?.(enabled ? '30hz' : 'off') });
  const webgl = uiSwitch({ id: 'settings.experimental-webgl', label: 'EXPERIMENTAL WEBGL RENDERER', layout: { width: 'grow', shrink: 0 }, onChange: enabled => options.onExperimentalWebGL?.(enabled) });
  const fallback = uiText('', { wrap: true });
  const swap = uiSwitch({ id: 'settings.touch-swap', label: 'SWAP MOVEMENT / ACTIONS', layout: { width: 'grow', shrink: 0 },
    onChange: swapped => options.onTouchPreferences?.({ ...(currentModel.touchPreferences ?? { swapped: false, bottomOffset: 0 }), swapped }) });
  const offsetValue = uiText('');
  const offset = uiSlider({ id: 'settings.touch-offset', label: 'BOTTOM OFFSET', min: 0, max: 120, step: 1,
    onChange: bottomOffset => options.onTouchPreferences?.({ ...(currentModel.touchPreferences ?? { swapped: false, bottomOffset: 0 }), bottomOffset: Math.round(bottomOffset) }) });
  const touch = uiFlex({ width: 'grow', gap: 8, shrink: 0 }, [swap, offsetValue, offset, uiText('PINCH THE WORLD TO ZOOM', { wrap: true })]);
  const rendering = uiFlex({ width: 'grow', gap: 8, shrink: 0 }, [uiText('LIGHTING'), lightingMode, uiText('WORLD SCALE'), worldScale, cap, webgl, fallback]);
  const reserved = (rows: readonly (readonly [string,string])[]) => rows.map(([label,value])=>uiFlex({direction:'row',wrap:true,width:'grow',gap:4,shrink:0},[
    uiText(label,{layout:{width:'grow',basis:uiFixed(130)}}),uiButton({label:value,disabled:true,size:'sm',layout:{width:'grow',basis:uiFixed(120)}}),
  ]));
  const page = (children: readonly UiElement[]) => uiScrollArea({gap:8},children);
  const pages: Record<UiSettingsTab,UiElement> = {
    gameplay:page([nameplates,uiText('N toggles nameplates.',{wrap:true}),...([['SHOW TUTORIAL HINTS',true],['CONFIRM RARE ITEM DROPS',true],['AUTO-SORT PICKUPS',false],['HOLD TO HARVEST',false]]as const).map(([label,value])=>uiSwitch({label,value,disabled:true,layout:{width:'grow',shrink:0}}))]),
    controls:page([touch,...reserved([['MOVE','WASD / STICK'],['INTERACT','E / SOUTH'],['INVENTORY','I / WEST'],['NAMEPLATES','N'],['CHAT','ENTER'],['PAUSE','ESC / START']])]),
    video:page([display,...reserved([['PIXEL SCALING','INTEGER'],['WORLD ZOOM','AUTO'],['UI SCALE','AUTO']]),uiText('LIGHTING MODEL', { layout: { visible: options.onLightingMode === undefined } }),lighting,rendering,...reserved([['WEATHER DETAIL','HIGH']])]),
    audio:page([...audio,music,sounds]),
    interface:page(reserved([['HUD VISIBILITY','FULL'],['MINIMAP','EXPANDED'],['CHAT TIMESTAMPS','OFF'],['TOOLTIP DELAY','SHORT'],['ITEM LABELS','ON'],['UI SAFE AREA','AUTO']])),
    accessibility:page(reserved([['REDUCED MOTION','OFF'],['FLASH REDUCTION','OFF'],['HIGH CONTRAST','OFF'],['CHAT TEXT SIZE','NORMAL'],['COLOUR FILTER','NONE'],['HOLD ASSIST','OFF']])),
  };
  const tabs = uiTabs({id:'settings.pages',label:'Settings pages',value:selected,tabs:UI_SETTINGS_TABS.map(id=>({id,label:id.toUpperCase(),content:pages[id]})),onChange:id=>{selected=id as UiSettingsTab;options.onTab?.(selected);}});
  const frame=uiFrame({id:'game.settings',header:{title:'SETTINGS',closable:true,onClose:options.onBack},layout:{width:'grow',height:'grow',...options.layout},children:[tabs,uiButton({label:'BACK',size:'sm',onPress:options.onBack,layout:{shrink:0}})]});
  const updateSettings=(model:UiSettingsModel)=>{
    currentModel = model;
    touch.setStyle({ visible: options.onTouchPreferences !== undefined });
    swap.setProps({ value: model.touchPreferences?.swapped ?? false }, false);
    offset.setProps({ value: model.touchPreferences?.bottomOffset ?? 0 }, false);
    offsetValue.setProps({ text: `BOTTOM OFFSET ${model.touchPreferences?.bottomOffset ?? 0}` });
    rendering.setStyle({ visible: options.onLightingMode !== undefined });
    lighting.setStyle({ visible: options.onLightingMode === undefined });
    const mode = model.lightingMode ?? 'classic', scale = model.worldScale ?? 'native';
    lightingMode.children[0]!.setProps({ value: mode, label: mode.toUpperCase() });
    worldScale.children[0]!.setProps({ value: scale, label: scale.toUpperCase() });
    cap.setProps({ value: model.presentationCap === '30hz' }, false);
    webgl.setProps({ value: model.experimentalWebGL === true }, false);
    fallback.setProps({ text: model.lightingFallbackReason ?? '' });
    for(const [bus,control] of volumes){const value=model.audioVolumes[bus];control.slider.setProps({value},false);control.value.setProps({text:`${Math.round(value*100)}%`});control.mute.setProps({label:value<=.001?'UNMUTE':'MUTE',tone:value<=.001?'danger':'success'});}
    music.setProps({value:model.audioBackground?.music??false},false);sounds.setProps({value:model.audioBackground?.sounds??false},false);nameplates.setProps({value:model.nameplatesVisible??true},false);
    display.setProps({text:`DISPLAY MODE: ${model.fullscreen?'FULLSCREEN':'WINDOWED'}`});
    const value=model.lightingModel??'classic';lighting.children[0]!.setProps({value,label:value==='classic'?'CLASSIC':'UNIFIED V2'});
  };
  updateSettings(options.model);
  return Object.defineProperty(Object.assign(frame,{updateSettings,toggleNameplates(){nameplates.hooks.onKey?.({key:'Enter'},nameplates);},selectSettingsTab(tab:UiSettingsTab){tabs.selectTab(tab);}}),'selectedTab',{get:()=>selected}) as UiSettingsElement;
}
