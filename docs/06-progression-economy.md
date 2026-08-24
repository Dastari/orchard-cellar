# 06 — Progression & Economy: The Numbers

The single source of truth for tuning. Implementation mirror: every constant here
lives in `packages/sim/src/balance.ts`, and every table gets a golden-number Vitest
test named for its section (see [15-agent-workflow.md](15-agent-workflow.md) §4).
Numbers were rebalanced from the incremental (which peaked at 1e25) to an avatar
scale peaking ~1e9. The redesign PDF's P0s are all implemented here: Pomace capital,
Knowledge gates, charged Vigour, rule-changing Cultivars + Lineage baseline.

## 1. Currencies

| Currency | Kind | Earned | Spent |
|---|---|---|---|
| Fruit | run | trees, tends, forage | saplings, plot clearing, grove upgrades |
| Pomace | run | 15% of fruit pressed | presses, press upgrades; OR compost mulch |
| Must | run | pressing (yield 0.5/fruit base) | casks, cellar upgrades; aged into bottles |
| Bottles | run | aging × bottleValue (base 0.1) | cellar digs; scored at Vintage |
| Terroir | persistent (resets at Succession) | Vintage ceremony | skill tree ranks |
| Knowledge | persistent score, never spent | play milestones (§5) | gates skill tiers |
| Heirlooms | persistent (resets at Lineage) | Succession | not spent; +25% each (+40% w/ cultivar) |
| Seeds | permanent | Lineage | Cultivars |

All currency values are integers in sim state (fruit in whole units; rates accrue in
a fixed-point fractional accumulator). Nothing exceeds 2^53.

## 2. Production tables

### Trees (per mature tree, Care ×1.0, no modifiers)

| # | Species | Sapling cost (fruit) | Fruit/s | Trait value |
|---|---|---|---|---|
| 1 | Seedling Apple | 15 | 0.10 | — |
| 2 | Orchard Apple | 120 | 0.60 | lifts 1.5%/5 |
| 3 | Pear | 900 | 3.2 | Autumn ×1.8 |
| 4 | Quince | 6,500 | 15 | feeds press +2%/5 |
| 5 | Plum | 48,000 | 70 | lifts 1.2%/5 |
| 6 | Fig | 360,000 | 330 | Summer ×1.8 |
| 7 | Cherry | 2.8M | 1,600 | Summer ×1.8 |
| 8 | Heritage Grafts | 22M | 7,500 | lifts 2%/5 |
| 9 | Frost Medlar | 170M | 36,000 | Winter ×1.8 |
| 10 | Vale Medlar | 1.3B | 170,000 | feeds cellar +2.5%/5 |

- Sapling cost grows **×1.18 per tree of that species already planted**.
- `lifts`: adds its % to every *other* species per 5 planted; monocultures gain nothing.
- `feeds`: adds % to press/cellar *capacity* per 5 planted; total fed bonus per stage
  capped at **+50%**.
- Global synergy (skill-gated): +0.15%–0.4% all fruit per tree planted.
- Per-species milestones at 5/10/15 planted: that species ×2 each; at **25**: ×3
  (endgame target, not a per-Vintage expectation — PDF §7).
- Care multiplies ×1.0–×2.0 ([04](04-orchard-design.md) §3). Season: featured ×1.6
  (+ skill), off-season ×0.85. Species whose table trait names a season use that
  more-specific ×1.8 value instead of ×1.6; the two bonuses do not stack.

### Presses (first Basket Press: repaired for 50 fruit, one time; all others cost Pomace)

| Tier | Name | Cost (pomace) | Processes fruit/s | Pads |
|---|---|---|---|---|
| 1 | Basket Press | 25 | 0.5 | 1 |
| 2 | Screw Press | 180 | 3 | 1 |
| 3 | Hydraulic Press | 1,400 | 18 | 1 |
| 4 | Belt Line | 12,000 | 120 | 1 |
| 5 | Pressing Works | 100,000 | 900 | 2 |

Cost ×1.35 per press of same tier owned. Yield: 1 fruit → **0.5 must** (upgrades +
skills to ~1.0). Pomace: **15%** of fruit pressed. Per-tier milestones at 3/6/10
owned: ×2/×2/×3 that tier.

### Casks (cost Must)

| Tier | Name | Cost (must) | Ages must/s |
|---|---|---|---|
| 1 | Demijohn shelf | 40 | 0.2 |
| 2 | Oak Barrels | 300 | 1.2 |
| 3 | Foudre | 2,400 | 7 |
| 4 | Stone Vault | 20,000 | 40 |
| 5 | Cellar Cathedral | 170,000 | 240 |

Cost ×1.35 per same tier. Bottles = must aged × **bottleValue 0.1** (upgrades/skills
to ~0.4). Milestones as presses. Cellar digs: level 2 = 500 bottles, level 3 =
25,000 bottles (bottle sink — spend vs. score).

