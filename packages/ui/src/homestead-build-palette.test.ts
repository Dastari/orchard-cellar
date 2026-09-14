import { bootstrapContentRegistry, homesteadBuildDefinitions } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  HomesteadBuildPalette,
  constructionToolRect,
  homesteadBuildPaletteBounds,
  homesteadBuildPaletteCells,
  homesteadUpgradePaletteCells,
} from './homestead-build-palette.js';

describe('homestead build palette layout', () => {
  it('opens construction without click-through, selects a stamp and resets on scope change',()=>{
    const palette=new HomesteadBuildPalette({} as never,{} as never,{});
    const model={scope:'a',width:320,height:180,counts:{},upgrades:[],upgradeRanks:{},balanceBronze:0n,
      furnishing:true,entries:[]};
    palette.setModel(model);
    const initial=palette.bounds;
    expect(palette.pointerDown({x:initial.x+initial.width-40,y:initial.y+10},0)).toBe(true);
    expect(palette.constructionTool).toBeNull();
    const bounds=palette.bounds;
    expect(bounds.y+bounds.height).toBeLessThanOrEqual(176);
    for(let i=0;i<9;i++){
      const rect=constructionToolRect(bounds,i);
      expect(rect.x+rect.width).toBeLessThan(bounds.x+bounds.width);
      expect(rect.y+rect.height).toBeLessThan(bounds.y+152);
    }
    const stamp=constructionToolRect(bounds,4);
    palette.pointerDown({x:stamp.x+10,y:stamp.y+10},0);
    expect(palette.constructionTool).toBe('doorway_ew');expect(palette.bounds.height).toBe(32);
    palette.pointerDown({x:palette.bounds.x+10,y:palette.bounds.y+10},0);
    expect(palette.bounds.height).toBe(172);expect(palette.constructionTool).toBe('doorway_ew');
    const chosen=constructionToolRect(palette.bounds,4);palette.pointerDown({x:chosen.x+10,y:chosen.y+10},0);
    palette.setModel({...model,constructionCanApply:true,constructionStatus:{footprint:4,materials:['USE 16 WOOD','USE 4 STONE'],notice:'CHECKED ON APPLY'}});
    const review=palette.bounds;expect(review.height).toBe(116);
    palette.pointerDown({x:review.x+30,y:review.y+95},0);expect(palette.takeConstructionApply()).toBe(true);expect(palette.takeConstructionApply()).toBe(false);
    palette.setModel({...model,constructionCanApply:true,constructionPending:true});
    palette.pointerDown({x:review.x+30,y:review.y+95},0);expect(palette.takeConstructionApply()).toBe(false);
    palette.pointerDown({x:review.x+180,y:review.y+95},0);expect(palette.takeConstructionCancel()).toBe(false);
    palette.setModel({...model,constructionCanApply:true,constructionPending:false});
    palette.pointerDown({x:review.x+180,y:review.y+95},0);expect(palette.takeConstructionCancel()).toBe(true);
    palette.setModel({...model,scope:'b'});expect(palette.constructionTool).toBeNull();
    const next=palette.bounds;palette.pointerDown({x:next.x+next.width-40,y:next.y+10},0);
    const tools=palette.bounds;palette.pointerDown({x:tools.x+tools.width-40,y:tools.y+10},0);
    expect(palette.constructionTool).toBeNull();expect(palette.bounds.height).not.toBe(172);
  });
  it('fits the full 32-piece base catalogue above the bottom edge of a compact view', () => {
    const model = { width: 320, height: 180, furnishing: true, upgrades: [],
      entries: Array.from({ length: 32 }, (_, index) => ({ itemKind: `furniture_${index}`, displayName: 'Furniture', layer: 'prop' as const, iconAnimation: 'base' })) };
    const bounds = homesteadBuildPaletteBounds(model);
    expect(bounds.y).toBeGreaterThanOrEqual(4);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(model.height - 4);
    const cells = homesteadBuildPaletteCells(bounds, model.entries.length, 4);
    expect(cells).toHaveLength(36);
    for (const cell of cells) expect(cell.y + cell.height).toBeLessThan(bounds.y + bounds.height);
  });
  it('offers move and guarded undo only when furnishing', () => {
    const palette = new HomesteadBuildPalette({} as never, {} as never, {});
    const model = { width: 640, height: 480, counts: {}, upgrades: [], upgradeRanks: {}, balanceBronze: 0n,
      entries: [], furnishing: true, canUndoMove: false };
    palette.setModel(model);
    const bounds = homesteadBuildPaletteBounds(model), cells = homesteadBuildPaletteCells(bounds, 0, 3);
    const click = (index: number) => palette.pointerDown({ x: cells[index]!.x + 1, y: cells[index]!.y + 1 }, 0);
    click(1); expect(palette.selection).toEqual({ kind: 'move' });
    palette.showCatalogue();
    click(2); expect(palette.takeUndoMoveRequest()).toBe(false);
    palette.setModel({ ...model, canUndoMove: true });
    click(2); expect(palette.takeUndoMoveRequest()).toBe(true);
    expect(palette.takeUndoMoveRequest()).toBe(false);
    for (const cell of cells) expect(cell.y + cell.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    palette.setModel({ ...model, furnishing: false });
    expect(palette.selection).toEqual({ kind: 'remove' });
  });
  it('leaves the room clickable after choosing furniture and reopens without changing selection', () => {
    const palette = new HomesteadBuildPalette({} as never, {} as never, {});
    const model = { scope: 'home-a', width: 320, height: 180, counts: {}, upgrades: [], upgradeRanks: {}, balanceBronze: 0n,
      furnishing: true, entries: Array.from({ length: 32 }, (_, index) => ({ itemKind: `piece_${index}`, displayName: 'Furniture', layer: 'prop' as const, iconAnimation: 'base' })) };
    palette.setModel(model);
    const expanded = palette.bounds;
    const cell = homesteadBuildPaletteCells(expanded, 32, 3)[20]!;
    const point = { x: cell.x + 1, y: cell.y + 1 };
    expect(palette.pointerDown(point, 0)).toBe(true);
    expect(palette.selection).toEqual({ kind: 'place', itemKind: 'piece_20' });
    expect(palette.bounds.height).toBe(32);
    expect(palette.pointerMove(point)).toBe(false);
    expect(palette.pointerDown(point, 0)).toBe(false);
    palette.setModel({ ...model, counts: { piece_20: 1 } });
    expect(palette.bounds.height).toBe(32);
    expect(palette.pointerDown({ x: palette.bounds.x + 1, y: 5 }, 0)).toBe(true);
    expect(palette.bounds).toEqual(expanded);
    expect(palette.selection).toEqual({ kind: 'place', itemKind: 'piece_20' });
    expect(palette.takeUndoMoveRequest()).toBe(false);
    expect(palette.takePurchaseRequest()).toBeNull();
    palette.pointerDown(point, 0);
    palette.setModel({ ...model, scope: 'home-b' });
    expect(palette.bounds).toEqual(expanded);
    palette.setModel({ ...model, furnishing: false });
    const exterior = palette.bounds;
    const exteriorCell = homesteadBuildPaletteCells(exterior, 32)[0]!;
    palette.pointerDown({ x: exteriorCell.x + 1, y: exteriorCell.y + 1 }, 0);
    expect(palette.bounds).toEqual(exterior);
  });
  it('accepts renamed model entries and removes a stale selection after content changes', () => {
    const palette = new HomesteadBuildPalette({} as never, {} as never, {});
    const model = { width: 640, height: 480, counts: {}, upgrades: [], upgradeRanks: {}, balanceBronze: 0n,
      entries: [{ itemKind: 'moon_shelter', displayName: 'Moon Shelter', layer: 'prefab' as const, iconAnimation: 'moon' }] };
    palette.setModel(model);
    expect(palette.selection).toEqual({ kind: 'place', itemKind: 'moon_shelter' });
    palette.setModel({ ...model, entries: [] });
    expect(palette.selection).toEqual({ kind: 'remove' });
    palette.setModel({ ...model, entries: [{ ...model.entries[0]!, itemKind: 'solar_station' }] });
    expect(palette.selection).toEqual({ kind: 'place', itemKind: 'solar_station' });
  });

  it('keeps every buildable plus removal inside its panel', () => {
    const registry = bootstrapContentRegistry();
    const model = { width: 640, entries: [...homesteadBuildDefinitions(registry).values()]
      .map((entry) => ({ ...entry, iconAnimation: 'base' })), upgrades: Object.values(registry.compiled.upgrades) };
    const bounds = homesteadBuildPaletteBounds(model);
    const cells = homesteadBuildPaletteCells(bounds, model.entries.length);
    expect(cells).toHaveLength(model.entries.length + 1);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(bounds.x);
      expect(cell.y).toBeGreaterThanOrEqual(bounds.y);
      expect(cell.x + cell.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(cell.y + cell.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    for (const cell of homesteadUpgradePaletteCells(bounds, model)) {
      expect(cell.x).toBeGreaterThanOrEqual(bounds.x);
      expect(cell.y).toBeGreaterThanOrEqual(bounds.y);
      expect(cell.x + cell.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(cell.y + cell.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });
});


describe('residence purchase controls',()=>{
  function fixture() {
    const palette=new HomesteadBuildPalette({} as never,{} as never,{});
    const model={scope:'home',width:320,height:180,counts:{},upgrades:[],upgradeRanks:{},balanceBronze:10000n,
      residenceRank:0,residenceOwner:true,furnishing:true,entries:[]};
    palette.setModel(model);
    const room=homesteadBuildPaletteCells(palette.bounds,0,4)[3]!;
    palette.pointerDown({x:room.x+1,y:room.y+1},0);
    const buy=()=>palette.pointerDown({x:palette.bounds.x+20,y:palette.bounds.y+120},0);
    return {palette,model,buy};
  }
  it('requires a detail-view purchase click and waits for authoritative rank change',()=>{
    const {palette,model,buy}=fixture();expect(palette.takeExpansionRequest()).toBeNull();
    expect(palette.bounds.y+palette.bounds.height).toBeLessThan(180);
    buy();expect(palette.takeExpansionRequest()).toEqual({token:1,rank:0,scope:'home'});
    buy();expect(palette.takeExpansionRequest()).toBeNull();
    palette.setModel({...model,residenceRank:1,balanceBronze:6800n});buy();
    expect(palette.takeExpansionRequest()).toEqual({token:2,rank:1,scope:'home'});
  });
  it('blocks nonowners, poor wallets and maximum rank',()=>{
    for(const change of [{residenceOwner:false},{balanceBronze:3199n},{residenceRank:2}]) {
      const {palette,model,buy}=fixture();palette.setModel({...model,...change});buy();
      expect(palette.takeExpansionRequest()).toBeNull();
    }
  });
  it('permits retry after rejection but ignores a failure from another scope',()=>{
    const {palette,buy}=fixture();buy();palette.takeExpansionRequest();
    palette.expansionFailed('other',0,1);buy();expect(palette.takeExpansionRequest()).toBeNull();
    palette.expansionFailed('home',0,1);buy();expect(palette.takeExpansionRequest()).toEqual({token:2,rank:0,scope:'home'});
  });
  it('does not let an old rejection unlock a newer request after revisiting the same room',()=>{
    const {palette,model,buy}=fixture();buy();const old=palette.takeExpansionRequest()!;
    palette.setModel({...model,scope:'other'});palette.setModel(model);
    const room=homesteadBuildPaletteCells(palette.bounds,0,4)[3]!;
    palette.pointerDown({x:room.x+1,y:room.y+1},0);buy();
    const current=palette.takeExpansionRequest()!;expect(current.token).not.toBe(old.token);
    palette.expansionFailed(old.scope,old.rank,old.token);buy();expect(palette.takeExpansionRequest()).toBeNull();
    palette.expansionFailed(current.scope,current.rank,current.token);buy();expect(palette.takeExpansionRequest()).not.toBeNull();
  });

});


it('places residence upgrade rows below every furnishing control', () => {
  const registry = bootstrapContentRegistry();
  const entries = [...homesteadBuildDefinitions(registry).values()].slice(0, 4).map(entry => ({ ...entry, iconAnimation: 'base' }));
  const model = { width: 640, height: 480, entries, furnishing: true, upgrades: Object.values(registry.compiled.upgrades) };
  const bounds = homesteadBuildPaletteBounds(model);
  const controls = homesteadBuildPaletteCells(bounds, entries.length, 4);
  const upgrades = homesteadUpgradePaletteCells(bounds, model);
  expect(upgrades[0]!.y).toBeGreaterThanOrEqual(Math.max(...controls.map(cell => cell.y + cell.height)));
});
