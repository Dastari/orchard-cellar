# Willowharbour connected scenery and inhabitable rooms

## Objective
Correct the third-pass reference defects with reusable authoring rules and purposeful, traversable rooms. Build on PR39 in an isolated worktree; deliver a new PR without deploying game/world or editing Studio UI.

## Requirements
- A cell outline (including an 8x8 square) resolves native fence, picket and hedge straights, ends and corners from same-family cardinal neighbours. Support the other catalogued fence families through explicit native tile rules; never rotate a perspective sprite to fake a missing junction. Unsupported topology must produce a diagnostic.
- Shallow turf shelves use closed masks with native convex and concave corners. Outjut/return widths are at least two cells. No diagonal-only joins or single-cell teeth, missing corners, or clipping that opens contours.
- Remove ornamental chests throughout the west island and its interiors. Preserve unrelated player storage elsewhere.
- Town streetlamps are permanent authoritative objects with persisted auto/on/off mode. Auto responds to world time. Sprite and light use the same resolved lit state; interactions cycle all three modes, survive reconnection, and enforce normal proximity. No duplicate static lamp or unconditional emitter.
- Interior wall tops, side cuts and faces meet at native edge/corner tiles. Rooms have intentional materials, clear doorways, windows on supported exterior walls, and furniture matched to building/room use. All ten houses require a placement rationale and reachable service/portal routes.

## Architecture
Shared pure cell-to-native-variant rules in simulation code, consumed by town authoring and available for Studio integration. Native tile import manifests retain source coordinates. Town content keeps explicit room footprints and furniture placements. Lamps reuse world_placeable identity/state and normal lifecycle interaction/rendering; no new persistence table. Materialization follows active authored map lamp placements with stable identities, and time settlement updates only changed states.

## Failure handling
Unsupported boundary junctions fail authoring with family/cell/mask diagnostics; invalid shelf masks fail validation before export; missing/retired lamp content does not create an emitting fallback; invalid state/proximity fails through authority; room placement checks reject blocked spawns and unreachable exits. Existing saved maps retain reviewed-baseline conflict checks.

## Verification
Native pixel comparisons and visual atlas inspection; 8x8 outlines, ends/gates, mixed families and junction tests; closed shelves and two-cell returns; lamp day/night and each manual mode, matching sprite/light, persistence and interaction tests; all ten room floor/fixture/service/exit checks. Render daytime, nighttime, boundary and interior closeups using actual engine code and obtain a fresh independent Astra comparison. Run project lint/typecheck/build and required tests; document release scope and CI status.