### Workbench, capacity, and compost upgrades

The original draft referenced this table from 04 without including it. Costs keep
each stage funded by its own capital and follow the documented ×6–8 tier spacing.

| Upgrade | Currency | Cost | Rule |
|---|---:|---:|---|
| Pruning Shears | Fruit | 75 | Care decay interval 2 → 3 days |
| Tall Ladders | Fruit | 450 | Harvest interaction radius 2 → 4 tiles |
| Irrigation | Fruit | 3,000 | Halves the off-season penalty |
| Bee Boost | Fruit | 20,000 | Blossom-adjacent trees +10% fruit |
| Cart & Mule | Fruit | 140,000 | Automatically hauls harvested Fruit to the hopper |
| Copper Pipe | Pomace | 75 | Routes yard Must directly to the cellar bank |
| Yard Expansion I / II | Pomace | 500 / 4,000 | Press pads 5 → 8 → 12 |
| Cork Bench | Must | 250 | bottleValue 0.10 → 0.15 |
| Blending Bench | Must | 1,800 | bottleValue → 0.25 |
| Cellar Book | Must | 13,000 | bottleValue → 0.40 |

Compost mulch costs **5 Pomace per tree** and holds Care decay for three days.
Plot clearing is permanent spatial progress: 15 plots initially, then 30 / 60 /
90 / 120 plots for 2,000 / 16,000 / 130,000 / 1,000,000 Fruit.

## 3. Vigour & tending

- Charge rate: `0.04/s × (1 + vigourRate skills)`; ×4 in Autumn; +25% for 2 h after
  sleeping. Full charge base **25 s**.
- Payout at full charge: `15 s of current grove fruit/s × burstPower`,
  `burstPower = 2 + 0.6/rank (Burst skill, max 5.6)`. Partial payouts per the
  curve in [04](04-orchard-design.md) §4. Post-burst the meter retains
  `vigourKeep` (0 base, softened cap 0.8 via Momentum skill).
- `tendFromRate` skills add +2–3% of grove rate to *every* tend (keeps tending
  relevant at scale). Autumn chain: ×1.1/link, cap ×2.

## 4. Prestige formulas

| Layer | Formula | First trigger pace |
|---|---|---|
| **Vintage** | `terroir = floor((bottles/100)^0.45 × 6 × (1+terroirGain))`, minimum 100 bottles | Year 1 ≈ 250 bottles → 9 Terroir |
| **Succession** | `heirlooms = floor((terroirEver/500)^0.5) − heirloomsHeld` | ~vintage 4–6 |
| **Lineage** | `seeds = floor((heirloomsEver/20)^0.5) − seedsClaimed` | after ~3–4 successions |

- Doubling a Vintage's Terroir needs ~4.7× the bottles (0.45 exponent, kept from the
  original — it worked).
- Each Heirloom: ×1.25 all production (×1.40 with Long Lineage cultivar).
- **Lineage baseline (PDF P0): ×1.5 all production per completed Lineage, permanent,
  independent of Seeds.** Terroir Memory cultivar keeps 25% of Terroir + one chosen
  skill branch through Succession (PDF-boosted version).
- Vintage carries/resets: see [05](05-cellar-design.md) §3. `keepTree` fraction cap
  0.65; `keepBottles` cap 0.5; `startTrees` up to 30 free seedlings.

## 5. Knowledge (PDF P0 — the skill tree gate)

Knowledge is per-branch (Grove/Press/Cellar/Estate), earned only by playing:

