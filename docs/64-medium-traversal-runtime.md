# D6 medium traversal runtime

Status: implementation in progress; live hazard balance and activation remain owner decisions.

## Contract and scope

This follows doc 61 §2.5.3 and doc 62 D6. Stable `RULE_MEDIA` IDs describe
terrain independently of solids. Actor capabilities come from authored actor,
mount and active effect definitions. Artwork, species prefixes and presentation
adapters do not grant capabilities. Collision retains height, cliff, transition,
cellar and dynamic object geometry. Object-state runtime owns resolved object
solidity; traversal consumes that output.

The shared predicate evaluates authored alternatives of required abilities.
An empty alternatives list denies access; an empty requirement set explicitly
allows access. Hazards are independent of access: a traversal grant does not
imply damage immunity. Each hazard declares its exact immunity and tick period.
No numeric damage or interval is inferred from media names.

A mount explicitly replaces listed locomotion grants while occupied, preserving
innate abilities outside that list; active effects add grants for their authored duration. This prevents a boat rider from
carrying a walking grant onto land. Expired effects do not contribute abilities.
Immunity grants are never converted into access grants implicitly.

## Migration boundary

Use additive medium/solid channels alongside legacy collision. Shadow mode
returns the legacy result and reports concrete differences; activation requires
client/authority parity evidence and an explicit reviewed policy. Missing or
invalid medium cells fail closed. Existing chunks and saved rows remain readable;
this lane does not switch terrain loading to chunks or retire old channels.

The known water-plane disagreement at x414–416, y357–361 must be measured with
the shared medium classifier, not patched by client-only coordinate exceptions.
Do not alter any frozen wave-1 source branch. No merge, world publish or live
release is included.

## Acceptance

- Shared predicate and ability lifetime tests cover all six media, combinations,
  mount substitution, expiration, solids and invalid/missing cells.
- Hazards test immunity separately from movement and use deterministic ticks.
- Collision projection retains authoritative height/edge/obstacle metadata.
- Shadow comparisons expose differences without silently activating them.
- Client prediction, server movement, NPC AI, projectiles and placement use the
  same resolved policy before the old fixed-plane decision is retired.
- Required project checks, content/schema validation, version/docs and a separate
  PR complete the handoff. Live activation is never claimed from helper tests.
