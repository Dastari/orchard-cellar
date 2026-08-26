---
name: asset-discovery
description: Locate existing Orchard & Cellar game entities, tiles/tilesets, resources/items, skill icons, props, buildings, sprites, or animation sets. Use whenever an agent is hunting for visual game content, choosing source art for a gameplay concept, or deciding whether an asset should be a tile, blocking tile, entity, colliding entity, trigger, equipment layer, UI element, or effect.
---

# Asset Discovery — Orchard & Cellar

Start with the committed Cute Fantasy source index instead of browsing licensed
folders image by image:

- `docs/reference-assets/cute-fantasy-index.md` is the searchable human guide.
- `docs/reference-assets/cute-fantasy-index.json` is the structured source of
  file paths, aliases, dimensions, grid geometry, animation sets, reviewed runtime
  crops, intended use, collision guidance, duplicates, and tileset contracts.

## Find an asset

Search ordinary names and synonyms first:

```sh
rg -ni 'boat|ship|sword|blade|flying skull|carrot' docs/reference-assets/cute-fantasy-index.md
```

For an exact structured term:

```sh
jq -r --arg term 'carrot' \
  '.entries[] | select(.searchTerms | index($term)) | [.source, .layout, .animationSets, .reviewedAssets, .use, .collision, .tileSet] | @json' \
  docs/reference-assets/cute-fantasy-index.json
```

Try broader nouns and aliases when there is no exact match: object class, material,
biome, action, creature family, weapon/tool family, and likely spelling variants.
The index already normalizes common pack misspellings such as `swordman`,
`kapybara`, and `lillypad`.

## Use the result correctly

1. Prefer an entry's **Known reviewed contents**. Search its semantic name under
   `packages/assets/`; reuse its approved source regions and metadata instead of
   extracting the licensed sheet again.
2. Treat `layout.confidence` honestly. `verified` and `family` layouts have known
   conventions. Visually inspect `inferred` layouts. A `review` entry explicitly
   forbids assuming every 16px cell is a complete frame.
3. Follow `use` and `collision` as the default gameplay classification. Collision
   is semantic—a small foot/footprint collider or terrain role—not opaque pixel
   bounds. Stateful doors/gates, hazards, flying entities, cliff feet, and inverse
   overlays have special guidance in the index.
4. For an environment source, read `tileSet` and the index's Environment tile-set
   contracts. Blob terrain, shore banks, animated shores, bridges, mixed biome
   sheets, and raised cliffs are different topologies. Never feed a mixed sheet to
   one row-major autotiler.
5. Raised terrain must use `packages/sim/src/raised-terrain-autotile.ts` and the
   matching `RaisedTerrainTileSet`. Do not invent local neighbour tests, collapse
   layered faces into one tile, or mix cliff palettes inside a boundary.
6. For modular player art, use the 56-row table in
   `docs/11-asset-pipeline.md`. The companion Aseprite metadata in the index is
   authoritative for layer order only; its eight timeline frames are not eight
   animation sets.

If several candidates remain, report their source paths and classification tradeoff
before choosing. If an entry is still discovery-only or uncertain, inspect the source
image and preserve that uncertainty in new metadata rather than promoting a guess to
an authoritative frame map.

## Import boundary

The `references/` PNGs are licensed source material. Never commit copied source
sheets or runtime PNG crops. Import only the needed semantic region through the
text-grid asset pipeline in `docs/11-asset-pipeline.md`, then render, visually review,
validate, and record `sourcePath`/`sourceRegions`. Use the `pixel-art` skill as well
when creating or editing a runtime visual asset.

After the reference corpus or reviewed source mappings change, regenerate the index:

```sh
npm run document:cute-fantasy -w @orchard/tools
```
