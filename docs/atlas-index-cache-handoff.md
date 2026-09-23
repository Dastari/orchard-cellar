# Returning-player atlas index cache fix

Client 0.22.2 / UI 0.23.1, 2026-09-24.

A returning browser can fetch new application chunks while the prior service worker
still controls the page. That worker caches `/generated/atlas.meta.json` by full
URL. If the old index is cached but one of its category requests is not, the
server returns the current category body and the loader correctly rejects the
revision mismatch. This happens before the in-game PWA update dialog initializes.
`fetch`'s `cache: no-store` alone does not bypass that worker's CacheStorage lookup.

Both mutable index requests (`atlas.meta.json`, and opt-in `atlas.packs.json`)
now include the existing client `VITE_PWA_BUILD_ID` in a `build` query parameter.
An old controlling worker therefore misses its prior index entry and retrieves
the new index; child metadata retains its existing revision query and validation.
The same build can reuse its own cached index offline. Immutable atlas and pack
URLs, worker activation, user update consent, content epoch, world state and
chunk rollout defaults are unchanged. Studio has no game build ID and retains
its existing URL behavior.

Regression coverage executes the actual unchanged generated worker fetch handler
with a cached old bare index and uncached current category. It verifies the old
failure (including no-store), coherent new-build loading, cache reuse after a
module reload with the network offline, and the opt-in pack index path.

Release limitation: an already-running failed page must reload to obtain the
fixed client bundle. This is a static client release; no world or content publish
is needed. Root owns merge/deployment and returning-browser smoke verification.

Validation: 25 tests passed across atlas cache, asset loader/pack, generated worker
and immutable-cache suites; UI/client typechecks and changed-file ESLint passed.
Independent client production build passed. Its emitted shared UI chunk contains
both index requests using exactly the build identifier in its generated service
worker. Hosted full-suite CI remains the merge gate; this focused local run is
not a claim of a fresh full-suite pass.
