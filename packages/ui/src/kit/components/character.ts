import { BOOTSTRAP_PROGRESSION } from '@orchard/sim';
import { paintUiCharacterPortrait } from './character-portrait.js';
import type { LoadedAsset } from '../../assets.js';
import { ATTRIBUTE_IDS, skillLevelForExperience, skillExperienceForLevel, type Direction, type PlayerAppearanceSelection } from '@orchard/sim';
import { cycleAppearanceValue, type CharacterEquipmentItem, type CharacterScreenModel } from '../../character-screen.js';
import type { UiRect } from '../../geometry.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiGlyphButton } from './window.js';
import { drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import { uiBookBar, uiGameBook, uiLedgerRow, uiPageLabel, type UiGameBookChapter } from './character-book.js';
import { uiText } from './text.js';
import { uiPaperDoll, type UiSlotOptions } from './inventory.js';
import { uiViewport } from './viewport.js';
export interface UiCharacterOptions {
  readonly onKey?: (key: string, repeat: boolean) => boolean;
  readonly model: CharacterScreenModel; readonly asset?: (name:string)=>LoadedAsset|undefined; readonly artwork?: UiSlotOptions['artwork'];
  readonly onAppearance: (appearance: PlayerAppearanceSelection) => void | Promise<void>;
  readonly onNavigate?: (chapter: UiGameBookChapter)=>void; readonly onClose?:()=>void;
  /** Leaf size of the book spread (see uiGameBookPage). */
  readonly page?: { readonly width: number; readonly height: number };
  readonly renderPortrait?: (context:CanvasRenderingContext2D,appearance:PlayerAppearanceSelection,facing:Direction,bounds:UiRect)=>void;
  readonly renderEquipment?: (context: CanvasRenderingContext2D, bounds: UiRect, item: CharacterEquipmentItem) => void;
  readonly layout?:UiStyle;
}
export interface UiCharacterElement extends UiElement { updateCharacter(model:CharacterScreenModel):void; focusCharacter(): void; setPage(page: { readonly width: number; readonly height: number }): void }
const TRACKS = [['farming', 'Farming', 'Farmer'], ['explorer', 'Explorer', 'Explorer'], ['combat', 'Combat', 'Fighter']] as const;
const ATTRIBUTE_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intellect', wis: 'Wisdom', cha: 'Charisma' } as const;
const WARDROBE = [['hairKind', 'HAIR'], ['shirtKind', 'CHEST'], ['pantsKind', 'LEGS'], ['shoesKind', 'BOOTS']] as const;
const INK = '#3f2832', MUTED = '#9e5f45';
function wardrobeLabel(value: string): string { return value.replace(/^hair_\d+_/, '').replace(/^farmer_/, '').replaceAll('_', ' ').toUpperCase(); }
/** A wardrobe value in a stepper: its part in small muted caps over the current choice. The element's label is the choice. */
function wardrobeValue(caption: string): UiElement {
  return new UiElement({ kind: 'wardrobe-value', label: '', style: { width: 'grow', height: uiFixed(20) },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      drawPixelText(context, art.pixel, caption, r.x + Math.floor((r.width - measurePixelText(caption, 1, art.pixel.font)) / 2), r.y + 1, { color: MUTED });
      const value = fitPixelText(element.label, r.width, 1, art.pixel.font);
      drawPixelText(context, art.pixel, value, r.x + Math.floor((r.width - measurePixelText(value, 1, art.pixel.font)) / 2), r.y + 11, { color: INK });
    } });
}
/** Character chapter of the player's book: name, level and paper doll with turn and wardrobe on the left leaf;
 * attributes, vitals, professions and effects on the right. */
