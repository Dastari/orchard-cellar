# Facing-based tool swings

## Objective and scope

Per the owner's September 16 clarification, every item with a swing action uses
the player's facing, requires no selected target, contacts every hittable entity
in its area, and loses durability for every contact. Sword/axe use a short arc;
pickaxes use a shorter, narrower arc. Include swinging hoes while retaining their
explicit tile-use farming actions. E remains interaction; F performs the swing.

## Contract

- Author per-tool swing range and angle in item content. Initial sword/axe range
  is 1.5 tiles over 90 degrees; picks use 1 tile over 45 degrees; hoes use 1.25
  tiles over 90 degrees. Preserve existing sword damage and author modest melee
  damage for other swing tools by tier.
- The client sends a targetless secondary action. The authored lifecycle emits
  the trusted world-tool swing primitive. The server chooses contacts in the
  actor's current space and facing using bounded nearby chunk queries.
- Apply each target at most once, with deterministic ordering. Include active
  resources, creatures/enemies, training targets and damageable placed objects.
  Exclude carried/depleted/absent targets and do not strike through terrain.
- Spend stamina and establish the cooldown/animation once per swing, including
  the existing reduced-cost empty swing. Wear is proportional to geometric
  contacts, even when an object resists the selected tool. Clamp durability at
  zero after resolving the swing; one swing cannot charge repeated stamina or
  cancel later contacts by breaking the tool halfway through its contact list.
- Preserve ownership, protected NPC/object, mining-tier, resource access, loot,
  claim, and salvage rules. Contact does not grant otherwise unavailable yields.
- Broken/unusable tools, insufficient stamina, cooldown, occupied hands, mounted
  melee, or missing authored swing capability reject the entire action. Expected
  target-specific resistance skips that target's mutation, not other contacts.
  Unexpected failures roll back the reducer transaction.
- Cursor/selected entity must not rotate or restrict a swing. Existing explicit
  repair, farming, cellar excavation and interaction commands remain available.
- A swing is a sector of *entity* contacts and cannot excavate terrain. The swing
  key therefore keeps the explicit cellar-wall strike ahead of the swing whenever
  a wall is in reach and no resource is targeted; every other case swings.
- Contact geometry is measured in one frame. A resource's contact point is
  authored relative to the interaction origin, so its reach is measured with that
  same vector from the actor's position; elevation and line of sight use the
  contact's true world point.

## Verification

Test eight facings, sector edges, behind/outside misses, narrower pick geometry,
multiple target kinds in one swing, per-contact wear, one stamina charge, empty
swings, tool break, protected/resistant targets, ownership and missing content.
Exercise the actual client input and server lifecycle routes. Run lifecycle
integrity, typecheck, lint, tests/coverage, asset validation and checked builds.

## Related UI fix

Keep the normal hotbar tool label to one line. Detailed equipment information is
shown on hover/focus in a bounded panel above the hotbar, with touch selection
retaining a compact label. It must not overlap the slots being manipulated.
