# Orchard canvas UI system

This directory is the migration target for in-game canvas UI. The component
lab is the complete visual contract, and the system, settings, and developer
menus are the first live screens using the authored control families. Other
screens remain on their existing components until their lab coverage is
approved.

The lab's east-side **Live UI Migration Gallery** mirrors every current
game-facing surface as a candidate composition built from these contracts. Its
27-entry catalog is deliberately separate from the live renderers: visual
approval can happen there before a screen is swapped over, while aliases that
share one composition (such as Pack/Inventory) remain a single specimen. The
gallery has no enclosing panel: content-sized specimens are masonry-packed with
clear gutters directly over the transparency grid. Each catalog entry owns a
preferred footprint based on its actual controls, so compact overlays stay
compact while inventory, processor, character, and skill interfaces receive
the rows, grids, and split panes they need without artificial empty face area.

## Frame rules

- A frame owns its chrome. Children only receive `uiFrameContentRect` or named
  rectangles from `layoutUiFrameSlots`.
- Content insets follow the authored visual chrome: wood posts `10`, parchment
  `8`, thin `6/6/6/7`, and wood + parchment `18`. Rendering boundaries may be
  slightly wider where one-off join shading must stay attached to a corner;
  the wood repeat slice is `13/12/11/13`. Default component padding is added
  after the chrome inset. The heavy wood frame adds `8px` breathing room
  because its posts visually intrude farther than its content boundary.
- Nine-slice artwork is tiled, never stretched. Corners retain their authored
  size, edge centres repeat along one axis, and the face repeats along both.
  An incomplete final repeat is cropped from its source tile rather than
  squeezed to fill the remainder. Targets below the chrome minimum crop the
  outer corner art; component minimum sizes normally prevent that case.
- `book` starts from the authored `224×133` frame and exposes two page
  rectangles. A resizable spread is split into independently tiled left and
  right leaves. Each leaf fixes a `24px` ornamental corner region, so flourishes
  appear once at the four corners of each page while only undecorated edges and
  page face repeat. This also preserves the original centre gutter. Text content
  then adds asymmetric spine padding (more right padding on the left page and
  more left padding on the right page).
- Every closable frame uses the same authored peach square `cross` glyph for
  recognition and accessibility. It sits at the top-left corner of the safe
  content area for wood, parchment, composite, thin, book, and unframed
  surfaces. Window compositions reserve that header lane before flowing text or
  controls through `uiFrameBodyRect`, so neither chrome nor content can overlap
  it.
- Controls belong only to top-level dismissible surfaces. Nested portrait,
  slot, master/detail, and decorative frames keep their hierarchy clear by
  omitting window controls.
- Book first/previous and next/last controls mount below the outer corners of
  the book. Page numbers remain inside the lower outer edge of each page, so
  navigation and numbering cannot overwrite one another.
- Slots, buttons, and text must never position themselves relative to a frame's
  outside rectangle.

## Layout rules

- `layoutUiFlex` and `layoutUiGrid` are the only general-purpose flow layouts.
  Both return the same pixel-snapped rectangles used for drawing and hit tests.
- Flex children may declare explicit `fit`, `grow`, `fixed`, or `percent`
  main/cross-axis sizing with minimum and maximum bounds. Percentages consume
  the usable parent axis after asymmetric padding and gaps; capped growth is
  redistributed to uncapped siblings. The old row/column helpers are only
  compatibility adapters over this engine, not a second layout implementation.
- `layoutUiAnchoredRect` attaches authored floating pixels by a target and self
  anchor, then optionally shifts them inside a safe viewport. Frame controls,
  ribbons, bookmarks, tooltips, and popovers use this contract instead of
  position formulas tied to one frame size.
- Responsive composition uses `uiContainerVariant(frame.content.width)`, not
  the browser viewport. Compact, regular, and wide frames can therefore be
  tested side by side.
- Controls retain their authored minimum height. Labels truncate inside the
  control rather than overflowing into neighbours.
- Retained widget IDs are unique and inspectable through `inspectWidgetLayout`.
  Overlapping layers explicitly choose `capture` or `passthrough`; routing walks
  reverse paint order so a decorative overlay can pass through while a modal
  blocks every pointer and wheel target beneath it.

