# Studio selection and terrain feedback

Status: implementation in progress, 2026-09-22. Follows PR #47; does not alter its approved release candidate.

## Contract

Stationary pointer hover and tooltip dwell survive retained-control rebuilds. Palette selection uses the inventory reticle around the whole item. Layer rows center their labels and use compact visibility art. Entity inspection shows the same sprite used by the map; tile inspection shows the actual resolved composition, with each contributing layer and its image.

Canopy trees can be selected and moved as local drafts. Generated resources must retain their functional identity and harvest state; movement must not replace them with decorative objects or immediately mutate live state. Publication uses the revision-checked map delta and the game must apply the same placement semantics. Unknown/deleted resource identities, invalid destinations and conflicts must fail explicitly without losing the draft.

Automatic raising/lowering must produce complete 2×2 top footprints at the selected height, with the shared compiler supplying projected walls/shadows. Manual exact overrides remain explicit. Small edits update visible terrain synchronously; persistence and whole-document validation must not block the first visual response. Undo, reload and publication retain exact semantics.

## Accepted design decisions

- Reconcile hover by pointer position after layout, preserving dwell only for the same stable target. Replaying a synthetic move alone restarts tooltip timers and cannot fix frequent rebuilds. Captured gestures remain attached to their original controls until completion.
- Resolve inspector sprites through existing art and terrain composition APIs, rather than guessing palette entries from biome names. Unknown art shows a clear missing-preview state.
- Preserve shared terrain compilation rules. Optimize sparse updates and defer persistence/validation work; do not introduce a Studio-only approximation of cliffs.
- Functional generated-tree relocation requires a persistent, shared map representation. The exact authority seam will be recorded here before implementation; no immediate admin moves or decorative substitutes.

## Verification

Regression tests cover hover rebuild/dwell/leave, virtual palette tooltips, layer geometry, tree and tile previews, local resource move/undo/publish, valid raised footprints and sparse terrain parity with a complete compile. Profile a real-sized map to distinguish UI, persistence and compiler latency. Verify the actual canvas in an isolated browser without publishing test map edits.

Studio builds retain the reviewed UI kit guard and may deploy under standing authorization after checks. Any new authority behavior beyond PR #47 needs a concrete reviewed release candidate and deployment approval. PR merges remain separately authorized.

### Functional resource placement decision

Persist optional `resourcePlacements` entries keyed by decimal resource ID, containing immutable origin coordinates and current destination coordinates. Historical documents omit the collection; an empty collection is canonicalized to omission so old map hashes remain unchanged. Movement and undo are ordinary document commands; the existing delta protocol sends only changed entries. Studio overlays these positions on live markers without changing their resource identity, art or harvest state.

At map commit the authority validates new origins against existing resource rows, preserves origins on subsequent moves, rejects missing resources/blocked destinations, and updates only coordinates/chunk membership in the same transaction as the map head/history. Removing a placement restores its recorded origin. Generated-resource reconciliation reapplies published positions after generator refreshes. Authored fixed resource sites remain fixed until their site-specific placement contract can support relocation. This adds no database columns or reducers; the world module and Studio must deploy together for this new document collection.
