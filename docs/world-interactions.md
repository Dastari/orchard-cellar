# World interactions

## Contract and scope

The world interaction registry owns selection of one nearby E interaction. Each
provider registers a unique name and returns currently available entity candidates
with a stable identity, position, reach, prompt and activation callback. A callback
may open local UI or request an authoritative action. Being near an entity exposes
the action; it does not automatically execute it. E (including the touch control's
E input) activates the nearest eligible candidate. Distance wins; explicit priority
and stable identity break ties. Registrations can be removed when a feature unloads.

The HUD and input handler resolve through the same registry using the current
snapshot, so movement or state changes cannot activate a stale captured frame.
Selected-item F actions remain a separate input channel and cannot hide E hints.
The existing entity adapter preserves its current specialized reach, facing,
space, mounted and availability rules. New providers do not need a new case in
that adapter. Server validation remains authoritative; this registry grants no
permissions and does not perform mutations by proximity alone.

Acceptance: empty hotbar rows render no art; real unknown items retain fallback
art; a ripe tree's E prompt survives selected-item F hints; UI-opening and
action-performing providers share selection and activation; out-of-range and
removed candidates cannot activate; ties are deterministic; duplicate provider
names fail explicitly. Existing interaction tests must remain green.

## Current anvil repair

There is **no dedicated repair panel yet**. The proposed custody/escrow repair UI
in [the unified-actions specification](unified-actions-spec.md#7-repair-ui-and-item-conservation) has not
replaced direct anvil repair.

Select a damaged durability-bearing tool/weapon, face a nearby anvil, and press F.
The selected item's authored `useWith` callback consumes **one repair material**
and charges its authored currency cost, then restores full durability. Examples
from current content: the iron axe/bow use one wood; the pickaxe uses one stone;
each costs five copper (the internal effect is named `chargeBronze`). Other tiers
use their own authored material. The server rechecks selected inventory custody,
facing, anvil capability, damage and costs before committing effects. Full tools
and insufficient materials/currency fail without a partial repair.

Repair remains an F item action, not a new E panel in this PR. Dedicated repair UI
and its escrow migration remain governed by the existing unified-actions plan.

## Empty slots and prompts

An inventory row with `itemKind: empty` or no positive quantity is not an item.
Hotbar rendering skips its icon/durability; missing-art fallback is reserved for
real unknown/retired items. Nearby E prompts and contextual F hints are composed
independently so holding food, seeds or a placeable cannot erase Pick/Open/Talk.
Only fruit-bearing ripe trees offer Pick; growing/ripening trees explain their
state, and non-fruit trees do not offer fruit picking.

## Registering another entity

`worldInteractions` in `overworld-main.ts` is the game instance of
`WorldInteractionRegistry`. Install a provider once at feature startup and retain
its disposer. The provider reads the snapshot supplied on every resolution;
filter by active space, current state and permissions before returning candidates.
`x`, `y` and `reachFixed` use player fixed-point units, not rendered pixels.

```ts
const unregister = worldInteractions.register('noticeboards', snapshot => {
  const board = nearbyBoardInActiveSpace(snapshot);
  return board === null ? [] : [{
    kind: 'noticeboard', stableId: `noticeboard:${board.id}`,
    x: board.x, y: board.y, reachFixed: 2 * TILE_SIZE_FIXED,
    prompt: '[E] READ NOTICEBOARD',
    activate: () => openNoticeboard(board.id),
  }];
});
// Feature teardown:
unregister();
```

No changes to the registry, E handler, HUD, or legacy target union are required.
Replace `activate` with a network request to perform a world action. Candidate
IDs must be stable and unique across providers. Lower `priority` wins only equal
distances; unlisted kinds default to 100. Omit `reachFixed` only for an adapter
that already applies specialized reach/facing rules. `exclusive` is reserved for
state actions such as dismount; it is not a general way to beat nearer objects.

## Review and release handoff

Branch: `fix/world-interactions-workbench`. This change is prepared as a PR; it
does not publish the game, change world schema, or ship the planned repair panel.
The workbench needs its object-content update, client/authority code and generated
atlas together. Before a later authorized release, inspect existing workbenches
for objects/players in the newly occupied right-hand cell and preserve the
separately reviewed Studio artifact. Integration with the concurrent Studio and
camera PRs must retain their changes and the highest package versions.

The renderer regressions exercise the production hotbar draw method; interaction
regressions exercise the production provider/E handler and authority footprint
validators. The native workbench review image is generated with
`npm run assets:render -- prop_cf_workbench`. The public preview currently lands
on the account screen; candidate gameplay has not been exercised in an
authenticated live browser in this branch.
