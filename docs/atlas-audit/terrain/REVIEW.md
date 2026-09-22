# Terrain catalogue review — 2026-09-22

Scope: every tile-category or `tile_`-named registration, every Cute Fantasy indexed
terrain sheet, all registered cliff/surface families, and the implemented local
mask resolvers linked in the catalogue. The full atlas inventory accounts for
other source files and formats.

- 103 tile registrations, 3,581 frames; every animation/state/variant group retained.
- 126 native source sheets; 7,349 source cells, including 5,906 nonempty cells.
- 63 source-only sheets have unverified joining roles. 26 sheets contain banks
  with implemented rules; this does not certify their remaining cells. The other
  37 sheets have imports but no joining rule demonstrated by these resolvers.
- 3,553 nonempty cells lack declared import regions; another 10 are partly
  covered. These are provenance gaps, not automatically missing pixels: the full
  inventory separately compares native source pixels and transformed imports.
- 33 local rule families × 256 raw masks = 8,448 cases. The blob47 family resolves
  to exactly 47 distinct frame IDs. All referenced frames and declared crop bounds
  validate during generation.
- 14 cliff families each have six assembled formations and named source banks;
  seven flat transition families each have six assembled examples. Core waterfall
  courses cover 105 cells across widths one through six. Pavement includes the
  native fill and reassembled four-corner ring; arbitrary kerb joins remain unknown.

Validation passed: generation, byte-for-byte `--check` of all 303 generated
artifacts, ESLint, and strict standalone TypeScript checking with Node types.
All 1,118 HTML image/file/anchor references resolved. Playwright exercised family
expansion, fragment navigation and pavement filtering in the generated HTML.
Native stone formations, source-role banks, river formations and the pavement
assembly were visually reviewed; browser captures are in the local ignored
`output/playwright/terrain-*.png` directory. The guide is an evidence catalogue,
not proof that every possible placement looks correct.

Run `npx tsx scripts/render-terrain-catalogue.ts --check` after source or resolver
changes. Regenerate before updating these counts. No runtime geometry enforcement,
map repair, deployment or stable-ID removal is part of this generator.
