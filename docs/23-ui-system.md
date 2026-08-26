# 23 — UI System: Widgets, Windows, and Containers

Binding owner-directed spec (2026-08-24). Builds on the renderer pipeline of
[21-unified-renderer.md](21-unified-renderer.md) (UI pass: drawn after the final
blit, at whole-pixel UI scale, never world-zoomed, never darkened by lighting) and
the netcode rules of [22-netcode.md](22-netcode.md) (inputs-not-values; cosmetics
predicted, state authoritative). Supersedes the hand-drawn hotbar/toast code and
docs/13's in-canvas UI sketches where they conflict.

The goal: any window is a **composition of generic widgets**, and any inventory
grid is a **binding to a generic container** — so a barrel, a crafting bench, a
chest, the player backpack, and a paper-doll equipment panel are all the same
code path with different compositions and bindings, not bespoke screens.

## 1. Art source and extraction

Source: the owner-licensed **Cute Fantasy UI pack**
(`references/Cute_Fantasy_UI/UI/`). Per the standing licensing decision
(DECISIONS.md 2026-08-24 art/licensing): commit only reviewed, text-authored
derivatives with `sourcePalette` exact ramps — never the source sheets. Follow
docs/10, docs/11, and the `pixel-art` skill for the extract/review loop
(`render-review.ts` sheets, neighbor comparison).

Element families to extract, from the sheets on disk (`UI_ALL.png` is the master;
per-family sheets exist for most). Primary style family is the **wood/parchment
set** already used by the hotbar; extract one accent family (green=confirm,
red=danger) for buttons/selectors, not all eight recolors:

| Family | Asset names | Notes |
|---|---|---|
| Panels/frames | `ui_cf_panel_wood`, `ui_cf_panel_parchment`, `ui_cf_frame_thin` | 9-slice (`slice` metadata); the thin large frames at the sheet bottom suit full-screen dialogs |
| Buttons | `ui_cf_button`, `ui_cf_button_small`, `ui_cf_button_accent_{green,red}` | `state` frame groups: `idle`, `pressed`, `disabled`. Ignore the pre-labeled PLAY/OPTIONS pills — labels are always our atlas font over a blank button |
| Slot | `ui_cf_slot` | the square inventory cell from the premade sheet; 9-slice so slot size can vary |
| Selector brackets | `ui_cf_selector_{neutral,confirm,deny}` | 4-corner bracket frames (white/green/red rows); drawn corners-only at any size — selection, drag-target highlight, hotbar bracket |
| Sliders | `ui_cf_slider_track`, `ui_cf_slider_handle` | horizontal 9-slice track + handle sprite |
| Bars | `ui_cf_bar_frame`, `ui_cf_bar_fill_{red,green,blue,gold}` | segmented fills; fill drawn clipped to fraction |
| Ribbons | `ui_cf_ribbon`, `ui_cf_banner_flag` | window titles, headers |
| Speech popups | `ui_cf_bubble` + `tail_{up,down,left,right}` state frames | 9-slice body, tail composited at anchor edge |
| Crosshair/cursor | `ui_cf_cursor`, `ui_cf_cursor_click` (animation), `ui_cf_crosshair` | `Pointer_Click_Anim.png`; OS cursor hidden over canvas, cursor drawn in UI pass |
| Icons | extend the existing `icon_cf_*` set as needed | `UI_Icons.png`, `UI_Button_Icons.png` (arrows, check/cross, coin, heart, gear, bag) |
| Book/pages | deferred | `Book_UI.png` — later journal/skill content, same widget system |

Every extract carries `slice` and/or `state` frame groups in its sprite JSON so
sizing and states are data, not code. `validate-assets.ts` gains a lint: a `ui`
category asset must declare `slice` or fixed `size` intent, and state groups must
be complete (`idle` at minimum).

## 2. Widget system

A small **retained widget tree**, in `packages/client/src/ui/` (the module
docs/02 always reserved), rendered by the doc 21 UI pass. No DOM, no framework.

- **Core interface:** `Widget { layout(constraints): Size; draw(ctx, origin); onPointer?(e); onKey?(e) }`
  with container widgets owning children. All geometry is integer UI pixels;
  the UI pass applies the whole-pixel UI scale (Shift `-`/`+` ladder) globally.
- **Layout:** rows and columns with padding/gap/alignment, plus screen anchors
  (top-left, bottom-center, …) for roots. Minimum sizes derive from 9-slice
  insets and content. No constraint solver — flex-lite is enough for this game.
- **Widget set (v1):** `Panel`, `Window` (frame + ribbon title + close button;
  draggable by title; position remembered per window kind in local settings),
  `Button` (state frames + icon and/or label, keyboard/gamepad activatable),
  `Label` (atlas font, wrapping), `Icon`, `Bar`, `Slider` (drives audio volume
  first), `InventoryGrid` (cols×rows of `Slot`), `Slot` (item icon + quantity
  label + selector bracket states), `Tooltip` (hover, delayed), `SpeechBubble`
  (world-anchored: follows an entity's screen position from the world transform,
  drawn in the UI pass), `Cursor`.
- **Input routing:** pointer events hit-test the UI tree front-to-back *before*
  the world receives them (a click on a window never chops a tree); wheel over a
  `Slider`/scrollable adjusts it, otherwise falls through to world zoom; `Esc`
  closes the top window; open windows capture movement keys only when a text
  field has focus (none in v1). One shared focus/z-order manager; the existing
  `InputController` stays the single entry point.
