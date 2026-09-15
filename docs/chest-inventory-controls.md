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
