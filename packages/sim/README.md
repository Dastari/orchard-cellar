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
