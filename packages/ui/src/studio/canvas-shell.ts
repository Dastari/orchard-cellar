import { drawScrollBarChrome } from '../scrollbar.js';
import {
  drawFantasyButton,
  drawFantasyIconCell,
  type FantasyButtonGlyph,
} from '../design-system/fantasy-controls.js';
import type { AtlasFrame } from '../sprite.js';
import { drawUiFrame, uiFrameContentRect, type UiFrameStyle } from '../design-system/frame.js';
import { drawUiInventorySlotBacking, uiInventorySelectorRect } from '../design-system/inventory.js';
import { drawPixelTextInRect, loadPixelUi, type PixelUi } from '../pixel-ui.js';
import { drawSemanticSelector } from '../selector.js';
import {
  UI_ICON_NAMES,
  drawUiIconAsset,
  loadUiGeneratedSkin,
  loadUiIconSet,
  type UiIconName,
  type UiSkin,
  type UiGeneratedSkinAssetKey,
} from '../skin.js';
import { Ribbon, ribbonTextFace } from '../ribbon.js';
import { STUDIO_SKIN_TOKENS } from './skin.js';

export interface StudioCanvasShellArt {
  readonly fonts: PixelUi;
  readonly skin: UiSkin;
}

export type StudioCanvasShellNodeKind =
  | 'wood_panel'
  | 'parchment_panel'
  | 'thin_panel'
  | 'alpha_grid'
  | 'ribbon'
  | 'button'
  | 'tab'
  | 'field'
  | 'slot'
  | 'heading'
  | 'label'
  | 'tooltip'
  | 'scrollbar';

export type StudioCanvasShellNodeState = 'idle' | 'hover' | 'pressed' | 'disabled' | 'active';
export type StudioCanvasShellNodeTone = 'normal' | 'danger' | 'success';

export interface StudioCanvasShellNode {
  readonly scroll?: { readonly total: number; readonly visible: number; readonly position: number };
  readonly id: string;
  readonly kind: StudioCanvasShellNodeKind;
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Visible scroll/overflow viewport. Chrome keeps its original nine-slice
   * geometry and is clipped, never stretched to the exposed fragment. */
  readonly clip?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly label?: string;
  /** Compact action glyph from the production button atlas. */
  readonly glyph?: FantasyButtonGlyph;
  /** Production icon-catalog cell and its optional hover/focus outline. */
  readonly icon?: { readonly frame: number; readonly outline?: number };
  /** Shared editor symbol, rasterized onto this canvas rather than mounted as DOM. */
  readonly symbol?: UiIconName;
  /** Pixel-art atlas crop centered inside an authored UI-LAB slot. The image is
   * retained by the owning tool; this renderer only performs the clipped,
   * nearest-neighbour blit. */
  readonly preview?: {
    readonly image: CanvasImageSource;
    readonly frame: AtlasFrame;
    readonly padding?: number;
  };
  /** Studio text defaults to 2x bitmap scale for desktop readability. */
  readonly textScale?: 1 | 2;
  /** Lift the ribbon into the top edge of its containing frame. */
  readonly ribbonPlacement?: 'content' | 'top-border';
  /** Draw a clipped, top-aligned block instead of collapsing editor source to
   * one ellipsized line. Input remains owned by CanvasTextEditor. */
  readonly multiline?: boolean;
  readonly state?: StudioCanvasShellNodeState;
  readonly tone?: StudioCanvasShellNodeTone;
}

/** UI-library-owned safe content rectangle. Studio layouts use this instead of
 * guessed insets that can overlap the authored nine-slice borders. */
export function studioCanvasFrameContentRect(
  bounds: StudioCanvasShellNode['bounds'],
  kind: Extract<StudioCanvasShellNodeKind, 'wood_panel' | 'parchment_panel' | 'thin_panel' | 'field'>,
): StudioCanvasShellNode['bounds'] {
  const style: UiFrameStyle = kind === 'wood_panel' ? 'wood'
    : kind === 'parchment_panel' ? 'wood_parchment' : 'thin';
  return uiFrameContentRect(bounds, style);
}

