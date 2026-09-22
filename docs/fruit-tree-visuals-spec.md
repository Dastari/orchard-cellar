# Harvested fruit tree visuals

## Scope and acceptance

Picking an existing mature apple, pear, peach, or cherry tree must remove its
visible fruit once the authoritative resource update arrives. Keep the living
canopy and trunk. Restore the fruit sprite when the authority clock reaches
`fruitReadyAtTick`, including for reconnecting players and other observers.
Immature trees and chopped stumps retain their existing presentation. No changes
to harvest rewards, cooldowns, collision, network schema, or world content.

## Design decision (accepted)

The four existing fruit sprites share the native Kenmi Big Fruit Tree shape.
Reuse the already loaded `tree_cf_fruit_mature` sprite for the fruitless state;
its wider transparent canvas has a correspondingly centered anchor. No new art
or generated asset is necessary. Keep this mapping in the renderer alongside
the existing intrinsic fruit asset mapping, rather than adding content/schema
fields solely for these four existing sprites. Future distinct fruit tree art
will need its own matching fruitless mapping.

Select fruitless only for a mature, standing resource with `fruitHarvest` whose
`fruitReadyAtTick` is greater than the authority tick. Missing timestamps mean
ripe for compatibility. Unknown/custom art retains its authored mature sprite
rather than substituting an unrelated tree. Preserve tree sway and native scale.
Keep the existing stable mature-tree lighting occluders: picking changes the
fruit artwork, not the structural tree geometry. This avoids invalidating the
collision/lighting cache merely because a fruit cooldown expires.

## Verification

Exercise the actual painter and engine with native sprite fixtures for all four
fruits: ripe, picked, before/exactly at/after cooldown expiry, reconnect snapshot,
missing legacy timestamp, immature growth, chopped stump, and non-fruit trees.
Check native anchor contact, dimensions, draw count, and nonzero sway. Inspect a
sprite comparison visually. Run repository checks and a client build. This PR
is not a production deployment.
