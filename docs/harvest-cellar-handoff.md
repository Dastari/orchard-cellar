# Harvest and cellar repair handoff — 2026-09-15

## Review state

Branch: `fix/harvest-barrel-progression`, based on upstream main `3509eddd`.
Worktree: `/home/toby/projects/orchard-cellar-harvest-audit`.
Read [the audit/spec](harvest-cellar-audit.md), [the gameplay contract](35-homesteads-and-farming.md#harvestcellar-repair-contract-070)
and the 0.7.0 changelog before release review. No gameplay deployment or live
inventory mutation occurred. The user's original mining worktree was preserved.

## Findings and implementation

Nado's cellar has two preserving barrels and two fermentation casks. Read-only
inspection found two Must in his inventory and empty containers. The existing
fermentation recipe needs three Must per bottle; preserving barrels intentionally
reject Must. The original failed drag was not observed. UI labels now distinguish
the containers and their input quantities.

Estate upgrade lookups and purchases now resolve garden, residence and cellar
through the owning home. The B menu exposes upgrades downstairs. Existing vintage
ranks provide the tier path; future physical machine tiers are not added.
Ten previously unavailable farming nodes are enabled, with valid prerequisite
chains and deterministic crop bonuses. Farmcraft's existing Vigour bonus is
covered by regression tests. Grafting remains unavailable: it requires an orchard
specialization interaction that does not exist yet.

Derived `active_farm_skill_nodes` and `active_farm_upgrades` views keep visiting
clients consistent with the current estate's growth and processor rules. Owned
upgrade subscriptions retain their original semantics for merchant pricing and
release continuity. No durable table columns were changed.

## Release follow-up

After PR review and explicit merge/release authorization, follow the existing
world release procedure. Deploy compatible module/bindings/client together, and
publish the reviewed content pack: the live revision 9 (`5b3399a3`) lacks current
main's processor XP/completion metadata. The candidate bootstrap pack has 895
definitions and hash `85e9773b`. Code deployment alone cannot activate the skill
metadata or repair live XP content.

Verify in-game using the owner's three Must: cask input acceptance, automatic
fermentation, XP, bottle extraction, downstairs upgrade purchase and skill timing.
Do not consume Nado's stock without authorization. Preserve the Studio prebuild
guard; no Studio deployment is part of this repair.

## Validation

Final test results are recorded in the pull request. Local art provenance tests
use the existing ignored licensed `references` directory from the original
checkout through an uncommitted worktree symlink. It is not a source change.
