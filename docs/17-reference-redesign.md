# 17 — Reference: The Redesign PDF (Complete Summary)

Summary of `references/Orchard_and_Cellar_Progression_Redesign_Recommendations.pdf`
(9 pages) — the **end build target**. The avatar game implements all four P0s; where
this doc and [06-progression-economy.md](06-progression-economy.md) differ in
numbers, 06 wins (it re-scales for the avatar game).

**Redesign in one sentence:** give each production stage its own capital loop, make
the skill tree progression-gated as well as currency-gated, replace click spam with
a charged Vigour action, and make Cultivars permanent rule changes with a baseline
reward for every Lineage.

## 1. Problems identified in the original

1. **Shared Fruit economy.** Fruit is both Grove currency and Press capital;
   investing in Press competes with growing the economy that funds it. At scale it's
   *optimal* to deliberately leave the Press bottleneck unresolved during growth.
2. **Skill tree only price-gated.** Optimal play: bank Terroir, then Buy-All the
   whole 472-rank tree in one burst. Raising rank growth ×1.75→×3.0 (tree cost
   619k→42.2M) "fixes the number, not the strategy."
3. **Tending rewards input spam.** Space keydown with no `e.repeat` rejection makes
   holding Space the optimal active play.
4. **Cultivars too weak for the Lineage reset** (the most destructive reset paying
   out modest multipliers; a finished Lineage can leave only an unspendable Seed).

Secondary: prestige layers overlap in role; the 200-building ×3 milestone risks
becoming a per-Vintage obligation.

## 2. The four P0 recommendations

### P0-A: Separate capital loops (Pomace)
| Stage | Produces | Capital | Buys |
|---|---|---|---|
| Grove | Fruit | Fruit | trees/grove upgrades |
| Press | Must + Pomace | Pomace | presses/press upgrades |
| Cellar | Bottles | Must | casks/cellar upgrades |

Pomace = 10–20% of fruit actually pressed. Each stage self-funds: more press →
more pomace → more press. A few mixed-cost cross-stage upgrades allowed as the
exception. (Alternative considered: invisible "Engineering points" per N fruit
pressed.)

### P0-B: Progression-gated skill tree (Knowledge)
Terroir stays the price; **Knowledge** (non-spendable, earned from Vintages
completed, tiers reached, milestones, achievements) gates tree *depth*. Example
gates from the PDF: Pollinators 250 T + (75 trees or Grove Knowledge 3); Vintage
Chart 25k T + (10M lifetime bottles or Cellar Knowledge 7); Estate Manager 100k T +
5 Vintages + 1 Succession. Simpler variant: depth by Vintage count (T2 after V3,
T3 after V7, T4 after V15, capstones after first Succession). Buy-All only within
unlocked depth.

### P0-C: Charged Vigour tending
Vigour charges over time; Tend cashes it out. Payout curve (illustrative,
deliberately super-linear so full charge is always most efficient): 25%→2 s of
grove production, 50%→5 s, 75%→9 s, **100%→15 s + burst bonus**. Autumn: Vigour
charges 4× faster + perfect-harvest/chain bonuses (NOT "tending ×4" spam). Reject
`e.repeat`; mouse/touch obey the same rules.

### P0-D: Cultivars change rules + Lineage baseline
Rule of thumb: *Heirlooms and the tree change numbers; Cultivars change rules.*
Proposed reworks: Windfall (pressed fruit still credits % as spendable Fruit);
Cold Cellar (whole estate 100% offline, cellar ignores cap); Perennial Roots (keep
trees + a milestone tier); Deep Taproot (unlimited offline, diminishing after
24 h); Even Year (no penalty + modest off-stage bonus); Grafted Stock (keep as-is);
Terroir Memory (keep 25–30% Terroir + one chosen branch through Succession);
Cellar Overflow (substantial auto-aging); Hands Free (auto-cashes full-Vigour
tends); Long Lineage (+50% or another major effect).
**Baseline reward per Lineage** (independent of Seeds): illustrative ×1.5 all
production, or ×1.10–1.15 Terroir gain, per Lineage.

## 3. P1/P2 and layer roles

| Layer | Cadence | Resets | Reward | Player question |
|---|---|---|---|---|
| Vintage | minutes–hours | run | Terroir + Knowledge | "What can I improve next run?" |
| Succession | several Vintages | Terroir + tree | Heirlooms | "Is the permanent multiplier worth rebuilding?" |
| Lineage | several Successions | Heirlooms + Terroir | Seeds + rules + baseline | "Which permanent rule next?" |

**Vintage = build, Succession = power, Lineage = rules.**
The 200-owned ×3 milestone: endgame/final-run target only — 10/25/50 routine, 100
late-normal, 200 never forced per Vintage.
Priorities: P0 = repeat-block + Vigour, Pomace split, Knowledge gates, Cultivar/
Lineage rework. P1 = layer-role UI clarity, 200-milestone tuning. P2 = richer
branch milestones, revisit automation after the new active loop stabilizes.

## 4. Success criteria (acceptance tests for our build too)

- No player deliberately under-builds the Press to protect Fruit for buying Press.
- Skill ranks are bought across multiple Vintages, never 472-in-one-burst.
- Holding the tend key gives zero advantage over deliberate tending.
- A new Cultivar changes strategy or removes a planned-around constraint.
- Lineage is attractive even when the next Seed can't be spent yet.
- Each prestige layer explainable in one sentence.
- The 200-milestone reads as aspirational endgame, not obligation.

## 5. Target end state

Grove/Press/Cellar each self-funding; a skill build that *develops* rather than
being shopped at the end; active play = attention and timing; Cultivars remove
constraints; every Lineage grants permanent progress. **North star: the player can
always point at the next transformation — progress must never collapse into "wait
until the number is big enough to Buy All."**
