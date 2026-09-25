import { describe,expect,it,vi } from 'vitest';
import { bootstrapContentRegistry,SKILL_NODE_DEFINITIONS } from '@orchard/sim';
import { OverworldUi,type OverworldUiCallbacks,type OverworldUiItemArt,type OverworldUiModel } from './overworld-ui.js';
import type { UiSkin } from './skin.js';
import type { PixelUi } from './pixel-ui.js';
import type { UiKitArt } from './kit/components/art.js';
import { GameFeedback } from './game-host/feedback.js';
function callbacks(): OverworldUiCallbacks {
  return {
    selectHotbar: vi.fn(),
    setTimeFraction: vi.fn(),
    shiftDay: vi.fn(),
    cycleWeather: vi.fn(),
    cycleWindDirection: vi.fn(),
    toggleLightingEffects: vi.fn(),
    toggleCellarOrePreview: vi.fn(),
    setQuestPinned: vi.fn(),
    abandonQuest: vi.fn(),
    setAppearance: vi.fn(),
    purchaseSkillNode: vi.fn(),
    resetSkillTree: vi.fn(),
    dismissSkillPointNotice: vi.fn(),
    setAudioVolume: vi.fn(),
    setAudioBackground: vi.fn(),
    setNameplatesVisible: vi.fn(),
    setLightingModel: vi.fn(),
    setLightingQuality: vi.fn(),
    signOut: vi.fn(),
    quitToTitle: vi.fn(),
    startDelve: vi.fn(),
    exitDelve: vi.fn(),
    toggleFullscreen: vi.fn(),
    checkForClientUpdate: vi.fn(),
    applyClientUpdate: vi.fn(),
    toggleOnlinePlayers: vi.fn(),
    moveInventoryItem: vi.fn(),
    quickMoveInventoryItem: vi.fn(),
    quickMoveAllInventoryItems: vi.fn(),
    distributeInventoryItem: vi.fn(),
    inventoryCursorClick: vi.fn(),
    sortInventoryContainer: vi.fn(),
    inventoryCursorQuickCraft: vi.fn(),
    inventoryCursorPickupAll: vi.fn(),
    inventoryCursorSwapHotbar: vi.fn(),
    dropInventoryCursor: vi.fn(),
    throwMenuItem: vi.fn(),
    returnInventoryCursor: vi.fn(),
    craftInventoryRecipe: vi.fn(),
    ghostFillCraftingRecipe: vi.fn(),
    closeCrafting: vi.fn(),
    closeChest: vi.fn(),
    closePlaceable: vi.fn(),
  };
}


