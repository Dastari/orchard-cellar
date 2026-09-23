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

## Visual correction acceptance — 2026-09-22

The first gallery's generic logical-course assembly is not an acceptable design
preview: desert, shroomland and volcanic caps/faces detach, stone centres use the
wrong grass, and diagonal examples require incompatible inset pieces in one cell.

- Reconcile every available cliff family's source sheet, fill, cap, repeated wall,
  foot/shadow and inset roles against native examples. Distinguish a bad preview
  composition from bad shared mappings before editing either.
- Render joined examples with the matching native substrate and continuous cliff
  courses. Stone 1–4 use corresponding grass, desert uses desert, and shroomland,
  volcanic and interior families use their own ground. Preserve transparent art.
- Smart Placement repairs a diagonal conflict only within the placed patch and
  immediate neighbouring cells; its accepted result may not require two inset
  blocks on the same cell/layer. Exact Placement and previously authored invalid
  geometry remain legal. Never load, validate or regenerate an entire live map to
  enforce this rule.
- Show the input diagonal and the corrected local result explicitly; raw resolver
  masks that remain unsupported must be labelled, not sold as valid formations.
- An independent agent visually reviews all cliff and flat joining examples and
  records per-family results, remaining missing art/rules, and reference evidence.
- Validate meaningful native pixel continuity, family fill identity, local edit
  bounds and rotation/reflection diagonal cases. Regenerate deterministic gallery
  artifacts, verify the served guide, and deliver the corrections through a PR.
