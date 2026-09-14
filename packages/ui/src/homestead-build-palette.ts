import {
  BRONZE_PER_GOLD, hearthResidenceExpansionQuote, HEARTH_CONSTRUCTION_TOOLS, type HearthConstructionTool,
  type HomesteadBuildLayer,
  type HomesteadUpgradeDefinition,
  type HomesteadUpgradeKind,
} from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import { drawOutlinedPixelText, drawPixelText, drawPixelTextInRect, type PixelUi } from './pixel-ui.js';
import { drawUiInventorySlotBacking, uiInventorySelectorRect } from './design-system/inventory.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { drawUiSkinAsset, drawUiSkinNatural, uiAssetFrame, type UiSkin } from './skin.js';

const CELL_SIZE = 28;
const COLUMNS = 9;
const PALETTE_WIDTH = 304;

export type HomesteadBuildSelection =
  | { readonly kind: 'place'; readonly itemKind: string }
  | { readonly kind: 'move' }
  | { readonly kind: 'remove' };

export interface HomesteadBuildPaletteModel {
  readonly scope?: string;
  readonly furnishing?: boolean;
  readonly status?: string;
  readonly constructionCanApply?: boolean;
  readonly constructionPending?: boolean;
  readonly constructionStatus?: {readonly footprint:number;readonly materials:readonly string[];readonly notice:string} | undefined;
  readonly canUndoMove?: boolean;
  readonly residenceRank?: number | undefined;
  readonly residenceOwner?: boolean | undefined;
  readonly width: number;
  readonly height: number;
  readonly entries: readonly HomesteadBuildPaletteEntry[];
  readonly upgrades: readonly HomesteadUpgradeDefinition[];
  readonly counts: Readonly<Record<string, number>>;
  readonly upgradeRanks: Readonly<Partial<Record<HomesteadUpgradeKind, number>>>;
  readonly balanceBronze: bigint;
}

export interface HomesteadBuildPaletteEntry {
  readonly itemKind: string;
  readonly displayName: string;
  readonly layer: HomesteadBuildLayer;
  readonly iconAnimation: string;
}

export function homesteadBuildPaletteBounds(model: Pick<HomesteadBuildPaletteModel, 'width' | 'entries' | 'upgrades' | 'furnishing'> & { readonly height?: number }): UiRect {
  const height = 48 + Math.ceil((model.entries.length + (model.furnishing ? 4 : 1)) / COLUMNS) * CELL_SIZE + model.upgrades.length * 18;
  return {
    x: Math.max(4, Math.round((model.width - PALETTE_WIDTH) / 2)),
    y: Math.min(42, Math.max(4, (model.height ?? 270) - height - 4)),
    width: PALETTE_WIDTH,
    height,
  };
}

export function homesteadBuildPaletteCells(bounds: UiRect, entryCount: number, toolCount = 1): readonly UiRect[] {
  return Array.from({ length: entryCount + toolCount }, (_, index) => ({
    x: bounds.x + 14 + index % COLUMNS * CELL_SIZE,
    y: bounds.y + 25 + Math.floor(index / COLUMNS) * CELL_SIZE,
    width: 28,
    height: 28,
  }));
}

export function homesteadUpgradePaletteCells(bounds: UiRect, model: Pick<HomesteadBuildPaletteModel, 'entries' | 'upgrades'>): readonly UiRect[] {
  return model.upgrades.map((_upgrade, index) => ({
    x: bounds.x + 12,
    y: bounds.y + 44 + Math.ceil((model.entries.length + 1) / COLUMNS) * CELL_SIZE + index * 18,
    width: bounds.width - 24,
    height: 16,
  }));
}

