import { containsPoint, type UiPoint, type UiRect, type UiSize } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

export type StorageFrameStyle = 'wood_parchment' | 'wood' | 'parchment';
export type StoragePaneStyle = 'slots' | 'wood' | 'parchment';
export type StoragePaneSizing = 'fixed' | 'flex';
export type StoragePaneAlignment = 'start' | 'center' | 'end';
export type StorageResizeCorner = 'north_west' | 'north_east' | 'south_west' | 'south_east';

export interface StoragePaneSpec {
  readonly id: string;
  readonly label: string;
  readonly columns: number;
  readonly rows: number;
  readonly sizing?: StoragePaneSizing;
  readonly alignment?: StoragePaneAlignment;
  readonly style?: StoragePaneStyle;
  readonly slotSize?: UiSize;
  readonly columnGap?: number;
  readonly rowGap?: number;
  /** Minimum pane region width for custom content such as recipe lists. */
  readonly minWidth?: number;
}

export interface StorageHotbarSpec {
  readonly label?: string;
  readonly columns?: number;
  readonly slotSize?: UiSize;
  readonly columnGap?: number;
}

export interface StorageFrameSpec {
  readonly title: string;
  readonly style: StorageFrameStyle;
  readonly panes: readonly StoragePaneSpec[];
  readonly hotbar?: StorageHotbarSpec;
  readonly preferredWidth?: number;
  readonly minimumGutter?: number;
  readonly resizable?: boolean;
}

export interface StoragePaneLayout {
  readonly id: string;
  readonly label: string;
  readonly style: StoragePaneStyle;
  readonly region: UiRect;
  readonly grid: UiRect;
  readonly labelPosition: UiPoint;
  readonly slots: readonly UiRect[];
}

export interface StorageHotbarLayout {
  readonly label: string;
  readonly region: UiRect;
  readonly labelPosition: UiPoint;
  readonly slots: readonly UiRect[];
}

export interface StorageFrameLayout {
  readonly title: string;
  readonly style: StorageFrameStyle;
  readonly frame: UiRect;
  readonly minimumSize: UiSize;
  readonly panes: readonly StoragePaneLayout[];
  readonly divider: UiRect | null;
  readonly hotbar: StorageHotbarLayout | null;
  readonly resizeHandles: Readonly<Record<StorageResizeCorner, UiRect>>;
  readonly resizable: boolean;
}

const FRAME_MARGIN = 4;
const FRAME_CONTENT_INSET = 17;
const PANE_GRID_TOP = 50;
const PANE_LABEL_TOP = 35;
const PANE_TO_DIVIDER_GAP = 5;
const DIVIDER_HEIGHT = 1;
const HOTBAR_LABEL_GAP = 2;
const HOTBAR_GRID_GAP = 10;
const FRAME_BOTTOM_PADDING = 17;
const DEFAULT_SLOT_SIZE = { width: 28, height: 31 } as const;
const DEFAULT_COLUMN_GAP = 2;
const DEFAULT_ROW_GAP = 0;
const DEFAULT_MINIMUM_GUTTER = 8;
const RESIZE_HANDLE_SIZE = 9;

interface MeasuredPane {
  readonly spec: StoragePaneSpec;
  readonly slotSize: UiSize;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly gridSize: UiSize;
  readonly minimumWidth: number;
}

function safeCount(value: number): number {
  return Math.max(1, Math.floor(value));
}

function measureGrid(columns: number, rows: number, slotSize: UiSize, columnGap: number, rowGap: number): UiSize {
  return {
    width: safeCount(columns) * slotSize.width + Math.max(0, safeCount(columns) - 1) * columnGap,
    height: safeCount(rows) * slotSize.height + Math.max(0, safeCount(rows) - 1) * rowGap,
  };
}

function measurePane(spec: StoragePaneSpec): MeasuredPane {
  const slotSize = spec.slotSize ?? DEFAULT_SLOT_SIZE;
  const columnGap = Math.max(0, spec.columnGap ?? DEFAULT_COLUMN_GAP);
  const rowGap = Math.max(0, spec.rowGap ?? DEFAULT_ROW_GAP);
  const gridSize = measureGrid(spec.columns, spec.rows, slotSize, columnGap, rowGap);
  return { spec, slotSize, columnGap, rowGap, gridSize, minimumWidth: Math.max(gridSize.width, spec.minWidth ?? 0) };
}

