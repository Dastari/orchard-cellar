export type UiLabCoverageGroup =
  | 'foundation'
  | 'frame'
  | 'control'
  | 'inventory'
  | 'feedback'
  | 'pattern'
  | 'book';

export interface UiLabCoverageEntry {
  readonly id: string;
  readonly label: string;
  readonly group: UiLabCoverageGroup;
  readonly interactive?: boolean;
}

/** Explicit coverage ledger for the public canvas lab. Adding a reusable UI
 * component should add a specimen and an entry here in the same change. */
export const UI_LAB_COVERAGE: readonly UiLabCoverageEntry[] = [
  { id: 'bitmap-body', label: 'Body bitmap font', group: 'foundation' },
  { id: 'bitmap-header', label: 'Header bitmap font', group: 'foundation' },
  { id: 'outlined-text', label: 'Outlined text', group: 'foundation' },
  { id: 'aligned-text', label: 'Text alignment', group: 'foundation' },
  { id: 'wrapped-text', label: 'Wrapped and clipped text', group: 'foundation' },
  { id: 'rich-links', label: 'Item/player/coordinate links', group: 'foundation', interactive: true },
  { id: 'canvas-input', label: 'Canvas text input', group: 'foundation', interactive: true },
  { id: 'wood-frame', label: 'Wood frame', group: 'frame' },
  { id: 'parchment-frame', label: 'Parchment frame', group: 'frame' },
  { id: 'wood-parchment-frame', label: 'Wood + parchment frame', group: 'frame' },
  { id: 'thin-frame', label: 'Thin frame', group: 'frame' },
  { id: 'book-frame', label: 'Open-book pages', group: 'frame' },
  { id: 'frame-controls', label: 'Style-mounted shared frame controls', group: 'frame', interactive: true },
  { id: 'frame-style-selector', label: 'Selectable live frame specimen', group: 'frame', interactive: true },
  { id: 'frame-content-slots', label: 'Named frame content slots', group: 'frame' },
  { id: 'frame-resize', label: 'Resizable responsive frame', group: 'frame', interactive: true },
  { id: 'flex-layout', label: 'Flex flow and alignment', group: 'frame' },
  { id: 'grid-layout', label: 'Responsive grid flow', group: 'frame' },
  { id: 'container-variants', label: 'Compact/regular/wide variants', group: 'frame', interactive: true },
  { id: 'button-tones', label: 'Neutral/success/danger buttons', group: 'control' },
  { id: 'button-states', label: 'Idle/pressed/disabled buttons', group: 'control' },
  { id: 'button-sizes', label: 'Compact/regular buttons', group: 'control' },
  { id: 'button-fitting', label: 'Responsive label fitting', group: 'control' },
  { id: 'icon-buttons', label: 'Small and icon buttons', group: 'control', interactive: true },
  { id: 'fantasy-button-shapes', label: 'Chamfered/square/pill authored button shapes', group: 'control', interactive: true },
  { id: 'fantasy-button-tones', label: 'Nine authored button tone variants', group: 'control', interactive: true },
  { id: 'fantasy-button-states', label: 'Authored idle/pressed/disabled states', group: 'control', interactive: true },
  { id: 'fantasy-button-hover-outlines', label: 'Gold/white hover outline states', group: 'control', interactive: true },
  { id: 'fantasy-button-glyphs', label: 'Thirty-one composable authored button glyphs', group: 'control', interactive: true },
  { id: 'fantasy-icon-animation', label: 'Semantic multi-level animated icon families', group: 'control', interactive: true },
  { id: 'fantasy-icon-outlines', label: 'Matched authored icon outline states', group: 'control' },
  { id: 'slider', label: 'Slider', group: 'control', interactive: true },
  { id: 'toggle', label: 'Toggle', group: 'control', interactive: true },
  { id: 'scrollbar', label: 'Scrollbar', group: 'control', interactive: true },
  { id: 'tabs', label: 'Tab group', group: 'control', interactive: true },
  { id: 'progress-bars', label: 'Progress and resource bars', group: 'control' },
  { id: 'currency', label: 'Currency display', group: 'control' },
  { id: 'item-slots', label: 'Item slots and stack labels', group: 'inventory', interactive: true },
  { id: 'equipment-slots', label: 'Restricted equipment slots', group: 'inventory', interactive: true },
  { id: 'cursor-stack', label: 'Persistent cursor stack', group: 'inventory', interactive: true },
  { id: 'left-right-click', label: 'Pickup/split/place/merge/swap', group: 'inventory', interactive: true },
  { id: 'quick-craft', label: 'Even and one-each drag', group: 'inventory', interactive: true },
  { id: 'shift-move', label: 'Shift quick-move', group: 'inventory', interactive: true },
  { id: 'pickup-all', label: 'Double-click collect', group: 'inventory', interactive: true },
  { id: 'durability', label: 'Durability and item metadata', group: 'inventory' },
  { id: 'speech-bubbles', label: 'Speech channels and tails', group: 'feedback' },
  { id: 'tooltip', label: 'Tooltip plate', group: 'feedback' },
  { id: 'toasts', label: 'Info/success/failure toasts', group: 'feedback' },
  { id: 'ribbons', label: 'Ribbon and banner titles', group: 'feedback' },
  { id: 'cursor-reticles', label: 'Cursors, crosshair, selectors', group: 'feedback' },
  { id: 'hud-readouts', label: 'HUD plates and readouts', group: 'feedback' },
  { id: 'effect-semantics', label: 'Well Rested and Winded effect icons', group: 'feedback' },
  { id: 'dialog-pattern', label: 'NPC dialogue pattern', group: 'pattern' },
  { id: 'shop-pattern', label: 'Shop/list pattern', group: 'pattern' },
  { id: 'quest-pattern', label: 'Quest master/detail pattern', group: 'pattern' },
  { id: 'recipe-pattern', label: 'Recipe/crafting pattern', group: 'pattern' },
  { id: 'settings-pattern', label: 'Settings form pattern', group: 'pattern' },
  { id: 'touch-pattern', label: 'Touch actions pattern', group: 'pattern' },
  { id: 'game-markdown', label: 'Safe common + in-game Markdown parser', group: 'book' },
  { id: 'book-auto-pagination', label: 'Automatic bitmap-text pagination', group: 'book' },
  { id: 'book-page-placement', label: 'Explicit one-based page placement', group: 'book' },
  { id: 'book-navigation', label: 'First/previous/next/last book controls', group: 'book', interactive: true },
  { id: 'book-bookmarks', label: 'Colored left/right bookmark tabs', group: 'book', interactive: true },
  { id: 'book-numbering', label: 'Outer-edge page numbering', group: 'book' },
  { id: 'book-typed-links', label: 'Typed item/player/coordinate/page/URL links', group: 'book', interactive: true },
  { id: 'book-embeds', label: 'Allowlisted item/chart/custom embed hooks', group: 'book' },
  { id: 'ui-icons', label: 'Editor/game chrome icons', group: 'control', interactive: true },
  { id: 'fantasy-icon-catalog', label: 'Complete 39×16 authored UI icon catalog', group: 'control', interactive: true },
] as const;
