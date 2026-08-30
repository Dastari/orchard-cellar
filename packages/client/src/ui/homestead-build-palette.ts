import {
  BRONZE_PER_GOLD,
  HOMESTEAD_BUILD_DEFINITIONS,
  HOMESTEAD_UPGRADE_DEFINITIONS,
  HOMESTEAD_UPGRADE_KINDS,
  homesteadUpgradeCostBronze,
  itemDefinition,
  type HomesteadBuildLayer,
  type HomesteadUpgradeKind,
} from '@orchard/sim';
import type { LoadedAsset } from '../render/assets.js';
import { drawOutlinedPixelText, drawPixelText, type PixelUi } from '../render/pixel-ui.js';
import { drawUiInventorySlotBacking, uiInventorySelectorRect } from './design-system/inventory.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { drawUiSkinAsset, drawUiSkinNatural, uiAssetFrame, type UiSkin } from './skin.js';

const CELL_SIZE = 28;
const COLUMNS = 9;
const PALETTE_WIDTH = 304;
const PALETTE_HEIGHT = 174;

export type HomesteadBuildSelection =
  | { readonly kind: 'place'; readonly itemKind: string }
  | { readonly kind: 'remove' };

export interface HomesteadBuildPaletteModel {
  readonly width: number;
  readonly height: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly upgradeRanks: Readonly<Partial<Record<HomesteadUpgradeKind, number>>>;
  readonly balanceBronze: bigint;
}

export interface HomesteadBuildPaletteEntry {
  readonly itemKind: string;
  readonly displayName: string;
  readonly layer: HomesteadBuildLayer;
}

export const HOMESTEAD_BUILD_PALETTE_ENTRIES: readonly HomesteadBuildPaletteEntry[] = Object.values(
  HOMESTEAD_BUILD_DEFINITIONS,
).map(({ itemKind, displayName, layer }) => ({ itemKind, displayName, layer }));

export function homesteadBuildPaletteBounds(model: Pick<HomesteadBuildPaletteModel, 'width'>): UiRect {
  return {
    x: Math.max(4, Math.round((model.width - PALETTE_WIDTH) / 2)),
    y: 42,
    width: PALETTE_WIDTH,
    height: PALETTE_HEIGHT,
  };
}

export function homesteadBuildPaletteCells(bounds: UiRect): readonly UiRect[] {
  return Array.from({ length: HOMESTEAD_BUILD_PALETTE_ENTRIES.length + 1 }, (_, index) => ({
    x: bounds.x + 14 + index % COLUMNS * CELL_SIZE,
    y: bounds.y + 25 + Math.floor(index / COLUMNS) * CELL_SIZE,
    width: 28,
    height: 28,
  }));
}

export function homesteadUpgradePaletteCells(bounds: UiRect): readonly UiRect[] {
  return HOMESTEAD_UPGRADE_KINDS.map((_kind, index) => ({
    x: bounds.x + 12,
    y: bounds.y + 96 + index * 18,
    width: bounds.width - 24,
    height: 16,
  }));
}