export interface StudioCanvasShellModel {
  readonly width: number;
  readonly height: number;
  readonly production: boolean;
  readonly nodes: readonly StudioCanvasShellNode[];
}

const STUDIO_CANVAS_SKIN_KEYS = Object.freeze([
  'panelWood', 'panelParchment', 'frameThin', 'sliderTrackVertical', 'sliderHandle',
  'buttonWideChamfered', 'buttonWideSquare', 'buttonWidePill',
  'buttonSmallChamfered', 'buttonSmallSquare', 'buttonSmallPill',
  'buttonGlyphs', 'iconCatalog', 'slot', 'ribbon',
  'selectorNeutral', 'selectorConfirm', 'selectorDeny',
] as const satisfies readonly UiGeneratedSkinAssetKey[]);

/** Exact semantic icon preload manifest for the sole-Canvas Studio shell.
 * Exported so the Studio package can verify its own public asset copy. */
export const STUDIO_CANVAS_UI_ICONS = UI_ICON_NAMES;

const RIBBONS = new WeakMap<StudioCanvasShellArt, Ribbon>();
const ALPHA_PATTERNS = new WeakMap<CanvasRenderingContext2D, Map<number, CanvasPattern>>();

function studioRibbon(art: StudioCanvasShellArt): Ribbon {
  const existing = RIBBONS.get(art);
  if (existing !== undefined) return existing;
  const created = new Ribbon(art.skin.ribbon, art.fonts);
  RIBBONS.set(art, created);
  return created;
}

async function loadStudioCanvasSkin(): Promise<UiSkin> {
  const skin = await loadUiGeneratedSkin(STUDIO_CANVAS_SKIN_KEYS);
  // This deliberately narrow skin is private to the adapter. Every primitive
  // below reads only keys in STUDIO_CANVAS_SKIN_ASSETS, avoiding unrelated
  // game icons while retaining the exact generated atlas assets used by UI Lab.
  return skin as unknown as UiSkin;
}

export async function loadStudioCanvasShellArt(): Promise<StudioCanvasShellArt> {
  const [fonts, skin, icons] = await Promise.all([
    loadPixelUi(), loadStudioCanvasSkin(), loadUiIconSet(STUDIO_CANVAS_UI_ICONS),
  ]);
  return Object.freeze({ fonts, skin: { ...skin, icons } as UiSkin });
}

function buttonState(state: StudioCanvasShellNodeState): 'idle' | 'pressed' | 'disabled' {
  if (state === 'disabled') return 'disabled';
  if (state === 'pressed') return 'pressed';
  return 'idle';
}

function buttonTone(node: StudioCanvasShellNode): 'peach' | 'green' | 'red' {
  if (node.tone === 'danger') return 'red';
  if (node.tone === 'success' || node.state === 'active') return 'green';
  return 'peach';
}

function textColor(node: StudioCanvasShellNode): string {
  if (node.state === 'disabled') return STUDIO_SKIN_TOKENS.mutedInk;
  if (node.tone === 'danger') return STUDIO_SKIN_TOKENS.danger;
  if (node.tone === 'success') return STUDIO_SKIN_TOKENS.greenDark;
  return STUDIO_SKIN_TOKENS.ink;
}

function assertModel(model: StudioCanvasShellModel): void {
  if (!Number.isFinite(model.width) || !Number.isFinite(model.height)
    || model.width <= 0 || model.height <= 0) throw new Error('studio_canvas_shell_size_invalid');
  assertNodes(model.nodes);
}

