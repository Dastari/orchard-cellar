# ADR 003: A durable completion receipt and optional cosmetic recipe

Date: 2026-09-21
Status: Accepted

Delves currently discard all run progress on return. Give a full victory a permanent cosmetic recipe and a lifetime count while retaining run isolation. Reuse a single private quest-flag receipt per player for the completion total, existing known-recipe storage for the unlock, and normal statistics for presentation.

A material/currency payout would connect combat to the economy and encourage farming; it is unnecessary for this optional return-home purpose. A new reward queue/table would add migration and cleanup machinery for one bounded reward. The narrow receipt format is less explicit than a dedicated table, so document it and keep its parsing/synchronization local to Delve completion.

Content can disable or retire a reward without stranding players: completion receipts survive and normal reconnect synchronizes an available reward. Repeated reconnect never increments the source total. The keepsake reuses reviewed planter art and consumes peaceful crafting materials.

See [spec](../delve-keepsake-spec.md).
