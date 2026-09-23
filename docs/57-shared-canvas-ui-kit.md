# 57 — Orchard UI Kit: One Canvas UI System for Game and Studio

Plan, **2026-09-05**. Status (2026-09-23): **Phases 0–5 shipped; Phase 6 (game
migration) not started.** The kit runtime, core, form/data, game and Studio
workbench components are live, and Studio mounts only kit compositions. Studio
compliance is enforced by the UI-kit gate in [61](61-world-editor-and-authoring-model.md)
§5: the `orchard-ui-kit/*` ESLint rules, the `packages/studio/scripts/verify-ui-kit.mjs`
prebuild check and the route-mounting test `packages/studio/src/ui-kit-gate.test.ts`.
The game client still uses its hand-drawn screens. Companion to
[23](23-ui-system.md) (widget/window/container contracts, art extraction rules),
[55](55-game-authoring-suite.md) §7 (Frame Designer output is the presentation
contract), and [56](56-orchard-studio.md) §4.1 (Studio visual language, sole-canvas
shell). Supersedes the "migration target" wording in
`packages/ui/src/design-system/README.md`: after this plan the kit **is** the UI
system, and everything else in `@orchard/ui` is either a kit component or deleted.

The owner's brief (2026-09-05): one shared canvas UI system for the game client and
Orchard Studio, equivalent in role to Tailwind (tokens, sizing, spacing, tones) plus
shadcn (a documented catalog of composable components), built from the licensed Cute
Fantasy UI sheets, with a public icon library for symbols the kit lacks. It must be
easy for an agent to build any surface from the documentation alone, nothing may
overflow its container, resizing must reflow like HTML flex/grid, and it must be able
to re-create every in-game window/HUD element and every Studio component. Studio
must host a UI Lab that works like the old client lab: a pan/zoom specimen world
where the owner and UI agents test layouts such as the furnace interface, with every
component's options on display (§9.1).

## 1. Goal

A developer or agent can write this, and it works in both applications:

```ts
const dialog = ui.frame({
  style: 'wood_parchment',
  header: { title: 'Fruit Press', closable: true, draggable: true },
  resizable: { min: { width: 320, height: 240 } },
  layout: { direction: 'row', gap: 8, padding: 8 },
  children: [
    ui.flex({ direction: 'column', grow: 1, gap: 6 }, [
      ui.text('Input', { role: 'heading' }),
      ui.inventoryGrid({ container: 'press.input', slotSize: 'auto', columns: 'auto' }),
    ]),
    ui.flex({ direction: 'column', basis: 96, gap: 6, align: 'center' }, [
      ui.progress({ tone: 'gold', value: model.progress }),
      ui.button({ label: 'Press', tone: 'success', size: 'md', onPress: press }),
    ]),
    ui.flex({ direction: 'column', grow: 1, gap: 6 }, [
      ui.text('Output', { role: 'heading' }),
      ui.inventoryGrid({ container: 'press.output', slotSize: 'auto', columns: 'auto' }),
    ]),
  ],
});
```

Resizing the frame reflows the three columns, the slot grids re-pack and, if
allowed, re-scale their slots, the header and close control stay inside the chrome,
the progress bar keeps its authored thickness, and no glyph is painted outside the
frame's clip.

## 2. Findings (2026-09-05)

### 2.1 What exists and is sound

`packages/ui/src/design-system/` already holds the correct engine-level ideas and
should be kept as the seed of the kit, not replaced:

- `layoutUiFlex` / `layoutUiGrid` with asymmetric padding, gaps, and
  `fit | grow | fixed | percent` sizing with min/max bounds; `layoutUiAnchoredRect`
  for floating attachment; `uiContainerVariant` for width-driven responsiveness.
- Nine-slice frames that **tile, never stretch** (`drawUiFrame`, `nineSlicePatches`,
  device-pixel snapping); content rects, a header lane, close control, corner
  resize handles, and `UiFrameResizeController`.
- `parseGameMarkdown` → renderer-neutral document; `layoutGameBook` / `drawGameBook`
  pagination; `parseUiRichText` / `layoutUiRichText` wrapping with link hit regions.
- `layoutUiInventoryGroup` (wrapping slot flow), `drawUiInventorySlot`,
  `UiInventoryInteractionModel` (pickup, split, merge, drag-distribute).
- `drawFantasyButton` / `FantasyCanvasButton` over nine tones × three shapes × two
  sizes with hover outlines; `Slider`, `Toggle`, `Scrollbar`, `Ribbon`.
- `CanvasTextEditor` (selection, clipboard, IME), `CanvasFocusManager`,
  `UiInputRouter` with `capture | passthrough`, retained `WidgetNode` tree and
  `inspectWidgetLayout`.
- Bitmap text: `drawPixelTextInRect` measures real glyphs, ellipsizes, clips.
- 70 reviewed `ui_cf_*` extracts in `packages/assets/ui/` carrying `slice`,
  `uiSizing`, `frameKinds`, and exact `sourcePalette`, including the full
  39×16 icon catalog (`ui_cf_icon_catalog`) with outline cells, all button
  families, selectors, sliders, bars, bubbles, ribbons, book.
