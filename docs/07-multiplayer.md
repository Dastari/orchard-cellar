# 07 — Multiplayer: Visiting, Presence & Social

> **Scope superseded for M5.5 (2026-08-24):** the owner expanded the game to a
> friends-only persistent overworld with contiguous travel between farms and genuine
> cooperative multiplayer. The launch whitelist below is retained as the safe minimum
> authorization policy, not as the final interaction ceiling. See
> [19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md). Do not
> implement the former disconnected `FarmRoom` visit flow while the gate is active.

Original scope decision: **asymmetric social, not co-op simulation.** You can visit friends'
live farms, help a little, gift, sign guestbooks, and share festivals — but every
farm has exactly one owner whose progression is authoritative and solo-balanced.
This delivers 90% of the warmth for 10% of the complexity, and it cannot corrupt the
economy. Full co-op farming is explicitly out of scope for launch.

## 1. Model

- Each farm = one `FarmRoom` on the server ([02-architecture.md](02-architecture.md)).
  The owner's connection drives it; **up to 4 visitors** may join.
- Visitors are *embodied* — their avatars walk the host's farm, with nameplates and
  emotes — but interact through a whitelist (§3). Visitors' own farms keep running
  offline-style while they're away (no double-dipping: visiting pauses your active
  presence bonus at home).
- A farm is visitable when its owner is **online and has visiting enabled**
  (default: friends only). Offline farms are browsable in read-only "postcard" mode:
  a static snapshot render + guestbook (no live room spun up).

## 2. Friends & discovery

- **Friend codes** `ORCH-XXXX-XXXX` (format pinned in [13-ui-ux.md](13-ui-ux.md)),
  regenerable. Enter a code → friend request → accept = mutual friendship
  (tables in [08-database.md](08-database.md)).
- Friends list (Estate Book, social tab): online status, farm name, lineage/vintage
  count, "Visit" button, favorite star.
- Visibility settings per farm: `friends` (default) / `open` (anyone with the code
  or via festival matchmaking) / `closed`.
- No global chat, no public server browser at launch. Abuse surface stays tiny.

## 3. What visitors can do (whitelist — everything else is inert)

| Action | Effect | Limits |
|---|---|---|
| Walk, run, emote (6 emotes) | social | — |
| **Helping hand**: tend a tree with their own Vigour meter | Host tree gets +1 Care (no fruit payout to anyone); host gains "helped" toast | 5 tends per visitor per host-day |
| Sign the guestbook | persistent entry (140 chars, host can delete) | 1/visit-day |
| Leave a gift at the gate basket | from visitor's gift pouch (forage items, honey, a bottle from their cellar) → host claims; both get a small Knowledge tick (+1 Estate) the first time each day | 1/visitor/day |
| Taste at the tasting table | see the host's best vintage label + stats; both receive a 30-min +5% production "good company" buff (stacks to 2 visitors) | — |
| Pet the dog | essential | unlimited |
| Chat bubbles | proximity text bubbles, 120 chars, bitmap-font charset only | rate-limited 1/2 s |

Visitors can never: spend host resources, move/place objects, trigger ceremonies,
harvest fruit, or see host settings. Server enforces the whitelist — the visitor
client's actions are validated against role, never trusted.

## 4. Festivals together

On festival days ([03-gameplay-core.md](03-gameplay-core.md) §7), a "celebrate
together" prompt lets friends gather on one host's farm; festival mini-games get a
shared scoreboard (Pressing Fair rhythm scores, Harvest chain lengths) and a
cosmetic prize (bunting, lantern strings — placed decor, no production effect).
Festival attendance grants each participant their own festival Knowledge tick on
their own farm state.

## 5. Protocol & sync (extends 02's message set)

- Visitor join: `{t:'visit', farmId}` → server checks friendship/visibility/capacity
  → visitor's client receives `{t:'welcome', farmState, youAre:'visitor'}` and joins
  the room's snapshot stream.
- Visitor avatars ride the same 10 Hz `snap` messages (positions, facing, anim
  state); their whitelist actions go through the same `act` envelope with
  server-side role validation; rejections return `{t:'reject'}` with a reason toast.
- Host disconnect: room persists 60 s; visitors get a "the farmer has gone in for
  the night" toast and are returned home gracefully on unload.
- Visiting client keeps its *own* farm's state untouched; on `goHome`, normal farm
  load path (with offline gains for time away) runs.
- Clock: visitors render the host's day/season. All timers derive from the host
  room's tick.

## 6. Safety & abuse

- All player-authored text (names, guestbook, chat, farm names) passes the denylist
  filter ([09-auth.md](09-auth.md)) and renders in the limited bitmap charset —
  no unicode abuse surface.
- Block list: blocking removes friendship, bans that account from your farm and
  hides their guestbook entries; silent to the blocked party.
- Host tools: kick visitor (instant, no message), clear any guestbook entry,
  regenerate friend code.
- Rate limits server-side on every social verb; visitors exceeding limits are
  soft-throttled, never error-spammed.
- Report action stores a snapshot of the offending text + ids in a moderation table
  (reviewed manually — this is a small self-hosted community, not a platform).

## 7. Implementation order (mirrors [14-roadmap.md](14-roadmap.md))

1. **M5a**: sessions → rooms → second-client spectate (walk + emotes only).
2. **M5b**: friend codes, requests, visibility settings, visit flow + go-home.
3. **M5c**: whitelist verbs (helping hand, guestbook, gifts, tasting buff).
4. **M5d**: postcard mode for offline farms; festival gatherings; host tools.

Each step is shippable; if multiplayer slips, the game stands alone — nothing in
docs 03–06 depends on a second player existing.
