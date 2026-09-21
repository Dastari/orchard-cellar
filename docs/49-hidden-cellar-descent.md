# Hidden Cellar Delves — Phase 1

## Player loop

Marlow's tent contains a concealed trapdoor. Interacting with it opens a Delve
confirmation; only choosing **Begin Delve** starts the run and moves the player
into a private 32×32 room instance. Cancel or Escape leaves the player safely
in Marlow's tent without creating a run.

1. Clear one or more enemy waves with the player's sword or bow.
2. Choose one of three run-only boons, with visible rarity and magnitude.
3. Pick one of three labelled doors leading to a battle, elite, trader,
   sanctuary, treasure room, or the fixed act guardian.
4. Cross cave, volcanic, and dungeon acts, with a guardian in rooms 4, 8, and
   12.
5. Defeat the final guardian, take the final boon, and return to Marlow's tent.

The initial route is twelve rooms: four per visual/combat act. Room layouts are
selected deterministically from authored, connectivity-tested families. This
combines the replay value of procedural arrangement with the combat legibility
of authored spaces.

## Run isolation

`rogue_run` is the authority-owned instance record. A run receives a reserved
space id and seed, while `rogue_run_member` records the return position and the
exact pre-run health, mana, vigour, hunger, facing, and regeneration remainders.
Those values are restored byte-for-byte on victory, exiting the Delve, or death.

Run upgrades, reward offers, exits, enemies, and projectiles are deleted when
the run ends. Run enemies do not grant persistent XP, statistics, item drops,
tool wear, or arrow consumption. Persistent consumables, crafting, and item
drops are rejected during a Delve. Existing combat skills and equipped-item
modifiers are deliberately read by combat resolution, so character investment
matters without the run mutating that investment.

Completing all twelve rooms and claiming the final guardian boon now records a
full-run victory and permanently reveals the Delver Memorial Planter recipe.
This optional cosmetic reward uses peaceful crafting materials at home; no boons,
embers, combat power or gathered materials leave the run. See the
[completion keepsake contract](delve-keepsake-spec.md) for receipts, content
retirement and reconnect repair.

## Networking and future co-op

The server remains authoritative for movement, collision, enemy AI, damage,
waves, rewards, and room transitions. The client receives only:

- its caller-filtered run, exits, offers, and upgrades;
- spatial `world_npc` rows in the current region;
- compact `rogue_enemy_profile` rows containing combat metadata not already in
  `world_npc`.

No complete dungeon or inactive-room entity graph is subscribed on load.
While inside a Delve, the regional stream is reduced to player positions,
projectiles, NPCs, and rogue enemy profiles. Currency, wave, phase, and boon
updates do not rebuild that spatial subscription. Layouts are generated from
the shared seed and room metadata on client and server. The run records its
owner's current party id and has a separate member table now, but Phase 1
inserts only the owner. Co-op can later admit party members without replacing
the run, room, enemy, or reward schemas.

## Reusable systems

- Run boons feed the shared modifier resolver. `criticalChance` is now a proper
  modifier target alongside attack power, ranged power, swing speed, and health.
- Run enemies reuse streamed NPC position, facing, animation, targeting,
  knockback, hit flash, and floating combat text.
- Room generation and routing live in `@orchard/sim`, not the Canvas client or
  database module, so tests and future modes use one deterministic definition.
- Interactable entrances and destination doors use the global nearest-`E`
  interaction policy.

## Room structure and visual review

Rogue rooms use the cellar's raised cave-terrain topology rather than a flat
painted border. Blocked layout cells form joined corners, caps, and two-course
wall faces, displaced north by the wall height like every raised surface, so
the floor in front of a mass is open and the two rows behind it are a
walk-behind band; cave rooms also reuse the cellar's deterministic floor and
stalagmite decals.
Internal raised masses have a solid three-tile core so the tall wall profile
cannot produce detached one-tile faces. Five-tile cave supports are limited to
continuous wall runs and are never hung across small pillars.
Volcanic and dungeon acts keep that structural topology while applying their
own authored floor fields and wall palettes. Boundary exits use the Cute
Fantasy cave doorway composition in the cavern/caldera acts and the open
dungeon doorway in the crypt act.

Run `npm run render:rogue-rooms -w @orchard/tools` after changing a room
generator, terrain resolver, palette, or doorway asset. It renders all four
combat layout families into each
`build/review/rogue-{cave,volcanic,dungeon}-layouts.png` contact sheet, plus a
separate `rogue-{theme}-boss.png`. Every act and topology can therefore be
inspected without advancing a live run.

## Phase 1 content

| Act | Rooms | Art | Initial enemies |
| --- | --- | --- | --- |
| Cavern | 1–4 | Cute Fantasy cave floor/walls | skeletons, bowmen, cave slimes |
| Caldera | 5–8 | Cute Fantasy Volcano tiles | cowlings, pyromancers, flying skulls |
| Crypt | 9–12 | Cute Fantasy Dungeon 1 tiles | crypt blades, bowmen, mages, royal slimes |

Boons cover sword damage, bow damage, recovery speed, movement speed, critical
chance, maximum health, healing, and knockback. Rarity scales magnitude from
common through legendary. Trader offers spend run-only embers and can always be
skipped, preventing a low-currency dead end.

## Research basis

Phase 1 follows the modern room-based pattern seen in *The Binding of Isaac*
(legible special-room doors and room clearing), *Hades* (authored encounter
spaces combined with random rewards and three-choice boons), and *Magicraft*
(room routing, shops, and run-local build mutation). The layout policy also
follows David Pittman's GDC guidance for *Eldritch*: procedurally arrange tested,
authored modules rather than generating unconstrained combat topology.

- https://bindingofisaacrebirth.wiki.gg/wiki/Rooms
- https://www.supergiantgames.com/blog/hades-big-bad-update-patch-notes/
- https://store.steampowered.com/app/2103140/Magicraft/
- https://media.gdcvault.com/gdc2015/presentations/Pittman_David_Procedural%20Level%20Design.pdf