- Lucide (ISC licence) is already the editor symbol source at
  `packages/client/public/ui/lucide/*.svg`, loaded through `loadUiIconSet`.

### 2.2 What is missing

- **No box model.** Layout functions return rects; nothing owns padding, overflow,
  clipping, or positioning as *properties of a node*. Every screen composes rects by
  hand, which is why overflow bugs recur.
- **No element runtime.** `WidgetNode` is a paint/hit shell with no measure pass,
  no dirty tracking, no scroll containers, no focus order, no layers (modal, popover,
  toast), no keyboard navigation.
- **No component catalog.** Missing outright: checkbox, radio, select/dropdown,
  combobox/autocomplete, text area, adorned input, number stepper as a control,
  tabs as a control, table with sorting/pagination, image, tooltip/popover as
  components, dialog/confirm, toast, tree, menu.
- **Tones are per-component.** Buttons know nine tones; frames, bars, bubbles,
  badges, text, and selectors do not share a tone vocabulary, and text colour is
  chosen by the caller rather than derived from the surface.
- **Two parallel worlds.** The game composes ~10,000 lines of bespoke screens
  (`overworld-ui.ts` alone is 4,586 lines) directly over draw calls. Studio composes a
  flat `StudioCanvasShellNode[]` per tool through `SurfaceComposer` with hard-coded
  row heights and line-split (not wrapped) text. Neither uses windows with headers,
  markdown, inventory groups, or generic scrolling from the design system.
- **Art coverage is partial.** `UI_Frames.png` has seven colour families of
  square frames (fourteen corner/shadow variants each), four pointer/tag shapes per
  family, three parchment styles, three grey styles, and the paper-doll equipment
  icon strips; only wood, parchment, thin, and bubble are extracted.
  `UI_Buttons.png` has sixteen colour rows; nine are extracted. `UI_Bars.png` has
  the fixed vitals HUD plus small pill meters in six colours, thin bars, and
  segmented bars; only the vitals frame and four fills are extracted.
  `UI_Pop_Up.png`, `UI_Premade.png`, `Loading_Icon.png` are not extracted.

## 3. Decisions

1. **One package, one subtree.** The kit lives at `packages/ui/src/kit/` and is
   exported from `@orchard/ui`. Game (`packages/client`) and Studio
   (`packages/studio`) consume it identically. No kit code may import from
   `client`, `studio`, `engine`, or `world-bindings`; it may import `@orchard/sim`
   types only for the inventory binding boundary already used by `content-frame.ts`.
2. **Retained element tree with a CSS-like box model.** Nodes have style
   properties (position, size modes, padding, gap, overflow, flex, grid, z-layer).
   Layout is a two-pass measure/arrange over the tree, pixel-snapped. Draw and hit
   testing read the same arranged rects. Immediate-mode composition
   (`SurfaceComposer`) is retired.
3. **Clip by default, always.** Every node clips its children to its padding box
   unless it explicitly opts into `overflow: 'scroll'` (which adds a scrollbar) or
   is a floating layer child (tooltip, popover, drag ghost) that is positioned by the
   runtime and clipped to the viewport. `overflow: 'visible'` does not exist.
4. **Tokens before components.** A single `tokens.ts` defines tones, sizes,
   spacing scale, radii-by-shape, text roles, z-layers, and motion. Components
   accept tokens, never raw colours or pixel sizes, except `fixed` layout sizes.
5. **Tone drives everything, including text.** `neutral | primary | success |
   danger | warning | info | muted` map to authored art families (button rows,
   frame colour families, bar fills, selector rows, bubble tails). Each tone
   records a face colour sampled from its authored sprite; text colour is chosen
   by contrast against that face (WCAG relative luminance, threshold 4.5:1, with a
   per-tone authored override table for the pixel palette where the formula picks
   badly). Callers never set text colour on tonal surfaces.
6. **Art is the licensed kit; symbols are Lucide.** Everything with pixel-art
   chrome comes from the Cute Fantasy sheets as reviewed text-authored derivatives
   (DECISIONS 2026-08-24 art/licensing; never commit the source sheets). Semantic
   symbols the kit lacks (undo, layers, save, filter, sort arrows, chevrons for
   selects, search) come from Lucide, rasterised at 16/24 px with nearest-neighbour
   sampling and pixel snapping, tinted through the same tone table. No other icon
   library. The Lucide manifest moves from `packages/client/public` to a shared
   `packages/ui/public/ui/lucide/` copied into both apps by the existing PWA/static
   asset step.
7. **Bitmap fonts only.** Body 5×7, header 8×12, as today. The Kenmi 5×9 font is
   an open option (§11) and is not required by this plan.
8. **UI scale is a runtime property of the root**, 1×/2×/3× integer, shared by
   layout and paint. Studio defaults to 2×; the game defaults by viewport.