These are the useful ideas adopted from Clay's layout model: bounded sizing,
declarative hierarchy, stable queryable IDs, attach points, and explicit input
capture. Orchard keeps its TypeScript retained controls and Canvas renderer;
it does not add Clay's C arena, macro syntax, or render-command dependency.

## Authored control families

- `drawFantasyButton` is the reusable boundary for the complete Cute Fantasy
  button sheet. Geometry is `chamfered`, `square`, or `pill`; the nine authored
  color ramps are variants of those shapes rather than separate components.
- Wide buttons keep fixed left/right and top/bottom chrome. Their clean
  one-pixel centre band repeats on either axis, so taller controls gain face
  area without stretching or changing their authored corner radius.
  `idle`, `pressed`, and `disabled` select authored source states. Gold and
  white hover outlines are transparent overlays and therefore work with every
  tone without duplicating button logic.
- The 31 cells from `UI_Button_Icons.png` are composable glyphs. Their palette
  follows the selected button tone, stays at most `16px`, and is laid out inside
  the button face before label fitting. The authored `cross` is the standard
  close glyph available to future frame migrations.
- `FantasyCanvasButton` owns hover, a timed pressed state, disabled behavior,
  clipping, and press dispatch. Screens should instantiate that retained
  wrapper instead of reimplementing pointer-state timing.
- `ui_cf_icon_catalog` preserves every one of the `39×16` cells in
  `UI_Icons.png`. Semantic `FANTASY_ICON_FAMILIES` group related level/animation
  frames with their matching authored outline while the raw catalog remains
  available during the audit. Icon animation changes the selected source cell;
  it never scales or interpolates between bitmap frames.
- `ui_cf_selector_catalog` preserves all `4×20` cells from `UI_Selectors.png`.
  `drawAuthoredSelectorCell` exposes the raw audit grid while
  `drawSemanticSelector` is the reusable neutral/accept/deny slot boundary.
- `ui_cf_slider_catalog` preserves all `38×10` cells from `UI_Sliders.png`.
  The retained `Slider` supports horizontal and vertical tracks, six authored
  tones, fixed-size handles, dragging, and wheel input. Tracks and fills repeat
  their centre pixels; handles and end caps never stretch.
- `Toggle` uses the authored four-frame switch transition in colored or neutral
  form. Boolean state, disabled opacity, hit geometry, and animation direction
  are shared by the lab and live settings instead of being redrawn per screen.

## System and settings menus

- Escape opens a non-pausing `GAME MENU`; the MMO simulation remains live.
  Settings owns a full-width action row, while Help/Developer and session exits
  form paired secondary rows. Settings and developer tools are separate tabbed
  child surfaces with a persistent Back action and the common close control.
- Settings tabs are Gameplay, Controls, Video, Audio, Interface, and
  Accessibility. Only audio/background playback and player nameplate visibility
  are live preferences; future controls render disabled so they cannot imply a
  working setting.
- Audio rows combine a semantic authored music/sound icon, a retained slider,
  a percentage, and a mute/restore hit target. A muted bus remembers its last
  non-zero value.
- The Gameplay nameplate switch is the pointer/touch equivalent of the `N`
  shortcut. Arrow keys move through settings and developer tabs, and Escape
  always returns to the parent game menu.
- Native browser fullscreen is offered only when Keyboard Lock can reserve a
  normal Escape press for the game menu. Installed PWAs already own their
  display surface and render this action disabled. Browsers without that
  guarantee also disable it instead of offering a mode Escape immediately
  tears down.
- Pointer ownership follows draw order. A modal window, update prompt, roster,
  dialogue, trade, or character-name surface clears and blocks chat hover,
  dragging, wheel input, and global open shortcuts until that higher layer is
  dismissed.

## Text rules

- Game text is always rendered through bitmap fonts.
- Every one-line label receives an explicit content rectangle. Use
  `layoutPixelTextInRect` when draw and hit geometry need the same measurement,
  or `drawPixelTextInRect` to measure, align, ellipsize, and hard-clip in one
  operation. Alignment is relative to the safe content face, never the frame
  chrome.
- `fitPixelText` measures authored bitmap glyphs rather than estimating by
  character count. On extremely narrow faces the suffix reduces from `...` to
  `..`, `.`, or an empty label so drawing never exceeds the contract.
- Ribbons expose three explicit overflow modes: `grow` expands the repeatable
  centre while preserving both end caps, `ellipsis` keeps a fixed maximum
  width, and `clip` hard-clips without a suffix. Stacked ribbons independently
  fit title and subtitle inside the vertical face and omit the subtitle when
  there is not enough height.
