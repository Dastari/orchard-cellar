# Direct player trading

Direct trading is a participant-private, server-authoritative exchange. Press
`E` near another online player to send a request. The recipient may accept or
decline; an accepted request opens the shared trade window.

Each participant may offer up to six item stacks and a bronze-equivalent coin
amount. Offered items move immediately from the inventory into server escrow.
Changing or removing any item, or changing the coin amount, clears both
acceptances. The trade completes only when both players accept the same
revision.

## Authority and security rules

- Both players must be online, in the same space, and within three tiles.
- A player can participate in only one request or active trade at a time.
- The authority rejects self-trades, inaccessible slots, unavailable stacks,
  insufficient funds, quest/deed items, and the backpack capacity item.
- Final acceptance rechecks both wallets and preflights both destination
  inventories before changing either wallet or inventory.
- Reducer transactions make completion atomic. A full destination leaves the
  trade open and unchanged rather than partially delivering it.
- Cancellation, decline, disconnect, range loss, and request expiry return
  escrow to inventory; overflow custody is used if the original owner filled
  their inventory meanwhile.
- Trade rows are private. Participant-scoped views expose only the caller's
  current session and its escrow offers.

## Acceptance matrix

| Situation | Result |
| --- | --- |
| Nearby player accepts request | Shared offer window opens |
| Recipient declines or either player cancels | Request/trade closes; escrow returns |
| Either offer changes after acceptance | Both acceptance states clear |
| One player accepts | Trade remains open |
| Both accept and capacity/funds remain valid | Items and money exchange atomically |
| Destination inventory is full | Completion is rejected; nothing partially moves |
| Player disconnects, leaves range, or changes space | Trade cancels and escrow returns |
| Pending request is unanswered for 30 seconds | Request expires |

Completed trades register `player_trades_completed`,
`player_trade_items_sent` by item kind, and `player_trade_bronze_sent` in the
canonical player-statistics registry.
