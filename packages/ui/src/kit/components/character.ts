import { BOOTSTRAP_PROGRESSION } from '@orchard/sim';
import { paintUiCharacterPortrait } from './character-portrait.js';
import type { LoadedAsset } from '../../assets.js';
import { ATTRIBUTE_IDS, skillLevelForExperience, skillExperienceForLevel, type Direction, type PlayerAppearanceSelection } from '@orchard/sim';
import { cycleAppearanceValue, type CharacterEquipmentItem, type CharacterScreenModel } from '../../character-screen.js';
import type { UiRect } from '../../geometry.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFrame } from './frame.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiButton, type UiButtonOptions } from './button.js';
import { uiText } from './text.js';
import { uiMeter } from './meter.js';
import { uiPaperDoll, type UiSlotOptions } from './inventory.js';
import { uiViewport } from './viewport.js';
export interface UiCharacterOptions {
  readonly model: CharacterScreenModel; readonly asset?: (name:string)=>LoadedAsset|undefined; readonly artwork?: UiSlotOptions['artwork'];
  readonly onAppearance: (appearance: PlayerAppearanceSelection) => void | Promise<void>;
  readonly onNavigate?: (page:'character'|'skills'|'statistics')=>void; readonly onClose?:()=>void;
  readonly renderPortrait?: (context:CanvasRenderingContext2D,appearance:PlayerAppearanceSelection,facing:Direction,bounds:UiRect)=>void;
  readonly renderEquipment?: (context: CanvasRenderingContext2D, bounds: UiRect, item: CharacterEquipmentItem) => void;
  readonly layout?:UiStyle;
}
export interface UiCharacterElement extends UiElement { updateCharacter(model:CharacterScreenModel):void; focusCharacter(): void }
function characterButton(options: UiButtonOptions): UiElement {
  const button = uiButton(options);
  return new UiElement({ ...button.hooks, onKey(event, element) {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) return true;
    return button.hooks.onKey?.(event, element) ?? false;
  } });
}
export function uiCharacter(options:UiCharacterOptions):UiCharacterElement {
  let model=options.model, preview=model.appearance, facing=0, detailsKey='';
  let request = 0, live = true;
  let pending: { generation: number; appearance: PlayerAppearanceSelection; baseline: PlayerAppearanceSelection; settled: boolean } | null = null;
  const sameAppearance = (a: PlayerAppearanceSelection, b: PlayerAppearanceSelection) =>
    (Object.keys(a) as (keyof PlayerAppearanceSelection)[]).every(key => a[key] === b[key]);
  const facings:readonly Direction[]=['down','right','up','left'];
  const name=uiText(model.displayName,{role:'header',wrap:true}), details=uiFlex({width:'grow',basis:uiFixed(220),gap:8});
  const portrait=uiViewport({label:'Character preview',layout:{width:uiFixed(100),height:uiFixed(120),shrink:0},render:(context,bounds)=>{if(options.renderPortrait)options.renderPortrait(context,preview,facings[facing]!,bounds);else if(options.asset)paintUiCharacterPortrait(context,preview,facings[facing]!,bounds,options.asset);}});
  const labels=new Map<keyof PlayerAppearanceSelection,UiElement>();
  const refreshAppearance=()=>{for(const [kind,node] of labels) node.setProps({text:preview[kind].replace(/^hair_\d+_/, '').replace(/^farmer_/, '').replaceAll('_',' ').toUpperCase()});portrait.invalidate();};
  const controls=uiFlex({width:'grow',gap:4}, ([['hairKind','HAIR'],['shirtKind','CHEST'],['pantsKind','LEGS'],['shoesKind','BOOTS']] as const).map(([kind,label])=>{
    const value=uiText('',{layout:{width:'grow'},wrap:true});labels.set(kind,value);
    const cycle=(step:-1|1)=>{
      preview=cycleAppearanceValue(preview,model.appearanceCatalog,kind,step);refreshAppearance();
      const generation = ++request;
      pending = { generation, appearance: preview, baseline: model.appearance, settled: false };
      const reject = () => { if (live && pending?.generation === generation) { pending = null; preview = model.appearance; refreshAppearance(); } };
      const accept = () => { if (live && pending?.generation === generation) pending.settled = true; };
      try { const result = options.onAppearance(preview); if (result) void result.then(accept, reject); } catch { reject(); }
    };
    return uiFlex({width:'grow',gap:2},[uiText(label),uiFlex({direction:'row',width:'grow',gap:4},[characterButton({id:`character.appearance.${kind}.previous`,label:'<',ariaLabel:`Previous ${label}`,size:'sm',onPress:()=>cycle(-1)}),value,characterButton({id:`character.appearance.${kind}.next`,label:'>',ariaLabel:`Next ${label}`,size:'sm',onPress:()=>cycle(1)})])]);
  }));
  const equipment=uiPaperDoll({id:'character.equipment',container:'equipment',slotSize:'sm',artwork:options.artwork,
    stack:index=>model.equipment.find(item=>item.slot===index)??null,
    renderContent: options.renderEquipment ? (context, bounds, _stack, index) => {
      const item = model.equipment.find(item => item.slot === index);
      if (item) options.renderEquipment!(context, bounds, item);
    } : undefined,
  });
  // Equipment remains read-only, including slots with no authored insertion kinds.
  if (options.renderEquipment) for (const slot of equipment.children) slot.setDisabled(false);
  const turn=(step:number)=>{facing=(facing+step+4)%4;portrait.invalidate();};
  const base=uiFrame({id:'game.character',blockInput:true,header:{title:'CHARACTER',closable:true,onClose:options.onClose},layout:{width:'grow',height:'grow',...options.layout},children:[
    uiFlex({direction:'row',width:'grow',gap:4,shrink:0},(['character','skills','statistics']as const).map(page=>characterButton({label:page.toUpperCase(),size:'sm',tone:page==='character'?'primary':'neutral',onPress:()=>options.onNavigate?.(page)}))),
    uiScrollArea({id:'character.content',width:'grow',height:'grow'},[uiFlex({direction:'row',wrap:true,width:'grow',gap:8},[
      uiFlex({width:'grow',basis:uiFixed(220),gap:8},[name,uiText('EQUIPMENT'),uiFlex({direction:'row',wrap:true,width:'grow',gap:8},[portrait,equipment]),uiFlex({direction:'row',gap:4},[characterButton({label:'Turn left',size:'sm',onPress:()=>turn(-1)}),characterButton({label:'Turn right',size:'sm',onPress:()=>turn(1)})]),controls]),details,
    ])]),
  ]});
  const frame = new UiElement({ id: 'game.character.host', kind: 'character-screen', children: [base],
    style: { display: 'stack', width: 'grow', height: 'grow', zLayer: 'modal' }, props: { touchScroll: true, singlePointer: true },
    onKeyCapture(event) { if (event.key !== 'Escape') return false; if (!event.repeat) options.onClose?.(); return true; },
    onDispose() { live = false; request++; } });
  const updateCharacter=(next:CharacterScreenModel):void=>{
    if (next.playerId !== model.playerId) { request++; facing = 0; pending = null; }
    if (!pending || sameAppearance(next.appearance, pending.appearance)
      || (pending.settled && !sameAppearance(next.appearance, pending.baseline))) {
      pending = null; preview = next.appearance;
    }
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
    for(const track of ['combat','explorer','farming']as const){const xp=next.tracks.find(entry=>entry.track===track)?.experience??0n,level=skillLevelForExperience(xp, next.progression),start=skillExperienceForLevel(level, next.progression),end=skillExperienceForLevel(level + 1, next.progression);details.append(uiText(`${track.toUpperCase()} LV ${level} · ${level >= (next.progression ?? BOOTSTRAP_PROGRESSION).levelCap?'MAX':`${xp-start} XP`}`)).append(uiMeter({label:track,value:level >= (next.progression ?? BOOTSTRAP_PROGRESSION).levelCap?1:Number(xp-start)/Number(end-start),tone:'success'}));}
    details.append(uiText(`EFFECTS ${next.effects.length?next.effects.join(', ').toUpperCase():'NONE'}`,{wrap:true}));
  };updateCharacter(model);return Object.assign(frame,{updateCharacter,focusCharacter:()=>{
    base.setStyle({ visible: true });
    const find = (node: UiElement): UiElement | undefined => node.id === 'character.appearance.hairKind.next' ? node : node.children.map(find).find(Boolean);
    find(frame)?.requestFocus();
  }});
}
