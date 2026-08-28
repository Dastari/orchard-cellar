# 40 — Sanctuary Overworld and Zoned World Direction

Binding owner-directed direction, adopted **2026-08-26**. This is the newest
gameplay/world-structure document and supersedes every earlier description of the
overworld as a generally destructible survival/resource field, every assumption that
player estates appear there at literal building scale, and every plan that permits
ordinary overworld combat. Earlier documents remain binding for their implemented
technology, data contracts, balance, art, and content where this document does not
conflict.

**2026-08-27 extent amendment:** [43](43-procedural-sanctuary-and-signed-coordinates.md)
supersedes this document's finite hand-authored topology assumption, not its gameplay
rules. The sanctuary surface is now a large seed-generated signed-coordinate world
with sparse permanent admin curation. It remains safe, scenic, non-destructive, and
connected to typed resource/danger/social destination spaces exactly as specified
below.

The transition is deliberately staged. The current generated island and its shipped
resource verbs remain available as a temporary development fixture until the Shared
Spaces technology demo in §8 passes. Do not spend milestone work polishing or
expanding destructive overworld gameplay during that interval.

## 1. Binding world fantasy

The shared overworld is a permanent, safe, beautiful social and travel layer. It is
the connective map on which players meet, discover destinations, visit merchants and
towns, encounter authored events, and choose where their Homestead entrance belongs.
It is not the friends-server's exhaustible lumber yard, mine, construction sandbox,
or combat arena.

Gameplay that mutates terrain, consumes natural resources, permits construction, or
introduces danger happens in an appropriate logical space reached from the overworld:

```text
                             shared overworld
                    safe, scenic, non-destructive
                                  |
          +-----------------------+-----------------------+
          |                       |                       |
          v                       v                       v
  player Homesteads        resource/danger zones       shared places
  farm + residence         forests, caves, mines       towns, festivals
          |                       |                       |
          +----------- all are spaceId worlds ----------+
```

"Instanced" continues to mean a logical coordinate world in the same authoritative
SpaceTimeDB database, partitioned by `spaceId`. It never means one database or module
deployment per player or destination. Docs 08, 19, 22, 26, and 34 remain binding for
authority, persistence, transition, subscription, isolation, and cache behavior.

## 2. Sanctuary-overworld contract

At the target migration state:

- Generated terrain, elevation, water, cliffs, vegetation, rocks, wildlife, ruins,
  camps, roads, and authored landmarks are immutable scenery. Players cannot fell,
  mine, damage, remove, relocate, or build over them.
- The overworld has no hostile creatures, damage-dealing combat, projectile hazards,
  or knockout caused by ordinary play. It is always a safe zone.
- Three authored non-hostile archery targets are the sole combat-practice exception.
  Only those rows accept bow damage; they cannot attack or die, regenerate to full,
  award no drops or Combat XP, and may be relocated only through their dedicated
  above-head carry transaction. This is a curated POI fixture, not freeform building.
- Gathering tools and weapons do not target decorative overworld entities. Art and
  interaction feedback must distinguish scenery from an actionable zone resource;
  never let a valid-looking hit silently do nothing.
- Freeform construction, arbitrary placeables, persistent dropped-item clutter,
  and resource planting are prohibited on the overworld. Player crops are the
  narrow exception: they may occupy explicitly tilled, authority-owned soil and
  do not mutate generated terrain or decorative ecology.
- Social actions, dialogue, commerce, quests, discovery, navigation, mounts, harmless
  emotes, weather, time, and authored world events remain appropriate.
- Seasonal and event presentation may replace scenery cosmetically without changing
  the immutable base topology.

"Static" has one narrow exception: sparse authoritative **point-of-interest (POI)
state** may be created or updated. Homestead entrances, event markers, administrative
notices, and similar designed landmarks live in this layer. They do not delete or
rewrite base terrain/ecology and are not a general-purpose overworld build system.

## 3. Points of interest use symbolic scale

An overworld building or cluster is a readable map symbol for a destination, not a
one-to-one exterior. Follow the classic world-map convention: a small, recognizable
tent, village cluster, mine mouth, tower, or grove tells the player what lies there;
interacting with its entrance transitions to the full-scale space.

