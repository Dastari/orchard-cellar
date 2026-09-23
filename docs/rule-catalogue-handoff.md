# Rule catalogue groundwork handoff

PR [#73](https://github.com/Dastari/orchard-cellar/pull/73), branch
`feat/rule-catalogue-groundwork`, isolated worktree
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

Validation results are recorded on the PR. No merge or
release authorization is implied.

Checks completed before PR:

- 111 focused sim/engine/schema/content regression checks passed.
- Repository lint, content validation (919 definitions), asset validation
  (1,320 assets) passed.
- Workspace typecheck completed; the one world ES2021 compatibility error was
  fixed and world typecheck rerun successfully.
- Asset build, Studio production build with UI-kit guard, world build passed.
- Full `npm test` coverage/exhaustive is running; final result goes on the PR.

The standalone exhaustive run caught a real Tiles JSON editor limit (32 KB)
that clipped the 51 KB formatted catalogue. The editor now sizes for the compact
wire limit plus formatting and existing definitions. Its 25 tests, Studio types,
lint and guarded production rebuild pass. Local `references/` is linked to the
canonical ignored licensed art; all 147 previously missing-art checks pass.
The superseded coverage process cached pre-follow-up code/manifest; it was
stopped. Fresh targeted coverage passed all 21 relevant checks. Final full-suite
log is `/tmp/copper-final-full-test.log`.

BrownHorizon #179 authorizes a next stacked PR `feat/rule-catalogue-blob47`
after this PR's final validation: migrate hoed soil, authored farmland and grass
fringe using goldens; retain distinct catalogue entries if unifying changes
pixels. No merge/deploy/publish.

## Wave 1 integration rehearsal

Integrated preceding #62/#64/#66/#67/#65/#70/#68 source heads in an isolated
fix worktree, preserving the original author’s full-suite snapshot. Refreshed
14 cliff baseline hashes only (desert 1–3, shroomlands, volcanic), independently
comparing every integrated baseline output to reviewed PR62 head `98732c7e`;
all outputs match that reference. Other golden hashes are unchanged.
Regenerated F1 field schemas for catalogue roles including optional medium.
Higher package versions and all documentation/exports are preserved.

Measured integrated bootstrap: 919 definitions / 25 kinds; runtime payload
582,718 bytes, authoring row envelope 732,476 bytes, hash `b3f30168`. Catalogue
adds 23,186 bytes (+4.14%) over the prior 559,532-byte runtime payload. The
measured next-KiB regression guard is 570 KiB (583,680 bytes), not a wire cap.
