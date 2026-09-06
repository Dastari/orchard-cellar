# Doc 59 P8 WebGL engine lane

Worktree `/home/toby/projects/orchard-cellar-perf59-p8-webgl`, base 1b0ed15e.
Canvas seam is merged. Read doc59 P8, doc47 §15, existing backend interface,
receiver tint and lighting behavior. Own only new `packages/engine/src/webgl/`
modules/tests. Root owns renderer, client integration, ledger and roadmap.
No commits, dependencies, deployment or root-owned edits. New modules <=400 lines.

Implement the experimental WebGL2 backend: nearest page textures, interleaved
batched geometry with per-vertex RGB/variant data, smooth small lighting fields,
explicit resource disposal and context restoration from retained CPU inputs.
No readPixels/getImageData or full-world Canvas upload. Backend must expose the
merged WorldPassBackend API; propose a Canvas compatibility adapter for the
existing painter rather than pretending its current direct context uses semantic
methods. Root will integrate producer hooks as necessary; communicate interface
needs early. Unsupported operations must throw a typed backend failure, never
silently omit drawing. Canvas remains default and reference.

Preserve premultiplied alpha, source rectangles/flip/transform and painter order.
Per-sprite RGB must bypass tint-pool surfaces on GPU. Ground receiver lighting
must sample small rasters in the fragment shader; do not send groundSource scratch
surfaces to GPU. Resolve coverage/light maxima at grid corners before smoothing,
matching current receiver raster merge. Measure both present topologies in a
qualified local fixture; root still owes real-client capture. Context-loss test
must use actual WEBGL_lose_context, with restored textures and release evidence.

Run focused tests, typecheck/lint, real-browser parity fixtures and report raw
results/source hashes under output/perf-59-20260906/P8/webgl/. Write and lint
scripts before copying to shared output. Do not run full check or benchmark
while root full check runs. Do not claim gameplay p95 from fixtures. Three failed
approaches to an issue: report all three, leave green, move to independent work.
