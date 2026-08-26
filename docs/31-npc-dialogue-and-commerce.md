# 31 — NPC Dialogue and Commerce

This document defines the reusable overworld conversation and merchant boundary.
It is separate from the retired solo-scene production currencies in
[06-progression-economy.md](06-progression-economy.md).

## Dialogue

- An interactable NPC owns a public profile linking its NPC id to a registered
  dialogue definition and optional shop id.
- The active node is an authority-owned, caller-filtered row. The client presents
  that node and sends only a choice id; it never chooses the next node itself.
- Definitions are data: speaker, body, mode, and up to four labelled choices.
  The same modal supports mouse selection and keys 1–4. Escape leaves a shop for
  its conversation, then closes the conversation.
- A conversing merchant pauses their wander loop. Transactions recheck that the
  player is authorized, unmounted, in the shop node, and within interaction reach.

The first definition is `tool_merchant`, used by the wandering merchant Marlow.
Future NPCs register another definition in the shared dialogue registry rather
than adding a bespoke UI window.

## Coin purse

Coins are a character stat, never inventory stacks. Storage uses an unsigned
64-bit count of the smallest denomination:

- 100 bronze = 1 silver
- 100 silver = 1 gold

The private wallet view exposes only the connected player's purse. New players
start with one gold. Buying and selling update the purse and inventory in one
SpaceTimeDB transaction; rejection changes neither.

## Item economy and shop

`packages/sim/src/commerce.ts` is the exhaustive item-value registry. Every item
recognized by the inventory authority has a display name and sell price; normally
stocked goods additionally have a buy price. Tests fail if the item and economy
registries drift apart.

The first merchant stocks all current tools plus arrows, torches, and lanterns.
The shop has scrollable BUY and SELL tabs, item icons/tooltips, quantity controls,
and explicit purchase/sale actions. Purchases preflight the entire destination and
never partially charge. Sales remove the exact requested quantity before credit.

## Marlow's permanent camp

Marlow is anchored to a deterministic plains campsite west of the initial
spawn. The shared survival-world generator owns the tent, animated and
light-emitting campfire, seats, pond, fishing rod, rocks, and flowers; the same
decoration footprints feed client prediction and server collision. Natural
resources are excluded from the camp interior, while the perimeter trees remain
ordinary choppable world resources. Marlow's normal wandering AI is leashed to
three tiles around his camp home and pauses during conversations.

`E` at the campfire opens the cooking-station placeholder. Recipes and food
processing remain deferred; the interaction, modal, fire animation, lighting,
and collision are ready for that later system.

## Held lights

Torch and lantern are hotbar items with licensed dedicated idle/walk overlays.
Selecting one displays it in the character's hand and contributes its point light;
selecting another item removes both. They occupy the active hand and therefore do
not combine with a tool action.

## Scalability note (2026-08-26)

Per [34-backend-scalability.md](34-backend-scalability.md) N2/N3: non-wildlife
NPCs (merchants, dialogue NPCs) currently step and write their row every tick
with no proximity gate. Doc 34 stage 1 adds the wildlife-style no-op write
guard; stage 3 gates their stepping to online-player chunk neighborhoods and
gives `active_dialogue` a `by_npc` index. Authored NPCs must stay correct when
frozen: dialogue/commerce state lives in rows, not in tick continuity.

## Amendment (2026-08-26, docs/35)

The homestead farming economy ([35-homesteads-and-farming.md](35-homesteads-and-farming.md))
extends the commerce registry with every crop, seed, and barreled good; the
registry drift test covers them. The farm deed and seeds are merchant-stocked
(Marlow v1). Coins remain the single currency; no farm-side currency exists.
