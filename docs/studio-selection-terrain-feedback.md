# Studio selection and terrain feedback

Status: implementation and local verification complete; PR #51 ready for review, 2026-09-22. Follows deployed PR #47; this candidate is not deployed.

## Contract

Stationary pointer hover and tooltip dwell survive retained-control rebuilds. Palette selection uses the inventory reticle around the whole item. Layer rows center their labels and use compact visibility art. Entity inspection shows the same sprite used by the map; tile inspection shows the actual resolved composition, with each contributing layer and its image.

Canopy trees can be selected and moved as local drafts. Generated resources must retain their functional identity and harvest state; movement must not replace them with decorative objects or immediately mutate live state. Publication uses the revision-checked map delta and the game must apply the same placement semantics. Unknown/deleted resource identities, invalid destinations and conflicts must fail explicitly without losing the draft.

Automatic raising/lowering must produce complete 2×2 top footprints at the selected height, with the shared compiler supplying projected walls/shadows. Manual exact overrides remain explicit. Small edits update visible terrain synchronously; persistence and whole-document validation must not block the first visual response. Undo, reload and publication retain exact semantics.

## Accepted design decisions

- Reconcile hover by pointer position after layout, preserving dwell only for the same stable target. Replaying a synthetic move alone restarts tooltip timers and cannot fix frequent rebuilds. Captured gestures remain attached to their original controls until completion.
- Resolve inspector sprites through existing art and terrain composition APIs, rather than guessing palette entries from biome names. Unknown art shows a clear missing-preview state.
- Preserve shared terrain compilation rules. Optimize sparse updates and defer persistence/validation work; do not introduce a Studio-only approximation of cliffs.
- Functional generated-tree relocation requires a persistent, shared map representation. The authority seam is the atomic map commit described below.

## Verification

Regression tests cover hover rebuild/dwell/leave, virtual palette tooltips, layer geometry, tree and tile previews, local resource move/undo/publish, valid raised footprints and sparse terrain parity with a complete compile. Profile a real-sized map to distinguish UI, persistence and compiler latency. Verify the actual canvas in an isolated browser without publishing test map edits.

Studio builds retain the reviewed UI kit guard and may deploy under standing authorization after checks. Any new authority behavior beyond PR #47 needs a concrete reviewed release candidate and deployment approval. PR merges remain separately authorized.

### Functional resource placement decision

Persist optional `resourcePlacements` entries keyed by decimal resource ID, containing immutable origin coordinates and current destination coordinates. Historical documents omit the collection; an empty collection is canonicalized to omission so old map hashes remain unchanged. Movement and undo are ordinary document commands; the existing delta protocol sends only changed entries. Studio overlays these positions on live markers without changing their resource identity, art or harvest state.

At map commit the authority validates new origins against existing resource rows, preserves origins on subsequent moves, rejects missing resources/blocked destinations, and updates only coordinates/chunk membership in the same transaction as the map head/history. Removing a placement restores its recorded origin. Generated-resource reconciliation reapplies published positions after generator refreshes. Authored fixed resource sites remain fixed until their site-specific placement contract can support relocation. This adds no database columns or reducers; the world module and Studio must deploy together for this new document collection.

### Shoreline feedback (2026-09-22)

Painting material never assigns the active height. Automatic material painting plans the neighboring bank cells, not only the clicked bitmap. Ocean water bordering grass adopts the existing grass-bank freshwater tile family; painting grass into an existing water bank retains that bank presentation while changing its semantic ground surface. Nearby bank cells are recalculated in the same edit, so their cardinal/inset frames join instead of leaving a flat blue rectangle or a displaced corner. Manual Auto-off painting retains the explicitly selected material. The shared map edit planner owns these extra biome overrides; existing game/Studio frame selection renders them identically, and delta publishing includes every resulting changed cell. Sand shore and interior/cliff families keep their existing dedicated rules.

### Scope correction from the owner

Invalid terrain geometry is supported authored content. Whole-map design validation and repair are never runtime or publication requirements. `validateDesign()` is an explicit advisory operation; ordinary edits do not queue a whole-map worker, and its results do not disable publication. Authority still validates bounded document values, permissions, references, revision/hash custody and functional placement conflicts. Annotation elevations may differ from the surrounding terrain without preventing reload.

Auto surround changes only a stroke and its immediate neighbors. Legacy contour-assist commands now inspect local 2×2 support rather than normalizing every contour on the island; unrelated isolated/manual geometry remains untouched. In-game fences, paths and cultivated ground retain placement-local neighbor composition. Whole-map design checks are reserved for an explicitly requested review/generation task.

## Candidate evidence

The isolated browser loaded a 3,525,763-character live map copy with 39,954 authored cells and 2,100 objects. A four-cell height edit measured 33.7 ms in the document model and 89.1 ms including the terrain patch, versus 1,245.9 / 1,350.6 ms before removing repeated normalization, hashing and pre-paint persistence. The sparse patch alone measured 18–20 ms on the generated 832×832 island. These are local browser samples, not a latency guarantee for every machine or map.

Browser captures verify a full-size palette reticle and stable tooltip, selected resource tree art, game-style tile composition, compact layer rows, and the grass-water bank continuation. No production test edits were published. Evidence: `/home/toby/.local/state/orchard-release/studio-selection-20260922`.

Reviewed Studio production output and an independent game production build pass. The original Studio UI-kit guard and immutable staged-source manifest pass. Candidate world full/private schema and public bindings match deployed PR47; this is a same-schema code release with no content changes. Workspace TypeScript, lint, lifecycle integrity, content validation and world build pass. The final coverage run passes all 943 files / 5,844 tests, with 88.79% statements, 84.13% branches, 94.40% functions and 92.87% lines, exceeding all configured thresholds. The separate exhaustive lane passes all seven files / 101 tests. Asset validation passes 1,320 art assets, three songs, ten sound effects, 55 palette colors and four seasonal remaps. Licensed raw-art fixtures remain local and untracked.

Verified source: `8ea241367ae3a3fa71d2197340a1beb345823e74`; production implementation: `191a5631`. The final Studio snapshot/output are `source-verified` / `output-verified` under the evidence directory; the game artifact is `game-output-production`. GitHub CI remains independently visible on the PR. Subsequent documentation-only commits do not change these checked production inputs.

The candidate is not deployed. PR47 is deployed and remains unmerged. The new resource-placement collection and non-blocking design policy require coordinated world/game/Studio deployment through the routine lane after explicit approval for this candidate; Studio alone cannot enable the authority behavior.
