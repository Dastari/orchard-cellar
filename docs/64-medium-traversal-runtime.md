# D6 medium traversal runtime

Status: runtime implementation passes full local checks; CI/integration review pending. Bootstrap policy is **shadow**;
source changes do not activate or deploy the new movement/damage behavior.

## Contract

Doc 61 §2.5.3 and doc 62 D6 separate six stable `RULE_MEDIA` from solid geometry.
`canTraverse(medium, abilities, policy)` evaluates authored OR-of-AND requirements.
Empty alternatives deny access; an empty requirement set explicitly allows it.
Height, cliffs, transitions, cellar excavation and dynamic object footprints
remain independent collision constraints. Art names never grant abilities.

`world_rules` profile `traversal` has one nonretired owner. Missing policies,
missing channels or legacy actors without optional grants retain legacy behavior.
Explicit empty grants deny admission. Shadow returns the exact legacy map while
retaining a candidate and concrete differences; active uses the candidate.
The default is shadow until review and activation evidence approve a content edit.

Players use the policy's innate grants plus active effect definitions. Mounts
replace only their explicit locomotion list; unrelated innate immunity survives.
Effects add grants after mount substitution and expire using exact bigint ticks.
NPCs/creatures/enemies use their definitions. Bootstrap locomotion was backfilled
from semantic locomotion/vehicle fields, with no inferred fire immunity.

## Owner-approved hazards

The owner confirmed these values through GoldCondor on 2026-09-23:

| Medium | Damage | Period | Admission | Damage immunity |
| --- | --- | --- | --- | --- |
| lava | 10% maximum health per second | 20 authority ticks / 1 second | lava immunity, flight or projectile | lava immunity |
| shroom_water | 2% maximum health per second | 20 authority ticks / 1 second | boat, swim, water-walk, toxin immunity, flight or projectile | toxin immunity |

Admission and immunity are distinct. A boat or water-walk effect permits shroom
entry but does not suppress toxin damage. Flight is not blanket immunity.
Hazards use configurable `maxHealthBasisPointsPerSecond` and `intervalTicks`;
the parser bounds them to 100,000 basis points and 1,200 ticks to bound arithmetic
and persisted state. Projectiles have admission profiles, not health targets.

The private additive `traversal_hazard_state` table retains integer numerator
carry in each actor's existing health units (centi-HP players, integer HP NPCs).
Thus tiny health pools still take damage, with full-health survival absent healing
of 10 seconds in lava and 50 in shroom water regardless of level. Actual exposed
ticks accrue debt; one-second pulses pay whole units and retain fractions.
Leaving a medium stops accrual but can flush already earned debt. Exact immunity
clears pending debt. Skipped/offline ticks, space changes and changed hazard
contracts reset exposure rather than charging catch-up damage. Duplicate calls
for one actor/tick do not double-charge. Idle rows expire and shadow clears debt.

Player damage uses existing fishing interruption and knockout recovery, or the
rogue-run restoration path. As with existing combat, lethal damage requires a
valid authored recovery destination. NPC damage updates existing health/death
state, clears rider/attack custody, preserves wildlife respawn and rogue completion,
and updates outdoor encounter health without inventing a player contributor.
No inventory loss or new environmental reward policy is introduced.

## Runtime consumers and parity

- Client prediction and server movement resolve the same mounted/effect abilities.
  Remote client interpolation uses authoritative samples without an invented
  private effect profile when active; local prediction remains collision checked.
- NPC movement, panic/knockback and outdoor/rogue AI use definition capabilities.
- Projectiles and gameplay ground/boat placement use explicit authored profiles.
- Generated fast paths and compiled maps share medium/solid projection. The former
  avoids allocating full render/compiler arrays merely to classify admission.
- Cellar excavation replaces the solid-channel cache when geometry changes.
- The full-island parity regression compares generated, compiled and chunk channels
  and candidate boat admission. It covers the known 15 waterfall cells at
  x414–416/y357–361, which classify as shallow water with no solid blocker.
  Legacy disagreement remains visible in shadow; active candidates agree without
  coordinate-specific runtime patches.

CopperMaple confirmed no complete per-cell semantic base-role accessor exists yet.
`mapTraversalChannels` accepts resolved base-role medium/solidity and otherwise
uses shared biome/compiled-surface classification. Visual fringe roles must never
change the underlying medium. This fallback does not claim complete authored
shroom-role coverage; that requires the subsequent role resolver integration.

Coordinator decision292 preserves Studio's Smart Placement, which places/autotiles
decorative prefabs (including docks) without actor context. It must not be gated
by player traversal. Exact authoring override remains available. Gameplay placement
uses explicit authored profiles through reusable `runtimeActorCollision` placement
actors. No placement capabilities are inferred from prefab art.

## Delivery and activation

This PR is separate from frozen wave-1 heads and stacked on #71. Rebase/retarget
only after coordinator integration. ChartreuseDuck owns object state/resolved
solidity; this lane consumes it and owns only its new private hazard table.
Regenerate combined field schemas and bindings when integrating parallel work.

Content measurement: 920 definitions / 26 kinds, 585,179 runtime bytes, hash
`a69b62bf`, +2,461 bytes (+0.42%) from wave-1. Guard: next whole KiB, 572 KiB.

Required build/check evidence is recorded in `docs/medium-traversal-handoff.md`.
Active-mode unit/runtime tests are not permission to enable the live policy.
Client/world content engine versions remain exact-match1 for compatibility with
existing live packs. A world_rules publication cannot be consumed by old clients;
coordinator decision297 requires a reviewed compatible client/world/content
transition preserving live v1 readability before publishing this kind. No epoch
is silently advanced by this PR.

Full role coverage, visual/network smoke and reviewed activation
remain explicit release gates; no world publish or deployment is included.
