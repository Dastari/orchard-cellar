# 16 — Reference: The Original Incremental (Complete Extraction)

Verified extraction of `references/orchard_and_cellar.html` (the source incremental
game; a recovered, readable copy of its 3,038-line JS is at
`references/orchard_and_cellar_unminified.js`). This is *what we're adapting from* —
the avatar game's own numbers are in [06-progression-economy.md](06-progression-economy.md),
which supersedes everything here. Use this doc for design intent, flavor text,
trait ideas, and formula heritage. All numbers were verified by executing the
extracted data tables.

## 1. Theme & premise

Header comment: *"A three-stage chain: trees make FRUIT, presses turn fruit into
MUST, the cellar ages must into BOTTLES. Each stage can bottleneck the next, which
is where the decisions live."* You inherit "a neglected orchard and a cellar full of
empty racks." Presses take fruit straight off the trees (up to 50% share base),
never from banked stock. Casks are bought with must ("Giving must its own sink stops
the three stages competing for one pile"). Tick: 100 ms.

## 2. Resources

Fruit (base), Must (mid), Bottles (score), Terroir (prestige 1 → skill tree),
Heirlooms (prestige 2, each +25%/+40% held), Seeds (prestige 3 → cultivars),
Vigour (0–1 meter, fills 0.04/s × rate; full = burst tend).

## 3. Buildings — 22 tiers × 3 stages, cost ×1.175 per owned

Cost growth comment: steeper than the genre's 1.15 "because at 1.15 a run detonates
and swallows the whole skill tree in one sitting."

**Trees** (base cost → fruit/s; trait): Seedling 15→0.1; Apple 165→0.85 lifts .006;
Pear 1.8k→7.2 Autumn; Quince 20k→61 feeds press .02/10; Plum 218k→520 lifts .005;
Fig 2.4e6→4.4k Summer; Cherry 2.6e7→37k Summer; Heritage 2.9e8→320k lifts .004;
Walled garden 3.2e9→2.7e6 feeds cellar .02; Estate 3.5e10→2.3e7 Autumn; Valley
3.85e11→1.95e8 feeds press .03; Island 4.2e12→1.7e9 lifts .003; Canopy 4.6e13→1.4e10
Winter; Terrace 5.75e14→1.19e11 lifts .003; Rivermouth 7.19e15→1.01e12 feeds cellar
.02; Province 8.98e16→8.6e12 Autumn; Shelf-sea 1.12e18→7.31e13 feeds press .02;
Cloud forest 1.4e19→6.21e14 Winter; Tundra 1.75e20→5.28e15 Winter; Rift 2.19e21→
4.49e16 lifts .003; World row 2.74e22→3.81e17 Summer; Medlar 3.43e23→6.92e18 feeds
cellar .03 (unlocked by achievement "Every variety").

**Presses** (fruit cost → must/s): Basket 150→0.6; Screw 3.3k→5; Hydraulic 36k→43;
Belt 400k→370; Continuous 4.4e6→3.1k; Mill 4.8e7→26k; Works 5.3e8→225k; Refinery
5.8e9→1.9e6; Cascade 7.25e10→1.62e7; District 9.06e11→1.37e8; Seaboard 1.13e13→
1.17e9; Arcology 1.42e14→9.92e9; Orbital mill 1.77e15→8.43e10; Leviathan 2.21e16→
7.17e11; Estuary 2.76e17→6.09e12; Cordillera 3.45e18→5.18e13; Basin 4.32e19→4.4e14;
Trench press 5.4e20→3.74e15; Geothermal 6.74e21→3.18e16; Lagrange 8.43e22→2.7e17;
Ring 1.05e24→2.3e18; Titan 1.32e25→1.95e19.

**Casks** (must cost → bottles/s): Demijohn 80→0.25; Oak barrel 1.65k→2.1; Foudre
18k→18; Stone vault 200k→152; Cathedral 2.2e6→1.3k; Catacombs 2.4e7→11k; Glacier
2.65e8→94k; Deep rock 2.9e9→800k; Aquifer 3.62e10→6.8e6; Salt dome 4.53e11→5.78e7;
Trench 5.66e12→4.91e8; Permafrost 7.08e13→4.18e9; Mantle 8.85e14→3.55e10; Long Now
1.11e16→3.02e11; Abyssal 1.39e17→2.57e12; Ice cap 1.73e18→2.18e13; Basalt 2.17e19→
1.85e14; Cryogenic 2.71e20→1.58e15; Deep mantle 3.39e21→1.34e16; Orbital reserve
4.23e22→1.14e17; Century vault 5.29e23→9.68e17; Millennium 6.62e24→8.23e18.

**Varietal traits** ("so a mixed orchard beats a stack of the top tier"): `lifts x`
raises every *other* variety by x per 10 owned; `season` ×1.8 in its season
(deliberately no Spring variety — "Spring is the grove's season"); `feeds` adds
capacity % per 10 to press/cellar, all summed, capped +50% (`FED_CAP`). Plus
`treeSynergy` global (+% fruit per total tree).

Per-tick flow: `pressed = min(pressCap, gross × pressShare(0.5 base, cap 0.95, 1.0
w/ Windfall)); stock += gross − pressed; must += pressed × pressYield; aged =
min(cellarCap·dt, must); bottles += aged × bottleValue`.

## 4. Seasons

Spring +60% trees / Summer +60% press / Autumn tending ×4 / Winter +60% cellar.
Base length 180 s (skill-shortenable −10%/rank, floor 30 s). In-season bonus
scalable (+0.20/rank Living Hedge); off-season −15% (Windbreak softens; Even Year
cultivar removes). Circular season-arc UI.

## 5. Upgrades — 353 (reset every Vintage)

Per-building ladder at 10/25/50/100/200 owned: cost base×22/220/2.6k/32k/5e13,
effect ×2/×2/×2/×2/×3 (comment: the 200 step costs "roughly a tenth of the ground
you had to buy"). Plus 23 globals — highlights: Winter pruning/Compost/Beehives/
Irrigation/Rootstock trials (treeMult +0.5…+1.5, gated on tree counts 30→400);
Sharper knives→Continuous run (pressMult, 15→140 presses); Temperature control→
Master blender (cellarMult, 15→140 casks); Sturdy ladder/Picking basket/Whole
family out (tending ×3 each, gated on 50/300/1000 tends *this run*); Tending pays
(+3% of fruit/s per tend); Mixed planting/Old orchard mix (synergy, gated on 5/8
kinds); Slow pressing (pressYield +0.25); Whole fruit (pressShare +0.15); Fine
bottling/Estate label (bottleValue +0.3/+0.5).

## 6. Skill tree — 61 nodes, 472 ranks, 4 branches + 5 capstones

Rank cost `ceil(base × 3.0^rank)` (raised from 1.75; full tree ≈42.2M terroir,
first-ranks total 7,412). Respec refunds 80%. Capstones need terroir-weighted
branch points. Branch node ladders (base costs 1/2/2/6/7/13/18/32/48/82/117/202/
297/659, ranks mostly 10/8/6/1):

- **Grove:** Mulching, Grafting, Deep roots (offline), Pollinators, Windbreak,
  Old wood, Understorey (cheap trees), Espalier, Seed bank (start trees),
  Terracing, Coppice (synergy), Ancient stock, Living hedge, The Great Tree (+300%).
- **Press:** Sharp blades, Strong arms (click), Fine mesh, Second pressing
  (yield+share), Rhythm (vigourRate), Steel frame, Windfalls (clickFromRate),
  Pomace mill, Burst (vigourPower), Hydraulics, Nothing wasted, Cold pressing,
  Momentum (vigourKeep), The Great Press.
- **Cellar:** Airlocks, Cool store, Wild yeast (bottleValue), Racking, Long ageing,
  Blending, Cellar book (offlineCap), Bottle shock, Reserve stock (keepBottles),
  Solera, Vintage chart, Deep cellar, Cork library, The Great Vintage.
- **Estate:** Farmhand (allMult), Ledger (terroirGain), Barrow (autoBuy switch, 1
  rank — "ranks two to six were 74 terroir for nothing"), Almanac (season length),
  Dry stone wall, Cider house, Night watch, Apprentices, Standing order, Reputation,
  Rootstock (keepTree), Estate manager, Land trust, The Whole Estate (+100%).
- **Capstones:** Windfall cider, Estate bottling, Perry works, Contract press,
  The Long View (needs 40 pts in all four branches; allMult +1.5, terroirGain +0.5).

Softening formula for capped sums: `soften(cap, base, sum) = cap − (cap−base)·
e^(−sum/(cap−base))` (offlineRate cap 1 base 0.6; vigourKeep cap 0.8).

## 7. Prestige

- **Vintage:** min 1,000 bottles; `terroir = floor((bottles/1000)^0.45 × 3.5 ×
  terroirGainMult)` — "each vintage needs roughly four times the bottles of the last
  to double the reward." Resets run; keeps tree/terroir/heirlooms/seeds/achievements.
  Partial carries: keepTree cap 0.65, keepBottles cap 0.5, startTrees +5/rank.
  History: last 60 vintages charted.
- **Succession:** `heirlooms = floor((terroirEver/40000)^0.34)` lifetime-banked;
  resets terroir + whole tree. Heirloom = +25% (+40% w/ Long Lineage).
- **Lineage:** `seeds = floor((heirloomsEver/25)^0.5)` ("the first seed should be a
  visible goal rather than a rumour"); resets heirlooms AND terroirEver (documented
  anti-exploit). All 10 cultivars = 31 seeds ≈ 31 lineages, "a game that runs for
  weeks."
- **Cultivars (cost, effect):** Windfall 1 (pressShare cap→1.0); Cold cellar 1
  (offline cellar full rate); Perennial roots 2 (keep 25% trees); Deep taproot 2
  (+12 h offline cap); Even year 3 (no off-season penalty); Grafted 3 (trees −30%);
  Terroir memory 4 (keep 10% terroir thru Succession); Overflow 4 (standing must
  self-ages 0.2%/s); Hands free 5 (auto-tend 2/s); Long lineage 6 (heirlooms +40%).

## 8. Tending & Vigour

`tend()` gain = click value + `clickFromRate` share of gross fruit/s; ×4 in Autumn.
Vigour fills at 0.04/s×rate; at full the next tend bursts ×`vigourPower` (2 base,
+0.6/rank, max 5.6), meter keeps `vigourKeep` after. **Space triggers on keydown
with no `e.repeat` rejection — the exact flaw the PDF's P0 fixes.** Click-gated
upgrades reset each vintage by design. Hands Free batches via `creditTending`
(documented 8-second stall fix).

## 9. Achievements — 69, all with permanent bonuses, total +289%

Ladders for tends (1/100/1000), fruit held (1e3→1e21), must ever, bottles ever,
counts (50/250 trees, 25 presses/casks), production rates, vintages (1/5/10/25/100/
500), terroir spent, successions (1/5/25), lineages (2/5/10), cultivars (1/3/all),
seasons seen, offline gain, bursts (50), skill ranks (50/150), variety collections
(one of each → Medlar unlock; 25 of every; 50 of every seasonal; 100 of every
lifting; both fed caps), "Nothing left to buy" (every upgrade at once, 10% — the
stated hardest goal), "Two hundred" (200 of one tier). Unlock-carrying: a17 Medlar
tier, a19 Buy-best button, a21 Records tab, a25 ×1000 bulk, a42 ×10000 bulk.

## 10. Offline & saves

Offline: skip <60 s; cap = (8 h + skills + taproot) ; efficiency soften(1, 0.6,
ranks) — "above it, being away would beat playing." Simulated as **60 coarse chunks
of the real step()** "so offline earnings obey the same bottlenecks as playing
does"; auto-buy loops up to 400 purchases/chunk when enabled (measured in comments:
770 vs 2,319 trees over 8 h). Saves: localStorage, autosave 10 s, rolling backup
180 s, multi-tab writer lock, base64 export/import, hard `sanitise()` on load with
backup fallback.

## 11. Progression arc & endgame

Chain strip of three stage cards doubles as nav + bottleneck display (the pinned
constriction highlights). One-line advice system: "The presses cannot keep up with
the crop — buy presses," etc. Discovery: tiers hidden until ~35% affordable; tab
chips show found/total only ("naming what is missing would give away the
discovery"). Authored arc: hour 1 tend/seedlings/presses/casks → day 1 first
vintage → mid-game vintage loop with autoBuy/BuyBest/bulk unlocks → ~40k lifetime
terroir first succession → 25+ heirlooms-ever first lineage → cultivars "change how
the chain behaves." Completion = equal-weighted average of achievements/cultivars/
skill ranks/upgrades-held/buildings-standing; because vintages take the upgrades and
successions take the tree, **"only the final run can carry it to the top"** — the
hardest goal is holding every upgrade at once. Keyboard: Space tend, B buy-best,
1–9 tabs.
