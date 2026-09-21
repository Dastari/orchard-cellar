# Fruit seeds and Orchard Seed Saver

> Updated by [renewable orchard harvest](renewable-orchard-spec.md): configured fruit trees now grant seed rolls on E/touch picking; felling produces forestry materials only. The original implementation history below describes the previous felling loop.

Status: Accepted. Date: 2026-09-15.

Mature apple, pear, peach, and cherry tree harvests retain their normal
outputs and independently have a 5% chance to drop one matching seed. The new
Farming skill Orchard Seed Saver costs one point per rank, unlocks at Farming
level 3 after Green Thumb, and adds 10 percentage points per rank (maximum three:
15%, 25%, 35%). One roll per completed harvest, never per fruit or tool hit.

Seeds use the existing selected-item place lifecycle on clear grass or tilled
soil in permitted overworld/homestead farm tiles. Tilling is never required for
tree seeds; ordinary crop seeds still require soil. Planting consumes one seed and creates
a small matching world resource which matures and regrows through the existing
tree growth system. Reject occupied/blocked tiles, unauthorized users, wrong
spaces, mounted players, unavailable definitions and out-of-range placement
before consuming inventory. Existing crops and their Seed Saver are unchanged.

## Decision

Use an optional authored resource seedItem reference and the existing plantSeed
effect, rather than a parallel tree table/reducer or hardcoded fruit-name mapping.
The existing world_resource schema already supports species, growth and space.
Seeded IDs occupy a separate safe-integer namespace with packed space/tile
coordinates; each tile can hold one persistent planted tree. Drop randomness is
server-owned and salted by world seed, resource ID and harvest activation ordinal;
completed tree harvests advance that ordinal so regrowth grants a fresh roll.
The tradeoff is that planted trees follow current chopping/regrowth mechanics,
not a new fruit-picking interaction. No database schema migration is needed.

## Validation and delivery

Tests cover probability boundaries/distribution, rank prerequisites and metadata,
matching live seed/resource references, retirement, deterministic retries/fresh
harvests, plant consumption/placement authority and growth to maturity. Run the
repository check command and affected builds. Release module, authored content
and lifecycle artifacts together after PR review; this task creates a PR only.

The 0.8.0 bootstrap contains 900 definitions (336 items), hash `32433a9b`.
Its measured initial runtime content payload is 535,114 bytes, 1,550 bytes above
0.7.0. The whole-KiB budget increases from 522 to 523 KiB. Orchard Seed Saver
intentionally shares the approved Seed Saver artwork; icon coverage validates
unique referenced assets and retains source-provenance checks.
