# Studio multi-space backend (F4)

Status: implementation; owner-authorized wave 2, separate review before merge.

Studio must discover every current space, query entities in a selected area
without losing results behind a space-wide scan cap, and retain player presence
when the viewport changes. This implements the backend/data portion of doc 62 F4
and supplies F5 picker sources. The visual multi-space canvas is a later lane.

## Contracts

- A shared registry resolves revision-bound static definitions, persisted
  homestead exterior/residence/cellar definitions, active rogue rooms, ownership,
  dimensions and outgoing portal links. Never substitute bootstrap definitions
  for removed live content. Private rogue rows are projected only through an
  admin-authorized procedure; private run state is not subscribed publicly.
- Area pages use `(space, chunkX, chunkY, id)` indexes and an opaque cursor bound
  to bounds and filters. Each call scans at most 2,048 rows and returns at most
  100 entities; continuation advances past the last scanned row, including when
  filters match nothing. Requested inclusive area is limited to 16,384 tiles.
  Include active crops. T11 retired private farm parcels are not active authority;
  homesteads supply farm identity and dimensions instead.
- Existing array procedure remains compatible. New consumers use explicit pages.
  Invalid coordinates, filters or cursors fail without scanning unrelated spaces.
- Studio viewport queries take a u16 space id. All-space player presence belongs
  to stable metadata, independent of the selected viewport. Space routes use
  `/build/map/space/<id>` and a discriminated reference distinct from editable
  document ids. Non-document terrain uses the existing `terrainForSpace` path
  read-only. Container writes retain server dry-run, version and fingerprint
  gates; no alternate mutation authority is introduced.

## Acceptance

Tests cover revision-bound static spaces, homestead expansion/cellar dimensions,
active rogue rooms, portal links, cursors over dense chunks, off-area populations,
empty filtered pages, forged/stale-scope cursors, all-space presence and viewport
switches. Run focused tests, project typecheck/lint/content checks and builds.
Deliver through a PR; no deployment or merge in this assignment.
