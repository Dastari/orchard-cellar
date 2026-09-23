# D6 traversal runtime handoff

Coordinator: GoldCondor. Author: SageIsland. Branch `feat/medium-traversal-runtime`
in `/home/toby/projects/orchard-traversal-runtime`, based on immutable wave-1
head `37dc1917` (#71, includes #73 prerequisites). Frozen source branches were
not edited. This is a draft groundwork milestone, **not completed D6 runtime**.
No merge or deployment is authorized by this handoff.

## Implemented

- Shared pure media admission, explicit mount replacement grants, timed effect
  grants, independent per-medium hazard cadence and immunity.
- Complete strict `world_rules` / `profile: traversal` policy parser, optional
  actor/NPC/enemy/effect/mount authoring fields, unique policy ownership validation,
  generated Studio schemas, `world_rules` publication scope and per-kind export.
- Legacy definitions keep absent optional fields. Empty ability lists remain
  explicit denial rather than falling back. Bigint effect expiry stays exact.
- Cached collision projection preserves height/transition/obstacle metadata;
  shadow returns legacy geometry plus concrete differences. No live consumer
  currently invokes this new projection.
- Offline chunks and future runtime use one biome/surface/explicit-rule medium
  classifier; no sprite-name inference. Existing chunk tests retain behavior.

## Required owner policy decisions

1. Author lava/shroom hazard damage and interval values. No existing authored
   values were found, and no numeric defaults were invented.
2. Decide hazardous-water admission independently of immunity: does boat or
   water-walk allow entering shroom water while taking damage, or is toxin
   immunity also required for admission? The policy supports either explicitly.
3. Approve the initial policy and activation/parity boundary. Bootstrap
   `world-rules.json` is deliberately empty, so current game behavior is unchanged.

## Remaining implementation after decisions

- Author the initial full policy and explicit actor/mount/effect grant backfill.
- Wire one shared semantic medium/solid projection to client and authority.
  CopperMaple confirmed in Agent Mail269 that no complete per-cell role accessor
  exists yet; use resolved base role metadata callback, falling back to biome and
  compiled surface. Never let visual fringe roles override the base medium.
- Preserve collision height/edge/obstacle semantics and handle docks explicitly;
  do not manufacture a universal solid layer from old walking restrictions.
- Wire prediction, server movement, AI/pathfinding, projectiles and placement to
  the policy together. Current mode `active` is only a library projection option;
  no live runtime branch is activated by this PR.
- Apply hazards once per authority tick to supported actor health targets.
- Measure shadow parity and resolve the known 15-cell boat discrepancy
  x414–416/y357–361 via shared semantic classification, not coordinate patches.
- Complete required checks on the final integrated runtime and obtain reviewed
  activation before retiring legacy ground/boat decisions.

## Coordination

ChartreuseDuck owns object state, resolved object solidity and appearance; this
lane only consumes those solid footprints. CopperMaple owns terrain rule runtime.
Generated field schemas must be regenerated after merging definition changes,
not resolved by choosing one branch's generated output. Keep wave-2 PR76 separate.
