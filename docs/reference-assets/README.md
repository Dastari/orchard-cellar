# Reference-asset discovery

The owner-supplied `references/` library is searchable without opening every source
sheet. Use the indexes in this order:

1. [`reference-library-index.md`](reference-library-index.md) covers every retained
   file and is the best starting point when the vendor or asset family is unknown.
2. [`cute-fantasy-index.md`](cute-fantasy-index.md) adds sprite, animation, tileset,
   collision, semantic-crop, and runtime-asset guidance for Kenmi Art sources.
3. [`clockwork-raven-index.md`](clockwork-raven-index.md) adds pack keywords, grid
   geometry, variants, and provenance for native 16 px item/UI icon sheets.
4. [`kenmi-premium-icons.md`](kenmi-premium-icons.md) lists the nine premium icon
   categories and links every one of the 6,982 vendor icon numbers to native-sheet
   coordinates in its JSON companion.
5. Inspect the selected source sheet, then import only the reviewed semantic region
   into the text-grid asset pipeline. Reference sheets themselves are not shipped.

The JSON companions are the agent-friendly source of truth. A record's
`usagePolicy` is a gate, not a licence grant: `license-review-required` material must
not be imported until its rights are confirmed, and `noncommercial-only` material
must be replaced or separately licensed before a commercial release.

Regenerate all three catalogs after changing `references/`:

```sh
npm run document:references -w @orchard/tools
npm run check:references -w @orchard/tools
```

The check fails for corpus drift, stale hashes or dimensions, undeclared layout
groups, empty directories, and family-catalog paths that no longer exist.

Generated tool-progression review artwork under `references/generated/tool-progression/`
is catalogued as concept-only alongside `references/generated/concepts/`.

During the premium-icon intake, the uncatalogued temporary `references/tmp/image.png`
was preserved at `output/reference-library-inbox/tmp/image.png`. Its source and
licence are unknown; it is outside the curated library pending identification.
