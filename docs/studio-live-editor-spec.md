# Live Cellar Studio editor

## Objective

Open Studio directly into authenticated live-map editing, with compact tools and
the same semantic generation rules used by the game.

## Requirements

- Authenticate before mounting an editable workspace. Automatically connect to
  production; failures expose retry and never fall back to an offline map.
- Remove the global workspace/connection toolbar. Retain navigation in the rail.
- Provide object selection, terrain painting, raise, lower, fill and contextual
  sampling as icon tools. Searchable object categories span all authored layers.
- Use a responsive, virtualized palette of medium icon buttons, at least three
  columns, with tooltips and a selection reticle. Load previews only for visible rows.
- Show only the selected material/object name and automatic surrounding generation
  toggle in the palette footer. Keep publishing explicit and separate from this toggle.
- Replace H/C canvas buttons with height down/current/up controls. Raising from
  level N authors level N+1; lowering authors N-1 without cumulative stroke overlap.
- Apply semantic material, cliff, inset, water and interior rules through shared
  simulation/compiler and renderer code. Automatic footprint expansion is an
  editor preference; gameplay does not expose a bypass.
- Connect compatible fences/hedges by cardinal neighbors at the same elevation;
  resolve ends, straights and corners consistently in editor and game.
- Put trees under Canopy, including live resource trees, and retain their overview
  representation. Each layer row contains only visibility and layer selection.

## Architecture and error handling

Keep production map hydration, content registry verification, role checks,
optimistic revision conflicts and explicit publish receipts. Session UI preferences
must not replace live document content. Do not publish test strokes to production.
Use existing terrain definitions as the source of supported art, with an audited
rule inventory; missing art must not be represented as a supported family.
Use semantic neighbor resolution rather than storing derived corner textures in
player state. Author overrides remain in the map document.

Authentication rejection, connection loss and unavailable content keep editing
gated and offer retry. Palette searches with no results show an empty state.
An unsupported automatic object connection preserves the authored sprite rather
than substituting an unrelated asset. Concurrent map edits retain conflict handling.

## Review feedback: direct manipulation and pixel UI

- Use larger object and material palette cells, the game's inventory reticles,
  and no row-level selection outline. Six generated pixel-art tool icons fit on
  one row; category icons reuse game artwork inside a subframe.
- Right-drag pans. Palette objects drag into the world. Moving authored objects
  displays their actual sprite at the draft position before committing locally.
- Preserve the current map while terrain edits compile, update nearby terrain
  promptly, and avoid clearing/reloading the whole visible map per height edit.
- All authoring is a local browser draft. Keep explicit Publish beneath Auto in
  the left footer. Footer chrome fits; only text may truncate.
- Show selection preview/properties in a separate upper inspector panel and
  compact layer rows in the lower panel. Keep layer visibility and selection.
- Investigate missing trees across runtime resources and generated scenery,
  including correct Canopy visibility at all zoom levels.

## Original acceptance

Verify anonymous redirect, authenticated live revision, all six tools, palette
search/filter/scroll/resize/reticle, tree visibility at overview and detail, single
line layers, material-aware raise/lower and fill, neighbor connection masks, undo
and serialization. Run relevant regressions, workspace typecheck/lint, build and
Studio static checks. Deploy only Studio with the guarded staged build and rollback
artifact; game/authority changes are delivered in the PR, not implicitly deployed.

## Feedback implementation and verification

Studio 0.9.1 keeps the authoritative connection for reading and publication, while
all ordinary painting, placement, movement and undo remain browser drafts. Auto
controls surrounding generation only; publication is an explicit footer action.

Small terrain edits reuse compiled visual channels with shared semantic cell
resolution. The renderer invalidates topology neighbors and both old/new cliff
projection footprints, preserving distant chunks and overview backing surfaces.
Large fills, global defaults, resizing and transition changes still compile in a
worker while displaying the previous complete map. Picking adopts only terrain
matching the current document.

The isolated development fixture is
`packages/studio/src/tools/map/feedback.fixture.html`. It mounts the actual shell
and terrain lab without a connection factory; it cannot publish. It is not a
production entry. Use it with the Studio Vite server to exercise palette drag,
right-drag pan, local painting, selection properties, reticles and drawer resizing.
Production remains immediately authenticated at `/build/map`.

Generated toolbar artwork and reproducible prompts are recorded in
[the icon source ledger](studio-pixel-tool-icons.md).
