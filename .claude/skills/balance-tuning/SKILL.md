---
name: balance-tuning
description: Change game-economy numbers (costs, rates, formulas, prestige curves, pacing) for Orchard & Cellar safely. Use whenever editing packages/sim/src/balance.ts, the economy tables on the wiki page Systems/Economy, or when a playtest shows pacing problems.
---

# Balance Tuning — Orchard & Cellar

The economy's numbers live in `packages/sim/src/balance.ts` and the authored
content under `packages/assets/content`, pinned by golden-number Vitest tests. The
design intent and the reference tables are on the wiki page [wiki: Systems/Economy](https://wiki.orchard.dastari.net/Systems/Economy).
The code, the tests and the wiki tables must never disagree.

## Procedure for any number change

1. State the pacing problem in terms of the pacing target table on
   [wiki: Systems/Economy](https://wiki.orchard.dastari.net/Systems/Economy) ("first Vintage takes 11 h, target is 5–7 h"), not vibes.
2. Change `balance.ts` AND the golden tests in one commit, prefixed `balance:`,
   touching nothing else (revert-safe rule on [wiki: Agents/Workflow](https://wiki.orchard.dastari.net/Agents/Workflow)). Update
   the Systems/Economy table in the wiki at the same time and link it from the PR.
3. Prove the effect with the headless pacing harness: run the scripted-bot
   simulation (`npm run sim:pace` — a bot that plays greedily-sensibly at time
   warp) and paste before/after milestone timings into the commit message.
4. If it deviates from a documented design intent, add a row to the wiki
   [Decision Log](https://wiki.orchard.dastari.net/Decisions/Decision%20Log) (and a decision page if the owner decided it).

## Principles (from the source game & redesign PDF — see [wiki: History/Solo Farm Economy](https://wiki.orchard.dastari.net/History/Solo%20Farm%20Economy))

- Geometric cost growth ×1.18–1.35 per repeat purchase; ×6–8 between tiers.
  Steeper is safer than shallower ("at 1.15 a run detonates").
- Prestige exponents stay sub-linear (0.34–0.5): doubling reward should need ~4×
  the input. Never make banking beat playing.
- Gates (Knowledge, milestones) do the pacing; prices do the economy. If pacing is
  wrong, reach for gates before adding zeros to prices.
- Offline efficiency < 100% always (60% base, softened cap) — being away must not
  beat playing, except via the explicit Cold Cellar cultivar.
- Every session ≥15 min through year 3 must contain a visible step forward. If a
  dead zone appears, add a milestone/unlock there rather than inflating rates.
- Multiplayer perks stay cosmetic-or-tiny (≤5%, time-boxed): visiting must never
  become an economy exploit.

## Red flags that mean stop and rethink

- A change that makes hoarding-then-bursting optimal (the Buy-All pathology the
  redesign PDF killed — see [wiki: History/Solo Farm Economy](https://wiki.orchard.dastari.net/History/Solo%20Farm%20Economy)).
- A stage whose capital can be starved by another stage's spending (the
  Fruit-wallet war Pomace exists to prevent).
- Any input-frequency advantage (check `e.repeat` handling if touching tending).
