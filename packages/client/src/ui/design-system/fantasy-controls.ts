import type { LoadedAsset } from '../../render/assets.js';
import {
  drawOutlinedPixelText,
  drawPixelText,
  fitPixelText,
  type PixelUi,
} from '../../render/pixel-ui.js';
import { buttonLabelTop, buttonTextFace, type ButtonVisualState } from '../button.js';
import type { UiRect } from '../geometry.js';
import { drawUiSkinAsset, type UiSkin } from '../skin.js';
import { widget, type WidgetNode } from '../widget.js';

export const FANTASY_BUTTON_TONES = [
  'peach', 'silver', 'green', 'blue', 'gold', 'red', 'purple', 'cream', 'white',
] as const;
export type FantasyButtonTone = (typeof FANTASY_BUTTON_TONES)[number];

export const FANTASY_BUTTON_SHAPES = ['chamfered', 'square', 'pill'] as const;
export type FantasyButtonShape = (typeof FANTASY_BUTTON_SHAPES)[number];
export type FantasyButtonSize = 'wide' | 'small';
export type FantasyButtonHoverOutline = 'gold' | 'white' | 'none';

export const FANTASY_BUTTON_GLYPHS = [
  'pause', 'play', 'wrench', 'power', 'back', 'alert', 'pointer', 'help',
  'heart', 'up', 'key_a', 'key_e', 'star', 'down', 'flask', 'coin',
  'cross', 'square', 'key_r', 'key_l', 'key_m', 'up_1', 'up_2', 'up_3',
  'down_1', 'down_2', 'down_3', 'left_1', 'left_2', 'left_3', 'return',
] as const;
export type FantasyButtonGlyph = (typeof FANTASY_BUTTON_GLYPHS)[number];

const toneIndex = Object.fromEntries(FANTASY_BUTTON_TONES.map((tone, index) => [tone, index])) as
  Readonly<Record<FantasyButtonTone, number>>;
const glyphIndex = Object.fromEntries(FANTASY_BUTTON_GLYPHS.map((glyph, index) => [glyph, index])) as
  Readonly<Record<FantasyButtonGlyph, number>>;

const glyphPalette: Readonly<Record<FantasyButtonTone, number>> = {
  peach: 0,
  silver: 2,
  green: 5,
  blue: 7,
  gold: 9,
  red: 11,
  purple: 13,
  // The glyph-only sheet does not repeat the two light neutral ramps; these
  // are the closest authored dark glyphs used by their corresponding family.
  cream: 0,
  white: 2,
};

type FantasyControlSkin = Pick<UiSkin,
  | 'buttonWideChamfered' | 'buttonWideSquare' | 'buttonWidePill'
  | 'buttonSmallChamfered' | 'buttonSmallSquare' | 'buttonSmallPill'
  | 'buttonGlyphs' | 'iconCatalog'>;

export interface FantasyButtonFrameSelection {
  readonly group: ButtonVisualState;
  readonly variantIndex: number;
}

export function fantasyButtonFrame(
  tone: FantasyButtonTone,
  state: ButtonVisualState,
): FantasyButtonFrameSelection {
  return { group: state, variantIndex: toneIndex[tone] };
}

export function fantasyButtonHoverGroup(
  outline: Exclude<FantasyButtonHoverOutline, 'none'>,
  state: ButtonVisualState,
): string {
  return `hover_${outline}_${state}`;
}

export function fantasyButtonGlyphFrame(
  tone: FantasyButtonTone,
  glyph: FantasyButtonGlyph,
): { readonly group: string; readonly variantIndex: number } {
  return { group: `palette_${glyphPalette[tone]}`, variantIndex: glyphIndex[glyph] };
}

function buttonChrome(
  skin: FantasyControlSkin,
  shape: FantasyButtonShape,
  size: FantasyButtonSize,
): LoadedAsset {
  if (size === 'small') {
    return shape === 'square' ? skin.buttonSmallSquare
      : shape === 'pill' ? skin.buttonSmallPill : skin.buttonSmallChamfered;
  }
  return shape === 'square' ? skin.buttonWideSquare
    : shape === 'pill' ? skin.buttonWidePill : skin.buttonWideChamfered;
}

export function fantasyButtonGlyphRect(
  rect: UiRect,
  state: ButtonVisualState,
  hasLabel = false,
): UiRect {
  const size = Math.max(1, Math.min(16, rect.width - 4, rect.height - 4));
  return {
    x: Math.round(hasLabel ? rect.x + 4 : rect.x + (rect.width - size) / 2),
    y: Math.round(rect.y + (rect.height - size) / 2 + (state === 'pressed' ? 1 : 0)),
    width: size,
    height: size,
  };
}

export interface DrawFantasyButtonOptions {
  readonly tone?: FantasyButtonTone;
  readonly shape?: FantasyButtonShape;
  readonly size?: FantasyButtonSize;
  readonly state?: ButtonVisualState;
  readonly hovered?: boolean;
  readonly hoverOutline?: FantasyButtonHoverOutline;
  readonly glyph?: FantasyButtonGlyph;
  readonly label?: string;
}

