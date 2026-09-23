# P0 art requests and review holds

## Combined artwork delivery

All 250 planned inventory icons and eight world props (48 state frames) are now
present in the isolated integration candidate. The original candidate/held-source
and art-needed records below remain historical provenance. `icon-imports.json`
now links every delivered file to its reviewed PR/head and SHA-256; held selections
have explicit bespoke replacement resolutions, and all 35 former art requests have
delivery links. The ten rejected vendor crops remain rejected: raw game comes from
#91 and the other nine replacements from #95. The importer still processes only
`native_import_reviewed` rows and cannot overwrite these bespoke replacements.

See [combined audit and validation](../food-alchemy-artwork-integration.md).
Gameplay activation and release are separate; no new gameplay definitions are added.

Owner approved the full plan on 23 September 2026, including all 64 potions.
Requests follow [doc 63](https://github.com/Dastari/orchard-cellar/blob/docs/food-alchemy-plan/docs/63-food-alchemy-content-plan.md) §§7.2/8. No placeholder is authorized for runtime content.

## Original missing item artwork

| Item | Required artwork |
|---|---|
| `item:wool` | ART NEEDED: wool tuft; shown powder icon is reference only |
| `item:wing_dust` | ART NEEDED: wing dust pouch; shown powder icon is reference only |
| `item:apple_must` | ART NEEDED: labelled fruit jug; current generic must shown as reference only |
| `item:apple_pomace` | ART NEEDED: fruit-marked pomace; generic reference only |
| `item:cherry_must` | ART NEEDED: labelled fruit jug; current generic must shown as reference only |
| `item:cherry_pomace` | ART NEEDED: fruit-marked pomace; generic reference only |
| `item:pear_must` | ART NEEDED: labelled fruit jug; current generic must shown as reference only |
| `item:pear_pomace` | ART NEEDED: fruit-marked pomace; generic reference only |
| `item:peach_must` | ART NEEDED: labelled fruit jug; current generic must shown as reference only |
| `item:peach_pomace` | ART NEEDED: fruit-marked pomace; generic reference only |
| `item:grape_must` | ART NEEDED: labelled fruit jug; current generic must shown as reference only |
| `item:grape_pomace` | ART NEEDED: fruit-marked pomace; generic reference only |
| `item:strawberry_must` | ART NEEDED: labelled fruit jug; current generic must shown as reference only |
| `item:strawberry_pomace` | ART NEEDED: fruit-marked pomace; generic reference only |
| `item:watermelon_must` | ART NEEDED: labelled fruit jug; current generic must shown as reference only |
| `item:watermelon_pomace` | ART NEEDED: fruit-marked pomace; generic reference only |
| `item:varietal_press` | ART NEEDED: three-state station set and item icon; displayed existing prop is reference only |
| `item:alchemy_cask` | ART NEEDED: three-state station set and item icon; displayed existing prop is reference only |
| `item:cauldron` | ART NEEDED: three-state station set and item icon; displayed existing prop is reference only |
| `item:oven` | ART NEEDED: three-state station set and item icon; displayed existing prop is reference only |
| `item:alchemy` | ART NEEDED: three-state station set and item icon; displayed existing prop is reference only |
| `item:still` | ART NEEDED: three-state station set and item icon; displayed existing prop is reference only |
| `item:cooked_game` | ART NEEDED: cooked species silhouette; existing cooked-meat icon is reference only |
| `item:captured_bee` | ART NEEDED: recognizable live bee in ventilated jar; reference only |
| `item:captured_butterfly` | ART NEEDED: recognizable live butterfly in ventilated jar; reference only |
| `item:captured_frog` | ART NEEDED: recognizable live frog in ventilated jar; reference only |
| `item:captured_mouse` | ART NEEDED: recognizable live mouse in ventilated jar; reference only |
| `item:captured_scarab` | ART NEEDED: recognizable live scarab in ventilated jar; reference only |
| `item:captured_snail` | ART NEEDED: recognizable live snail in ventilated jar; reference only |
| `item:capture_net` | ART NEEDED: Capture Net native pixel icon; reference only |
| `item:specimen_jar` | ART NEEDED: Ventilated Specimen Jar native pixel icon; reference only |
| `item:apiary_frame` | ART NEEDED: Apiary Frame native pixel icon; reference only |
| `item:apiary` | ART NEEDED: Apiary native pixel icon; reference only |
| `item:honeycomb` | ART NEEDED: hexagonal comb; jar is reference only |
| `item:beeswax` | ART NEEDED: pale wax lump; mineral references only |

## Source-mapping corrections discovered during import

These 12 original planned crops were initially held outside the atlas. Milk and egg are now corrected and reviewed; the remaining 10 held crops are excluded from the atlas. They must not be referenced by new gameplay content until corrected and reviewed. The plan and imports preserve the original selection so this discrepancy is explicit. Proposed fix: Astra supplies the matching 16×16 native semantic silhouette, then update plan/manifest together; no silent icon substitution.

| Item | Observed defect |
|---|---|
| `item:milk` | Orange liquid flask does not read as milk |
| `item:egg` | Corked liquid flask does not read as an egg |
| `item:sugar` | Grey mineral powder does not read as sugar |
| `item:salt` | Grey mineral powder needs salt-specific silhouette |
| `item:raw_game` | Narrative §8 explicitly requires new raw/cooked game art despite catalogue selection |
| `item:butter` | Dark segmented lump reads as charcoal |
| `item:curd` | Grey powder/lump does not read as curd |
| `item:bandage_compound` | Stone/ingot silhouette does not read as bandage compound |
| `item:salve` | Red jelly dessert does not read as medicine |
| `item:animal_feed` | Goblet silhouette does not read as feed |
| `item:pumpkin_pie` | Red berry tart conflicts with pumpkin identity |
| `item:roast_potato` | Packaged fries conflict with roast potato and calm-farm brief |

## Station/world assets

Astra must deliver alchemy bench, copper still, kitchen cauldron, oven, varietal press and alchemy cask using the exact sizes, anchors, collision footprints and idle/working/finished states in doc63 §8. Include apiary and wild hive from §7.2, including colony/empty/working/finished appearance and reduced-motion variants. Do not reinterpret their frame UIs as hand-drawn assets: use the shared kit.

All bespoke icons: 16×16, anchor (8,15), transparent, closed Orchard palette, no labels or glyphs; warm top-left lighting, readable at 1× and reviewed at 8×. Existing sources are reference-only for the missing set. No copied vendor PNGs or generated atlases in Git.

Core art delivered in PR #91 (AzureOx), collections in PR #92 (CloudyOrchid), and station art delivered in PR #94 (AmberBirch). Nine further semantic corrections are delivered in PR #95 (AzureOx). All sets passed independent native-size visual review; combined PR #96 passed the full check (6,598 coverage tests and 101 exhaustive tests). Refreshed source heads require fresh CI. P0 native intake and missing-art completion are separate gates.

## Reviewed native source corrections

The full Farming sheet review locates a milk flask at vendor #168 and an egg at #169. The plan accidentally assigned #167 to milk (orange liquid) and #168 to egg (milk flask). The committed premium index resolves these exact crops. Both are now imported and visually reviewed beside approved neighbours, with plan and import manifest updated together in PR #82/#90 and original selections retained as provenance. The other held silhouettes are resolved by independently reviewed bespoke art; original held-source metadata remains intact.

P0 source-contract correction: Raven ingredient cells now use `sheet-16-without-outline.png`, as existing plain-icon tests require. The same four cells were re-rendered beside neighbours and their native RGBA pixels verified. Source hashes and doc63 companion were updated together; no global palette snapping.
