# Legacy farm/storage retirement finalizer prerequisite

The repository contains an owner-only, one-way retirement state machine for
`private_inventory`, the `wood`/`stone` compatibility balances on
`player_survival`, `farm_parcel`, `crop_patch`, and `farm_activity`:

`inspect -> parity_verified -> draining -> schema_removal_candidate`

Inspection and parity verification are non-destructive. The parity proof uses
the durable `world_scalability_migration.legacyFarmVersion` marker because that
marker was committed atomically with the original inventory, soil/crop, and
statistics migration. Comparing current targets to old values would be wrong:
players may already have consumed items, harvested crops, or advanced stats.

Draining is not a schema migration. Each owner-authorized batch deletes at most
100 rows from the four retired private tables and zeros only `wood` and `stone`
on retained `player_survival` rows. It fingerprints the exact remaining source
between batches and never writes inventory, overflow, soil, crops, or player
statistics. Production draining is intentionally disabled unless the runner is
given its explicit finalizer receipt.

## External finalizer prerequisite

Before setting `LEGACY_FARM_RETIREMENT_DRAIN=1` against production, the release
owner must complete all of the following outside this automation:

1. Take a fresh leave-stopped backup of the exact production database and retain
   the transitional world module and source manifest needed for rollback.
2. Restore that backup into an isolated database, publish the exact transitional
   module with no deletion, and run the owner-authenticated retirement runner to
   `schema_removal_candidate`. Prove all four legacy table counts and all nonzero
   `player_survival.wood`/`stone` counts are literal zero while canonical world,
   inventory/overflow, statistics, player identity, skills and quests match the
   pre-drain restored snapshot.
3. In a separate candidate checkout, remove the four legacy declarations, the
   two compatibility columns, every remaining legacy reader/clear/migration
   branch, and the retirement mutation reducers. Keep `player_survival` and a
   read-only terminal status receipt. Build the module and both clients, generate
   bindings there, run `legacy-farm-retirement-source.ts` against the candidate
   world source, and run `legacy-farm-retirement-schema.ts` against the actual
   described candidate schema.
4. Rehearse upgrading the drained restored database to that exact pinned
   candidate with `--delete-data=never`, then repeat continuity and schema checks.
   Only the release owner may approve the matching production drain and publish.

The environment acknowledgement for a rehearsed drain is
`LEGACY_FARM_RETIREMENT_FINALIZER_RECEIPT=rehearsed:<database>`. It is an
operator interlock, not a substitute for the backup, isolated rehearsal,
schema-description receipt, pinned source manifest, or owner approval above.
The runner also requires `LEGACY_FARM_RETIREMENT_TARGET` to be `rehearsal` or
`production`; a production drain additionally requires
`LEGACY_FARM_RETIREMENT_PRODUCTION_CONFIRM=<database>`.
