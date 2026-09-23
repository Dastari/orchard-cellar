# Terrain atlas evidence

Open [the navigable guide](index.html), [machine-readable rules and source-cell ledger](catalogue.json), or [the full asset inventory](../inventory/README.md).

Reproduce from repository root:

```sh
npx tsx scripts/render-terrain-catalogue.ts
npx tsx scripts/render-terrain-catalogue.ts --check
```

Requires the licensed `references/art` source library and installed workspace dependencies. Complete source-sheet captures in `sources/` are local-only and excluded from Git, matching the existing licensed-reference policy. Registered-art examples and source-cell metadata are versioned. Missing source files, frames or invalid colors fail generation. `--check` regenerates in memory and compares every expected artifact byte-for-byte; it writes nothing. No live source/generated atlas files change. The audit PR owns release notes and integration checks.

- registeredTileAssets: 103
- registeredTileFrames: 3581
- sourceSheets: 126
- sourceOnlySheets: 63
- sourceSheetsWithImplementedBanks: 26
- sourceCells: 7349
- nonemptySourceCells: 5906
- unmappedNonemptySourceCells: 3553
- partialImportCells: 10
- runtimeBiomes: 22
- availableCliffFamilies: 14
- reservedCliffFamilies: 1
- surfaceFamilies: 4
- maskRuleFamilies: 33
- maskCases: 8448
- waterfallCases: 105

The source ledger selects all Cute Fantasy index entries under `/Tiles/`, classified as `tile-set`, or referenced by a registered tile. Every selected sheet and cell is retained, including empty cells; source crop ownership is conservatively classified as declared/partial/unmapped, never inferred from filename alone. The full inventory accounts for the rest of the source library and formats.

All 256 neighbour masks are enumerated per rule family using the actual exported resolver. JSON records the bit predicate, frame/layer IDs, full cliff bank definitions, and missing roles. T/cross/diagonal cases may map to repeated native frames through the current precedence rules. Coverage is an audit of implementation, not a claim that every topology is visually supported.

Outdoor examples show minimum 2×2, rectangle, concave, corrected diagonal, T and cross formations with matching native substrate. Tile plans expose the edited input and amber Smart additions. Multi-inset raw masks are not advertised as valid geometry. Unverified interior assemblies are withheld with precise missing-role explanations; native source banks remain visible. Local authoring assistance may update a placed cell and neighbours; historical invalid maps remain allowed.

## Explicit gaps

- Initial audit found tile_cf_interior_wall imported a transparent gutter at (48,0), and tile_cf_desert_grass was all transparent. The audit corrected these stable IDs with native crops; the contact sheets below show the corrected imports. This historical finding must not be mistaken for an intentional empty joining state.
- Snow cliff family is explicitly reserved: checked Christmas source has no cliff sheet. Ground overlays are not substitute cliff faces.
- Shroomlands primary inverse corners use source frames 3, 4, 12 and 13. Its separate salmon ground quartet is path art, not inverse cliff art; the compact ledge bank also has separate roles.
- Basic cliff has no authored vertical wall course. No synthetic face or shadow is fabricated.
- No cliff family supports a dedicated stair painter contract; ladder artwork is not traversable ladder authority. Registered ramps support north/up only, minimum two lanes.
- Pavement source includes kerbs/rings/stairs as well as fill. Coordinate variants do not prove complete automatic joining roles. Paving-grass mask is a grass fringe only.
- Nine-grid shores and freshwater banks collapse many T/cross/narrow masks through precedence. Existing behavior is shown exactly; it does not prove an authored tile for each topology.
- Source cells without declared regions remain unresolved even if their sheet has imports. Some transformed/imported frames intentionally lack a direct source rectangle; consult full inventory pixel comparisons.
- Source table includes indexed terrain sheets and every registered tile source within the Cute Fantasy index. Other source formats/library packs are accounted for by the complete inventory, not silently claimed by this terrain guide.
- Family waterfallAssetId is source availability, not proof of all animation/course mappings. Only the core waterfall runtime lane resolver is exercised here; biome sheets retain unknown roles where absent.
- Smart formations are local native cap/wall/foot assemblies, with family-specific substrate and repaired diagonal necks. Raw multi-inset masks are explicitly unsupported placement designs; old maps and Exact Placement remain legal.
- Volcanic interior legacy primary frames are staircase art; a complete inverse wall bank is unverified. Its assembled preview is withheld. Cave/dungeon interiors also lack a verified opaque rock-mass fill; no generic green/brown block substitutes for that missing contract.
- Shroomland ground patches and path transitions are visible in the source sheets, but are not yet registered as complete semantic material families. Cliff source correctness does not establish those missing joining rules.
