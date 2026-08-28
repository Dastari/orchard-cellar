# 03 — Core Gameplay: From Incremental to Avatar

> **World-structure amendment (2026-08-26):** [40](40-sanctuary-overworld-and-zoned-world.md)
> makes the shared overworld a safe, non-destructive travel/social layer. The estate,
> orchard, production chain, farming, and construction described here live in the
> player's Homestead destination spaces; gathering and danger live in typed zones.

This doc translates the incremental game (see [16-reference-original.md](16-reference-original.md)
for the full extraction) into an avatar-controlled farm game, keeping what made it
good — the three-stage production chain, bottleneck decisions, layered prestige —
and replacing what the redesign PDF condemned (click spam, price-gated skill tree,
currency conflicts).

## 1. Vision & pillars

> You inherit a neglected orchard and a cellar full of empty racks. Walk the rows,
> bring the estate back to life, bottle a vintage worth your family's name — then
> hand it on, generation after generation.

**Pillars — every feature must serve at least one:**
1. **The chain is the game.** Trees make FRUIT → presses make MUST (+ POMACE) →
   the cellar ages BOTTLES. Each stage can bottleneck the next; spotting and fixing
   the constriction *by walking over and doing something about it* is the core decision loop.
2. **Attention over APM.** Active play is timing and judgement (charged Vigour tends,
   perfect-harvest windows), never input frequency. `e.repeat` is rejected everywhere.
3. **Generations, not grind.** Prestige is diegetic: Vintage = the year's bottling,
   Succession = your heir takes over the estate, Lineage = founding a new family line.
   Vintage = build, Succession = power, Lineage = rules.
4. **A place, not a spreadsheet.** Numbers live inside things you can walk to: the
   press creaks when fed, casks bubble, the bottleneck stage visibly clogs.

## 2. Time

| Unit | Value | Notes |
|---|---|---|
| Sim tick | 1/60 s | fixed timestep |
| In-game day | 15 real minutes | full 24-hour cycle, 06:00 → 05:59; night is playable (lantern light, slower Vigour) |
| Season | 7 days | Spring / Summer / Autumn / Winter, each with a world recolor + mechanical identity (see §6) |
| Year | 4 seasons ≈ 7 h real play | One Vintage cycle |
| Lunar month | 29.5 days ≈ 7 h 22.5 min real play | Eight phases; does not reset with the 28-day seasonal year ([27](27-lighting-design.md) §7) |

No forced sleep and no day-end pass-out: the named day rolls over at 06:00 wherever you
stand (this is a cozy incremental at heart — punishing timeouts are out of character).
Sleeping in the farmhouse bed skips to next morning and grants +25% Vigour charge
rate for 2 h real time ("well rested").

Offline: the estate keeps working at reduced efficiency (base 60%, skill-improvable,
capped hours — formulas in [06-progression-economy.md](06-progression-economy.md)),
presented on return as the "While you were away" letter.

## 3. The estate (Homestead destination spaces)

One exterior map + one interior, both authored in `packages/assets/maps/`:

- **Estate exterior, 64×64 tiles**: farmhouse (top, like the reference image), orchard
  ground with **plantable plots** (start: 12 usable; expandable to 120 by clearing
  brush/stones in marked zones), press yard (SW), cellar entrance dug into the
  hillside (SE), pond, beehive corner, compost bays, road gate (visitor spawn),
  traveling merchant's cart spot (visits Wednesdays & festivals).
- **Cellar interior, 40×24 tiles**: cask racks in rows, pressing overflow storage,
  bottling table (Vintage ceremony happens here), tasting table (multiplayer),
  stairs to deeper levels (2 expansions, dug during progression).

Expansion is spatial progression: clearing land, digging cellar levels, and upgrading
the farmhouse are visible, permanent-feeling changes that sell the incremental growth.

## 4. The avatar & core verbs

16×32 customizable farmer (skin/hair/shirt/pants palette-swaps). 8-direction
movement; hold Shift while moving to sprint at **125% walking speed**. Sprint
consumes player Vigour slowly, pauses Vigour regeneration while active, and falls
back to walking when Vigour cannot fund another movement step. Constitution
improves sprint efficiency; equipment, effects/buffs/debuffs, skills, and
environment modifiers can alter sprint speed or cost through the shared stat
pipeline (binding implementation in docs/25 §4.2).