export class HomesteadBuildPalette {
  private model: HomesteadBuildPaletteModel = {
    width: 320, height: 180, entries: [], upgrades: [], counts: {}, upgradeRanks: {}, balanceBronze: 0n,
  };
  private pointer: UiPoint = { x: -100, y: -100 };
  private selected: HomesteadBuildSelection = { kind: 'remove' };
  private purchaseRequest: HomesteadUpgradeKind | null = null;
  private undoMoveRequested = false;
  private collapsed = false;
  private expansionView = false;
  private constructionView = false;
  private constructionApply=false;
  private constructionCancel=false;
  takeConstructionApply():boolean{const value=this.constructionApply;this.constructionApply=false;return value;}
  takeConstructionCancel():boolean{const value=this.constructionCancel;this.constructionCancel=false;return value;}
  private selectedConstruction: HearthConstructionTool | null = null;
  get constructionTool(): HearthConstructionTool | null { return this.selectedConstruction; }
  private expansionPending = false;
  private expansionSequence = 0;
  private activeExpansion: number | null = null;
  private expansionRequest: {token: number; rank: number; scope: string | undefined} | null = null;
  takeExpansionRequest() { const request=this.expansionRequest; this.expansionRequest=null; return request; }
  expansionFailed(scope: string | undefined, rank: number, token: number): void { if(token===this.activeExpansion && scope===this.model.scope && rank===this.model.residenceRank)this.expansionPending=false; }


  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly itemArt: Readonly<Record<string, LoadedAsset>>,
  ) {}

  get selection(): HomesteadBuildSelection { return this.selected; }
  get bounds(): UiRect {
    const expanded = homesteadBuildPaletteBounds(this.model);
    if(this.constructionView && !this.collapsed && this.model.furnishing)return {...expanded,y:4,height:172};
    if(this.expansionView && this.model.furnishing)return {...expanded,y:4,height:160};
    return this.collapsed && this.model.furnishing ? { ...expanded, y: 4, height: this.selectedConstruction!==null&&(this.model.constructionCanApply||this.model.constructionPending)?116:32 } : expanded;
  }
  showCatalogue(): void { this.collapsed = false; }
  takeUndoMoveRequest(): boolean { const requested = this.undoMoveRequested; this.undoMoveRequested = false; return requested; }

  takePurchaseRequest(): HomesteadUpgradeKind | null {
    const request = this.purchaseRequest;
    this.purchaseRequest = null;
    return request;
  }

  setModel(model: HomesteadBuildPaletteModel): void {
    const initial = this.model.entries.length === 0;
    if(model.scope!==this.model.scope || !model.furnishing){this.constructionView=false;this.selectedConstruction=null;}
    if (model.scope !== this.model.scope || model.furnishing !== this.model.furnishing) this.showCatalogue();
    if (model.scope !== this.model.scope || model.residenceRank !== this.model.residenceRank) {
      this.expansionPending=false;this.expansionRequest=null;this.activeExpansion=null;
      if(model.scope!==this.model.scope)this.expansionView=false;
    }
    this.model = model;
    if (!model.furnishing && this.selected.kind === 'move') this.selected = { kind: 'remove' };
    if (initial || (this.selected.kind === 'place'
      && !model.entries.some((entry) => this.selected.kind === 'place' && entry.itemKind === this.selected.itemKind))) {
      const first = model.entries[0];
      this.selected = first === undefined ? { kind: 'remove' } : { kind: 'place', itemKind: first.itemKind };
    }
  }

  pointerMove(point: UiPoint): boolean {
    this.pointer = point;
    return containsPoint(this.bounds, point);
  }

  pointerLeave(): void { this.pointer = { x: -100, y: -100 }; }

  pointerDown(point: UiPoint, button: number): boolean {
    const bounds = this.bounds;
    if (!containsPoint(bounds, point)) return false;
    if (button !== 0) return true;
    if(this.collapsed&&this.model.furnishing&&this.selectedConstruction!==null){
      if(containsPoint({x:bounds.x+12,y:bounds.y+86,width:136,height:24},point)){
        this.constructionApply=this.model.constructionCanApply===true&&!this.model.constructionPending;return true;
      }
      if(containsPoint({x:bounds.x+156,y:bounds.y+86,width:136,height:24},point)){
        this.constructionCancel=!this.model.constructionPending;return true;
      }
      if(point.y<bounds.y+22&&!this.model.constructionPending)this.showCatalogue();
      return true;
    }
    if (this.collapsed && this.model.furnishing) { this.showCatalogue(); return true; }
    if(this.model.furnishing && !this.expansionView && containsPoint({x:bounds.x+bounds.width-78,y:bounds.y+2,width:72,height:20},point)) {
      this.constructionView=!this.constructionView;
      if(!this.constructionView)this.selectedConstruction=null;
      return true;
    }
    if(this.constructionView && this.model.furnishing){
      const index=HEARTH_CONSTRUCTION_TOOLS.findIndex((_tool,i)=>containsPoint(constructionToolRect(bounds,i),point));
      const tool=HEARTH_CONSTRUCTION_TOOLS[index];
      if(tool){this.selectedConstruction=tool.id;this.collapsed=true;}
      return true;
    }
    if (this.expansionView && this.model.furnishing) {
      if(containsPoint({x:bounds.x+12,y:bounds.y+28,width:80,height:24},point))this.expansionView=false;
      else if(containsPoint({x:bounds.x+12,y:bounds.y+112,width:bounds.width-24,height:28},point)) {
        const quote=hearthResidenceExpansionQuote(this.model.residenceRank ?? -1);
        if(quote && this.model.residenceOwner && !this.expansionPending && this.model.balanceBronze>=quote.costBronze) {
          this.expansionPending=true;this.activeExpansion=++this.expansionSequence;this.expansionRequest={token:this.activeExpansion,rank:this.model.residenceRank!,scope:this.model.scope};
        }
      }
      return true;
    }
    const upgradeIndex = homesteadUpgradePaletteCells(bounds, this.model)
      .findIndex((cell) => containsPoint(cell, point));
    if (upgradeIndex >= 0) {
      const kind = this.model.upgrades[upgradeIndex]?.kind;
      if (kind !== undefined) this.purchaseRequest = kind;
      return true;
    }
    const index = homesteadBuildPaletteCells(bounds, this.model.entries.length, this.model.furnishing ? 4 : 1).findIndex((cell) => containsPoint(cell, point));
    if (index < 0) return true;
    this.selectedConstruction=null;
    if(this.model.furnishing && index===this.model.entries.length+3){this.expansionView=true;return true;}
    if (this.model.furnishing && index === this.model.entries.length + 1) { this.selected = { kind: 'move' }; this.collapsed = true; return true; }
    if (this.model.furnishing && index === this.model.entries.length + 2) {
      this.undoMoveRequested = this.model.canUndoMove === true;
      if (this.undoMoveRequested) this.collapsed = true;
      return true;
    }
    const entry = this.model.entries[index];
    this.selected = entry === undefined ? { kind: 'remove' } : { kind: 'place', itemKind: entry.itemKind };
    this.collapsed = this.model.furnishing === true;
    return true;
  }

  draw(context: CanvasRenderingContext2D): void {
    const bounds = this.bounds;
    drawUiSkinAsset(context, this.skin.panelParchment, bounds);
    if(this.collapsed&&this.model.furnishing&&this.selectedConstruction!==null){
      const status=this.model.constructionStatus;
      const tool=HEARTH_CONSTRUCTION_TOOLS.find(tool=>tool.id===this.selectedConstruction)!;
      if(bounds.height===32){
        drawPixelTextInRect(context,this.fonts,'CONSTRUCT — CHANGE TOOL',{x:bounds.x+12,y:bounds.y+5,width:bounds.width-24,height:10},{color:'#51351f'});
        drawPixelTextInRect(context,this.fonts,tool.label.toUpperCase()+' / CLICK TILE TO REVIEW',{x:bounds.x+12,y:bounds.y+17,width:bounds.width-24,height:10},{color:'#6b4428'});
        return;
      }
      const lines=['CONSTRUCT — CHANGE TOOL',tool.label.toUpperCase()+(status?' / '+status.footprint+' TILES':''),
        ...(status?.materials.length?status.materials:['NO MATERIAL CHANGE']),status?.notice??'CHOOSE A TILE TO PREVIEW'];
      for(const [index,line] of lines.entries())drawPixelTextInRect(context,this.fonts,line,
        {x:bounds.x+12,y:bounds.y+7+index*12,width:bounds.width-24,height:10},{color:index===lines.length-1?'#6b4428':'#51351f'});
      for(const [index,label] of ['APPLY','CANCEL'].entries()){
        const rect={x:bounds.x+12+index*144,y:bounds.y+86,width:136,height:24};
        const enabled=!this.model.constructionPending&&(index===1||this.model.constructionCanApply===true);
        drawUiSkinAsset(context,this.skin.button,rect,enabled?'idle':'disabled');
        drawPixelTextInRect(context,this.fonts,label,{...rect,y:rect.y+8,height:10},{align:'center',color:'#51351f'});
      }
      return;
    }
    if (this.collapsed && this.model.furnishing) {
      const selection = this.selected;
      const entry = this.selectedConstruction===null && selection.kind === 'place' ? this.model.entries.find(entry => entry.itemKind === selection.itemKind) : undefined;
      const asset = entry && this.itemArt[entry.itemKind], frame = asset && uiAssetFrame(asset, entry.iconAnimation);
      if (asset && frame) {
        const scale = Math.min(24 / frame.width, 24 / frame.height);
        const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale);
        context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height,
          bounds.x + 6 + Math.round((24 - width) / 2), bounds.y + 4 + Math.round((24 - height) / 2), width, height);
      }
      drawPixelTextInRect(context, this.fonts, this.selectedConstruction?'CONSTRUCT — CHANGE TOOL':'FURNISH — CHANGE SELECTION',
        { x: bounds.x + 36, y: bounds.y + 4, width: bounds.width - 42, height: 10 }, { color: '#51351f' });
      drawPixelTextInRect(context, this.fonts, (this.model.status ?? HEARTH_CONSTRUCTION_TOOLS.find(tool=>tool.id===this.selectedConstruction)?.label ?? entry?.displayName ?? (selection.kind === 'move' ? 'MOVE FURNITURE' : 'PICK UP INTACT')).toUpperCase(),
        { x: bounds.x + 36, y: bounds.y + 16, width: bounds.width - 42, height: 10 }, { color: '#6b4428' });
      return;
    }
    const ribbon = drawUiSkinNatural(
      context,
      this.skin.ribbon,
      bounds.x + Math.round((bounds.width - (uiAssetFrame(this.skin.ribbon)?.width ?? 0)) / 2),
      bounds.y - 3,
    );
    drawOutlinedPixelText(
      context,
      this.fonts,
      this.constructionView ? 'CONSTRUCT' : this.model.furnishing ? 'FURNISH' : 'BUILD',
      bounds.x + bounds.width / 2,
      (ribbon?.y ?? bounds.y) + 7,
      { align: 'center', color: '#51351f', outlineColor: '#f8d4a2', font: 'header' },
    );
    if(this.model.furnishing&&!this.expansionView){
      const tab={x:bounds.x+bounds.width-78,y:bounds.y+2,width:72,height:20};
      drawUiSkinAsset(context,this.skin.button,tab);
      drawPixelTextInRect(context,this.fonts,this.constructionView?'FURNITURE':'CONSTRUCT',{...tab,y:tab.y+6,height:10},{align:'center',color:'#51351f'});
    }
    if(this.constructionView&&this.model.furnishing){
      HEARTH_CONSTRUCTION_TOOLS.forEach((tool,index)=>{
        const rect=constructionToolRect(bounds,index);
        drawUiSkinAsset(context,this.skin.button,rect,tool.id===this.selectedConstruction?'pressed':containsPoint(rect,this.pointer)?'hover':'idle');
        drawPixelTextInRect(context,this.fonts,tool.label.toUpperCase(),{...rect,x:rect.x+5,y:rect.y+8,width:rect.width-10,height:10},{align:'center',color:'#51351f'});
      });
      drawPixelTextInRect(context,this.fonts,'SELECT TOOL, THEN CHOOSE A TILE',{x:bounds.x+12,y:bounds.y+152,width:bounds.width-24,height:10},{color:'#6b4428'});
      return;
    }
    if(this.expansionView && this.model.furnishing) {
      const quote=hearthResidenceExpansionQuote(this.model.residenceRank ?? -1);
      const back={x:bounds.x+12,y:bounds.y+28,width:80,height:24};
      drawUiSkinAsset(context,this.skin.button,back);
      drawPixelTextInRect(context,this.fonts,'BACK',{...back,x:back.x+6,y:back.y+7,width:back.width-12,height:12},{align:'center',color:'#51351f'});
      drawPixelText(context,this.fonts,quote?quote.name.toUpperCase():'ALL ROOMS BUILT',bounds.x+12,bounds.y+60,{color:'#51351f'});
      drawPixelText(context,this.fonts,quote?'10 x 10 ROOM + CONNECTING HALL':'BOTH EXPANSIONS ARE OWNED',bounds.x+12,bounds.y+76,{color:'#6b4428'});
      drawPixelText(context,this.fonts,quote?`COST ${quote.costBronze} BRONZE / WALLET ${this.model.balanceBronze}`:'',bounds.x+12,bounds.y+92,{color:'#6b4428'});
      const enabled=quote!==null && this.model.residenceOwner && !this.expansionPending && this.model.balanceBronze>=quote.costBronze;
      const purchase={x:bounds.x+12,y:bounds.y+112,width:bounds.width-24,height:28};
      drawUiSkinAsset(context,this.skin.button,purchase,enabled?'idle':'disabled');
      drawPixelTextInRect(context,this.fonts,this.expansionPending?'WAITING FOR SERVER':!this.model.residenceOwner?'OWNER PURCHASE ONLY':!quote?'COMPLETE':this.model.balanceBronze<quote.costBronze?'NOT ENOUGH BRONZE':'BUY '+quote.name.toUpperCase(),{...purchase,x:purchase.x+6,y:purchase.y+9,width:purchase.width-12,height:12},{align:'center',color:'#51351f'});
      return;
    }
    const cells = homesteadBuildPaletteCells(bounds, this.model.entries.length, this.model.furnishing ? 4 : 1);
    this.model.entries.forEach((entry, index) => {
      const rect = cells[index]!;
      const count = this.model.counts[entry.itemKind] ?? 0;
      const selected = this.selected.kind === 'place' && this.selected.itemKind === entry.itemKind;
      const hovered = containsPoint(rect, this.pointer);
      drawUiInventorySlotBacking(context, this.skin, rect, entry.itemKind, count === 0);
      const asset = this.itemArt[entry.itemKind];
      const frame = asset === undefined ? null : uiAssetFrame(
        asset,
        entry.iconAnimation,
      );
      if (asset !== undefined && frame !== null) {
        const scale = Math.min(16 / frame.width, 16 / frame.height);
        const width = Math.max(1, Math.round(frame.width * scale));
        const height = Math.max(1, Math.round(frame.height * scale));
        context.drawImage(
          asset.image,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          Math.round(rect.x + (rect.width - width) / 2),
          Math.round(rect.y + (rect.height - height) / 2),
          width,
          height,
        );
      }
      drawOutlinedPixelText(context, this.fonts, String(count), rect.x + rect.width - 3, rect.y + rect.height - 8, {
        align: 'right', color: count > 0 ? '#3f2832' : '#a9363e', outlineColor: '#f8ead0',
      });
      if (selected || hovered) drawUiSkinAsset(
        context,
        selected ? this.skin.selectorConfirm : this.skin.selectorNeutral,
        uiInventorySelectorRect(rect),
        'idle',
      );
    });
    const removeRect = cells[this.model.entries.length]!;
    const removing = this.selected.kind === 'remove';
    drawUiInventorySlotBacking(context, this.skin, removeRect, 'empty');
    context.fillStyle = '#a9363e';
    context.fillRect(removeRect.x + 8, removeRect.y + 12, 12, 3);
    context.fillRect(removeRect.x + 12, removeRect.y + 8, 3, 12);
    if (removing || containsPoint(removeRect, this.pointer)) drawUiSkinAsset(
      context,
      this.skin.selectorDeny,
      uiInventorySelectorRect(removeRect),
      'idle',
    );
    if (this.model.furnishing) for (const [offset, label] of [[1, 'M'], [2, 'U'], [3, '+']] as const) {
      const rect = cells[this.model.entries.length + offset]!;
      drawUiInventorySlotBacking(context, this.skin, rect, 'empty', offset === 2 && !this.model.canUndoMove);
      drawPixelText(context, this.fonts, label, rect.x + rect.width / 2, rect.y + 10, { align: 'center', color: '#51351f' });
      if ((offset === 1 && this.selected.kind === 'move') || containsPoint(rect, this.pointer)) {
        drawUiSkinAsset(context, this.skin.selectorNeutral, uiInventorySelectorRect(rect), 'idle');
      }
    }
    const hoveredIndex = cells.findIndex((cell) => containsPoint(cell, this.pointer));
    const hovered = this.model.entries[hoveredIndex];
    const removeLabel = this.model.furnishing ? 'PICK UP INTACT' : 'REMOVE / REFUND';
    const toolLabel = this.model.furnishing && hoveredIndex === this.model.entries.length + 1 ? 'MOVE FURNITURE'
      : this.model.furnishing && hoveredIndex === this.model.entries.length + 2 ? 'UNDO LAST MOVE' : this.model.furnishing && hoveredIndex === this.model.entries.length + 3 ? 'ROOM EXPANSIONS' : undefined;
    const label = toolLabel ?? this.model.status ?? hovered?.displayName
      ?? (hoveredIndex === this.model.entries.length ? removeLabel : this.selected.kind === 'remove'
        ? removeLabel
        : this.selected.kind === 'move' ? 'SELECT FURNITURE, THEN ITS DESTINATION'
          : this.model.entries.find((entry) => this.selected.kind === 'place' && entry.itemKind === this.selected.itemKind)?.displayName ?? this.selected.itemKind);
    drawPixelText(context, this.fonts, label.toUpperCase(), bounds.x + bounds.width / 2, bounds.y + 29 + Math.ceil(cells.length / COLUMNS) * CELL_SIZE, {
      align: 'center', color: '#6b4428',
    });
    for (const [index, definition] of this.model.upgrades.entries()) {
      const kind = definition.kind;
      const rect = homesteadUpgradePaletteCells(bounds, this.model)[index]!;
      const rank = this.model.upgradeRanks[kind] ?? 0;
      const maximum = rank >= definition.maximumRank;
      const cost = maximum ? 0n : BigInt(Math.round(definition.baseCostGold * definition.costGrowth ** rank)) * BRONZE_PER_GOLD;
      const affordable = !maximum && this.model.balanceBronze >= cost;
      const hovered = containsPoint(rect, this.pointer);
      drawUiSkinAsset(context, this.skin.button, rect, maximum ? 'disabled' : hovered ? 'hover' : 'idle');
      drawOutlinedPixelText(
        context,
        this.fonts,
        `${definition.displayName.toUpperCase()} ${rank}/${definition.maximumRank}`,
        rect.x + 6,
        rect.y + 4,
        { color: maximum ? '#8b7461' : '#51351f', outlineColor: '#f8d4a2' },
      );
      drawOutlinedPixelText(
        context,
        this.fonts,
        maximum ? 'MAX' : `${cost / BRONZE_PER_GOLD}G`,
        rect.x + rect.width - 6,
        rect.y + 4,
        { align: 'right', color: affordable || maximum ? '#51351f' : '#a9363e', outlineColor: '#f8d4a2' },
      );
    }
  }
}

export function constructionToolRect(bounds:UiRect,index:number):UiRect {
  return {x:bounds.x+12+(index%2)*140,y:bounds.y+26+Math.floor(index/2)*24,width:136,height:22};
}