function resizeHandles(frame: UiRect): Readonly<Record<StorageResizeCorner, UiRect>> {
  const half = Math.floor(RESIZE_HANDLE_SIZE / 2);
  return {
    north_west: { x: frame.x - half, y: frame.y - half, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    north_east: { x: frame.x + frame.width - half - 1, y: frame.y - half, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    south_west: { x: frame.x - half, y: frame.y + frame.height - half - 1, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
    south_east: { x: frame.x + frame.width - half - 1, y: frame.y + frame.height - half - 1, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE },
  };
}

function clampFrameRect(viewport: UiSize, requested: UiRect | undefined, naturalSize: UiSize, minimumSize: UiSize): UiRect {
  const maximumWidth = Math.max(minimumSize.width, viewport.width - FRAME_MARGIN * 2);
  const maximumHeight = Math.max(minimumSize.height, viewport.height - FRAME_MARGIN * 2);
  const width = Math.min(maximumWidth, Math.max(minimumSize.width, Math.round(requested?.width ?? naturalSize.width)));
  const height = Math.min(maximumHeight, Math.max(minimumSize.height, Math.round(requested?.height ?? naturalSize.height)));
  const naturalX = Math.round((viewport.width - width) / 2);
  const naturalY = Math.round((viewport.height - height) / 2);
  const maximumX = Math.max(FRAME_MARGIN, viewport.width - FRAME_MARGIN - width);
  const maximumY = Math.max(FRAME_MARGIN, viewport.height - FRAME_MARGIN - height);
  return {
    x: Math.min(maximumX, Math.max(FRAME_MARGIN, Math.round(requested?.x ?? naturalX))),
    y: Math.min(maximumY, Math.max(FRAME_MARGIN, Math.round(requested?.y ?? naturalY))),
    width,
    height,
  };
}

function alignedGridX(region: UiRect, gridWidth: number, alignment: StoragePaneAlignment): number {
  if (alignment === 'start') return region.x;
  if (alignment === 'end') return region.x + region.width - gridWidth;
  return region.x + Math.round((region.width - gridWidth) / 2);
}

/** Deterministic inventory composition. Fixed panes retain their authored grid
 * width; flex panes share surplus width. With no flex panes, every outer and
 * inter-pane gutter is equal, removing per-window hand-positioning. */
export function layoutStorageFrame(
  viewport: UiSize,
  spec: StorageFrameSpec,
  requestedFrame?: UiRect,
): StorageFrameLayout {
  if (spec.panes.length === 0) throw new Error('storage_frame_requires_a_pane');
  const panes = spec.panes.map(measurePane);
  const minimumGutter = Math.max(0, spec.minimumGutter ?? DEFAULT_MINIMUM_GUTTER);
  const paneMinimumWidth = panes.reduce((total, pane) => total + pane.minimumWidth, 0);
  const paneMinimumInnerWidth = paneMinimumWidth + minimumGutter * (panes.length + 1);
  const paneHeight = Math.max(...panes.map((pane) => pane.gridSize.height));

  const hotbarColumns = safeCount(spec.hotbar?.columns ?? 9);
  const hotbarSlotSize = spec.hotbar?.slotSize ?? DEFAULT_SLOT_SIZE;
  const hotbarColumnGap = Math.max(0, spec.hotbar?.columnGap ?? DEFAULT_COLUMN_GAP);
  const hotbarGridSize = spec.hotbar === undefined
    ? { width: 0, height: 0 }
    : measureGrid(hotbarColumns, 1, hotbarSlotSize, hotbarColumnGap, 0);
  const minimumInnerWidth = Math.max(paneMinimumInnerWidth, hotbarGridSize.width);
  const minimumWidth = minimumInnerWidth + FRAME_CONTENT_INSET * 2;
  const minimumHeight = PANE_GRID_TOP + paneHeight + (spec.hotbar === undefined
    ? FRAME_BOTTOM_PADDING
    : PANE_TO_DIVIDER_GAP + DIVIDER_HEIGHT + HOTBAR_LABEL_GAP + HOTBAR_GRID_GAP
      + hotbarGridSize.height + FRAME_BOTTOM_PADDING);
  const minimumSize = { width: minimumWidth, height: minimumHeight };
  const naturalSize = {
    width: Math.max(minimumWidth, spec.preferredWidth ?? minimumWidth),
    height: minimumHeight,
  };
  const frame = clampFrameRect(viewport, requestedFrame, naturalSize, minimumSize);
  const inner = {
    x: frame.x + FRAME_CONTENT_INSET,
    y: frame.y,
    width: frame.width - FRAME_CONTENT_INSET * 2,
    height: frame.height,
  };

  const flexPanes = panes.filter((pane) => pane.spec.sizing === 'flex');
  const baseGuttersWidth = minimumGutter * (panes.length + 1);
  const surplus = Math.max(0, inner.width - paneMinimumWidth - baseGuttersWidth);
  const equalGutter = flexPanes.length === 0 ? minimumGutter + surplus / (panes.length + 1) : minimumGutter;
  const flexSurplus = flexPanes.length === 0 ? 0 : surplus / flexPanes.length;
  let cursorX = inner.x + equalGutter;
  const paneLayouts = panes.map((pane): StoragePaneLayout => {
    const regionWidth = pane.minimumWidth + (pane.spec.sizing === 'flex' ? flexSurplus : 0);
    const region = {
      x: Math.round(cursorX),
      y: frame.y + PANE_GRID_TOP,
      width: Math.round(regionWidth),
      height: paneHeight,
    };
    const gridX = alignedGridX(region, pane.gridSize.width, pane.spec.alignment ?? 'center');
    const grid = { x: gridX, y: region.y, ...pane.gridSize };
    const slots = Array.from({ length: safeCount(pane.spec.columns) * safeCount(pane.spec.rows) }, (_, index) => ({
      x: grid.x + index % safeCount(pane.spec.columns) * (pane.slotSize.width + pane.columnGap),
      y: grid.y + Math.floor(index / safeCount(pane.spec.columns)) * (pane.slotSize.height + pane.rowGap),
      width: pane.slotSize.width,
      height: pane.slotSize.height,
    }));
    cursorX += regionWidth + equalGutter;
    return {
      id: pane.spec.id,
      label: pane.spec.label,
      style: pane.spec.style ?? 'slots',
      region,
      grid,
      labelPosition: { x: grid.x, y: frame.y + PANE_LABEL_TOP },
      slots,
    };
  });

  if (spec.hotbar === undefined) {
    return {
      title: spec.title,
      style: spec.style,
      frame,
      minimumSize,
      panes: paneLayouts,
      divider: null,
      hotbar: null,
      resizeHandles: resizeHandles(frame),
      resizable: spec.resizable ?? false,
    };
  }

  const hotbarY = frame.y + frame.height - FRAME_BOTTOM_PADDING - hotbarGridSize.height;
  const divider = {
    x: inner.x,
    y: hotbarY - HOTBAR_GRID_GAP - HOTBAR_LABEL_GAP - DIVIDER_HEIGHT,
    width: inner.width,
    height: DIVIDER_HEIGHT,
  };
  const hotbarX = inner.x + Math.round((inner.width - hotbarGridSize.width) / 2);
  const hotbarSlots = Array.from({ length: hotbarColumns }, (_, index) => ({
    x: hotbarX + index * (hotbarSlotSize.width + hotbarColumnGap),
    y: hotbarY,
    width: hotbarSlotSize.width,
    height: hotbarSlotSize.height,
  }));
  return {
    title: spec.title,
    style: spec.style,
    frame,
    minimumSize,
    panes: paneLayouts,
    divider,
    hotbar: {
      label: spec.hotbar.label ?? 'HOT BAR',
      region: { x: hotbarX, y: hotbarY, ...hotbarGridSize },
      labelPosition: { x: hotbarX, y: divider.y + DIVIDER_HEIGHT + HOTBAR_LABEL_GAP },
      slots: hotbarSlots,
    },
    resizeHandles: resizeHandles(frame),
    resizable: spec.resizable ?? false,
  };
}

export function drawStorageFrameChrome(context: CanvasRenderingContext2D, skin: UiSkin, layout: StorageFrameLayout): void {
  if (layout.style === 'wood_parchment' || layout.style === 'wood') {
    drawUiSkinAsset(context, skin.panelWood, layout.frame);
  }
  if (layout.style === 'wood_parchment') {
    drawUiSkinAsset(context, skin.panelParchment, {
      x: layout.frame.x + 10,
      y: layout.frame.y + 13,
      width: layout.frame.width - 20,
      height: layout.frame.height - 23,
    });
  } else if (layout.style === 'parchment') {
    drawUiSkinAsset(context, skin.panelParchment, layout.frame);
  }
}

export function drawStorageResizeHandles(context: CanvasRenderingContext2D, layout: StorageFrameLayout): void {
  if (!layout.resizable) return;
  context.save();
  context.fillStyle = '#f5d494';
  context.strokeStyle = '#5f3529';
  context.lineWidth = 1;
  for (const handle of Object.values(layout.resizeHandles)) {
    context.fillRect(handle.x + 2, handle.y + 2, handle.width - 4, handle.height - 4);
    context.strokeRect(handle.x + 2.5, handle.y + 2.5, handle.width - 5, handle.height - 5);
  }
  context.restore();
}

interface ActiveResize {
  readonly corner: StorageResizeCorner;
  readonly pointer: UiPoint;
  readonly frame: UiRect;
  readonly minimumSize: UiSize;
}

/** Corner-anchored resize interaction. The opposite corner remains fixed and
 * the result is clamped to both the composition minimum and viewport bounds. */
export class StorageFrameResizeController {
  private activeResize: ActiveResize | null = null;

  get active(): boolean { return this.activeResize !== null; }

  pointerDown(point: UiPoint, button: number, layout: StorageFrameLayout): boolean {
    if (button !== 0 || !layout.resizable) return false;
    const entry = (Object.entries(layout.resizeHandles) as [StorageResizeCorner, UiRect][])
      .find(([, rect]) => containsPoint(rect, point));
    if (entry === undefined) return false;
    this.activeResize = { corner: entry[0], pointer: point, frame: layout.frame, minimumSize: layout.minimumSize };
    return true;
  }

  pointerMove(point: UiPoint, viewport: UiSize): UiRect | null {
    const active = this.activeResize;
    if (active === null) return null;
    const deltaX = point.x - active.pointer.x;
    const deltaY = point.y - active.pointer.y;
    const west = active.corner === 'north_west' || active.corner === 'south_west';
    const north = active.corner === 'north_west' || active.corner === 'north_east';
    const oppositeX = west ? active.frame.x + active.frame.width : active.frame.x;
    const oppositeY = north ? active.frame.y + active.frame.height : active.frame.y;
    const movingX = west
      ? Math.min(oppositeX - active.minimumSize.width, Math.max(FRAME_MARGIN, active.frame.x + deltaX))
      : Math.max(oppositeX + active.minimumSize.width, Math.min(viewport.width - FRAME_MARGIN, active.frame.x + active.frame.width + deltaX));
    const movingY = north
      ? Math.min(oppositeY - active.minimumSize.height, Math.max(FRAME_MARGIN, active.frame.y + deltaY))
      : Math.max(oppositeY + active.minimumSize.height, Math.min(viewport.height - FRAME_MARGIN, active.frame.y + active.frame.height + deltaY));
    return {
      x: west ? movingX : oppositeX,
      y: north ? movingY : oppositeY,
      width: Math.abs(oppositeX - movingX),
      height: Math.abs(oppositeY - movingY),
    };
  }

  pointerUp(): boolean {
    if (this.activeResize === null) return false;
    this.activeResize = null;
    return true;
  }

  cancel(): void { this.activeResize = null; }
}
