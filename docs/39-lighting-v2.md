# 39 — Lighting v2: One Height-Aware Light Field

Proposal for owner review (2026-08-26). Supersedes the *implementation
architecture* of [27-lighting-design.md](27-lighting-design.md) phases 1–3 while
keeping its aesthetic charter, lunar cycle, budgets, and phase 4–7 feature list
intact — v2 is *how* those features get built, not a new wishlist. Doc 27's
look rules stay binding: quarter-tile texels, 8-bit bands, per-channel max
merge, one multiply composite, no radial gradients, Canvas 2D
([21-unified-renderer.md](21-unified-renderer.md)).

## 1. Why a v2 — what the current build gets wrong

The night screenshot (lantern in a forest, Autumn 6, 03:51) shows the three
symptom classes, and the code audit explains each one:

1. **Shadows are the wrong shape.** Tree columns are full-opacity,
   constant-width, and `TRUNK_SHADOW_LENGTH_TEXELS = 64` long — 16 tiles of
   hard black ribbon from a 2-tile-tall tree (`light-flood.ts:16`,
   `castTrunkShadows`). Umbra length has no relationship to blocker height or
   light height, so a lantern at knee height throws the same shadow as the
   noon sun. There is no penumbra: DECISIONS #125 promised "short feathered
   trunk-only ground shadows"; neither *short* nor *feathered* shipped.
2. **Front faces and the ground disagree.** Whether a sprite's visible
   (south) face is lit is decided by `southFacingReceiverBrightness`
   (`lighting.ts:98-127`) — a *second, parallel falloff model* (its own octile
   distance, its own strength curve, no occlusion test) driving a
   `ctx.filter = brightness(...)` per sprite. The flood says one thing about
   the texels at a tree's foot; the filter says another about the tree. That
   is why the canopy beside the player reads near-black while the ground
   under it glows.
3. **"Behind vs in front" is smeared across five mechanisms.** Symmetric
   shadowcast visibility, trunk ray-march columns, the cliff-face Bresenham
   relight (`frontFaceHasClearLine`), receiver-owner masks, and the sprite
   brightness filter each answer a slice of the same question — "does this
   light reach this surface?" — with different math. Five answers means
   seams: fix a leak in one and another regresses.

Underneath the symptoms, the audit found structural debt:

- **Occlusion is not authored, it's inferred.** Nothing in any tile or
  sprite JSON says "I block light." Topside blocking is derived from cliff
  roles at runtime (`light-occlusion.ts:117-136`); which *entities* occlude
  is a hardcoded switch with prose-comment exceptions in
  `overworld-main.ts:531-645`. Every new prop, tile, or building is a code
  change in the wrong file.
- **There is no height.** `LIGHT_HARD_BLOCKER` is binary. Doc 27 §5's
  `terrainHeightAt` containment, rim spill, and cliff drop-shadows (phase 4)
  were never started, and buildings-as-height-blocks
  ([35-homesteads-and-farming.md](35-homesteads-and-farming.md)) have no
  representation at all.
- **The promised read-back doesn't exist.** `sampleLight` — doc 27 §8's "one
  sanctioned read-back" — appears nowhere in the codebase, which is exactly
  why the sprite pass grew its own falloff model.
- Vestigial paths: soft attenuators (always empty in production,
  `overworld-main.ts:663`), `stampPointLight` (tests only), the unused
  `pulse` profile, `footX`/`receiverFacing` fields set but never read.

## 2. The v2 model — three invariants

Modern top-down 2.5D games (Core Keeper, Graveyard Keeper, Necesse-class
engines) converge on the same shape: the world is a 2D grid **with an integer
height per cell**; one light field is computed on the ground plane with
height-aware occlusion; vertical surfaces (sprite fronts, wall faces) are lit
by **sampling that same field at their foot line**, gated by a facing rule.
v2 adopts that shape as three binding invariants:

1. **One flood.** A single quarter-tile flood is the only source of light
   truth. It emits the ground RGB field **plus the derived face buffers of
   §5** — derived *inside* the flood, per light, before the lossy max merge
   (a max-merged field cannot be decomposed back into per-light directions
   afterwards). `sampleLight(worldX, worldY)` and `sampleFaceLight(face, x, y)`
   (CPU array reads, never canvas read-back) are the only read-backs; ground
   multiply, sprite face lighting, water glints, lit rain, and F3 all consume
   them. No consumer may re-derive falloff or facing.
   `southFacingReceiverBrightness`'s parallel model is deleted.
2. **Height everywhere.** Every occluding texel carries an integer
   **light-height** `H` (u8, tile-height units; 0 = open ground) in one
   merged grid, and every emitter carries a height `hₑ` plus the terrain
   level it stands on. Terrain cliffs, building wall blocks, props, and tree
   trunks all express themselves as heights in this one grid — there are no
   more per-kind blocker classes with per-kind shadow code.