9. **Studio migrates first, then the game.** Studio has no live players, its
   surfaces are all owner-facing, and its `StudioCanvasShellNode` kinds map
   one-to-one onto kit components. Game surfaces migrate window-by-window behind
   the existing UI Lab approval loop.
10. **Legacy is deleted, not wrapped.** Each migrated surface deletes its bespoke
    renderer. A lint rule forbids `drawImage`, `fillText`, `drawPixelText*`, and
    `drawUiFrame` outside `packages/ui/src/kit/` once the migration for that
    application is complete.

## 4. Architecture

```
packages/ui/src/kit/
  tokens.ts            tones, sizes, spacing, text roles, z-layers, motion
  skin/                manifest of every authored asset the kit uses, by token
    manifest.ts        token → asset name → frame/state/slice
    contrast.ts        face colour table + text colour resolution
    load.ts            loadKitSkin(subset) with lazy per-family loading
  layout/
    box.ts             UiStyle (position, sizing, padding, gap, overflow, clip)
    measure.ts         intrinsic min/preferred size per node kind
    flex.ts            wraps design-system/layout.ts flex engine
    grid.ts            wraps design-system/layout.ts grid engine
    absolute.ts        absolute/fixed/anchored placement
    scroll.ts          scroll offsets, scrollbar geometry, wheel/drag/keyboard
    arrange.ts         two-pass measure → arrange, dirty subtrees only
  runtime/
    element.ts         UiElement: style, props, children, arranged rect, clip
    root.ts            UiRoot: layers, scale, DPR, invalidation, draw, routing
    input.ts           pointer/wheel/key/text routing, capture, focus order
    focus.ts           tab order, roving focus in lists/grids/tables
    layers.ts          base | floating | modal | toast | cursor
    animation.ts       timed state (pressed flash, toggle slide, toast decay)
  components/          one file per component, see §5
  patterns/            dialog helpers, form rows, master/detail, window manager
  README.md            the agent-facing cookbook (§8)
  lab/                 UI Lab (§9): world canvas, districts, specimen registry
    world.ts           bounded specimen world, camera, zoom, districts, views
    registry.ts        LabSpecimen registry and prop matrices
    specimens/         one file per specimen or composition (furnace, chest, …)
```

### 4.1 Layout engine

- `UiStyle` fields: `position: 'relative' | 'absolute' | 'fixed'`, `inset`,
  `width/height: 'fit' | 'grow' | number | percent`, `minWidth/maxWidth/...`,
  `padding` (asymmetric), `gap`, `overflow: 'clip' | 'scroll' | 'scroll-x' |
  'scroll-y'`, `display: 'flex' | 'grid' | 'stack' | 'none'`, flex fields
  (`direction`, `wrap`, `justify`, `align`, `grow`, `shrink`, `basis`), grid
  fields (`columns`, `rows`, `areas`, `columnGap`, `rowGap`, `area`), `zLayer`,
  `visible`.
- **Measure pass** computes each node's min-content and preferred size bottom-up
  from its kind (text measures glyphs, frame adds chrome insets, slot grids report
  the tight packed size, images report intrinsic or fixed size). **Arrange pass**
  resolves the parent's content box then delegates to the existing flex/grid engine
  with the measured children. Absolute children are arranged against the parent's
  padding box after in-flow siblings; fixed children against the root.
- Every arranged rect is pixel-snapped once and reused for paint and hit tests.
- Invalidation is per subtree: style/props changes mark the node dirty; the root
  re-arranges the nearest ancestor whose size cannot change.
- Semantics are documented against HTML flex/grid in a fixture table
  (`layout/fixtures/*.json`) so an agent who knows CSS can predict results.

### 4.2 Element runtime

- `UiElement` is the only node type; components are factory functions returning
  configured elements with a `kind`, `style`, `props`, and lifecycle hooks
  (`measure`, `paint`, `onPointer`, `onWheel`, `onKey`, `onText`, `onFocus`).
- `UiRoot` owns the canvas transform, UI scale, DPR, five z-layers, focus, pointer
  capture, tooltips, the drag ghost, and the cursor. Routing walks reverse paint
  order; a modal layer blocks everything beneath it (existing capture/passthrough
  rule).
- Text input reuses `CanvasTextEditor`; IME composition, clipboard, and selection
  stay in the root's hidden DOM proxy exactly as Studio does today.
- Keyboard: Tab/Shift+Tab across focusables in DOM order; arrows within lists,
  grids, tabs, tables, menus; Enter/Space activate; Escape closes the topmost
  dismissible surface. Touch: existing `touch-controls.ts` becomes a component.

### 4.3 Skin and tokens

- `tokens.ts` — `UiTone`, `UiSize` (`sm | md | lg`), `UiSpace` (`0 2 4 6 8 12 16
  24 32`), `UiTextRole` (`body | header | label | caption`), `UiShape` (`chamfered | square | pill`), `UiFrameStyle`
  (extended in §6), `UiLayer`.
