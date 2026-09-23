# Asset packs — measurements and handoff

Scope: prerequisite delivery under doc 61 §2.5.2 / PR #63. Coordinator BrownHorizon
approved this boundary in Agent Mail #150 on 2026-09-23: semantic packs, lazy
by-asset loading, chunk prefetch hook, immutable caching, and pixel parity. The
spawn-visible collector and runtime switch are separate follow-up work. No merge,
deployment, world change, or first-play speedup is claimed here.

## Delivered contract

The default `atlas.meta.json` remains consolidated schema 4. It refers to hashed,
deduplicated category PNGs and existing category metadata. The additional schema-5
`atlas.packs.json` is 124,754 bytes for 1,320 assets/211 packs. It maps semantic
asset names to pack IDs and pack IDs to immutable metadata files. The 221 semantic
pages carry local frames, shadow/recolour data, and seasonal image references.
`?atlasPacks=1` selects that delivery mode at the first asset request; default game
and Studio startup do not select it. See [UI API](../packages/ui/README.md).

The game worker retains `orchard-immutable-atlas-v1` on activation. Its FIFO budget
is 64 MiB of stored decoded response bodies and 512 entries. Cache failures cannot
turn a successful network response into an asset failure. Only exact SHA-256 PNG
and pack JSON paths qualify; index/category files remain in the release cache.
The guarded routine release union now retains old hashed PNG/pack dependencies
and the retired seasonal PNG aliases needed by tabs crossing the first migration.
It rejects different bytes under one URL while leaving mutable indexes fresh.
Other release lanes must preserve the same retention contract; a persistent
browser cache is not a substitute for origin retention.

## Measurements

Baseline: original upstream `2e1d9a4f` atlas builder, same 1,320 source assets,
retained under `/tmp/sage-atlas-baseline`. After: this worktree. Chromium via
Playwright, localhost Vite, one diagnostic run per workload, no network throttling.
Browser Resource Timing reports only `/generated/` bodies after module import;
these are **decoded body bytes**, excluding JavaScript, auth/network state, UI SVGs,
headers, and the full first playable frame. Baseline requests were fulfilled from
the retained files; no latency claim is valid from these runs.

| Workload | Before requests / bytes | After requests / bytes |
| --- | --- | --- |
| Existing eager `loadOverworldArt`, default | 47 / 5,274,977 | 47 / 5,285,869 |
| Single `avatar_cf_farmer`, opt-in packs | 3 / 3,032,628 | 3 / 870,779 |
| Existing eager factory, forcing pack mode | 47 / 5,274,977 | 352 / 5,252,280 |

The default path adds 10,892 index bytes (longer hashed filenames) without adding
paced requests. The single-asset workload reduces body bytes by 71.3%. Forcing the
whole eager factory through packs increases requests badly, which is why pack
mode remains off by default. Diagnostic art readiness was ~2.28s baseline,
~2.19s default and ~14.13s forced packs; these are single local observations, not
benchmarks or authenticated first-play timing.

All-season category original/omit references stay at 264, but unique PNG files
fall from 264 / 8,914,656 bytes to 74 / 2,631,402 bytes. This is storage/reference
deduplication, not a claim that one player previously downloaded all seasons.

## Verification

- Golden decoded sprite comparison: **217,288 frame/season/omit hashes identical**.
  Reproduce with `npx tsx packages/tools/src/assets/verify-pack-pixels.ts <baseline-generated-dir> packages/assets/generated`.
- Both real generated authoring catalogs load all 1,320 assets: default 10
  metadata requests, opt-in 212. Neither catalog smoke test loads PNGs.
- Focused tests cover semantic isolation/stability, unchanged identity, seasonal
  hashing, lazy request isolation/retry, default delivery, explicit catalog load,
  cache budget/quota failure, and cache retention across worker activation.
- Workspace typecheck, lint, asset validation, full game/world/Studio build, and
  client chunk-boundary check pass. Current impacted suites pass: **1,888 tests /
  257 files**, plus **101 exhaustive tests / seven files**. Focused delivery tests
  pass **42 tests / nine files**. The full coverage attempt was stopped after its
  earlier snapshot became stale during the approved rollout adjustment; complete
  final-snapshot coverage remains a CI check, not a claimed local pass.
- The first full test run lacked this new worktree's ignored licensed reference
  directory. Linking the existing local references fixed the failure; the affected
  plain-icon and hearth-village suites then passed (147 tests).
- GoldCondor integrated the pack mapping with 169 materialized chunks and reported
  all referenced pack IDs resolving with terrain/collision/record parity. His
  materializer takes `--atlas-index .../atlas.packs.json`; the index hash binds its
  asset revision. This is separate-branch integration evidence, not code bundled
  into this PR.

## Follow-up and release boundary

Keep the flag default-off until the actual spawn and visible UI/entity dependency
set is known before presentation and movement. `OverworldArt` currently constructs
all character cosmetics, NPCs, terrain families, and item/crop maps. Some long-lived
owners capture assets during construction, and some sprite caches memoize empty
frames by asset identity. Merely swapping in mutable placeholder proxies can leave
stale visuals; a future demand implementation must address ownership, cache
invalidation, failure/retry and input readiness together, and verify complete
first-frame pixels. The prototype explored locally was withdrawn from this PR.

Retain the reviewed Studio prebuild guard. No Studio source/renderer replacement,
service restart, or production publication is part of this delivery.

## Delivery

PR [#72](https://github.com/Dastari/orchard-cellar/pull/72) is open on
`feat/asset-packs`. CI was running at handoff; local worktree is clean. Do not
merge or deploy without owner instruction. The approved prerequisite scope is
complete; first-play dependency ownership remains the explicit follow-up above.