function fixture(touch=false) {
 const commands=callbacks();const ui=new OverworldUi({} as UiSkin,{} as PixelUi,{} as OverworldUiItemArt,commands);
 const model:OverworldUiModel={width:320,height:180,connected:true,playerCount:1,selectedSlot:0,inventory:[],hasBackpack:false,
 audioVolumes:{master:1,music:1,sfx:1},canAdministerWorld:false,dateLabel:'SPRING 1',timeLabel:'06:00',timeFraction:0,raining:false,weatherMode:'auto',
 prompt:'[E] USE',toast:'FULL INVENTORY',toastKind:'failure',touchControls:touch,contentRegistry:bootstrapContentRegistry(),
 skills:{nodes:SKILL_NODE_DEFINITIONS,tracks:[],ranks:[],balanceBronze:0n},skillPointNotice:{track:'farming',points:1}};
 ui.update(model);ui.enableRetainedFeedback();return {ui,commands,model};
}
describe('production feedback parent',()=>{
 it('retires the old notice pointer path while preserving the K shortcut authority',()=>{
  const {ui,commands}=fixture();ui.enableRetainedHud({} as UiKitArt);ui.enableRetainedCharacter({} as UiKitArt);
  const old=ui.skillPointNoticeLayout()!;
  ui.pointerDown({x:old.frame.x+5,y:old.frame.y+5},0);
  expect(commands.dismissSkillPointNotice).not.toHaveBeenCalled();expect(ui.openWindow).toBeNull();
  expect(ui.handleKeyDown('KeyK',false)).toBe(true);expect(ui.openWindow).toBe('skills');expect(ui.activeSkillTrack).toBe('farming');
  expect(commands.dismissSkillPointNotice).toHaveBeenCalledOnce();ui.disposeRetainedHud();ui.disposeRetainedCharacter();
 });
 it('projects the prompt once with the adopted HUD and preserves toast failure tone',()=>{
  const {ui}=fixture();ui.enableRetainedHud({} as UiKitArt);
  expect(ui.feedbackHud(0)).toMatchObject({prompt:{text:'[E] USE'},tooltip:null,toast:{text:'FULL INVENTORY',tone:'danger'}});
  ui.openWindow='inventory';expect(ui.feedbackHud(0).prompt).toBeNull();ui.disposeRetainedHud();
 });
 it('names the hovered slot just above it, never over the window hotbar (owner item 7)',()=>{
  const {ui}=fixture(false);ui.openWindow='inventory';
  vi.spyOn(ui,'tooltipText').mockReturnValue('LANTERN');
  const access=ui as unknown as {hoveredItem:()=>unknown;retainedMenus:unknown};
  vi.spyOn(access,'hoveredItem').mockReturnValue({itemKind:'lantern',quantity:1});
  const slot={x:200,y:150,width:28,height:31};
  access.retainedMenus={active:true,slotAt:()=>({ref:{container:'hotbar',index:5},rect:slot})};
  const hud=ui.feedbackHud(0);
  expect(hud.tooltip?.anchor).toEqual({x:214,y:146});
  access.retainedMenus=null;vi.restoreAllMocks();
 });
 it('shows the hovered slot\'s full details below it when they do not fit above, never over the slot',()=>{
  // The iron sword's details need about 80px. A slot near the top of a short screen has far less room above it.
  const render=(width:number,height:number,slot:{x:number;y:number;width:number;height:number})=>{
   const {ui,model}=fixture(false);ui.update({...model,width,height});ui.openWindow='inventory';
   vi.spyOn(ui,'tooltipText').mockReturnValue('IRON SWORD');
   const access=ui as unknown as {hoveredItem:()=>unknown;retainedMenus:unknown};
   vi.spyOn(access,'hoveredItem').mockReturnValue({itemKind:'sword',quantity:1,durability:70});
   access.retainedMenus={active:true,slotAt:()=>({ref:{container:'backpack',index:0},rect:slot})};
   ui.feedbackHud(0);const hud=ui.feedbackHud(601);expect(hud.tooltip?.text).toContain('DURABILITY 70');
   const host=new GameFeedback({} as UiKitArt,{onOpenSkillNotice(){},onDismissSkillNotice(){}});
   host.setBounds({worldWidth:width,worldHeight:height,hudWidth:width,hudHeight:height});
   host.update({sessionKey:'test',world:{nameplates:[],feedback:[],speech:[],hint:null,fishing:null},hud:{...hud,notice:null}});
   const rect={...host.roots.hud.entries().find(e=>e.element.id==='game.feedback.tooltip.frame')!.element.rect};
   host.dispose();access.retainedMenus=null;vi.restoreAllMocks();return rect;
  };
  for(const [width,height,y] of [[480,270,60],[320,180,30]] as const){
   const slot={x:100,y,width:28,height:31};
   // The same details with plenty of room above: their natural height, drawn just above the slot.
   const low={...slot,y:height-40},full=render(width,height,low);
   expect(full.height).toBeGreaterThanOrEqual(70);expect(full.y+full.height).toBe(low.y-4);
   const rect=render(width,height,slot);
   expect(rect.height,`${width}x${height}`).toBe(full.height);
   expect(rect.y,`${width}x${height}`).toBe(slot.y+slot.height+4);
   expect(rect.y+rect.height).toBeLessThanOrEqual(height);
  }
 });
 it('keeps deliberate equipment details above the compact anchor and touch labels below its hotbar',()=>{
  for(const touch of [false,true]){
   const {ui}=fixture(touch);ui.openWindow='inventory';
   // Existing inventory authority supplies hovered item/text. Exercise the real
   // dwell, equipment-description projection, parent anchor and shared geometry.
   vi.spyOn(ui,'tooltipText').mockReturnValue('IRON SWORD');
   const access=ui as unknown as {hoveredItem:()=>{itemKind:string;quantity:number;durability:number};touchInventoryTooltipRect:()=>{y:number;height:number}};
   vi.spyOn(access,'hoveredItem').mockReturnValue({itemKind:'sword',quantity:1,durability:70});
   const base=access.touchInventoryTooltipRect();
   const first=ui.feedbackHud(0);expect(first.tooltip?.text).toBe('IRON SWORD');
   const hud=ui.feedbackHud(601);expect(hud.tooltip).not.toBeNull();
   const host=new GameFeedback({} as UiKitArt,{onOpenSkillNotice(){},onDismissSkillNotice(){}});
   host.setBounds({worldWidth:320,worldHeight:180,hudWidth:320,hudHeight:180});
   host.update({sessionKey:'test',world:{nameplates:[],feedback:[],speech:[],hint:null,fishing:null},hud:{...hud,notice:null}});
   const rect=host.roots.hud.entries().find(e=>e.element.id==='game.feedback.tooltip.frame')!.element.rect;
   if(touch){expect(hud.tooltip?.text).toBe('IRON SWORD');expect(hud.tooltip?.anchor.y).toBe(base.y+base.height);}
   else {expect(hud.tooltip?.text).toContain('DURABILITY 70');expect(rect.y).toBeGreaterThanOrEqual(4);expect(rect.y+rect.height).toBeLessThanOrEqual(base.y-4);}
   host.dispose();vi.restoreAllMocks();
  }
 });
});
