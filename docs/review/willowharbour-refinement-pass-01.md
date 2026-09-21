# Willowharbour refinement: independent visual review

Reviewer: independent Astra agent `refinement_astra_review`.

**Result: accepted for this refinement pass.** The final captures resolve the
blocking visual defects raised during this review. This is visual acceptance of
the generated candidate, not a claim of deployment, live traversal, or exhaustive
collision testing.

## Reference analysis

Reviewed all five files in `references/town-reference`: `xBzmG3.gif`,
`KiN+W_.gif`, `Xxn6fE.gif`, `hqmGqr.gif`, and `4FeNv9.png`, plus the user's
shallow-bank and interior attachments. GIF composition was inspected using
extracted first frames; animation timing was not evaluated.

The exterior references use a clear hierarchy: formal civic paving, softer
cottage lanes, planted house frontages, short fences with purposeful openings,
and hedges that form continuous corners. Pots, signs, benches, lamps and flower
patches cluster around useful destinations. Water passes between destinations,
making its bridges meaningful. The shallow-bank attachment shows narrow brown
earth lips under grass, rather than tall stone retaining walls.

The interior reference uses distinct furnished room masses joined by short
hallways, with dark voids between wings. Thin wall caps, vertical wall faces and
clear openings distinguish rooms from floor-material changes alone. Its lesson
is spatial composition, not simply increasing furniture count.

## Evidence inspected

Local review artifacts are under `output/town-refinement/` and remain generated
review evidence rather than source artwork:

- `baseline-town.png` and `baseline-interiors.png`.
- `town-r2.png`, `interiors-r2.png`, and `night-r2.png`.
- `town-r4.png` and `interiors-r4.png`.
- `final-estuary-crop.png`, derived from `town-r5.png`.
- `final-inn-crop.png`, `final-night.png`, and `final-interiors.png`.

## Findings and corrections

The initial R2 candidate was **not accepted**. Its outlet contained rectangular
green artifacts, mature woodland had regressed into small hedge/sapling-like
stamps, white fences largely read as disconnected horizontal stripes, and too
many utility interiors shared the same four-wing arrangement.

The subsequent evidence corrects these issues:

- The final estuary crop has a continuous river opening and native sand/shore
  transitions. The broad green stair-grid artifacts are gone.
- R4 restores mature mixed woodland around the town. Planted village greens and
  low irregular turf shelves remain visible without becoming large cliff faces.
- Selected picket side returns and deliberate path openings make garden
  boundaries more convincing. Connected hedge elbows and terminal ends are
  visually coherent.
- The river runs through the settlement to the coast; four crossings connect
  opposite street networks. The old bridge-over-walkable-around-pond composition
  is replaced. The civic square reads as cobbled stone within the paved network.
- More flowers, soil beds, pots, trees and lamps give destinations identifiable
  frontages. Final nighttime evidence shows working pools of street light.
  Apparent green versus amber variation was investigated: the implementer
  verified the same warm `[255, 206, 131]` lamp component; differing ground
  colors account for the visual variation. This was not retained as a defect.
- Interior caps and vertical sides now delineate room masses and corridor
  voids. Domestic connectors are narrower. The barn has a continuous aisle
  hall, the greenhouse a contiguous planted enclosure, the shop a retail area
  with separate stores, and the smith a working hall. These avoid imposing the
  same cottage plan on every utility building.
- The final inn crop resolves the tightly packed table groups noted in R4.
  Separate groups and visible aisles now read clearly in the communal hall.

## Remaining observations and limits

The result interprets the references at the game's more spacious settlement
scale; it does not reproduce their close-packed screen compositions. Some
interiors remain more spacious and sparse than the domestic reference, and some
path fences intentionally remain short open-ended runs. Those are visible design
differences, not unresolved visual blockers for the requested refinement.

This review checks composition and visible rendering. It does not independently
certify every furniture collision footprint, doorway route, runtime transition,
or nighttime movement path. The implementation's automated tests and release
verification must cover those separately. No claim is made that the generated
candidate has been deployed to the canonical shared preview.