- `skin/manifest.ts` maps each (component, tone, size, state) to an asset name and
  frame. It is the **only** place asset names appear.
- `skin/contrast.ts` holds the face colour per tone family and resolves text
  colour (`light`, `dark`, or `outlined`) with the authored override table.
- `loadKitSkin(['frame','button','slot'])` loads lazily per family so the account
  page and Studio tools do not pay for the whole set.

## 5. Component catalog

Every component: accepts `style` overrides, a `tone` where visual, an `id`, is
keyboard-operable, clips its content, and has a specimen in the lab.

| Group | Component | Art | Notes |
|---|---|---|---|
| Surface | `Frame` | `UI_Frames.png` families | styles in §6; optional header (title text or ribbon, close, drag), resizable corners/edges, min/max, three named body slots or free children |
| Surface | `Dialog` | Frame + modal layer | `confirm`, `danger`, `prompt` patterns; focus trap; Escape/close/backdrop |
| Surface | `Popover`, `Tooltip`, `Menu`, `ContextMenu` | thin frame / bubble | anchored via `layoutUiAnchoredRect`, viewport-constrained, floating layer |
| Surface | `Toast` | parchment / tone frame | stack, timed decay, action |
| Surface | `SpeechBubble` | bubble + tails | tone tails, anchor edge, wraps and never exceeds `maxWidth`; nameplate mode |
| Surface | `Ribbon`, `Banner`, `Badge` | ribbons, flags, small pills | overflow modes grow/ellipsis/clip |
| Layout | `Flex`, `Grid`, `Stack`, `Spacer`, `Separator`, `ScrollArea` | none / thin scrollbar | ScrollArea = `overflow: scroll` with kit `Scrollbar` |
| Text | `Text` | fonts | roles, wrap/ellipsis/clip, align, outline, tone-derived colour |
| Text | `RichText`, `Markdown` | fonts | wraps existing rich-text and game-markdown; `Book` for paginated markdown |
| Media | `Icon` | `UI_Icons.png` catalog + Lucide | `{ cf: 'heart', level?: 2 }` or `{ lucide: 'undo' }`, hover outline, tone tint |
| Media | `Image` | any atlas frame or `HTMLImageElement` | `fit: 'contain' | 'cover' | 'none' | 'tile'`, integer-scale option, nearest-neighbour, clipped |
| Media | `Sprite` | atlas frame | animated preview (actor, crop stages) reusing engine atlases |
| Control | `Button`, `IconButton` | `UI_Buttons.png` | tone × size × shape, glyph or icon, leading/trailing adornment, loading/disabled, auto text colour |
| Control | `Checkbox`, `RadioGroup` | selector rows + button glyph check/cross | indeterminate |
| Control | `Switch` | existing `Toggle` | tone |
| Control | `Slider` | existing | horizontal/vertical, ticks, value label |
| Control | `Stepper` (number) | small buttons + field | existing `bounded-stepper` |
| Control | `Input` | thin frame field | start/end adornments (icon, text, button), placeholder, error tone, clear |
| Control | `TextArea` | thin frame field | wrapped, scrollable, line count, resizable |
| Control | `Select` | Input + Popover + list | keyboard search, groups |
| Control | `Combobox` | Input + Popover + list | async suggestions, highlight matches, create-new |
| Control | `Tabs` | tab chrome from premade/frames | scrollable strip, badges |
| Control | `Tree` | thin rows + Lucide chevrons | outliner: expand, search retention, roving focus (from Studio outliner) |
| Data | `Table` | thin frame + rows | column sizing, sort (multi), pagination or virtual scroll, row selection, sticky header, cell renderers |
| Data | `List` | rows | virtual, selectable |
| Data | `ProgressBar`, `Meter` | `UI_Bars.png` | fixed HUD vitals bar; resizable pill/thin/segmented meters with fixed caps; tone fills |
| Data | `Pagination` | small buttons | used by Table |
| Game | `Slot` | `ui_cf_slot` + selectors | scalable 9-slice cell, rarity tone, count, restriction icon, cursor stack |
| Game | `InventoryGrid` | Slot | flows/wraps by available width, `columns: n | 'auto'`, `slotSize: n | 'auto'` (integer-scale steps, never fractional), gap tokens; binds to sim containers via existing interaction model |
| Game | `Hotbar`, `PaperDoll` | Slot + frame equipment icon strips | compositions over InventoryGrid |
| Game | `Cursor`, `Crosshair`, `LoadingSpinner` | pointer/crosshair/loading sheets | cursor layer |

## 6. Art extraction to complete

All through the existing `assets:import` review loop (docs/11, `pixel-art` skill).
Each extract carries `slice`/`uiSizing`, complete `frameKinds`, and exact
`sourcePalette`.

