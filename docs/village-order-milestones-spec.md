# Village order specialist milestones

## Objective and scope

Connect crop farming, preserving, cellar production, village trade and expedition provisioning. Keep the seven existing village orders and all bronze quotes unchanged. Reward diverse deliveries with two permanent, exclusive cooking recipes; no combat or existing tool/estate upgrade is gated.

## Player contract

- Deliver two distinct raw-crop orders and one preserved-crop order to learn Pantry Lunch: one Preserved Carrot + one Potato yields one meal restoring 3,600 hunger centi.
- Deliver two distinct raw-crop orders, two distinct preserved-crop orders and one bottle order to learn Cellar Supper: one Preserved Potato + one Apple yields one meal restoring 4,800 hunger centi.
- Existing known-recipe authority gates both manual crafting and recipe-guide fill. Both recipes use ordinary inventory crafting, avoiding dependence on another feature PR.
- Order panel shows the next recipe and completed/required raw, preserved and bottle deliveries. Completion persists through reconnect and repeated orders never duplicate knowledge.
- Meals use existing food sprites, explicitly named meal items, max stack 99, no shop purchase, and modest sale value below ingredient opportunity cost. Existing plans and their purchase paths are unchanged.

## Architecture and invariants

One private row per player stores bounded distinct raw/preserved item-kind sets (three each) and one bottle completion flag. Existing order revision protects retries. The admitted delivery reducer derives the family from the live registry item tags, plans inventory and payment, updates progress, and grants known recipes in the same transaction. Known recipes use existing bare runtime recipe IDs and source `village_orders`. Owner-only order quotes carry next-milestone strings; no new public table or subscription is needed.

Existing order receipts record only the last order, not family history. New progress intentionally starts at zero; old bronze, receipt revisions, inventory and knowledge remain untouched. Existing known rewards are preserved. Retired/missing reward recipes are never granted and remain visibly unavailable until content is repaired; ordinary orders still work. Family recognition uses crop/preserved tags and fermentation output membership, avoiding hardcoded NPC/order IDs.

## Failure handling and limits

Stale content, stale receipt revision, changed quote, unavailable order, absent goods, wrong NPC/range, dead/mounted/occupied player, locked Delve inventory and full wallet retain existing rejection behavior, before milestone writes. There is no claim reducer or client-supplied progress. Progress cannot exceed seven total distinct kinds and one player creates at most one progress row and two knowledge rows. Only validated completed deliveries advance progress; market sales do not. Full bags do not block recipe knowledge grants.

## Validation and success criteria

Pure tests cover family classification, thresholds, caps, missing/retired content and mixed-delivery progression. Actual reducer tests cover goods/payment/progress/knowledge changes, duplicate/stale rejection, reconnect reads, caller isolation and full inventory. UI tests cover progress and completion rendering. Content validation, relevant typechecks, lint and world/client builds must pass; coordinated full regression gates run separately. All five qualifying distinct deliveries unlock exactly two exclusive recipes, and neither can be crafted before learning.
