# Complete local reference-library index

This is the coverage index for **every retained file under `references/`**. Revision `11dc70858af9481e` contains 1,146 files (23.6 MiB). The structured [JSON companion](reference-library-index.json) records every path, pack, vendor, licence pointer, use policy, provenance, semantic role, byte size, SHA-256, exact duplicate, format, search terms, domain catalog, and PNG/WebP dimensions.

## Agent lookup order

1. Search this index when the vendor or material type is unknown.
2. Use the [Cute Fantasy sprite index](cute-fantasy-index.md) for semantic sprites, animations, tilesets, collision guidance, and reviewed runtime crops.
3. Use the [Clockwork Raven icon index](clockwork-raven-index.md) for 16 px item/UI sheets, grid sizes, variants, and pack provenance.
4. Open a local `SOURCE.md` or source note only when licensing/provenance detail is needed.

```sh
# Search every retained filename and generated search term
jq -r --arg term 'fishing' '.entries[] | select(.searchTerms | index($term)) | .path' docs/reference-assets/reference-library-index.json

# Find exact duplicate copies and their canonical path
jq -r '.entries[] | select(.duplicateOf != null) | [.path, .duplicateOf] | @tsv' docs/reference-assets/reference-library-index.json
```

## Coverage summary

| Group | Files | Size |
| --- | ---: | ---: |
| `audio` | 4 | 11.5 MiB |
| `authoring-source` | 1 | 843.3 KiB |
| `clockwork-raven-art` | 111 | 3.4 MiB |
| `cute-fantasy-art` | 1018 | 5.7 MiB |
| `design-document` | 3 | 283.0 KiB |
| `generated-concept` | 3 | 1.3 MiB |
| `library-guide` | 1 | 2.8 KiB |
| `orchard-original-art` | 3 | 2.2 KiB |
| `source-capture` | 2 | 629.7 KiB |

- Cute Fantasy domain entries: 1001
- Clockwork Raven domain entries: 111
- Files covered only by this global index: 34
- Exact duplicate groups: 19; additional duplicate copies: 37

Exact duplicates are not automatically mistakes. Pack-local source notes and Free/paid pack overlaps may be retained for provenance. The machine index makes each decision auditable.

## Files outside the two art-domain catalogs

