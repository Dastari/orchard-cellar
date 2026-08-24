# 05 — Press Yard & Cellar Design

Stages two and three of the chain: fruit → must (+ pomace) → bottles, plus the
Vintage ceremony. Implements the redesign PDF's P0 economy split: **the press is
funded by Pomace, never by Fruit.**

## 1. The press yard

Physical press stations on pads in the yard (5 pad slots at start, 12 fully
expanded). Press tiers — each a distinct machine sprite with a working animation:

| Tier | Name | Visual |
|---|---|---|
| 1 | Basket Press | Hand-crank wooden basket, creaks |
| 2 | Screw Press | Tall timber screw, slow rotation |
| 3 | Hydraulic Press | Iron frame, steam puffs |
| 4 | Belt Line | Conveyor feeding twin baskets |
| 5 | Pressing Works | Building-sized, chimney smoke (occupies 2 pads) |

Flow: harvested crates go to the **hopper** (haul by hand; cart & mule automates);
each press pulls from the hopper at its rate, outputs **Must** (piped to the cellar
intake once the pipe upgrade is bought; jugs hauled by hand before that) and
**Pomace** at 15% of fruit pressed (the PDF's 10–20% band, midpoint).

**Pomace is the press capital** (PDF P0): new presses, tier upgrades, and press-yard
upgrades cost Pomace. Surplus pomace composts into mulch ([04](04-orchard-design.md) §3)
— the two sinks compete gently, which is a real decision but never a deadlock.
Result: pressing more always funds more pressing; the grove-vs-press wallet war of
the original is gone.

- Utilisation is visible: an idle press's hopper chute hangs empty; a starved press
  shows a "wants fruit" bubble; a backed-up press (must storage full) steams and
  stops. The clogged stage is the walking-target — this replaces the original's
  bottleneck advice line.
- Summer: presses +60%. Pressing Fair festival: rhythm mini-game on the big press
  (timed E presses on a swinging needle — timing, not mashing) for a day-long yard buff.

## 2. The cellar

Interior map with cask racks along walls. Cask tiers:

| Tier | Name | Visual |
|---|---|---|
| 1 | Demijohn shelf | Glass jars, gentle glug |
| 2 | Oak Barrels | Classic rack rows |
| 3 | Foudre | Giant upright vat |
| 4 | Stone Vault alcove | Carved niche casks (level 2 dig) |
| 5 | Cellar Cathedral | Grand arched hall (level 3 dig) |

- **Casks cost Must** (kept from the original — must having its own sink is what
  stops three stages fighting over one pile; the PDF endorses it).
- Aging: must fills casks; each cask converts must → bottles at its rate; bottles
  accrue in the bottle racks (visible fill — racks stack up over the year; by
  bottling week the cellar should *look* full).
- `bottleValue` upgrades (corks, blending bench, cellar book) multiply bottles per
  must. Winter: aging +60%. Overflow must (all casks busy) sits in the intake tank —
  the Cellar Overflow cultivar makes it slowly self-age.
- Cellar expansion digs (level 2 at mid-game, level 3 late) cost Bottles — the only
  bottle sink besides the Vintage, making "spend bottles or score them" a real call.
- The **tasting table** is the multiplayer anchor ([07-multiplayer.md](07-multiplayer.md)).

## 3. The Vintage ceremony (yearly prestige)

At the bottling table, available once ≥ the year minimum (100 bottles, year 1) —
but the ceremony proper happens when the player chooses (typically late Winter;
carrying into a second year is allowed but off-season penalties and Care decay make
"bottle and replant" the sane rhythm).

Sequence (UI flow in [13-ui-ux.md](13-ui-ux.md)): bottle-line montage → label reveal
(year number + auto-generated label art from farm stats) → **Terroir + Knowledge
gain** → the estate turns over:

| Resets | Carries |
|---|---|
| Fruit/Pomace/Must/Bottle stocks | Terroir (+gain), Knowledge, skill tree |
| Presses & casks (equipment sold off with the vintage) | Plot clearings, cellar digs, farmhouse (spatial progress is permanent) |
| Trees (grubbed for replanting) — minus `keepTree` fraction (skills/cultivar retain your best) | Heirlooms, Seeds, Cultivars, achievements, almanac |
| Workbench upgrades | Estate hands hired (they're people, not equipment) |

Terroir formula and pacing targets in [06-progression-economy.md](06-progression-economy.md).
The label of every vintage is archived in the cellar's **label wall** — a growing
visual history of your runs (the original's vintage-history chart, made diegetic).

## 4. Succession & Lineage (diegetic framing)

- **Succession:** your farmer retires; you create the heir (re-run avatar
  customization — the old farmer appears at festivals as an NPC visitor). Resets
  Terroir + skill tree; grants **Heirlooms** (permanent ×1.25 each, displayed as
  framed portraits in the farmhouse hall). Triggered from the Estate Book when
  lifetime Terroir crosses the threshold (06 §4).
- **Lineage:** the family founds a new estate on virgin land (new map seed:
  plot/pond/rock layout reshuffles within authored constraints — fresh but fair).
  Resets Heirlooms + Terroir + tree; grants **Seeds** for **Cultivars** (permanent
  rule changes, roster in 06 §6) **plus the PDF's baseline reward: ×1.5 all
  production per Lineage completed, forever** — a Lineage is never wasted even with
  an unspent Seed.
