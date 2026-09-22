# Atlas completeness and joining audit

## Objective

Account for every registered atlas asset and every available source tileset,
explain apparent duplicates, expose missing editor variants, and provide visual
examples and explicit joining rules made from the shipped artwork.

## Deliverables

- Reproducible asset/frame inventory with expected and processed counts, source
  provenance, seasonal/animation/state distinctions, exact pixel duplicate groups,
  and classifications separating intentional aliases from redundant choices.
- Source-library coverage ledger: every discovered source sheet is either mapped
  to registered assets, deliberately excluded with evidence, or an explicit gap.
  Do not claim absent/import-unmapped art is covered.
- A visual guide for every terrain family/biome: grass, paving and roads, beaches,
  water/rivers, waterfalls, hills/cliffs, interiors and other registered terrain.
  Include centres, edges, convex/concave corners, junctions, elevated formations,
  shadows, adjacency masks and source frame IDs. Missing rules stay visible.
- Correct Exact Placement palette enumeration for authored edge/corner variants;
  one semantic choice per joinable family in Smart Placement. Preserve intentional
  seasonal, state and animation variants, and all stable asset IDs.
- Tests for missing paving edges, accidental palette duplicates and complete
  deterministic audit enumeration. Review actual rendered examples in a browser.

## Constraints and implementation

Use existing source/atlas metadata and native pixel crops; diagrams must depict
actual asset frames rather than invented replacements. Reports and reusable audit
scripts are versioned. No destructive atlas deduplication or live map rewriting.
Automatic design assistance acts only on a placed tile/object and its immediate
neighbours. Invalid historical geometry remains loadable. Runtime does not police
or repair entire maps. Game placement and Studio share family/rule definitions.

Independent inventory, terrain-guide and palette investigations run in parallel;
each reviews this scope and reports omissions before expanding code changes.
Integrate through PRs, with Studio deployments under standing user authorization.
Any required game/world release retains its existing guarded approval procedure.

## Validation and failure handling

Inventory counts must reconcile with registry/frame/source counts. Missing files,
unsupported source formats, invalid crop bounds and unresolved joining roles must
be reported explicitly, never silently skipped. Compare exact pixels including
alpha; separately classify crops that merely share an empty or base frame. Keep
provenance and stable IDs so audit findings cannot break saved maps. Success means
all assets and source sheets are accounted for, paving variants are accessible,
and every identified terrain family has a source-linked visual/rule entry or an
explicit, evidence-backed missing-art/missing-rule entry.