function assertNodes(nodes: readonly StudioCanvasShellNode[]): void {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.id.length === 0 || ids.has(node.id)) throw new Error(`studio_canvas_shell_node_id_invalid:${node.id}`);
    ids.add(node.id);
    const { x, y, width, height } = node.bounds;
    if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) {
      throw new Error(`studio_canvas_shell_node_bounds_invalid:${node.id}`);
    }
    if (node.clip !== undefined) {
      const { x: clipX, y: clipY, width: clipWidth, height: clipHeight } = node.clip;
      if (![clipX, clipY, clipWidth, clipHeight].every(Number.isFinite) || clipWidth < 0 || clipHeight < 0) {
        throw new Error(`studio_canvas_shell_node_clip_invalid:${node.id}`);
      }
    }
    if (node.preview !== undefined) {
      const { x: frameX, y: frameY, width: frameWidth, height: frameHeight } = node.preview.frame;
      if (![frameX, frameY, frameWidth, frameHeight].every(Number.isFinite)
        || frameWidth <= 0 || frameHeight <= 0) {
        throw new Error(`studio_canvas_shell_node_preview_invalid:${node.id}`);
      }
    }
  }
}

/** Traditional transparency checkerboard for major editor canvases. It is a
 * background surface, not another decorative frame; the parent frame owns the
 * authored border and padding. */
export function drawStudioCanvasAlphaGrid(
  context: CanvasRenderingContext2D,
  bounds: StudioCanvasShellNode['bounds'],
  cellSize = 16,
): void {
  const size = Math.max(4, Math.round(cellSize));
  context.save();
  context.beginPath();
  context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.clip();
  let patterns = ALPHA_PATTERNS.get(context);
  if (patterns === undefined) {
    patterns = new Map();
    ALPHA_PATTERNS.set(context, patterns);
  }
  let pattern = patterns.get(size);
  if (pattern === undefined && typeof context.createPattern === 'function' && typeof document !== 'undefined') {
    const tile = document.createElement('canvas');
    tile.width = size * 2;
    tile.height = size * 2;
    const tileContext = tile.getContext('2d');
    if (tileContext !== null) {
      tileContext.fillStyle = '#d8d8d8';
      tileContext.fillRect(0, 0, tile.width, tile.height);
      tileContext.fillStyle = '#b8b8b8';
      tileContext.fillRect(0, 0, size, size);
      tileContext.fillRect(size, size, size, size);
      pattern = context.createPattern(tile, 'repeat') ?? undefined;
      if (pattern !== undefined) patterns.set(size, pattern);
    }
  }
  if (pattern !== undefined) {
    context.fillStyle = pattern;
    context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    context.restore();
    return;
  }
  context.fillStyle = '#d8d8d8';
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.fillStyle = '#b8b8b8';
  const x0 = Math.floor(bounds.x / size) * size;
  const y0 = Math.floor(bounds.y / size) * size;
  for (let y = y0; y < bounds.y + bounds.height; y += size) {
    const row = Math.floor(y / size);
    for (let x = x0; x < bounds.x + bounds.width; x += size) {
      if ((Math.floor(x / size) + row) % 2 === 0) context.fillRect(x, y, size, size);
    }
  }
  context.restore();
}

