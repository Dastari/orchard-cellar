# Willowharbour refinement: river town, gardens and separated interiors

## Intent and reference analysis

The five town references and two supplied screenshots set the visual target.
`xBzmG3` uses white picket boundaries, deliberate gateway openings, farm clutter,
flower pots at thresholds and irregular dirt lanes. `KiN+W_` composes distinct
public and private outdoor spaces around water and bridges. `Xxn6fE` has a real
continuous river with banks and a necessary crossing. `hqmGqr` concentrates pots,
lamps and seating around a connected hedge garden. The low-bank attachment shows
shallow grass-topped earth lips, rather than full-height rock cliffs. `4FeNv9`
uses separate room wings, visible black gaps, short connecting halls, capped walls
and vertical side faces. More scattered objects alone does not satisfy this task.

## Scope and implementation

- Continue the northern brook through the village to the southern sea; provide
  purposeful crossings on existing public streets without moving door contracts.
- Add irregular low turf banks to at least three village greens using native
  shallow ledge art; preserve walking routes and full-height terrain elsewhere.
- Use native cobbled paving for the civic square, grass transitions and dirt lanes.
- Import connected hedge corner/end tiles and white picket fence sections with
  deliberate gateways; add planted beds, frontage pots, garden trees and clutter.
- Place working streetlights at crossings, civic corners and entrances; capture
  their real renderer light field at night.
- Redesign all ten interior plans with room wings and connecting passages as
  appropriate to their use, with wall caps and vertical side faces. Keep ten
  bidirectional portals and service approaches valid.

Retain Canvas 2D native sprite/cache rendering, the existing frame loop and
native pixel scale. Avoid new dependencies and per-frame scene generation.
This is game/world authoring, not a Studio update or production deployment.

## Validation and failure handling

Render baseline/final island, town, night and ten-interior views through the game
renderer. Independently compare with Astra; fix spatial defects before acceptance.
Test connected paths, bridge landings, all doors/returns, furniture footprints,
interior room connectivity, continuous river and deterministic scenery. Native
crop tests and asset validation must pass. Preserve fail-closed map upgrade
conflicts, content validation and generated-atlas provenance. Run required checks
and record outcomes in the new PR. Existing town edits must produce upgrade
conflicts, invalid interior plans must fail tests and missing art must fail builds.
