# Doc 60 — Astra P4 catalogue recommendation

Independent design review, 9 September 2026. This is a bounded implementation
proposal, not publication approval or a completed asset manifest. Source families
were inspected in `references/art/kenmi/cute-fantasy/core/Buildings/House_Decor/`.
Use semantic crops from those native sheets, with explicit anchors and physical
footprints. Do not import a whole sheet as an object or fabricate rotations by
rotating an upright sprite. Two visual families share the catalogue: warm rustic
timber (R) and cream/dark-wood village townhouse (T).

## Economy baseline

Existing sale values in bronze are wood 2, stone 3, fiber 2, iron piece 10,
copper piece 7, sunflower 11, apple 5, carrot 9, wheat 7 and grape 15. Wood and
stone can be purchased for 6 and 8 respectively. A bottle has a 5,000 base sale
value and estate-vintage premium support. Quest payouts of 2,000–50,000 are
one-time rewards and must not be treated as repeatable village order income.

The table uses replacement cost for shop materials (wood 6, stone 8) and current
sale opportunity value for the other inputs. Finished prices are approximately
1.25 times those inputs, rounded up to ten bronze. These are initial prices for
testing; procurement time for fiber/metals must also be measured. Materials:
W wood, S stone, F fiber, I iron piece, C copper piece, U sunflower. Do not add
an unplanned cloth/wool dependency; existing fiber supports upholstery and rugs.

A basic 100-bronze chair is covered by selling 12 carrots or 15 wheat. A sample
eight-piece room costs 1,580: ladder chair 100, dining table 220, single bed 280,
chest 210, narrow bookshelf 170, woven rug 100, standing lamp 140 and cooking
range 360. Target ordinary village orders at about 350 **net** bronze above the
foregone sale value of requested goods: 20 wheat would pay about 490, 20 carrots
530. This room then takes about 4.5 orders. A bottle order must pay at least its
actual applicable merchant value plus the order margin, not a fixed 350 total.

Propose room expansions at 3,200 and 4,200 (about 9 and 12 such net orders).
These are affordable from one established wine sale; that is consistent with the
existing economy. Do not silently nerf bottles or inflate starter furnishings to
force veteran players through the early crop progression.

## The 32 base definitions

Suggested stable suffixes below belong under the existing furniture/item ID
convention. Numbers in the envelope column are conservative initial grid
reservations, to be confirmed against each crop; backs and overhangs are visual
only. `floor` rugs do not block walking; `wall` needs a valid interior wall;
`top` needs a suitable supporting surface. All others stand on the floor.
Recipe licence prices are a one-time 50% of finished price, rounded up to ten;
the reusable recipe and finished purchase create exactly the same item.

| # | Suffix / display name | Style | Native sheet / selection | Envelope / layer | Recipe | Finished bronze |
|---|---|---|---|---|---|---:|
| 1 | rustic-stool / Timber stool | R | Chairs, plain backless stool | 1×1 | W10 F2 | 80 |
| 2 | rustic-chair / Ladder chair | R | Chairs, light wood high back | 1×1 | W12 F4 | 100 |
| 3 | rustic-bench / Timber bench | R | Chairs, long wooden bench | 2×1 | W24 F4 | 190 |
| 4 | townhouse-chair / Cushioned chair | T | Chairs, blue seat dark frame | 1×1 | W12 F14 | 130 |
| 5 | townhouse-loveseat / Blue loveseat | T | Chairs, two-seat blue upholstery | 2×1 | W28 F30 | 290 |
| 6 | townhouse-armchair / Hearth armchair | T | Chairs, upholstered armchair | 1×1 | W18 F24 | 200 |
| 7 | rustic-dining-table / Timber dining table | R | Tables, plain light wood rectangle | 2×2 | W28 | 220 |
| 8 | rustic-writing-table / Writing table | R | Tables, small plain wood rectangle | 2×1 | W20 | 150 |
| 9 | townhouse-dining-table / Linen dining table | T | Tables, cream cloth rectangle | 2×2 | W28 F20 | 260 |
| 10 | townhouse-side-table / Side table | T | Tables, small dark wood square | 1×1 | W12 | 90 |
| 11 | rustic-bed / Single timber bed | R | Beds, single green-cover bed | 1×2 | W24 F40 | 280 |
| 12 | townhouse-bed / Blue double bed | T | Beds, double blue-cover bed | 2×2 | W40 F64 | 460 |
| 13 | rustic-chest / Timber chest | R | Chest_Anim, closed frame and opening | 1×1 | W24 I2 | 210 |
| 14 | townhouse-wardrobe / Tall wardrobe | T | Furniture_Other, dark double wardrobe | 2×1 | W40 I4 | 350 |
| 15 | rustic-bookshelf / Narrow bookshelf | R | BookShelves, narrow light wood | 1×1 | W22 | 170 |
| 16 | rustic-cupboard / Timber cupboard | R | Furniture_Other, light wood cupboard | 2×1 | W30 I2 | 250 |
| 17 | townhouse-bookcase / Wide bookcase | T | BookShelves, wide dark wood | 2×1 | W36 | 270 |
| 18 | townhouse-cabinet / Townhouse cabinet | T | Furniture_Other, dark low cabinet | 2×1 | W32 I4 | 290 |
| 19 | rustic-woven-rug / Woven rug | R | Carpets, cream/gold plain rectangle | 2×2 floor | F40 | 100 |
| 20 | rustic-runner / Hall runner | R | Carpets, narrow warm runner | 1×3 floor | F44 | 110 |
| 21 | townhouse-round-rug / Round blue rug | T | Carpets, round blue motif | 2×2 floor | F64 | 160 |
| 22 | townhouse-patterned-rug / Burgundy rug | T | Carpets, ornate burgundy rectangle | 3×2 floor | F96 | 240 |
| 23 | rustic-standing-lamp / Timber standing lamp | R | Standing_Lamps, warm shaded floor lamp | 1×1 | W12 C4 F6 | 140 |
| 24 | townhouse-floor-lamp / Blue floor lamp | T | Standing_Lamps, blue shaded floor lamp | 1×1 | W14 C6 F12 | 190 |
| 25 | townhouse-table-lamp / Small table lamp | T | Standing_Lamps, matching small lamp | 1×1 top | W6 C3 F8 | 100 |
| 26 | rustic-hearth / Stone hearth | R | Fireplaces, full stone fireplace | 2×1 | S32 I6 W8 | 460 |
| 27 | rustic-cooking-range / Cooking range | R | Kitchen_Furniture, brown stove/oven | 2×1 | S20 I10 W4 | 360 |
| 28 | townhouse-washstand / Cabinet washstand | T | Bathroom_Furniture, basin on wood cabinet | 1×1 | W20 S8 C4 | 270 |
| 29 | townhouse-bath / Enamel bath | T | Bathroom_Furniture, long white/blue tub | 2×1 | S20 I12 C8 | 420 |
| 30 | rustic-potted-fern / Potted fern | R | House_Plants, broad green foliage clay pot | 1×1 | S4 F8 U2 | 90 |
| 31 | townhouse-flower-planter / Flower planter | T | House_Plants, flowering rectangular planter | 2×1 | W12 F8 U4 | 170 |
| 32 | townhouse-wall-mirror / Wall mirror | T | Bathroom_Furniture, framed mirror | 1×1 wall | W12 S8 C4 | 210 |

