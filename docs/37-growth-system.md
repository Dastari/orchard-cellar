# Generic growth lifecycle

Status: implemented foundation; trees and cacti are live consumers. Crop and
homestead definitions use the same pure stage math as their authored varieties land.

Target placement is amended by [40](40-sanctuary-overworld-and-zoned-world.md) and
the 2026-08-28 crop direction: sanctuary-overworld vegetation remains immutable
scenery, but player-created crops are allowed on explicitly tilled `world_soil`.
Growable resource rows otherwise belong in Homesteads or declared resource zones.

## 1. One growth model

All growable entities use `GrowthProfile` from `packages/sim/src/growth.ts`:

- integer `maxProgress` and ascending visible `stageThresholds`;
- integer basis-point rate modifiers for water, fertilizer, poison, and biome fit;
- a combined rate clamped at zero, so hostile conditions may pause but never reverse
  progress or destroy a plant;
- deterministic fractional advancement keyed by authority sweep plus an instance seed;
- a closed-form elapsed-tick function for large populations that must not receive a
  scheduled write every tick.

Water and fertilizer are positive modifiers. Poison, drought, unsuitable soil, and
an unfavoured biome are negative modifiers. A plant definition owns its preferred
biomes and supplies `preferredBiomeGrowthModifier(...)`; no renderer or client may
decide growth speed.

## 2. Persistence and scale

Sparse mutable overworld resources (trees and cacti) persist `growthStage` and
`regrowthProgress` in `world_resource`. They advance in coarse authority-clock sweeps,
including while no player is online. Developer calendar changes do not create growth
time. Rain is a small +1,000 bps water modifier and each resource id staggers the
fractional bonus deterministically.

Dense Homestead and overworld crops follow docs/34 and docs/35: persist settled
watered-growth ticks and the last boundary tick, then derive the live overlap with
the current watering window. Do not add a scheduled per-crop update loop. A row is
written only for planting, watering settlement, harvesting, or a future durable
modifier boundary.

## 3. Stage and harvest contract

Trees and cacti use stump/seed time followed by small, medium, and big stages. Each
live stage has independent health and may be harvested. Depletion resets progress to
zero while preserving the harvested stage so the matching stump can render.

- small tree: Stick ×1;
- medium tree: Wood ×1;
- big tree: Wood ×3 (a big fruit tree also drops its matching fruit);
- cactus: Cactus ×1/2/3 for small/medium/big.

The server owns tool validation, stage, health, drops, modifiers, and time. Clients
only render subscribed state and predicted cosmetic feedback.

## 4. Adding a growable definition

An implementation must:

1. register a profile and authored stage assets with reviewed source metadata;
2. declare preferred/allowed biomes and translate mismatch into `biomeBps`;
3. compose water, fertilizer, poison, and biome inputs through `GrowthRateModifiers`;
4. choose sparse persisted sweeps or dense closed-form derivation according to row
   count, never client time;
5. register harvest/tool outcomes in the player-statistics registry;
6. test stage thresholds, zero-rate pause, positive and negative modifiers,
   deterministic replay, drops, biome placement, and offline authority progress.
