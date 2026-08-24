# Runtime asset contract

The asset pipeline is authoritative for visual definitions. SpaceTimeDB is
authoritative for world and player state, and stores references to visuals as
numeric IDs. Purchased source PNGs and atlas pixels are never copied into the
database.

## Generated artifacts

`npm run assets:build` writes these client-local files:

- `packages/client/public/generated/atlas.meta.json` — atlas coordinates,
  collision shapes, animation frames, semantic tags, placement metadata, and
  the `assetId -> name` lookup.
- `packages/client/public/generated/asset-registry.json` — the compact catalog
  intended for world-building tools and import/seed generation.
- `atlas_<category>_<season>.png` — versioned-by-manifest visual data.

Run `npx tsx packages/tools/src/catalog-cute-fantasy.ts` to scan every
`references/Cute_Fantasy*/**/*.png`. The scanner writes
`build/cute-fantasy-catalog/catalog.json`, `authoring-registry.json`, review HTML,
and extraction recipes. Those files are discovery inputs only. An asset becomes
runtime-authoritative only after it has a reviewed semantic file under
`packages/assets/` and is included by the atlas build.

## Stable IDs and revisions

- ID `0` is permanently reserved for `system_missing_asset`.
- Every other asset ID is FNV-1a 32-bit over the UTF-8 semantic asset name
  (for example `tile_cf_grass`). Renaming an asset is therefore a migration;
  visual changes without a rename keep the same ID.
- `revisionId` is FNV-1a 32-bit over `atlas:<content revision>`. Store or compare
  it when protocol compatibility matters; do not use it as an asset ID.
- The build rejects ID collisions.
- A client that receives an unknown/newer ID renders asset `0` instead of
  failing a subscription or dropping the world object.

## SpaceTimeDB row shape

Use normalized scalar columns that can be indexed and subscribed by region.
Recommended references are:

| State | Required asset fields | Subscription/index key |
| --- | --- | --- |
| tile/chunk cell | `assetId: u32`, `variant: u16`, `rotation: u8`, `flags: u32` | `chunkKey` |
| placed object | `assetId: u32`, `variant: u16`, tile transform, `state: u8`, `flags: u32` | `chunkKey` |
| crop instance | `cropDefinitionId`, visual `assetId` or growth-state ID | parcel/chunk key |
| shop offer | `offerId`, `assetId: u32`, price/currency, active flag | shop/category key |
| player unlock | owner identity, `assetId: u32`, source offer | owner identity |

Keep tags and offer/unlock rows normalized if the server must query them. Do
not put queryable tags into an array column. Common collision/gameplay state
should use explicit scalar fields or bit flags; detailed pixel collision stays
in the client manifest. World reducers should validate gameplay permissions and
placement rules, but they should not need atlas coordinates or image bytes.

The TypeScript client entry points are `loadGeneratedAssetById` (safe runtime
resolution) and `loadGeneratedAssetRegistry` (revision negotiation/tooling).
The database module has no runtime filesystem or network dependency on these
files; seed/import code must compile or submit only the IDs and metadata it
actually needs.
