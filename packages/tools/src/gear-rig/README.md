# Gear rig spike

This spike tests whether premium-icon armour and weapons can be put on the
modular Cute Fantasy player without drawing every frame by hand. It is not
wired into the game yet.

```sh
npm run render:gear-samples -w @orchard/tools     # rig check, loadouts, heads, held weapons, arrows
npm run render:gear-catalogue -w @orchard/tools   # item cards with tooltips, rarity ladders, showcase, catalogue.md
```

The command reads the licensed sheets under `references/` and writes the review
PNGs below to `output/gear-rig/` (git-ignored). It also prints the rig check.

| File | Shows |
| --- | --- |
| `loadouts.png` | Nine paper-doll loadouts, from basic to ornate, across idle/walk in down, right, left and up |
| `loadouts-ingame-3x.png` | The same loadouts at a typical in-game zoom |
| `heads-by-material.png` | Two basic Kenmi helmets and five ornate designs in all ten icon materials |
| `held-weapons.png` | Inventory icon → automatic upright sprite → held in every facing |
| `arrows.png` | An exact 8-way arrow set derived from icons, compared with today's screen-scale free rotation |
| `cards-*.png` | WoW-style tooltips in the game's 5×7 font and coin icons, beside the item on the paper doll, by rarity |
| `rarity-ladders.png` | Swords, helms, shields, staffs and chest pieces from poor to legendary |
| `showcase-outfits.png`, `showcase-ingame-3x.png` | Full outfits built only from catalogue items |
| `catalogue.md` | The generated list: naming grammar, rarities, materials, base types, affixes, lineages, legendaries |

## Catalogue

`catalogue.ts` is the single source for rarities, material ladders (metal,
cloth, leather, gem, wood), 61 base types across every slot, 11 prefixes,
16 suffixes, 6 epic lineages and 12 legendary uniques. `items.ts` derives each
item's name, icon, paper-doll pieces, tooltip lines and sell price from it.
`tooltip.ts` renders the tooltip with the game's bitmap font and coins.
[`CATALOGUE.md`](CATALOGUE.md) is the generated listing, committed for review;
regenerate it with the catalogue command.

- **Naming:** poor `{Damage} {Material} {Base}`; common `{Material} {Base}`;
  uncommon adds one affix; rare `{Prefix} {Base} {Suffix}`; epic
  `{Lineage} {Base}`; legendary unique names.
- **Stats:** affix stats map to the simulation's `STAT_TARGETS` or to the eight
  gear-boostable skill nodes (tested). Attributes, mana and regeneration need
  `EQUIPMENT_STAT_BUDGETS` extended.
- **Icons get more ornate with rarity.** Each base ranks its premium icon rows
  by measured ornateness (accent pixels and area); rarer items take more ornate
  rows.
- **Staffs** are Kenmi mace silhouettes with the head recoloured into a gem
  ramp and a gilded collar.
- **Crowns** have no premium icon; their icon is painted from the worn design.

## What the spike established

- **Anchors come from the art.** Head boxes and hand blobs are measured per frame
  from `Player_Base` and `Hands_1_Bare` (`rig.ts`). Regenerating Kenmi's
  `Plate_Helmet_1` from three sprites plus these anchors is pixel-exact in 208 of
  230 frames. The rest are a few `hold_*_right` and `fish_reel_*` rows, where Kenmi
  drew a different facing's helmet; a small per-row override covers them.
- **Icons and worn layers share one palette.** Each premium icon column is a
  material. Worn Plate_* layers use ramp indices 1–4 of exactly the same ramps
  (`materials.ts`). Recolouring is therefore exact index substitution, and the
  worn item always matches its icon.
- **Worn gear is authored in colour roles** (`designs.ts`): outline, a primary
  material ramp, an accent ramp and a detail ramp. One silhouette renders in every
  material and trim combination. Ornate helmets are a dome plus ornaments (horns,
  wings, plume, gilt trim, crown) placed from the head anchor.
- **Held weapons keep the icon's look.** `uprightFromDiagonal` stands a 45° icon
  upright at 1/√2 scale, sampling two source pixels per output pixel and
  preferring rarer colours so guards and gems survive. It then re-traces the
  outline. A 16 px icon becomes a ~14 px upright item, close to the size of
  Kenmi's hand-drawn knights' swords.
- **Armed characters use Kenmi's `hold_*` rows.** Those rows are the pack's
  arms-out stance. They keep the weapon outside the head silhouette, as on Kenmi's
  armed knight NPCs. The hands layer draws over the grip.
- **Body armour is tiny.** At native scale the torso is about 7×4 px, so helmet
  silhouette, material colour, shoulder guards and the held weapon carry the look.

## Known gaps

- Left-facing frames mirror the whole cell, so the weapon changes hands.
- Automatic upright bows and cardinal arrows are shorter than the diagonal
  originals. Flagship items may deserve a hand touch-up of the generated sprite.
- Attack swings still use Kenmi's shared sword/bow action sheets. Recolouring the
  blade and slash by material is the obvious next step.
- Designs are review samples, not runtime assets. Production import should go
  through the text-grid asset pipeline with exact source palettes and the
  `wearable` content model.
