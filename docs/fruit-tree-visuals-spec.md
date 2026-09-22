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

## PR handoff — 2026-09-22

- [PR #50](https://github.com/Dastari/orchard-cellar/pull/50), branch
  `feat/harvested-fruit-tree-visuals`, implementation commit `2c4f6432`.
- Feature complete; PR open, CI pending at handoff. No merge or deployment.
- Passed lifecycle/content validation, world and client builds, workspace type
  checks, lint, asset build/validation, 101 exhaustive tests and 15 focused
  fruit/hearth tests. Visual review confirmed matching native tree shapes.
- The initial full coverage execution passed 5,654 tests and failed 164 while
  the renderer edit was pending and local art fixtures were absent. The final
  client/engine and previously failing art-file run passed 1,184 tests; its sole
  missing custom-icon fixture was then linked and that three-test file passed.
  All observed failures were rechecked successfully; full coverage was not rerun.
- Local-only `references` and `art/custom/tool-progression` symlinks supply
  ignored artwork fixtures from the canonical checkout. No artwork was changed.
- NavyBay cleared isolated overlap in Agent Mail message 54. PR49 changes
  `overworldPlaceableVisualScale`; preserve that change alongside these resource
  visuals. Preserve highest package versions and both changelog entries when
  integrating concurrent work (this PR: root 0.21.0, client/engine 0.19.0).
- Next action: inspect PR checks and review; merge or deployment needs an
  explicit user instruction. No server or content release is required by this
  rendering-only feature.