| Source | Knowledge |
|---|---|
| First-time events (first press run, first bottle, first festival, each species' first harvest…) | +1 to the matching branch |
| Almanac entries (species mastered, forageables found) | +1 |
| Per-species/tier milestones (5/10/15/25) | +1 branch |
| Each Vintage completed | +1 to every branch |
| Festival participation | +1 seasonal branch |

**Tier gates** (both conditions required):

| Skill tier | Needs |
|---|---|
| 1 | open immediately |
| 2 | branch Knowledge ≥ 3 |
| 3 | branch Knowledge ≥ 7 AND Vintages ≥ 3 |
| 4 | branch Knowledge ≥ 12 AND Vintages ≥ 7 |
| Capstones | ≥ 1 Succession |

Buy All exists but only within unlocked tiers (PDF). A rich early Vintage can never
skip experiential progression — this is the fix for the 472-ranks-in-one-burst
pathology.

## 6. Skill tree (Estate Book) — 40 nodes, 4 branches

Rank cost `ceil(base × 2.5^rank)`; first ranks across the whole tree total ≈ 160
Terroir; a full tree ≈ 220k lifetime Terroir (reached over many Successions — the
gates, not the prices, do the pacing). Respec refunds 80%.

Branch skeleton (9 nodes each, tiers 1–4, + 4 cross capstones). Effects reuse the
original's vocabulary; per-node bases in `balance.ts` follow the cost ladder
1/2/2/6/7/13/32/82/202 within each branch, capstones 70/70/167/659:

- **Grove:** Mulching (treeMult), Deep Roots (offlineRate), Pollinators (treeMult),
  Windbreak (seasonSoften), Understorey (cheapSaplings), Seed Bank (startTrees),
  Coppice (treeSynergy), Living Hedge (seasonBoost), **The Great Tree** (treeMult ×4 big rank).
- **Press:** Sharp Blades (pressMult), Rhythm (vigourRate), Second Pressing
  (pressYield), Windfalls (tendFromRate), Burst (vigourPower), Nothing Wasted
  (pressYield+pomace +3%), Momentum (vigourKeep), Cold Pressing (pressMult),
  **The Great Press**.
- **Cellar:** Airlocks (cellarMult), Wild Yeast (bottleValue), Racking (cellarMult),
  Cellar Book (offlineCap +1.5 h/rank), Reserve Stock (keepBottles), Solera
  (cellarMult), Vintage Chart (bottleValue), Cork Library (offlineRate),
  **The Great Vintage** (bottleValue).
- **Estate:** Farmhand (allMult), Ledger (terroirGain), **The Picker** (estate hand:
  auto-harvest, 1 rank), Almanac Study (knowledge from events +1), **The Press Hand**
  (auto-haul + press feeding, 1 rank), Night Watch (offlineRate), Rootstock
  (keepTree), **The Cellar Master** (auto-racking, 1 rank), **The Whole Estate** (allMult).
- **Capstones:** Windfall Cider (tree+press), Estate Bottling (cellar+all), Perry
  Works (tree+cellar), **The Long View** (allMult + terroirGain; needs 1 rank in all
  branch-9 nodes).

## 7. Cultivars (Seeds; PDF-proposed effects; total 31 Seeds)

| Cost | Cultivar | Rule change |
|---|---|---|
| 1 | Windfall Stock | Pressed fruit also credits 25% of its value as spendable Fruit |
| 1 | Cold Cellar | Entire estate runs at 100% efficiency offline; cellar ignores the offline cap |
| 2 | Perennial Roots | Keep 40% of trees AND one grove milestone tier through Vintage |
| 2 | Deep Taproot | Unlimited offline duration; efficiency fades to 40% after 24 h |
| 3 | Even Year | No off-season penalty; non-featured stages get +15% |
| 3 | Grafted Stock | Saplings cost 30% less |
| 4 | Terroir Memory | Keep 25% Terroir + one chosen skill branch through Succession |
| 4 | Cellar Overflow | Overflow must self-ages at 30% of total cask rate |
| 5 | Hands Free | Apprentice NPC auto-cashes full-charge Vigour tends |
| 6 | Long Lineage | Heirlooms worth +40% instead of +25% |

## 8. Offline progress

`applyOffline(state, elapsed)`: cap = 8 h base + Cellar Book/Standing-order skills
(+12 h Taproot → unlimited w/ decay). Efficiency 60% base, softened toward 100%
via skills (`soften(cap, base, sum) = cap − (cap−base)·e^(−sum/(cap−base))` — kept
verbatim from the original). Simulate 60 coarse chunks through the real economy step
so offline obeys the same bottlenecks as live play. Estate hands keep working
offline; Care decays at half rate offline (kindness rule).

## 9. Achievements (curated 40)

Keep the original's structure — each grants a permanent global bonus; total ≈
**+150%**. Categories: tending (3), stockpiles (4), production rates (4), planting
(4), species collection (3), press/cellar counts (4), vintages 1/5/25/100 (4),
skill ranks (2), successions (3), lineages/cultivars (4), festivals (2), social —
first visit hosted, 10 guestbook signatures (2), completionist — every upgrade at
once (1, the hardest, per the original's design). Full roster with bonuses is an
appendix table in `balance.ts` — implementer fills values proportionally (1–8%
each) with a golden test asserting the +150% total.

## 10. Pacing targets (tune to these, not vice versa)

| Milestone | Target play time |
|---|---|
| First press running | 15–25 min |
| First must → first bottle | 45–70 min |
| First Vintage | 5–7 h (late in game-year 1) |
| Second Vintage | ~4 h (faster: skills + startTrees) |
| First Succession | 25–35 h |
| First Lineage | 80–120 h |
| All cultivars (31 Seeds) | aspirational, 500 h+ |
| "Every upgrade at once" achievement | final-run project |

Anti-frustration invariants: no fail states; nothing ever decreases below a floor
except by prestige choice; every session ≥15 min must include at least one visible
step forward (a milestone, unlock, or new almanac entry) through year 3 — verify in
playtesting.
