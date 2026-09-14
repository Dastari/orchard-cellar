# Doc 59 P3 builder lane

Worktree `/home/toby/projects/orchard-cellar-perf59-p3-builder` based on the
completed P2 `170b05fb`. Read doc59 P3, doc58 D1/D3/D4/D10 and the declared
span rules. Own only `packages/tools/src/build-atlas.ts`,
`packages/tools/src/assets/baked-shadow.ts`, `packages/tools/src/validate-assets.ts`
and new modules/tests. If another existing file is required, report the concrete
need before editing it. No engine/client/UI/main/renderer/docs/roadmap edits.
No commits: root integrates only after full canonical check.

Emit each affected page's `.omit.png` variant alongside its unchanged original
page. Index v4 gains optional `omitAtlases: Record<string,string>` with the same
`pageId:season` keys as `atlases`; one shared frame table and page descriptor.
Unchanged/undeclared pages have no variant entry. Clear declared baked-shadow
spans only; assert outside spans every RGBA byte equals original. Preserve all
36 legacy PNG hashes and P2 originals exactly. Add the omit format to the
existing revision input so readers cannot cache old metadata under the same
revision. Coordinate any schema/descriptor change with the integrator.

Prove344 declared assets against the 0.5.5 declared-pixel comparison, all four
seasons, plus adjacent/undeclared pixels and page variants. Preserve builder
one-page-at-a-time behavior. No runtime masking or dependencies. Artifacts under
`output/perf-59-20260906/P3/`: commands, exact source hashes, byte/pixel counts,
original-integrity proof, focused tests/type/lint and build RSS/time.

No benchmark or heavy build while root runs active-rAF captures; coordinate
first. The root currently prepares a mechanical extraction/full check, so
focused work may proceed. Root alone edits ledger and roadmap. No delegation.