| Path | Group | Use policy | Format | Size | Dimensions | Duplicate of |
| --- | --- | --- | --- | ---: | --- | --- |
| `references/art/kenmi/cute-fantasy/characters/read_me.txt` | `cute-fantasy-art` | `licensed-importable` | `txt` | 381 B | — | — |
| `references/art/kenmi/cute-fantasy/christmas/read_me.txt` | `cute-fantasy-art` | `licensed-importable` | `txt` | 481 B | — | — |
| `references/art/kenmi/cute-fantasy/core/read_me.txt` | `cute-fantasy-art` | `licensed-importable` | `txt` | 663 B | — | — |
| `references/art/kenmi/cute-fantasy/desert/read_me.txt` | `cute-fantasy-art` | `licensed-importable` | `txt` | 377 B | — | — |
| `references/art/kenmi/cute-fantasy/dungeons/read_me.txt` | `cute-fantasy-art` | `licensed-importable` | `txt` | 379 B | — | — |
| `references/art/kenmi/cute-fantasy/free/read_me.txt` | `cute-fantasy-art` | `noncommercial-only` | `txt` | 502 B | — | — |
| `references/art/kenmi/cute-fantasy/halloween/read_me.txt` | `cute-fantasy-art` | `licensed-importable` | `txt` | 480 B | — | — |
| `references/art/kenmi/cute-fantasy/ui/Fonts/CuteFantasy-5x9.ttf` | `cute-fantasy-art` | `licensed-importable` | `ttf` | 5.9 KiB | — | — |
| `references/art/kenmi/cute-fantasy/ui/read_me.txt` | `cute-fantasy-art` | `licensed-importable` | `txt` | 379 B | — | `references/art/kenmi/cute-fantasy/dungeons/read_me.txt` |
| `references/art/kenmi/cute-fantasy/unsliced-icon-sheets/icons1.webp` | `cute-fantasy-art` | `license-review-required` | `webp` | 6.9 KiB | 305×529 | — |
| `references/art/kenmi/cute-fantasy/unsliced-icon-sheets/ores.webp` | `cute-fantasy-art` | `license-review-required` | `webp` | 8.3 KiB | 306×656 | — |
| `references/art/kenmi/cute-fantasy/unsliced-icon-sheets/paint-cloth.webp` | `cute-fantasy-art` | `license-review-required` | `webp` | 7.1 KiB | 349×457 | — |
| `references/art/kenmi/cute-fantasy/unsliced-icon-sheets/potions.webp` | `cute-fantasy-art` | `license-review-required` | `webp` | 5.6 KiB | 661×671 | — |
| `references/art/kenmi/cute-fantasy/unsliced-icon-sheets/resources.webp` | `cute-fantasy-art` | `license-review-required` | `webp` | 14.5 KiB | 349×645 | — |
| `references/art/kenmi/cute-fantasy/unsliced-icon-sheets/satff-weapons.webp` | `cute-fantasy-art` | `license-review-required` | `webp` | 1.7 KiB | 571×382 | — |
| `references/art/kenmi/cute-fantasy/unsliced-icon-sheets/thread-wool.webp` | `cute-fantasy-art` | `license-review-required` | `webp` | 7.6 KiB | 354×604 | — |
| `references/art/kenmi/cute-fantasy/volcano/read_me.txt` | `cute-fantasy-art` | `licensed-importable` | `txt` | 510 B | — | — |
| `references/art/orchard-originals/tools/README.md` | `orchard-original-art` | `project-owned` | `md` | 1.6 KiB | — | — |
| `references/art/orchard-originals/tools/Tool_Icons_Extra_NO_Outline.png` | `orchard-original-art` | `project-owned` | `png` | 278 B | 48×16 | — |
| `references/art/orchard-originals/tools/Tool_Icons_Extra_Outline.png` | `orchard-original-art` | `project-owned` | `png` | 326 B | 48×16 | — |
| `references/audio/music/atlasaudio-calm-nature-510279.mp3` | `audio` | `license-review-required` | `mp3` | 2.8 MiB | — | — |
| `references/audio/music/dark-night.mp3` | `audio` | `license-review-required` | `mp3` | 3.5 MiB | — | — |
| `references/audio/music/leberch-calm-background-375199.mp3` | `audio` | `license-review-required` | `mp3` | 2.9 MiB | — | — |
| `references/audio/music/paulyudin-calm-calm-music-573990.mp3` | `audio` | `license-review-required` | `mp3` | 2.2 MiB | — | — |
| `references/authoring/player/player-main-all.aseprite` | `authoring-source` | `authoring-source` | `aseprite` | 843.3 KiB | — | — |
| `references/documents/design/2.5d-multi-elevation-terrain-system.md` | `design-document` | `reference-only` | `md` | 57.7 KiB | — | — |
| `references/documents/design/minecraft-inventory-slot-stack-system.md` | `design-document` | `reference-only` | `md` | 21.4 KiB | — | — |
| `references/documents/design/orchard-and-cellar-progression-redesign.pdf` | `design-document` | `reference-only` | `pdf` | 203.9 KiB | — | — |
| `references/documents/source-captures/orchard-and-cellar-unminified.js` | `source-capture` | `reference-only` | `js` | 144.4 KiB | — | — |
| `references/documents/source-captures/orchard-and-cellar.html` | `source-capture` | `reference-only` | `html` | 485.3 KiB | — | — |
| `references/generated/concepts/Farmer_Jane_Grave_Concept.png` | `generated-concept` | `concept-only` | `png` | 843.3 KiB | 887×1774 | — |
| `references/generated/concepts/item_cf_plank_pre_generated_2026-08-29.sprite.json` | `generated-concept` | `concept-only` | `json` | 845 B | — | — |
| `references/generated/concepts/Plank_Icon_Generated.png` | `generated-concept` | `concept-only` | `png` | 468.8 KiB | 1254×1254 | — |
| `references/README.md` | `library-guide` | `reference-only` | `md` | 2.8 KiB | — | — |
