---
name: balance-tuning
description: Change game-economy numbers (costs, rates, formulas, prestige curves, pacing) for Orchard & Cellar safely. Use whenever editing packages/sim/src/balance.ts, any table in docs/06-progression-economy.md, or when a playtest shows pacing problems.
---

# Balance Tuning — Orchard & Cellar

The economy's single source of truth is the table set in
`docs/06-progression-economy.md`, mirrored in `packages/sim/src/balance.ts` and
pinned by golden-number Vitest tests. These three must never disagree.

## Procedure for any number change

1. State the pacing problem in terms of `docs/06-progression-economy.md` §10's
   target table ("first Vintage takes 11 h, target is 5–7 h"), not vibes.
2. Change `balance.ts` AND the 06 table AND the golden tests in one commit,
   prefixed `balance:`, touching nothing else (revert-safe rule from
   `docs/15-agent-workflow.md` §7).
3. Prove the effect with the headless pacing harness: run the scripted-bot
   simulation (`npm run sim:pace` — a bot that plays greedily-sensibly at time
   warp) and paste before/after milestone timings into the commit message.
4. Log the change in DECISIONS.md if it deviates from a documented design intent.

## Principles (from the source game & redesign PDF — see docs/16 and 17)

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
  redesign PDF killed — see docs/17 §1).
- A stage whose capital can be starved by another stage's spending (the
  Fruit-wallet war Pomace exists to prevent).
- Any input-frequency advantage (check `e.repeat` handling if touching tending).
