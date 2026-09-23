# Orchard UI asset loading

`loadGeneratedAsset(name, season?, markerOverrides?)` preserves the existing
consolidated category delivery by default. A fresh page opened with
`?atlasPacks=1` opts into semantic packs; delivery mode is fixed on the first asset
request. This flag is for integration/testing until the gameplay visible-art
collector replaces the eager art factory. It must not become the default simply
because the pack build exists.

- `atlasPackIdsForAssets(names)` reads `/generated/atlas.packs.json` and returns
  sorted distinct semantic pack IDs, rejecting unknown names.
- `loadAtlasPacks(packIds, season = 'summer')` reads the same small index and
  fetches only those immutable metadata files and seasonal page images. It uses
  the shared bounded request queue and URL promise deduplication. Failed pack
  requests are evicted for retry. This is the chunk pin/ring prefetch hook; it
  does not change the ordinary loader's delivery mode.
- `loadGeneratedAssetCatalog()` is an explicit complete authoring metadata load.
  Under pack delivery it loads all pack metadata, including local recolour data,
  without downloading all page images. Studio's default catalog stays compatible.

Pack schema 1 binds `packId`, asset records, bounded page descriptors, and original
and shadow-omit seasonal references. Index schema 5 binds asset→pack and
pack→SHA-256 JSON filenames. Pack bytes exclude the global release revision, so an
unrelated asset edit cannot rename existing pack metadata/images. Actual semantic
asset names/numeric IDs are retained; rectangles are never content identity.

Only `/generated/atlas-<64 hex>.png` and `/generated/pack-<64 hex>.json` without
query parameters enter the persistent worker cache. Index/category metadata stays
in the versioned shell cache. Deploy dependencies before the mutable index, retain
old immutable files for active sessions/rollback, and preserve the normal worker
update flow. Browser cache eviction does not replace origin artifact retention.