3. **Faces sample the field.** A sprite or wall face is lit by
   `sampleLight` at its **ground foot line**, times a facing gate
   (light-in-front test), never by independent math. "Light behind an object
   lights nothing but still casts its shadow" and "light in front lights the
   face" become two outcomes of one rule instead of two subsystems.

Everything else in this doc is the concrete rollout of those three.

## 3. Authored occlusion data (replaces inference and hardcoding)

Light behaviour moves into asset metadata, validated at load, with the
runtime inference kept only as a fallback during migration.

**Tile definitions** (`*.tile.json`, and the tileset face-profile rows in
`terrain.ts`) gain an optional `light` block:

```jsonc
"light": {
  "occlude": "none" | "wall" | "face",   // default "none"
  "height": 1                            // tile-height units; required if occlude != none
}
```

- `wall` — opaque volume: receives light on approach, never propagates
  (today's `LIGHT_HARD_BLOCKER` + height).
- `face` — the visible south artwork of a wall/cliff row: opaque to
  propagation but a **receiver** relit by lights south of it (today's
  `LIGHT_CLIFF_FACE_BLOCKER`, generalized so building fronts use the same
  class as cliff fronts).
- Terrain keeps deriving cliff-role heights procedurally (the generator knows
  Δelevation), but through the *same* `occlude/height` record type, so
  authored building tiles and generated cliffs are indistinguishable to the
  flood.

**Sprite definitions** (`*.sprite.json`) gain:

```jsonc
"light": {
  "caster": "none" | "silhouette" | "column",  // column = collision-AABB only (trees)
  "casterHeight": 2,                            // drives shadow length, §4
  "receiver": "flat" | "south" | "omni"         // flat = ground decal, no face pass
}
```

`elevatedLightOccluders()` / `treeLightOccluders()` in `overworld-main.ts`
shrink to a loop that reads these records; the pond/emitter/growth-stage
exceptions become data (`caster: "none"` on ponds, emissive props authored
with `caster: "none"`, tree sprites per growth stage). The
[asset-discovery / pixel-art] pipelines validate the block; a sprite that
blocks traversal but declares no `light` block is a build warning, not a
silent guess.

## 4. The height-aware flood (one shadow mechanism, not three)

`QuantizedLightFlood` keeps its bones — bucket queue, octile cost, LUT fast
path, symmetric shadowcast, epoch buffers, per-channel max — and changes what
"blocked" means:

- **Occlusion grid** becomes two parallel arrays: `heightBlocks: Uint8Array`
  (0 = open) and `flags: Uint8Array` (bit: face-receiver; bit: caster-owner
  present). The five `LIGHT_*` classes collapse into height + flags.
  Trunk/receiver owner maps stay as-is (they already work).
- **Emitter height.** `PointLight` gains `heightUnits` (lantern carried ≈ 1,
  standing torch ≈ 1, campfire ≈ 0.5, future sconce ≈ 2) and
  `terrainLevel` (from `terrainHeightAt` at the emitter foot — doc 30 §3's
  contract, consumed not re-derived). Effective source height
  `hₑ = terrainLevel + heightUnits`.
- **Blocking rule** during shadowcast: texel occludes iff
  `terrainLevel(texel) + heightBlocks(texel) > hₑ` **or**
  `terrainLevel(texel) > emitter.terrainLevel` (upward steps block from
  below — doc 27 §5.1's containment falls out of the same comparison; no
  separate phase-4 system needed). Doorways author `height: 0` → spill
  through doors survives by construction.
- **Finite, feathered umbra.** A blocker of height `H` at distance `d`
  texels from the light shadows the ground for
  `L = clamp(H × d / max(1, hₑ_texels − H_texels), MIN_SHADOW, H × SHADOW_PER_UNIT)`
  — the similar-triangles projection every 2.5D engine uses, degraded to
  integer math and clamped so a tree (`casterHeight: 2`) throws roughly
  4–6 tiles, not 16. The final quarter of `L` and a 1-texel side apron
  render at half opacity (two-band penumbra — still chunky, still
  deterministic, golden-testable). `TRUNK_SHADOW_LENGTH_TEXELS = 64` and the
  constant-opacity column die. This one projection serves trunk columns,
  prop silhouettes, *and* (in phase 4 terms) cliff drop-shadows — the
  ray-march and the Bresenham cliff test are deleted; shadowcast visibility
  over the height grid is the only occlusion query.
- **Rim spill** (doc 27 §5.1): a light whose `hₑ` exceeds a downward edge
  spills 2–3 texels down the face before the height comparison blocks it —
  implemented as a fixed post-pass on face-flagged texels adjacent to lit
  rim texels, not a flood special case.

Merge rules, fractional seeding, flicker, the halo pass, caching keys, and
the LUT fast path (now gated on "no texel in region has
`heightBlocks > 0`", using the existing prefix table) are untouched.

## 5. Face lighting — gated face buffers, accumulated before the merge

**Why the obvious formula is wrong.** The ground field is a per-channel
`max` merge — a lossy aggregation that forgets which light contributed each
channel. Any facing gate applied *after* sampling therefore multiplies the
front lights' facing weight against whatever light happens to dominate the
foot texel: a bright torch north of a tree plus a dim lantern south of it
would light the tree's face at torch intensity. Facing must be resolved
**per light, at stamp time, before the merge**, while the contributor is
still known.

**Design.** The flood emits, alongside the ground RGB field, one **face
buffer** per declared receiver-normal class. v2 ships exactly one class,
`south`; `omni` receivers read the ground field directly; `flat` receivers
skip the pass. Each face buffer is luma-only `Uint8`, same texel grid, same
band quantization, same scalar max merge:

- When a light stamps a texel it also writes
  `band × southGate(lightFoot, texel)` into the south buffer, where
  `southGate` is the existing frontDot band curve evaluated **per texel**
  (`dy = lightFootY − texelWorldY`, `frontDot = dy / octileDistance`, mapped
  through the ±0.35 band). The gate is a pure function of the light foot and
  the texel position, so it needs no knowledge of future receivers.
- Because the write happens inside the flood, occlusion, owner masks, and
  fractional seeding apply for free: a light behind a wall stamps nothing,
  fixing today's missing occlusion test in the sprite filter.
- The per-sprite pass collapses to two array reads and zero per-light loops:

```
fieldLuma = luma(sampleLight(footX, footY))
frontLuma = sampleFaceLight('south', footX, footY)
target    = max(ambientLuma, frontLuma)          // ambient always reaches the face
brightness = target / max(fieldLuma, 1)          // ≤ 1 since gated ≤ ungated
```

  The screen-wide multiply then delivers `fieldLuma`; the filter corrects it
  down to `target` — exactly the front-arriving light, per contributor.
- **Why not a dominant-direction (moment) buffer:** summing `luma × dir`
  per texel cancels for opposed lights — two torches flanking a campsite
  north and south would zero the direction while the south torch should
  fully light the face. Per-normal gated buffers are immune, and the buffer
  count is bounded by authored face classes (realistically S/E/W plus omni),
  not by light count.
- **Color caveat (accepted for v2):** the multiply tints sprite pixels with
  the ground field's *color*, and a scalar filter cannot retint, so a face
  may carry a behind-light's hue at front-light intensity. This matches
  v1's behaviour; per-face RGB buffers are the declared extension if it ever
  reads wrong in review.
- Behaviour at the two poles is unchanged from the intent stated before:
  light exactly behind (`frontDot ≤ −0.35`) stamps zero into the south
  buffer — the face stays ambient while the object's silhouette still casts
  via §4; light in front stamps fully; lateral blends across the band.
- Cost: +1 byte per texel per face class (~45 kB for `south`), one extra
  multiply-add per stamped texel. Receiver-owner masking (own umbra never
  darkens own elevated sprite) is unchanged.

Acceptance for the screenshot bugs: the tree east of the player, lantern to
its west-southwest, renders a lit front face; walk *north* of the same tree
and its face drops to ambient while its shadow column appears on the north
side — same tree, same rule, opposite outcomes.

## 6. Buildings from height blocks

With §3 + §4 in place, buildings need **zero lighting code**:

- A building is authored (or generated by the homestead system, doc 35) as
  footprint tiles with `occlude: "wall", height: 2..4`, a south row of
  `occlude: "face"` tiles sharing the wall height, and `height: 0` door
  tiles. Interior floor tiles are open.
- A lantern outside lights the south face (face receiver, light in front),
  throws a finite roof-scaled shadow behind the building, and spills through
  the door. A light inside pools on the floor, spills out the door, and
  lights *nothing* outside the walls — all from the height comparison.
- Windows later: `occlude: "wall", height: 2` with a `transmit` per-mille
  field is the reserved extension (re-using the soft-attenuation code path
  we otherwise retire) — noted here so the schema leaves room, not built now.

## 7. Pipeline, deletions, and the WebGL escape hatch

Composite order is unchanged (world depth queue → multiply lightmap → halo →
UI; doc 21 stays binding). What changes:

- **New:** `sampleLight(x, y)` and `sampleFaceLight(face, x, y)` on
  `TileLightmap` (bilinear over the CPU field and §5's face buffers,
  sub-tile coords — doc 27 §12's round-trip test finally has a subject).
  Water glints and lit rain (phases 7) consume `sampleLight` unmodified.
- **Deleted:** `southFacingReceiverBrightness` + its octile twin;
  `castTrunkShadows` ray-march; `frontFaceHasClearLine`;
  `LIGHT_SOFT_ATTENUATOR` production path (schema slot reserved per §6);
  `stampPointLight`/`fillLightmap` legacy stampers (tests re-targeted);
  the unused `pulse` plumbing (re-add when an asset uses it); hardcoded
  occluder switches in `overworld-main.ts`.
- **Future-proof seam:** the field build (occlusion grid + flood) is already
  DOM-free; v2 finishes the split by moving the two
  `document.createElement('canvas')` uses (`lighting.ts:233`,
  `light-occlusion.ts:89`) behind the renderer module, so a later WebGL2
  backend swaps the *composite* (field → texture, multiply → shader) without
  touching the field, exactly the doc 21 escape hatch. The height grid is
  likewise the input a GPU shadow pass would want — nothing in v2 paints us
  into Canvas 2D.

## 8. Migration phases

Each phase lands green on its own; goldens re-bake once per phase, never
mid-phase.

1. **v2.0 — `sampleLight` + face unification.** Implement `sampleLight` and
   the south face buffer accumulated inside the *existing* flood (no height
   yet); rewrite the sprite pass per §5 as the two-read form. Deletes the
   parallel falloff and every per-sprite light loop. Fixes symptom 2 (unlit
   front faces) and the behind-a-wall sprite leak immediately. Goldens:
   `39§5` per-texel gate curve, sample round-trips, and the
   **behind-dominant fixture** — bright torch north of a receiver, dim
   lantern south: face brightness must equal the lantern's gated
   contribution, not the torch's (the case a post-merge gate gets wrong);
   before/after pair of the screenshot scene.
2. **v2.1 — height grid + unified shadows.** Merge occlusion into
   `heightBlocks` + flags; emitter heights; finite feathered umbra (§4);
   delete trunk ray-march and cliff Bresenham. Fixes symptom 1 (shadow
   shape). Goldens: `39§4` projection lengths vs (H, d, hₑ), penumbra bands,
   wall containment, door spill, cliff-face relight parity with today.
3. **v2.2 — authored data.** `light` blocks in tile/sprite JSON, loader
   validation, registry replaces `overworld-main.ts` switches; terrain
   cliff-role derivation re-expressed through the record type. Pure
   refactor: rendering output must be byte-identical (assert against v2.1
   goldens).
4. **v2.3 — terrain levels.** Wire `terrainHeightAt` into emitters and the
   blocking rule; rim spill post-pass. Doc 27 phase 4 (containment,
   drop-shadows via §4 projection) closes here.
5. **v2.4 — buildings.** Homestead structures author height blocks (§6);
   two-client test that a remote player's interior light spills identically.
6. Doc 27 phases 5–7 (directional sun shadows, global events, glints/rain)
   proceed as specced, now on one substrate — the sun becomes an ordinary
   infinite-height directional caster over the same height grid.

## 9. Performance

Doc 27 §10 budgets stand (≤1.5 ms at 40 lights, no per-frame allocation;
`LIGHT_TEXELS_PER_TILE = 2` remains the only sanctioned lever). Height
comparisons add one array read per shadowcast visit; the finite-umbra clamp
*shrinks* shadowed texel counts versus today's 64-texel columns. The
40-max-radius-campfire pathological rebuild stays a reported outlier; v2
adds no new cliff. F3 gains `heightGridRebuilds` and per-phase field ms.

## 10. Bookkeeping on adoption

- **DECISIONS.md:** (1) one light field with `sampleLight` as sole read-back
  supersedes the per-sprite parallel falloff (2026-08-26 #125's
  receiver-brightness clause); (2) integer light-height grid supersedes the
  five texel blocker classes and DECISIONS #102's soft-attenuator design
  (schema slot reserved); (3) finite similar-triangles umbra with two-band
  penumbra supersedes constant 64-texel trunk columns; (4) light occlusion
  is authored asset metadata — inference from collision or hardcoded lists
  is retired.
- **docs/27:** mark §3's mechanism prose superseded by this doc; §5 phase 4
  redirected to §§4/8 here; aesthetics/budgets/tests remain binding.
- **docs/30 §3 / docs/35:** annotate as height providers for the §4 grid.
- Art/asset tickets: `light` blocks for existing blocking props, trees per
  growth stage, and cliff tileset rows (mechanical, scriptable first pass
  from current inferred behaviour so v2.2 starts byte-identical).