The mirror recipe treats stone as its mineral input; it does not require a new
glass commodity chain. These are gameplay recipes, not material-processing simulations.

## Four expedition reskins, additional to the 32

These reuse validated physical shapes, source orientations and functionality.
Candidate volcanic materials are not yet a complete economy. Preserve their
quantities as proposals until encounter/resource throughput is measured; do not
give them fabricated coin values or sell finished trophies for coins initially.

| Suffix / display name | Base / native art treatment | Proposed extra inputs | Acquisition |
|---|---|---|---|
| cinder-chair / Cinder chair | Townhouse armchair; existing red upholstery, dark timber crop | Base recipe + ashwood 6 + basalt 4 | Reusable recipe from first elite contract |
| emberglass-lamp / Emberglass lamp | Townhouse floor lamp; native amber/gold lamp variant | Base recipe + emberglass 4 + copper piece 4 | Reusable recipe from material delivery contract |
| warden-rug / Warden's rug | Burgundy rug; native deep-red/gold ornament variant | Base recipe + ashwood 4 + cinder ore 2 | Reusable guardian-clear recipe |
| ashwood-cabinet / Ashwood cabinet | Townhouse cabinet; native darkest timber variant | Base recipe + ashwood 12 + basalt 4 | Reusable recipe from expedition furnishing order |

Do not consume guardian seals required for the primary chosen-legendary route
just to unlock a decorative recipe. First guardian clear may grant its decorative
recipe once alongside the normal combat reward. If a finished trophy shop route
is added, charge the same volcanic materials plus the base finished coin price;
it must not let coins bypass expedition acquisition.

## Bounded implementation slice and approval evidence

Start with eight pieces exercising every placement behaviour: ladder chair,
dining table, single bed, chest, woven rug, table lamp, wall mirror and potted
fern. Author these inside one cottage with one expansion; a second builder tests
every operation before the other catalogue entries are replicated. Preserve the
32+4 final scope in the content ledger; the eight-piece slice is not completion.

Separate the item definition from placement metadata: source frame, orientation,
visual extent, floor occupancy, actual collider, attachment surface and supported
behaviour. A tabletop lamp must not consume the same blocking layer as its table.
Only offer source-backed orientations, and reserve the entrance approach on the
server. Keep lamps' light radius bounded, with no combat bonuses. Beds and baths
are decorative; chair sitting and storage reuse existing authority capabilities.

Prefer recipes without crafting skill XP until a bounded XP policy is designed.
Keep furniture unlisted for merchant resale initially; move/removal returns the
same item, not components or currency. This removes a new crafting currency loop
without changing existing material prices. Full-inventory removal must fail or
use an explicit recovery store. Reject moving/removing nonempty storage until
the final storage relocation contract is implemented.

Review proof: native-scale day/night furnished room; valid/invalid ghosts for all
four layers; source-backed rotation; two authorized builders contesting one tile
and one item; visitor denial; invalid placement consumes nothing; safe exit stays
reachable after wall/furniture placement; occupied support cannot be demolished;
full inventory and reconnect preserve exact furniture/storage contents; duplicate
undo/removal cannot reimburse twice. Check prices against actual completed local
sales and repeatable orders before marking the P4 economy gate passed.
