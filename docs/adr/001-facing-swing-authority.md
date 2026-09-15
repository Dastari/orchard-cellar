# ADR 001: Resolve swing contacts on the authority

Date: 2026-09-16. Status: Accepted.

## Decision

An authored item secondary lifecycle requests a server-resolved swing. The
server uses authored arc geometry and its own position/facing to collect nearby
contacts, applies existing target-specific effects, and accounts for one swing
with per-contact durability. See [the specification](../facing-swing-spec.md).

## Rationale and alternatives

The former client-picked target path prevented general swings and produced
target-not-found errors before the tool could act. Sending a client contact list
would still require full server revalidation and retain cursor coupling. A
server query makes the owner's facing/all-contacts contract authoritative and
keeps mutation, stamina, and durability in one transaction.

Existing harvest/combat adapters preserve loot, claims, ownership and salvage.
They need an explicit swing context to suppress per-target stamina/animation/wear
accounting; the outer swing owns those costs. This adds adapter plumbing but
avoids divergent copies of progression and inventory logic. Queries remain
bounded to nearby indexed chunks; no world-wide scan is introduced.
