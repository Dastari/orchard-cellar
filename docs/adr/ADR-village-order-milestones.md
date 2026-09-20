# ADR: Bounded village order progress and exclusive meal knowledge

**Status:** Accepted  
**Date:** 2026-09-21

## Context

Repeatable orders currently end at bronze and do not visibly link growing, preserving and cellar production to useful permanent capabilities. Current receipts retain only the last delivery and cannot reconstruct historical diversity.

## Decision

Persist one capped 2/2/1 raw/preserved/bottle row per player and atomically unlock two exclusive meal recipes with existing known-recipe authority. Show progress through owner-only order quotes. Begin new milestone counts at zero; do not fabricate historical credit. Classify live order items through content tags/processes.

## Alternatives and rationale

A new reputation currency adds a redundant economy. Rewarding existing buyable equipment plans devalues prior purchases. Unbounded delivery history introduces unnecessary retention/index costs. Reconstructing all progress from generic sales statistics incorrectly credits ordinary sales and cannot identify historical order batches. New cosmetic furniture requires a larger object/placement surface than these provisioning rewards.

## Consequences

Five diverse deliveries create a permanent link into repeatable meal preparation without combat. Progress and rewards share the existing delivery transaction/revision. Meal values require later playtest tuning; reused food art limits visual distinction. The additive private table and changed quote shape require generated bindings and synchronized client/module release. Existing players start fresh on the new milestones while keeping prior payments and recipe knowledge.

See [specification](../village-order-milestones-spec.md).
