# Static island materialization

Implements doc 61 §2.5.2 steps 1–2 (design PR #63), based on the owner-approved
64×64 curated static region decision. This lane does not change subscriptions,
server schema, publish data, or switch gameplay to chunks.

## Format and architecture

`sim/world-chunk.ts` is an engine-independent binary codec. Each blob begins with
an eight-byte magic/schema marker, a SHA-256 digest, a little-endian metadata
length, canonical UTF-8 JSON metadata, then raw little-endian typed channels.
The digest covers the metadata length, all metadata (including coordinates,
space and asset revision), and every channel byte. The digest is the blob filename.
Every channel has a one-cell halo (66×66), including each collision plane.
Records retain their original ordinal and anchor ownership; loading chunks in a
different order must not renumber generated resource IDs or reorder obstacle lists.
An optional sparse local cell part section reserves authoring compatibility.

A small manifest records dimensions, source revision/hash, asset revision, shared
scalar terrain metadata, channel dictionaries, and immutable chunk heads. No
whole-map generated arrays belong in the manifest. Dynamic resource depletion,
player objects and authoritative entity state remain live data, not static chunks.

`engine/chunk-terrain-store.ts` adapts chunks to today's contiguous `TerrainArray`
interface. This first compatibility store assembles full arrays, with missing
terrain blocked. View pinning, LRU, IndexedDB and bounded-memory renderer changes
belong to the subsequent streaming/runtime-switch lane.

## Verification and handoff

Golden checks compare every reconstructed typed channel, authored record,
generated resource ID, and ordered obstacle list to the existing runtime path.
Client and server collision channels are recorded independently so pre-existing
disagreements cannot be silently normalized during migration.

## Running the offline tool

```sh
npx tsx scripts/materialize-world-chunks.ts --bootstrap --output output/world-chunks/bootstrap
npx tsx scripts/materialize-world-chunks.ts --input /private/path/live-map.json --output output/world-chunks/live
npx tsc -p scripts/tsconfig.world-chunks.json
npx vitest run packages/sim/src/world-chunk.test.ts packages/engine/src/chunk-terrain-store.test.ts scripts/world-chunk-parity.test.ts
```

Input accepts a v3 map document or a published row containing `mapId`, `revision`,
`contentHash`, and `documentJson`. With a document-only input, the tool hashes its
canonical serialization; with a row it retains the supplied revision/hash.
`--content-rows path.json` supplies the matching published content definition rows
(`buildContentRegistry` format); omitting it explicitly uses repository bootstrap
content, **not a claim of parity with the live database's content revision**.

`--atlas-index path/to/atlas.packs.json` resolves the asset lane's `assetPacks`
index into each chunk's stable pack IDs, failing if any asset lacks a mapping.
The atlas-index file hash becomes the asset revision. `--asset-revision revision`
can override it; without either option, the content registry hash is the asset
revision and pack lists are empty. Terrain asset references are deliberately
conservative (all current terrain loader/family assets); decoration references
follow the loader's variant counts and legacy mapping. Trimming terrain to the
visible biome is follow-up work with the asset-pack lane.

The tool always verifies full client/server audit chunks in memory first. The
default delivery export omits server oracle channels and records; `--audit` retains
them for diagnostics. It writes raw `.bin`, gzip level 9 `.bin.gz`, and Brotli
quality 5 `.bin.br` variants plus `sizes.json` with every chunk and aggregate byte
counts. A static server must set the matching Content-Encoding when serving a
compressed variant; hashes refer to decoded bytes. These blobs are not deployed
by this command.

The server oracle selects three function declarations from the current world
source using the TypeScript AST, transpiles only those declarations and runs them
with the same sim functions and a read-only supplied row/content context. It does
not import the SpacetimeDB module, contact a service or alter the world. Renames or
new unresolved dependencies fail the audit instead of falling back to a stale
copy. The command uses the existing release-tool TS boundary because the engine
and UI sources it audits disable `exactOptionalPropertyTypes`.

## Preserved semantics and limits

- Generated resource rows preserve numeric IDs exactly, including decoration
  resource IDs; no chunk-relative IDs are introduced. Live depletion/growth,
  chests, player buildings and other dynamic rows are not baked into static
  collision. The collision oracle captures the static map path with empty live
  entity collections.
- Decoration stream order and the original generated suppression list are both
  retained. Collision applies the same suppressions and authored landmark
  replacement as `refreshCollision`. Renderers must still apply the stored
  suppression list to retained decoration rows.
- Transitions, stairs, map objects, landmarks, scenery, anchors, resource
  placements, prefab definitions, layers, entity edits and combat regions survive.
- Negative chunk coordinates are supported by the codec. The compatibility store
  currently represents the existing finite, zero-origin island only.
- A source containing cell parts is rejected if this checkout's map parser drops
  them. After PR #66 is integrated, the materializer preserves their optional
  local section; it never silently exports a lossy pre-parts interpretation.
- Custom authored tileset resolvers can be supplied as the second store constructor
  argument, from the same content registry as the export. The store allocates full arrays to satisfy today's interface and blocks missing
  cells. Full collision reconstruction requires every chunk. Actual subscription
  switching, view pins/LRU/IndexedDB and generator removal remain later steps.

## Session evidence and next integration gate

Bootstrap and the local `output/doc60/map-activation-20260911/live-map-after.json`
fixture each produced 169 chunks with all typed-channel, ordered-record and
collision reconstructions passing. The private map itself is not committed.
Bootstrap ground client/server arrays match; their water arrays differ in the
current source and are preserved independently. Source goldens are pinned in
`scripts/world-chunk-goldens.json`, generated from the existing path before any
runtime changes. The baseline fixture is the repository bootstrap map, so CI does
not need access to the private snapshot.

Next gate: integrate the cell-part and atlas-pack PRs, regenerate against the
exact published content rows and asset index, resolve any pre-existing collision
differences explicitly, then design shadow chunk heads and bounded-memory terrain
access. Do not replace the live world document or publish from this lane.

### Measured authored-map delivery (2026-09-23)

Using bootstrap content `0f06c798`, the local authored snapshot hash
`c851a3b53af198a5f2a4a8ae8282c8e676a71fc6eacadc724d12c589e3059a45`, and
SageIsland's separate `atlas.packs.json` index, all 169 chunks resolved pack IDs
and passed both audit and delivery parity. The manifest is 82,693 bytes.

| Encoding | Total chunk bytes | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Raw | 25,479,885 | 121,546 | 121,547 | 731,973 |
| gzip level 9 | 648,207 | 1,198 | 1,239 | 40,027 |
| Brotli quality 5 | 496,898 | 905 | 929 | 27,598 |

Including the **uncompressed** manifest, totals are 730,900 bytes with gzip or
579,591 bytes with Brotli. These are offline file sizes, not network timing or
first-play measurements. Delivery still includes compatibility client collision
copies; server oracle copies are absent.

For this snapshot every ground collision array agrees between client and server.
The water blocked masks differ at **15 cells**; the server also emits an explicit
all-false horse-jump water mask while the client omits that optional field. The
migration preserves these source behaviors and does not resolve them implicitly.

Public entry points: `encodeWorldChunk` / `decodeWorldChunk` from
`@orchard/sim/world-chunk`; `ChunkTerrainStore` from
`@orchard/engine/chunk-terrain-store`. Construct from a manifest and optionally
its content's tileset resolver, call `install(bytes)` in any order, inspect
`hasTile`/`complete`, and request `collision('clientGround'|'clientWater')` only
once complete. Audit manifests additionally support the two server collision
views. `chunkAt` retains the halo and optional cell-part payload for later consumers.
