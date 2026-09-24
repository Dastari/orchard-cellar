import { GameOnlinePlayers } from './online-players.js';
import { GameUiRuntime } from './runtime.js';
import { nextHomesteadMemberRole } from '../overworld-ui.js';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, CRAFTING_SLOT_OFFSET, EQUIPMENT_SLOTS, runtimeMaxStack, projectTiming, processTopologyForObject, type ProcessTimingSource, type ItemStack, type FrameContentDefinition } from '@orchard/sim';
import { OverworldUi, type OverworldUiCallbacks, type OverworldUiItemArt, type OverworldUiModel, type OverworldWindow } from '../overworld-ui.js';
import type { UiSkin } from '../skin.js';
import type { PixelUi } from '../pixel-ui.js';
import type { UiKitArt } from '../kit/components/art.js';
import type { UiElement } from '../kit/runtime/element.js';
import type { UiRootPointer } from '../kit/runtime/input.js';
import { uiScrollThumb } from '../kit/layout/scroll.js';
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
    manageHomesteadMember: vi.fn(),
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
    frameAction: vi.fn(),
  };
}


const registry = bootstrapContentRegistry();
function fixture(window: OverworldWindow = 'inventory', overrides: Partial<OverworldUiModel> = {}, paint?: { skin: UiSkin; fonts: PixelUi }) {
  const handlers = callbacks();
  const ui = new OverworldUi(paint?.skin ?? {} as UiSkin, paint?.fonts ?? {} as PixelUi, {} as OverworldUiItemArt, handlers);
  let model: OverworldUiModel = { width: 800, height: 600, connected: true, playerCount: 1, selectedSlot: 0,
    inventory: [{ slot: 10, itemKind: 'wood', quantity: 8 }], hasBackpack: true, backpackSlotCapacity: 20,
    contentRegistry: registry, activeFrameId: window === 'chest' ? 'frame:chest' : window === 'barrel' ? 'frame:barrel' : undefined,
    activeFrameState: { sealed: false }, knownRecipeIds: ['planks'],
    audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null,
    ...overrides };
  ui.update(model); ui.openWindow = window;
  const root = ui.enableRetainedInventory({} as UiKitArt);
  const slot = (container: string, index: number): UiElement => {
    root.arrange();
    const node = root.entries().find(({ element }) => {
      const ref = element.props['binding'] as { container: string; index: number } | undefined;
      return ref?.container === container && ref.index === index;
    })?.element;
    if (!node) throw new Error(`Missing kit slot ${container}/${index}`);
    return node;
  };
  const point = (node: UiElement) => ({ x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 });
  const pointer = (type: UiRootPointer['type'], node: UiElement, extra: Partial<UiRootPointer> = {}) => root.pointer({ type,
    point: point(node), pointerId: 1, button: 0, ...extra });
  const click = (node: UiElement, extra: Partial<UiRootPointer> = {}) => { pointer('down', node, extra); pointer('up', node, extra); };
  return { ui, root, handlers, slot, point, pointer, click,
    update(next: Partial<OverworldUiModel>) { model = { ...model, ...next }; ui.update(model); },
    dispose() { ui.disposeRetainedInventory(); } };
}
function cursor(ui: OverworldUi): ItemStack | null | undefined {
  return (ui as unknown as { optimisticMenuCursor: ItemStack | null | undefined }).optimisticMenuCursor;
}

function rosterFixture(canManageHomestead = false) {
  const f = fixture('inventory', { width:800,height:270,canManageHomestead });
  const players = Array.from({length:40},(_,index)=>({identityHex:`player-${index}`,displayName:`PLAYER ${index}`,
    self:false,idleMinutes:null,homesteadRole:'guest' as const}));
  const roster = new GameOnlinePlayers({} as UiKitArt, {onClose:f.handlers.toggleOnlinePlayers,
    onManage:request=>f.handlers.manageHomesteadMember?.(request.expectedIdentityHex, request.intent==='remove'?null:nextHomesteadMemberRole(request.expectedRole), request.intent==='remove')});
  roster.setBounds({x:200,y:4,width:400,height:262},800,270);
  roster.update({scopeKey:'owner:1:space',identityHex:'owner',visible:true,canManage:canManageHomestead,players});
  const runtime = new GameUiRuntime();
  runtime.register({id:'inventory',root:f.root,priority:500,active:()=>f.ui.retainedInventoryActive,blocking:()=>true});
  runtime.register({id:'roster',root:roster.root,priority:750,active:()=>roster.active,blocking:()=>true});
  const find=(id:string)=>{roster.root.arrange();return roster.root.entries().find(e=>e.element.id===id)!.element;};
  const node=(id:string)=>{const n=find(id);roster.root.focus.set(n);roster.root.arrange();return n;};
  const pointer=(type:UiRootPointer['type'],point:{x:number;y:number},extra:Partial<UiRootPointer>={})=>runtime.pointer({type,point,pointerId:9,button:0,...extra});
  return {...f,roster,runtime,find,node,rpointer:pointer,dispose(){runtime.dispose();roster.dispose();f.dispose();}};
}

