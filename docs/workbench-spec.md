# Two-tile crafting workbench

The workbench must be visibly a dedicated crafting station: a two-tile-wide oak
bench with vise, hand tools and a lower plank shelf, in the game's low-resolution
pixel palette. Replace the table-derived sprite with an AI-generated source and
its reproducible game sprite. Retain the existing workbench asset ID for authored
and placed references. Its sprite and collision occupy two horizontal tiles;
placement and interaction must recognize the complete footprint.

E opens the existing crafting interface through the world interaction provider.
With free hands and no active selected-item action, F picks up the workbench as a
carried entity; F puts it down after validating both destination tiles. An axe
can dismantle it through the existing authored damageable pipeline, returning the
recipe's four planks after three valid strikes. Existing world modification,
landmark, mount, durability, vigour and custody checks remain authoritative.

No new storage schema or repair UI. Tests cover authored capabilities, all two-tile
collision/placement checks, targeting either half, recipe salvage, carrying and
preserved existing interaction behavior. Existing installed workbenches expand
from their anchor tile toward the right; release review must check adjacent
occupied tiles in existing worlds before content publication.

## Artwork provenance

AI generation produced `art/custom/workbench/workbench-ai-source.png`. The retained
source is imported by `npx tsx packages/tools/src/import-workbench.ts`, which crops
to its alpha bounds, samples a 32px grid and maps to a fixed 20-color palette. The
32x32 game sprite uses anchor `[8,31]` so its 32px width covers the anchor tile and
its right neighbor. No licensed table source is used by the new sprite; the old
crafting extraction list no longer overwrites it. The source PNG is a retained
artwork input; the runtime atlas uses the small sprite definition.

The two-tile expansion is handled by the shared authored footprint helper on
both client and authority: collision, faced interaction/pickup, placement checks,
placement reticles and tool-swing discovery. A swing counts each object once even
when both cells lie inside the arc. Failed placement keeps the same carried row
and its state. The recipe salvage uses the existing transactional damage path.

Reviewed fixture updates preserve object positions and all unrelated sprites.
Only the workbench prefab dimensions/anchor, its native-art fingerprint, three
build-palette pixel snapshots, and bootstrap-content hashes change. The structural
seam digest includes the reviewed hotbar sentinel and shared collision edits.
