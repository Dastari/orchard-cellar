# Changelog

## 0.14.0 — Connected estate progression

- Train Farming with fishing catches (5 XP) and ordinary pool depletion (+10 XP), including Farming XP for tutorial catches. Preserve existing Explorer XP and all purchased skills.
- Price the East and South residence expansions at 60,000 and 180,000 bronze respectively (240,000 combined), retaining existing rooms and all bottle values, Vintage multipliers and first-bottle quest rewards.
- Add a source-derived production pacing report and make village-order comparisons read the same housing quotes as the game.

## 0.13.0 — 2026-09-21

- Completing all 12 Delve rooms and claiming the final guardian boon now permanently reveals the Delver Memorial Planter recipe, an optional residence keepsake crafted with stone, fiber and sunflowers.
- Track full Delve victories independently of temporary boons/currency. Content-disabled rewards are repaired on reconnect; death and abandonment grant no completion reward.
- Preserve completion receipts across quest resets and restore run-entry vitals as before.
- Keep the earned planter nonbuyable in authored commerce; reject purchase prices, including zero, in reward validation.


## 0.12.0 — 2026-09-21

- Mature apple, pear, peach and cherry trees now offer renewable E/touch fruit picking every game day, with ripening countdowns and existing seed-saver rolls. Picking preserves the tree; axe felling yields forestry materials only.
- Require a living player, current inventory protocol and unlocked persistent inventory before picking; rejected attempts leave the harvest and its rewards untouched.
- Persist readiness independently of tree health with an additive defaulted schema migration; inventory overflow uses the existing reserved drops.


## 0.11.0 — Village order specialist meals

- Learn Pantry Lunch after delivering two distinct raw products and one preserved product; learn Cellar Supper after two raw, two preserved and one bottle delivery. Repeat orders retain existing bronze payments.
- Track the next permanent recipe directly in Village Orders and receive a learned-recipe notice. New meals combine preserved produce with fresh crops to restore 36/48 hunger.
- Persist bounded private progress and grant recipe knowledge atomically with delivery receipts. Existing orders begin the new milestones at zero because historical receipts do not retain product diversity.

## 0.10.0 — Preserved expedition provisions

- Eat any preserved crop to restore 12–23 Hunger during outdoor work and expeditions. Full Hunger leaves the portion untouched; successful consumption records the existing food statistic. Preserving, prices and village orders retain their current behavior.
## 0.9.0 — Pomace compost

- Handcraft four Pomace and one Fiber into Compost. Select it and use F or the primary pointer action on a growing crop to advance its growth by 25%, once per planting.
- Record one lifetime `compost_applied` statistic per successful treatment for future quest/milestone connections, with no treatment XP.
- Settle elapsed growth before treatment, cap progress at maturity, and keep failed, unauthorized or repeated applications free of inventory changes. The new crop marker defaults to false for existing plantings.

## Studio 0.8.0 — Integrated reviewed editor

- Bring the reviewed Studio canvas UI kit and tools into the repository while
  keeping the game UI and Studio build/service independent.
- Share current runtime packages and canonical UI symbols; replace the external
  source overlay with a reproducible single-repository staged build.
- Retain live-map verification, draft safety, UI-kit checks, and rollback evidence;
  archive and retire the external source, remove six merged worktrees, and preserve
  active work plus checked rollback artifacts.