describe('production retained inventory authority bridge', () => {
  it.each(['inventory', 'crafting', 'chest', 'barrel'] as const)('adopts the authored %s frame with stable bindings', window => {
    const f = fixture(window);
    try {
      expect(f.ui.retainedInventoryActive).toBe(true);
      const bindings = f.root.entries().flatMap(({element}) => element.props['binding'] ? [element.props['binding']] : []);
      const entity = window === 'chest' ? 'chest' : window === 'barrel' ? 'placeable' : window === 'crafting' ? 'crafting' : 'equipment';
      expect(bindings.filter(ref => (ref as {container:string}).container === entity)).toHaveLength(window === 'chest' ? 16 : window === 'barrel' ? 8 : window === 'crafting' ? 9 : EQUIPMENT_SLOTS.length);
      const root = f.root;
      f.update({ width: 390, height: 600 }); f.update({ width: 800 });
      expect(f.ui.retainedInventoryRoot).toBe(root);
    } finally { f.dispose(); }
  });

  it('uses the existing pickup prediction once and rejects the replaced legacy input path', () => {
    const f = fixture();
    try {
      const node = f.slot('backpack', 0); f.click(node);
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledExactlyOnceWith('backpack', 0, 'left');
      expect(cursor(f.ui)).toMatchObject({ itemKind: 'wood', quantity: 8 });
      f.ui.pointerDown(f.point(node), 0); f.ui.pointerUp(f.point(node), 0);
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledTimes(1);
    } finally { f.dispose(); }
  });

  it('shares one chest filter without removing hidden occupied slots from authority', () => {
    const f = fixture('chest', { openChestInventory: [{slot:0,itemKind:'wood',quantity:3},{slot:15,itemKind:'apple',quantity:5}] });
    try {
      const inputs = f.root.entries().filter(({element}) => element.label === 'Filter items');
      expect(inputs).toHaveLength(1);
      f.root.focus.set(inputs[0]!.element, 'keyboard'); f.root.text('wood'); f.root.arrange();
      expect(f.root.focus.current).toBe(inputs[0]!.element);
      f.click(f.slot('chest', 0));
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledExactlyOnceWith('chest', 0, 'left');
      const authority = f.ui as unknown as { optimisticMenuItems: Map<{containerId:string;index:number},ItemStack|null> };
      const hidden = [...authority.optimisticMenuItems].find(([slot]) => slot.containerId === 'chest' && slot.index === 15);
      expect(hidden?.[1]).toMatchObject({ itemKind: 'apple', quantity: 5 });
    } finally { f.dispose(); }
  });

  it('rolls back a rejected real gesture prediction to the next authoritative snapshot', async () => {
    const f = fixture();
    try {
      let reject!: (error: Error) => void;
      vi.mocked(f.handlers.inventoryCursorClick).mockImplementation(() => new Promise<void>((_resolve, failure) => { reject = failure; }));
      f.click(f.slot('backpack', 0)); expect(cursor(f.ui)?.quantity).toBe(8);
      reject(new Error('inventory_out_of_date')); await Promise.resolve(); await Promise.resolve();
      f.update({ cursorStack: null });
      expect(cursor(f.ui)).toBeUndefined();
      f.click(f.slot('backpack', 0), { button: 2 });
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledTimes(2);
      expect(cursor(f.ui)?.quantity).toBe(4);
    } finally { f.dispose(); }
  });

  it('keeps full destinations and disallowed barrel input unchanged', () => {
    const max = runtimeMaxStack(registry, 'wood')!;
    const f = fixture('barrel', { cursorStack: {itemKind:'wood',quantity:3},
      inventory: Array.from({length:20},(_,index)=>({slot:10+index,itemKind:'wood',quantity:max})) });
    try {
      f.click(f.slot('backpack', 0));
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      f.click(f.slot('placeable', 0));
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      expect(cursor(f.ui)).toBeUndefined();
    } finally { f.dispose(); }
  });

  it('forwards one Shift transfer to the existing chest transport', () => {
    const f = fixture('chest', { openChestInventory: [{ slot: 0, itemKind: 'apple', quantity: 5 }] });
    try {
      f.click(f.slot('chest', 0), { shiftKey: true });
      expect(f.handlers.quickMoveInventoryItem).toHaveBeenCalledExactlyOnceWith('chest', 0, ['hotbar', 'backpack']);
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it('keeps the crafting grid 3x3 across compact and wide viewports without changing focused search', () => {
    const f = fixture('crafting');
    try {
      const input = f.root.entries().find(({element}) => element.label === 'Search recipes')!.element;
      f.root.focus.set(input, 'keyboard'); f.root.text('plank');
      for (const width of [390, 800, 320, 960]) {
        f.update({ width }); f.root.arrange();
        expect(f.root.focus.current).toBe(input);
        const slots = Array.from({length:9},(_,i)=>f.slot('crafting',i));
        expect(new Set(slots.map(node=>node.rect.x)).size).toBe(3);
        expect(new Set(slots.map(node=>node.rect.y)).size).toBe(3);
      }
    } finally { f.dispose(); }
  });

  it('scrolls through fractional touch motion without a pickup command', () => {
    const f = fixture('inventory', { width:360, height:200 });
    try {
      const scroll = f.root.entries().find(({element}) => element.style.overflow === 'scroll-y' && element.scroll.maxY > 0)!.element;
      f.root.wheel({point:{x:scroll.rect.x+10,y:scroll.rect.y+10},deltaX:0,deltaY:180}); f.root.arrange();
      const node = f.slot('backpack',0), start = f.point(node);
      expect(node.clip.height).toBe(node.rect.height);
      f.pointer('down',node,{pointerType:'touch',isPrimary:true});
      for (const dy of [2,3,3.99,4,35]) f.root.pointer({type:'move',point:{x:start.x,y:start.y-dy},pointerId:1,button:0,pointerType:'touch'});
      f.root.pointer({type:'up',point:{x:start.x,y:start.y-35},pointerId:1,button:0,pointerType:'touch'});
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      expect(f.handlers.inventoryCursorQuickCraft).not.toHaveBeenCalled();
      expect(scroll.scroll.y).toBeGreaterThan(180);
    } finally { f.dispose(); }
  });

  it('keeps horizontal touch pickup owned after a vertical leg and cancellation', () => {
    const f = fixture('inventory', { width:360, height:200 });
    try {
      const scroll = f.root.entries().find(({element}) => element.style.overflow === 'scroll-y' && element.scroll.maxY > 0)!.element;
      f.root.wheel({point:{x:scroll.rect.x+10,y:scroll.rect.y+10},deltaX:0,deltaY:180}); f.root.arrange();
      const node = f.slot('backpack',0), start = f.point(node);
      f.pointer('down',node,{pointerType:'touch',isPrimary:true});
      f.root.pointer({type:'move',point:{x:start.x+3,y:start.y},pointerId:1,button:0,pointerType:'touch'});
      f.root.pointer({type:'move',point:{x:start.x+3,y:start.y-35},pointerId:1,button:0,pointerType:'touch'});
      f.root.pointer({type:'cancel',point:start,pointerId:1,button:0,pointerType:'touch'});
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledExactlyOnceWith('backpack',0,'left');
      expect(scroll.scroll.y).toBe(180); expect(cursor(f.ui)?.quantity).toBe(8);
    } finally { f.dispose(); }
  });

  it('ignores a second pointer without replacing the first inventory gesture', () => {
    const f = fixture('inventory', {inventory:[{slot:10,itemKind:'wood',quantity:8},{slot:11,itemKind:'apple',quantity:4}]});
    try {
      const first=f.slot('backpack',0), second=f.slot('backpack',1);
      f.pointer('down',first,{pointerType:'touch',isPrimary:true});
      f.pointer('down',second,{pointerId:2,pointerType:'touch',isPrimary:false});
      f.pointer('up',second,{pointerId:2,pointerType:'touch',isPrimary:false});
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      f.pointer('up',first,{pointerType:'touch',isPrimary:true});
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledExactlyOnceWith('backpack',0,'left');
    } finally { f.dispose(); }
  });

  it('cancels a disconnected gesture and resumes from the subscribed cursor on the same root', () => {
    const f=fixture();
    try {
      const root=f.root, source=f.slot('backpack',0), start=f.point(source);
      f.pointer('down',source);
      f.root.pointer({type:'move',point:{x:start.x+3,y:start.y},pointerId:1,button:0});
      expect(cursor(f.ui)?.quantity).toBe(8);
      f.update({connected:false,inventory:[],cursorStack:{itemKind:'wood',quantity:8}});
      expect(f.ui.retainedInventoryActive).toBe(false);
      f.pointer('up',source);
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledTimes(1);
      f.update({connected:true}); expect(f.ui.retainedInventoryRoot).toBe(root);
      f.click(f.slot('hotbar',0));
      expect(f.handlers.inventoryCursorClick).toHaveBeenLastCalledWith('hotbar',0,'left');
      expect(cursor(f.ui)).toBeNull();
      expect(f.handlers.returnInventoryCursor).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it('activates the focused real slot with keyboard modifiers and closes with Escape', () => {
    const f=fixture('chest',{openChestInventory:[{slot:0,itemKind:'apple',quantity:5}]});
    try {
      const source=f.slot('chest',0); f.root.focus.set(source,'keyboard');
      f.root.key({key:'Enter',shiftKey:true});
      expect(f.handlers.quickMoveInventoryItem).toHaveBeenCalledExactlyOnceWith('chest',0,['hotbar','backpack']);
      f.root.key({key:'Escape'}); expect(f.ui.openWindow).toBeNull();
      expect(f.handlers.closeChest).toHaveBeenCalledOnce();
    } finally { f.dispose(); }
  });

  it('uses actual Ctrl and number hotkeys without consuming editor typing', () => {
    const f=fixture();
    try {
      const source=f.slot('backpack',0); f.pointer('move',source); f.root.focus.set(source,'keyboard');
      f.root.key({key:'q',ctrlKey:true});
      expect(f.handlers.throwMenuItem).toHaveBeenCalledExactlyOnceWith('backpack',0,true);
      f.root.key({key:'3'});
      expect(f.handlers.inventoryCursorSwapHotbar).toHaveBeenCalledExactlyOnceWith('backpack',0,2);
      const input=f.root.entries().find(({element})=>element.label==='Filter items')!.element;
      f.root.focus.set(input,'keyboard'); f.root.key({key:'i'}); f.root.text('i');
      expect(f.ui.openWindow).toBe('inventory');
    } finally { f.dispose(); }
  });

  it('commits one existing quick-craft command after preview across kit slots', () => {
    const f=fixture('inventory',{inventory:[],cursorStack:{itemKind:'wood',quantity:8}});
    try {
      const a=f.slot('backpack',0),b=f.slot('backpack',1);
      f.pointer('down',a); f.pointer('move',b); f.pointer('up',b);
      expect(f.handlers.inventoryCursorQuickCraft).toHaveBeenCalledExactlyOnceWith([
        {container:'backpack',index:0},{container:'backpack',index:1},
      ],'even');
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      expect(cursor(f.ui)).toBeNull();
    } finally { f.dispose(); }
  });

  it('returns a held cursor from frame background and drops it only outside', () => {
    for (const inside of [true,false]) {
      const f=fixture('inventory',{cursorStack:{itemKind:'wood',quantity:8}});
      try {
        const frame=f.root.entries().find(({element})=>element.kind==='window')!.element;
        const point=inside ? {x:frame.rect.x+12,y:frame.rect.y+48} : {x:2,y:2};
        f.root.pointer({type:'down',point,pointerId:1,button:2});
        f.root.pointer({type:'up',point,pointerId:1,button:2});
        expect(f.handlers.returnInventoryCursor).toHaveBeenCalledTimes(inside?1:0);
        expect(f.handlers.dropInventoryCursor).toHaveBeenCalledTimes(inside?0:1);
      } finally { f.dispose(); }
    }
  });

  it('retains recipe pointer ownership across equivalent live snapshots', () => {
    const f=fixture('crafting');
    try {
      const row=f.root.entries().find(({element})=>element.kind==='list-row')!.element;
      f.pointer('down',row); f.update({timeLabel:'06:01'}); f.pointer('up',row);
      expect(f.handlers.ghostFillCraftingRecipe).toHaveBeenCalledExactlyOnceWith('planks');
    } finally { f.dispose(); }
  });

  it('crafts the real recipe once on release with Shift while preserving the grid authority', () => {
    const f=fixture('crafting',{inventory:[{slot:CRAFTING_SLOT_OFFSET,itemKind:'wood',quantity:25}]});
    try {
      const result=f.root.entries().find(({element})=>element.label==='Craft result')!.element;
      expect(result.disabled).toBe(false);
      f.pointer('down',result,{shiftKey:true}); expect(f.handlers.craftInventoryRecipe).not.toHaveBeenCalled();
      f.pointer('up',result,{shiftKey:true});
      expect(f.handlers.craftInventoryRecipe).toHaveBeenCalledExactlyOnceWith('planks',true);
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });


  it('displays the subscribed barrel timing and clears a removed projection', () => {
    const f=fixture('barrel',{activeFrameState:{sealed:true}, activeFrameTiming:{
      status:'running',reason:null,stage:null,progress:0.5,remainingActiveTicks:1200n,
      nextTransitionTick:1500n,confidence:'exact',
    }});
    try {
      const labels=()=>f.root.entries().map(({element})=>element.props['text']);
      expect(labels()).toContain('In progress');
      f.update({activeFrameTiming:{status:'paused',reason:'unsealed',stage:null,progress:0.5,
        remainingActiveTicks:1200n,nextTransitionTick:null,confidence:'exact'}});
      expect(labels()).toContain('Seal to start');
      f.update({activeFrameTiming:undefined});
      expect(labels()).toContain('Idle'); expect(labels()).not.toContain('In progress');
    } finally { f.dispose(); }
  });


  it.each(['inventory','crafting'] as const)('preserves %s filter Escape and Enter handoff without inventory shortcuts', window => {
    const f=fixture(window);
    try {
      const input=f.root.entries().find(({element})=>element.label===(window==='crafting'?'Search recipes':'Filter items'))!.element;
      f.pointer('move',f.slot('backpack',0));
      f.root.focus.set(input,'keyboard'); f.root.text('wood');
      f.root.key({key:'3',ctrlKey:true}); f.root.key({key:'q',ctrlKey:true});
      expect(f.handlers.inventoryCursorSwapHotbar).not.toHaveBeenCalled();
      expect(f.handlers.throwMenuItem).not.toHaveBeenCalled();
      f.root.key({key:'Escape'}); f.root.arrange();
      expect(input.props['value']).toBe(''); expect(f.root.focus.current).toBe(input);
      expect(f.ui.openWindow).toBe(window);
      f.root.key({key:'Escape'}); f.root.arrange();
      expect(f.root.focus.current).not.toBe(input); expect(f.ui.openWindow).toBe(window);
      f.root.focus.set(input,'keyboard'); f.root.text('wood'); f.root.key({key:'Enter'}); f.root.arrange();
      expect(input.props['value']).toBe('wood'); expect(f.root.focus.current).not.toBe(input);
      expect(f.ui.openWindow).toBe(window);
    } finally { f.dispose(); }
  });


  it('keeps a secondary background release from finishing the first slot gesture', () => {
    const f=fixture();
    try {
      const source=f.slot('backpack',0);
      f.pointer('down',source,{pointerType:'touch',isPrimary:true});
      f.root.pointer({type:'down',point:{x:2,y:2},pointerId:2,button:0,pointerType:'touch',isPrimary:false});
      f.root.pointer({type:'up',point:{x:2,y:2},pointerId:2,button:0,pointerType:'touch',isPrimary:false});
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      f.pointer('up',source,{pointerType:'touch',isPrimary:true});
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledExactlyOnceWith('backpack',0,'left');
      expect(f.handlers.dropInventoryCursor).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });


  it('keeps primary focus and scrolling when a second finger touches an editor or scrollbar', () => {
    const f=fixture('inventory',{width:360,height:200});
    try {
      const scroll=f.root.entries().find(({element})=>element.style.overflow==='scroll-y' && element.scroll.maxY>0)!.element;
      f.root.wheel({point:{x:scroll.rect.x+10,y:scroll.rect.y+10},deltaX:0,deltaY:180}); f.root.arrange();
      const source=f.slot('backpack',0),start=f.point(source);
      const input=f.root.entries().find(({element})=>element.label==='Filter items')!.element;
      const thumb=uiScrollThumb(scroll,'y')!.thumb;
      f.pointer('down',source,{pointerType:'touch',isPrimary:true});
      expect(f.root.focus.current).toBe(source);
      for (const point of [f.point(input),{x:thumb.x+thumb.width/2,y:thumb.y+thumb.height/2}]) {
        f.root.pointer({type:'down',point,pointerId:2,button:0,pointerType:'touch',isPrimary:false});
        f.root.pointer({type:'move',point:{x:point.x,y:point.y-40},pointerId:2,button:0,pointerType:'touch',isPrimary:false});
        f.root.pointer({type:'up',point,pointerId:2,button:0,pointerType:'touch',isPrimary:false});
        expect(f.root.focus.current).toBe(source); expect(scroll.scroll.y).toBe(180);
      }
      f.root.pointer({type:'move',point:{x:start.x,y:start.y-20},pointerId:1,button:0,pointerType:'touch',isPrimary:true});
      f.root.pointer({type:'up',point:{x:start.x,y:start.y-20},pointerId:1,button:0,pointerType:'touch',isPrimary:true});
      expect(scroll.scroll.y).toBe(200); expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      expect(input.props['value']).toBe('');
    } finally { f.dispose(); }
  });


  it('keeps roster close and role actions above retained inventory', () => {
    const f=rosterFixture(true);
    try {
      const row=f.node('game.online-players:player:player-0'),point=f.point(row);
      f.rpointer('down',point); expect(f.handlers.manageHomesteadMember).not.toHaveBeenCalled(); f.rpointer('up',point);
      expect(f.handlers.manageHomesteadMember).toHaveBeenCalledExactlyOnceWith('player-0','worker',false);
      f.rpointer('down',point,{button:2});f.rpointer('up',point,{button:2});
      expect(f.handlers.manageHomesteadMember).toHaveBeenLastCalledWith('player-0',null,true);
      const close=f.roster.root.entries().find(e=>e.element.label==='X')!.element;
      f.rpointer('down',f.point(close));f.rpointer('up',f.point(close));expect(f.handlers.toggleOnlinePlayers).toHaveBeenCalledExactlyOnceWith();
      expect(f.ui.openWindow).toBe('inventory');expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it('scrolls the retained roster without reviving legacy inventory input', () => {
    const f=rosterFixture();
    try {
      const list=f.find('game.online-players:list'),point={x:list.contentRect.x+8,y:list.contentRect.y+50};
      f.runtime.wheel({point,deltaX:0,deltaY:60});expect(list.scroll.y).toBeGreaterThan(0);
      const end=list.scroll.y;f.rpointer('up',point);f.rpointer('move',{x:point.x,y:point.y-80});expect(list.scroll.y).toBe(end);
      const inventoryPoint=f.point(f.slot('backpack',0));f.rpointer('down',inventoryPoint);f.rpointer('up',inventoryPoint);
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it('scrolls a manageable roster with touch without role or inventory commands (BUG-026)', () => {
    const f=rosterFixture(true);
    try {
      const row=f.node('game.online-players:player:player-2'),start=f.point(row),list=f.find('game.online-players:list'),before=list.scroll.y;
      f.rpointer('down',start,{pointerType:'touch'});
      for(const dy of [3,4,24])f.rpointer('move',{x:start.x,y:start.y-dy},{pointerType:'touch'});
      expect(list.scroll.y).toBeGreaterThan(before);f.rpointer('up',{x:start.x,y:start.y-24},{pointerType:'touch'});
      const end=list.scroll.y;f.rpointer('move',{x:start.x,y:start.y-60},{pointerType:'touch'});expect(list.scroll.y).toBe(end);
      expect(f.handlers.manageHomesteadMember).not.toHaveBeenCalled();expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it('adopts the actual authored barrel content route with real slot and seal commands', () => {
    const f=fixture('content',{activeFrameId:'frame:barrel',activeFrameState:{sealed:false},
      openPlaceableInventory:[{slot:0,itemKind:'apple',quantity:4}]});
    try {
      expect(f.ui.retainedInventoryActive).toBe(true);
      expect(f.root.entries().filter(({element})=>(element.props['binding'] as {container?:string}|undefined)?.container==='placeable')).toHaveLength(8);
      f.click(f.slot('placeable',0));
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledExactlyOnceWith('placeable',0,'left');
      const seal=f.root.entries().find(({element})=>element.label==='Seal')!.element;
      f.click(seal); expect(f.handlers.frameAction).toHaveBeenCalledExactlyOnceWith('seal');
      f.ui.openWindow=null; expect(f.handlers.closePlaceable).toHaveBeenCalledExactlyOnceWith();
    } finally { f.dispose(); }
  });

  it.each(['frame:hearth_stash'] as const)('keeps unmigrated content frame %s on its existing path',activeFrameId=>{
    const f=fixture('content',{activeFrameId});
    try { expect(f.ui.retainedInventoryActive).toBe(false); }
    finally { f.dispose(); }
  });

});


const processorCases = [
  {frame:'frame:furnace',adapter:'smelting',slots:3,input:'copper_ore',output:'copper_bar',outputIndex:2},
  {frame:'frame:cooking',adapter:'campfire_cooking',slots:2,input:'raw_beef',output:'cooked_beef',outputIndex:1},
  {frame:'frame:press',adapter:'press',slots:3,input:'apple',output:'must',outputIndex:1},
  {frame:'frame:fermentation',adapter:'fermentation',slots:2,input:'must',output:'bottles',outputIndex:1},
] as const;

function processorTimingSource(spec: typeof processorCases[number]): ProcessTimingSource {
  const recipe=[...registry.processes.values()].find(def=>def.adapter===spec.adapter && def.input.item===`item:${spec.input}`)!;
  const object=[...registry.objects.values()].find(def=>def.components.processor?.processTag===recipe.stationTag)!;
  const topology=processTopologyForObject(object)!;
  const slots:(ItemStack|null)[]=Array.from({length:topology.slotCount},()=>null);
  slots[topology.inputSlots[0]!]={itemKind:spec.input,quantity:recipe.input.count*4};
  if(recipe.fuelPolicy) slots[topology.fuelSlots[0]!]={itemKind:recipe.fuelPolicy.acceptedItems[0]!.slice(5),quantity:8};
  return {kind:'process',definitions:[recipe],adapter:spec.adapter,durationTicks:1200n,startTick:100n,
    state:{slots,startTick:100n,lit:true},options:{topology,ticksPerUnit:1200n,maxStackForItem:kind=>runtimeMaxStack(registry,kind)}};
}

describe('production retained processor authority bridge',()=>{
  it.each(processorCases)('adopts $frame through its real content route and keeps processor roles unsortable',spec=>{
    const f=fixture('content',{activeFrameId:spec.frame,openPlaceableInventory:[{slot:0,itemKind:spec.input,quantity:6}]});
    try {
      expect(f.ui.retainedInventoryActive).toBe(true);
      expect(f.root.entries().filter(({element})=>(element.props['binding'] as {container?:string}|undefined)?.container==='placeable')).toHaveLength(spec.slots);
      expect(f.root.entries().filter(({element})=>element.label==='Sort inventory')).toHaveLength(1);
      f.click(f.slot('placeable',0),{shiftKey:true});
      expect(f.handlers.quickMoveInventoryItem).toHaveBeenCalledExactlyOnceWith('placeable',0,['hotbar','backpack']);
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      expect(f.root.entries().filter(({element})=>(element.props['binding'] as {container?:string}|undefined)?.container==='placeable')
        .every(({element})=>(element.props['binding'] as {index:number}).index<spec.slots)).toBe(true);
    } finally { f.dispose(); }
  });

  it.each(processorCases)('allows output extraction but rejects insertion in $frame',spec=>{
    const f=fixture('content',{activeFrameId:spec.frame,openPlaceableInventory:[{slot:spec.outputIndex,itemKind:spec.output,quantity:2}]});
    try {
      f.click(f.slot('placeable',spec.outputIndex));
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledExactlyOnceWith('placeable',spec.outputIndex,'left');
      expect(cursor(f.ui)).toMatchObject({itemKind:spec.output,quantity:2});
    } finally { f.dispose(); }
    const held=fixture('content',{activeFrameId:spec.frame,cursorStack:{itemKind:spec.output,quantity:2}});
    try {
      held.click(held.slot('placeable',spec.outputIndex));
      expect(held.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      expect(cursor(held.ui)).toBeUndefined();
    } finally { held.dispose(); }
  });

  it.each(processorCases)('uses the real timing projection in $frame without creating unsettled output',spec=>{
    const source=processorTimingSource(spec);
    const f=fixture('content',{activeFrameId:spec.frame,activeFrameTiming:projectTiming(source,120n),
      openPlaceableInventory:source.state!.slots.flatMap((stack,slot)=>stack?[{slot,...stack}]:[])});
    try {
      const text=()=>f.root.entries().map(({element})=>element.props['text']);
      expect(text()).toContain('In progress');
      const meter=f.root.entries().find(({element})=>element.kind==='meter' && element.label==='Progress')!.element;
      expect(meter.props['value']).toBe(projectTiming(source,120n).progress);
      f.update({activeFrameTiming:projectTiming(source,1300n)});
      expect(text()).toContain('Collect to confirm');
      f.click(f.slot('placeable',spec.outputIndex));
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      const empty={...source,state:{...source.state!,slots:source.state!.slots.map(()=>null)}};
      f.update({activeFrameTiming:projectTiming(empty,120n)});
      expect(text()).toContain('Add inputs');
      expect(text().some(value=>typeof value==='string' && value.endsWith(' LEFT'))).toBe(false);
      f.update({connected:false}); expect(f.ui.retainedInventoryActive).toBe(false);
      f.update({connected:true,activeFrameTiming:projectTiming(source,120n)});
      expect(text()).toContain('In progress'); expect(meter.props['value']).toBe(projectTiming(source,120n).progress);
    } finally { f.dispose(); }
  });

  it('keeps furnace input and fuel roles separate and rejects retired process inputs',()=>{
    for(const [index,itemKind,allowed] of [[0,'copper_ore',true],[0,'wood',false],[1,'wood',true],[1,'copper_ore',false]] as const){
      const f=fixture('content',{activeFrameId:'frame:furnace',cursorStack:{itemKind,quantity:3}});
      try {f.click(f.slot('placeable',index));expect(f.handlers.inventoryCursorClick).toHaveBeenCalledTimes(allowed?1:0);}
      finally {f.dispose();}
    }
    const retired={...registry,processes:new Map([...registry.processes].map(([id,process])=>[id,process.stationTag==='station.furnace'?{...process,retired:true}:process]))};
    const f=fixture('content',{activeFrameId:'frame:furnace',contentRegistry:retired,cursorStack:{itemKind:'copper_ore',quantity:3}});
    try {f.click(f.slot('placeable',0));expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();}
    finally {f.dispose();}
    const existing=fixture('content',{activeFrameId:'frame:furnace',contentRegistry:retired,
      openPlaceableInventory:[{slot:0,itemKind:'copper_ore',quantity:3}]});
    try {existing.click(existing.slot('placeable',0));expect(existing.handlers.inventoryCursorClick).toHaveBeenCalledExactlyOnceWith('placeable',0,'left');}
    finally {existing.dispose();}
  });

  it('keeps cooking private batch progress and commands separate from station timing',()=>{
    const f=fixture('content',{activeFrameId:'frame:cooking',activeFrameState:{processJobPending:true,
      processJobReady:false,processJobLabel:'3 × COOKED BEEF',processJobProgress:0.25},
      activeFrameTiming:{status:'blocked',reason:'fire-out',stage:null,progress:0,remainingActiveTicks:null,nextTransitionTick:null,confidence:'exact'}});
    try {
      const labels=()=>f.root.entries().map(({element})=>element.label);
      expect(labels()).toContain('Fire out'); expect(labels()).toContain('3 × COOKED BEEF');
      expect(labels()).not.toContain('Collect batch'); expect(labels()).toContain('Cancel batch');
      const batch=f.root.entries().find(({element})=>element.kind==='meter' && element.label==='BATCH PROGRESS')!.element;
      expect(batch.props['value']).toBe(0.25);
      f.update({activeFrameState:{processJobPending:true,processJobReady:true,processJobLabel:'3 × COOKED BEEF',processJobProgress:1}});
      expect(batch.props['value']).toBe(1);expect(labels()).toContain('Collect batch');
      const collect=f.root.entries().find(({element})=>element.label==='Collect batch')!.element;
      f.click(collect); expect(f.handlers.frameAction).toHaveBeenCalledExactlyOnceWith('collect_job');
      const cancel=f.root.entries().find(({element})=>element.label==='Cancel batch')!.element;
      f.pointer('down',cancel); f.update({activeFrameState:{processJobPending:false,processJobReady:false}}); f.pointer('up',cancel);
      expect(f.handlers.frameAction).toHaveBeenCalledTimes(1); expect(labels()).not.toContain('Cancel batch');
      expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
    } finally {f.dispose();}
  });

  it('forwards changing authoritative process progress to authored progress bars',()=>{
    const base=registry.frames.get('frame:furnace')!;
    const frame:FrameContentDefinition={...base,panes:[...base.panes,{id:'authority-progress',kind:'bar',label:'AUTHORITY PROGRESS',bind:{process:'progress'}}]};
    const contentRegistry={...registry,frames:new Map(registry.frames).set(frame.id,frame)};
    const f=fixture('content',{activeFrameId:frame.id,contentRegistry,activeFrameProgress:0.25});
    try {
      const meter=f.root.entries().find(({element})=>element.kind==='meter' && element.label==='AUTHORITY PROGRESS')!.element;
      const value=meter.props['value'] as ()=>number;
      expect(value()).toBe(0.25); f.update({activeFrameProgress:0.75}); expect(value()).toBe(0.75);
      expect(f.root.entries().find(({element})=>element===meter)?.element).toBe(meter);
    } finally {f.dispose();}
  });

  it('preserves hidden output bindings in the actual pickup prediction',()=>{
    const base=registry.frames.get('frame:press')!;
    const frame:FrameContentDefinition={...base,panes:base.panes.map(pane=>pane.id==='output'?{...pane,visibleWhen:{state:'showOutputs',equals:true}}:pane)};
    const f=fixture('content',{activeFrameId:frame.id,contentRegistry:{...registry,frames:new Map(registry.frames).set(frame.id,frame)},
      activeFrameState:{showOutputs:false},openPlaceableInventory:[{slot:0,itemKind:'apple',quantity:4},{slot:1,itemKind:'must',quantity:2},{slot:2,itemKind:'pomace',quantity:1}]});
    try {
      expect(f.root.entries().some(({element})=>(element.props['binding'] as {container?:string;index?:number}|undefined)?.container==='placeable' && (element.props['binding'] as {index:number}).index===2)).toBe(false);
      f.click(f.slot('placeable',0));
      const predicted=f.ui as unknown as {optimisticMenuItems:Map<{containerId:string;index:number},ItemStack|null>};
      expect([...predicted.optimisticMenuItems].find(([slot])=>slot.containerId==='placeable' && slot.index===2)?.[1]).toMatchObject({itemKind:'pomace',quantity:1});
      f.update({activeFrameState:{showOutputs:true}}); expect(f.slot('placeable',2)).toBeDefined();
      expect(f.handlers.inventoryCursorClick).toHaveBeenCalledExactlyOnceWith('placeable',0,'left');
    } finally {f.dispose();}
  });


  it.each(processorCases)('restores rejected output custody and reconnects the same $frame root',async spec=>{
    const f=fixture('content',{activeFrameId:spec.frame,openPlaceableInventory:[{slot:spec.outputIndex,itemKind:spec.output,quantity:2}]});
    try {
      let reject!:(error:Error)=>void;
      vi.mocked(f.handlers.inventoryCursorClick).mockImplementationOnce(()=>new Promise<void>((_resolve,failure)=>{reject=failure;}));
      f.click(f.slot('placeable',spec.outputIndex));expect(cursor(f.ui)?.quantity).toBe(2);
      reject(new Error('container_not_found'));await Promise.resolve();await Promise.resolve();
      f.update({connected:false,cursorStack:null});expect(cursor(f.ui)).toBeUndefined();
      f.update({connected:true});expect(f.ui.retainedInventoryRoot).toBe(f.root);
      f.click(f.slot('placeable',spec.outputIndex),{button:2});
      expect(f.handlers.inventoryCursorClick).toHaveBeenLastCalledWith('placeable',spec.outputIndex,'right');
      expect(cursor(f.ui)).toMatchObject({itemKind:spec.output,quantity:1});
      f.root.pointer({type:'cancel',point:f.point(f.slot('placeable',spec.outputIndex)),pointerId:1,button:0});
      expect(cursor(f.ui)?.quantity).toBe(1);expect(f.handlers.returnInventoryCursor).not.toHaveBeenCalled();
    } finally {f.dispose();}
  });

  it.each(processorCases)('keeps a carried $frame output when the backpack destination is full',spec=>{
    const f=fixture('content',{activeFrameId:spec.frame,cursorStack:{itemKind:spec.output,quantity:2},
      inventory:Array.from({length:20},(_,index)=>({slot:10+index,itemKind:spec.output,quantity:runtimeMaxStack(registry,spec.output)!}))});
    try {
      f.click(f.slot('backpack',0));expect(f.handlers.inventoryCursorClick).not.toHaveBeenCalled();
      expect(cursor(f.ui)).toBeUndefined();
    } finally {f.dispose();}
  });

  it.each(processorCases)('keeps $frame filter focus and authored bindings across compact/wide resizing',spec=>{
    const f=fixture('content',{activeFrameId:spec.frame});
    try {
      const input=f.root.entries().find(({element})=>element.label==='Filter items')!.element;
      f.root.focus.set(input,'keyboard');f.root.text('wood');
      for(const width of [320,390,960]){
        f.update({width});f.root.arrange();expect(f.root.focus.current).toBe(input);
        expect(input.props['value']).toBe('wood');
        expect(f.root.entries().filter(({element})=>(element.props['binding'] as {container?:string}|undefined)?.container==='placeable')).toHaveLength(spec.slots);
      }
    } finally {f.dispose();}
  });

});
