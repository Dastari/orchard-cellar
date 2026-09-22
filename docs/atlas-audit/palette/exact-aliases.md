# Exact path alias filtering

The inventory proves `tile_path` and `tile_cf_path` contain the same full bank of
47 static blob47 frames, with the same source palette, crop size, anchor,
topology, collision and generated placement metadata. Exact Placement previously
showed both banks, producing 94 choices for 47 distinct masks.

`exactTilePaletteChoices` now presents the canonical `tile_cf_path` bank once.
It filters only the displayed palette; both catalogs, stable asset IDs, prefab
IDs and saved object lookups remain intact. Searches for the old `tile_path`
name and “Tile Path” title also find the canonical choices.

This is an explicit, narrowly verified alias. A legacy-only catalog still shows
its available art. Different prefab IDs, renamed choices, changed collision,
transforms, tags, behaviors, presentation or other metadata prevent collapsing
those choices. The source equivalence regression fails if either asset's art or
metadata changes, prompting a new audit of the whitelist.

Other lookalikes are retained. Trapdoor and floor ladder use different layers;
the two waterfall registrations have different anchors and collision; grass
fill aliases have distinct search metadata requiring separate reviewed mapping.
No generic pixel-only deduplication runs in the editor.