/**
 * Complete authored button family. Shape chooses geometry, tone is an atlas
 * variant, state chooses idle/pressed/disabled art, and hover is a separate
 * authored outline overlay. Labels and glyphs remain bounded by the face.
 */
export function drawFantasyButton(
  context: CanvasRenderingContext2D,
  skin: FantasyControlSkin,
  fonts: PixelUi,
  rect: UiRect,
  options: DrawFantasyButtonOptions = {},
): void {
  const tone = options.tone ?? 'peach';
  const shape = options.shape ?? 'chamfered';
  const size = options.size ?? 'wide';
  const state = options.state ?? 'idle';
  const chrome = buttonChrome(skin, shape, size);
  const frame = fantasyButtonFrame(tone, state);
  drawUiSkinAsset(context, chrome, rect, frame.group, frame.variantIndex);

  const outline = options.hoverOutline ?? 'gold';
  if (options.hovered === true && outline !== 'none' && state !== 'disabled') {
    drawUiSkinAsset(context, chrome, rect, fantasyButtonHoverGroup(outline, state));
  }

  const hasLabel = Boolean(options.label);
  if (options.glyph !== undefined) {
    const glyph = fantasyButtonGlyphFrame(tone, options.glyph);
    drawUiSkinAsset(
      context,
      skin.buttonGlyphs,
      fantasyButtonGlyphRect(rect, state, hasLabel),
      glyph.group,
      glyph.variantIndex,
    );
  }

  if (!hasLabel || size === 'small') return;
  const face = buttonTextFace(rect, state);
  const glyphReserve = options.glyph === undefined ? 0 : Math.min(18, Math.max(0, face.width));
  const labelFace = {
    x: face.x + glyphReserve,
    y: face.y,
    width: Math.max(0, face.width - glyphReserve),
    height: face.height,
  };
  const label = fitPixelText(options.label ?? '', labelFace.width, 1, fonts.font);
  if (label.length === 0 || labelFace.height <= 0) return;
  const labelX = labelFace.x + labelFace.width / 2;
  const labelY = buttonLabelTop(rect, fonts, 'regular', state);
  context.save();
  context.beginPath();
  context.rect(labelFace.x, labelFace.y, labelFace.width, labelFace.height);
  context.clip();
  if (state === 'disabled') {
    drawOutlinedPixelText(context, fonts, label, labelX, labelY, {
      align: 'center', color: '#e0c49a', outlineColor: '#5f3b24',
    });
  } else {
    const darkText = tone === 'peach' || tone === 'silver' || tone === 'gold'
      || tone === 'cream' || tone === 'white';
    drawPixelText(context, fonts, label, labelX, labelY, {
      align: 'center', color: darkText ? '#5f3b24' : '#fff2d0',
    });
  }
  context.restore();
}

export interface FantasyCanvasButtonOptions extends DrawFantasyButtonOptions {
  readonly id: string;
  readonly skin: FantasyControlSkin;
  readonly fonts: PixelUi;
  readonly onPress: () => void;
}

/** Stateful retained wrapper used by the lab and future screen migrations. */
export class FantasyCanvasButton {
  readonly node: WidgetNode;
  private hovered = false;
  private pressedUntil = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: FantasyCanvasButtonOptions) {
    this.node = widget('button', options.id, {
      minSize: { width: options.size === 'small' ? 16 : 32, height: 16 },
      onPointer: (event) => {
        if (event.kind === 'pointer_move') {
          this.hovered = true;
          return false;
        }
        if (!this.node.enabled || event.kind !== 'pointer_down' || event.button !== 0) return false;
        this.press();
        return true;
      },
    });
  }

  get enabled(): boolean { return this.node.enabled; }
  set enabled(value: boolean) { this.node.enabled = value; }
  setBounds(bounds: UiRect): void { this.node.setBounds(bounds); }
  setHovered(value: boolean): void { this.hovered = value; }

  press(now = performance.now()): void {
    if (!this.node.enabled) return;
    this.pressedUntil = now + 120;
    this.options.onPress();
  }

  draw(context: CanvasRenderingContext2D, now = performance.now()): void {
    drawFantasyButton(context, this.options.skin, this.options.fonts, this.node.bounds, {
      ...this.options,
      state: !this.node.enabled ? 'disabled' : now < this.pressedUntil ? 'pressed' : 'idle',
      hovered: this.hovered,
    });
  }
}

export const FANTASY_ICON_CATALOG_COLUMNS = 39;
export const FANTASY_ICON_CATALOG_ROWS = 16;

export interface FantasyIconCell {
  readonly column: number;
  readonly row: number;
}

export function fantasyIconCellIndex(cell: FantasyIconCell): number {
  const column = Math.max(0, Math.min(FANTASY_ICON_CATALOG_COLUMNS - 1, Math.floor(cell.column)));
  const row = Math.max(0, Math.min(FANTASY_ICON_CATALOG_ROWS - 1, Math.floor(cell.row)));
  return row * FANTASY_ICON_CATALOG_COLUMNS + column;
}

