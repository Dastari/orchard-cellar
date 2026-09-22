# Studio smart placement and stable inspectors

Status: implemented; release verification recorded in [the handoff](studio-smart-placement-handoff.md), 2026-09-22.

## Contract

Tooltips use the UI kit's small parchment frame, fit their text with compact padding, and stay visible while the pointer remains over a stable target. Drawer refreshes preserve scroll, focus, and open controls. Scrollbars use authored track/grip artwork. Tool buttons keep one row with more icon clearance. Layer visibility uses a fully visible eye glyph.

Smart placement presents one entry per connected fence/hedge family and terrain material. Exact placement exposes individual visual pieces. Exact terrain pieces are authored Ground Details overlays; they do not rewrite the underlying terrain semantics or enforce topology. A smart fence occupies one world cell and joins same-family neighbours using the shared game resolver. Strokes interpolate cells; duplicate placement and movement into occupied cells on the same layer/elevation are rejected without changing existing content. Different layers remain independently authorable; existing overlaps are not repaired globally.

Object selection tints the actual sprite silhouette. A stationary right click opens a context menu with Delete when supported; right drag continues to pan. Authored-object deletion, placement, movement and property editing remain undoable local drafts until publication. Live resource state edits and suppression also remain drafts. Functional placeable/chest state and despawn controls retain the existing audited Preview/Confirm live action flow and its permission checks. Selection panels show labelled properties and appropriate controls, including position, orientation and supported object state. Remove the redundant Selection/Schema dropdown and raw debug prose. Read-only fields explain their meaning and do not masquerade as editable controls.

Object visual state is shared data, not an editor-only sprite override. Reuse existing typed object state schemas and art metadata to describe supported states and resolve the corresponding visual. Growth-capable objects expose growth choices; other objects expose only declared properties. The game and editor use the same resolver. Functional resource edits must preserve resource identity, retain authority checks, and flow through the existing atomic delta publication boundary. Unknown values reject explicitly and preserve the draft.

## Architecture and boundaries

Fix unnecessary retained-tree replacement at the shell source and preserve per-selection scroll when a genuine state update requires rebuilding. Tooltip continuity must not rely on repeatedly scheduling a zero-delay popup. Keep UI art painting in shared kit helpers.

Extend shared object/family contracts and use them in palette grouping, placement, inspectors and both renderers. Derive one-cell fence geometry from the reviewed connected atlas, not the footprint of an arbitrary source crop. Selection tint must alpha-mask the sprite, including transformed multipart objects, without painting its transparent rectangle.

Invalid terrain geometry remains supported. Assistance inspects only a placement and immediate neighbours. No whole-map topology validation or repair is introduced. Do not change unrelated open PRs, live map content, player inventories or gameplay rewards. World code changes require a separately approved coordinated release; deploy compatible Studio-only fixes under the project's standing authorization.

## Verification and failure handling

- Reproduce repeated hover, menu, scroll and live refresh with actual retained controls; assert no visible flash or scroll reset.
- Verify smart white fence isolation, elbows and continuous strokes, one-cell footprint, same-layer overlap rejection, separate layers and undo.
- Check state parsing/serialization/delta round trips, invalid values, authored and functional resource visuals, state edits, undo and authority publication.
- Verify selected sprite transparency, full object tint and right-click versus drag behavior in the browser.
- Run required typechecks, lint, coverage, exhaustive terrain/UI tests, assets and guarded production builds. Keep source/art evidence and list any remaining limitations in the PR.

Missing art is reported visibly; a rejected edit leaves the current selection and document intact. Lost publication authority or revision conflicts retain the draft and use the existing retry/rebase UI. No testing writes to production map content.
