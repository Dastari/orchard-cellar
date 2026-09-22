# Shared semantic placement and object state

Date: 2026-09-22
Status: Accepted

## Decision

Smart/Exact is an authoring mode. Smart chooses shared semantic families and state-driven visuals; Exact preserves explicit authored pieces. Store state with the object and declare supported values using the existing typed state vocabulary. Resolve visuals in shared code consumed by game and Studio. Apply functional resource changes through atomic map delta publication, preserving identity and harvest semantics.

## Rationale and alternatives

Keeping separate Studio-only grouping and sprite substitutions would make game placement disagree with editor previews. Creating a second unrestricted property system would duplicate the existing content state schema and widen authority unnecessarily. Raw atlas frames alone cannot represent growth or joining intent. Shared declarations add parsing and migration responsibilities but keep persisted intent and rendering consistent.

UI controls must survive ordinary animation/hover frames. Avoiding unnecessary shell rebuilds is preferable to individually patching every transient menu; explicit scroll/focus restoration remains necessary when actual selection or document changes rebuild the inspector.

## Consequences

Legacy documents without state retain their visuals and hashes. New state is optional, bounded, validated and included in ordinary deltas. Exact mode permits unusual designs, but normal editor operations prevent accidental same-layer overlap. Geometry assistance remains local and advisory as established in the prior Studio specification. Shared authority changes require coordinated deployment, while compatible UI improvements can deploy independently.
