# Chest inventory controls PR handoff

- PR: https://github.com/Dastari/orchard-cellar/pull/9
- Branch: `fix/chest-inventory-controls`, from upstream main `88931047`.
- Restores Sort & Stack to both authored chest panes and shares backpack search
  across chest/backpack items. Filtered slots preserve custody and restrictions.
- [Design and verification](chest-inventory-controls.md) records the regression
  tests and local browser interactions with the actual canvas renderer/artwork.
- Typecheck, lint, lifecycle integrity, world/sim/client builds and asset
  validation pass. Full coverage result is recorded in the PR testing section.
- Client/UI patch version 0.7.1. Fruit seed feature PR #8 uses 0.8.0; retain the
  newer version when integrating shared package/changelog files.
- No migration, merge or deployment performed.