export const FANTASY_ICON_CATALOG: readonly FantasyIconCell[] = Array.from(
  { length: FANTASY_ICON_CATALOG_COLUMNS * FANTASY_ICON_CATALOG_ROWS },
  (_, index) => ({
    column: index % FANTASY_ICON_CATALOG_COLUMNS,
    row: Math.floor(index / FANTASY_ICON_CATALOG_COLUMNS),
  }),
);

function catalogIndex(column: number, row: number): number {
  return fantasyIconCellIndex({ column, row });
}

export interface FantasyIconDefinition {
  readonly id: string;
  readonly label: string;
  readonly frames: readonly number[];
  readonly outline?: number;
  readonly fps?: number;
}

export const FANTASY_ICON_FAMILIES: readonly FantasyIconDefinition[] = [
  { id: 'heart', label: 'Heart', frames: [catalogIndex(0, 0), catalogIndex(1, 0), catalogIndex(2, 0)], outline: catalogIndex(15, 0), fps: 5 },
  { id: 'star', label: 'Star', frames: [catalogIndex(3, 0), catalogIndex(4, 0), catalogIndex(5, 0)], outline: catalogIndex(16, 0), fps: 5 },
  { id: 'coin', label: 'Coin', frames: [catalogIndex(6, 0), catalogIndex(7, 0), catalogIndex(8, 0)], outline: catalogIndex(17, 0), fps: 6 },
  { id: 'lightning', label: 'Lightning', frames: [catalogIndex(9, 0), catalogIndex(10, 0), catalogIndex(11, 0)], outline: catalogIndex(18, 0), fps: 6 },
  { id: 'shield', label: 'Shield', frames: [catalogIndex(12, 0), catalogIndex(13, 0), catalogIndex(14, 0)], outline: catalogIndex(19, 0), fps: 5 },
  { id: 'chat', label: 'Chat', frames: [catalogIndex(0, 1)], outline: catalogIndex(15, 1) },
  { id: 'sword', label: 'Sword', frames: [catalogIndex(1, 1)], outline: catalogIndex(16, 1) },
  { id: 'gear', label: 'Gear', frames: [catalogIndex(2, 1)], outline: catalogIndex(17, 1) },
  { id: 'wrench', label: 'Wrench', frames: [catalogIndex(3, 1)], outline: catalogIndex(18, 1) },
  { id: 'crown', label: 'Crown', frames: [catalogIndex(4, 1)], outline: catalogIndex(19, 1) },
  { id: 'trophy', label: 'Trophy', frames: [catalogIndex(5, 1)], outline: catalogIndex(20, 1) },
  { id: 'gift', label: 'Gift', frames: [catalogIndex(8, 1)], outline: catalogIndex(23, 1) },
  { id: 'save', label: 'Save', frames: [catalogIndex(9, 1)], outline: catalogIndex(24, 1) },
  { id: 'book', label: 'Book', frames: [catalogIndex(10, 1), catalogIndex(11, 1), catalogIndex(12, 1)], outline: catalogIndex(25, 1), fps: 4 },
  // Row one has four colored book variants before Mail, but only one outlined
  // book cell. Mail therefore continues at outline column 26 rather than the
  // simple +15 offset used by the earlier one-to-one icons.
  { id: 'mail', label: 'Mail', frames: [catalogIndex(14, 1)], outline: catalogIndex(26, 1) },
  { id: 'backpack', label: 'Backpack', frames: [catalogIndex(9, 2), catalogIndex(10, 2)], outline: catalogIndex(24, 2), fps: 4 },
] as const;

export function fantasyIconFrameIndex(
  definition: FantasyIconDefinition,
  now: number,
  level?: number,
): number {
  if (definition.frames.length === 0) return 0;
  const index = level === undefined
    ? Math.floor(now * (definition.fps ?? 0) / 1_000)
    : Math.floor(level);
  return definition.frames[Math.max(0, index) % definition.frames.length] ?? definition.frames[0]!;
}

export function drawFantasyIconCell(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  rect: UiRect,
  frameIndex: number,
  opacity = 1,
): void {
  context.save();
  context.globalAlpha *= opacity;
  drawUiSkinAsset(context, asset, rect, 'catalog', frameIndex);
  context.restore();
}

export interface DrawFantasyIconOptions {
  readonly now?: number;
  readonly level?: number;
  readonly hovered?: boolean;
  readonly opacity?: number;
}

/** Authored multi-level icon with its matching hover-outline cell. */
export function drawFantasyIcon(
  context: CanvasRenderingContext2D,
  skin: Pick<FantasyControlSkin, 'iconCatalog'>,
  rect: UiRect,
  definition: FantasyIconDefinition,
  options: DrawFantasyIconOptions = {},
): void {
  const opacity = options.opacity ?? 1;
  if (options.hovered === true && definition.outline !== undefined) {
    drawFantasyIconCell(context, skin.iconCatalog, rect, definition.outline, opacity);
  }
  drawFantasyIconCell(
    context,
    skin.iconCatalog,
    rect,
    fantasyIconFrameIndex(definition, options.now ?? performance.now(), options.level),
    opacity,
  );
}
