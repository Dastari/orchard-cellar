# Shared gameplay timing

Status: accepted implementation scope, 2026-09-23. Owner authorized the
three-PR sequence supplied by BrownHorizon; GoldCondor coordinates integration.
No merge or deployment is authorized in this lane.

## Objective and scope

Restore accurate workstation countdowns and expose the same timing facts to
authored frames and world hover, then extend that contract to crops, tree growth
and fruit. Keep production settlement authoritative and bounded.

Delivery order:

1. A: separate simulation time from calendar time, with an offset regression.
2. B: shared pure timing projection, authored processor frames (including barrel),
   visible-footprint hover independent of action reach, cached content metadata.
3. C: crop, tree and fruit adapters with honest pause/conditional estimates.

Each PR begins from current upstream main. Dependencies and any necessary
stacking are recorded explicitly. Reuse #65 stateful settlement mathematics and
#81 lifecycle anchors/epochs; do not introduce a competing authority system.

## Contract and architecture

Simulation timestamps are compared only with `world_clock.authorityTick`.
Calendar offsets affect seasonal policy, weather, lighting and calendar display,
never processor/job elapsed time. Reconnection reads the new authoritative
snapshot; cosmetic animation clocks cannot confirm completion.

A pure sim projection accepts definition, state, existing anchors and authority
tick, and returns status (idle/running/paused/blocked/ready/awaiting-settlement),
reason, stage, progress, remaining active ticks, next transition and confidence
(exact/estimated). Adapter inputs preserve distinctions between known private
slots, public stale anchors, seasonal growth and confirmed output. No private
contents are exposed merely to support hover.

Authored timing panes and hover consume this contract. Frame data stays in
`frames.json`; kit rendering owns reusable presentation. Pick targets using
authored target rectangles or footprint fallback independently of action reach.
Action authority and reach checks remain unchanged.

## Resource bounds

No per-object countdown writes or browser intervals. Preserve lazy settlement
and bounded catch-up. Compile processor metadata once per content revision;
evaluate visible/selected targets only. Labels change at their displayed
precision; drawing an existing canvas frame does not require recomputing text.

## Failure handling

- Missing definition/anchor: show unavailable or idle as appropriate; no invented ETA.
- Stale closed-station anchor: estimated/awaiting settlement, never confirmed output.
- Dry/dormant growth: explicit paused reason; remaining active time is not an ETA.
- Reconnect/changed content: invalidate derived caches and reproject from authority.
- Blocked input/fuel/output: use known state; unknown slots cannot prove readiness.

## Acceptance

A 60-second job one second old displays 59 seconds and 1/60 progress despite
large positive or negative calendar offsets. All five authored processor frames
show status, time and progress. Projection/settlement parity tests cover exact
boundaries, closed/reopened stations, reconnect and paused growth. Local/dev
browser checks exercise a running furnace and barrel without touching production.
Run typecheck, lint, content validation, world build, relevant tests and full
`npm test`; record environment failures separately from passing checks.

## Clock audit (PR A)

`calendarTickForSnapshot` consumers in overworld-main:

- `worldCalendarTick`: developer calendar/day controls; stays calendar-based.
- update weather tick: visual weather/lighting; stays calendar-based.
- render weather tick: visual weather/lighting; stays calendar-based.
- render UI model: split into raw authority for workstation and private-job
  projections, calendar tick for date/time/day fraction/moon displays.

Crop growth uses raw authority plus a separate seasonal offset already. Fishing,
effects, fruit ripening and combat expiry paths use raw authority already.
VisualTickClock remains cosmetic and no longer supplies processor completion time.

## Coordinated clock source refresh

Source #84 integrates fixed runtime source #83 `53a2b19c`, retaining its reviewed
cell-part parity test optimization. This prefix adds clock-domain correction only;
processor/growth projection features remain in #85/#86. Ten focused tests across
three files, workspace types/lint, world build, asset generation and guarded
Studio production build pass. The combined runtime/timer candidate #93 passed
6,425 coverage tests plus 101 exhaustive tests at `0e9d5515`; its subsequent
`29b20dd2` test/docs-only refresh preserves production and passes both parity tests.
Source hosted checks and coordinator merge approval remain separate. No deployment.
