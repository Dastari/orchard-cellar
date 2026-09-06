# Doc 59 P3 variant loader lane

Worktree `/home/toby/projects/orchard-cellar-perf59-p3-loader`, based on P2 and
P3 claim. Read doc59 P3 and doc58 D1/D3/D4/D10. Own UI asset loading in
`packages/ui/src/assets.ts`, new modules/tests, and the minimal removed-type
exports in `packages/ui/src/index.ts` (report the scope extension for root's
same-commit amendment). Root owns engine presentation deletion, main extraction,
quality wiring, docs, renderer and integration. Do not commit or delegate.

Builder contract: index v4 adds optional `omitAtlases: Record<string,string>`
using the same pageId:season keys as atlases, pointing to `<page>.omit.png`.
Only affected pages have variants. Shared page dimensions/frame rectangles.
The builder changes revision input. Coordinate contract changes with p2_builder.

Prepare bounded page cohorts only when Dynamic/unified is requested. Basic and
Classic never request omit pages. Original LoadedAsset.image and UI/Studio
images stay immutable. Omit page lifetime must not leak through the permanent
original-image promise cache: release all omit references and diagnosed bytes
on Basic/reset/disposal; generation guards ignore superseded loads.

Design an atomic prepare/commit cohort API for root's frame-boundary quality
wiring. Root needs synchronous variant source resolution per LoadedAsset and a
stable presentation revision after readiness, plus readiness/error/decoded-byte
metadata. No per-frame surface creation, masking, filtering budget, pinning or
streaming-fallback machinery. Preserve recolour/marker overrides on variant
sources exactly, with no GPU-to-CPU readback. Affected assets loaded while
Dynamic is active must finish variant preparation before their load promise
publishes them, so streamed artwork cannot appear with baked shadows for one
frame. During quality transition the prior complete cohort remains usable until
all pending required pages are ready; expose candidate failure separately for
root's existing quality fallback policy. Do not silently mutate published art.

Delete AssetFrameSourceCache implementation/tests only after coordinating root
engine type/import removal. Its useful pure frame/span types may move to a new
module without retaining filtered-frame behavior. Report API and migration plan
early. New modules≤400 lines. Focused tests cover Basic/Classic no requests,
atomic completion and cancellation, late asset loading, failure/retry, marker
pixel preservation, and zero retained omit references/bytes after reset.
Artifacts output/perf-59-20260906/P3/loader-*. No active timing capture now;
coordinate before heavy browser work. No physical iPad claims.
