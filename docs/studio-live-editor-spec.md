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

## Acceptance

Verify anonymous redirect, authenticated live revision, all six tools, palette
search/filter/scroll/resize/reticle, tree visibility at overview and detail, single
line layers, material-aware raise/lower and fill, neighbor connection masks, undo
and serialization. Run relevant regressions, workspace typecheck/lint, build and
Studio static checks. Deploy only Studio with the guarded staged build and rollback
artifact; game/authority changes are delivered in the PR, not implicitly deployed.