| Sheet | Extract | Purpose |
|---|---|---|
| `UI_Frames.png` | one nine-slice per colour family (orange, grey, green, blue, gold, red, magenta) for the plain square; the raised/shadow variants as `state` frames | tonal frames, badges, tabs, tone-coloured dialog headers |
| `UI_Frames.png` | pointer/tag shapes per family (right, left, down, up) | tags, callouts, bubble tails for tonal bubbles |
| `UI_Frames.png` | parchment ×3 (plain, tacked, torn) and grey ×3 | note, pinned note, receipt surfaces; neutral studio panels |
| `UI_Frames.png` | equipment icon strips (peach, grey, brown) | PaperDoll restricted-slot glyphs (extend existing) |
| `UI_Buttons.png` | remaining seven colour rows for wide+small × three shapes | complete tone table (peach, cream, blue-grey, white/grey, second green/blue/red/magenta shades as `muted` variants) |
| `UI_Bars.png` | pill meters ×6 colours (cap, repeat, cap), thin bars, segmented bars, the compact portrait vitals | `Meter` tones; Studio telemetry |
| `UI_Pop_Up.png` | pop-up frame | `Toast` |
| `UI_Premade.png` | tab strips, header plates | `Tabs`, frame header plate |
| `Loading_Icon.png` | eight frames | `LoadingSpinner` |
| `UI_Icons.png` | already complete as `ui_cf_icon_catalog`; add the semantic name table for every cell (currently only families) | `Icon` by name, searchable in lab |

Lucide: add a checked-in manifest (`kit/skin/lucide-manifest.json`) listing each
symbol name, its Lucide file, and licence attribution in `CREDITS.md`.

## 7. Migration inventory

### 7.1 Studio (first)

| Surface | Today | Kit target |
|---|---|---|
| Shell rail, drawers, resize bands | `canvas-shell-layout.ts` + node list | `Frame` ×3 in a root `Flex`, drawers `position: absolute` with `resizable: 'edge'` |
| Tool drawer headings/labels/fields | `SurfaceComposer` | `Text`, `Input`, `Button` inside `ScrollArea` |
| Inspector | `canvas-inspector.ts` rows | `Table`-less form: `Grid` two-column rows, typed controls per `StudioPropertyKind` |
| Outliners (world/live/layers) | bespoke tree in map tool | `Tree` |
| Tables (players, objects, npcs, membership, observe, playbooks) | `canvas-table.ts` | `Table` with sort + pagination |
| Text editing (narrative, lifecycle source) | `CanvasTextEditor` + multiline node | `TextArea` |
| Map palette, terrain palette | scroll rows | `Combobox` search + `List` |
| Frame Designer | `WidgetNode` preview | kit `Frame` preview, live-bound to doc 55 frame definitions, mounted as a lab district (§9.1) |
| UI Lab | HTML string + frame-designer-only canvas | the full pan/zoom specimen world from the old client lab, rebuilt on the kit (§9.1) |
| Notifications | `notifications.ts` | `Toast` |

### 7.2 Game (second, in this order)

1. HUD anchored elements: hotbar & vitals, zone ribbon/minimap, quest tracker,
   target/effects, nameplates, toasts, touch controls.
2. Modal/window surfaces with containers: inventory/pack, chest, barrel, furnace,
   cooking, crafting (all through `Frame` + `InventoryGrid` bound to doc 55 frames).
3. Progression: character (PaperDoll), skills, quest log, help book (`Book`),
   statistics.
4. Social: NPC dialogue (`SpeechBubble` + `RichText` + choices), merchant shop
   (`Table`), player trade.
5. Menus: game menu, settings (`Switch`, `Slider`, `Select`), developer.
6. Gateway: character select, name prompt, update-ready, chat overlay.
7. Delete `overworld-ui.ts`, `roguelike-ui.ts`, `storage-frame.ts`,
   `content-frame.ts` draw paths, `dom-panel-skin.ts`, `compositions.ts`, and the
   deprecated `layout.ts` adapters.

The 27-entry `UI_LAB_MIGRATION_SURFACES` catalog is the checklist; a surface is
done when its live renderer is the lab composition.

## 8. Agent-facing rules (the README contract)

1. Build surfaces from `ui.*` factories only. Never call a draw function.
2. Choose a `tone`, a `size`, and spacing tokens. Never pass a colour or a raw
   pixel padding.
3. Put content in a `Frame`; put a `Frame` in a layer. Use `header` for titles,
   never a `Text` placed by hand.
4. Use `Flex` for one axis, `Grid` for two, `Stack` for overlap. Set `grow` on
   what should absorb space; give everything else `fit` or a fixed token size.
5. If content can exceed its box, wrap it in `ScrollArea`. Nothing else may scroll.
6. Text wraps by default in blocks and ellipsizes by default in controls. Set the
   mode explicitly when it matters.
7. Icons: `{ cf: name }` first; `{ lucide: name }` only when the catalog has no
   symbol. Never mix both in one control row.
8. Inventory: `InventoryGrid` with `'auto'` sizing inside a `grow` cell. Never
   compute slot positions.
