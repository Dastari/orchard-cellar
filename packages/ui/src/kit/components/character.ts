import { paintUiCharacterPortrait } from './character-portrait.js';
import type { LoadedAsset } from '../../assets.js';
import { ATTRIBUTE_IDS, skillLevelForExperience, skillExperienceForLevel, type Direction, type PlayerAppearanceSelection } from '@orchard/sim';
import { cycleAppearanceValue, type CharacterScreenModel } from '../../character-screen.js';
import type { UiRect } from '../../geometry.js';
import type { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiButton } from './button.js';
import { uiText } from './text.js';
import { uiMeter } from './meter.js';
import { uiPaperDoll, type UiSlotOptions } from './inventory.js';
import { uiViewport } from './viewport.js';
export interface UiCharacterOptions {
  readonly model: CharacterScreenModel; readonly asset?: (name:string)=>LoadedAsset|undefined; readonly artwork?: UiSlotOptions['artwork'];
  readonly onAppearance: (appearance: PlayerAppearanceSelection) => void;
  readonly onNavigate?: (page:'character'|'skills'|'statistics')=>void; readonly onClose?:()=>void;
  readonly renderPortrait?: (context:CanvasRenderingContext2D,appearance:PlayerAppearanceSelection,facing:Direction,bounds:UiRect)=>void;
  readonly layout?:UiStyle;
}
export interface UiCharacterElement extends UiElement { updateCharacter(model:CharacterScreenModel):void }
export function uiCharacter(options:UiCharacterOptions):UiCharacterElement {
  let model=options.model, preview=model.appearance, facing=0, detailsKey='';
  const facings:readonly Direction[]=['down','right','up','left'];
  const name=uiText(model.displayName,{role:'header'}), details=uiFlex({width:'grow',basis:uiFixed(220),gap:8});
  const portrait=uiViewport({label:'Character preview',layout:{width:uiFixed(100),height:uiFixed(120),shrink:0},render:(context,bounds)=>{if(options.renderPortrait)options.renderPortrait(context,preview,facings[facing]!,bounds);else if(options.asset)paintUiCharacterPortrait(context,preview,facings[facing]!,bounds,options.asset);}});
  const labels=new Map<keyof PlayerAppearanceSelection,UiElement>();
  const refreshAppearance=()=>{for(const [kind,node] of labels) node.setProps({text:preview[kind].replace(/^hair_\d+_/, '').replace(/^farmer_/, '').replaceAll('_',' ').toUpperCase()});portrait.invalidate();};
  const controls=uiFlex({width:'grow',gap:4}, ([['hairKind','HAIR'],['shirtKind','CHEST'],['pantsKind','LEGS'],['shoesKind','BOOTS']] as const).map(([kind,label])=>{
    const value=uiText('',{layout:{width:'grow'},wrap:true});labels.set(kind,value);
    const cycle=(step:-1|1)=>{preview=cycleAppearanceValue(preview,kind,step);refreshAppearance();options.onAppearance(preview);};
    return uiFlex({width:'grow',gap:2},[uiText(label),uiFlex({direction:'row',width:'grow',gap:4},[uiButton({label:'<',ariaLabel:`Previous ${label}`,size:'sm',onPress:()=>cycle(-1)}),value,uiButton({label:'>',ariaLabel:`Next ${label}`,size:'sm',onPress:()=>cycle(1)})])]);
  }));
  const equipment=uiPaperDoll({container:'equipment',slotSize:'sm',artwork:options.artwork,stack:index=>model.equipment.find(item=>item.slot===index)??null});
  const turn=(step:number)=>{facing=(facing+step+4)%4;portrait.invalidate();};
  const frame=uiFrame({id:'game.character',header:{title:'CHARACTER',closable:true,onClose:options.onClose},resizable:{handles:'all',min:{width:160,height:160}},layout:{width:'grow',height:'grow',...options.layout},children:[
    uiFlex({direction:'row',width:'grow',gap:4,shrink:0},(['character','skills','statistics']as const).map(page=>uiButton({label:page.toUpperCase(),size:'sm',tone:page==='character'?'primary':'neutral',onPress:()=>options.onNavigate?.(page)}))),
    uiScrollArea({width:'grow',height:'grow'},[uiFlex({direction:'row',wrap:true,width:'grow',gap:8},[
      uiFlex({width:'grow',basis:uiFixed(220),gap:8},[name,uiText('EQUIPMENT'),uiFlex({direction:'row',wrap:true,width:'grow',gap:8},[portrait,equipment]),uiFlex({direction:'row',gap:4},[uiButton({label:'Turn left',size:'sm',onPress:()=>turn(-1)}),uiButton({label:'Turn right',size:'sm',onPress:()=>turn(1)})]),controls]),details,
    ])]),
  ]});
  const updateCharacter=(next:CharacterScreenModel):void=>{
    if(next.playerId!==model.playerId||Object.keys(preview).every(key=>preview[key as keyof PlayerAppearanceSelection]===next.appearance[key as keyof PlayerAppearanceSelection]))preview=next.appearance;
    model=next;name.setProps({text:next.displayName.toUpperCase()});refreshAppearance();equipment.invalidate();
    const key=JSON.stringify(next,(_key,value)=>typeof value==='bigint'?value.toString():value);if(key===detailsKey)return;detailsKey=key;
    for(const child of [...details.children])child.dispose();
    details.append(uiText('VITALS',{role:'header'}));
    for(const [label,current,max,tone] of [['HEALTH',next.health,next.maxHealth,'danger'],['MANA',next.mana,next.maxMana,'info'],['VIGOUR',next.vigour,next.maxVigour,'success']]as const){
      details.append(uiText(`${label} ${Math.max(0,Math.ceil(current/100))} / ${Math.max(1,Math.ceil(max/100))}`)).append(uiMeter({label,value:max>0?current/max:0,tone}));
    }
    details.append(uiText('ATTRIBUTES',{role:'header'}));
    const names={str:'STRENGTH',dex:'DEXTERITY',con:'CONSTITUTION',int:'INTELLIGENCE',wis:'WISDOM',cha:'CHARISMA'};
    for(const id of ATTRIBUTE_IDS){const base=next.baseAttributes[id],resolved=next.resolvedAttributes[id];details.append(uiText(`${names[id]} ${base===resolved?base:`${base} > ${resolved}`}`));}
    details.append(uiText('EXPERIENCE',{role:'header'}));
    for(const track of ['combat','explorer','farming']as const){const xp=next.tracks.find(entry=>entry.track===track)?.experience??0n,level=skillLevelForExperience(xp),start=skillExperienceForLevel(level),end=skillExperienceForLevel(Math.min(50,level+1));details.append(uiText(`${track.toUpperCase()} LV ${level} · ${level>=50?'MAX':`${xp-start} XP`}`)).append(uiMeter({label:track,value:level>=50?1:Number(xp-start)/Number(end-start),tone:'success'}));}
    details.append(uiText(`EFFECTS ${next.effects.length?next.effects.join(', ').toUpperCase():'NONE'}`,{wrap:true}));
  };updateCharacter(model);return Object.assign(frame,{updateCharacter});
}
