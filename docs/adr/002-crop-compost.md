# ADR-002: One compost application per planting

Date: 2026-09-21
Status: Accepted

Pomace currently has no crop-facing use. Compost provides a bounded connection from pressing to farming without replacing water or farming upgrades.

Add a default-false `composted` field to authoritative crops and a validated `compostCrop` lifecycle effect. Advance settled growth by one quarter of required ticks, cap at maturity, and consume one compost atomically. Existing crop permissions and reach apply.

Repeated percentage acceleration without a marker would permit instant growth through spam. A separate treatment table would require stale-row cleanup at every crop deletion. Enriched seed variants would multiply the item catalog and exclude already planted crops. The chosen column requires regenerated bindings and an additive migration but makes the lifetime explicit and keeps harvest/reset behavior simple. No XP is granted for treatment.

See [specification](../pomace-compost-spec.md).