9. Dialogs come from `patterns/dialog.ts` (`confirm`, `danger`, `prompt`,
   `form`). Never build a modal from a raw `Frame`.
10. Add a lab specimen for every new composition before wiring it live.
11. An application never builds its own component. If the kit lacks something
    (a layer row, a URL icon, a selection reticle), add it to the kit with a
    specimen. In Studio the UI-kit gate enforces this (doc 61 §5).

The README carries a cookbook: window with header and three columns, settings
form, master/detail with table, chest with resize, speech bubble with choices,
Studio drawer with search + tree + inspector, toast with undo.

## 9. UI Lab, tests, and acceptance

### 9.1 The UI Lab in Studio

The old client lab (`packages/client/src/ui-lab.ts`, 3,391 lines, deleted in the
working tree but present at `HEAD`) is the behavioural reference. It was one large
specimen world drawn on the game canvas that the owner and agents could pan and
zoom around, with districts for every contract and a gallery of every live game
surface. The Studio lab reproduces that experience exactly, with two changes: every
specimen is a live kit element tree instead of hand-drawn rects, and the specimens
come from a registry that the tests also iterate. It stays anonymous-readable, as
the old public route was.

**Route and shell.** `/author/ui-lab` (already registered) owns the whole working
canvas behind the global rail, like the map route. The tool drawer lists districts
and specimens with a search field; the inspector drawer shows the element tree of
the hovered or selected specimen. Route session state (camera, zoom, selected
specimen, scale, variant) persists per session exactly as the map route does, and
`?specimen=furnace&scale=2` deep-links to a specimen.

**World canvas.** A bounded logical-pixel world (the old one was 5,900 × 4,750)
over a checkerboard transparency backdrop with a faint world grid. Navigation
matches the old lab:

- drag on empty space, middle button, or Space + drag pans; wheel zooms about the
  pointer between 0.2× and 3×;
- toolbar buttons FIT, 1:1, HOME, and district jumps; keys `F` fit, `0` home,
  `1` exact 1:1, `M` migration gallery, `C` authored controls, `A` actor library,
  `[` `]` step the actor selection when that district is visible, `Escape` cancels
  the active interaction;
- a status line reports the last interaction ("RESIZING RESPONSIVE FRAME",
  "SCROLL 12/40", inventory action results);
- only districts intersecting the viewport render, and animated specimens tick
  only while visible and never under `prefers-reduced-motion`.

Camera zoom is a canvas transform applied *around* the kit; the kit itself still
lays out and snaps at logical pixels, so 1:1 shows exact authored pixels while
zoomed-out views are for overview only. The kit **UI scale** (1×/2×/3×) is a
separate toolbar switch that re-arranges every specimen, which is how the two
applications' densities are compared side by side.

**Districts.** Each is a titled, sub-titled region of the world; the set carries
over from the old lab and gains the new component groups:

| District | Contents |
|---|---|
| Foundations | text roles, outline, alignment, wrap/ellipsis/clip limits, rich links, text input |
| Frames & layout | every frame style at authored minimum; the **responsive frame**: a style selector, drag-any-corner resize, named slots, `fit`/`grow`/`percent` children, auto grid, compact/regular/wide variant readout; absolute/fixed positioning demos; scroll areas |
| Controls | every §5 control with its full prop matrix generated from the registry: tone × size × state × shape, adornments, disabled, loading |
| Forms & data | inputs, text areas, selects, comboboxes with live suggestion lists, tabs, trees, sortable/paginated tables with virtual rows, steppers, sliders, switches, checkboxes, radios |
| Inventory | live `InventoryGrid` bound to a mock sim container: cursor stack, pick/split/place/merge/swap, left/right drag distribution, shift move, double-click collect, restricted equipment cells; an `auto` grid inside a resizable frame to prove re-flow and integer re-scale |
| Feedback, HUD & world anchors | speech bubbles by tone and tail direction with max-width wrap, toasts, tooltips, popovers, menus, ribbons, badges, meters, cursor/crosshair/selectors, HUD plates |
| Patterns | dialogs (confirm/danger/prompt/form), master/detail, settings rows, search-and-list, window manager stacking and focus |
| Books & markdown | responsive book that reflows across the spine, markdown document with page breaks, bookmarks, embeds, links |
| Authored control families | the complete sheets as audit grids: all button tones × shapes × sizes × states with hover outlines, the 31 glyphs, the 39×16 icon catalog with outline cells, selectors, sliders, toggles, bars, frames — every cell hoverable with its name and coordinates |
| Actor library | the imported NPC/enemy/effect catalog with tabs, paging, and every animation of the selection playing at once (carried over unchanged, now drawn through `Sprite`) |
| Frame Designer | doc 55 frame definitions rendered as live kit `Frame`s, the JSON editor, pane selection, and publish, as today's Studio tool |
| Migration gallery | the 27 `UI_LAB_MIGRATION_SURFACES` (furnace, chest, crafting, character, settings, …) laid out in three masonry lanes at their content-driven sizes, top-level ones closable; each is the actual composition that will go live, with resize handles so it can be stretched and squeezed in place |