- Rich links are typed targets, never HTML: item, player, coordinate, page
  anchor, or allowlisted HTTP(S) URL.
- Supported markup is `[[item:apple|Apple]]`,
  `[[player:farmer-7|Mira]]`, and
  `[[coord:orchard,42,18|42, 18]]`. Page and URL equivalents are also
  available for legacy compact rich text.
- Wrapping, alignment, clipping, underlines, and hit regions all come from one
  `UiRichTextLayout`.

## Markdown-first content

`parseGameMarkdown` is the content boundary for books and future long-form
frames. It returns a renderer-neutral document model rather than HTML. Raw HTML
is displayed as ordinary text, and destinations such as `javascript:` never
become interactive targets.

Supported common syntax:

- `#`, `##`, and `###` headings, with optional `{#anchor}` identifiers
- paragraphs, soft line joins, strong text, emphasis, and inline code
- ordered and unordered lists, quotes, rules, and fenced code blocks
- `[label](https://...)` links restricted to HTTP(S)

Supported game syntax:

- `[Apple](item:apple)` and shorthand `[item:324234]`
- `[Mira](player:farmer-7)`
- `[Orchard](coord:orchard,42,18)`
- `[Recipes](page:recipes)` for an in-document jump
- `<!-- page -->` to force the next page and `<!-- page: 5 -->` to place the
  following content on a particular one-based page
- `<!-- bookmark: id | Label | green | right | optional-anchor -->` for
  gold/green/red/blue/purple tabs on either edge
- `<!-- embed: item | apple | Apple -->` for typed item, player, coordinate,
  chart, or custom embed hooks

Typed targets serialize back to stable `item:`, `player:`, `coord:`, `page:`,
or HTTP(S) destinations through `serializeUiTextLinkTarget`, so the same data
can be copied or shared and then revalidated by `parseUiTextLinkTarget`.

`layoutGameBook` wraps with real bitmap-glyph measurements and automatically
flows blocks across numbered pages. It also resolves headings, explicit page
breaks, bookmarks, links, and embed rectangles into one immutable pagination
result. The first physical page opens on the right; later spreads pair even and
odd pages. `drawGameBook` returns the exact control, bookmark, and link hit
geometry and accepts an allowlisted application embed renderer.

## Inventory rules

- `layoutUiInventoryGroup` is the single flow contract for logical slot groups.
  It packs fixed-size slots left-to-right and then top-to-bottom with explicit
  `gap`, `columnGap`, and `rowGap` values; spare group area is never distributed
  between slots. `columns` is a maximum row length, so a narrower group wraps
  without stretching or shrinking its slot artwork. The returned tight content
  bounds can also drive a content-sized parent frame.
- Each gameplay container is composed from independent groups. A furnace, for
  example, owns input, fuel, output, player-inventory, and hotbar groups; each
  group chooses its own bounds, column count, gap, and start/center/end
  alignment without affecting the others.
- UI slots render state; `@orchard/sim` remains the authority for acceptance,
  maximum stacks, metadata compatibility, pickup, split, merge, swap,
  shift-move, double-click collection, and quick-craft distribution.
- Left drag distributes evenly. Right drag places one per eligible slot.
- The authored selector has a transparent 48px canvas. Its visible corners are
  mapped at least `3px` outside the slot border. During quick-craft spread only
  the slot currently under the pointer receives a reticle; accumulated targets
  communicate their preview through their changed stack quantity.
- Restricted equipment cells call the same tag-based `slotAcceptsItem` rule as
  live containers.
- Cursor state is a real stack. A failed operation preserves it.

## Pixel-art scaling rules

- Every fixed sprite destination and every 9-slice boundary is snapped through
  the active canvas transform to physical device pixels. Adjacent patches share
  the exact snapped edge, preventing hairlines and detached corner fragments at
  fractional DPR or canvas zoom.
- Repeated frame tiles stay at one logical destination pixel per authored source
  pixel before the canvas-level zoom is applied. Resizing changes the number of
  repeats; it never changes an individual tile's logical dimensions.
- Bitmap art still uses nearest-neighbour sampling. A fit-all view may discard
  source pixels when zoomed below one physical pixel per authored pixel; use
  the lab's `1:1` control for final pixel inspection.
