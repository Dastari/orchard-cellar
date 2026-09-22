# ADR 0035: Register nearby world interactions

Date: 2026-09-22
Status: Accepted

## Context

The E prompt and input already share nearest-target selection, but adding a world
entity requires editing a hard-coded adapter. Selected-item F hints can also hide
that E prompt. Interactions need to support both UI-opening and action callbacks.

## Decision

Introduce a provider registry with one proximity resolver and callback-bearing
resolved candidates. Route existing gameplay through a compatibility provider,
preserving specialized reach/facing/mount rules and authoritative server checks.
New providers register directly without extending the legacy type switch. Keep E
prompt composition separate from F precedence. Resolve again when E is pressed.

## Alternatives and consequences

A wholesale rewrite of every existing adapter would enlarge this bugfix and risk
changing gameplay rules. Keeping only the existing switch would leave no extension
point. The compatibility provider preserves behavior while new integrations use
the registry; its internal legacy branches remain and can migrate independently.
Providers supply current state, not persistent snapshots, and remove their
registration on teardown. Proximity exposes actions; input executes them.

See [world interaction contract](../world-interactions.md).
