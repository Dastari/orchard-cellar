# Shared timing projection from authoritative anchors

Date: 2026-09-23. Status: Accepted.

## Context

Authored workstation frames dropped legacy countdown rendering, and client
elapsed-time calculations accidentally included the season/calendar offset.
Growth and hover have separate formatting and eligibility paths. #65 and #81
already define settlement mathematics and lifecycle authority.

## Decision

Separate simulation and calendar clocks explicitly. Derive a common read-only
timing projection from existing authority anchors and settlement mathematics.
Share it across authored kit panes and world hover. Preserve lazy settlement;
represent uncertain completion honestly until authority confirms it.

## Alternatives and consequences

Per-object ticking rows or browser timers add write traffic and lifecycle cost
without improving authority. Separate UI-specific arithmetic risks drift from
settlement. A global rewrite of authority would duplicate pending #81 work.
The chosen approach adds adapter/contract tests and requires explicit confidence
and pause states, but avoids schema churn just to draw a countdown. Seasonal and
weather-dependent growth cannot always provide an exact finish time.

See [implementation specification](../timing-system-spec.md).
