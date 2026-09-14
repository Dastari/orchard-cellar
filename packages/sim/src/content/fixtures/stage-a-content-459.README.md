`stage-a-content-459.json` contains the 459 original persisted definition payloads
recovered read-only from the retained production backup during the 2026-09-05 login
incident. It contains public content definitions only: `id`, `kind`, and the exact
stored `json` string; no accounts, credentials, or player/world instance rows.

The live Stage-A head is revision 1, engine version 1, and hash `ba28da55`.
The current parser adds `onUse: []` to its 159 item definitions, producing runtime
projection hash `98c13e41` without changing any stored content. This historical
fixture must remain unchanged when regenerating the current bootstrap pack.
