# Wildlife, habitat packs, and hives

Wildlife is a deterministic layer over survival terrain. It does not alter the
terrain/resource version and can therefore be regenerated without touching player
identity, inventory, farms, soil, chests, or the authored starter horse.

## Generated population

`generateSurvivalWildlife()` produces 278 durable NPCs from the
world seed. It covers horses, cows, sheep, every pig colour, chickens and roosters,
ducks, geese, swans, frogs, mice, butterflies, bees, normal and albino capybaras,
camels, scarabs, vultures, and the animated Shroomlands snails.

Horses use solitary placements and have no display name. NPC `1` remains Nados Mum.
Every other animal has a stable pack ID and a habitat-correct home cluster. Waterfowl
stay in inland freshwater/oasis water, frogs stay on lake shores, capybaras use
wetlands, desert animals use desert/savanna, and hives use meadow/forest clearings.

## Authority and lifecycle

`world_npc` remains the moving authority row. Static species, colour variant, pack,
and habitat data lives in the additive `world_wildlife_profile` table. This separation
leaves a clean path for later health, breeding, taming, ownership, and loot tables.

The scheduled world reducer activates wildlife only within three chunks of an online
player. Activated animals make deterministic idle, forage, travel, return-home, and
sleep decisions; distant animals retain durable state without per-tick writes. This
is the equivalent of Minecraft's entity activation range, adapted to one shared
SpaceTimeDB schedule rather than hundreds of independent timers.

Movement styles are species-specific: walking, hopping, swimming, or flying. Travel
uses eight directions with normalized diagonal speed. Daytime decisions favour long
static rest/forage periods over shorter walks, while authored sleep takes over at
night. Rest poses hold one frame so the population does not continuously bob; an
animal that is actively flying always uses its flight row. Terrain habitat checks run
on the server. Client interpolation deliberately does not apply the player collision
map to water/flying NPCs.

Ducks, geese, swans, and capybaras require a complete 5x5 inland-water neighbourhood
for both generation and movement. This excludes narrow rivers and gives their 32px
sprites a two-tile visual buffer from shoreline tiles. Their island-wide population
is deliberately restrained to six ducks, two geese, two swans, and two capybaras.

Butterflies never enter sleep or a static wing pose: their two authored wing states
use the continuous client animation clock even while their server position pauses.
Sleeping ducks and swans retain their exact authoritative position and bypass client
interpolation until they wake. Resting horses hold a single authored frame.

Flutter locomotion is an airborne state. Bees, butterflies, and flying vultures may
cross terrain and resource blockers (and may pass over water), but an idle, sleep, or
hive state can begin only on that species' valid dry habitat. A flyer caught above an
invalid landing tile continues toward its dry home instead of resting there.

## Hives

Eight deterministic hive/nest colonies are generated. Each colony owns a fixed roster
of five bees. Bees spawn hidden inside their hive, emerge on staggered daytime sorties,
and fly home before becoming hidden at night. A coarse server reconciliation restores
any missing roster member at its hive spawn point. During daylight the authoritative
`world_hive` row accumulates honey at a bounded, coarse interval; no harvesting reducer
exists yet. This preserves the state needed for future beekeeping without prematurely
defining items or balance.

## Art contract

`extract-cute-fantasy-wildlife.ts` imports every colour sheet with exact licensed
palettes and family-specific row maps. The runtime selects directional idle/walk,
forage, sleep, swimming, hopping, and flying animations. Capybaras additionally cycle
through their separately authored look, dive, bubbles, submerged, and emerge strips
when in water. Mounted horses retain their unmounted colour.

Hit animations are imported but intentionally dormant. When entity health is added,
damage, death, meat/loot, and respawn policy must remain server authoritative and use
new additive state rather than overloading visual activity fields.

## Rollout record

The production module was updated on 2026-08-25 using an additive SpaceTimeDB
migration; no identity, membership, inventory, farm, chest, resource, or existing NPC
table was reset. Before publication, the quiesced database archive was SHA-256 checked
locally and again after an encrypted SMB upload/download round trip. The copies are at
`/home/toby/backups/orchard/20260825T115716Z-pre-wildlife` and
`orchard/world/20260825T115716Z-pre-wildlife` on the approved NAS share.

The migration created `world_wildlife_profile`, `world_hive`, and the private
generation marker. Its first scheduled step spent 11.5 seconds building and inserting
the deterministic layer; subsequent ticks recovered without further delay warnings.
Both runtime services, loopback health, the public HTTPS route, and the deployed atlas
were verified after publication. A follow-up corrected the butterfly source layout to
eight colour variants with two 8x8 wing states each, constrained waterfowl to a full
water clearance ring, and made sleep freeze movement immediately. Those corrections
have focused extraction, simulation, and rendering regressions in addition to the
repository build, typecheck, lint, and test gates.

Generation version 3 adds deep-water-only aquatic placement, weighted static rest,
diagonal movement, corrected vulture flight mirroring, and hive bee sorties/roster
reconciliation. It regenerates only deterministic wildlife and hive rows. The verified
pre-v3 backup is at `/home/toby/backups/orchard/20260825T121851Z-pre-wildlife-v3`
and `orchard/world/20260825T121851Z-pre-wildlife-v3` on the NAS.

Generation version 4 reduces freshwater populations, keeps invalid legacy swimmers
from shoreline/land tiles, makes butterfly flight continuous, pins sleeping animals,
and applies dry-landing semantics to airborne wildlife. It remains a source/build
change until the concurrent surface-world expansion is ready for its coordinated
backup and publication gate.

The version-2 correction was preceded by another verified quiesced backup at
`/home/toby/backups/orchard/20260825T120536Z-pre-wildlife-v2` and
`orchard/world/20260825T120536Z-pre-wildlife-v2` on the NAS.
