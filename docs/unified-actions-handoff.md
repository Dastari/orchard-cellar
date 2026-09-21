# Unified actions planning handoff

Date: 2026-09-21. Status: plan authored; no implementation or deployment.

Planning branch: `docs/unified-action-and-repair-plan`, from `origin/main` at
`1d2462cd`. Planning worktree: `/home/toby/projects/orchard-cellar-action-plan`.
Base workspace `/home/toby/projects/orchard-cellar` has unrelated active work; do not
reset or repurpose it. PR lookup:
`gh pr list --head docs/unified-action-and-repair-plan --state all --json number,url,state`.
The linked plan is the contract; this snapshot is a hypothesis to reverify.

## Read order and first task

Read project AGENTS.md, `docs/unified-actions-spec.md`, `docs/unified-actions-plan.md`,
`docs/adr/002-unified-actions-and-repair-custody.md`, then current architecture,
roadmap, relevant lifecycle/input/authority/inventory sources. User approved the
high-level direction, not production spell balance or an immediate deployment.

When implementation is requested, start P0: produce a checked-in action/parameter and
custody-writer matrix with behavior goldens. Do not jump straight to a new renderer,
repair UI mockup or spell catalogue. Proposed details include inventory-accessible
repair (no required anvil), retaining authored material/currency prices, and initial
shovel soil restoration without item rewards. Keep these explicit in the P0 matrix.

Verify with `git fetch origin`, `git status --short --branch`, `git branch -avv`,
`git remote -v`, and `gh pr list --state open`. Read overlapping PR descriptions and
file summaries. PR 26 (hoe/fish) and PR 30 (fishing XP) were open when planned; use
current integrated code, not assumptions that they were merged. Create a fresh
implementation branch from current upstream main and preserve other worktrees.

## Validation and closeout

Planning validation: relative Markdown links, phase dependencies, acceptance coverage,
source-path checks and `git diff --check`; 7 documentation-only files, 12 new
local links and 8 acyclic phases verified. An existing roadmap link into ignored
local output was excluded from new-link checks. No runtime/package versions changed;
no runtime tests/builds were rerun for this documentation-only change.
Implementation: focused authority/geometry/custody tests plus required workspace
checks and affected builds. Lifecycle and binding/schema changes require integrity
checks and isolated migration/recovery rehearsal. Never bypass Studio's prebuild
guard. Never merge or deploy without explicit authorization. Any authorized Orchard
visual verification uses `https://orchard.dastari.net/`.

At each phase close, update spec/plan status, architecture, roadmap, changelog and this
handoff with exact checks and the phase PR. Keep one authoritative execution/cost
owner per action and don't hand off hidden unresolved custody or geometry differences.

## Review record

- Independent planning review: shared resolver endorsed; incorporated physical versus
  reach coordinates, old G offset-circle mismatch, effective-range chunk enumeration,
  resisted-contact wear, rounding and source eligibility into P0/P2–P5 gates.
- Fresh-context adversarial review: five findings resolved. Added executor-specific
  spatial sampling/autonomous projectile rules; reservations never block damage/drains
  and newest-first cancellation reconciles shortfalls; durable delivery/application
  keys prevent hit/output replay; every enabling phase has compatibility/recovery
  gates; dependent phase branches wait for authorized upstream integration. Added
  corresponding delayed-effect, vital-loss, restart and cutover tests. Follow-up
  review found no remaining must-fix planning gaps.
