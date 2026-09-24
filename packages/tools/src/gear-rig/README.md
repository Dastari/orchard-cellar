# Gear rig spike

This spike tests whether premium-icon armour and weapons can be put on the
modular Cute Fantasy player without drawing every frame by hand. It is not
wired into the game yet.

```sh
npm run render:gear-samples -w @orchard/tools
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
