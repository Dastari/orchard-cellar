# Dark item tooltip panel

`ui_orchard_tooltip_dark.png` is an original Orchard frame drawn in the anatomy
of Kenmi's Cute Fantasy UI frames (`ui_cf_kit_frame_blue_grey`): chamfered
outline, lit top rim, face, and a deeper two-row bottom band. The strip holds
seven 24×26 frames, left to right: neutral, poor, common, uncommon, rare, epic
and legendary. Only the rim changes between them, so the kit never tints pixel
chrome.

- Face `#1d1a2b`, bottom band `#140f20`, outline `#0e071b` (Kenmi's outline).
- Rims come from the Kenmi premium-icon material ramps: steel (neutral),
  obsidian (poor), silver (common), jade (uncommon), frost (rare), amethyst
  (epic) and gold (legendary).
- The face was chosen so that every `UI_ITEM_INKS` colour clears 4.5:1
  (`packages/ui/src/kit/item-inks.test.ts`).

`packages/assets/ui/ui_orchard_tooltip_dark.sprite.json` holds the same pixels
with an exact source palette. The owner approved an original dark panel in
Kenmi's style on 2026-09-24.
