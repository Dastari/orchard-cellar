# Food and alchemy artwork integration — DO NOT MERGE

Coordinator: GoldCondor. Rehearsal: CopperMaple. Art owner: OrangeCastle.
Base: runtime main `a45d6e704f8f1ec1262b98433ed1e2bba1a7179a`.
No gameplay changes, deployment or source-branch pushes are included.

## Immutable inputs and merge ledger

| Order | PR | Exact source head | Rehearsal merge |
|---|---|---|---|
| 1 | #90 | `c132e2a6e6ff9ab0a9db6bbb06d730afe8f133b7` | `e0c08b40` |
| 2 | #91 | `4a46b587b5ca457bbeabd17a1b646de0fbc5f33e` | `f4c9fd05` |
| 3 | #92 | `758f98bc7934251c5cf6e50a77219759b8aaa9ac` | `db1f48cd` |
| 4 | #94 | `90ca81af4e33e2540004148af2dd044e1901db64` | `ba82bcf7` |
| 5 | #95 | `50da7cf6f27ace8e6017588c1d31966e86a76298` | `9a8898f7` |

Actual conflicts were reported before resolution. #90 conflicts were changelog,
lockfile, assets version and tools version. Each remaining input conflicted only
in changelog, lockfile and assets version. Resolutions preserve additive changelog
entries and highest compatible versions: assets 0.19.5, tools 0.21.2; all runtime
versions and dependencies remain intact. No sprite conflict or pixel edit occurred.

## Actual file audit and correction precedence

| Delivery | Icons | Props | Prop frames |
|---|---:|---:|---:|
| Reviewed native imports #90 | 205 | 0 | 0 |
| Core art #91 | 18 | 0 | 0 |
| Collection art #92 | 11 | 0 | 0 |
| Stations/habitat #94 | 7 | 8 | 48 |
| Semantic corrections #95 | 9 | 0 | 0 |
| Total | 250 | 8 | 48 |

These counts are verified from actual JSON grids, unique keys and frame groups,
not inferred from PR descriptions. All 258 source files are byte-identical to
reviewed source commits. The combined manifest records source PR/head and SHA-256
for each complete file, with explicit item IDs and prop frame counts.

The original 215 source selections contain 205 approved native imports and ten
rejected mappings. Keep their source/crop/hash/review status as historical evidence.
Additive `resolution` fields point to bespoke replacements: raw game is #91;
butter, curd, sugar, salt, bandage compound, salve, animal feed, pumpkin pie and
roast potato are #95. In particular `icon_animal_animal_feed` stays unchanged.
All 35 historical `artNeeded` entries have explicit delivered keys and PRs.
Milk/egg retain reviewed Farming #168/#169; the four Raven cells retain the plain
source sheets. All six mana potion icons are present without gameplay activation.

`import-food-alchemy-icons.ts` continues to write only `native_import_reviewed`
rows. Re-import cannot replace reviewed bespoke corrections with held vendor crops.
Tests enforce this boundary, exact native pixel parity where licensed sources are
available, complete item coverage, unique keys, immutable file hashes, UI geometry,
closed-palette bespoke art, all eight prop state groups and 48 frames, and four-frame
five-fps looping animations. Original private PNGs and generated atlases are not
committed. Reviewed source PR sheets provide visual evidence; pixels are unchanged.

## Verification

- Independent offline dependency install and licensed local source links.
- Workspace typecheck and lint passed before final test additions; final combined
  check will rerun both against the frozen candidate.
- Asset atlas/UI build and validation passed: 1,578 art assets, 12 songs, 10 SFX,
  55 palette colors and four seasonal remaps.
- Final focused asset tests: **238 passed / five files**, including native pixel parity.
- Full repository build, guarded Studio production build and client chunk gate passed.
- First complete coverage attempt: 6,597 passed, one skip, one stale assertion
  failure across 1,023 files. The old premium test counted all Kenmi imports as
  exactly 21; the artwork adds 201. Preserve the exact 21 legacy cohort assertion
  while continuing source-RGBA validation for all 222 imports. No pixels changed.
- Corrected full `npm run check` **exit 0** on frozen `b67e7ce6`: **6,598 passing
  tests / 1,023 coverage files plus one skip**, followed by **101 passing exhaustive
  tests / seven files**. Coverage: statements 89.16%, branches 84.48%, functions
  94.64%, lines 93.23%; all thresholds passed. Coverage duration 1,153.64 seconds;
  exhaustive duration 144.94 seconds.
- The same run passed lifecycle integrity, all 921 definitions / 27 files, world
  build, workspace types/lint and final 1,578-asset validation. Full log:
  `/tmp/copper-art-full-check-final.log`. Earlier interrupted source runs are not
  used as combined evidence.
- Final closeout is documentation only. Hosted CI remained pending at closeout.
  Rehearsal: https://github.com/Dastari/orchard-cellar/pull/96 (draft, DO NOT MERGE).

## Coordination and boundary

OrangeCastle received the source-head audit, conflict ledger, mapping plan and
candidate status (Agent Mail #470/#475/#476/#477). No owner reply had arrived at
closeout. Source pushes require ownership
coordination and validated candidate; none have occurred. GoldCondor alone merges
source PRs. This candidate must remain DO NOT MERGE.

No files under gameplay content definitions or runtime packages are changed relative
to the baseline. Later effect, recipe, collection, station and timer behavior remains
separate work. This is artwork availability only; it does not make new items usable.
