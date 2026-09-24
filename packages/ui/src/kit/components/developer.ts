import type { UiElement } from '../runtime/element.js';
import type { UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiSlider, uiSwitch } from './forms.js';
import { uiTabs } from './collections.js';

export const UI_DEVELOPER_TABS = ['world','player','quests','render'] as const;
export type UiDeveloperTab = (typeof UI_DEVELOPER_TABS)[number];
export type UiDeveloperAction = 'previous-day'|'next-day'|'weather'|'wind'|'lighting-effects'|'ore-preview'|'render-protocol';
export interface UiDeveloperModel {
  readonly canAdministerWorld: boolean;
  readonly timeFraction: number; readonly dateLabel: string; readonly timeLabel: string;
  readonly weatherMode: string; readonly raining: boolean;
  readonly windDirectionMode?: string; readonly windDirectionLabel?: string;
  readonly lightingEffectsDisabled?: boolean; readonly cellarOrePreview?: boolean;
  readonly dynamicLighting?: boolean; readonly renderProtocolLabel?: string;
}
export interface UiDeveloperOptions {
  readonly model: UiDeveloperModel; readonly tab?: UiDeveloperTab; readonly layout?: UiStyle;
  readonly availableTabs?: readonly UiDeveloperTab[];
  readonly onTab?: (tab: UiDeveloperTab) => void;
  readonly onAction: (action: UiDeveloperAction) => void;
  readonly onTime: (fraction: number) => void; readonly onBack: () => void;
}
export interface UiDeveloperElement extends UiElement {
  updateDeveloper(model: UiDeveloperModel): void;
  selectDeveloperTab(tab: UiDeveloperTab): void;
  readonly selectedTab: UiDeveloperTab;
}
export function uiDeveloper(options: UiDeveloperOptions): UiDeveloperElement {
  const available = options.availableTabs ?? UI_DEVELOPER_TABS;
  let model=options.model,selected=options.tab && available.includes(options.tab) ? options.tab : available[0] ?? 'world';
  const invoke=(action:UiDeveloperAction)=>{if(model.canAdministerWorld)options.onAction(action);};
  const button=(action:UiDeveloperAction,label:string)=>uiButton({id:`developer.${action}`,label,layout:{width:'grow',shrink:0},onPress:()=>invoke(action)});
  const previous=button('previous-day','- DAY'),next=button('next-day','+ DAY');
  const time=uiSlider({id:'developer.time',label:'TIME OF DAY',min:0,max:1,step:.01,onChange:value=>{if(model.canAdministerWorld)options.onTime(value);}});
  const weather=button('weather',''),wind=button('wind',''),date=uiText('',{wrap:true});
  const lighting=uiSwitch({id:'developer.lighting-effects',label:'LIGHTING EFFECTS',layout:{width:'grow',shrink:0},onChange:()=>invoke('lighting-effects')});
  const ore=uiSwitch({id:'developer.ore-preview',label:'CELLAR ORE VEINS',layout:{width:'grow',shrink:0},onChange:()=>invoke('ore-preview')});
  const protocol=button('render-protocol', options.model.renderProtocolLabel ?? 'RENDER PROTOCOL');
  const page=(children:readonly UiElement[])=>uiScrollArea({gap:8},children);
  const pages:Record<UiDeveloperTab,UiElement>={
    world:page([uiFlex({direction:'row',wrap:true,width:'grow',gap:4},[previous,next]),uiText('TIME OF DAY'),time,weather,wind,date]),
    player:page([uiText('PLAYER ADMINISTRATION HAS MOVED TO ORCHARD STUDIO.',{wrap:true})]),
    quests:page([uiText('QUEST ADMINISTRATION HAS MOVED TO ORCHARD STUDIO.',{wrap:true})]),
    render:page([lighting,ore,protocol,...['COLLISION BOUNDS','PATHFINDING OVERLAY'].map(label=>uiSwitch({label,value:false,disabled:true,layout:{width:'grow',shrink:0}}))]),
  };
  const tabs=uiTabs({id:'developer.pages',label:'Developer pages',value:selected,tabs:available.map(id=>({id,label:id.toUpperCase(),content:pages[id]})),onChange:id=>{selected=id as UiDeveloperTab;options.onTab?.(selected);}});
  const frame=uiFrame({id:'game.developer',header:{title:'DEVELOPER TOOLS',closable:true,onClose:options.onBack},layout:{width:'grow',height:'grow',...options.layout},children:[tabs,uiButton({label:'BACK',size:'sm',onPress:options.onBack,layout:{shrink:0}})]});
  const updateDeveloper=(nextModel:UiDeveloperModel)=>{
    model=nextModel;
    for(const control of [previous,next,time,weather,wind,lighting,ore,protocol])control.setDisabled(!model.canAdministerWorld);
    time.setProps({value:model.timeFraction},false);
    weather.setProps({label:`WEATHER ${model.weatherMode.toUpperCase()}`,tone:model.raining?'success':'primary'});
    const direction=(model.windDirectionMode??'auto').toUpperCase();
    wind.setProps({label:`WIND ${direction}${direction==='AUTO'&&model.windDirectionLabel?` (${model.windDirectionLabel})`:''}`});
    date.setProps({text:`${model.dateLabel} · ${model.timeLabel}`});
    protocol.setStyle({ visible: model.renderProtocolLabel !== undefined }); protocol.setProps({ label: model.renderProtocolLabel ?? '' });
    lighting.setProps({value:model.dynamicLighting ?? model.lightingEffectsDisabled!==true},false);ore.setProps({value:model.cellarOrePreview===true},false);
  };
  updateDeveloper(model);
  return Object.defineProperty(Object.assign(frame,{updateDeveloper,selectDeveloperTab(tab:UiDeveloperTab){if(available.includes(tab))tabs.selectTab(tab);}}),'selectedTab',{get:()=>selected}) as UiDeveloperElement;
}
