# Orchard UI Kit

Use the exported `ui` factories to compose Studio tools and game-component previews.
The production game uses the separate `@orchard/ui` entry; its build excludes this
kit. The retained runtime builds on the existing design-system layout and art engines.

```ts
import { ui, UiRoot, loadUiKitArt } from '@orchard/ui/studio';

const root = new UiRoot({ art: await loadUiKitArt(), scale: 2 });
root.mount(ui.frame({
  header: { title: 'Orchard' },
  layout: { width: 'grow', height: 'grow', gap: 8 },
  children: [ui.text('Ready to press fruit.'), ui.button({ label: 'Press', tone: 'success', onPress: press })],
}));
root.bindCanvas(canvas);
// Dispose the root when the surface leaves its host.
```

Consumers choose tone, size and spacing tokens. `UiControlSize` means `sm | md |
lg`; the existing geometry `UiSize` remains a width/height pair. `UiSurfaceStyle`
is the kit frame vocabulary; `UiFrameStyle` describes the retained low-level frame engine. Only `skin/manifest.ts` contains sprite asset names. Entries specify
state/variant selection, native size and the authored slice; loaders cache assets
across overlapping family requests and evict failed requests for retry.

Tonal text uses `resolveUiTextContrast` with the painted family/state. All four
text roles share the 4.5:1 threshold. Face samples are checked against exact source
grids, with no caller-supplied ink and no contrast overrides currently required.
`UI_ICON_CATALOG` names all 624 cells, including outlines and explicit empty cells.
Lucide is reserved for symbols absent from that catalog. Its manifest and canonical
SVGs live in `packages/ui/public`. `npm run assets:build` copies them to both apps;
each app’s dev/build hooks refresh only its own copy at the existing public URLs.

Frames tile and never stretch. Fixed tags, discrete meter levels, compact vitals,
loading frames, and popups retain their authored size. Empty meter tracks have
repeatable caps. Some proposed extracts do not exist in the supplied sheets; the
source audit and decisions in [docs/57](../../../../docs/57-shared-canvas-ui-kit.md)
§6/§11 record the actual coverage. Do not invent missing rows or tint pixel chrome.

## Retained runtime (Phase 1)

`UiElement` owns immutable style/props views, children, measured size, arranged
rect and clip. Update through `setStyle` / `setProps`; use `append`, `remove`, or
`replaceChildren` for topology. `UiRoot.mount` attaches a tree; `resize` and
`setScale` update its logical viewport. `bindCanvas` owns listeners and scheduling
and returns cleanup; `dispose` releases the root and its tree. A game-owned loop
can instead call `arrange`, `draw`, and the input methods explicitly.

Use `uiFixed(n)` for nonnegative fixed dimensions and `uiOffset(n)` for explicit signed anchor/inset positions (for example, a world marker crossing a viewport edge). Padding and gap accept only `UiSpace`. Signed positioning never disables clipping.
Overflow is clip by default; scroll variants own their offsets and thumb geometry.
A floating/modal layer is the explicit way to escape an ancestor's clip, and it
still clips to the viewport. `animate` schedules root-owned timed state. Hidden
canvases pause scheduling; decorative animation finishes under reduced motion.

Layout fixture provenance and supported CSS differences are documented in
`layout/fixtures/README.md`. Phase 1 scope and acceptance criteria are in
[docs/57 §10](../../../../docs/57-shared-canvas-ui-kit.md) (Phase 1 — layout engine
and element runtime).

## Core composition (Phase 2)

Load `loadUiKitArt()`, create `new UiRoot({ art, scale: 2 })`, mount a composition
from the exported `ui` namespace, and call `root.bindCanvas(canvas)`. Dispose the
root when its surface leaves the application. Host-owned render loops can call
`draw` with an explicit view transform; input points remain in arranged logical
coordinates. Sprite nodes request animation only while visible and motion is
allowed.

Start from these live, source-backed cookbook entries:

