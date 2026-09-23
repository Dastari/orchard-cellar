# Food/alchemy P0 native icon intake

Owner approved the full content plan on 23 September 2026, then explicitly included
all six mana potions even without a drain. The source plan remains [PR #82](https://github.com/Dastari/orchard-cellar/pull/82),
doc 63; it is not yet on main. This independent branch starts at `5578b49c`.

This phase imports **203 reviewed native icons** as additive semantic text grids.
The exact original 215 selected candidates are recorded in `icon-imports.json`:
12 discovered mapping errors are held in documentation and excluded from the atlas.
The original 35 missing item icons and all station/world artwork remain in
[art-requests.md](art-requests.md). These are explicit art gates, not placeholders.
No gameplay item, recipe, loot, effect, frame or object definition is added yet.

## Reproduce and verify

```sh
npm ci --ignore-scripts
npx tsx packages/tools/src/import-food-alchemy-icons.ts --reviewed
npm run assets:build
npm run assets:validate
npx vitest run packages/tools/src/assets/food-alchemy-icons.test.ts
```

Licensed sources must be installed at their manifest paths. Import preflight verifies
source hashes. Kenmi uses the existing `assets:import` implementation; the four Raven
cells use the existing native cell extraction helper, preserving their original ramps.
Every asset has a semantic name, source path/crop, exact source palette, UI placement
and state frame metadata. Old asset keys are untouched; no PNG source/crop or generated
atlas is committed. Running without `--reviewed` writes review drafts, which cannot
pass production asset validation until reviewed. Held mappings are skipped in either mode.

The pixel-parity test compares every visible RGBA pixel to the licensed crop locally.
On CI without the private source library only that source-comparison test is explicitly
skipped; grid, metadata, unique mapping and held-art exclusion tests still run.
All 203 icons and the 12 held candidates were rendered through `render-review` beside
approved neighbours, then inspected on six labelled native-pixel contact sheets.
Each has a 1× source size and 8× review output under ignored `build/review/`.

Art checklist: exact 16×16 native pixels, retained hue ramps/alpha, unchanged source
silhouettes, source paths/crops/hashes, native lighting, no scaling/recolour/orphan
cleanup, neighbour comparison complete. The 12 semantic failures are documented
rather than approved. Sixteen-pixel icon assets do not substitute for station sprites.

## Validation and publication

Passed: isolated dependency install; workspace typecheck; lint; content validation;
asset validation (1,523 art assets); atlas/UI assets build; 208 targeted tests including
all native-pixel comparisons. The first full `npm test` exposed an outlined-Raven source violation, then ended with SIGTERM (exit 143); it is not a full-suite pass. Switched the four Raven imports to their available plain variant, with unchanged cell coordinates and exact native pixels; both the regression and intake suites now pass (208 tests). A full rerun follows in the PR.

Publication order: client asset bundle first, only after owner deployment instruction;
future gameplay definitions may reference these keys afterward. This PR needs no world
module or content publication. No deployment, merge or world publication was performed.
Assets version 0.19.1 / tools 0.21.2 reserve compatible increments beyond the coordinator's
frozen runtime candidates, by agreement in Agent Mail 405–407; integration must retain
both changelog entries and any higher versions/dependencies from other lanes.

## Continuation state

Implementation identity OrangeCastle; planning identity BeigeCoast. GoldCondor received
full-plan/A1 approvals and the bounded P0 lane. Missing-art handoff was requested via
messages 400/408. P0 remains incomplete until art gates are delivered and reviewed.
P1 must reconcile named balance/progression (#76), medium traversal (#80), object-state
runtime (#81), and timer-stack work (#84–86) before touching shared definitions/runtime.
Do not silently activate incomplete effects or missing-art content. Continue following
`/home/toby/projects/briefs/food-alchemy-implementation-prompt.md` with separate phase PRs.
