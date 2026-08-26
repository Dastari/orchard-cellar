# 36 — Character Screen, Skill Trees, XP, and Quests

Binding owner-directed spec (2026-08-26). Status: **design approved, not
implemented**. Builds on [25-stats-and-vitals.md](25-stats-and-vitals.md)
(the modifier pipeline's reserved `'skill'` source finally gets its producer;
the "attributes hidden" rule is superseded — the character screen is where
they become visible), [31-npc-dialogue-and-commerce.md](31-npc-dialogue-and-commerce.md)
(quest givers speak through the dialogue registry; gold sinks),
[33-player-statistics.md](33-player-statistics.md) (statistics are the quest
engine's sensors — its reserved `quest_kind` subject was for this),
[32-combat.md](32-combat.md) (its "no XP" decision is superseded — kills feed
Combat XP), [35-homesteads-and-farming.md](35-homesteads-and-farming.md)
(farm actions feed Farming XP; the skill/gold layering rule), and
[23-ui-system.md](23-ui-system.md) (widgets; this doc adds the pan/zoom
canvas widget). docs/06 §§5–6's knowledge/terroir tree remains the *retired
solo scene's* design; the live game's progression is this doc. All numbers
mirror into docs/06.

## 1. The progression philosophy (binding)

**Almost every quality-of-life capability is earned.** Sprinting, riding a
horse, horse-jumping, extra backpack rows, auto-pickup, barrel curing,
sprinkler engineering — each is a node someone chose, remembered unlocking,
and feels ownership of. The base character walks, swings starter tools,
farms plots, and talks; everything smoother than that is progression. Two
guard-rails keep it cozy rather than hostile:

1. **Gates are on *convenience and breadth*, never on participation.** You
   can always farm, gather, craft the hand tier, visit friends, and complete
   quests with zero points spent.
2. **The doc 35 layering rule generalizes: skills unlock the *option*, gold
   buys the *thing*.** Sprinkler Engineering (skill) lets your homestead buy
   sprinklers (gold). Neither gate is ever doubled within one system.

## 2. The character screen

One window, three tabs, deep-linked keys: **`P`** Character, **`K`** Skills,
**`J`** Quests (`C` stays crafting). docs/23 widget composition; full-screen
parchment window at every UI scale.

### 2.1 Character tab — paper doll + customization + stats

- **Paper doll** center: the live avatar at 4×, rotatable through the four
  facings, wearing current appearance + equipment (the docs/23 gear slots
  flank it — this tab absorbs the equipment panel).
- **Customization**: cycle buttons (◀ ▶) per axis — hair style (6), hair
  color (5), shirt style + color, pants style + color, shoes color, and
  **skin tone** (new axis: the palette's `W` skin marker group drives
  authored tone swaps through the existing marker/remap pipeline —
  art-verify the avatar layers use `W` consistently; if any bake skin
  pixels, fixing them is part of phase 1). Changes preview live on the doll
  and commit via one `setAppearance` reducer (server-validated kinds, free,
  any time — appearance is identity, not progression; explicitly exempt
  from §1).
- **Gender** is presentation, not a field: no mechanical gender exists or is
  stored; the pack ships one body silhouette, so presentation comes from
  hair/outfit/skin axes. A second body-shape variant set is a named later
  hook (original art derivative work, license permits).
- **Stats block**: the six doc 25 attributes shown as `base → resolved`
  with a hover breakdown by modifier source (equipment/effect/skill/
  environment — the pipeline already tags them); vitals maxima; active
  effects row. F3 remains the raw debug view.

### 2.2 Skills tab — the tree canvas

A new **pan/zoom canvas widget** (docs/23 addition): drag to pan, wheel to
zoom (clamped ~0.5×–2×, integer-snapped rendering per the pixel charter),
one tree visible at a time with a Combat / Explorer / Farming selector,
"center on root" button, and a header showing track level, XP bar
(`ui_cf_bar_fill_gold`), and unspent points. Nodes draw as icon medallions
with the selector-bracket states; edges as pixel lines lit when owned.

### 2.3 Quests tab

Active and completed quest list; selected quest shows steps with live
progress (`3/10 copper mined`), giver, and rewards. A small optional HUD
tracker (top-right under the weather panel) shows the pinned quest's
current step.

## 3. XP — three tracks

Independent XP pools; each level grants **1 point spendable only in that
track's tree** (RuneScape-style track identity, WoW-style spending):

| Track | XP sources (all server-side, in the same transaction as the doc 33 statistic they accompany) |
|---|---|
| **Combat** | hostile kills (XP = creature statline value; doc 32 danger zones only), damage dealt milestones |
| **Explorer** | first-visit region discovery (per 4×4-chunk region per character), first use of each portal/space, distance milestones (the statistics system already counts distance), biome first-visits (doc 30) |
| **Farming** | harvests (per crop), watering, tending trees, barrels sealed/cured, fiber gathered |

- Curve: `xpForLevel(n) = 100 × n^1.7` (integer, docs/06 mirror), soft cap
  level 50/track in v1. Early levels land in minutes — the incremental hook.
- XP is **never client-submitted** and never granted by purchases — actions
  only (docs/22/33 discipline).
- **Schema**: `player_skill_track { identity, track, xp: u64, spentPoints:
  u16 }`, `player_skill_node { identity, nodeId, rank: u8 }` — private,
  own-views. Level is derived from XP, never stored.

## 4. The trees — incremental, radial, partly hidden

Node definitions are data in `packages/sim/src/skill-trees.ts`:

```ts
interface SkillNodeDefinition {
  readonly id: string;
  readonly track: 'combat' | 'explorer' | 'farming';
  readonly position: readonly [x: number, y: number];   // tree-space, radial from root
  readonly connects: readonly string[];                 // adjacency edges
  readonly maxRank: number;                             // 1 = keystone, >1 = ranked minor
  readonly pointCost: number;                           // per rank
  readonly requiresLevel?: number;                      // track level gate
  readonly effects?: readonly Modifier[];               // doc 25 'skill' source, per rank
  readonly unlocks?: readonly VerbGate[];               // capability keys reducers check
  readonly hidden?: HiddenPrerequisite;                 // §4.2
}
```

- **Topology**: each tree has one auto-owned **central root**; nodes buy
  only when connected to an owned node (adjacency) and the track level
  gate is met. The tree radiates outward — early ring = cheap minors,
  middle rings = the QoL keystones, outer rings = specialization,
  capstones at the rim.
- **Effects** compile into the doc 25 pipeline (`source: 'skill'`) at
  resolve time — stat nodes are pure data. **Verb gates** are capability
  keys (`'ride_horse'`, `'barrel_curing'`, …) checked by a shared
  `requireSkill(ctx, key)` helper in the relevant reducers
  (`skill_required` SenderError; client shows the lock reason).

### 4.1 Starter content (v1 targets; full node tables live in docs/06)

- **Explorer** (the QoL heartland): Trailblazer ranks (+2% move speed),
  **Sprint** keystone (hold-to-run, Vigour drain), **Horsemanship**
  keystone (**riding is a skill** — `interactHorse` gains the gate),
  **Steeplechase** (horse jump — currently free, now gated), Pathfinder
  (+speed on paths), Deep Pockets ranks (+4 backpack slots each — the
  backpack container check reads granted rows), Magnet Hands ranks
  (auto-pickup radius), Night Eyes (+1 personal light band, doc 27),
  Cartographer (reserved: unlocks the future minimap the day one exists).
- **Combat**: STR/DEX/CON minors; Vigour Economy ranks (−tool/weapon
  Vigour cost %); keystones: Shield Discipline (unlocks off-hand shield
  use — the dormant `gear.off_hand` tag finally gets its consumer),
  Power Swing (axe/pickaxe damage vs hostiles), Steady Draw (bow damage/
  speed ranks; weapons stay *usable* by anyone per §1 — proficiency makes
  them good).
- **Farming**: Green Thumb ranks (+yield %), Tender Hand ranks (watering
  effect duration); keystones: **Barreling** (unlocks the doc 35 curing
  verb), **Sprinkler Engineering** / **Greenhouse Charter** (unlock those
  homestead purchases), Grafting (fruit-tree improvement hook),
  Beekeeping (hive interaction hook).

### 4.2 Hidden nodes

Three visibility states drive the "there's more here" itch: **invisible**
(prerequisite unmet, not rendered at all — the tree visibly has empty space
where edges run off), **silhouette** (`???` medallion: adjacent node owned
but a hidden prerequisite unmet — tooltip shows a riddle-hint), **revealed**.
Hidden prerequisites are data: a doc 33 statistic threshold (`break 500
rocks` reveals a mining specialization), a quest completion (§5 — quests
reveal nodes as rewards), or a discovery event. Reveal state is derivable
(statistics + quest rows), so it needs **no extra storage**.

### 4.3 Respec and migration

Respec costs gold (doc 31 sink, `repeatCost`-laddered per track), refunds
all points, relocks verbs instantly. Migration: riding/jumping are free
today — at launch every **existing** character receives a one-time Explorer
XP grant sufficient to buy Horsemanship (grandfathering without a free
node; new characters earn it, which is the point). Recorded in DECISIONS.

## 5. Quests

Authority-backed, data-defined, sensed through statistics:

- **Definitions** in `packages/sim/src/quests.ts`: id, giver (an NPC
  dialogue id — offers/turn-ins are dialogue nodes per doc 31, no new
  conversation UI), ordered steps, rewards. **Objective types**:
  `statistic` (kind + subject + count — progress is the delta between the
  live doc 33 counter and a baseline snapshotted at accept; the statistics
  registry becomes the quest engine's sensor array, zero new
  instrumentation per quest), `talk_to`, `reach` (region/portal),
  `deliver` (items consumed at turn-in).
- **Schema**: `player_quest { identity, questId, state:
  offered|active|complete|turned_in, acceptedTick, baselines: per-objective
  u64 }` — private, own-view. Repeatables carry a cooldown tick.
- **Rewards**: track-tagged XP, gold, items, and **skill-node reveals**
  (§4.2) — quests are how the trees breathe. No client-submitted progress
  anywhere; turn-in re-derives every objective server-side.
- **v1 chains**: *Letters from the Estate* (tutorial arc teaching chop →
  craft → plant → sell → first skill point, gated to appear one step at a
  time), *Marlow's Ledger* (commerce intro + first Explorer reveals), and
  *The Old Shaft* (leads to the doc 26 mine entrance when mines land —
  authored now, activated then). Dailies/board quests are a later hook.
- Completing quests is itself a doc 33 statistic (`quest_kind` subject —
  already reserved).

## 6. Scalability & netcode conformance

All progression tables are per-identity, own-view private, and touched only
inside the transactions of the actions that change them — **zero tick-loop
work** (doc 34 law). Quest progress is derived from existing statistic rows
(no per-quest counters to maintain). The tree canvas is pure client render;
node purchase/respec/accept/turn-in are inputs-not-values reducers with the
usual happy + auth-failure test pairs.

## 7. Phasing

1. **Character tab**: window + tabs + paper doll + customization cycling
   (incl. the skin-tone `W`-marker audit) + resolved-stats block.
   Ships alone, immediately visible.
2. **XP + tracks**: pools, curve, award sites wired into existing reducers
   alongside their statistics; header UI on the Skills tab.
3. **Trees**: pan/zoom canvas widget, node data for the §4.1 starter set,
   purchase/respec reducers, verb gates live (riding/jump migration grant
   ships here), modifier compilation.
4. **Hidden nodes + polish**: visibility states, statistic-threshold
   reveals.
5. **Quests**: engine + tables + dialogue integration + log tab + tracker;
   the tutorial chain.
6. **Later hooks**: dailies/quest board; capstone abilities; body-shape
   variants; Cartographer-activates-minimap; prestige interplay with the
   docs/04–06 Vintage heritage.

## 8. Out of scope

Achievements UI (doc 33 milestones remain backend-only); leaderboards;
ability/spell actives (nodes are passives + verb unlocks in v1 — actives
arrive with the mana era); PvP anything; account-wide progression; quest
voice/portraits.

## 9. Tests and acceptance

- **Unit (sim)**: XP curve goldens (docs/06-named); node graph integrity
  lint (edges bidirectional, no orphan nodes, costs positive, every verb
  gate consumed by a reducer); adjacency/level purchase validation; hidden
  reveal derivation; modifier compilation per rank; quest objective delta
  math incl. baseline snapshots and saturation; appearance kind validation.
- **Reducer**: purchase/respec (refund exact, verbs relock); every gated
  verb rejects without its node (`skill_required`) and works with it;
  XP awarded only in successful transactions; accept/turn-in with
  server-side re-derivation; deliver consumes exactly; migration grant
  idempotence; auth-failure per reducer.
- **Two-client**: appearance change propagates to the other client's view
  of the avatar mid-session; a gated verb (riding) works for the skilled
  player and rejects the unskilled one standing beside them.
- **Browser**: full flow — customize → earn farming XP → level toast →
  open tree → pan/zoom → buy Green Thumb → see yield change → accept
  tutorial quest → complete a statistic objective by playing → turn in →
  hidden node reveals. Tree canvas usable at all UI scales.

## 10. Bookkeeping

- **docs/06**: new "Character progression" section — XP curve, full node
  tables per tree, respec ladder, quest rewards; plus a supersession note
  on §§5–6 (legacy tree = retired scene only).
- **docs/25**: attributes-hidden rule superseded (character screen);
  `'skill'` source now produced. **docs/32**: no-XP decision superseded.
  **docs/35**: §6 upgrade table gains the skill-unlock column (layering
  rule). **docs/31**: dialogue registry note for quest nodes. **docs/13**:
  new keys P/K/J. **docs/00** map row; **docs/14** milestones.
- **DECISIONS.md** on adoption: (1) QoL-as-progression is the binding
  philosophy with the participation guard-rail and the skills-unlock/
  gold-buys layering rule; (2) three independent XP tracks earned by
  actions only — supersedes docs/32's no-XP rule for danger-zone kills;
  (3) riding and horse-jumping become Explorer skills, with a one-time
  grandfather XP grant to existing characters; (4) quest objectives are
  sensed through the docs/33 statistics registry with accept-time
  baselines — no per-quest instrumentation; (5) appearance changes are
  free and exempt from progression gating; no mechanical gender field
  exists — presentation comes from the customization axes.