| Verb | Input | What it does |
|---|---|---|
| **Tend** | E/Space on a tree | Spends Vigour charge for fruit + care (the signature action — full spec in [04-orchard-design.md](04-orchard-design.md)) |
| Harvest | E on fruiting tree/forageable | Collect ripe fruit (no Vigour cost) |
| Plant / graft | E on empty plot with sapling selected | Place a tree |
| Haul | walk-over pickup, auto-deposit at hoppers | Fruit crates → press hopper; must jugs → cellar (carts automate later) |
| Operate press | E on press | Start/collect a pressing run |
| Rack & bottle | E on casks / bottling table | Cellar work |
| Compost | E on compost bay with pomace | Turn pomace into mulch (tree care boost) |
| Talk / inspect | E on NPC, sign, animal | Flavor + info |
| Emote | G (wheel) | Social, mostly for visits |

Interaction is proximity + facing with a generous 1.5-tile assist cone; the current
target tile always shows the bracket cursor + verb prompt.

## 5. The core loop, by timescale

- **Minute:** walk the rows → spend a full Vigour charge on the tree that needs it →
  haul crates → clear the flashing bottleneck (press hopper empty? casks full?).
- **Day:** morning harvest, queue pressings, evening racking; check the almanac;
  merchant on Wednesdays; one small event/day (see §7).
- **Season:** each season features one stage (see §6); festival day each season
  (see §7); plan plantings around traits.
- **Year (Vintage):** grow bottle count → bottling ceremony → Terroir + Knowledge →
  spend in the Estate Book (skill tree) → replant a better orchard.
- **Generations:** Succession (heir takes over; Heirlooms), then Lineage (new land;
  Seeds → rule-changing Cultivars). Full rules in [06-progression-economy.md](06-progression-economy.md).

## 6. Seasons (mechanical identity, from the original + PDF fix)

| Season | Featured stage | Effect | Identity |
|---|---|---|---|
| Spring | Grove | Trees produce +60%, saplings grow 2× | Planting & pink blossom |
| Summer | Press | Presses run +60% | Heat shimmer, cicadas, irrigation |
| Autumn | Harvest | Vigour charges 4× faster; perfect-tend chain bonus (PDF P0 — *not* "tending ×4") | The busy, golden season |
| Winter | Cellar | Aging +60% | Snow, quiet, cellar-focused; bare trees |

Off-season stages run at −15% (removable via skill/cultivar). No Spring-variety
trees — Spring is the whole grove's season (kept from the original's design note).

## 7. Life & texture (what makes it fun beyond the chain)

- **Estate hands (automation as NPCs):** the incremental's auto-buy/auto-tend become
  hireable pixel workers you can watch — the Picker, the Press Hand, the Cellar
  Master, unlocked via the Estate skill branch. Automation you can *see* is the
  emotional payoff of the Estate branch.
- **A dog** (chosen at first run) follows you, chases birds off trees (small real
  effect), can be petted daily.
- **Forageables & bees:** seasonal wild spawns at map edges (berries, mushrooms,
  honey) — small fruit income + almanac entries + gift material for visits.
- **Daily micro-events (exactly one/day):** bird flock raids a tree (shoo them),
  frost warning (cover a sapling), windfall morning (fruit on the ground), a wild
  seedling sprouts, merchant discount. Small, optional, 30-second interactions.
- **Seasonal festivals (day 7 of each season):** Blossom Day (decorate + first-kiss
  of spring bonus), Pressing Fair (press mini-contest: rhythm timing, not mashing),
  Harvest Festival (chain-tend showcase), Frost Fair on the frozen pond (bottle
  tasting → small Terroir bonus). Festivals are the natural multiplayer moments
  ([07-multiplayer.md](07-multiplayer.md)).
- **The almanac (in the Estate Book):** collection log for varieties, forageables,
  achievements, records (best vintage chart, like the original's Records tab), and
  the source of **Knowledge** ticks that gate the skill tree.
- **Achievements:** curated ~40 of the original's 69, each still granting a small
  permanent production bonus (roster in 06).

## 8. What we deliberately dropped from the incremental

- 22 purchasable tiers per stage → 10 tree species, 5 press tiers, 5 cask tiers,
  with *counts* of physical objects providing width (rationale & tables in 04/05/06).
- Numbers beyond ~1e12 and the `Qa…Vg` suffix ladder — the avatar economy is
  rebalanced to peak ~1e9 with clean suffixes (k/M/B).
- Buy ×1000/×10000 buttons — physical placement replaces bulk-buying; bulk comes
  from estate hands doing the work.
- The advice line ("presses cannot keep up") survives as the **estate journal** on
  the farmhouse wall + visual clogging of the actual buildings.