function drawNodes(
  context: CanvasRenderingContext2D,
  art: StudioCanvasShellArt,
  nodes: readonly StudioCanvasShellNode[],
): void {
  for (const node of nodes) {
    if (node.bounds.width === 0 || node.bounds.height === 0) continue;
    context.save();
    if (node.clip !== undefined) {
      context.beginPath();
      context.rect(node.clip.x, node.clip.y, node.clip.width, node.clip.height);
      context.clip();
    }
    const state = node.state ?? 'idle';
    switch (node.kind) {
      case 'scrollbar':
        if (node.scroll !== undefined) drawScrollBarChrome(context, art.skin, node.bounds,
          node.scroll.total, node.scroll.visible, node.scroll.position);
        break;
      case 'wood_panel':
        drawUiFrame(context, art.skin, node.bounds, 'wood');
        break;
      case 'parchment_panel':
        drawUiFrame(context, art.skin, node.bounds, 'wood_parchment');
        break;
      case 'thin_panel':
        drawUiFrame(context, art.skin, node.bounds, 'thin');
        break;
      case 'alpha_grid':
        drawStudioCanvasAlphaGrid(context, node.bounds);
        break;
      case 'ribbon': {
        const bounds = node.ribbonPlacement === 'top-border'
          ? { ...node.bounds, y: node.bounds.y - 12 } : node.bounds;
        studioRibbon(art).drawSingle(context, '', bounds);
        drawText(context, art, { ...node, bounds: ribbonTextFace(bounds), textScale: node.textScale ?? 1 }, true);
        break;
      }
      case 'button':
      case 'tab':
        drawFantasyButton(context, art.skin, art.fonts, node.bounds, {
          label: node.label ?? '',
          shape: node.kind === 'tab' ? 'square' : 'chamfered',
          tone: buttonTone(node),
          state: buttonState(state),
          hovered: state === 'hover',
          hoverOutline: node.tone === 'danger' ? 'white' : 'gold',
          glyph: node.glyph,
        });
        drawNodeIcon(context, art, node);
        drawNodeSymbol(context, art, node);
        break;
      case 'field':
        drawUiFrame(context, art.skin, node.bounds, 'thin');
        drawText(context, art, node);
        break;
      case 'slot':
        drawUiInventorySlotBacking(context, art.skin, node.bounds, null, state === 'disabled');
        drawNodePreview(context, node);
        drawNodeIcon(context, art, node);
        drawNodeSymbol(context, art, node);
        drawText(context, art, node);
        if (state === 'hover' || state === 'active') {
          drawSemanticSelector(
            context,
            art.skin,
            uiInventorySelectorRect(node.bounds, 2),
            state === 'active' || node.tone === 'success' ? 'confirm'
              : node.tone === 'danger' ? 'deny' : 'neutral',
          );
        }
        break;
      case 'heading':
        drawText(context, art, node, true);
        break;
      case 'label':
        drawText(context, art, node);
        break;
      case 'tooltip':
        // A tooltip is an inset annotation, so use the narrow skin's authored
        // frameThin asset instead of the legacy label plate (`skin.button`).
        drawFantasyButton(context, art.skin, art.fonts, node.bounds, { shape: 'pill' });
        drawText(context, art, { ...node, bounds: { x: node.bounds.x + 8, y: node.bounds.y + 8,
          width: Math.max(1, node.bounds.width - 16), height: Math.max(1, node.bounds.height - 16) },
          textScale: node.textScale ?? 1 });
        break;
    }
    context.restore();
  }
}

function drawNodePreview(
  context: CanvasRenderingContext2D,
  node: StudioCanvasShellNode,
): void {
  const preview = node.preview;
  if (preview === undefined) return;
  const padding = Math.max(3, Math.round(preview.padding ?? 6));
  const availableWidth = Math.max(1, node.bounds.width - padding * 2);
  const availableHeight = Math.max(1, node.bounds.height - padding * 2);
  const scale = Math.min(availableWidth / preview.frame.width, availableHeight / preview.frame.height, 4);
  const width = Math.max(1, Math.floor(preview.frame.width * scale));
  const height = Math.max(1, Math.floor(preview.frame.height * scale));
  context.save();
  context.globalAlpha = node.state === 'disabled' ? 0.42 : 1;
  context.imageSmoothingEnabled = false;
  context.drawImage(
    preview.image,
    preview.frame.x,
    preview.frame.y,
    preview.frame.width,
    preview.frame.height,
    Math.round(node.bounds.x + (node.bounds.width - width) / 2),
    Math.round(node.bounds.y + (node.bounds.height - height) / 2),
    width,
    height,
  );
  context.restore();
}

/** Draws a retained overlay batch without clearing the canvas or repainting the
 * production root frame. Use after tables/graphs so palettes and tooltips remain
 * topmost while still sharing the exact Studio primitive renderer. */
export function drawStudioCanvasShellNodes(
  context: CanvasRenderingContext2D,
  art: StudioCanvasShellArt,
  nodes: readonly StudioCanvasShellNode[],
): void {
  assertNodes(nodes);
  context.save();
  context.imageSmoothingEnabled = false;
  drawNodes(context, art, nodes);
  context.restore();
}

