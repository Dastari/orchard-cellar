# Blob47 and native grass catalogue migration

Stacked on PR #73 at `052f23e1`; assignment #179, coordinated by GoldCondor.
No source changes to the frozen wave-1 branch, merge, deployment or publication.

Hoed soil and authored farmland already produce identical frame indices for all
256 neighbour masks at this base. They will share catalogue-driven blob47 frame
selection. Preserve the dry/wet occupancy distinction and omit the isolated
farmland grass inset exactly as before. Native grass fringes are a different
transition: family ordering, equal-height neighbours, opaque fills and ordered
flat diagonal layers remain distinct from blob47.

The additive interpreter contract supports ordered optional family `layers`, each
with its own mask/fallback selection using the family's roles. An optional
`matchMask` on a mask entry selects relevant neighbour bits; omitted means every
bit in the topology. First matching entry wins. Each layer independently resolves
its first available role; an absent base layer does not suppress later layers.
Existing `resolveRuleFrame` still resolves the base only. `resolveRuleLayers`
returns base then declared layers. Strict validation rejects out-of-range bits,
mask bits outside matchMask, unknown roles and duplicate mask/matchMask pairs.

Runtime source of truth is the committed bootstrap tileset catalogue. This slice
does not implement hot terrain registry replacement or change traversal. Native
terrain neighbour classification stays in the engine adapter; frame selection and
composition move to data. Compile the fixed 256 masks once per family for cache
and per-cell paint work. No random state or allocation-heavy scans in hot loops.

Before implementation, captured SHA-256 layer goldens from the unchanged base:
256 farmland masks; four native grass families against beach, paving and each of
four grass centres; 512 mixed family/height/biome 3×3 grids sampled at all cells.
Existing pre-migration topology and draw tests remain authoritative. Native
catalogue entries remain separate because forcing them through blob47 changes
pixels. Asset extraction's canonical atlas layout is not changed.