- POIs use compact authored footprints chosen for navigation and readability.
- Every POI declares its destination, entrance tile, collision, access policy, map
  label, and optional discovery/quest state as data.
- A town icon may be a small composition of visually related buildings even though
  the town space contains streets and full-scale structures.
- The path into and out of a destination is authored/generated at both ends so the
  transition is spatially legible.
- Literal sprite dimensions in a destination never dictate the POI's overworld land
  reservation. When needed, the asset pipeline produces a reviewed symbolic variant
  rather than applying arbitrary runtime scaling.

The later overworld-authoring tools must place terrain, scenery, POIs, portal pairs,
NPC/event anchors, protected regions, paths, and map labels. They must validate that
every entrance has a reachable return and that POI footprints do not overlap.

## 4. Homestead destination model

Marlow sells one **Homestead Deed** per character. Its inventory icon is the plain
mail/envelope cell extracted from the licensed `Cute_Fantasy_UI/UI/UI_Icons.png`
sheet with normal source metadata. It is stack-one, non-droppable, non-storable,
non-giftable, and non-resellable; a rejected placement never consumes it.

Using the deed on valid sanctuary-overworld ground creates a compact tent POI. This
tent represents the player's full property; it is not a one-to-one building and does
not reserve land for the final residence sprite. Placement validates only its compact
POI footprint, protected-distance rules, reachability, and non-overlap with immutable
terrain/other POIs. The transaction creates ownership, destination definition,
portal pair, POI, name/sign state, statistic, and consumes the deed atomically.

The complete target Homestead consists of two player-owned destination spaces:

1. **Homestead exterior.** A generated farm landscape with the entry path at the
   southern side and the residence at the northern side. Its founding profile is a
   magnified interpretation of terrain surrounding the overworld POI: nearby water
   becomes a broader stream/pond influence, nearby forest becomes a wooded boundary,
   and nearby elevation becomes the corresponding cliff/highland character. It
   preserves a usable central farm/build clearing.
2. **Residence interior.** A separate furnishable space entered through the northern
   residence. Indoor floors, walls, doors, beds, storage, cooking/crafting stations,
   lighting, and furniture use the licensed indoor house/decor sets and the normal
   space-aware placement/storage authority.

Freeze the founding coordinates, world version, environmental signature, generator
version, and derived seed when placement commits. Re-entry and server restart rebuild
the same Homestead even after later overworld generator changes.

Residence/exterior progression is:

| Tier | Symbol/full residence | Exterior size target | Interior character |
|---:|---|---:|---|
| 0 | Big Tent | 32x32 | authored tiny tent interior |
| 1 | Shed | 48x48 | small single room |
| 2 | Fisherman's House | 64x64 | medium home |
| 3 | Blacksmith House | 80x80 | large home/workshop |
| 4 | Inn | 96x96 | large multi-room estate |

The overworld POI changes to a compact symbolic representation of each tier. Inside
the Homestead exterior, the residence uses its full reviewed sprite and remains
anchored on the north side. Each upgrade expands land and indoor buildable area while
preserving existing crops, paths, furniture, and placeables. Capacity is principally
spatial, with tier gates only where a station or room type needs them.

Homestead farming, orchard/cellar production, building, storage, guest roles, and
automation remain governed by docs 03–06, 28, 35, 37, and 38 as amended here. There
is no freeform overworld building or destructive resource-planting hook. The
2026-08-28 crop amendment permits farming only through sparse `world_soil` and
`world_crop` rows.

## 5. Resource, danger, and social zones

Existing survival/resource work becomes reusable zone content rather than an
overworld entitlement.

### Forest zones

Forest trail/grove/logging POIs lead to harvestable woodland spaces. Trees, fiber,
forage, and later woodland events live there. Players can also grow renewable trees
at home. A forest may be shared, owner-bound, or party-bound, but its definition must
declare that policy; do not let implementation accidentally decide it.

### Caves, underground spaces, and mines

