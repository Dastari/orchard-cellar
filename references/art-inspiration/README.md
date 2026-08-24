# Visual benchmarks (progress-comparison images)

Screenshots of Stardew Valley supplied by the project owner as the **quality bar**.
Usage policy (binding, see docs/11-asset-pipeline.md §6): study and compare only —
never copy pixels from these, never ship them, never place them in `packages/assets/`.
They are the *discipline* target, not the source material; our own look is defined
by docs/10-art-style-guide.md and its palette.

How to use them: when a milestone produces something visual, Read the relevant
benchmark AND your own screenshot in the same session and compare honestly —
density of ambient detail, readability of silhouettes, color warmth, prop
grounding (shadows/outlines), UI weight. Log a one-line verdict in the milestone's
roadmap notes ("cellar reads ~70% as alive as the keg benchmark: missing floor
texture clusters and wall-edge shading").

| File | What it benchmarks | Compare at |
|---|---|---|
| `benchmark-farm-exterior-midzoom.png` | The canonical target: farmhouse + crop rows + paths + well at gameplay zoom; overall warmth and per-tile detail budget | M3 (farm alive), M8 |
| `benchmark-farm-overview-layout.jpg` | Whole-map composition: how buildings, fences, pond, tree borders, and open ground balance across a full farm | Estate map authoring in M3 |
| `benchmark-wilderness-terrain.webp` | Terrain variety and organic edges: grass↔dirt transitions, ponds/shorelines, stumps, logs, bushes, blossom accents; also toolbar UI weight | Autotiles + uncleared-land zones in M2–M3 |
| `benchmark-character-props-closeup.jpg` | Character/prop proportions and grounding at close range: avatar + dog scale, porch/wood textures, baskets, leaf particles, speech bubble | Avatar & props in M2, dog in M8 |
| `benchmark-autumn-crops-animated.gif` | Seasonal recolor strength (autumn), planted-row rhythm and readability, NPC-among-crops staging | Season remaps + orchard rows in M3–M4 |
| `benchmark-interior-kegs.webp` | Interior density: rows of kegs/casks, planters, floor tile texture, wall/window framing — closest analog to our cellar | Cellar interior in M3, M5 |

Note the gif is animated; static Reads show one frame — that's sufficient for
composition/palette comparison.
