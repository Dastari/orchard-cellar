# Fruit seeds and Orchard Seed Saver

Status: Accepted. Date: 2026-09-15.

Mature apple, pear, peach, cherry and orange tree harvests retain their normal
outputs and independently have a 5% chance to drop one matching seed. The new
Farming skill Orchard Seed Saver costs one point per rank, unlocks at Farming
level 3 after Green Thumb, and adds 10 percentage points per rank (maximum three:
15%, 25%, 35%). One roll per completed harvest, never per fruit or tool hit.

Seeds use the existing selected-item place lifecycle on empty tilled soil in
permitted outdoor/homestead farm tiles. Planting consumes one seed and creates
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
