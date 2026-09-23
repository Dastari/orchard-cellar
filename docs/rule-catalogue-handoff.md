# Rule catalogue groundwork handoff

Branch `feat/rule-catalogue-groundwork`, isolated worktree
`/home/toby/projects/orchard-rule-catalogue`, base `origin/main` 2e1d9a4f.
Implements BrownHorizon's assignment #115 from doc 61 §4 / PR #63.

The optional catalogue envelope, strict parser, deterministic frame interpreter,
connect4 migration and frozen baseline inventory are implemented. No terrain
resolver, map-document/compiler, deployment or world publication was changed.
See [contract and limitations](rule-catalogue-spec.md).

Integration:

- Preserve other lanes' sim exports/subpath exports and version/changelog work.
- F1 field schemas must be regenerated with its generator after adding the
  `TilesetContentDefinition.ruleCatalogue` field (DustyCompass confirmed).
- PR #62 deliberately changes terrain art; refresh its affected baseline hashes
  only with that lane's reviewed mapping evidence.
- The parser must ship in the world module before publishing catalogue content;
  an old world parser strips the unknown optional field.
- Next P4 slices migrate other family kinds and the guide; P5 shared placement
  remains separate. Current bootstrap map-prefab joins preserve the existing
  authored-map runtime, while live objects consume published catalogues.

Validation results and PR URL are recorded on the PR when opened. No merge or
release authorization is implied.

Checks completed before PR:

- 111 focused sim/engine/schema/content regression checks passed.
- Repository lint, content validation (919 definitions), asset validation
  (1,320 assets) passed.
- Workspace typecheck completed; the one world ES2021 compatibility error was
  fixed and world typecheck rerun successfully.
- Asset build, Studio production build with UI-kit guard, world build passed.
- Full `npm test` coverage/exhaustive is running; final result goes on the PR.
