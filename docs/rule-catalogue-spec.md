# Rule catalogue groundwork

Implements doc 61 §4's first migration, from origin/main 2e1d9a4f.

The existing tileset content shape gains an optional, independently versioned
`ruleCatalogue` envelope. Its families describe identity, kind, membership,
neighbour predicate, topology, mask-to-role rules in explicit priority order,
role art/behaviour, transforms, weighted variants, seasonal substitutions,
Smart halo/formations and compatible families. A whole family or a role can
explicitly be unavailable with a reason. Existing cliff fields remain unchanged.

Only connect4 consumes the new interpreter in this slice. Runtime object joins
use definition membership and the definition's connectsTo ids/tags, never the
sprite filename. Legacy map prefabs have no object definition id: exact asset
membership from the catalogue is their compatibility adapter. Manual/gate art
stays exact while contributing neighbour occupancy. Spaces, elevation and map
bands remain separate. Studio and game use the same catalogue and index.

Other resolver kinds retain their implementations. Compact committed hashes
pin frame/semantic outputs across all masks and the longer waterfall halo.
These are origin/main baselines; PR #62 deliberately changes some cliff mappings
and must regenerate affected baselines with its reviewed evidence on integration.
No map repair, terrain implementation edits, merge or deployment is in scope.

## Public API and semantics

- `parseRuleCatalogue(unknown)` returns schema v1 or `ContentParseError` with a
  field path. Unknown fields/versions, duplicate masks/families, invalid frames,
  weights/transforms, dangling roles/compatibility and invalid halos fail closed.
- `resolveRuleFrame(family, mask, entropy?, season?)` tries the mask's role list,
  then `fallback`, skipping explicit unavailable roles. A seasonal remap wins
  over deterministic weighted selection; transforms are restricted by the
  family. The result carries the chosen role and movement/light flags.
- `connectedObjectCatalogue(registry.tilesets)` composes active envelopes and
  caches by registry-map identity. No envelope means bootstrap compatibility;
  an explicit empty envelope means no families. Duplicate ids are rejected.
- `connectedObjectDefinitionFamily` first matches exact definition ids, then
  authored identity tags. Sprite names cannot make a live object a fence.
- `connectedObjectIndex(cells, catalogue)` partitions neighbours by position,
  space and elevation. Families must match or be explicitly compatible. For
  `connects-to`, a definition's list matches the neighbour's id or identity tags;
  an empty list connects nowhere. Omitted lists preserve legacy same-family
  behaviour. Map callers also put the draw band into the space key.
- Existing `connectedObjectFamily`, `connectedObjectAsset` and
  `connectedObjectFrame` remain compatibility APIs backed by authored data.
  Unregistered assets no longer join merely by having a matching filename.

The initial catalogue is on `tileset:basic` to preserve the existing content
kind and publication path without inventing placeholder cliff definitions for
fence families. Other tilesets may carry envelopes too; family ids are global.
Current map-prefab compatibility uses the bootstrap catalogue; the live
object renderers consume the active registry. Current rendering retains the
existing summer-art convention. Movement/light flags are schema data in this
slice; authoritative collision remains the object definition's existing data.
Other kinds retain their current resolvers and fields until separate migrations.

## Baseline inventory

`packages/engine/src/rule-catalogue-baselines.json` stores SHA-256 of ordered
frame/semantic results and the asset-name inventory. Its test recomputes output,
never regenerates expected hashes. Inputs cover:

- Every available raised family and grass ledge family, every face profile,
  all 256 immediate neighbour masks, raised/empty centres; complete course and
  variant declarations are pinned separately. Cave walls use the same raised
  family contract. These masks do not claim exhaustive arbitrary distant terrain.
- Seven shore/transition families, blob47, farm soil and authored farmland,
  every 256 neighbour mask, with ordered inset outputs.
- Cave-floor masks for normal/rocky centres, plus patch/decorative variation at
  three seeds across signed coordinates in a 64×64 region.
- Waterfall's six relevant probes (NESW, north/south two cells away), all 64
  masks for present/absent centres.
- All six connect4 families, 16 masks each, and old membership for every
  registered sprite asset. Gate/manual art remains exact and contributes joins.

Future migrations must compare against these fixtures before updating them.
PR #62 changes cliff output intentionally: integrate its reviewed mappings and
refresh only affected expectations with the review evidence, never auto-accept
all hashes. This groundwork does not regenerate the terrain guide or replace
non-connect4 interpreters; those are subsequent P4 family migrations.
