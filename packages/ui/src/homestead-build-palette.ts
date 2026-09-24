import { BRONZE_PER_GOLD, hearthResidenceExpansionQuote, type HearthConstructionTool, type HomesteadUpgradeKind } from '@orchard/sim';
import type { LoadedAsset } from './assets.js';
import type { UiRect } from './geometry.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiBuildPalette, type UiBuildPaletteAction, type UiBuildPaletteEntry, type UiBuildPaletteModel,
  type UiBuildPaletteView, type UiBuildSelection } from './kit/components/build-palette.js';
import { uiFixed } from './kit/layout/box.js';
import { UiElement } from './kit/runtime/element.js';
import { UiRoot } from './kit/runtime/root.js';

export type HomesteadBuildSelection = UiBuildSelection;
export type HomesteadBuildPaletteEntry = UiBuildPaletteEntry;
export interface HomesteadBuildPaletteModel extends Omit<UiBuildPaletteModel, 'selection' | 'view' | 'expansionPending' | 'constructionTool'> {
  readonly scope?: string;
  readonly width: number;
  readonly height: number;
}

/** Logical game HUD bounds. Overflow stays in the shared scroll area. */
export function homesteadBuildPaletteBounds(model: Pick<HomesteadBuildPaletteModel, 'width' | 'height' | 'entries' | 'upgrades' | 'furnishing'>,
  view: UiBuildPaletteView = 'catalogue', construction = false): UiRect {
  const width = Math.max(0, Math.min(322, model.width - 8));
  // Catalogue: window chrome, nine-slot rows, the selection row, furnishing actions, upgrades and the hint line.
  const desired = view === 'selection' ? construction ? 220 : 100 : view === 'expansion' ? 220
    : view === 'construction' ? 320 : 48 + Math.max(1, Math.ceil(model.entries.length / 9)) * 33 + 37
      + (model.furnishing ? 30 : 0) + model.upgrades.length * 28 + 30;
  const height = Math.max(0, Math.min(desired, model.height - 8));
  return { x: Math.max(4, Math.round((model.width - width) / 2)), y: 4, width, height };
}

/** Retained presentation adapter only. The client owns visibility, listeners,
 * frame scheduling and network authority. Requests are drained after activation. */
export class HomesteadBuildPalette {
  readonly root: UiRoot;
  private palette: ReturnType<typeof uiBuildPalette>;
  private readonly stage: UiElement;
  private model: HomesteadBuildPaletteModel = { width: 320, height: 180, entries: [], upgrades: [], counts: {}, upgradeRanks: {}, balanceBronze: 0n };
  private selected: HomesteadBuildSelection = { kind: 'remove' };
  private view: UiBuildPaletteView = 'catalogue';
  private selectedConstruction: HearthConstructionTool | null = null;
  private purchaseRequest: HomesteadUpgradeKind | null = null;
  private undoMoveRequested = false;
  private constructionApply = false;
  private constructionCancel = false;
  private expansionPending = false;
  private expansionSequence = 0;
  private activeExpansion: number | null = null;
  private expansionRequest: { token: number; rank: number; scope: string | undefined } | null = null;

  constructor(art: UiKitArt, private readonly itemArt: Readonly<Record<string, LoadedAsset>>, private readonly onActionReady?: () => void,
    /** The window's wooden close; the client leaves build mode. */
    private readonly onClose?: () => void) {
    this.root = new UiRoot({ art, scale: 1, label: 'Build palette' });
    this.stage = new UiElement({ id: 'game.build-palette.stage', style: { display: 'flex', direction: 'column', align: 'center', position: 'absolute' } });
    this.root.mount(this.stage);
    this.palette = this.createPalette(); this.stage.append(this.palette); this.refresh();
  }
  private createPalette(): ReturnType<typeof uiBuildPalette> {
    const palette = uiBuildPalette({ model: { ...this.model, selection: this.selected }, artwork: this.itemArt,
      onSelect: selection => {
        if (this.model.constructionPending || selection.kind === 'move' && !this.model.furnishing) return;
        if (selection.kind === 'place' && !this.model.entries.some(entry => entry.itemKind === selection.itemKind)) return;
        this.selected = selection; this.selectedConstruction = null;
        if (this.model.furnishing) this.view = 'selection';
        this.changed();
      },
      onPurchase: kind => {
        const definition = this.model.upgrades.find(value => value.kind === kind); if (!definition) return;
        const rank = this.model.upgradeRanks[kind] ?? 0;
        const cost = BigInt(Math.round(definition.baseCostGold * definition.costGrowth ** rank)) * BRONZE_PER_GOLD;
        if (this.model.constructionPending || rank >= definition.maximumRank || this.model.balanceBronze < cost) return;
        this.purchaseRequest = kind; this.changed();
      },
      onConstructionTool: tool => {
        if (!this.model.furnishing || this.model.constructionPending) return;
        this.selectedConstruction = tool; this.view = 'selection'; this.changed();
      },
      onAction: action => this.action(action),
      onClose: this.onClose ? () => { if (!this.root.disposed) this.onClose?.(); } : undefined,
    });
    palette.setProps({ touchScroll: true, singlePointer: true }, false);
    return palette;
  }

