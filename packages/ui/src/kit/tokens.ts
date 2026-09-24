/** Public kit choices. Values are logical pixels; the root owns integer scaling. */
export const UI_TONES = ['neutral', 'primary', 'success', 'danger', 'warning', 'info', 'muted'] as const;
export type UiTone = typeof UI_TONES[number];
export const UI_SIZES = ['sm', 'md', 'lg'] as const;
export type UiControlSize = typeof UI_SIZES[number];
export const UI_SPACES = [0, 2, 4, 6, 8, 12, 16, 24, 32] as const;
export type UiSpace = typeof UI_SPACES[number];
export const UI_TEXT_ROLES = ['body', 'header', 'label', 'caption', 'special-heading'] as const;
export type UiTextRole = typeof UI_TEXT_ROLES[number];
export const UI_SHAPES = ['chamfered', 'square', 'pill'] as const;
export type UiShape = typeof UI_SHAPES[number];
export const UI_LAYERS = ['base', 'floating', 'modal', 'toast', 'cursor'] as const;
export type UiLayer = typeof UI_LAYERS[number];
export type UiScale = 1 | 2 | 3;
export const UI_FRAME_STYLES = ['wood', 'parchment', 'wood_parchment', 'thin', 'book', 'unframed',
  'tonal', 'parchment_plain', 'parchment_tacked', 'parchment_torn', 'grey_plain', 'grey_tacked', 'grey_torn'] as const;
export type UiSurfaceStyle = typeof UI_FRAME_STYLES[number];
export const UI_TEXT_METRICS = Object.freeze({
  body: { font: 'body', glyphWidth: 5, glyphHeight: 7, lineHeight: 10 },
  // Ordinary titles share the controls' font; semantic hierarchy does not select a different face.
  header: { font: 'body', glyphWidth: 5, glyphHeight: 7, lineHeight: 10 },
  // Opt in only for a deliberate decorative heading or long-form reading context.
  'special-heading': { font: 'header', glyphWidth: 8, glyphHeight: 12, lineHeight: 16 },
  label: { font: 'body', glyphWidth: 5, glyphHeight: 7, lineHeight: 10 },
  caption: { font: 'body', glyphWidth: 5, glyphHeight: 7, lineHeight: 10 },
} as const);
export const UI_SIZE_METRICS = Object.freeze({
  sm: { controlHeight: 16, iconSize: 16, padding: 2 },
  md: { controlHeight: 24, iconSize: 16, padding: 4 },
  lg: { controlHeight: 32, iconSize: 24, padding: 6 },
} as const);
/** Shape selects authored corners; there is no synthetic border radius. */
/** Item qualities, poor to legendary, as shown by item tooltips and slots. */
export const UI_ITEM_QUALITIES = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type UiItemQuality = typeof UI_ITEM_QUALITIES[number];
/**
 * Inks for text on the dark item tooltip frame (`frame.tooltip_dark.*`). They are
 * the only text colours allowed there, and each clears 4.5:1 against its face
 * (see item-inks.test.ts). Tooltip components choose an ink by role; callers never
 * pass raw colours.
 */
export const UI_ITEM_INKS = Object.freeze({
  quality: Object.freeze({
    poor: '#9d9d9d', common: '#f4f1e8', uncommon: '#63c74d', rare: '#5a8ee0', epic: '#b56be0', legendary: '#f6b83f',
  } satisfies Record<UiItemQuality, string>),
  body: '#f4f1e8',
  muted: '#a9a3b8',
  equip: '#63c74d',
  flavour: '#fee761',
  unmet: '#f5555d',
});
export const UI_MOTION = Object.freeze({ pressedMs: 120, tooltipDelayMs: 500, toastMs: 4000, toggleMs: 160 });
export const UI_TABLE_DEFAULTS = Object.freeze({ studio: 'virtual', game: 'pagination' } as const);
