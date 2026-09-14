import type { StudioCanvasToolContext, StudioCanvasToolSurface } from '../../shell/canvas-tool.js';
import { ui, uiFixed, loadGeneratedAsset, type LoadedAsset, type UiElement } from '@orchard/ui';
import { spriteAnimationVariant } from '@orchard/engine/sprite-variant';
import {
  CharacterStudioModel,
  STUDIO_EQUIPMENT_ITEMS,
  equipmentPalette,
  IRON_RAMP,
  studioActionAnimation,
  studioToolAnimation,
  studioFlips,
  type StudioAction,
  type StudioEquipmentSlot,
} from './model.js';

const ACTIONS: readonly StudioAction[] = ['swing_sword', 'swing_pickaxe', 'swing_axe', 'ranged_weapon'];
const FACINGS = ['down', 'left', 'up', 'right'] as const;
const SLOTS: readonly StudioEquipmentSlot[] = ['head', 'body', 'legs'];
const CANVAS_ARMOUR_ASSETS = Object.freeze([
  'wearable_cf_plate_helmet', 'wearable_cf_heavy_plate_helmet',
  'wearable_cf_plate_chest', 'wearable_cf_plate_legs',
] as const);
const CANVAS_TOOL_ASSETS = Object.freeze([
  'tool_cf_iron_sword_action', 'tool_cf_iron_pickaxe_action',
  'tool_cf_iron_axe_action', 'tool_cf_wooden_bow_action',
] as const);

/** Total generated rig coverage retained by the canvas-native Character tool. */
export function characterRigAssetIds(): readonly string[] {
  const catalogs: readonly (readonly PlayerRigAssetEntry[])[] = [
    PLAYER_RIG_HAIR_ASSETS, PLAYER_RIG_PANTS_ASSETS, PLAYER_RIG_SHIRT_ASSETS, PLAYER_RIG_SHOE_ASSETS,
  ];
  return Object.freeze([
    ...Object.values(PLAYER_RIG_CORE_ASSETS).flat(),
    ...catalogs.flatMap((entries) => entries.flatMap(([, ...assets]) => assets)),
    ...CANVAS_ARMOUR_ASSETS,
    ...CANVAS_TOOL_ASSETS,
  ]);
}

export function characterRigAudit(): readonly string[] {
  const missing = characterRigAssetIds().filter((id) => id.trim().length === 0);
  const catalogs: readonly (readonly PlayerRigAssetEntry[])[] = [
    PLAYER_RIG_HAIR_ASSETS, PLAYER_RIG_PANTS_ASSETS, PLAYER_RIG_SHIRT_ASSETS, PLAYER_RIG_SHOE_ASSETS,
  ];
  for (const entries of catalogs) for (const [appearance] of entries) {
    try { playerRigAssetEntry(entries, appearance); } catch { missing.push(appearance); }
  }
  return Object.freeze(missing);
}

interface CharacterCanvasState {
  readonly model: CharacterStudioModel;
  slot: StudioEquipmentSlot;
  assets: Map<string, LoadedAsset>;
  pending: Set<string>;
  errors: Map<string, string>;
  variants: Map<string, LoadedAsset>;
  startTime: number;
  disposed: boolean;
  playing: boolean;
  scale: number;
}

