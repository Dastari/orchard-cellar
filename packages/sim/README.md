# Shared simulation

`@orchard/sim` contains deterministic gameplay rules and the authored content
registry shared by the world server and client.

## Fruit seed helpers

- `fruitTreeForSeed(registry, seedKind)` resolves a live seed item to its unique
  regrowing fruit-tree resource using the resource's optional `seedItem` reference.
  Missing, retired and ambiguous definitions return `null`.
- `fruitSeedChanceBps(rank)` returns 500 / 1500 / 2500 / 3500 basis points
  (5% / 15% / 25% / 35%) at ranks zero through three.
- `fruitSeedDrop(registry, resource, drops, rank, seedParts)` returns one matching
  seed or `null`. Call only after a completed mature fruit harvest, using the
  server's world seed, resource ID and activation ordinal. Normal drops remain
  unchanged. Resolve the rank through `farmingSkillEffects`.
- `plantedFruitTreeId(spaceId, tileX, tileY)` packs validated u16 space and i16
  tile coordinates into a reserved safe-integer ID. `isPlantedFruitTreeId` marks
  rows that generated-resource reconciliation must preserve.

Planting permissions, collision, inventory consumption and resource writes
belong to the world authority. See [the feature specification](../../docs/fruit-seeds-spec.md).

## Village interior content

Willowharbour's ten `village_interior` spaces share deterministic room and furniture
collision. `hearthInteriorFloors` optionally assigns bounded `townhouse`, `stone`
or `soil` finishes; it changes presentation only. Authored portal pairs connect
each space to its exterior door through the ordinary content portal planner.
See [the interior format and room catalogue](../../docs/willowharbour-interiors.md).

## Smart placement and object presentation

`smartConnectedObjectPrefabs` creates one-cell semantic fence/hedge prefabs.
`smartObjectPresentationPrefabs` groups catalog variants into stateful objects.
`ObjectPresentation` declares bounded bool, enum and counter properties using the
existing `ObjectStateDefinition` vocabulary, plus conditional placement visuals.
`resolveObjectAppearance` is the shared editor/game resolver. Optional
`MapObjectInstance.state` travels in the existing map document and delta format;
legacy documents without these fields retain their normalized representation.

Use `mapObjectPlacementConflict` before an editor placement or geometry edit to
check occupied prefab cells on the same layer and elevation. It is an authoring
helper, not a whole-map validity requirement. Connected neighbors are isolated by
map and layer. Exact authored pieces and invalid terrain layouts remain supported.

`MapEntityStateEdit` records a resource ID, matching `baseState`/`state` properties,
and one-shot intent. `resourceEditableProperties` describes supported health,
depletion and tree growth fields. The world compares the baseline with live values
before committing the map delta, then applies changed records once; ordinary
resource growth resumes immediately. Unchanged published records never replay.
See [the specification](../../docs/studio-smart-placement-spec.md) and
[the architectural decision](../../docs/adr/ADR-studio-smart-object-state.md).

## Space registry

`buildSpaceRegistry(staticSpaces, instances, portals)` resolves live revision
static definitions and persisted homestead/rogue instances into sorted entries
with authoritative geometry, ownership labels and outgoing portal links. Supply
`registry.compiled.spaces`; it deliberately has no bootstrap fallback. Instances
include residence expansion and architecture; cellars use the existing 1024-tile
envelope. Private run rows must be projected behind caller authorization.
See [the F4 specification](../../docs/studio-multi-space-spec.md).