**Playground.** Any registered specimen can be opened in a scratch district with a
resize frame, the variant/scale switches, and stress toggles: long labels, empty
data, oversized content, thousands of rows, missing art. This is where an agent
tests "does the furnace still hold together at 320 px wide at 3×" before wiring it
live.

**Code cards.** Every composition specimen shows a card beside it with the exact
kit source that produced it (the specimen file's `build` body, formatted). The lab
is therefore also the copyable documentation; the README links to specimens rather
than restating them.

**Registry.** `kit/lab/registry.ts` collects `LabSpecimen` entries:

```ts
export interface LabSpecimen {
  readonly id: string;              // 'furnace'
  readonly title: string;
  readonly district: LabDistrict;   // 'migration'
  readonly size: { width: number; height: number } | 'content';
  readonly closable?: boolean;
  readonly matrix?: Record<string, readonly unknown[]>; // tone: [...], size: [...]
  build(ui: UiFactory, props: Record<string, unknown>, mock: LabMocks): UiElement;
}
```

An agent adds a specimen by adding one file under `kit/lab/specimens/` and
exporting it from the index; the world places it in its district automatically
(masonry within the district, district growth downward), the tests pick it up on
the next run, and the code card is derived from the same file. The 27-entry
migration catalog and the coverage list from `ui-lab-catalog.ts` become registry
entries so the "done when the live renderer is the lab composition" gate stays
mechanical.

**Inspector.** Hovering any element in any specimen outlines its arranged rect and
its clip rect and lists id, kind, style, measured size, and arranged rect in the
inspector drawer (the retained `inspectWidgetLayout` idea, now over kit elements).
Clicking pins the selection; arrow keys walk the tree.

### 9.2 Tests and acceptance

- **Lab registry drives tests.** Every specimen and every prop matrix in
  `kit/lab/registry.ts` is iterated by the tests below; no hand-authored test
  specimens exist apart from layout fixtures.
- **Layout fixtures.** JSON fixtures pair a kit tree with expected rects, authored
  from an equivalent HTML flex/grid rendered in Playwright once and frozen. Any
  divergence from CSS semantics is documented in the fixture.
- **Overflow invariant.** A test walks every lab specimen at three sizes and three
  scales and asserts every painted rect (text glyphs, sprites, patches) lies inside
  its nearest clipping ancestor. Paint is instrumented through a recording
  `CanvasRenderingContext2D` in tests.
- **Contrast test.** Every tone × text role pair meets the threshold or has an
  authored override with a recorded reason.
- **Snapshot hashes.** Each specimen at 1× renders to an offscreen canvas and is
  hashed; changes require an explicit fixture update in the same commit.
- **Performance budget.** Arrange of a 2,000-node tree under 2 ms after a leaf
  change; full arrange under 8 ms; paint of the inventory window under 4 ms at 2×
  on the reference machine. Measured in `app-performance.test.ts` style tests.
- **Keyboard acceptance.** Every specimen is operable without a pointer; a test
  drives Tab/arrows/Enter/Escape through each and asserts focus and activation.
- **Migration gate per surface.** Lab specimen approved → live swap → legacy file
  deleted → lint rule enabled for that file's directory.

## 10. Phases

Each phase ends with the check suite green and a lab that renders what the phase
added. Estimates are for one agent lane; §12 lists parallel lanes.

### Phase 0 — art and tokens (no behaviour change)

- Complete the extracts in §6; add the icon name table; move Lucide to the shared
  public folder with manifest and credits.
- Write `tokens.ts`, `skin/manifest.ts`, `skin/contrast.ts`, `skin/load.ts`.
- Validate: `assets:validate` lint for complete `frameKinds` per tone; contrast
  test passes.

### Phase 1 — layout engine and element runtime

- `layout/*` over the existing flex/grid engines; measure pass; absolute/fixed;
  scroll; dirty-subtree arrange.
- `runtime/*`: `UiElement`, `UiRoot`, layers, input routing, focus, animation.
- Layout fixtures, overflow invariant harness, performance test.
- Nothing visible changes in either app.

### Phase 2 — core components

- `Frame` (all §6 styles, header, close, drag, resize), `Text`, `RichText`,
  `Icon`, `Image`, `Sprite`, `Button`, `IconButton`, `Flex/Grid/Stack/Spacer/
  Separator`, `ScrollArea`, `Tooltip`.
- UI Lab world (§9.1): pan/zoom camera, checkerboard, districts, toolbar, keys,
  status line, session state, deep links, specimen registry, code cards,
  inspector drawer. Foundations, Frames & layout, and Controls districts populate
  from the registry; the Actor library district is carried over from the old lab.
- README first cookbook entries linking to specimens.
- Acceptance: the doc §1 example is a registered specimen, opens in the playground,
  and reflows at three sizes and three scales.

### Phase 3 — form, data, and feedback components

- `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Stepper`, `Input` (adornments),
  `TextArea`, `Select`, `Combobox`, `Tabs`, `Tree`, `Table` (sort, pagination,
  virtual), `List`, `ProgressBar/Meter`, `Popover`, `Menu`, `ContextMenu`,
  `Dialog` patterns, `Toast`.
- Keyboard acceptance for every control.
- Lab districts Forms & data, Patterns, and Feedback populate from the registry.

### Phase 4 — game-specific components

- `Slot`, `InventoryGrid` (auto columns and integer-scaled auto slot size),
  `Hotbar`, `PaperDoll`, `SpeechBubble` (tones, tails, wrap, max width),
  `Ribbon/Banner/Badge`, `Book`/`Markdown`, `Cursor`, `Crosshair`,
  `LoadingSpinner`, touch controls.
- Bind `InventoryGrid` to doc 55 frame definitions through the existing
  `resolveFramePaneSlots`.
- Lab districts Inventory, Books & markdown, Authored control families, Frame
  Designer, and the 27-surface Migration gallery populate from the registry. From
  here the migration gate in §7 is mechanical.

### Phase 5 — Studio migration

- Shell (rail, drawers, resize) → kit root. Then per tool in this order: operate/
  observe tables, inspector, outliners, map palettes, narrative/lifecycle text,
  Frame Designer, UI Lab. Delete `SurfaceComposer`, `StudioCanvasShellNode`,
  `canvas-table.ts`, `canvas-shell.ts` drawing, `docks.ts` CSS classes.
- Enable the draw-call lint for `packages/studio`.

### Phase 6 — game migration

- §7.2 order. Each window: approve lab composition → swap → delete legacy.
- Enable the draw-call lint for `packages/client` and `packages/ui` outside `kit/`.
- Remove deprecated `layout.ts` adapters and `design-system/README.md` "migration
  target" language; fold that README into `kit/README.md`.

### Phase 7 — hardening

- DPI and scale sweep on the shared preview URL (AGENTS.md) at 1×/2×/3× and
  fractional DPR; touch pass on a phone-sized viewport; screen-reader-free
  keyboard pass; performance budgets re-measured; docs 13/23 updated to point here.

## 11. Open decisions for the owner

1. **Kit name and import path.** Proposed `@orchard/ui` root export `ui` namespace
   (`ui.frame(...)`) with types under `Ui*`. Alternative: a separate
   `@orchard/kit` package (more ceremony, no benefit while both apps live here).
2. **Kenmi 5×9 font.** Import as a third text role (`label`) for Studio density,
   or stay with 5×7/8×12.
3. **Tone → art mapping for `warning`/`info`.** Proposed gold and blue rows.
   `primary` proposed as the orange/wood family to match existing chrome.
4. **Studio palette.** Keep Studio on the same tones as the game (proposed), or a
   desaturated Studio-only tone set from the grey frame/button rows.
5. **Virtual scroll vs pagination default for `Table`.** Proposed: virtual by
   default in Studio, pagination in game shops/logs.

## 12. Work breakdown for parallel agents

| Lane | Owns | Blocked by |
|---|---|---|
| A: art | §6 extracts, icon name table, Lucide manifest, credits | — |
| B: tokens/skin | `tokens.ts`, `skin/*`, contrast test | A for face colours (can stub) |
| C: layout | `layout/*`, fixtures, overflow harness | — |
| D: runtime | `runtime/*`, focus, layers, animation | C |
| E: core components | §Phase 2 | B, D |
| F: form/data components | §Phase 3 | E |
| G: game components | §Phase 4 | E |
| H: Studio migration | §Phase 5 | E, F |
| I: game migration | §Phase 6 | E, F, G |
| J: lab world | `kit/lab/world.ts`, camera/zoom/districts/toolbar, inspector drawer, session state, code cards | D |
| K: docs/registry | README cookbook, `kit/lab/registry.ts`, specimen files for each component group, lint rules | E onward, continuous |

Conflict rules: only lane A writes `packages/assets/ui`; only lane B writes
`kit/skin`; lanes E–G add files under `kit/components` and never edit each other's
components; H and I delete legacy files only for surfaces whose specimen is
approved; J owns `kit/lab/world.ts`; K owns `kit/README.md` and the lab registry,
while component lanes add their own specimen files under `kit/lab/specimens/`.

## 13. Bookkeeping

- Record the owner's answers to §11 in `DECISIONS.md` under `ui/kit`.
- Add `CREDITS.md` entry for Lucide (ISC) with the manifest path.
- Update docs 13, 23, 55 §7, and 56 §4.1 to reference this document once Phase 2
  lands; mark `design-system/README.md` superseded at Phase 6.
- Track phase status at the top of this document with dates, as docs 55/56 do.

Integration follow-up: ownership/live-marker colours now live in
`spatial-colours.ts`; the temporary `editor-controller.ts` colour exception is
removed. P0/P1 controller behavior remains subject to the same gate.
