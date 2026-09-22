# Atlas and Studio audit — 0.23.1 / Studio 0.13.1

Start with the [interactive terrain guide](terrain/index.html): actual source
pixels, assembled examples and neighbour masks, with a searchable source and
asset catalogue. The [duplicate gallery](inventory/duplicate-evidence.html)
shows complete pixel-sequence matches; [inventory findings](inventory/findings.md)
explain which need semantic review. [Live-map findings](live-map.md) cover the
reported village lamp overlap and other authored duplicates.

## Corrections delivered

- Palette artwork updates as it loads even while the placement-mode menu remains open.

- Hearth Pavement has 38 Exact Placement choices instead of four: the four stable
  centres, four named curb corners and 30 native source fragments. Every source
  cell is accounted for in the [paving ledger](palette/pavement-source-coverage.json).
- Desert grass and interior wall no longer import transparent cells as their
  base. Their complete painted source grids contain 13 and 54 distinct frames;
  the original base remains a state so saved visual references still resolve.
  [Repair ledger](palette/repaired-source-coverage.json).
- Exact Placement consolidates the proven `tile_path` / `tile_cf_path` alias
  (94 choices become 47). All persisted asset/prefab IDs and lookup entries remain.
  Similar-looking growth states, animations and semantically different objects
  are retained. Group names and frame numbers distinguish remaining variants.
- Studio renders the ground path outside Marlow's tent using the game's shared
  path generator and inset renderer. It follows **Generated Base** visibility,
  not Player-Owned. Verified live content is required; no map cells are rewritten.
- The legacy joined-fence drag repair from PR #60 is included, preserving its
  one-cell selection, occupancy and undo behavior in this Studio deployment.

## What the audit establishes

The full atlas reconciliation covers **1,320 assets, 27,161 frames, 108,644 seasonal
crops, 164 page/season images and 1,233 source files**, with no missing indexed or
referenced source file and no count/revision errors. The terrain guide covers
103 tile registrations, 126 source sheets, all 22 runtime biomes, 33 implemented
rule families × 256 masks, assembled examples for 14 cliff and seven flat
transition families, and 105 waterfall cases.

This is not a claim that every source tile already has an import or joining rule.
The full inventory records **552 unimported source files**, 213 partial/unverified
sources and 13 unsupported source formats. The terrain subset has 63 source-only
sheets with unverified joins, 37 imported sheets without demonstrated join rules,
and 26 sheets containing implemented banks. There are 3,553 nonempty terrain
source cells without declared crop metadata; some can be imported art with
incomplete provenance. The report distinguishes those cases from proven omissions.
The 234 visibly different source crops include recolours, masks and composites
and need per-source review; they are not automatically defects.

All generated diagrams use actual native/registered pixels and the current shared
resolvers. Invalid existing geometry remains legal. Automatic joining remains a
local placement aid; this change adds no map-wide runtime validator or repair.
No live map, player item or database row was removed or altered by this audit.

## Reproduce

Licensed source files and complete source-sheet contact images are owner-local and are not committed. The local guide includes them; regenerate on a licensed checkout to restore them alongside the versioned registered-art diagrams and metadata. From the repository:

```sh
npx tsx packages/tools/src/import-pavement-variants.ts
npx tsx packages/tools/src/import-empty-terrain.ts
npm run assets:build
npx tsx scripts/audit-atlas.ts --source-root /path/to/references --custom-root /path/to/art
npx tsx scripts/render-terrain-catalogue.ts
npx tsx scripts/render-terrain-catalogue.ts --check
```

The inventory contains compressed, complete per-frame evidence and a checksum;
its report is not a truncated sample. The terrain manifest checks all 303 generated
files. See the individual READMEs for source classification and mask predicates.
Public CI checks reviewed import fingerprints; licensed pixel comparisons run on
this development host.

## Integration validation and release

Asset build, source-pixel comparisons, atlas reconciliation, focused Studio
regressions, type checks, lint and the reviewed production build are required.
The complete repository suite and browser checks passed; see the
[release handoff](release-handoff.md) for counts and deployment evidence. Studio deploys independently; game/world code, schema and
live content are unchanged. A future game asset release must retain the existing
world release approval and guarded procedure.
