# Willowharbour finishing-pass handoff

Worktree `/home/toby/projects/orchard-town-headwaters`, branch `feat/willowharbour-headwaters`, based on PR40 (`32a5761e`). New PR is stacked on PR40; no merge or deployment.

## Changes and rationale

- Streetlamp light uses `intensityPerMille: 3500`, carried through content parsing, state-independent light resolution, point-light creation, receiver weighting, flood color bands and cache signatures. It changes brightness within the existing five-tile radius; full-color saturation preserves the warm native hue. Auto/On/Off behavior stays authoritative. The illuminated sprite now uses the matching bright source column `(32,0)` instead of a different lamp design at `(0,48)`.
- Four native bridge arch columns `(32/48/64/80,60,16,20)` complete the underside over water. Only the source's flat blue backdrop is made transparent, exposing animated river water. Arch objects are nonblocking ground decoration; existing deck/rail collision remains intact.
- A lake on elevation one feeds a narrow outlet and the complete six-frame native waterfall. Its anchor is on the upper plane `(24,47)` so the crest draws over the cliff lip while the splash projects into the lower river. Two-cell lake shoreline steps avoid unsupported one-cell tips.
- Whole validated turf-shelf footprints are reserved before fence placement. Fences terminate before them. Boundary cells have priority over flowers, and intentional gateway approaches exclude flowers even when planting was authored first.

## Evidence

`output/town-headwaters/final-town.png`, `final-headwaters.png`, `final-night.png` and JSON sidecars are reproducible with `render-hearth-study.ts --residents`, `--headwaters` and `--town --dynamic`. Committed copies and Astra findings are in [the visual review](review/willowharbour-headwaters-pass-01.md).

The PR40 saved-map upgrade rehearsal passed through the normal exporter using its reviewed baseline, preserving every terrain cell outside Willowharbour. Input/result are local at `output/town-headwaters/prior-pr40-map.json` and `upgraded-final/map.json`; these are synthetic rehearsal artifacts, not a production map dump.

## Release scope

Game assets/client, world content and reviewed saved-map update. Shared light fields are backward compatible and default to intensity 1000. No persistence-table change. Follow `ops/orchard-runtime/PUBLISHING.md` for publication and verify real map conflicts and live results at https://orchard.dastari.net/. No Studio UI change or Studio deployment. PR41's independent shared-generation work still needs normal integration with the town PR stack.

## Final validation

- Clean coverage run: 928 files passed; 5,663 tests passed, two skipped. Statements 88.71%, branches 84.03%, functions 94.26%, lines 92.78%; all thresholds passed.
- 51 exhaustive terrain tests; 144 native-source pixel tests; 22 scenery/composition/access checks passed.
- Workspace type checks and ESLint; simulation/tools/world/client builds; 1,314 assets validated; lifecycle integrity passed.
- Content payload 559,662 bytes, within budget; content hash `2f704947`.
- An initial run concurrent with builds/exhaustive tests hit Studio's 50 ms pointer threshold. It passed in isolation and in the clean complete rerun; no Studio code or threshold was changed.
- PR https://github.com/Dastari/orchard-cellar/pull/42 is stacked on PR40. GitHub checks were pending at local closeout. No merge or deployment.