  get selection(): HomesteadBuildSelection { return this.selected; }
  get constructionTool(): HearthConstructionTool | null { return this.selectedConstruction; }
  get bounds(): UiRect { return homesteadBuildPaletteBounds(this.model, this.view, this.selectedConstruction !== null); }
  /** Opening build mode lands keyboard focus on the palette window itself, so X and Tab act on it
   * without opening a slot tooltip over the selection. */
  showCatalogue(): void {
    this.view = this.selectedConstruction ? 'construction' : 'catalogue'; this.refresh();
    const current = this.root.focus.current;
    if (!current || current.disposed) { this.root.arrange(); this.root.focus.set(this.palette); }
  }
  takePurchaseRequest(): HomesteadUpgradeKind | null { const value = this.purchaseRequest; this.purchaseRequest = null; return value; }
  takeUndoMoveRequest(): boolean { const value = this.undoMoveRequested; this.undoMoveRequested = false; return value; }
  takeConstructionApply(): boolean { const value = this.constructionApply; this.constructionApply = false; return value; }
  takeConstructionCancel(): boolean { const value = this.constructionCancel; this.constructionCancel = false; return value; }
  takeExpansionRequest() { const value = this.expansionRequest; this.expansionRequest = null; return value; }
  expansionFailed(scope: string | undefined, rank: number, token: number): void {
    if (token === this.activeExpansion && scope === this.model.scope && rank === this.model.residenceRank) {
      this.expansionPending = false; this.refresh();
    }
  }

  setModel(model: HomesteadBuildPaletteModel): void {
    if (this.root.disposed) return;
    const initial = this.model.entries.length === 0;
    const scopeChanged = model.scope !== this.model.scope;
    if (scopeChanged || !model.furnishing) this.selectedConstruction = null;
    if (scopeChanged || model.furnishing !== this.model.furnishing) this.view = 'catalogue';
    if (scopeChanged || model.residenceRank !== this.model.residenceRank) {
      this.expansionPending = false; this.expansionRequest = null; this.activeExpansion = null;
    }
    if (scopeChanged) {
      this.purchaseRequest = null; this.undoMoveRequested = false; this.constructionApply = false; this.constructionCancel = false;
      this.root.input.cancelPointers(); this.root.input.clearHover(); this.root.focus.set(null);
    }
    this.model = model;
    // A new identity/session/space invalidates captured controls from the old scope.
    // The root stays stable; ordinary snapshots preserve the complete subtree.
    if (scopeChanged) { this.palette.dispose(); this.palette = this.createPalette(); this.stage.append(this.palette); }
    if (!model.furnishing && this.selected.kind === 'move') this.selected = { kind: 'remove' };
    if (initial || this.selected.kind === 'place' && !model.entries.some(entry => this.selected.kind === 'place' && entry.itemKind === this.selected.itemKind)) {
      const first = model.entries[0]; this.selected = first ? { kind: 'place', itemKind: first.itemKind } : { kind: 'remove' };
    }
    this.root.resize(model.width, model.height, 1); this.refresh();
  }

  draw(context: CanvasRenderingContext2D, now = performance.now()): void { if (!this.root.disposed) this.root.drawInContext(context, now); }
  dispose(): void { this.expansionSequence++; this.activeExpansion = null; this.expansionRequest = null; this.root.dispose(); }

  private changed(): void { this.refresh(); this.onActionReady?.(); }
  private action(action: UiBuildPaletteAction): void {
    if (!this.model.furnishing || this.model.constructionPending || this.root.disposed) return;
    if (action === 'catalogue') { this.view = 'catalogue'; this.selectedConstruction = null; }
    else if (action === 'construction') this.view = 'construction';
    else if (action === 'expansion') { this.view = 'expansion'; this.selectedConstruction = null; }
    else if (action === 'undo') { if (!this.model.canUndoMove) return; this.undoMoveRequested = true; this.view = 'selection'; }
    else if (action === 'apply') { if (!this.model.constructionCanApply || this.selectedConstruction === null) return; this.constructionApply = true; }
    else if (action === 'cancel') { if (this.selectedConstruction === null) return; this.constructionCancel = true; }
    else {
      const quote = hearthResidenceExpansionQuote(this.model.residenceRank ?? -1);
      if (!quote || !this.model.residenceOwner || this.expansionPending || this.model.balanceBronze < quote.costBronze) return;
      this.expansionPending = true; this.activeExpansion = ++this.expansionSequence;
      this.expansionRequest = { token: this.activeExpansion, rank: this.model.residenceRank!, scope: this.model.scope };
    }
    this.palette.scrollArea.scroll.y = 0; this.changed();
  }
  private refresh(): void {
    if (this.root.disposed) return;
    // The window fits its content, centred at the top of the logical bounds, which cap it (a long catalogue scrolls).
    const bounds = this.bounds;
    this.stage.setStyle({ inset: { left: uiFixed(bounds.x), top: uiFixed(bounds.y) }, width: uiFixed(bounds.width), height: uiFixed(bounds.height) });
    this.palette.setStyle({ maxWidth: uiFixed(bounds.width), maxHeight: uiFixed(bounds.height) });
    this.palette.scrollArea.setStyle({ maxHeight: uiFixed(Math.max(0, bounds.height - 48)) });
    this.palette.updateBuildPalette({ ...this.model, selection: this.selected, view: this.view,
      constructionTool: this.selectedConstruction, expansionPending: this.expansionPending });
  }
}
