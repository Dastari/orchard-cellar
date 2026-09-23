# Named balance and progression content

Status: implementation; owner-authorized F2 part 1, Agent Mail #178.

## Contract

Balance profiles accept legacy `values` tuples or named `fields`. The parser validates
both with the existing bounds and invariants and emits only named fields. Supplying
both forms is rejected to prevent ambiguous edits. Committed content uses named
fields; runtime tuple compatibility helpers remain available for old callers.
Field metadata documents units, ranges and author help. Residence material references
remain validated against active items and recipe versions remain immutable identifiers.

A new singleton `progression` definition owns the total-XP power curve, level cap,
respec ladder and activity award coefficients. Awards use `base + perUnit * units`,
with zero values allowed. Existing content-owned process/quest/enemy rewards stay in
their definitions. Live skill purchases, respec and activity awards resolve the active
registry. During additive rollout, a registry without progression uses the committed
bootstrap definition; duplicate active definitions are invalid. Existing XP rows are
never rewritten. Isolated simulation callers use the same bootstrap content.

## Decision

Accepted: keep a single content kind for global progression, with fixed typed activity
keys rather than arbitrary executable formulas. This is deterministic and gives
Studio ordinary numeric fields. Alternatives were scattered scalar balance entries
(lose atomic curve/award validation) and scripts (unnecessary privilege and runtime
complexity). Bounds prevent unsafe integer XP results and excessive level lookup work.

## Verification and rollout

Golden parity covers each legacy tuple field, every level threshold, respec index and
current literal award site. Test changed content reaches runtime, malformed values fail,
legacy and named representations round-trip, and duplicate owners fail validation.
Run affected tests, workspace typecheck/lint and builds. Schema generator #70 is not in
the latest-main base: regenerate after integration, before Studio deployment.

In a maintenance window, publish parser/runtime module first, stage matching
clients/Studio, then review/backfill named balance and progression rows through the
existing content change-set path. Verify old/new values and enforce the client
update gate before resuming traffic. No database table changes or delete-data operation.
This lane creates a PR only; merge and publishing require separate authorization.