function drawText(
  context: CanvasRenderingContext2D,
  art: StudioCanvasShellArt,
  node: StudioCanvasShellNode,
  header = false,
): void {
  if (node.label === undefined || node.label.length === 0) return;
  if (node.multiline === true) {
    const scale = node.textScale ?? 2;
    const lineHeight = 8 * scale;
    const maximumLines = Math.max(1, Math.floor((node.bounds.height - 6) / lineHeight));
    node.label.split('\n').slice(0, maximumLines).forEach((line, index) => {
      drawPixelTextInRect(context, art.fonts, line, {
        x: node.bounds.x,
        y: node.bounds.y + 3 + index * lineHeight,
        width: node.bounds.width,
        height: lineHeight,
      }, {
        font: header ? 'header' : 'body',
        verticalAlign: 'top',
        overflow: 'ellipsis',
        color: textColor(node),
        paddingX: header ? 4 : 3,
        scale,
      });
    });
    return;
  }
  drawPixelTextInRect(context, art.fonts, node.label, node.bounds, {
    font: header ? 'header' : 'body',
    verticalAlign: 'center',
    overflow: 'ellipsis',
    color: textColor(node),
    paddingX: header ? 4 : 3,
    scale: node.textScale ?? 2,
  });
}

function drawNodeIcon(
  context: CanvasRenderingContext2D,
  art: StudioCanvasShellArt,
  node: StudioCanvasShellNode,
): void {
  if (node.icon === undefined) return;
  const padding = Math.max(5, Math.floor(Math.min(node.bounds.width, node.bounds.height) * 0.18));
  const size = Math.max(1, Math.min(node.bounds.width - padding * 2, node.bounds.height - padding * 2));
  const rect = {
    x: Math.round(node.bounds.x + (node.bounds.width - size) / 2),
    y: Math.round(node.bounds.y + (node.bounds.height - size) / 2),
    width: size,
    height: size,
  };
  if ((node.state === 'hover' || node.state === 'active') && node.icon.outline !== undefined) {
    drawFantasyIconCell(context, art.skin.iconCatalog, rect, node.icon.outline);
  }
  drawFantasyIconCell(context, art.skin.iconCatalog, rect, node.icon.frame,
    node.state === 'disabled' ? 0.42 : 1);
}

function drawNodeSymbol(
  context: CanvasRenderingContext2D,
  art: StudioCanvasShellArt,
  node: StudioCanvasShellNode,
): void {
  if (node.symbol === undefined) return;
  const symbol = art.skin.icons?.[node.symbol];
  if (symbol === undefined) return;
  const padding = Math.max(7, Math.floor(Math.min(node.bounds.width, node.bounds.height) * 0.24));
  const size = Math.max(1, Math.min(node.bounds.width - padding * 2, node.bounds.height - padding * 2));
  drawUiIconAsset(context, symbol, {
    x: Math.round(node.bounds.x + (node.bounds.width - size) / 2),
    y: Math.round(node.bounds.y + (node.bounds.height - size) / 2),
    width: size,
    height: size,
  }, node.state === 'disabled' ? 0.42 : 0.94);
}

/**
 * Draws Orchard Studio through the same authored canvas primitives exercised by
 * UI Lab. The shell supplies retained geometry and semantic state; this renderer
 * owns no parallel CSS/control skin and never reconstructs those primitives.
 */
export function drawStudioCanvasShell(
  context: CanvasRenderingContext2D,
  art: StudioCanvasShellArt,
  model: StudioCanvasShellModel,
): void {
  assertModel(model);
  context.save();
  context.beginPath();
  context.rect(0, 0, model.width, model.height);
  context.clip();
  context.fillStyle = STUDIO_SKIN_TOKENS.backdrop;
  context.fillRect(0, 0, model.width, model.height);
  context.imageSmoothingEnabled = false;
  if (model.production) {
    drawUiFrame(context, art.skin, { x: 0, y: 0, width: model.width, height: model.height }, 'thin');
  }

  drawNodes(context, art, model.nodes);
  context.restore();
}