- [Foundations](http://localhost:5175/author/ui-lab?specimen=foundations): bitmap
  roles, outline/alignment, wrap/ellipsis/clip, four image fits, links, icons and delayed tooltips.
- [Frames](http://localhost:5175/author/ui-lab?specimen=frames): all surface styles,
  contained headers/close, all eight resize handles, named slots, percent/absolute/fixed placement and scrolling.
- [Controls](http://localhost:5175/author/ui-lab?specimen=controls): seven tones,
  three sizes and three shapes, disabled/loading states, leading/trailing adornments and authored hover outlines.
- [Fruit Press](http://localhost:5175/author/ui-lab?specimen=furnace): the furnace
  acceptance composition, with responsive columns and read-only inventory cells.
- [Actors](http://localhost:5175/author/ui-lab?specimen=actors): catalog filters,
  30-entry pages, every selected animation and companion previews.

The default Studio port is 5174; these review links use the isolated 5175 server.
Use the inspector to open a specimen in the resizable playground. F fits the world,
0 returns home, 1 restores exact camera zoom, M/C/A jump to migration/authored/actor
areas, and brackets change the actor selection. UI scale is independent of camera
zoom. Tab reaches toolbar, inspector and visible specimen actions; Enter/Space
activate, and Escape dismisses a tooltip or releases a pinned inspection.

Add a specimen in `lab/specimens/`, register it in `lab/registry.ts`, then run
`npx tsx packages/tools/src/kit-lab-code-cards.ts` from the repository root. Code
cards are extracted from the actual build body. Registry tests cover every prop
matrix at three sizes and scales, keyboard actions and Skia offscreen pixel hashes.
Use `UPDATE_UI_SNAPSHOTS=1 npx vitest run packages/ui/src/kit/lab/registry.test.ts`
only for an intentional visual change, inspect it in Studio, and commit the
updated hashes with the implementation.

The original Phase 2 inventory fixture now uses the full inventory grid. The
Phase 4 specimens below supply interactive containers and frame bindings.

Frame `slots` names are `leading`, `body`, and `trailing`; use them or free
`children`, not both. Header `content` accepts any kit node, and `ribbon` selects
the fixed authored ribbon. Resize `handles` accepts `corner` (default), `corners`,
`edges`, or `all`, with min/max logical sizes. Inspector bounds include the
compact/regular/wide container variant.

Text `overflow` selects `wrap`, `ellipsis`, or `clip`; `outline` and `align` keep
the inherited tone ink. Image dimensions can include atlas `x/y`; `fit` selects
contain/cover/none/tile, and `integerScale` opts into integer enlargement.
Cute Fantasy icons accept exact `fantasy` names or semantic `cf` plus `level`;
Lucide icons inherit contrast ink. Add button glyphs or icons through `leading`
and `trailing`. A `loading` button shows the reviewed spinner and blocks activation.

## Forms, data and feedback (Phase 3)

- [Choices](http://localhost:5175/author/ui-lab?specimen=form-controls): three
  checkbox states, radio groups, switches, sliders and bounded steppers.
- [Fields](http://localhost:5175/author/ui-lab?specimen=text-and-selection):
  adornments, clear/error/disabled fields, wrapped text, grouped selection,
  async suggestions and create-new callbacks.
- [Data](http://localhost:5175/author/ui-lab?specimen=data): virtual or paginated
  tables, compound sorting, resizable columns, selectable lists, tabs and trees.
- [Dialogs](http://localhost:5175/author/ui-lab?specimen=dialogs): confirm,
  destructive confirm and prompt with trapped/restored focus.
- [Feedback](http://localhost:5175/author/ui-lab?specimen=feedback): four meter
  styles, popovers, menus, context menus and timed actionable toasts.

`ui.table` defaults to virtual rows for `surface: 'studio'` and pagination for
`surface: 'game'`. Shift-activate a column header to add a sort key; keyboard
arrows resize a focused column handle. Lists expose one keyboard stop, with
arrows, Home/End, PageUp/PageDown and Enter/Space selection. Tree search retains
matching ancestors. Tabs retain their panels and switch on roving arrow focus.

Inputs use the shared text model. `bindCanvas` creates and disposes one invisible
native textarea for browser editing events. A host-managed canvas can own a
`UiTextBridge` with its focus and coordinate adapters; the lab demonstrates this.
TextArea wraps by available bitmap columns and can show line numbers and a
keyboard/pointer resize handle. Combobox aborts stale requests on new input,
dismissal or disposal. Callbacks receive values, never browser DOM elements.

Popover, Menu and Dialog return `UiOverlay` nodes: mount once, then call
`open(opener)` or `close()`. Placement follows arranged anchors and clips to the
viewport. Escape/click-away dismiss floating content; modal focus stays inside
and returns to its opener. Toasts pause while hovered or focused and retain their
dismissal deadline under reduced motion.


## Inventory, books and game compositions (Phase 4)

- [Inventory transactions](http://localhost:5175/author/ui-lab?specimen=inventory-transactions):
  pick/split/place/merge/swap, drag distribution, shift move, double-click collect,
  restricted equipment, hotbar and cursor stack. The controller accepts a structural
  inventory model; live hosts own authoritative transactions. Keyboard Enter/Space
  clicks, ContextMenu splits, Shift+Enter moves, and Escape cancels distribution.
- [Books](http://localhost:5175/author/ui-lab?specimen=books): shared markdown parsing
  and pagination, spine-safe pages, explicit breaks, bookmarks, embeds and typed links.
  Home/End and PageUp/PageDown navigate; raw HTML stays inert text.
- [World anchors](http://localhost:5175/author/ui-lab?specimen=world-anchors): seven
  tones and four tail directions, ribbons, banners, badges, loading and crosshair.
- [Touch actions](http://localhost:5175/author/ui-lab?specimen=touch-actions): captured
  movement and simultaneous action pointers, with keyboard equivalents.
- [Authored catalog](http://localhost:5175/author/ui-lab?specimen=authored-catalog):
  searchable button/glyph/icon/selector/slider/toggle/bar/frame audit families.
- [Frame Designer](http://localhost:5175/author/ui-lab?specimen=frame-designer):
  parsed JSON drafts, pane selection/reordering/grid edits, kit preview and explicit
  revision-checked publish. The Studio host supplies access; anonymous drafts stay local.
- [Composition patterns](http://localhost:5175/author/ui-lab?specimen=composition-patterns):
  form dialogs, master/detail, settings rows, search/list and focus-raised windows.
- [Migration gallery](http://localhost:5175/author/ui-lab?specimen=migration-gateway):
  all 30 game surfaces, using the public `ui.gameSurface` factory and deterministic
  host data. Real host adoption belongs to Phase 6; registering a specimen does
  not migrate an application screen.

`ui.contentFrame` resolves existing doc 55 pane bindings with `resolveFramePaneSlots`.
Callers provide aliases, the item/process registry, and optionally an inventory
controller/artwork map. `ui.inventoryGrid` chooses automatic columns and native 28×31 slot footprints at integer scales.
Slot size tokens are `sm`, `md`, `lg`, or `auto`. Fixed column tracks keep slots
close together, with a two-logical-pixel default gap in both axes; spare width
stays outside the group. `ui.hotbar` reports number-key selection without transferring items.
`ui.windowStack` raises a window when its descendants receive focus or it is clicked.

Use `ui.inventoryPanel({ ...gridOptions, onSort, itemLabel, capacity })` for a
searchable inventory. It adds the kit Filter items field and an optional Sort
button, retains editing focus, and keeps original slot indices when filtering.
`capacity` is a host getter; `itemLabel` can resolve names from the active content
registry. `filter` initializes the query and `onFilter` persists it. Controller
refreshes update search results after transfers. A content frame enables the same
composition with `inventoryControls: { backpack: { onSort, itemLabel, capacity } }`.
Sort callbacks request the host transaction; the component does not reorder
authority-owned stacks itself.

## Studio workbench

[Workbench specimen](http://localhost:5175/author/ui-lab?specimen=studio-workbench)
shows the scrolling rail, floating drawers, narrow drawer choices, and both split
orientations. Compose `ui.workbench({ navigation, workspace, controls, inspector })`;
pass each drawer `{ title, content, width: uiFixed(...) }`. Drawer widths and
`onRegionArrange` rectangles are logical kit units. Persist `onDrawerResize`
values in the host. At narrow widths, `activeDrawer` chooses `controls`,
`inspector`, or `none`; width preferences return when space is available.

Use `ui.splitPane({ label, first, second, direction, ratio, onResize })` inside the
workspace. Arrow keys adjust the focused divider; Home/End reach the bounded
limits and Enter restores equal panes. Both panes keep their clips while resizing.

Tool models can retain a `CanvasTextEditor` across rebuilds with
`ui.input({ label, editor })` or `ui.textArea({ label, editor })`. The model owns
its value and limits; omit `value` and `maxLength` when supplying it. Pointer
focus does not pin rail tooltips after the pointer leaves.

### Editor primitives

[Editor primitives specimen](http://localhost:5175/author/ui-lab?specimen=editor-primitives)
covers the pieces map and object editors need beyond the core controls:

- `ui.layerRow({ id, label, visible, selected, onSelect, onToggleVisible })` is a
  16-pixel layer entry with a visibility toggle and a selectable name. Add
  `locked` plus `onToggleLock` for a lock toggle. `visibilityId`, `lockId` and
  `selectId` keep host control ids stable.
- `ui.button({ ..., drag: { threshold, onMove, onDrop, onEnd } })` turns a
  button into a drag source. A release below the threshold still presses.
  Points are logical kit coordinates.
- `ui.deferredImage(resolve, { label, fallback })` paints artwork that arrives
  after the tree is built, without rebuilding the tree. `ui.imageUrl(url, options)`
  loads and caches a standalone PNG, for example `packages/ui/public/studio-icons`.
  `fallback: null` leaves the cell empty until the image loads.
- `ui.selectionReticle({ inset, outset })` overlays the authored confirm selector
  on a picked cell and crops it to the cell's own rectangle.
- `ui.flex/grid/stack/scrollArea` accept `onArrange` to observe arranged bounds,
  for example to size host spatial content.

### UI-kit gate (Studio)

Studio composes kit factories only (doc 61 §5). `@orchard/ui/studio` exports kit
values explicitly and kit types type-only, so `UiElement` can be named but not
constructed. It does not expose engine painters (`draw*`), hand layout
(`layoutUi*`) or the retired Studio shell models. Three checks enforce the
boundary:

- the `orchard-ui-kit/*` ESLint rules (`scripts/eslint/orchard-ui-kit.mjs`);
- the dependency-free prebuild check `packages/studio/scripts/verify-ui-kit.mjs`;
- `packages/studio/src/ui-kit-gate.test.ts`, which mounts every Studio route and
  fails on any element kind the kit does not produce.

Raw canvas drawing is allowed only in the viewport renderers listed in
`STUDIO_UI_KIT_POLICY.rawDrawAllowlist`. Colour literals are allowed only in the
token and content files in `colourAllowlist`. Keep both lists short. When Studio
needs something new, add it here with a specimen.

Studio now mounts the workbench, with a Layout menu and retained spatial tool
lifecycles. Operate/observe forms and tables, map selection, and world/live/layer
trees, palettes, editors, previews and map confirmation panels use kit components.
The descriptor adapter, the old Studio shell/table renderers and the retired
`packages/ui/src/studio` rail, dock, table and inspector models have been deleted.
The Phase 5 Studio migration is complete.

`ui.tree` accepts `expanded`, `activeId`, `selected`, `initialScrollY`, and matching
change callbacks. `trailing` adds row actions; `renderNode` plus a fixed
`rowHeight` supports richer rows. Virtual lists preserve row identity when a
scroll leaves that row mounted. Hosts restoring focus after a rebuild should
preserve `root.focus.inputSource` when calling `root.focus.set`.

Use `ui.frame({ blockInput: true, ... })` for a modeless panel above an interactive
viewport. Its background consumes pointer and wheel events, its descendants stay
interactive, and clicks outside the panel can still reach the viewport. Use
`ui.dialog` when the whole workspace should be modal.


`ui.contentFrame` returns a retained frame with `updateState(state)`. Call it for
new authored state snapshots: it updates bound labels/meters and pane/action
visibility while preserving inventory filters, focus, and resize state. Immediate
`progress` can be a getter; state-bound batch bars use their own state fields.

`ui.statistics` presents lifetime records using game pagination and exact bigint
formatting. `updateStatistics(model)` retains the page and sort state.

## Retained engine contracts

The `design-system/` directory supplies layout, bitmap art, rich text, and book
pagination primitives used by the kit. Screens compose `ui` factories; they do
not call the engine's painters or instantiate its older control wrappers.

- `layoutUiFlex` and `layoutUiGrid` implement bounded fit, grow, fixed, and
  percent sizing, asymmetric padding, wrapping, and alignment. Capped growth
  is redistributed to uncapped siblings. The deprecated root row/column
  adapters are removed.
- `layoutUiAnchoredRect` attaches target and self anchors within a safe
  rectangle. The kit runtime owns final arranged rectangles, clipping, and
  input order; screen code must not independently calculate hit rectangles.
- Frame chrome keeps authored content insets and repeat slices distinct.
  Existing wood content posts are 10 pixels, parchment 8, thin 6/6/6/7,
  composite 18; the wood repeat slice is 13/12/11/13. These are skin-engine
  details, not caller padding values. Kit callers choose surface and spacing
  tokens and use the resulting content rectangle.
- Authored button corners, slider caps, and handles retain their native size.
  Face bands tile; state changes select source frames and transparent outlines.
  Icon animation selects discrete bitmap cells without interpolation.
- Book art begins at 224×133 and tiles two independent leaves. Each preserves
  its ornamental 24-pixel corners, centre gutter, and asymmetric spine padding.
  Kit book navigation and links use the same pagination result as painting.
- Bitmap text fits against measured glyphs, never character-count estimates.
  Extremely narrow ellipsized labels reduce the suffix to two dots, one dot,
  or nothing. Rich-text layout owns wrapping, link underlines, and hit regions.
- Slots remain 28×31 logical pixels with a two-pixel gap in both directions
  within one inventory. Spare space stays outside the group. Simulation rules
  govern acceptance, stack metadata, splitting, swapping, quick-move,
  collection, and drag distribution; UI previews do not replace authority.
- Art uses nearest-neighbour sampling. Shared snapped edges prevent seams at
  fractional DPR. Resizing changes tile counts, not tile dimensions. A zoomed
  out overview may discard source pixels; inspect at 1:1 for pixel review.

## Markdown-first content

`parseGameMarkdown` is the content boundary for books and long-form
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
odd pages. The kit book consumes this result for its controls, bookmarks, links, and
allowlisted embeds; callers do not supply bespoke screen painters.
