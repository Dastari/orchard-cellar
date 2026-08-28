# 38 — Storage Frame Composition System

Implemented owner-directed UI contract (2026-08-26). This document extends
[23-ui-system.md](23-ui-system.md) with the concrete layout rules for windows
that display one or more item containers. The implementation is
`packages/client/src/ui/storage-frame.ts`.

## 1. Non-negotiable layout rules

Storage windows must be declared as compositions. Do not position a chest,
backpack, crafting grid, recipe list, equipment grid, or hotbar with bespoke
`rect.x + N` offsets in the owning screen.

1. The outer frame derives its minimum size from its declared panes.
2. A window containing a hotbar is never narrower than the hotbar plus the
   authored frame inset on both sides.
3. Fixed item grids retain their authored slot size, column count, row count,
   and slot gap. Slots never stretch when the frame grows.
4. When every pane is fixed, surplus horizontal space becomes equal gutters:
   left edge, every inter-pane gap, and right edge differ by at most one pixel.
5. A pane declared `flex` receives surplus width; fixed neighbors such as a 3×3
   crafting grid or 5×4 backpack retain their size.
6. Pane labels are left-aligned with the first slot in their grid. The hotbar
   label is left-aligned with hotbar slot one.
7. Pane rows begin on the same baseline. The divider and hotbar are anchored to
   the bottom of the composed frame, allowing diagnostic vertical resizing
   without moving the inventories.
8. Geometry is integer UI-pixel geometry. World zoom never affects it.
9. Every general-purpose storage pane (backpack, chest, barrel, and future
   equivalents) exposes the shared sort/stack action at the right edge of its
   header. Crafting grids, equipment/paper-doll slots, and hotbars never do.

## 2. Public composition model

`StorageFrameSpec` describes the frame instead of coordinates:

```ts
const chestFrame: StorageFrameSpec = {
  title: 'CHEST',
  style: 'wood_parchment',
  preferredWidth: 380,
  resizable: true,
  panes: [
    { id: 'chest', label: 'CHEST', columns: 4, rows: 4 },
    { id: 'backpack', label: 'INVENTORY', columns: 5, rows: 4, columnGap: 3 },
  ],
  hotbar: { label: 'HOT BAR', columns: HOTBAR_SLOT_COUNT },
};
```

`HOTBAR_SLOT_COUNT` comes from the shared sim inventory-layout contract; storage
screens must never restate the current capacity as a numeric literal.

`layoutStorageFrame(viewport, spec, requestedFrame?)` returns the complete outer
frame, minimum size, pane regions, labels, slot rectangles, divider, hotbar, and
corner resize handles. Screens bind their `ItemSlot` instances to those returned
rectangles; they do not reproduce the layout math.

### Pane sizing

| Sizing | Use | Behaviour |
|---|---|---|
| `fixed` (default) | Chest, barrel, backpack, equipment, 3×3 crafting grid | Region never becomes narrower than its grid. With only fixed panes, all gutters are equal. |
| `flex` | Recipe results/list, search/results, descriptive panel | Shares all surplus width with other flex panes. Its grid can use `start`, `center`, or `end` alignment. |

`minWidth` reserves space for custom pane content. `slotSize`, `columnGap`, and
`rowGap` exist for authored grids whose atlas geometry differs from the standard
28×31 slot with a two-pixel horizontal gap.

### Frame and pane styles

Outer frame styles are `wood_parchment`, `wood`, and `parchment`. Pane style
metadata supports `slots`, `wood`, and `parchment`; a renderer may add a nested
skin for the latter two without changing layout. New visual families belong in
this union and the central frame renderer, never as a screen-local branch.

## 3. Supported arrangements

The pane array supports any positive count. These are the intended patterns:

- One pane: barrel, vendor stock, mailbox. The grid centers above the hotbar.
- Two panes: chest + player inventory, trade offer + player inventory. Fixed
  panes receive equal left, middle, and right gutters.
- Three panes: crafting grid + flexible recipe/results pane + backpack. The
  crafting and backpack grids remain fixed while the middle pane grows.
- More than three: allowed for tooling, but prefer tabs or pages if the minimum
  width no longer fits the virtual viewport.

The hotbar is an optional subordinate section rather than a pane. This keeps its
minimum-width guarantee and bottom alignment consistent for every arrangement.

## 4. Diagnostic resizing

Resizable compositions expose four visible corner handles.
`StorageFrameResizeController` keeps the opposite corner anchored while the
dragged corner moves, clamps to the composition minimum, and prevents the frame
from leaving the viewport. Resizing changes presentation only; container
capacity, slot indexes, and server state do not change.

The chest is the first live adopter. Its last test size persists for the current
client session and is clamped again when the viewport changes. Closing the
window cancels an active resize gesture without discarding the chosen size.

## 5. Adding a storage window

1. Declare a stable `StorageFrameSpec` beside the window composition.
2. Mark actual fixed grids `fixed`; use `flex` only for content intended to grow.
3. Call `layoutStorageFrame` from the central UI layout pass.
4. Bind retained slot nodes to the returned pane/hotbar slot rectangles.
5. Render chrome through `drawStorageFrameChrome`.
6. If diagnostic resizing is enabled, route corner pointer events through one
   `StorageFrameResizeController` before routing slot interactions.
7. Add tests for pane count, equal gutters, minimum hotbar width, last-slot hit
   testing, resize minimums, and viewport clamping.

Do not change authoritative capacity merely to make a grid look better. Capacity
belongs in shared simulation constants and must have an explicit data-preserving
migration when reduced.

## 6. Sort and stack contract

The header control uses the authored small push button plus wrench icon. Its
right edge aligns with the last slot, so the label and control together occupy
the same width as the inventory grid.

Sorting is not a client-only rearrangement. `sortAndStackContainer` in the
shared sim orders items deterministically, merges only metadata-compatible
stacks, and splits quantities at the item maximum. One server reducer loads the
caller's currently reachable menu, permits only `backpack`, `chest`, or
`placeable`, and persists the complete result in one transaction. The action is
disabled and server-rejected while the cursor holds a stack. This prevents
duplication, loss, or stale writes during concurrent chest access.

## 7. Current acceptance evidence

- One-, two-, and three-pane compositions are covered by pure layout tests.
- All three frame skins are accepted by the central renderer contract.
- Equal fixed-pane gutters are asserted within one UI pixel.
- The hotbar minimum-width invariant is asserted under an undersized request.
- North-west and south-east corner resizing, opposite-corner anchoring, and
  minimum-size clamping are unit tested.
- The live chest integration tests backpack-to-last-chest-slot movement and
  resizing through `OverworldUi` input routing.
- Shared rule tests cover compaction, deterministic ordering, stack limits,
  metadata preservation, and input immutability. UI tests cover each sortable
  pane and header/right-edge alignment.
