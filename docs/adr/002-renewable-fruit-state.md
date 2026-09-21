# ADR 002: Store fruit readiness independently of tree health

Date: 2026-09-21
Status: Accepted

Fruit production must survive picking without reusing stump regrowth. Append a defaulted readiness deadline to world_resource and use the existing activation ordinal for deterministic seed rolls. Author harvest parameters in resource content and reuse gatherWorldResource for E/touch picking.

A separate table would require another public subscription and cleanup lifecycle; reusing respawnAtTick would entangle mining and tree readiness. The appended field keeps indexed resource access and migration simple, at the cost of a small field on every resource. Existing maturity rules remain authoritative. Felling a ripe tree pays its current harvest once and starts the same cooldown a pick would. Felling while that cooldown is running pays forestry materials only, so pick and chop cannot collect the same fruit twice.

See [spec](../renewable-orchard-spec.md).
