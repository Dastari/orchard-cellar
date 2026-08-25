# 25 — Stats, Vitals, and the Modifier Pipeline

Binding owner-directed spec (2026-08-25). Status: **design approved, not implemented**.
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
| Vigour | `10 × con` | 100 | `0.08 × con × 10` → 8.0 (empty→full ≈ 12.5 s) | `ui_cf_bar_fill_green` |

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
  | 'toolVigourCost' | 'swingSpeed' | 'checkBonus';           // reserved v1 targets

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
| `hoe` | 10 | 6 |
| `fishing_rod` | 6 | 6 |
| `sword` | 12 | 7 (350 ms) |
| `axe` | 15 | 8 (400 ms) |
| `pickaxe` | 20 | 10 (500 ms) |

- Baseline feel: an axe gets ~6 swings from a full bar (two trees), then ~2 s per
  swing regen-limited; a pickaxe ~5 swings. Whiff swings (no target in the cone)
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
- Reserved, not added now: public `player_vitals_public { identity, healthPct: u8 }`
  for remote health bars — a combat-era addition, one additive table away.
- New `SenderError` codes: `insufficient_vigour`, `swing_too_soon` (toast strings
  via the existing `showResult` map).

## 10. UI — the vitals cluster

Bottom-right of the 480×270 virtual buffer, drawn by a new `drawVitals()` in the
doc 23 UI pass, called from `OverworldUi.draw()` after `drawHotbar`:

- Three bars stacked, top→bottom **Health (red), Mana (blue), Vigour (green)**;
  each 60×10 (`ui_cf_bar_frame` nine-slice — its `[7,4,7,5]` insets set the 9 px
  height floor, so 10 px is the minimum honest height), 1 px gaps; cluster
  anchored `anchoredRect(root, {60, 32}, 'bottom_right')` with a 4 px margin.
  Fill = the `Slider.draw()` fraction-clip math over the segmented fill sprites.
  The bottom-right region is currently empty; 32 px tall fits the
  `fittedUiScale` `h/110` budget at every UI scale.
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

1. **Sim foundations** (pure, no schema): `stats.ts`, `modifiers.ts`,
   `effects.ts`, `checks.ts`, `creatures.ts`; constants in `balance.ts`; golden
   tests. Mergeable alone.
2. **Authority + Vigour + bars**: §9 schema, `harvestResource` gating, lazy
   regen, `ownStats` subscription, vitals cluster (health/mana render full).
   The user-visible payoff ships here.
3. **Effects + first potion**: `player_effect`, sweep + views, `well_rested`,
   `orchard_tea`, buff icon row.
4. **Creatures + checks**: `world_npc.health`, statlines, first two skill-check
   call sites.
5. **Combat era**: separate doc, separate approval.

## 14. Out of scope

Damage dealing and taking; hostile AI; XP and levelling; character sheet UI;
remote/overhead health bars; spells; death penalties beyond §11; authority-rate
changes; any base-attribute mutation.

## 15. Tests and acceptance

- **Unit (sim):** resolver golden numbers named `25§3` (layer order, pctAdd sums
  before pctMult multiplies, exclusive family strongest-wins, override, softcap,
  id-sorted determinism — same input set shuffled resolves identically); regen
  catch-up across large gaps with remainder carry equals step-by-step regen
  exactly; tool cost/interval goldens named `06§11`; `skillCheck` determinism
  (same seed parts → same roll) and distribution sanity; effect stack/refresh
  rules; clamp-on-max-drop behavior.
- **Reducer (world):** `harvestResource` happy path deducts exactly the table
  cost; `insufficient_vigour`, `swing_too_soon`, and auth-failure paths each
  tested per docs/15; effect expiry swept and view-filtered; `player_stats` row
  provisioned on first join.
- **Two-client:** client A cannot see B's `player_stats`/`player_effect` rows;
  A spamming `F` is rate-bound by Vigour + interval while B's view of the world
  stays consistent (no phantom resource damage).
- **Browser:** vitals cluster renders bottom-right at UI scales 1/2/3 without
  overlapping the hotbar or weather panel; cosmetic dip then authoritative
  settle on tool use; deny flash on empty Vigour; bars survive `fittedUiScale`
  downgrade on a short viewport.

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