export class HomesteadBuildPalette {
  private model: HomesteadBuildPaletteModel = {
    width: 320, height: 180, counts: {}, upgradeRanks: {}, balanceBronze: 0n,
  };
  private pointer: UiPoint = { x: -100, y: -100 };
  private selected: HomesteadBuildSelection = {
    kind: 'place',
    itemKind: HOMESTEAD_BUILD_PALETTE_ENTRIES[0]?.itemKind ?? 'fence',
  };
  private purchaseRequest: HomesteadUpgradeKind | null = null;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly itemArt: Readonly<Record<string, LoadedAsset>>,
  ) {}

  get selection(): HomesteadBuildSelection { return this.selected; }

  takePurchaseRequest(): HomesteadUpgradeKind | null {
    const request = this.purchaseRequest;
    this.purchaseRequest = null;
    return request;
  }

  setModel(model: HomesteadBuildPaletteModel): void { this.model = model; }

  pointerMove(point: UiPoint): boolean {
    this.pointer = point;
    return containsPoint(homesteadBuildPaletteBounds(this.model), point);
  }

  pointerLeave(): void { this.pointer = { x: -100, y: -100 }; }

  pointerDown(point: UiPoint, button: number): boolean {
    const bounds = homesteadBuildPaletteBounds(this.model);
    if (!containsPoint(bounds, point)) return false;
    if (button !== 0) return true;
    const upgradeIndex = homesteadUpgradePaletteCells(bounds)
      .findIndex((cell) => containsPoint(cell, point));
    if (upgradeIndex >= 0) {
      const kind = HOMESTEAD_UPGRADE_KINDS[upgradeIndex];
      if (kind !== undefined) this.purchaseRequest = kind;
      return true;
    }
    const index = homesteadBuildPaletteCells(bounds).findIndex((cell) => containsPoint(cell, point));
    if (index < 0) return true;
    const entry = HOMESTEAD_BUILD_PALETTE_ENTRIES[index];
    this.selected = entry === undefined ? { kind: 'remove' } : { kind: 'place', itemKind: entry.itemKind };
    return true;
  }

  draw(context: CanvasRenderingContext2D): void {
    const bounds = homesteadBuildPaletteBounds(this.model);
    drawUiSkinAsset(context, this.skin.panelParchment, bounds);
    const ribbon = drawUiSkinNatural(
      context,
      this.skin.ribbon,
      bounds.x + Math.round((bounds.width - (uiAssetFrame(this.skin.ribbon)?.width ?? 0)) / 2),
      bounds.y - 3,
    );
    drawOutlinedPixelText(
      context,
      this.fonts,
      'BUILD',
      bounds.x + bounds.width / 2,
      (ribbon?.y ?? bounds.y) + 7,
      { align: 'center', color: '#51351f', outlineColor: '#f8d4a2', font: 'header' },
    );
    const cells = homesteadBuildPaletteCells(bounds);
    HOMESTEAD_BUILD_PALETTE_ENTRIES.forEach((entry, index) => {
      const rect = cells[index]!;
      const count = this.model.counts[entry.itemKind] ?? 0;
      const selected = this.selected.kind === 'place' && this.selected.itemKind === entry.itemKind;
      const hovered = containsPoint(rect, this.pointer);
      drawUiInventorySlotBacking(context, this.skin, rect, entry.itemKind, count === 0);
      const asset = this.itemArt[entry.itemKind];
      const frame = asset === undefined ? null : uiAssetFrame(
        asset,
        itemDefinition(entry.itemKind)?.iconAnimation ?? 'base',
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
    const removeRect = cells[cells.length - 1]!;
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
    const hoveredIndex = cells.findIndex((cell) => containsPoint(cell, this.pointer));
    const hovered = HOMESTEAD_BUILD_PALETTE_ENTRIES[hoveredIndex];
    const label = hovered?.displayName
      ?? (hoveredIndex === cells.length - 1 ? 'REMOVE / REFUND' : this.selected.kind === 'remove'
        ? 'REMOVE / REFUND'
        : itemDefinition(this.selected.itemKind)?.displayName ?? this.selected.itemKind);
    drawPixelText(context, this.fonts, label.toUpperCase(), bounds.x + bounds.width / 2, bounds.y + 91, {
      align: 'center', color: '#6b4428',
    });
    for (const [index, kind] of HOMESTEAD_UPGRADE_KINDS.entries()) {
      const rect = homesteadUpgradePaletteCells(bounds)[index]!;
      const definition = HOMESTEAD_UPGRADE_DEFINITIONS[kind];
      const rank = this.model.upgradeRanks[kind] ?? 0;
      const maximum = rank >= definition.maximumRank;
      const cost = maximum ? 0n : homesteadUpgradeCostBronze(kind, rank);
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