export function uiCharacter(options:UiCharacterOptions):UiCharacterElement {
  let model=options.model, preview=model.appearance, facing=0, detailsKey='';
  let request = 0, live = true;
  let pending: { generation: number; appearance: PlayerAppearanceSelection; baseline: PlayerAppearanceSelection; settled: boolean } | null = null;
  const sameAppearance = (a: PlayerAppearanceSelection, b: PlayerAppearanceSelection) =>
    (Object.keys(a) as (keyof PlayerAppearanceSelection)[]).every(key => a[key] === b[key]);
  const facings:readonly Direction[]=['down','right','up','left'];
  const topTrack = (next: CharacterScreenModel) => TRACKS.map(([track, , title]) => ({ title, level: skillLevelForExperience(next.tracks.find(entry => entry.track === track)?.experience ?? 0n, next.progression) }))
    .reduce((best, entry) => entry.level > best.level ? entry : best);
  const heading = new UiElement({ kind: 'page-heading', label: model.displayName, style: { height: uiFixed(30), shrink: 0, alignSelf: 'stretch' },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, top = topTrack(model);
      const name = fitPixelText(model.displayName, r.width - 4, 1, art.pixel.headerFont), caption = `Level ${top.level} ${top.title}`;
      drawPixelText(context, art.pixel, name, r.x + Math.floor((r.width - measurePixelText(name, 1, art.pixel.headerFont)) / 2), r.y, { font: 'header', color: INK });
      drawPixelText(context, art.pixel, caption, r.x + Math.floor((r.width - measurePixelText(caption, 1, art.pixel.font)) / 2), r.y + 17, { color: MUTED });
      context.fillStyle = '#e4a672'; context.fillRect(r.x + 8, r.y + r.height - 2, r.width - 16, 1);
    } });
  const details=uiFlex({direction:'column',gap:4,alignSelf:'stretch'});
  const portrait=uiViewport({label:'Character preview',render:(context,bounds)=>{if(options.renderPortrait)options.renderPortrait(context,preview,facings[facing]!,bounds);else if(options.asset)paintUiCharacterPortrait(context,preview,facings[facing]!,bounds,options.asset);}});
  const labels=new Map<keyof PlayerAppearanceSelection,UiElement>();
  const refreshAppearance=()=>{for(const [kind,node] of labels) { node.label=wardrobeLabel(preview[kind]); node.invalidate(); } portrait.invalidate();};
  const stepper=([kind,label]:(typeof WARDROBE)[number])=>{
    const value=wardrobeValue(label);labels.set(kind,value);
    const cycle=(step:-1|1)=>{
      preview=cycleAppearanceValue(preview,model.appearanceCatalog,kind,step);refreshAppearance();
      const generation = ++request;
      pending = { generation, appearance: preview, baseline: model.appearance, settled: false };
      const reject = () => { if (live && pending?.generation === generation) { pending = null; preview = model.appearance; refreshAppearance(); } };
      const accept = () => { if (live && pending?.generation === generation) pending.settled = true; };
      try { const result = options.onAppearance(preview); if (result) void result.then(accept, reject); } catch { reject(); }
    };
    return uiFlex({direction:'row',gap:2,align:'center',width:'grow',basis:uiFixed(64)},[
      characterGlyph(`character.appearance.${kind}.previous`,'glyph.previous',`Previous ${label}`,()=>cycle(-1)),value,
      characterGlyph(`character.appearance.${kind}.next`,'glyph.next',`Next ${label}`,()=>cycle(1))]);
  };
  // The wearer stands in the paper doll's own well, between the armour and accessory columns.
  const equipment=uiPaperDoll({id:'character.equipment',container:'equipment',slotSize:'sm',artwork:options.artwork,portrait,
    stack:index=>model.equipment.find(item=>item.slot===index)??null,
    renderContent: options.renderEquipment ? (context, bounds, _stack, index) => {
      const item = model.equipment.find(item => item.slot === index);
      if (item) options.renderEquipment!(context, bounds, item);
    } : undefined,
  });
  // Equipment remains read-only, including slots with no authored insertion kinds.
  const slots = (node: UiElement): UiElement[] => node.kind === 'slot' ? [node] : node.children.flatMap(slots);
  if (options.renderEquipment) for (const slot of slots(equipment)) slot.setDisabled(false);
  const turn=(step:number)=>{facing=(facing+step+4)%4;portrait.invalidate();};
  const left=uiScrollArea({id:'character.figure',width:'grow',height:'grow',scrollStyle:'wood',gap:4,align:'center'},[heading,equipment,
    uiFlex({direction:'row',gap:4,align:'center'},[characterGlyph('character.turn.left','glyph.previous','Turn left',()=>turn(-1)),uiText('Turn',{role:'caption'}),characterGlyph('character.turn.right','glyph.next','Turn right',()=>turn(1))]),
    uiFlex({direction:'row',wrap:true,gap:4,alignSelf:'stretch'},WARDROBE.map(stepper))]);
  const right=uiScrollArea({id:'character.content',width:'grow',height:'grow',scrollStyle:'wood'},[details]);
  const book=uiGameBook({id:'game.character',active:'character',left,right,page:options.page??{width:200,height:248},onNavigate:options.onNavigate,onClose:options.onClose});
  const frame = new UiElement({ id: 'game.character.host', kind: 'character-screen', children: [book],
    style: { display: 'flex', justify: 'center', align: 'center', width: 'grow', height: 'grow', zLayer: 'modal' }, props: { touchScroll: true, singlePointer: true },
    onKeyCapture(event) { if (options.onKey?.(event.key, event.repeat === true)) return true; if (event.key !== 'Escape') return false; if (!event.repeat) options.onClose?.(); return true; },
    onDispose() { live = false; request++; } });
  const updateCharacter=(next:CharacterScreenModel):void=>{
    if (next.playerId !== model.playerId) { request++; facing = 0; pending = null; }
    if (!pending || sameAppearance(next.appearance, pending.appearance)
      || (pending.settled && !sameAppearance(next.appearance, pending.baseline))) {
      pending = null; preview = next.appearance;
    }
    model=next;heading.label=next.displayName;heading.invalidate();refreshAppearance();equipment.invalidate();
    const key=JSON.stringify(next,(_key,value)=>typeof value==='bigint'?value.toString():value);if(key===detailsKey)return;detailsKey=key;
    for(const child of [...details.children])child.dispose();
    details.append(uiPageLabel('ATTRIBUTES'));
    for(const id of ATTRIBUTE_IDS){
      const base=next.baseAttributes[id],resolved=next.resolvedAttributes[id],delta=resolved-base;
      details.append(uiLedgerRow(ATTRIBUTE_NAMES[id],String(resolved),delta?{delta,tooltip:`${ATTRIBUTE_NAMES[id]} ${base} base, ${delta>0?'+':''}${delta} from equipment`}:{}));
    }
    details.append(uiPageLabel('VITALS'));
    for(const [label,current,max,colour] of [['Health',next.health,next.maxHealth,'red'],['Mana',next.mana,next.maxMana,'blue'],['Vigour',next.vigour,next.maxVigour,'green']]as const)
      details.append(uiBookBar(label,Math.max(0,Math.ceil(current/100)),Math.max(1,Math.ceil(max/100)),colour));
    details.append(uiPageLabel('PROFESSIONS'));
    for(const [track,label] of TRACKS){
      const xp=next.tracks.find(entry=>entry.track===track)?.experience??0n,level=skillLevelForExperience(xp, next.progression),start=skillExperienceForLevel(level, next.progression),end=skillExperienceForLevel(level + 1, next.progression);
      const capped=level>=(next.progression??BOOTSTRAP_PROGRESSION).levelCap;
      details.append(uiBookBar(label,capped?1:Number(xp-start),capped?1:Math.max(1,Number(end-start)),'gold',capped?`Lv ${level} Max`:`Lv ${level}`));
    }
    details.append(uiPageLabel('EFFECTS')).append(uiText(next.effects.length?next.effects.join(', '):'None',{wrap:true,layout:{alignSelf:'stretch'}}));
  };updateCharacter(model);return Object.assign(frame,{updateCharacter,setPage:book.setBookPage,focusCharacter:()=>{
    book.setStyle({ visible: true });
    const find = (node: UiElement): UiElement | undefined => node.id === 'character.appearance.hairKind.next' ? node : node.children.map(find).find(Boolean);
    find(frame)?.requestFocus();
  }});
}
/** Glyph stepper for the book pages; ignores key auto-repeat like the rest of the character controls. */
function characterGlyph(id: string, glyph: string, label: string, onPress: () => void): UiElement {
  const button = uiGlyphButton({ id, glyph, label, chrome: 'none', onPress });
  return new UiElement({ ...button.hooks, onKey(event, element) {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) return true;
    return button.hooks.onKey?.(event, element) ?? false;
  } });
}
