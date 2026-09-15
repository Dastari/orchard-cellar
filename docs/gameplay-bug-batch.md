# Gameplay bug batch — 0.8.1–0.8.2

## Review state

- Draft PR: https://github.com/Dastari/orchard-cellar/pull/14

- Branch: `fix/mount-targeting-and-motion`, based on upstream `main` at `dd0659ff`.
- Workspace: `/home/toby/projects/orchard-cellar-mount-fix`.
- Keep this PR open: the owner is adding bugs to the same batch before merging.
- Do not merge or deploy until explicitly requested. The live game still has the
  original behavior. Preserve the separate Studio release source and prebuild guard.

## Findings and changes

| Report | Evidence | Change |
| --- | --- | --- |
| Dismount snaps roughly 20 blocks | Authored distance was 4,608 fixed units; each tile is 256 fixed units. The server therefore deliberately selected a point 18 tiles away. Legacy distance is 288 units (1.125 tiles). | Correct the authored distance. A narrow entrance-clearing regression verifies a nearby collision-safe landing. |
| E offers a distant horse | Owner screenshot shows an on-foot player with `[E] RIDE HORSE` while the horse is far across the screen. Authored horse/boat reach was 8,192 units (32 tiles). | Restore 512 units (2 tiles). Test the actual horse target selector at 20 tiles, 2 tiles, and just outside 2 tiles. |
| Dismount unavailable beside homestead entrance | Distant dismount candidates can be blocked; nearest-target selection can also choose a portal over the ridden horse. Runtime log contains `no_safe_dismount_position`. | Fix distance and prioritize the ridden vehicle for E. Use authored reach consistently at the generic server gate. Dismount custody/space/collision checks still apply. |
| Sheep/mobs cannot be struck; `BEHAVIOUR TARGET NOT FOUND` | The actual action-target resolver required an `npc:` definition, but sheep are owned by `creature:sheep`. Wildlife and enemies share the `world_npc` table. | Resolve profile-backed wildlife/outdoor/rogue targets to their active creature/enemy definitions. Missing, retired, explicit unresolved, or ambiguous content still fails closed. Existing combat range, tool, mounted-action and damage checks remain authoritative. |
| NPC/mob position shifts while the camera moves, especially diagonally | Players and camera interpolate between simulation steps; NPC drawing consumed only the newest step. | Retain previous NPC samples and use the same render-frame fraction. Clear samples on deletion and space changes. A diagonal-camera draw test verifies constant screen separation throughout the frame. |

The same unit conversion mistake also inflated the horse wander radius and speed
16-fold. Restore a three-tile radius and half-pixel movement step; regression
expectations reference the original simulation constants instead of repeating
the incorrect authored numbers.

## Facing swings and tooltips

See [the swing specification](facing-swing-spec.md) and
[authority ADR](adr/001-facing-swing-authority.md). All 24 sword/axe/pick/hoe
variants emit a targetless secondary swing. Sword/axe: 1.5 tiles, 90 degrees;
pick: 1 tile, 45 degrees; hoe: 1.25 tiles, 90 degrees. All unique contacts count
for durability, including resistant objects, with one stamina charge. Wear occurs
after all contacts so a breaking tool completes its swing. Protected objects and
NPCs, mining tiers, ownership, claims and resource yields retain their rules.
F swings; left-click performs explicit farming/cellar excavation, and right-click
restores farmland. Mounted attacks remain prohibited by the existing rules.

Tool labels show only the name initially. After 600 ms of hover, details appear
above the hotbar, bounded to the viewport, including current/maximum durability.

The measured runtime content payload is 536,535 bytes, an increase of 1,421
bytes (0.27%). Its enforced budget advances from 523 to 524 KiB to cover the
authored geometry/damage fields; the definition count remains 900.

## Evidence and uncertainty

