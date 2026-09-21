# Willowharbour visual pass

## Scope and reference contract

Refine the western island in place, preserving its ferry, public services, plot doors,
sanctuary policy, main island and Cinderwake. Use the five supplied town-reference
images: layered woodland, continuous cliffs, articulated grass/path boundaries,
composed inn patio/market/farm yards, and connected functional interior rooms.
All ten buildings receive accessible, furnished interiors whose proportions reflect
the exterior. Existing commercial identities and services remain stable.

## Design decision

Extend the existing deterministic offline map authoring and content-defined interior
catalogue; do not introduce a second generator or renderer. Terrain biomes and
compiled contour transitions remain authoritative for native autotiles/collision.
Cluster trees using seeded spatial sampling and terrain-aware clearance; reserve
plots, roads, projected cliffs and ferry approaches. Use existing licensed native
assets at native scale. Interior room unions retain the shared south entrance and
use distinct room arrangements and furniture palettes. This accepts authored layout
maintenance in exchange for reproducible art direction and compatible runtime data.

## Validation and failure handling

Compare native game-renderer screenshots at island, town, detail and interior scales
against all references, with an independent Astra review. Test deterministic output,
connected land/access, full-body door/NPC routes, scenery terrain support, native
furniture footprints, support surfaces and interior room access. Missing art or
invalid geometry fails export. Saved-map conflicts must fail closed; provide an
explicit reviewed upgrade path rather than overwrite independently authored edits.
Run workspace checks, content validation and relevant builds. Preserve Studio guard.
Deliver a new unmerged PR with evidence and release limitations; do not claim live
world migration from offline captures.

## Exporting an existing town

Use a fresh saved map and the **reviewed prior map export** as separate inputs:

```sh
npx tsx packages/tools/src/export-hearth-map.ts saved-map-v3.json new-candidate-dir reviewed-prior-map-v3.json
```

The optional third argument explicitly enables the Willowharbour upgrade. If any
village cell, object, prefab or contour has changed since that prior export, the
upgrade stops with a conflict. Other-region edits remain intact; prefabs shared
with Cinderwake remain installed. The subsequent normal composer rejects foreign
scenery, anchors, overhanging objects or unexpected terrain policy. Without the
third argument, the export retains its existing add-only conflict behavior.

The manifest records both input hashes, compiler/asset hashes and the candidate
revision. This session exercised the upgrade against an actual map produced by
upstream main's previous authoring code, then verified lossless parsing and exact
recomposition. This is an offline migration rehearsal, not a production database
capture. Release must publish the map and authored content along with the new
client; test all ten ENTER/LEAVE round trips against authority after publication.
