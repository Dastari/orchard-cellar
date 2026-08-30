# 45 — Repeatable loop: hunger, hunting, cooking, and first live skill effects

Binding owner-directed amendment (2026-08-29). Status: first playable slice implemented.

## Player loop

The short loop is **work → become hungry → hunt or harvest → cook/eat → keep
working**. The economy loop is **buy seed → tend crop → harvest → sell loose or
cure in a barrel → buy more capacity/tools**. Every durable outcome is decided
by the authority and feeds the appropriate skill track.

## Hunger

- Hunger is 0–100 and is stored as centi-points. It has no passive or offline
  drain: only successful authority-approved actions that spend Vigour consume it.
- Ordinary tool uses cost 0.2 points; sword and bow uses cost 0.35 points.
- Sprinting costs hunger in proportion to the Vigour actually spent moving.
- At 25 or below, Vigour regeneration is halved. At zero it falls to a slow 10%
  recovery rate and tool Vigour costs increase by 50%. Hunger is cozy pressure,
  not a death timer or a state that can permanently strand a player.
- Cooked meat restores 28–40 points. Fruit and edible crops restore smaller
  amounts. Raw meat cannot be eaten.

## Hunting

This amendment permits food-animal hunting in the shared overworld despite the
earlier blanket sanctuary rule. Only cow, sheep, pig, chicken, rooster, duck,
and goose are lethal targets. Horses, merchants, bees, pets, decorative animals,
and all other wildlife remain protected.

Sword and bow damage use normal resolved attributes and modifiers. A defeated
food animal drops raw meat once, awards Combat XP, disappears, and respawns at
its home after ten real minutes. Its row remains in a defeated state so the
authority does not churn population rows.

## Cooking fires

Cooking is a physical two-slot station loop: raw food enters the left slot,
progress settles from the authoritative world clock, and the cooked portion
appears in the protected right output slot. Chicken, pork, and mutton take 45
seconds per portion; beef takes 50. Cooking awards Farming XP when the output
settles, including while a player is away.

There are two craftable stations with the same interface and rules. The stone
Cooking Fire uses the outdoor fireplace artwork. The Camp Cooking Fire uses the
animated military-camp fire with a hanging pot, and replaces the decorative
fire at Marlow's camp. Ordinary campfires remain placeable lights rather than
item containers.

Processor behavior is capability-driven. A placeable tagged
`interface.cooking`, `interface.furnace`, or `interface.barrel` receives the
matching authoritative slot contract and client UI; code does not enumerate
the artwork/item kinds that may use an interface. This lets future ovens,
forges, kilns, presses, or alternate barrels reuse an existing processor by
adding metadata instead of adding client and reducer branches.

## First live skill effects

- Archery Basics: +3% ranged power per rank.
- Blade Training: +3% melee attack power per rank.
- Battle Conditioning: -5% tool/weapon Vigour cost per rank.
- Barreling is no longer a placeholder: sealing and curing award Farming XP.

These compile into the modifier pipeline alongside equipment and effects;
reducers do not branch on individual skill nodes.

## Streaming and settlement

Hunger, cooking, crop growth, furnace smelting, and barrel curing derive current
state from the world clock and stored boundary ticks. They do not write every
tick. Survival is a private own-row view; cooking input/output lives in the
region-streamed placeable slots. Wildlife and placeables remain space/chunk
subscribed, so none of these systems loads the whole world into the client.