Cave/mine POIs lead to underground spaces with rock, ore, darkness, lighting, and
later opt-in danger. Peaceful gathering levels may precede hostile depths. Doc 26's
shared persistent mine design remains a valid destination policy; later party caves
may use bounded instances. No hostile or mineable content leaks back to the sanctuary
overworld.

### Towns and authored destinations

Town, market, festival, quest, event, and specialist-vendor POIs lead to full-scale
shared spaces. The overworld miniature communicates theme and importance rather than
literal geometry. Marlow may remain at his current overworld camp; future shopkeepers
can live in towns or destination spaces.

### Instance lifecycle and anti-exploitation

Every non-static instance kind declares: deterministic seed derivation, owner/party,
access policy, persistence, reset/regeneration schedule, collected/depleted state,
maximum concurrently resident instances, cache eviction, and retirement. Enter/leave
must never reroll resources or rare layouts. Reset is an authoritative scheduled or
explicit versioned event, not a reconnect trick. Rewards, harvesting, and statistics
commit once in the same reducer transaction.

## 6. Safety, permissions, and simulation

- Authority checks the current space kind for every combat, gather, farm, build, and
  placement reducer. Client visibility and UI modes are never authorization.
- `sanctuary` rejects damage to players, NPCs, wildlife, scenery, and resources,
  harvesting, destructive tools, soil verbs, dropped world items, and freeform
  placement. The deed transaction and §2's dedicated archery-target practice/carry
  paths are the only named POI exceptions.
- `homestead_exterior` permits owner/role-gated farming and building; its residence
  interior separately permits owner/role-gated indoor placement.
- Resource/danger zones permit only the verbs declared by their zone profile.
- Hot simulation is built exclusively from occupied space/chunk neighborhoods.
  Offline Homesteads and inactive resource zones do zero 20 Hz work.
- Generated terrain/collision caches are capacity-bounded and instrumented. Leaving a
  space evicts replicated client rows after make-before-break handover; it never
  deletes durable authority state.

## 7. Migration strategy

Do not perform a flag-day rewrite before spaces are proven. Migration proceeds in
this order:

1. Complete and prove the Shared Spaces technology demo in §8 using the current
   overworld as its launch surface.
2. Adopt a typed space/zone profile registry and authority capability checks.
3. Build doc 43's pure seed generator, seed overview, and authoring/validation tools;
   select and curate the sanctuary spawn region, roads, POIs, entrances, events,
   quests, towns, and shopkeepers as sparse semantic overrides.
4. Move gathering/resource content into forest/cave/mine destinations and make their
   reset/persistence policies explicit.
5. Disable destructive targeting, combat, freeform placement, and dropped-item
   persistence in the overworld; reconcile or retire existing mutable rows through a
   versioned migration.
6. Verify two-client safety, restart/backup, no-depletion presentation, POI navigation,
   and per-space performance before declaring the sanctuary migration complete.

The current generated terrain/elevation work remains valuable: it supplies semantic
topology and reusable terrain providers. Doc 43 reactivates lazy seed terrain without
reactivating a destructible wilderness: generated terrain stays implicit, normal
players cannot alter it, and only sparse curation/materialized entity state is stored.

## 8. Immediate vertical slice — Shared Spaces technology demo

This is the **next implementation milestone**. It proves zoning before changing the
overworld's gameplay role. It is intentionally a technology/content sample, not the
final forest economy, mine progression, Homestead upgrade ladder, or authored world.

### 8.0 Implementation status (2026-08-26)

Phase 1 of the dynamic Homestead sample is implemented: Marlow stocks the unique
envelope-icon deed; its atomic placement creates a compact military-tent POI, a
grass-blended entrance path, durable owner/access data, and a paired dynamic-space
portal. The 32x32 exterior magnifies terrain sampled around the founding coordinate,
keeps a central clearing, places the full military tent toward the north, and provides
an indestructible one-tile path to the southern return portal. Access is deliberately
`public_demo`; the authority already models owner and guest-list access for the later
default-private switch. Phase 2 remains the generated tent interior and its cellar
trapdoor/dungeon child space.

### 8.1 Static test destinations

