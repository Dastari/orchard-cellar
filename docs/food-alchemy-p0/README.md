# Food/alchemy P0 native icon intake

## Combined artwork delivery

All 250 planned inventory icons and eight world props (48 state frames) are now
present in the isolated integration candidate. The original candidate/held-source
and art-needed records below remain historical provenance. `icon-imports.json`
now links every delivered file to its reviewed PR/head and SHA-256; held selections
have explicit bespoke replacement resolutions, and all 35 former art requests have
delivery links. The ten rejected vendor crops remain rejected: raw game comes from
#91 and the other nine replacements from #95. The importer still processes only
`native_import_reviewed` rows and cannot overwrite these bespoke replacements.

See [combined audit and validation](../food-alchemy-artwork-integration.md).
Gameplay activation and release are separate; no new gameplay definitions are added.

Owner approved the full content plan on 23 September 2026, then explicitly included
all six mana potions even without a drain. The source plan remains [PR #82](https://github.com/Dastari/orchard-cellar/pull/82),
doc 63; it is not yet on main. This independent branch starts at `5578b49c`.

This phase imports **205 reviewed native icons** as additive semantic text grids.
The exact original 215 selected candidates are recorded in `icon-imports.json`:
10 remaining mapping errors are held in documentation and excluded from the atlas.
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
All 215 original candidates were rendered through `render-review` beside
approved neighbours, then inspected on six labelled native-pixel contact sheets.
Each has a 1× source size and 8× review output under ignored `build/review/`.

Art checklist: exact 16×16 native pixels, retained hue ramps/alpha, unchanged source
silhouettes, source paths/crops/hashes, native lighting, no scaling/recolour/orphan
cleanup, neighbour comparison complete. The 10 original semantic failures remain documented with their original review status;
additive resolution fields link the separately reviewed bespoke replacements. Sixteen-pixel icon assets do not substitute for station sprites.

## Validation and publication

The combined artwork rehearsal in PR #96 passed `npm run check` at `b67e7ce6`:
6,598 coverage tests plus one intentional skip, 101 exhaustive tests, workspace types,
lint, world build, content validation and asset validation (1,578 art assets).
Full repository build, guarded Studio production build and client chunk checks also passed.
The original intake's incomplete test attempts are superseded by this completed rehearsal.

Source propagation preserves all reviewed sprite bytes and adds the already merged runtime
and timer baseline `d0843449`. Each source prefix receives asset build/validation, focused
asset tests, typecheck and lint checks; exact-head CI remains a separate merge gate.
The original 21 premium icons retain their cohort assertion, while source-pixel checks
still cover all 222 Kenmi imports. Licensed-source checks run locally and are explicitly
skipped by CI only when the private originals are unavailable.

Publication order: client asset bundle first, only after owner deployment instruction;
future gameplay definitions may reference these keys afterward. This PR needs no world
module or content publication. No deployment, merge or world publication was performed.
Assets version 0.19.1 / tools 0.21.2 reserve compatible increments beyond the coordinator's
frozen runtime candidates, by agreement in Agent Mail 405–407; integration must retain
both changelog entries and any higher versions/dependencies from other lanes.

## Continuation state

Implementation identity OrangeCastle; planning identity BeigeCoast. GoldCondor received
full-plan/A1 approvals and the bounded P0 lane. Core art is delivered in PR #91; collection art in PR #92. Station art is delivered in PR #94; nine semantic corrections in PR #95. Milk/egg source cells are corrected in this intake and the plan together. All artwork is delivered and visually reviewed; the combined artwork rehearsal passed. Fresh exact-head CI gates the refreshed source PRs.
GoldCondor confirmed main advanced to df509125 after balance/progression #76 and other merges. P1 shared effects/schema work explicitly waits for the combined runtime/timer baseline (Agent Mail 429/434/435). Reuse the existing traversalAbilities bridge and keep private object lifecycle authority untouched.
Do not silently activate incomplete effects or missing-art content. Continue following
`/home/toby/projects/briefs/food-alchemy-implementation-prompt.md` with separate phase PRs.

Milk and egg now use Farming #168/#169 after direct native visual review. Their original crop/vendor selection remains in the manifest for traceability. Held-source tests permit independently reviewed replacement artwork under the stable key, while rejecting the original incorrect source/crop.

Delivered art inventory: #90 imports 205 native icons; #91 supplies 18 core icons; #92 supplies 11 collection icons; #94 supplies seven station icons plus eight world sprites (48 state frames); #95 supplies nine semantic corrections. Total: 250 inventory icons and eight world sprites. Review links are indexed by the plan companion. No gameplay activation is implied.

The additive `deliveryInventory` records 258 file hashes and immutable original source
commits. Each historical `artNeeded` row links its delivery, and each held import links
its reviewed replacement. Original source paths, crops, hashes and review statuses remain
unchanged. No gameplay definitions or activation are part of this delivery.
