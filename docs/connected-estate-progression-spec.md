# Connected estate progression

Status: Accepted under the owner's 2026-09-21 request; the owner explicitly chose to preserve bottle income and rebalance housing costs.

## Scope and behavior

Route successful fishing catches (5 XP) and pool depletion (10 XP) to Farming, the tree containing Angler's Rhythm, Seasoned Angler and Fishing Mapping. Personal tutorial catches use the same track. Preserve historical Explorer XP, all skill ranks, loot, depletion timing and existing quest rewards; this changes future fishing awards only. Rejected/cancelled casts award nothing.

Change the first residence expansion from 3,200 to 60,000 bronze (6 gold), and the second from 4,200 to 180,000 (18 gold). Preserve bottle base price 5,000, all Vintage multipliers, the 50,000 first-bottle quest reward, ordinary furnishing prices and existing owned expansions. The first bottle plus its quest reward (55,000) no longer buys an expansion; a second base bottle reaches the first threshold (60,000). Later space competes meaningfully with estate upgrades rather than being bypassed by one sale. No new construction materials, combat or reputation gate is imposed.

## Architecture and decision

Use the existing shared residence quote function for authority and UI; put its prices in the live balance constants and pin values in economy tests. No schema change or retroactive charge. Rename fishing XP constants to express Farming accurately, updating their consumers; no duplicate XP award or retroactive migration.

Alternatives considered: lowering bottle income violates the owner's choice; adding a minimum-XP housing gate forces activity regardless of resources; charging building materials adds a second acquisition change to this balance slice. The tradeoff is a longer coin goal for expansions; base home and furnishings remain affordable, and farming/cellar sales and trade provide peaceful routes.

## Metrics and acceptance

Baseline: one 5,000-bronze bottle exceeds either expansion price; direct fishing awards zero Farming XP. Targets: standalone base-bottle equivalents 12/36 for the two individual rooms, first-bottle+quest payout below room one, and 5 Farming XP per successful fish plus10 on depletion. Current purchased expansions remain unchanged. Measure with an authored-content deterministic cost/throughput report and actual authority tests, not a claim of measured live player pacing.

Report raw and Vintage bottling throughput separately from gathering, station investment, input availability and travel. Existing legacy sim pacing measures the retired solo economy and cannot establish multiplayer housing timings. Run it as a regression where applicable, plus the new live-content model. No full live playthrough has yet established elapsed housing acquisition times.

Failure cases: invalid/stale/max expansion rank and insufficient funds cause no debit; nonowners cannot purchase; duplicate or failed fishing completion produces no extra XP. Valid quotes and actual charges agree. Preserve inventory, rooms, occupants and all old XP.

## Delivery

Separate PR, version0.14.0, no merge or deployment. Include specification, live economy table, CHANGELOG, focused authority/golden tests, report and normal repository checks. This slice depends on neither compost nor new orders, though those PRs give additional reasons to specialize and produce.
