# 07 — Persistent Overworld, Co-op & Social

Binding multiplayer design after the owner expanded Orchard & Cellar into a private,
friends-only cozy MMO and the M5.5 SpaceTimeDB gate passed. Farms are estates in one
continuous overworld; walking through a gate crosses an ownership boundary without a
disconnected visit room.

## 1. World model

- One shared world clock and authored overworld contain roads, common spaces, and
  player-owned estate parcels.
- A player has one durable avatar position and one owned farm. Friends may walk onto
  an estate and cooperate while its owner is online or offline, subject to permissions.
- Public spatial entities use indexed chunk coordinates. Each client subscribes to a
  3×3 chunk region and hands regions over subscribe-first.
- Movement is server-authoritative at 20 Hz with 60 Hz local prediction and remote
  interpolation. Interactions are transactional reducers.
- Small-group launch target is 25 concurrent friends. M9 must measure CPU, bandwidth,
  memory, and reconciliation under that load before deployment.

## 2. Estate permissions

Every farm has an owner and an access mode: `friends`, `invited`, or `closed`.
Per-member roles may grant `visitor`, `helper`, or `steward`. The authority checks the
current role for every reducer; UI visibility is never authorization.

| Action | Visitor | Helper | Steward | Owner |
|---|---:|---:|---:|---:|
| Walk, emote, taste, pet dog | yes | yes | yes | yes |
| Helping-hand tend | yes, 5/host-day | yes | yes | yes |
| Harvest into host stores | no | yes | yes | yes |
| Feed/empty machines | no | yes | yes | yes |
| Spend host currency or buy upgrades | no | no | yes | yes |
| Move/place/delete objects | no | no | permission-gated | yes |
| Prestige, permissions, farm deletion | no | no | no | yes |

Helping-hand tending grants Care to the host tree and never pays fruit to the visitor.
Shared harvest/machine operations mutate the host farm exactly once in a transaction.
Co-op must not duplicate inventory, rewards, Vigour, or first-event Knowledge.

## 3. Friends and discovery

- No public server browser and no global chat.
- Production connection requires approved membership per [09-auth.md](09-auth.md).
- The Estate Book lists members, online presence, farm name, public prestige summary,
  role, favorite, and navigate-to-estate action.
- Estate gates and the world map provide directions; a teleport shortcut may unlock
  later but never replaces the walkable route.
- Blocking removes estate access, hides authored text, and prevents direct social
  interactions. Owner/moderators can revoke world membership.

## 4. Social verbs

Retain the cozy launch verbs from the original design:

- Guestbook: 140 characters, one entry per visitor per host-day; host can delete.
- Gift basket: one gift per pair/day from an explicit gift pouch; transactional
  removal and claim prevent duplication.
- Tasting table: shows a public vintage label and grants the documented time-limited
  good-company buff.
- Proximity chat bubbles: 120 characters, bitmap-font charset, one message per two
  seconds. No persistent global channel.
- Six emotes, festival participation, and dog petting.

All authored text passes authority-side charset, length, denylist, block, and rate
checks. Reports retain the offending text plus identities in a private moderation row.

## 5. Clock, offline farms, and presence

The overworld uses one shared seasonal clock. A farm stores the timestamp represented
by its economy state and advances lazily when entered or mutated. Occupied farms may
receive slow targeted maintenance; absent farms do not tick globally.

Positions persist across disconnects, but only identities with at least one live
connection are rendered online. Multiple tabs for one identity remain online until
the last connection closes. Reconnect restores the identity and authoritative
position before accepting input.

## 6. Implementation order

1. **M5.5 complete:** durable shared chunk, two predicted avatars, shared atomic tree,
   reconnect, restart persistence, private-state isolation.
2. **M6:** OIDC + friends allowlist, owned farm/public/private tables, local-save
   import, farm timestamp adapter, self-host deploy and backup/restore.
3. **M7a:** authored overworld chunks and contiguous estate parcels; 25-client load
   harness and latency/reconciliation controls.
4. **M7b:** estate access modes and visitor/helper/steward reducer matrix.
5. **M7c:** friends UI, guestbook, gifts, tasting, proximity chat, blocks/moderation.
6. **M7d:** co-op festivals, reconnect/rollback soak, owner host tools.

## 7. Required tests

- Every permission-table cell has an allowed/denied reducer test.
- Two identities racing a harvest, machine, gift claim, or purchase commit once.
- Chunk crossings do not lose or duplicate entities and old subscriptions close.
- Artificial latency/loss keeps local movement responsive and reconciles exactly.
- Block/revoke takes effect on active connections and private views remain isolated.
- Offline advance is identical whether a farm is entered by owner or permitted friend.
- Twenty-five simulated friends meet the M9 resource/latency budget.
