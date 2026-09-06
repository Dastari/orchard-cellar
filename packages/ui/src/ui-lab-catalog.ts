export type UiLabCoverageGroup =
  | 'foundation'
  | 'frame'
  | 'control'
  | 'inventory'
  | 'feedback'
  | 'pattern'
  | 'book'
  | 'actor'
  | 'migration';

export type UiLabMigrationCategory =
  | 'gateway'
  | 'world'
  | 'storage'
  | 'progression'
  | 'social'
  | 'menu';

export interface UiLabMigrationSurface {
  readonly id: string;
  readonly title: string;
  readonly category: UiLabMigrationCategory;
  readonly description: string;
  /** Content-driven specimen size. The migration gallery deliberately avoids
   * forcing unrelated interfaces into a uniform card or window footprint. */
  readonly specimenSize: { readonly width: number; readonly height: number };
  /** Top-level surfaces own a close action. Anchored HUD/overlay specimens do not. */
  readonly closable: boolean;
}

/** Every currently rendered game-facing surface, represented in the migration
 * district using only the new frame, layout, text, control, and slot contracts.
 * Aliases that share one composition (Pack/Inventory) intentionally stay one
 * specimen rather than duplicating an identical window. */
export const UI_LAB_MIGRATION_SURFACES = [
  { id: 'gateway', title: 'Gateway / Character Select', category: 'gateway', description: 'Account entry, character selection, and loading state', specimenSize: { width: 620, height: 300 }, closable: false },
  { id: 'character-name', title: 'Character Name Prompt', category: 'gateway', description: 'Blocking first-character naming flow', specimenSize: { width: 520, height: 230 }, closable: false },
  { id: 'update-ready', title: 'Update Ready', category: 'gateway', description: 'Blocking refresh-or-continue notice', specimenSize: { width: 560, height: 240 }, closable: false },
  { id: 'zone-minimap', title: 'Zone, Time & Minimap', category: 'world', description: 'Collapsible zone ribbon and world-map controls', specimenSize: { width: 540, height: 270 }, closable: false },
  { id: 'hotbar-vitals', title: 'Hotbar & Player Vitals', category: 'world', description: 'Nine-slot quick bar, resources, hunger, and currency', specimenSize: { width: 760, height: 260 }, closable: false },
  { id: 'target-effects', title: 'Target & Status Effects', category: 'world', description: 'Target resources and timed player effects', specimenSize: { width: 520, height: 290 }, closable: false },
  { id: 'chat', title: 'Expanded Chat', category: 'world', description: 'History, channel state, predictions, and input', specimenSize: { width: 660, height: 300 }, closable: false },
  { id: 'quest-tracker', title: 'Quest Tracker', category: 'world', description: 'Compact tracked-objective overlay', specimenSize: { width: 430, height: 300 }, closable: false },
  { id: 'online-players', title: 'Online Players', category: 'world', description: 'Scrollable presence roster', specimenSize: { width: 430, height: 270 }, closable: true },
  { id: 'feedback-overlays', title: 'Nameplates & Feedback', category: 'world', description: 'World labels, tooltips, and toast stack', specimenSize: { width: 560, height: 270 }, closable: false },
  { id: 'touch-controls', title: 'Touch Actions', category: 'world', description: 'Joystick, interaction, sprint, and menu actions', specimenSize: { width: 560, height: 300 }, closable: false },
  { id: 'inventory', title: 'Inventory / Pack', category: 'storage', description: 'Equipment, backpack, filtering, and hotbar', specimenSize: { width: 920, height: 430 }, closable: true },
  { id: 'crafting', title: 'Crafting & Recipes', category: 'storage', description: 'Craft grid, result, recipe list, and carried items', specimenSize: { width: 980, height: 450 }, closable: true },
  { id: 'chest', title: 'Chest Storage', category: 'storage', description: 'Resizable chest, backpack, and hotbar panes', specimenSize: { width: 780, height: 420 }, closable: true },
  { id: 'barrel', title: 'Barrel Storage', category: 'storage', description: 'Four-by-two storage and seal state', specimenSize: { width: 500, height: 320 }, closable: true },
  { id: 'furnace', title: 'Furnace', category: 'storage', description: 'Ore, fuel, output, and smelting progress', specimenSize: { width: 900, height: 420 }, closable: true },
  { id: 'cooking', title: 'Cooking Fire', category: 'storage', description: 'Raw/cooked slots and cooking progress', specimenSize: { width: 900, height: 420 }, closable: true },
  { id: 'character', title: 'Character', category: 'progression', description: 'Paper doll, equipment, attributes, and biography', specimenSize: { width: 980, height: 500 }, closable: true },
  { id: 'skills', title: 'Skill Tree', category: 'progression', description: 'Track tabs, nodes, requirements, and points', specimenSize: { width: 980, height: 500 }, closable: true },
  { id: 'quest-log', title: 'Quest Log', category: 'progression', description: 'Master/detail journal with tracking actions', specimenSize: { width: 800, height: 410 }, closable: true },
  { id: 'help-book', title: 'Help Book', category: 'progression', description: 'Markdown pages, bookmarks, links, and page navigation', specimenSize: { width: 840, height: 440 }, closable: true },
  { id: 'npc-dialogue', title: 'NPC Dialogue', category: 'social', description: 'Portrait, rich dialogue, and authored choices', specimenSize: { width: 740, height: 330 }, closable: true },
  { id: 'merchant-shop', title: 'Merchant Shop', category: 'social', description: 'Filterable stock, basket, balance, and purchase action', specimenSize: { width: 900, height: 350 }, closable: true },
  { id: 'player-trade', title: 'Player Trade', category: 'social', description: 'Two-sided escrow offers and confirmation state', specimenSize: { width: 840, height: 380 }, closable: true },
  { id: 'game-menu', title: 'Game Menu', category: 'menu', description: 'Non-pausing MMO escape menu', specimenSize: { width: 520, height: 350 }, closable: true },
  { id: 'settings', title: 'Settings', category: 'menu', description: 'Single-row tabs with audio and gameplay controls', specimenSize: { width: 900, height: 390 }, closable: true },
  { id: 'developer', title: 'Developer Tools', category: 'menu', description: 'Tabbed world, player, quest, and renderer diagnostics', specimenSize: { width: 900, height: 410 }, closable: true },
] as const satisfies readonly UiLabMigrationSurface[];

export type UiLabMigrationSurfaceId = (typeof UI_LAB_MIGRATION_SURFACES)[number]['id'];

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
  { id: 'frame-controls', label: 'Safe-area mounted shared frame controls', group: 'frame', interactive: true },
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
  { id: 'actor-catalog', label: 'Imported NPC, faction, enemy, and effect catalog', group: 'actor', interactive: true },
  { id: 'actor-animation-grid', label: 'Every authored animation row for the selected actor', group: 'actor', interactive: true },
  { id: 'actor-companions', label: 'Linked projectile, weapon, and VFX sheets', group: 'actor', interactive: true },
  { id: 'actor-lazy-preview', label: 'Visible-only lazy animated atlas previews', group: 'actor' },
  ...UI_LAB_MIGRATION_SURFACES.map((surface) => ({
    id: `migration-${surface.id}`,
    label: surface.title,
    group: 'migration' as const,
    ...(surface.closable ? { interactive: true } : {}),
  })),
] as const;
