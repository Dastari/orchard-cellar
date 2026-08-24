# 04 — Orchard Design: Trees, Tending & Vigour

The grove is stage one of the chain and where the player spends most walking time.
This doc covers physical trees, the species roster, care/quality, and the charged
Vigour tend — the redesign PDF's P0 replacement for click-spam.

## 1. Trees as physical objects

Every tree occupies a plot (2×2 tiles footprint for mature; collision on trunk tile).
Growth stages, each its own sprite (no scaling — see [10-art-style-guide.md](10-art-style-guide.md) §5):

| Stage | Duration (base) | Produces |
|---|---|---|
| Sapling (16×16) | 1 day | — |
| Young (16×32) | 2 days | 25% rate |
| Mature (48×64) | permanent | 100% rate |
| Fruiting (overlay) | continuous | fruit accrues on the tree, visible as dots (1→3→6 fruit sprites) |

Fruit accrues into the tree's local buffer (cap = 4 h of production); harvest (E, no
Vigour cost) pops the buffer into crates with a satisfying multi-pop. Un-harvested
full trees pause — walking the rows matters. Estate hands (Picker) automate this
later. Spring: saplings grow 2× faster.

## 2. Species roster (10, compressed from the original 22)

Traits are inherited from the original's varietal system — mixed orchards must beat
monocultures. `lifts` = +% production to every *other* species per 5 planted of this
one; `feeds` = +% capacity to that stage per 5 planted (both capped, see 06).
Unlock = Knowledge/almanac milestone ([06-progression-economy.md](06-progression-economy.md) §5).

| # | Species | Trait | Character (sprite brief) |
|---|---|---|---|
| 1 | Seedling Apple | — | The starter; humble round canopy, red dots |
| 2 | Orchard Apple | lifts | Fuller canopy, R5 fruit |
| 3 | Pear | season: Autumn | Teardrop canopy, R6 gold fruit |
| 4 | Quince | feeds: press | Knobbly, pale gold, leaning trunk |
| 5 | Plum | lifts | Purple-black fruit (R9), dense small canopy |
| 6 | Fig | season: Summer | Broad flat leaves, sprawling shape |
| 7 | Cherry | season: Summer | Blossom-heavy, slender; prettiest tree |
| 8 | Heritage Grafts | lifts (strong) | Gnarled ancient trunk, mixed fruit colors |
| 9 | Frost Medlar | season: Winter | Bare-branched beauty, fruits in snow |
| 10 | Vale Medlar | feeds: cellar | Endgame unlock (almanac completion tier), R9 blossom |

Species price and rate curves are in 06 (`balance.ts` tables). Higher species aren't
strict upgrades: traits + seasons + plot limits (120 max) make composition the puzzle.
The original's per-count milestones survive as **per-species milestones** at 5/10/15/25
planted (production ×2 steps; 25 = "grove mastery" ×3, an endgame target per the PDF's
200-milestone guidance — not expected every Vintage).

## 3. Care quality (the tending sink)

Each tree has a **Care** level 0–3 (visible: sparse → lush canopy + subtle gold
shimmer at 3). Care decays one level per 2 days untended. Production multiplier:
×1.0 / ×1.25 / ×1.5 / ×2.0. Full-charge Vigour tends raise Care by 1; compost mulch
(from pomace, see [05-cellar-design.md](05-cellar-design.md)) holds decay for 3 days.
This gives tending a *lasting* purpose beyond the instant payout and creates the
walk-the-rows routine without being punishing (floor is ×1.0, never below).

## 4. Vigour: the charged tend (PDF P0)

One global Vigour meter (HUD bottom-center), charging while playing:
- Base charge time **25 s** (0.04/s × `vigourRate` modifiers; Autumn ×4 charge rate).
- **Tend (E on a tree)** spends the whole current charge:

| Charge | Payout | Care effect |
|---|---|---|
| <25% | tiny fruit sprinkle (2 s of grove rate) | none |
| 25–49% | 5 s of grove rate | none |
| 50–74% | 9 s of grove rate | none |
| 75–99% | 15 s of grove rate | +1 Care |
| **100%** | 15 s × burst power (base ×2, skill-scaled to ×5.6) + fruit fountain | +1 Care, tree sparkles |

Super-linear on purpose: waiting for full charge is always most efficient per unit
Vigour, so *timing* is the skill. Payouts scale with `clickFromRate`-style skills so
tending stays relevant at any production scale (inherited from the original).
- **Autumn chain:** consecutive full-charge tends within 8 s of each other build a
  chain (×1.1 per link, cap ×2, resets on partial tend) — the Harvest Festival
  showcases this.
- Input: `e.repeat` rejected; holding E shows the charge % but never auto-fires.
- **Hands Free** cultivar: the Cellar Master's apprentice auto-cashes full-charge
  tends on the lowest-Care tree — visible NPC doing it, per pillar 4.

## 5. Grove events & defense (light touch, all optional)

- **Bird raid** (daily-event pool): a flock lands on a random fruiting tree, eating
  buffer fruit at 5%/min until shooed (walk within 2 tiles; dog auto-shoos if nearby).
- **Frost night** (Winter, flagged in advance by the almanac): unprotected saplings
  pause growth next day; cover with mulch to prevent. Never kills trees.
- **Windfall morning**: ground fruit pickups scattered under mature trees (bonus).
- No pests-with-death, no watering chores. The orchard cannot enter a fail state;
  neglect only slows it (matches incremental heritage).

## 6. Grove economy summary

- Fruit is the grove's own capital (buy saplings, plot clearing, grove upgrades) —
  the press cannot starve it because press capital is Pomace ([05](05-cellar-design.md)).
- Presses draw from harvested crates in the press-yard hopper, not from banked fruit
  (the original's "presses take fruit off the trees" becomes literal hauling; carts
  automate the hauling mid-game).
- Grove upgrades (bought at the farmhouse workbench with fruit): pruning shears
  (Care decay slower), taller ladders (harvest radius), irrigation (off-season
  penalty halved for grove), bee boost (blossom-adjacent trees +10%), cart & mule
  (auto-haul). Full table + prices in 06.
