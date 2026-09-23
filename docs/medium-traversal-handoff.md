# D6 traversal runtime handoff

Coordinator: GoldCondor. Author: SageIsland. PR: https://github.com/Dastari/orchard-cellar/pull/80
Branch `feat/medium-traversal-runtime` in `/home/toby/projects/orchard-traversal-runtime`,
stacked on immutable #71 `37dc1917` (wave-1 dependencies included). No source wave-1
head was edited. No deployment or merge performed by this lane.

## Implemented

- Shared media admission, explicit mount replacement and timed effect grants;
  independent solid/height/transition/obstacle geometry with bounded variant caches.
- Strict `world_rules` traversal profile, publication scope, generated authoring
  schemas/export; actor/mount/creature/enemy capability backfill without art inference.
- Shared generated/compiled/chunk semantic projection; client/server movement,
  definition-based AI, projectiles, gameplay placement and dismount consumers.
- Owner-confirmed configurable lava 10% / shroom 2% maximum HP each second. Boat and
  water-walk enter shroom; only exact toxin immunity suppresses damage.
- Private additive fractional hazard state; no offline catch-up or duplicate tick
  charges; existing knockout/rogue restoration, wildlife respawn and encounter
  completion without fabricated player credit. Generated private binding is additive.
- Bootstrap policy stays shadow. Missing policy/channels/actor grants retain
  explicit compatibility; no live switch or implicit migration.

## Evidence

- Final full coverage: **994 files, 6,227 tests passed, one skipped**. Coverage:
  statements 89.1%, branches 84.47%, functions 94.57%, lines 93.11%. Includes actual
  authority persistence/recovery and summoned-add death cleanup regressions.
- Full-island generated and compiled medium/solid channels match the #71 chunk
  oracle. All 15 waterfall cells x414–416/y357–361 resolve shallow_water/non-solid,
  and client/server boat candidates agree. Existing compatibility adapter now
  round-trips additive traversal metadata and invalidates caches on chunk install.
- Final `npm run build`, checked world build, workspace typecheck and lint passed.
- Final `npm run check` passed (exit 0; `/tmp/d6-check-final.log`): integrity, content,
  world build, types, lint, coverage, 101 exhaustive tests across seven files, and
  validation of 1,320 art assets, three songs, 10 SFX and 55 palette colors. Earlier
  failed runs are superseded by this corrected clean run.
- Focused closeout: 35 hazard/outdoor-AI tests; 6 chunk/parity tests; 11 Studio authoring
  tests passed. Existing fixture failures were corrected against measured content.
- Content export/validation and measurement: 920 definitions/26 kinds/585,179B/hash
  a69b62bf, guard 572KiB. Raw identity validation recognizes world_rules. Studio's
  generic table picker exposes the authored policy; arbitrary prefab placement
  remains unchanged under coordinator decision 292.

## Remaining gates

- Coordinator reviews latest-head CI and integration before PR readiness/merge.
- Coordinate engine/content compatibility release before publishing world_rules:
  current exact-match engine1 remains compatible with existing packs, but old
  clients cannot parse the new kind (Agent Mail297).
- Coordinator decision 292: preserve Studio prefab/dock authoring without an actor
  traversal gate; gameplay placement uses explicit profiles. Decision 297: no
  unilateral epoch bump; coordinator stages compatible client/world/content
  transition preserving live v1 readability before publication.
- Complete base-role medium resolver is not yet exposed by CopperMaple's terrain
  runtime. Optional resolved semantic metadata callback exists, with shared biome/
  compiled-surface fallback. Do not claim complete shroom-role coverage.
- Live activation requires reviewed parity plus visual/network smoke and explicit
  policy activation. Shared preview remains unchanged by this source PR.
- Rebase/retarget after wave-1 lands; regenerate combined schemas/bindings rather
  than choosing one branch's generated file. Keep separate wave-2 PR76 unrelated.

## Coordination

ChartreuseDuck approved disjoint private `traversal_hazard_state`; object state
owns resolved solidity and never grants abilities. GoldCondor owns merging and
release decisions. CopperMaple owns rule role/layer resolution. Read doc64 for
policy bounds and death/recovery semantics. Explicit push refspec required:
`git push origin HEAD:feat/medium-traversal-runtime`.
