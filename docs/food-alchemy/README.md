# Food, wildlife collections and alchemy plan review

Status: **proposed, awaiting owner approval**. Baseline: `52b671b9` on upstream main.
The canonical plan is [doc 63](../63-food-alchemy-content-plan.md); open
[index.html](index.html) for the searchable icon companion. This directory contains
review data and documentation tools, not runtime content definitions.

The owner requested hunting support for protected animals, then refined small animals
into collections/capture/release and ingredient use, with bees/hives/honey/apiaries in
this update. Section 7 records that scope: twelve hunting defaults, six capture defaults,
no frog/insect/snail meat, a journal, specimen custody and the complete apiary loop.

## Open locally

From the repository root:

```sh
python3 -m http.server 8937 --bind 127.0.0.1
```

Visit `http://127.0.0.1:8937/docs/food-alchemy/`. Direct `file://` viewing also works:
the catalogue and audit are embedded, with no external JavaScript, fonts or CDN.
Licensed source images must be present at the paths documented in the catalogue,
under local `references/art/`. GitHub will not render this HTML as a live application,
and a checkout without the private art library displays “Local art unavailable”.
No vendor source sheet or generated art is included in the PR. Existing tracked sprite
grids are rendered as canvas; premium icons crop original local sheets. “ART NEEDED”
means a reference image is shown, not a selected production substitute.

## Files and editing

- `catalogue.json`: 348 item rows, 283 transformation edges, 64 potion variants, icon
  provenance/crops/hashes and proposed values. Existing inventory and merchant inputs
  are minimum-depth roots; stateful capture/colony prerequisites are defined in doc 63.
- `icon-audit.csv` and `icon-audit.json`: all 6,982 vendor icons, one disposition each.
- `index.html`: generated searchable items, alternatives, all-icon audit, twelve chains
  and owner decisions. Filters and pagination avoid rendering every icon at once.
- `render.py`: updates doc 63's generated master/potion tables and the HTML. Edit prose
  directly in doc 63, data in the JSON, and presentation/chains/decision summaries in
  this renderer, then regenerate. Do not hand-edit the embedded HTML catalogue.
- `validate.py`: documentary integrity checks; requires the local licensed art library.

```sh
python3 docs/food-alchemy/render.py
python3 docs/food-alchemy/validate.py
```

The verifier checks IDs, input/output references, potion shapes, minimum graph depths,
source hashes, crop bounds, audit count/coordinates, HTML data parity, removed small-meat
IDs, six specimen IDs and combined-output shop→craft→sale budgets. Price propagation
is a conservative per-output procurement bound, not an exhaustive linear-programming
proof over arbitrary shared co-product cycles. Runtime and full economic simulation
remain implementation acceptance work; passing this script does not approve the plan.

## Verification record — 23 September 2026

- Documentary validator: passed (348 rows, 283 transformations, 64 potions, 6,982 icons,
  maximum minimum-depth 5).
- Independent runtime/economy review plus fresh-eyes plan review: findings addressed,
  including combined press sale profit, medicine rank/cooldown, raw instant restoration,
  small-meat removal, apiary graph edge, same-space bee supply and forced-travel custody.
- Browser check: item search (six captured species), item/audit pagination, all four
  views, twelve chains, A9 scope, all selected source-image URLs, desktop 1440×1000 and
  mobile 390×844. No missing source images or horizontal overflow; zero image/grid errors.
  Screenshots were inspected locally, not committed with licensed art previews.
- `npm run lint`: passed.
- `npm run content:validate`: passed, 919 existing definitions / 25 files.
- `npm run assets:validate`: passed, 1,320 existing art assets.
- `npm run sim:pace`: passed legacy baseline, first press 18.00 min / bottle 45.83 min.
  This is not validation of the new proposed multiplayer progression or apiary balance.
- `npm run check`: failed in typecheck, including workspace sim export/terrain type
  mismatches and missing Node types in existing test sources. The temporary shared
  `node_modules` resolves `@orchard/*` to the other checkout; this run is not a clean
  isolated baseline verdict. Lifecycle integrity and content validation passed first.
- `npm run build`: reached Studio then failed on sim exports resolved from the other
  checkout (`mapObjectIsGroundDecal`, `mapObjectOverlapAllowed`,
  `isMaterializedStreetlampId`). No source workaround is included in this docs PR.
- `npm test`: failed tests observed in existing Studio map suites (including model and editor behavior). Stopped this shared-dependency run after nine minutes rather than treating it as isolated baseline evidence; coverage/exhaustive suite completion is not claimed. A clean dependency install and full CI run are still required for implementation.

## Handoff

Planning lane: Agent Mail **BeigeCoast**; coordinator **GoldCondor** was notified of
ownership and both scope revisions. Branch `docs/food-alchemy-plan` is docs-only.
No production content, engine code, source artwork or deployment is authorized by
this plan. No merge or publish was performed. Record the owner's approval and selected
A1–A9 options before starting P0–P6. Then read and follow
`/home/toby/projects/briefs/food-alchemy-implementation-prompt.md`, re-audit current main,
coordinate reservations and recheck the runtime/Studio dependencies. Approval of this
PR's existence is not approval of the implementation plan.
