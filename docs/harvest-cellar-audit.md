# Harvest and cellar audit

## Scope and acceptance

Repair the existing crop → press → must → fermentation loop and preserving side
branch. Keep existing item IDs, inventories, placed objects and recipes intact.
The two barrel types remain distinct: preserving barrels cure one raw crop;
fermentation casks automatically consume three must per bottle. Names and input
labels must explain this before a rejected drop.

Estate upgrades must resolve through the owning homestead in its garden,
residence and cellar. Purchases remain owner-only. Client timing must describe
the same estate policy as authority. Existing Estate/Select/Reserve/Grand Vintage
ranks remain the tier path; no new machine economy is introduced.

Farming skills must resolve active authored capabilities and prerequisite-valid
ranks. Green Thumb adds 3% expected crop yield/rank; Bountiful Harvest adds a
10%/rank chance of one extra bundle; Seed Saver returns a seed at 10%/rank;
Quest-only seeds are excluded from Seed Saver to preserve finite quest grants.
Tender Hand extends watering by 25%/rank; Master Grower removes the seasonal
penalty; Barreling gives 20% faster preserving and fermentation. Sprinkler
Engineering and Greenhouse Charter enable existing authored unlocks. Soil
Whisperer exposes moisture/growth details already available in crop inspection.
Harvest Festival doubles the first successful crop harvest per game day, using
persisted statistic timestamps to prevent repeat/reconnect awards. Probabilistic
bonuses use stable planting/tile entropy, never retry-dependent randomness.

Invalid/unimplemented/orphaned skills grant nothing. Failed inventory insertion
must roll back the harvest, seeds and daily bonus together. Unavailable orchard
specialization (Grafting) needs a separate designed tree-upgrade interaction;
keep it honestly unavailable rather than attaching an unrelated bonus.

## Live observations (2026-09-15)

- Live content revision 9, hash `5b3399a3` (raw rows checked via authenticated read-only SQL).
- Nado garden 10002, residence 30004, cellar 30005.
- Preserving barrels 12302/12304; fermentation casks 4129/12299.
- One active must definition and matching 3:1 fermentation recipe. No missing
  must variants found. Read-only admin inspection found two Must in hotbar slot
  5 and all four containers empty/unsealed. Casks need three Must to start. The
  exact failed drop remains unobserved; the preserving barrels reject Must by design.
- Live processor definitions lack current-main completion XP metadata. A future
  release must publish reviewed content as well as module/client code.
- Authority upgrade lookup uses processor space directly, losing cellar bonuses.
- Residence UI hides upgrades; purchase reducer excludes cellar.

## Validation

Regression tests cover processor input restrictions, cellar estate lookup,
upgrade purchase ownership, skill prerequisite rejection, yield probability
boundaries, daily bonus, seed inventory rollback and processor duration. Run
repository checks and production client/world builds; preserve Studio's prebuild
guard. Live read-only inspection is evidence, not a deployment verification.

## Touch build access

Tap the hammer above the crafting spanner to open or close the build catalogue.
It shares the B-key permission and mounted-state checks. Estate upgrade buttons
are below the catalogue; purchases remain owner-only. The weapon shortcut sits
above the hammer so their pointer targets do not overlap.
