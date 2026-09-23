# Semantic atlas packs

Implements the atlas part of doc 61 §2.5.2 (PR #63), following the frontend asset
delivery audit. Semantic asset names and numeric IDs remain unchanged.

## Contract

Build independent deterministic packs: terrain core and biome/interior families,
prop/tree families, player core/cosmetics and NPC/mob families. Each pack owns
bounded pages, local animation/shadow/recolour metadata, and seasonal references.
SHA-256 of actual bytes names PNG and JSON files. Identical seasonal and shadow-
omit pages share one URL. No global revision is included in immutable bytes.
The mutable release index maps asset names to pack IDs and pack IDs to immutable
metadata. It retains the legacy authoring catalog during migration.

`atlasPackIdsForAssets(names)` resolves semantic names to pack IDs.
`loadAtlasPacks(ids, season)` loads their metadata and selected seasonal pages.
`loadGeneratedAsset` resolves just the requested pack. Studio's complete catalog
explicitly loads all pack metadata, never all pack images.

Fetch failures evict rejected promises for retry. Malformed or mismatched pack
metadata fails closed. Missing assets retain the existing visible placeholder.
Persistent immutable caching must retain unchanged files across worker releases,
remain bounded, and fail gracefully on browser quota failures.

## Verification

Verify stable pack boundaries and filenames after an unrelated asset addition;
byte-identical decoded sprite frames, seasonal/recolour/shadow variants; lazy pack
request isolation and retry; cache retention and budget; Studio catalog loading.
Measure requests and bytes for a fixed startup workload before/after, separating
artifact measurements from authenticated browser first-play timing.

## Architecture decision — accepted 2026-09-23

Use semantic packs plus content-addressed files rather than category-wide pages
or one image per sprite. Category pages load unrelated assets; single-sprite
images multiply requests. Semantic packs bound invalidation within a family and
let chunk manifests prefetch stable IDs. Trade-off: more small metadata requests
and some page padding. Existing page budgets, frame geometry, and asset identity
remain enforced. Build retention leaves old immutable files available for old
clients; release tooling must preserve them when switching the mutable index.

## Approved rollout boundary

BrownHorizon coordination ruling #150 (2026-09-23) explicitly limits this PR to
prerequisite delivery. The spawn-only dependency collector belongs to the chunk
runtime switch. The current eager factory must not gain hundreds of paced
requests: the build therefore keeps the consolidated `atlas.meta.json`/category
metadata and additionally emits `atlas.packs.json`. Pack mode is default-off,
opted into with `?atlasPacks=1`; the chunk prefetch APIs always use the pack index.
Both paths use immutable, deduplicated PNG names. No first-play speedup is claimed.
