# 46 — Live First-Bottle Production Loop

Binding owner-directed implementation amendment (2026-08-29). Status: **phase 1
and the guided first-bottle milestone implemented**.

## 1. Purpose and existing-system boundary

The live repeatable estate chain is:

```text
harvest fruit → press → Must + Pomace → ferment/age → Bottles → sell → reinvest
```

This adapts the proven deterministic economy in `packages/sim/src/economy.ts` to the
authoritative shared world. It does not revive the retired solo estate scene or its
global resource counters.

The existing `interface.barrel` loop remains crop preservation: 4–24 matching crops
are sealed for 30 minutes and become preserved food. A fermentation vessel is a
different capability, recipe, slot contract and output. The two systems share
timestamp-derived settlement and inventory safety but do not overwrite one another.

## 2. First vertical slice

- Apples, pears, peaches, cherries, and grapes are pressable Fruit.
- A Fruit Press accepts Fruit in one input slot. Each five-minute cycle consumes one
  Fruit and produces one Must plus one Pomace in protected output slots.
- A Fermentation Cask accepts three Must in one input slot. One thirty-minute cycle
  produces one Bottle in a protected output slot.
- Three sequential press cycles plus one fermentation cycle take 45 minutes, matching
  docs/06's 45–70 minute first-bottle window before gathering and handling time.
- Starting, completing, and collecting production uses the generic placeable inventory
  authority. Progress derives from the world clock and stored start boundaries; no
  processor receives a per-tick scheduled row.
- Pressing and fermentation award Farming XP and typed lifetime statistics. Bottles
  sell through the existing merchant transaction for a clear premium over their raw
  Fruit inputs.
- The Fruit Press is workbench-crafted. The Fermentation Cask upgrades an existing
  crafted Barrel, keeping wood/metal gathering, smelting, crafting, farming, and
  commerce in one loop.

## 3. Capability contract

`interface.press` and `interface.fermentation` are item metadata capabilities, not
artwork checks. An appropriately tagged placeable receives its authoritative slot
capacity, restrictions, settlement and UI. The basket press and oak cask are the first
art consumers; future presses or vessels may reuse the same behavior by tagging their
item definitions.

## 4. Acceptance

- Invalid slot insertion and manual output insertion are rejected by the authority.
- Removing/changing input settles elapsed work first and resets only the invalidated
  boundary; completed output is never duplicated.
- Full output pauses production without consuming input; clearing output resumes from
  a fresh authoritative boundary.
- Disconnect, reload and host restart preserve exact progress.
- Regional subscriptions expose only the placed station and minimal public progress
  fields; private slot rows remain available only through the caller's active-placeable
  view.
- Selling Bottles credits the server-derived price and records the existing commerce
  statistics in the same transaction.

## 5. Guided first Bottle and reinvestment

- After turning in *A Very Important Book*, Marlow offers *From Orchard to Cellar*.
  Prerequisites are authority-checked; unavailable dialogue choices and map markers
  remain hidden on the client as presentation only.
- Quest progress snapshots lifetime counters on acceptance, then requires three new
  press completions, one new Bottle, and one actual sale of `bottles` to Marlow.
  Existing Presses and Casks are valid—the quest never forces players to duplicate
  stations they already built.
- Turn-in awards 5 gold, 250 Farming XP, and raises the owner's Homestead to Tier 1.
  Tier 1 opens a 48×48 plot north/east/west of the original 32×32 plot while retaining
  the established southern gate, portal path, residence, crops, and placed objects at
  their exact coordinates.
- Client terrain and authority collision keys include the resolved Homestead size, so
  expansion takes effect immediately and never reuses a stale Tier-0 collision map.

## 6. Estate Vintage progression

The permanent Estate Vintage ladder keeps `bottles` as one stack/quest kind while
changing the estate's active aging programme. Ranks cost 6 / 18 / 54 gold and change
one cask cycle and Marlow's authority-derived unit price as follows:

| Rank | Label | Aging | Bottle value |
|---:|---|---:|---:|
| 0 | Estate | 30 min | 120 bronze |
| 1 | Select | 45 min | 240 bronze |
| 2 | Reserve | 60 min | 480 bronze |
| 3 | Grand Vintage | 90 min | 960 bronze |

The output item remains `bottles`, preserving stacking and the guided quest. The cask
label, progress/remaining timer, merchant quote, and sale transaction all derive from
the same rank; only the server computes the credited premium.
