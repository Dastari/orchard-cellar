# SpacetimeDB empty-table drop proof

This disposable fixture verifies the exact CLI/server migration behaviour before
the Orchard chest tables are retired. It must only be published to a loopback
standalone instance and a throwaway database, always with `--delete-data=never`.

Run `scripts/prove-spacetimedb-empty-table-drop.sh`. It creates a fresh loopback
server, temporary data directory, unique server nickname/database, and applies the
three sources under `versions/`: publish both probes (the init row makes
`filled_probe` non-empty), remove only `empty_probe` and republish successfully,
then remove `filled_probe` and require the non-empty-table refusal. Cleanup stops
the server and removes the temporary data. Never point this fixture at production.