export function buildCharacterCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const state = context.controller.toolState<CharacterCanvasState>('character-canvas', () => ({
    model: new CharacterStudioModel(), slot: 'head', assets:new Map(), pending:new Set(), errors:new Map(), variants:new Map(), startTime:0, disposed:false,playing:true,scale:3,
  }));
  const snapshot = state.model.snapshot();
  const request=(name:string)=>{
    if(state.pending.has(name)||state.assets.has(name)||state.errors.has(name)||typeof window==='undefined')return;
    state.pending.add(name);
    void loadGeneratedAsset(name).then(asset=>{if(!state.disposed)state.assets.set(name,asset);}).catch((error:unknown)=>{
      if(!state.disposed)state.errors.set(name,error instanceof Error?error.message:String(error));
    }).finally(()=>{state.pending.delete(name);if(!state.disposed)context.invalidate();});
  };
  const selectAction=(action:StudioAction)=>{state.model.selectAction(action);state.startTime=performance.now();context.invalidate();};
  const controls=ui.flex({width:'grow',gap:4},[
    ui.select({id:'character-action',label:'Action',value:snapshot.action,options:ACTIONS.map(action=>({value:action,label:action.replaceAll('_',' ').replace(/^./u,value=>value.toUpperCase())})),onChange:action=>selectAction(action as StudioAction)}),
    ui.grid({columns:2,gap:2,rowHeight:uiFixed(24)},FACINGS.map(facing=>ui.button({id:`character-facing-${facing}`,label:facing.replace(/^./u,char=>char.toUpperCase()),tone:snapshot.facing===facing?'success':'primary',onPress:()=>{state.model.face(facing);context.invalidate();}}))),
    ui.select({id:'character-slot',label:'Equipment slot',value:state.slot,options:SLOTS.map(slot=>({value:slot,label:slot.replace(/^./u,char=>char.toUpperCase())})),onChange:slot=>{state.slot=slot as StudioEquipmentSlot;context.invalidate();}}),
    ui.list({id:'character-equipment',label:'Equipment',items:STUDIO_EQUIPMENT_ITEMS.filter(({slot})=>slot===state.slot),key:item=>item.id,rowHeight:uiFixed(32),layout:{width:'grow',height:uiFixed(192),shrink:0},
      render:item=>ui.button({id:`character-equipment-${item.id}`,label:item.name,tone:snapshot.equipment[state.slot]===item.id?'success':'primary',layout:{width:'grow'},onPress:()=>{state.model.equip(item.id);context.invalidate();}}),
    }),
  ]);
  const equipped=state.model.equipped(),animation=studioActionAnimation(snapshot.action,snapshot.facing),flipX=studioFlips(snapshot.facing);
  const names={plate_helmet:'wearable_cf_plate_helmet',heavy_plate_helmet:'wearable_cf_heavy_plate_helmet',plate_chest:'wearable_cf_plate_chest',plate_legs:'wearable_cf_plate_legs'} as const;
  const tool=CANVAS_TOOL_ASSETS[ACTIONS.indexOf(snapshot.action)]!;
  const sprite=(name:string,animation:string,palette?:readonly string[]):UiElement=>{
    request(name);const source=state.assets.get(name);
    if(!source)return ui.text(state.errors.get(name)??`Loading ${name}`);
    const key=JSON.stringify([name,animation,flipX,palette]);let asset=state.variants.get(key);
    if(!asset){
      asset=spriteAnimationVariant(source,animation,{flipX,palette:palette?new Map(IRON_RAMP.map((color,index)=>[color,palette[index]??color])):undefined});
      state.variants.set(key,asset);while(state.variants.size>24)state.variants.delete(state.variants.keys().next().value!);
    }
    return ui.sprite(asset,{label:name,animation,integerScale:state.scale,playing:state.playing,loop:true,startTime:state.startTime,layout:{width:'grow',height:'grow'}});
  };
  const layers:UiElement[]=[sprite(PLAYER_RIG_CORE_ASSETS.base[2],animation),
    ...[equipped[2],equipped[1],equipped[0]].map(item=>sprite(names[item.visualFamily],animation,equipmentPalette(item))),
    sprite(PLAYER_RIG_CORE_ASSETS.hands[2],animation)];
  const toolSprite=sprite(tool,studioToolAnimation(snapshot.action,snapshot.facing));
  if(snapshot.facing==='up')layers.unshift(toolSprite);else layers.push(toolSprite);
  const inspector=ui.flex({width:'grow',gap:8},[
    ...controls.children.slice(2),
    ui.separator(),
    ...equipped.map(item=>ui.button({id:`character-loadout-${item.slot}`,label:item.name,tone:state.slot===item.slot?'success':'primary',layout:{width:'grow'},onPress:()=>{state.slot=item.slot;context.invalidate();}})),
  ]);
  controls.replaceChildren([
    ...controls.children.slice(0,2),
    ui.checkbox({id:'character-playing',label:'Animate',value:state.playing,onChange:value=>{state.playing=value;state.startTime=performance.now();context.invalidate();}}),
    ui.select({id:'character-scale',label:'Preview size',value:String(state.scale),options:[1,2,3,4,6].map(value=>({value:String(value),label:`${value}x`})),onChange:value=>{state.scale=Number(value);context.invalidate();}}),
  ]);
  const workspace=ui.stack({width:'grow',height:'grow'},[
    ui.viewport({label:'Character preview canvas',background:'checkerboard',render:()=>{}}),
    layers.every(layer=>layer.kind==='sprite')?ui.stack({width:'grow',height:'grow'},layers):ui.flex({width:'grow',height:'grow',gap:4},[ui.loadingSpinner(),...layers.filter(layer=>layer.kind==='text')]),
  ]);
  context.controller.validation.setIssues([
    ...characterRigAudit().map(id=>({id:`rig:${id}`,severity:'error' as const,message:`Missing rig asset ${id}`})),
    ...[...state.errors].map(([name,message])=>({id:`rig-load:${name}`,severity:'error' as const,message})),
  ]);
  return {kit:{controls,workspace,inspector},lifecycle:{key:'character-canvas',dispose:()=>{
    state.disposed=true;state.variants.clear();state.assets.clear();context.controller.releaseToolState('character-canvas',state);
  }}};
}

import {
  PLAYER_RIG_CORE_ASSETS,
  PLAYER_RIG_HAIR_ASSETS,
  PLAYER_RIG_PANTS_ASSETS,
  PLAYER_RIG_SHIRT_ASSETS,
  PLAYER_RIG_SHOE_ASSETS,
  playerRigAssetEntry,
  type PlayerRigAssetEntry,
} from '@orchard/engine/player-rig-assets';
