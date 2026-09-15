# Chest inventory controls

Status: Accepted. Restore the backpack-style search and sort controls in live
chest frames. The authored entity-frame renderer bypasses the old drawChest
path, leaving its sort buttons undrawn and its search input hidden.

Use the existing inventory search input and matching rules for both visible
chest and backpack panes. Reserve a search row above the hotbar, with independent
Sort & Stack buttons in each pane heading. Match item IDs or display names,
case-insensitively; clearing search restores slots. Filtering moves presentation
only: all inventory clicks, quick moves and dragging retain physical container
and slot identity. Sort still uses the existing authoritative container action
and is disabled while the cursor holds an item.

Derive controls from entityContainer=chest and authored pane bindings, including
renamed frames, resizing and mobile dimensions. Other processors keep their
existing controls. Reuse the DOM-backed text input for keyboard focus, Escape
and Enter behavior. Test matching, slot action identity, sort routing, visibility,
empty results, cursor restrictions and resize geometry before opening a PR.

## Verification

153 UI tests cover filtered slot custody, names/IDs, renamed authored frames,
search visibility/focus, independent sorting, held-cursor disabling, and geometry
at 384×270, 480×270 and 1470×820. A local browser fixture with the actual canvas
renderer and game artwork also verifies typing APPLE, selecting original chest
slot 11/backpack slot 8, and dispatching each container's sort callback.

Sorting affects the whole selected container even when search is active. Search
only changes presentation; the server continues to validate normal inventory
operations. The client/UI patch release is 0.7.1. The separate fruit-seed PR #8
uses 0.8.0; preserve the newer release when integrating both.
