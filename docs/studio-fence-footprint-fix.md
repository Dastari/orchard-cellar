# Legacy joined fence movement — Studio 0.12.1

Older white fence prefabs retain a two-cell source crop and collision footprint.
The renderer substitutes a single joined segment, so the selection/drop validator
previously rejected moving that visible segment back between adjacent fences.

Studio now uses the rendered one-cell footprint for selection, drag bounds and
authored/live occupancy checks. When that instance is moved, its small map delta
embeds a one-cell prefab and updates only that object reference. Shared legacy
prefabs and neighbouring instances remain unchanged. The embed and move have one
history entry, so undo restores the original reference and geometry together.
The persisted cells work with the existing game/world collision reader; this is a
Studio-only release with no runtime schema, renderer or world-module changes.

Exact/manual pieces, gates, scaled objects and compound prefabs retain their
authored footprints. New overlaps on the same layer and height are still rejected.
Existing invalid layouts remain loadable; no whole-map repair runs.

Validation: the new regression first failed with a two-cell selection footprint.
After the fix, 492 map-editor/shell tests across 84 files pass, along with Studio
typecheck, repository lint, and the reviewed production build/source-manifest
guard. Tests cover dragging a legacy segment out/back, real overlap rejection,
map-edge placement, Exact/gate/scale/compound exclusions, atomic undo, and
publication-delta round trips through the existing collision reader. A local
browser fixture rendered the actual white fence, moved its middle segment down
and back, and confirmed its saved position and one-cell footprint.

The fixture cannot connect or publish. No production map edits are part of this
fix; refresh Studio to use the corrected editor with existing map drafts.