- **Migration:** the hand-drawn hotbar becomes `Window`-less anchored
  `InventoryGrid` bound to the hotbar container; toasts become a `Label` queue
  widget; player name tags move to `SpeechBubble`'s positioning helper. The F3
  debug overlay stays raw text (not widgetized).

## 3. Drag and drop

A single `DragContext` state machine, pure and unit-tested, owned by the UI root:

`idle → grabbing(source slot, item snapshot) → hovering(target)` → drop or cancel.

- On grab: source slot dims; a **ghost icon** follows the cursor. Grabbing is
  purely cosmetic — the source row is untouched.
- On hover: any `Slot` whose binding accepts the item shows the confirm bracket;
  invalid targets show the deny bracket. Acceptance is evaluated client-side
  from the same shared rules module the server uses (see §4) so the highlight
  rarely lies, but it is advisory only.
- On drop: emit **one intent reducer** (§4) and return the ghost to the source
  until the row commit moves the item. On reducer error: brief shake + toast,
  nothing to roll back because nothing moved locally. On cancel (Esc/click-away):
  ghost flies back. This is doc 22 §6's cosmetics-predicted/state-authoritative
  split applied to inventory.
- Right-click (or modifier-drag) grabs half a stack — expressed as `quantity` on
  the same intent, not a different code path.

## 4. Generic containers (the data model that makes it composable)

**Schema (additive, replaces `inventory_slot` — one model for every grid):**

- `container` table: `id`, `kind` (`'player_backpack' | 'player_hotbar' | 'barrel' | 'crafting_grid' | …`),
  `ownerIdentity: option`, `capacity: u8`, and for world containers a
  `chunkX/chunkY` btree index (subscribed with the region like resources).
- `container_slot` table: `containerId` + `index` (unique pair), `itemKind`,
  `quantity`. Absent row = empty slot.
- Visibility: world-container slots are public rows (friends-scale game; contents
  visible when the chunk is subscribed). Player containers are exposed through a
  caller-filtered view exactly like today's `own_inventory_slots`.
- World props that hold items (a placed barrel) are entity rows carrying a
  `containerId`. Placement/creation of such props is M7 content; the model and a
  dev-spawned test barrel land now.

**Reducer surface (inputs-not-values, per doc 22):**

- `moveItem(fromContainer, fromIndex, toContainer, toIndex, quantity)` — the
  *only* mutation drag-drop ever emits. One transaction validates: both
  containers exist; sender owns-or-can-reach each (player containers: identity
  match; world containers: authoritative position within 2 tiles, same reach rule
  as harvest); indexes in capacity; item stacking/merge/swap/split rules from a
  shared `packages/sim` items module (max stack sizes, kind-restricted slots —
  e.g. an equipment slot accepts only its gear kind later). Move, swap, merge,
  and split are all outcomes of this one reducer, decided server-side.
- `craft(recipeId, gridContainerId)` — validates the grid contents against a
  recipe table in `packages/sim`, consumes inputs and inserts the result in the
  same transaction. Recipes/content are a later milestone; the reducer shape and
  result-slot UI land with a single dev recipe.
- Client-supplied values are ids, indexes, and a quantity — the server re-derives
  everything else. No item kind, no stack contents, no reach claim.

**Bindings:** `InventoryGrid` takes a `ContainerBinding` (container id or
`'self:backpack'`/`'self:hotbar'`) and renders whatever the subscribed rows say.
Because every grid is a binding, **a barrel window, the crafting window, the
backpack, and the paper-doll panel are compositions**:

- Barrel: `Window("Barrel", InventoryGrid(bind(barrel.containerId), 4×2))` —
  opened by `E` on the faced barrel, closed by walking out of reach (client
  closes; server enforces reach on every move anyway).
- Crafting: `Window("Crafting", Row(InventoryGrid(bind(grid), 3×3), Icon(arrow), Slot(result)), Button("Craft"))`.
- Player: `Window("Pack", Row(Column(paperDollSlots…), InventoryGrid(bind('self:backpack'), 5×4)))`
  mirroring the `UI_Premade.png` layout; equipment slots are a kind-restricted
  container, wired later.

## 5. Out of scope

Gamepad/touch UI navigation (input hooks exist; bindings later), text input
widgets, the book/journal, actual crafting recipe content, equipment gameplay
effects, container-placement gameplay, chat.

## 6. Tests and acceptance

- Unit: layout math (rows/columns/anchors/min-sizes), 9-slice edge cases (size
  smaller than insets), `DragContext` transitions (grab/hover/drop/cancel/error),
  shared stacking rules (merge/swap/split, capacity, kind restriction — same
  fixtures run against the reducer via the world test harness), slot binding
  renders from row fixtures, input routing (UI click does not reach world; wheel
  over slider vs world).
- Two-client: A drops an item into the dev barrel, B sees it appear; A and B race
  moving the same stack — one wins, one gets the error shake, no duplication;
  out-of-reach move rejected.
- Browser: open/drag/close windows at UI scales 1–3 and fractional world zoom
  (UI stays whole-pixel crisp); hotbar unchanged in behavior; cursor renders with
  click animation; tooltip on hover; speech bubble tracks a moving player.

## 7. Bookkeeping

Update docs/13 (point it at this spec for implemented surface) and docs/08
(container tables). DECISIONS.md entries: Cute Fantasy UI element adoption with
wood/parchment as primary family; retained widget tree in `client/src/ui`;
generic container/`moveItem` model replacing `inventory_slot`; drag-drop as
cosmetic-ghost + single-intent-reducer.
