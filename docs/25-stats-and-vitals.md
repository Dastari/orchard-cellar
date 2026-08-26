# 25 — Stats, Vitals, and the Modifier Pipeline

Binding owner-directed spec (2026-08-25). Status: **Phases 1–4 implemented
(2026-08-26); Phase 5 remains a separate combat-approval gate**.
Builds on [20-survival-world.md](20-survival-world.md) (resources, hotbar, reducers),
[22-netcode.md](22-netcode.md) §6 (cosmetics predicted, state authoritative — the
standing pattern this doc inherits verbatim), [23-ui-system.md](23-ui-system.md)
(widgets, skin, bar assets), and [06-progression-economy.md](06-progression-economy.md)
(which remains the single source of truth for numbers — §16 Bookkeeping mirrors this
doc's tuning tables there). Where docs/03/06 say "Vigour", they mean the retired solo
farm scene's tend-charge meter (`EconomyState.vigour`); that code stays untouched.
The player resource defined here reuses the name deliberately — it is the same
diegetic idea (bodily energy for estate work) promoted to a first-class character
resource in the live overworld.

The goal: one **attribute → derived-stat → modifier** pipeline that every future
system (tools, combat, skill checks, skill trees, potions, equipment) plugs into as
data, not as new math. Think WoW's stat sheet: base values, flat bonuses, additive
percentages, multiplicative percentages, exclusive categories — resolved in a fixed
order by one pure function in `packages/sim`.

## 1. Attributes

The six D&D attributes, **hidden from the player for now** (no character sheet;
visible only on the F3 debug overlay):

| Attribute | Id | Governs (v1) | Governs (reserved) |
|---|---|---|---|
| Strength | `str` | max Health | melee tool power, carry rules |
| Dexterity | `dex` | — | swing speed, ranged, fishing checks |
| Constitution | `con` | max Vigour, Vigour regen | resist debuffs |
| Intelligence | `int` | max Mana | crafting quality checks |
| Wisdom | `wis` | Mana regen | perception/foraging checks |
| Charisma | `cha` | — | NPC/vendor checks |

- Every player's **base value is 10 in all six** (`BASE_ATTRIBUTE = 10`), stored
  range 1–30 (`u8`). Nothing in v1 changes base attributes; skill trees and
  levelling change them later. Items/buffs change *resolved* attributes via
  modifiers (§3), never the stored base.
- Health-from-STR and Vigour-from-CON is a **deliberate deviation from tabletop
  D&D** (where HP is CON): the owner wants STR to be the "body" stat and CON the
  "endurance/pacing" stat. Recorded in DECISIONS.md; do not "fix" it.
- Skill-check modifier uses the tabletop formula: `checkModifier(a) = floor((a − 10) / 2)`.
- Resource scaling uses the attribute directly (per-point, smoother than the half-step).

## 2. Derived vitals

Three vitals, all derived — **max values are never stored**, only current values:

| Vital | Formula (display units) | At baseline | Regen (per second, display units) | Bar fill |
|---|---|---|---|---|
| Health | `10 × str` | 100 | `HEALTH_REGEN_PER_SECOND = 0.2` (flat trickle) | `ui_cf_bar_fill_red` |
| Mana | `10 × int` | 100 | `0.1 × wis` → 1.0 | `ui_cf_bar_fill_blue` |
| Vigour | `10 × con` | 100 | `1.2 × con` → 12.0 (empty→full ≈ 8.3 s) | `ui_cf_bar_fill_green` |

- Current values are stored in **centi-units** (`u32`, display × 100 → 10 000 at
  baseline max), matching the basis-point discipline of `MAX_VIGOUR = 10_000`
  (docs/06 §3). All vital math is integer; fractional regen carries a per-vital
  remainder accumulator exactly like `economy.ts` vigour accrual — deterministic,
  no floats in state.
- If a resolved max drops below current (a +CON buff expiring), current clamps
  down; when max rises, current keeps its absolute value (WoW behavior).
- Nothing deals damage in v1 — health sits full until the combat era (§13). Mana
  has no spender in v1 — it ships so the bar, regen, and pipeline are proven
  before spells exist.

## 3. The modifier pipeline

One pure module, `packages/sim/src/modifiers.ts`. All percentages are **basis
points** (10 000 = +100%); all values integer.

```ts
export type StatTarget =
  | 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'            // attributes
  | 'maxHealth' | 'maxMana' | 'maxVigour'                     // derived
  | 'healthRegen' | 'manaRegen' | 'vigourRegen'
  | 'toolVigourCost' | 'swingSpeed'
  | 'sprintSpeed' | 'sprintVigourCost' | 'checkBonus';        // ability/reserved targets

export type ModifierLayer = 'flat' | 'pctAdd' | 'pctMult' | 'override';

export interface Modifier {
  readonly id: string;            // stable, for determinism-sorting and debugging
  readonly target: StatTarget;
  readonly layer: ModifierLayer;
  readonly value: number;         // flat: centi-units; pct layers: basis points
  readonly family?: string;       // exclusive family — within one, strongest wins
  readonly source: 'equipment' | 'effect' | 'skill' | 'environment';
}
```

**Resolution order per target** (the only order; every future system obeys it):

1. Within each exclusive `family`, keep only the modifier with the greatest
   absolute `value`; drop the rest. This is the standing "more-specific overrides,
   never stacks" precedent (DECISIONS.md sim/seasons; docs/06 §2 "the two featured
   bonuses never stack") generalized.
2. `value = base + Σ flat`
3. `value = floor(value × (10_000 + Σ pctAdd) / 10_000)` — all additive
   percentages sum first (WoW's "+X% categories add together").
4. For each `pctMult`, sorted by `id`: `value = floor(value × (10_000 + m) / 10_000)`
   — true multiplicative stacking, flooring after each step so resolution is
   order-deterministic.
5. If any `override` survives step 1, it replaces the result (highest wins; data
   lint warns when two overrides share a target outside one family).
6. Clamp to the target's declared bounds; targets flagged `softcap` apply
   `soften(cap, base, value − base)` (`balance.ts:168`) instead of a hard clamp.
   Regen targets are softcapped; attributes and maxima hard-clamp.

**Two passes, no cycles:** pass 1 resolves the six attributes; pass 2 resolves
derived targets from the *resolved* attributes plus any modifiers aimed directly
at derived targets. Modifiers never target other modifiers.

**Contribution sources**, all compiled to a flat `Modifier[]` before resolving:

- **Equipment** — `ITEM_DEFINITIONS` gains an optional `modifiers` field; the nine
  gear slots (`item-containers.ts`, docs/23 §5's deferred "equipment gameplay
  effects") become live by data alone.
- **Effects** — buff/debuff rows (§6), each `effectKind` mapping to a modifier
  list in `packages/sim/src/effects.ts`.
- **Skills** — docs/06 §6 skill-tree ranks compile to modifiers when M5 lands.
- **Environment** — pure functions of `(authorityTick, weatherMode, season)` in
  the `weather.ts` shape: stateless, e.g. a future "cold night −10% Vigour regen".

`resolveStats(baseAttributes, modifiers): ResolvedStats` lives in
`packages/sim/src/stats.ts`, is exported from the barrel, and is called by the
world module (authoritatively, lazily at spend/regen time) and by the client
(display only — never predicted into state, per docs/22 §6).

## 4. Vigour spend — tool pacing

Every tool use costs Vigour; Vigour regen is the rate limiter that `harvestResource`
currently lacks. Costs live in `balance.ts` + docs/06 mirror:

| Tool (`itemKind`) | Vigour cost (display units) | Min swing interval (authority ticks @ 20 Hz) |
|---|---|---|
| `watering_can` | 8 | 6 (300 ms) |
| `hoe` | 50 | 6 |
| `fishing_rod` | 6 | 6 |
| `bow` | 10 | 6 (300 ms) |
| `sword` | 12 | 7 (350 ms) |
| `axe` | 50 | 8 (400 ms) |
| `pickaxe` | 50 | 10 (500 ms) |
| `shovel` | 12 | 7 (350 ms) |
| `hammer` | 18 | 9 (450 ms) |

- Baseline feel: an axe, hoe, or pickaxe gets two full-cost uses from a full
  unmodified bar. Whiff swings (no target in the cone)
  cost **half, rounded up** — mashing at nothing is cheap but not free.
- Reducer flow in `harvestResource` (and every future tool reducer), after the
  existing auth/mount/tool checks: apply lazy regen (§5) → reject
  `swing_too_soon` if `authorityTick − lastSwingTick < interval` → reject
  `insufficient_vigour` if current < cost → deduct, write `lastSwingTick`,
  proceed. The min-interval check is the `canTendTree` pattern
  (`world-rules.ts:328`) and exists so latency spikes can't bank a burst of
  queued swings.
- `toolVigourCost` and `swingSpeed` are modifier targets from day one — a skill
  node "−10% axe Vigour cost" or a haste potion is data, no reducer change.
- Client on `F`: keep the standing split — predict the swing animation, SFX, and
  a **cosmetic** bar dip immediately; the own-row subscription confirms or snaps
  back. On `insufficient_vigour`, no reducer round-trip needed to feel right: the
  client already knows its displayed value, plays a deny flash on the bar
  (`ui_cf_selector_deny` corners) + soft SFX, and skips the call unless within a
  small grace margin (server remains the authority when they disagree).

### 4.1 Tool durability (owner amendment, 2026-08-25)

Durability is a second authoritative tool-pacing axis, stored on the individual
non-stackable tool and preserved through inventory, chest, overflow, drop, and
pickup moves. Only a successful world-changing use costs one durability; whiffs,
rejected reducers, and purely cosmetic swings cost none. Firing a valid arrow is a
successful Bow use. A zero-durability tool remains in its slot but rejects use with
`tool_broken`—it is never deleted.

| Tool | Maximum uses | Full repair material |
|---|---:|---|
| Axe | 200 | 1 Wood |
| Pickaxe | 250 | 1 Stone |
| Hoe | 180 | 1 Wood |
| Watering can | 160 | 1 Stone |
| Bow | 300 | 1 Wood |
| Shovel | 220 | 1 Stone |
| Hammer | 300 | 1 Stone |
| Fishing rod | 160 | 1 Wood |
| Sword | 250 | 1 Stone |

Pressing `R` repairs the selected damaged tool to full when the inventory contains
the listed renewable material. Loose branches and stones remain hand-gatherable, so
a player can never be durability-softlocked. Durability bars appear along the usable
bottom interior of every tool slot (hotbar, backpack/equipment, chest); green above
50%, gold from 21–50%, red at 20% or below, and an empty red bracket when broken.

### 4.2 Sprint — movement ability pacing

Hold either Shift key while moving on foot to request Sprint. The server remains
authoritative: an accepted sprint step uses **1,250 per-mille / 125%** walking
speed and spends Vigour; when the next step is unaffordable it executes at normal
walking speed instead. Mount movement does not use or charge the rider's Sprint.

- Baseline drain is **1,000 centi / 10 displayed Vigour per second**. Cost for a
  confirmed movement run is `ceil(rate × sprintSteps / 60)`, so one full second
  costs exactly 1,000 centi without a persisted floating-point remainder. Blocked
  steps do not spend Vigour.
- Constitution is the primary ability attribute. Its pre-modifier drain is
  `ceil(1,000 × 10 / resolved CON)`: 10 CON costs 10/s, 20 CON costs 5/s, and
  5 CON costs 20/s. CON already also governs maximum Vigour.
- `sprintSpeed` and `sprintVigourCost` pass through the ordinary modifier layers.
  The `sprint` entry in `ABILITY_DEFINITIONS` tags movement, Vigour, CON, and all
  four modifier producers (`equipment`, `effect`, `skill`, `environment`). Thus
  positive effects/buffs, negative effects/debuffs, equipment, and future skills
  use data rather than special cases in movement code.
- Vigour regeneration is suppressed while an online, unmounted player is actively
  requesting Sprint. Starting Sprint first settles lazy regeneration through the
  current authority tick, so reconnect/offline recovery is not lost.
- Sprint intent is stored on each compressed movement-run segment. Shift changes
  therefore preserve the walking/sprinting classification of already-predicted
  steps, and reconciliation replays each step with its recorded speed.

## 5. Regen — lazy, not per-tick

No per-tick regen writes. Vitals regenerate by **lazy catch-up from tick delta**
(the `advanceEconomy(from, to)` pattern), applied whenever a vital is read or
spent, and by a coarse sweep in `stepWorld` (every `REGEN_SWEEP_TICKS = 10`, 0.5 s,
online players only) so bars visibly fill while idle.

- State per player: `regenTick: u64` + one `u32` remainder per vital (§9). Catch-up
  computes `elapsed × ratePerTick` in integer micro-units, carries the remainder,
  clamps to resolved max, then sets `regenTick = authorityTick`.
- Rows are written **only when a centi-value actually changes**; three full bars
  cost zero writes. This sidesteps the `stepWorld` zero-players early-return
  (`world/index.ts:2312`) by construction — an offline gap is just a large
  `elapsed` at next read.
- Offline regen is deliberately generous: log off tired, come back full. (The
  legacy farm's `chargeVigour: false` offline rule applied to tend charges, not
  to this resource; not carried over.)

## 6. Effects — buffs, debuffs, potions

A new public-shape private table (own-view now, public later for visible auras):

```ts
player_effect: {
  id: u64 auto_inc PK,
  identity: Identity (btree),
  effectKind: string,          // key into EFFECT_DEFINITIONS
  stacks: u8,
  appliedTick: u64,
  expiresTick: u64,
}
```

- Definitions in `packages/sim/src/effects.ts`:
  `EFFECT_DEFINITIONS[kind] = { name, maxStacks, durationTicks, modifiers, family? }`.
  Reapplying refreshes `expiresTick` and bumps `stacks` up to `maxStacks`;
  modifiers scale linearly with stacks unless the definition says otherwise.
- Expiry is belt-and-braces like `world_speech`: swept in `stepWorld` **and**
  filtered by `expiresTick > authorityTick` at every read/view.
- v1 roster (numbers in docs/06 mirror):
  - `well_rested` — +25% `vigourRegen` (`pctAdd`), 2 h real (144 000 ticks); granted
    by sleeping. Implements the docs/03 §"well rested" design at last.
  - `winded` — −50% `vigourRegen`, 90 s; applied on knockout (§11).
  - `orchard_tea` — +2 `con` flat, 5 min real; first consumable, crafted from
    existing orchard goods. Proves the potion path: consume item → insert effect
    row → pipeline does the rest.

## 7. Skill checks

`packages/sim/src/checks.ts`:

- `skillCheck(seedParts, attribute, dc, mods): { roll, total, success }` where
  `roll = 1 + hash(worldSeed, identity, authorityTick, contextTag) % 20` — the
  deterministic stateless-hash pattern of `npc.ts:hashDecision`. No stored RNG,
  no `Math.random` (lint-banned in sim), replayable in tests.
- `total = roll + checkModifier(attribute) + Σ checkBonus modifiers`; DC ladder
  `trivial 5 / easy 10 / medium 15 / hard 20`. No crit rules v1.
- First wired use cases (phase 4): fishing catch quality (`dex`), forage find
  (`wis`). Tool *damage* does not roll checks — hits stay deterministic.

## 8. Creature statlines

Monsters and NPCs get the **same statline shape as players** — one pipeline, no
parallel math. Archetypes are data in `packages/sim/src/creatures.ts`:

```ts
CREATURE_DEFINITIONS[kind] = {
  name, level,
  attributes: { str, dex, con, int, wis, cha },   // maxHealth etc. derive identically
  innateModifiers: Modifier[],                     // e.g. thick hide: +20% maxHealth
  hostile: boolean,                                // v1: false for everything
}
```

- Additive schema: `world_npc` gains `health: u16` (current; max derived from
  kind). The horse gets a statline and a full health bar it will never lose.
- Hostile AI, aggro, and damage are the combat era (docs/22 §9 deferred scope,
  future doc 26+). This doc only guarantees that when combat arrives, every
  actor already has stats, health, and a modifier pipeline — combat adds verbs,
  not state shape.

## 9. Schema additions (additive; republish module + regenerate bindings first)

Per docs/08 schema evolution — no column renames, no repurposing:

- **New private table `player_stats`** (own view `ownStats`): `identity` PK;
  `str,dex,con,int,wis,cha: u8` (init 10); `healthCenti, manaCenti, vigourCenti: u32`
  (init to baseline max); `healthRemainder, manaRemainder, vigourRemainder: u32`;
  `regenTick: u64`; `lastSwingTick: u64`. Row created on first join alongside
  `player_survival`. Kept separate from `player_survival` (cleaner than widening
  it; that table already carries migration-only columns).
- **New table `player_effect`** (§6) + own view `ownEffects`, btree on `identity`.
- **`world_npc` + `health: u16`**.
- **Durable stack metadata:** trailing defaulted `durability: u16` on
  `inventory_slot`, `inventory_overflow`, `world_chest_slot`, and `world_item`.
  Legacy rows default to zero, then `inventory_migration` performs one per-player
  full-durability backfill; its marker is what preserves a genuinely broken tool.
- **`stats_migration`** marks the one-time legacy NPC-health backfill. Never infer
  migrations forever from `health === 0`, because zero becomes valid combat state.
- Reserved: public `player_vitals_public { identity, healthPct: u8 }` for remote
  health bars. It remains behind the combat/world-migration gate; exact maxima,
  attributes, Mana, Vigour, effects, equipment, and progression stay private.
- New `SenderError` codes: `insufficient_vigour`, `swing_too_soon` (toast strings
  via the existing `showResult` map), plus `tool_broken`, `tool_not_damaged`, and
  `repair_material_missing` for durability.

## 10. UI — the vitals cluster

Immediately above the hotbar, drawn by `OverworldUi.draw()` after `drawHotbar`:

- The own-character composite is 72×29 (1.5× authored scale), aligned to the
  hotbar's left edge. Three bars stack top→bottom: **Health (red), Mana (blue),
  Vigour (green)**. The licensed composite supplies only portrait well and empty
  tracks; each coloured fill width is derived every draw from current/max.
- Clicking another visible player or NPC selects it. A mirrored 72×29 target
  frame aligns to the hotbar's right edge, with its portrait on the outside.
  Players use their modular head; non-player NPCs fit their entire authored model
  inside the portrait well. NPC health uses authoritative `world_npc.health`.
  Until the additive public percentage migration lands with combat, player targets
  show the current full-health baseline and leave both private-resource tracks empty.
- Fill values render from the **displayed** (subscription + cosmetic prediction)
  vitals; numbers `current/max` appear in the existing tooltip layer on hover
  only — bars stay clean.
- Insufficient-Vigour feedback: deny-bracket flash on the Vigour bar + soft SFX
  (§4). No screen shake, no red vignette — docs/13 feedback rules apply.
- Buff icons: a right-aligned row of 12×12 `icon_cf_*` icons directly above the
  cluster, newest leftmost, tooltip = name + remaining time; icon blinks in its
  last 10% of duration. (Phase 3; needs a handful of new icon extracts.)
- Attributes stay hidden: no character sheet window in this doc's scope. The F3
  overlay gains a resolved-stats block (base → resolved per attribute, active
  modifier list with sources) — the debugging surface for the whole pipeline.

## 11. Knockout, not death

docs/06 §10's anti-frustration invariant ("no fail states; nothing ever decreases
below a floor except by prestige choice") is **amended, not discarded** (DECISIONS
entry required): health can reach 0, but the consequence is a knockout, never a
fail state — wake at your spawn slot with 25% health and the `winded` debuff.
**No item loss, no currency loss, no durability, ever.** This is the cozy-game
floor all future combat tuning must respect.

## 12. Future hooks (designed-for, not built)

- **Skill trees** — docs/06 §6 ranks compile to `source: 'skill'` modifiers;
  respec = recompile. No new resolution rules.
- **Equipment stats** — `modifiers` on item definitions + the already-tagged gear
  slots; the paper-doll window (docs/23) gets a stats readout later.
- **Spells/abilities** — mana spenders using the §4 reducer flow with `manaCost`;
  cast animations are `AVATAR_ACTIONS` registry entries (docs/22 §6.1 — zero
  netcode change).
- **Levelling** — base-attribute growth writes `player_stats` attribute columns;
  everything downstream re-derives.
- **Combat** — future doc: damage formulas from statlines, hostile AI on the
  `stepWanderingNpc` template, `player_vitals_public`, hit-flash cosmetics from
  status fields, authority-rate revisit.

## 13. Phasing

1. **Sim foundations** ✅ (2026-08-25; pure, no schema): `stats.ts`, `modifiers.ts`,
   `effects.ts`, `checks.ts`, `creatures.ts`; constants in `balance.ts`; golden
   tests. Mergeable alone.
2. **Authority + Vigour + durability + bars** ✅ (2026-08-26): §9 schema, `harvestResource`
   gating, lazy regen, per-tool durability persistence/repair, `ownStats`
   subscription, vitals cluster and slot durability bars (health/mana render full).
   The user-visible payoff ships here.
3. **Effects + first potion** ✅ (2026-08-26): `player_effect`, sweep + views, `well_rested`,
   `orchard_tea`, buff icon row.
4. **Creatures + checks** ✅ (2026-08-26): `world_npc.health`, statlines, live
   Wisdom forage check, and the deterministic Dexterity fishing-quality hook.
   Fishing rewards remain intentionally dormant until the already-deferred fishing
   verb ships; fish-shadow decoration is not silently promoted into gameplay here.
5. **Combat era** ☐: separate doc, separate approval.

Phases 1–4 implementation note: the pure resolver now feeds authoritative private
rows, lazy online/offline regeneration, effect and equipped-item modifiers, tool
spend gates, and creature health. The client subscribes only to caller-owned rows,
shows the three vitals plus licensed effect icons, predicts only its Vigour display,
and renders authoritative durability in every slot surface. Orchard Tea proves the
consume→effect→pipeline path. `well_rested` and `winded` definitions are live, while
their sleeping/knockout grant verbs remain correctly gated with those out-of-scope
systems (§11/§14).

## 14. Out of scope

Damage dealing and taking; hostile AI; XP and levelling; character sheet UI;
overhead health bars; spells; death penalties beyond §11; authority-rate
changes; any base-attribute mutation.

## 15. Tests and acceptance

- **Unit (sim):** resolver golden numbers named `25§3` (layer order, pctAdd sums
  before pctMult multiplies, exclusive family strongest-wins, override, softcap,
  id-sorted determinism — same input set shuffled resolves identically); regen
  catch-up across large gaps with remainder carry equals step-by-step regen
  exactly; tool cost/interval goldens named `06§11`; `skillCheck` determinism
  (same seed parts → same roll) and distribution sanity; effect stack/refresh
  rules; clamp-on-max-drop behavior; durability initialization, wear, break,
  repair, and metadata-preserving inventory moves; Sprint's 125% movement,
  cumulative cost, CON derivation, modifier sources, and run-segment transitions.
- **Reducer (world):** `harvestResource` happy path deducts exactly the table
  cost; `insufficient_vigour`, `swing_too_soon`, and auth-failure paths each
  tested per docs/15; effect expiry swept and view-filtered; `player_stats` row
  provisioned on first join; successful uses wear exactly one durability while
  whiffs/rejections do not; broken-tool and repair-material paths are atomic.
- **Two-client:** client A cannot see B's `player_stats`/`player_effect` rows;
  A spamming `F` is rate-bound by Vigour + interval while B's view of the world
  stays consistent (no phantom resource damage).
- **Browser:** own/target vitals align to the hotbar edges at UI scales 1/2/3 without
  overlapping the hotbar or weather panel; cosmetic dip then authoritative
  settle on tool use; deny flash on empty Vigour; bars survive `fittedUiScale`
  downgrade on a short viewport; durability bars remain inside every beveled slot
  and change green→gold→red without obscuring stack counts or selectors.

Implementation verification (2026-08-26): `npm run check` passes the world build,
all workspace typechecks, lint, 74 test files / 454 tests with coverage thresholds,
and validation of 471 art assets. The populated local database accepted the schema
additions and the later `stats_migration` marker in place; neither publish requested
data deletion. A browser render using the production UI/art loaders exercised full,
half, low, and broken tool durability alongside all three vitals and the three effect
icons. Scale 1/2/3 geometry and bevel containment are covered by the UI acceptance
tests. The existing isolated two-client OIDC harness now also asserts that `ownStats`
contains exactly the caller and that `ownEffects` never contains another identity;
its identity, reconnect, private-read, and mutation-isolation baseline is recorded in
[24-self-hosted-oidc.md](24-self-hosted-oidc.md) §10.

Target-frame follow-up (2026-08-26): pointer hit-testing now selects visible remote
players and NPCs by their rendered, foot-anchored bounds, with closest-centre/frontmost
resolution for overlaps and gold world-space selection corners. The own 1.5× frame is
hotbar-left; its mirrored target peer is hotbar-right with the portrait outside. A
browser-only composition render exercised 72.5/35/61% own fills and a 65% NPC health
fill, then verified an opaque-bounds-cropped whole horse portrait. Focused targeting,
layout, click-capture, mirrored hit-area, and fill-fraction tests pass. The full gate
passes 81 files/496 tests, production client build, 488-asset validation, typechecks,
lint, and world build. The populated local world correctly rejected an unrelated
rollback of another in-progress agent's `space_id`/mine schema; no shared data was
deleted. The new targeting path therefore has no server-schema dependency, and the
temporary isolated validation database was removed after use.

Sprint follow-up (2026-08-26): Shift intent, queued-run classification, shared
125%-speed prediction, server-side Vigour spend/regeneration suppression, CON
efficiency, ability tags, and modifier targets are implemented end to end. The
append-only `player_input.sprinting` migration published over the populated world
with no deletion after an offline archive; 102 files / 610 tests and coverage,
all workspace typechecks, lint, both production builds, and 528-asset validation
pass. Both frontend and world services returned healthy after publish.

## 16. Bookkeeping

- **docs/06**: new `§11 Stats, vitals, and effects` mirroring every number here
  (attribute baselines, vital formulas, regen rates, tool cost table, effect
  roster); this doc defers to 06 the moment they diverge.
- **docs/00**: add rows 21–25 to the doc map (21–24 are currently missing too).
- **docs/14**: add the phases of §13 as a milestone with Done-when criteria.
- **DECISIONS.md**, on adoption: (1) health←STR / vigour←CON mapping is a
  deliberate D&D deviation; (2) knockout amendment to the docs/06 §10 invariant;
  (3) "Vigour" name reuse from the retired farm scene.
- On phase-2 landing: append the docs/22 §6 note that the cosmetic-dip pattern
  extends "cosmetics predicted" to own-resource bar display.