- Scanned all 476,376 lines then present in the local production replica's
  `2026-09-15.log`: 18 `use_selected` target-not-found errors, 14 no-safe-dismount
  errors, and 45 `interact_entity` out-of-range errors. This log spans other
  activity/releases too; counts are corroboration, not per-player attribution.
- CLI SQL access failed with `authentication_invalid_issuer`; no live rows were
  queried or modified. The shared preview at `https://orchard.dastari.net/` opened
  the account screen, so authenticated in-game visual verification is outstanding.
- The owner is unsure whether failed attacks occurred mounted or on foot and
  suspects some axe attempts used E instead of F. E is interaction; F is the
  selected tool action. Tree/resource-specific failure is not yet established.
- The oversized authored distances explain the reported horse behavior without
  requiring a network desynchronization hypothesis. NPC interpolation fixes a
  confirmed frame-timing mismatch; live play must confirm that it accounts for
  the full reported visual symptom, including stationary NPCs if applicable.

## Validation

- Production-source regressions cover mounted E priority, two-tile reach, sheep
  resolution, diagonal NPC drawing, targetless F input, multi-contact server
  swings, per-contact wear, resisted targets, tool break, and tooltip dwell/bounds.
- Running the initial mount/target/render regressions against the original source
  reproduced 10 failures; restoring the changes makes them pass.
- Lifecycle verification and artifact integrity pass (revision 15, 123 callbacks).
- Workspace typecheck/lint and checked world/game production builds pass.
- Final coverage run: 827 files pass; 4,659 tests pass and one is skipped.
  Coverage: 92.66% lines, 88.51% statements, 83.67% branches, 94.07% functions.
  The run uses the CI licensed-art exclusion and two workers: `ORCHARD_TEST_LICENSED_ART=0 npm run test:coverage -- --fileParallelism --maxWorkers=2`.
- Exhaustive procedural terrain/world suite: 51 tests pass.
- Asset generation/validation: 1,182 art assets. Content export/validation: 900
  definitions. Payload measurement and client bundle gates pass.
- In-game visual verification is still pending; the shared preview has no
  authenticated game session. No game or Studio deployment was performed.

## Release and continuation

Publish corrected `npc:horse`/`npc:boat`, all swinging item content, and generated
lifecycle artifacts with the world module and client.
Updating only client code leaves the live content's 32-tile reach and 18-tile
dismount values active. Preserve unrelated live edits when preparing the reviewed
content candidate. No stored schema changes, player/horse relocation, or database
migration is part of this patch.

For the next bug, inspect current branch/PR state, reproduce with the owner's
evidence, add a focused regression, update this file and the changelog, and push
another logical commit to the same PR. Existing unrelated PRs #11 and #13 remain
separate. Do not overwrite the original checkout's uncommitted `AGENTS.md` edit.

## Initial login follow-up — 0.8.2

The world renderer dismissed startup loading before subscriptions/player data
were ready and mapped both `connecting` and `ready` to the Reconnecting dialog.
It now continues the same gateway window with the current loading stage inside
the world render loop. Only an interrupted connection after a rendered world
frame uses Reconnecting. Initial handshake retries and connected data hydration
stay in loading. Update decisions, offline, sign-in and incompatible-content
errors keep their actions; clearing them returns to loading without a second
animation loop. Startup account retries say Connecting, too.

Validation: all 537 client tests (116 files), workspace typecheck/lint, client
production build and bundle gates pass. Ten new regressions cover initial
connection/hydration/retries, real recovery, update/error priority and resuming
loading; eight fail against the original renderer and pass with this change.
The prior full-suite results above apply to the original batch. No merge or
deployment was performed.

## Authorized release preparation

The owner authorized merging and deploying PR #14. Release preparation found the
previous rollout's documented false mismatch: `ownVillageOrders.contentHash` is
a view projection of the active registry, not stored player state. The routine
expected snapshot now checks the prior hash and projects only the approved new
hash; all quote values and durable state remain subject to exact comparison.
Fresh, separate Studio PKCE credentials are used for release verification to
avoid competing with the game's token refresh.