Add three deliberately small, deterministic destinations to the shared space
registry, each with a physical test entrance and return portal:

1. **Test forest zone** — outdoor ambient/weather contract, forest terrain and
   collision, a very small set of harvestable test trees/fiber, and isolation from
   identical coordinates in every other space.
2. **Test cave** — cave entrance presentation, fixed underground ambient/audio,
   irregular cave terrain, wall collision, and portable/placed-light behavior.
3. **Test underground** — a deeper constructed mine/interior sample with a second
   portal hop, different bounds/ambient, one test rock/ore interaction, and correct
   return routing through the cave.

Test resources exist to prove space isolation and reducer authorization. Do not tune
their economy, build reset farming, add combat, or produce final cave/forest content
in this milestone.

### 8.2 Dynamic Homestead sample

- Add the Homestead Deed to Marlow's stock and use the licensed plain-envelope icon.
- Allow one deed per character and place a compact, normal tent POI on valid current
  overworld ground. This temporary art/footprint proves the transaction; it need not
  implement the final symbolic tier compositions yet.
- Allocate a durable dynamic `spaceId`, create the Homestead row and portal pair
  atomically, and enter a simple generated tier-zero Homestead exterior.
- Put a full-size tent on the exterior's north side and a generated path between its
  southern arrival/exit and the tent.
- If affordable within the slice, make the tent door enter its authored tent-interior
  child space; otherwise the schema/portal relation must reserve that explicit next
  step without pretending the exterior itself is the residence.
- Placement, reconnect, host restart, and re-entry reproduce the same owner, POI,
  terrain, paths, and coordinates. A rejected placement never spends gold or deed.

Environmental magnification, building tiers, crops, indoor furnishing, guest
requests/roles, and automation are target behavior from §§4–6, but follow after the
technology demo unless needed to validate the underlying dynamic-space contract.

### 8.3 Infrastructure acceptance

- Dynamic definitions come from indexed authority rows and arrive before/with the
  destination subscription; render only after definition plus regional snapshot.
- Transition is atomic, server-authorized, range-checked, and make-before-break.
- Terrain, collision, camera bounds, ambient, weather, audio, rendering, interaction,
  prediction, remote interpolation, and private/public subscriptions all select the
  active `spaceId` correctly.
- Two clients can occupy the same test destination and observe the same public state;
  entities at identical local coordinates in other spaces never leak across.
- Homestead entry is owner-only for the demo. Unauthorized entry and forged portal,
  target-space, resource, build, and interaction attempts fail at authority.
- Carried/held/open interaction state transitions safely or closes according to its
  registered policy; no chest, mount, projectile, dialogue, or placeable crosses a
  portal accidentally.
- Authority and client generated-data caches are bounded. A 1,000-space-id churn soak
  returns resident cache entries to the configured bound; unoccupied spaces add zero
  work to the hot tick.
- Full repository checks, two-client browser traversal, reconnect, host restart, and
  backup/restore evidence are recorded before the demo is complete.

## 9. Explicitly deferred until after the demo

- Sanctuary-overworld conversion and destructive-row reconciliation.
- Final overworld hand-authoring tools and POI composition editor.
- Production forest regeneration, loot balance, and instance allocation policy.
- Mine progression, metals/smelting, hostile caves, and combat.
- Homestead environmental magnification, residence tiers, crops/gold loop, build
  mode, indoor furnishing, guest permissions, and automation.
- Town maps, events, quest chains, additional vendors, and festival destinations.
- Ordinary-player destructive or voxel-style terrain editing. The safe generated
  sanctuary and sparse admin curation now proceed under doc 43.

These are not cancelled. The demo exists to make their common zoning substrate real
before content work commits to it.

## 10. Definition of target success

The direction is realized when the overworld stays attractive and safe regardless of
player activity; every destructive or dangerous verb is confined to a destination
whose lifecycle and permissions are explicit; Homestead POIs lead to expandable farms
and furnishable residences; towns/events/vendors are authored destinations; and two
friends can move among these spaces without state leakage, duplication, griefing,
unbounded server work, or reconnect-based rerolls.
